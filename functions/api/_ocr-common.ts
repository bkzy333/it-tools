// OCR（百度智能云）接口的公共防护层。复用翻译工具的成熟原语（防套壳 / CORS / 告警 / IP 哈希），
// 仅 OCR 专属的「调用次数」预算、限流、用量记账与翻译的「字符数」不同，故单独在此定义。
// 所有层都优雅降级：KV 未绑定时跳过，绝不让接口崩溃。
//
// 复用的 KV：TOOLS_USAGE（与 /api/translate、/api/hot、/api/feedback 同一命名空间，全部以 ocr: 前缀隔离）。
// 图片缓存直接复用 _translate-common 的 imageCacheKey / getImageCache / putImageCache（R2 指针用 tx:imgobj:，
// OCR 未绑 R2 时直存 KV，逻辑完全一致）。

import {
  isOriginAllowed,
  corsResponse,
  json,
  sendAlert,
  ipToken,
  imageCacheKey,
  getImageCache,
  putImageCache,
} from './_translate-common';

export {
  isOriginAllowed,
  corsResponse,
  json,
  sendAlert,
  ipToken,
  imageCacheKey,
  getImageCache,
  putImageCache,
};

export interface KvLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}
export interface OcrEnv {
  BAIDU_OCR_API_KEY?: string;
  BAIDU_OCR_SECRET_KEY?: string;
  TOOLS_USAGE?: KvLike;
  TG_BOT_TOKEN?: string;
  TG_CHAT_ID?: string;
}

// —— 全局预算闸：默认按百度个人实名月度免费额度 1000 次；可用 OCR_MONTHLY_QUOTA 覆盖 ——
const OCR_FREE_DEFAULT = 1000;
const WARN = 0.8;
const LIMIT = 0.9;
const STOP = 0.95;

// —— IP 软限流上限（比文本严，接近图片的粒度）——
const OCR_PER_HOUR = 30;
// 单 IP 日上限压到 50（月度免费额度仅 1000，避免单 IP 一天吃掉 1/20 月额度）
const OCR_PER_DAY = 50;

// —— 用量记账采样（把 KV 写压到「真实调用数 / USAGE_SAMPLE」）——
const USAGE_SAMPLE = 20;

export async function ocrBudgetState(
  kv: KvLike | undefined,
  quota = OCR_FREE_DEFAULT,
): Promise<{ level: 'ok' | 'warn' | 'limit' | 'stop'; used: number; quota: number }> {
  if (!kv) {
    return { level: 'ok', used: 0, quota };
  }
  const ym = new Date().toISOString().slice(0, 7);
  const used = Number((await kv.get(`ocr:used:${ym}`)) ?? 0) || 0;
  let level: 'ok' | 'warn' | 'limit' | 'stop' = 'ok';
  if (used >= quota * STOP) {
    level = 'stop';
  } else if (used >= quota * LIMIT) {
    level = 'limit';
  } else if (used >= quota * WARN) {
    level = 'warn';
  }
  return { level, used, quota };
}

export async function ocrRateLimited(
  kv: KvLike | undefined,
  req: Request,
): Promise<{ limited: boolean; count: number }> {
  if (!kv) {
    return { limited: false, count: 0 };
  }
  const ip = await ipToken(req);
  const now = new Date();
  const ymd = now.toISOString().slice(0, 10);
  const hh = now.toISOString().slice(11, 13);
  const bh = `ocr:rl:h:${ip}:${ymd}-${hh}`;
  const bd = `ocr:rl:d:${ip}:${ymd}`;
  const nh = Number((await kv.get(bh)) ?? 0) || 0;
  const nd = Number((await kv.get(bd)) ?? 0) || 0;
  if (nh >= OCR_PER_HOUR || nd >= OCR_PER_DAY) {
    return { limited: true, count: Math.max(nh, nd) };
  }
  await kv.put(bh, String(nh + 1), { expirationTtl: 3600 });
  await kv.put(bd, String(nd + 1), { expirationTtl: 24 * 3600 });
  return { limited: false, count: nd + 1 };
}

export async function addOcrUsage(kv: KvLike | undefined, env: OcrEnv, amount = 1): Promise<void> {
  if (!kv) {
    return;
  }
  if (Math.random() >= 1 / USAGE_SAMPLE) {
    return; // 采样命中才记账，省 KV 写
  }
  const amt = amount * USAGE_SAMPLE;
  const now = new Date();
  const ym = now.toISOString().slice(0, 7);
  const ymd = now.toISOString().slice(0, 10);
  const hh = now.toISOString().slice(11, 13);

  const mk = `ocr:used:${ym}`;
  const hk = `ocr:hr:${ymd}-${hh}`;
  const dk = `ocr:day:${ymd}`;

  const mu = Number((await kv.get(mk)) ?? 0) || 0;
  const hu = Number((await kv.get(hk)) ?? 0) || 0;
  const du = Number((await kv.get(dk)) ?? 0) || 0;
  await kv.put(mk, String(mu + amt));
  await kv.put(hk, String(hu + amt), { expirationTtl: 48 * 3600 });
  await kv.put(dk, String(du + amt), { expirationTtl: 48 * 3600 });

  const pct = (mu + amt) / OCR_FREE_DEFAULT;
  if (pct >= WARN) {
    const wk = `ocr:warn:${ymd}`;
    if (!(await kv.get(wk))) {
      await kv.put(wk, '1', { expirationTtl: 24 * 3600 });
      await sendAlert(env as never, `⚠️ OCR 用量达 ${Math.round(pct * 100)}%，月免费额度 ${OCR_FREE_DEFAULT}（采样估算）`);
    }
  }
}
