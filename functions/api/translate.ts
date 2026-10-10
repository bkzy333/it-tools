// Cloudflare Pages Functions：文本翻译（腾讯云 TMT TextTranslate）+ 多层防护。
//
// 防护链路（按顺序）：防套壳 → 单次上限 3000 字符 → 缓存命中(0 消耗) → 全局预算闸(80/90/95%)
//   → IP 软限流(采样兜底，仅预算偏紧时启用) → miss 才调腾讯云 + 写缓存(TTL30d) + 累加用量。
//   真正的硬限速交给 Cloudflare WAF Rate Limiting Rule（见 _translate-common.ts 顶部说明），零 KV 消耗。
//
// 密钥只走 Cloudflare 环境变量 TENCENT_SECRET_ID / TENCENT_SECRET_KEY，不下发浏览器。
// 缓存 / 限流 / 用量计数复用 TOOLS_USAGE KV（tx: 前缀）。未绑 KV 时这些层自动跳过。

import { callTmt } from './_tmt';
import {
  budgetState,
  corsResponse,
  isOriginAllowed,
  json,
  putTextCache,
  rateLimited,
  getTextCache,
  textCacheKey,
  addUsage,
  normalizeText,
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

  let body: { text?: unknown; source?: unknown; target?: unknown };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return json({ err: '请求体不是合法 JSON' }, 400);
  }

  const text = typeof body.text === 'string' ? body.text : '';
  const source = typeof body.source === 'string' && body.source ? body.source : 'auto';
  const target = typeof body.target === 'string' && body.target ? body.target : 'en';

  if (!text.trim()) {
    return json({ err: '请输入要翻译的文本' }, 400);
  }
  // 单次上限：超长 payload 直接拒，别让它走到腾讯计费。
  if (text.length > 3000) {
    return json({ err: '单次最多 3000 字符，请分批翻译' }, 413);
  }

  // ① 缓存命中：天然幂等，同一段文字永远同一结果。命中 = 0 字符消耗、不限速、不记账。
  const ck = await textCacheKey(text, source, target);
  const hit = await getTextCache(kv, r2, ck);
  if (hit) {
    try {
      return json({ ...JSON.parse(hit), hitCache: true });
    } catch {
      /* 缓存损坏则当作未命中，下面重算 */
    }
  }

  // ② 预算闸（读 KV，免费）：先读，决定后面要不要启用 KV 软限流。
  const bs = await budgetState(kv, 'txt');
  if (bs.level === 'stop') {
    return json({ err: '本月免费额度已用完，将于下月 1 日恢复' }, 503);
  }

  // ③ IP 软限流（次级兜底，平时完全不写 KV）：仅当预算偏紧(≥warn)时才以 RATE_SAMPLE 概率
  //    采样写，把 KV 写次数压到「请求数 / RATE_SAMPLE」；平时交给 Cloudflare WAF 硬限速。
  let rl = { limited: false, count: 0 };
  if (kv && (bs.level === 'warn' || bs.level === 'limit') && Math.random() < 1 / RATE_SAMPLE) {
    rl = await rateLimited(kv, context.request, 'txt', bs.level === 'limit' ? 50 : undefined);
  }
  if (rl.limited) {
    return json({ err: '请求过于频繁，请稍后再试', challenge: true }, 429);
  }
  if (bs.level === 'limit' && rl.count > 50) {
    return json({ err: '当前用量偏高，已临时限速，请稍后再试' }, 429);
  }

  try {
    const data = await callTmt(context.env, 'TextTranslate', {
      Source: source,
      Target: target,
      ProjectId: 0,
      SourceText: text,
    });
    const resp = (data.Response ?? {}) as {
      TargetText?: string;
      Source?: string;
      Target?: string;
      RequestId?: string;
      Error?: { Code: string; Message: string };
    };
    if (resp.Error) {
      return json({ err: `${resp.Error.Code} ${resp.Error.Message}` }, 502);
    }
    const payload = JSON.stringify(resp);
    await putTextCache(kv, r2, ck, payload);
    await addUsage(kv, context.env, 'txt', normalizeText(text).length);
    return json({ ...resp, hitCache: false });
  } catch (e) {
    return json({ err: '代理异常：' + String((e as Error)?.message ?? e) }, 502);
  }
}
