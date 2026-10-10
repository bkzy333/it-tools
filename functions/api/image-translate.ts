// Cloudflare Pages Functions：图片翻译（腾讯云 TMT ImageTranslate）+ 多层防护。
//
// 防护链路：防套壳 → 体积护栏 → 缓存命中(先 hash 再决定是否调 OCR) → IP 软限流(每日 20/小时 5)
//   → 全局预算闸 → miss 才调 ImageTranslate + 存结果(R2 优先/KV 兜底) + 累加用量。
//
// 腾讯云图片翻译仅支持「中文 ↔ 英文」互译，前端已锁死，这里二次校验。
// 图片是短板：每月仅 1 万次免费（文本是 500 万字符），所以限流严格得多。

import { callTmt } from './_tmt';
import {
  addUsage,
  budgetState,
  corsResponse,
  getImageCache,
  imageCacheKey,
  isOriginAllowed,
  json,
  putImageCache,
  rateLimited,
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
  // 体积护栏：base64 上限对应约 4.5MB 原图（前端应已压缩到 3MB / 长边 1920px）。
  if (image.length > 6_000_000) {
    return json({ err: '图片过大，请压缩到 4MB 以内再试' }, 413);
  }

  const source = typeof body.source === 'string' && body.source ? body.source : 'zh';
  const target = typeof body.target === 'string' && body.target ? body.target : 'en';
  if (!((source === 'zh' && target === 'en') || (source === 'en' && target === 'zh'))) {
    return json({ err: '图片翻译仅支持「中文 ↔ 英文」互译' }, 400);
  }

  // ① 缓存命中：先 hash 再决定是否调 OCR——重复截图/模板图直接免 OCR。
  const ik = await imageCacheKey(image);
  const hit = await getImageCache(kv, r2, ik);
  if (hit) {
    try {
      return json({ ...JSON.parse(hit), hitCache: true });
    } catch {
      /* 缓存损坏则重算 */
    }
  }

  // ② IP 软限流（图片更严：每小时 5、每天 20）
  const rl = await rateLimited(kv, context.request, 'img');
  if (rl.limited) {
    return json({ err: '图片翻译次数已达上限（每 IP 每日 20 次、每小时 5 次），请明日再试', challenge: true }, 429);
  }

  // ③ 预算闸
  const bs = await budgetState(kv, 'img');
  if (bs.level === 'stop') {
    return json({ err: '本月免费额度已用完，将于下月 1 日恢复' }, 503);
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
