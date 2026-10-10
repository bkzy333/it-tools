// Cloudflare Pages Functions：图片翻译（腾讯云 TMT ImageTranslate）+ 多层防护。
//
// 防护链路：防套壳 → 体积护栏(解码后 ≤4MB) → 缓存命中(优先前端规范哈希) → 预算闸(读)
//   → IP 软限流(采样兜底，仅预算偏紧时启用) → miss 才调 ImageTranslate + 存结果(R2 优先/KV 兜底) + 累加用量。
//   真正的硬限速交给 Cloudflare WAF Rate Limiting Rule（见 _translate-common.ts 顶部说明），零 KV 消耗。
//
// 腾讯云图片翻译仅支持「中文 ↔ 英文」互译，前端已锁死，这里二次校验。
// 图片是短板：每月仅 1 万次免费（文本是 500 万字符），所以限流严格得多。

import { callTmt } from './_tmt';
import {
  addUsage,
  budgetState,
  base64DecodedSize,
  corsResponse,
  getImageCache,
  imageCacheKey,
  isOriginAllowed,
  json,
  putImageCache,
  rateLimited,
  RATE_SAMPLE,
  type TranslateEnv,
} from './_translate-common';

export async function onRequestOptions(): Promise<Response> {
  return corsResponse();
}

export async function onRequestPost(context: { request: Request; env: TranslateEnv }): Promise<Response> {
  if (!isOriginAllowed(context.request)) {
    return new Response('Forbidden', { status: 403 });
  }
  const kv = context.env?.TOOLS_USAGE;
  const r2 = context.env?.TRANSLATE_R2;

  let body: { image?: unknown; source?: unknown; target?: unknown };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return json({ err: '请求体不是合法 JSON' }, 400);
  }

  const image = typeof body.image === 'string' ? body.image : '';
  if (!image) {
    return json({ err: '图片数据为空' }, 400);
  }
  // 体积护栏：用「解码后真实字节数」判断（base64 比原图膨胀约 1.33 倍）。
  // 前端应已压缩到 ≤3MB(base64，解码约 2.25MB)，这里留到 4MB 解码值给足余量，也给直连 API 的客户端设上限。
  if (base64DecodedSize(image) > 4 * 1024 * 1024) {
    return json({ err: '图片过大（解码后超过 4MB），请压缩后再试' }, 413);
  }

  const source = typeof body.source === 'string' && body.source ? body.source : 'zh';
  const target = typeof body.target === 'string' && body.target ? body.target : 'en';
  if (!((source === 'zh' && target === 'en') || (source === 'en' && target === 'zh'))) {
    return json({ err: '图片翻译仅支持「中文 ↔ 英文」互译' }, 400);
  }

  // ① 缓存命中：对收到的 base64 整体哈希——前端已统一缩放到 1920 再压缩，大图的不同分辨率版本会命中同一 key。
  const ik = await imageCacheKey(image);
  const hit = await getImageCache(kv, r2, ik);
  if (hit) {
    try {
      return json({ ...JSON.parse(hit), hitCache: true });
    } catch {
      /* 缓存损坏则重算 */
    }
  }

  // ② 预算闸（读 KV，免费）：先读，决定后面要不要启用 KV 软限流。
  const bs = await budgetState(kv, 'img');
  if (bs.level === 'stop') {
    return json({ err: '本月免费额度已用完，将于下月 1 日恢复' }, 503);
  }

  // ③ IP 软限流（次级兜底，平时不写 KV）：仅预算偏紧(≥warn)时按 RATE_SAMPLE 概率采样写；
  //    图片本身额度极紧（1 万次/月），更依赖 Cloudflare WAF 硬限速。限流更严：每小时 5、每天 20。
  let rl = { limited: false, count: 0 };
  if (kv && (bs.level === 'warn' || bs.level === 'limit') && Math.random() < 1 / RATE_SAMPLE) {
    rl = await rateLimited(kv, context.request, 'img');
  }
  if (rl.limited) {
    return json({ err: '图片翻译次数已达上限（每 IP 每日 20 次、每小时 5 次），请明日再试', challenge: true }, 429);
  }
  if (bs.level === 'limit') {
    return json({ err: '当前用量偏高，已临时限速，请稍后再试' }, 429);
  }

  try {
    const data = await callTmt(
      context.env,
      'ImageTranslate',
      {
        SessionUuid: crypto.randomUUID(),
        Scene: 'doc',
        Data: image,
        Source: source,
        Target: target,
        ProjectId: 0,
      },
      'ap-guangzhou',
      30_000,
    );
    const resp = (data.Response ?? {}) as {
      Error?: { Code: string; Message: string };
      ImageRecord?: { Value?: unknown[] };
      Source?: string;
      Target?: string;
    };
    if (resp.Error) {
      return json({ err: `${resp.Error.Code} ${resp.Error.Message}` }, 502);
    }
    const records = Array.isArray(resp.ImageRecord?.Value) ? resp.ImageRecord!.Value : [];
    const payload = JSON.stringify({ records, source: resp.Source, target: resp.Target });
    await putImageCache(kv, r2, ik, payload);
    await addUsage(kv, context.env, 'img', 1);
    return json({ records, source: resp.Source, target: resp.Target, hitCache: false, err: '' });
  } catch (e) {
    return json({ err: '代理异常：' + String((e as Error)?.message ?? e) }, 502);
  }
}
