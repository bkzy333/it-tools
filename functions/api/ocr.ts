// Cloudflare Pages Functions：图片 / PDF OCR（百度智能云 通用文字识别·高精度版 accurate_basic）+ 多层防护。
//
// 防护链路（顺序，与翻译工具一致）：防套壳 → 单次上限(4MB) → 缓存命中(0 消耗)
//   → 全局预算闸(80/90/95%) → IP 软限流(采样兜底) → miss 才调百度 + 写缓存 + 累加用量。
//   真正的硬限速交给 Cloudflare WAF Rate Limiting Rule（见 _translate-common.ts 顶部），零 KV 消耗。
//
// 密钥只走 Cloudflare 环境变量 BAIDU_OCR_API_KEY / BAIDU_OCR_SECRET_KEY，绝不下发浏览器。
// 缓存 / 限流 / 用量计数复用 TOOLS_USAGE KV（ocr: 前缀）。未绑 KV 时这些层自动跳过。

import {
  isOriginAllowed,
  corsResponse,
  json,
  imageCacheKey,
  getImageCache,
  putImageCache,
  ocrBudgetState,
  ocrRateLimited,
  addOcrUsage,
  type OcrEnv,
} from './_ocr-common';

const TOKEN_URL = 'https://aip.baidubce.com/oauth/2.0/token';
const OCR_URL = 'https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic';
// 单次上限：百度 accurate_basic 要求 base64 解码后 ≤ 4MB，超了直接拒、别走到计费。
const OCR_CAP_DECODED = 4 * 1024 * 1024;

export async function onRequestOptions(): Promise<Response> {
  return corsResponse();
}

export async function onRequestPost(context: { request: Request; env: OcrEnv }): Promise<Response> {
  if (!isOriginAllowed(context.request)) {
    return new Response('Forbidden', { status: 403 });
  }
  const kv = context.env?.TOOLS_USAGE;

  let body: { image?: unknown; language?: unknown };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return json({ error: '请求体不是合法 JSON' }, 400);
  }

  const imageRaw = typeof body.image === 'string' ? body.image : '';
  const language = typeof body.language === 'string' && body.language ? body.language : 'CHN_ENG';
  if (!imageRaw) {
    return json({ error: '缺少图片数据' }, 400);
  }
  // 去掉 data:image/...;base64, 前缀（百度只收纯 base64）
  const b64 = imageRaw.replace(/^data:image\/[a-zA-Z]+;base64,/, '');

  // 单次上限：解码字节 ≤ 4MB
  const pad = (b64.match(/=+$/) || [''])[0].length;
  const decoded = Math.floor((b64.length * 3) / 4) - pad;
  if (decoded > OCR_CAP_DECODED) {
    return json({ error: '图片过大，请压缩到 4MB 以内再试' }, 413);
  }

  // 未配置密钥：明确告知前端，前端据此回退 / 提示，而非卡死。
  if (!context.env?.BAIDU_OCR_API_KEY || !context.env?.BAIDU_OCR_SECRET_KEY) {
    return json(
      {
        error: 'not_configured',
        message: 'OCR 服务未配置：请在 Cloudflare Pages 设置 BAIDU_OCR_API_KEY / BAIDU_OCR_SECRET_KEY 环境变量。',
      },
      501,
    );
  }

  // ① 缓存命中：同一张图天然幂等 → 0 调用消耗、不限速、不记账。
  const ck = await imageCacheKey(b64);
  const hit = await getImageCache(kv, undefined, ck);
  if (hit) {
    try {
      return json({ text: hit, hitCache: true });
    } catch {
      /* 缓存损坏则当未命中重算 */
    }
  }

  // ② 全局预算闸（读 KV，免费）
  const bs = await ocrBudgetState(kv);
  if (bs.level === 'stop') {
    return json({ error: '本月免费额度已用完，将于下月 1 日恢复' }, 503);
  }

  // ③ IP 软限流（次级兜底，仅预算偏紧时采样写 KV）
  let rl = { limited: false, count: 0 };
  if (kv && (bs.level === 'warn' || bs.level === 'limit') && Math.random() < 1 / 20) {
    rl = await ocrRateLimited(kv, context.request);
  }
  if (rl.limited) {
    return json({ error: '请求过于频繁，请稍后再试', challenge: true }, 429);
  }

  try {
    const token = await getToken(context.env);
    const text = await ocrOnce(token, b64, language);
    await putImageCache(kv, undefined, ck, text);
    await addOcrUsage(kv, context.env, 1);
    return json({ text, hitCache: false });
  } catch (e: any) {
    const code = e?.baiduCode;
    // 额度 / 频率超限
    if (code === 17 || code === 18 || code === 19) {
      return json({ error: 'quota_exceeded', message: 'OCR 调用额度或频率超限，请稍后再试' }, 429);
    }
    // access_token 失效：刷新重试一次
    if (code === 110 || code === 111) {
      try {
        const token = await getToken(context.env, true);
        const text = await ocrOnce(token, b64, language);
        await putImageCache(kv, undefined, ck, text);
        await addOcrUsage(kv, context.env, 1);
        return json({ text, hitCache: false });
      } catch (e2: any) {
        return json({ error: 'ocr_failed', message: String(e2?.message || e2) }, 502);
      }
    }
    return json({ error: 'ocr_failed', message: String(e?.message || e) }, 502);
  }
}

// access_token 缓存 30 天，到期前 1 天刷新。KV 未绑则每次现取（token 接口很轻）。
async function getToken(env: OcrEnv, force = false): Promise<string> {
  const kv = env.TOOLS_USAGE;
  const cacheKey = 'ocr:baidu-token';
  if (kv && !force) {
    const c = await kv.get(cacheKey);
    if (c) {
      try {
        const o = JSON.parse(c);
        if (o.exp - Date.now() > 86400000) {
          return o.token;
        }
      } catch {
        /* 损坏则忽略，重取 */
      }
    }
  }
  const url = `${TOKEN_URL}?grant_type=client_credentials&client_id=${encodeURIComponent(
    env.BAIDU_OCR_API_KEY!,
  )}&client_secret=${encodeURIComponent(env.BAIDU_OCR_SECRET_KEY!)}`;
  const r = await fetch(url);
  const d = (await r.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!d.access_token) {
    throw new Error(d.error_description || 'token_failed');
  }
  const exp = Date.now() + (d.expires_in ? d.expires_in * 1000 : 2592000000);
  if (kv) {
    await kv.put(cacheKey, JSON.stringify({ token: d.access_token, exp }), { expirationTtl: 30 * 86400 });
  }
  return d.access_token;
}

async function ocrOnce(token: string, b64: string, language: string): Promise<string> {
  const form = new URLSearchParams();
  form.set('access_token', token);
  form.set('image', b64);
  form.set('language_type', language);
  form.set('paragraph', 'true'); // 保留段落，输出更连贯
  const r = await fetch(OCR_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const d = (await r.json()) as { words_result?: { words?: string }[]; error_code?: number; error_msg?: string };
  if (d.error_code) {
    const e = new Error(d.error_msg || 'ocr_error') as Error & { baiduCode?: number };
    e.baiduCode = d.error_code;
    throw e;
  }
  const words = (d.words_result || []).map((w) => w.words || '').join('\n');
  return words;
}
