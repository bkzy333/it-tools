// PDF/OCR 接口的防护层（与 _translate-common 同构，但用独立的 txocr: 命名空间，
// 不与翻译额度混算）。所有层「优雅降级」：KV 未绑定 / 环境变量未配置时跳过对应层，绝不崩接口。
//
// 复用 _translate-common 的：isOriginAllowed / corsResponse / json / sendAlert / base64DecodedSize / sha256Hex。
// 腾讯云密钥直接复用 TENCENT_SECRET_ID / TENCENT_SECRET_KEY（与翻译同一套，前提是账号已开通「文字识别 OCR」）。

import {
  isOriginAllowed,
  corsResponse,
  json,
  sendAlert,
  base64DecodedSize,
  sha256Hex,
  type KvLike,
} from './_translate-common';

export interface OcrEnv {
  TENCENT_SECRET_ID?: string;
  TENCENT_SECRET_KEY?: string;
  TOOLS_USAGE?: KvLike;
  TG_BOT_TOKEN?: string;
  TG_CHAT_ID?: string;
  /** OCR 月度免费额度上限（默认 10000），可在此环境变量覆盖 */
  OCR_MONTHLY_QUOTA?: string;
}

// 腾讯云 通用印刷体识别 单次图片限制（base64 解码后），取 8MB 留余量（官方文档 ≤10MB）。
export const OCR_MAX_BYTES = 8 * 1024 * 1024;

// —— 缓存 key（图片级，天然幂等：同一页渲染结果二次 OCR 0 消耗）——
export async function ocrImageCacheKey(imageBase64: string): Promise<string> {
  const h = await sha256Hex(imageBase64);
  return `txocr:img:${h.slice(0, 32)}`;
}

export async function getOcrCache(kv: KvLike | undefined, key: string): Promise<string | null> {
  if (!kv) {
    return null;
  }
  try {
    return await kv.get(key);
  } catch {
    return null;
  }
}
export async function putOcrCache(kv: KvLike | undefined, key: string, value: string): Promise<void> {
  if (!kv) {
    return;
  }
  try {
    await kv.put(key, value, { expirationTtl: 30 * 24 * 3600 });
  } catch {
    /* 写失败不影响主流程 */
  }
}

// —— IP 软限流（按小时 / 按天双闸，采样写 KV 压低免费版每天 1000 次写入限额）——
const RATE_SAMPLE = 20;
const OCR_PER_HOUR = 30;
const OCR_PER_DAY = 200;

async function ipToken(req: Request): Promise<string> {
  const ip =
    req.headers.get('CF-Connecting-IP') ||
    req.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown';
  const h = await sha256Hex(ip);
  return h.slice(0, 16);
}

export async function ocrRateLimited(
  kv: KvLike | undefined,
  req: Request,
): Promise<{ limited: boolean; count: number }> {
  if (!kv) {
    return { limited: false, count: 0 };
  }
  if (Math.random() >= 1 / RATE_SAMPLE) {
    return { limited: false, count: 0 }; // 采样命中才计数，省 KV 写
  }
  const ip = await ipToken(req);
  const now = new Date();
  const ymd = now.toISOString().slice(0, 10);
  const hh = now.toISOString().slice(11, 13);
  const bkh = `txocr:rl:h:${ip}:${ymd}-${hh}`;
  const bkd = `txocr:rl:d:${ip}:${ymd}`;
  const nh = Number((await kv.get(bkh)) ?? 0) || 0;
  const nd = Number((await kv.get(bkd)) ?? 0) || 0;
  if (nh >= OCR_PER_HOUR || nd >= OCR_PER_DAY) {
    return { limited: true, count: Math.max(nh, nd) };
  }
  await kv.put(bkh, String(nh + 1), { expirationTtl: 3600 });
  await kv.put(bkd, String(nd + 1), { expirationTtl: 24 * 3600 });
  return { limited: false, count: nd + 1 };
}

// —— 全局预算闸（月度免费额度，默认 10000 次，可用 OCR_MONTHLY_QUOTA 环境变量覆盖）——
const WARN = 0.8;
const LIMIT = 0.9;
const STOP = 0.95;

export interface OcrBudget {
  level: 'ok' | 'warn' | 'limit' | 'stop';
  used: number;
  quota: number;
}

export async function ocrBudgetState(kv: KvLike | undefined, quota: number): Promise<OcrBudget> {
  if (!kv) {
    return { level: 'ok', used: 0, quota };
  }
  const ym = new Date().toISOString().slice(0, 7);
  const used = Number((await kv.get(`txocr:used:${ym}`)) ?? 0) || 0;
  let level: OcrBudget['level'] = 'ok';
  if (used >= quota * STOP) {
    level = 'stop';
  } else if (used >= quota * LIMIT) {
    level = 'limit';
  } else if (used >= quota * WARN) {
    level = 'warn';
  }
  return { level, used, quota };
}

const USAGE_SAMPLE = 20;

export async function addOcrUsage(
  kv: KvLike | undefined,
  env: OcrEnv,
  amount: number,
  quota: number,
): Promise<void> {
  if (!kv) {
    return;
  }
  if (Math.random() >= 1 / USAGE_SAMPLE) {
    return; // 采样记账，省 KV 写
  }
  const amt = amount * USAGE_SAMPLE;
  const now = new Date();
  const ym = now.toISOString().slice(0, 7);
  const ymd = now.toISOString().slice(0, 10);
  const hh = now.toISOString().slice(11, 13);
  const monthKey = `txocr:used:${ym}`;
  const hourKey = `txocr:hr:${ymd}-${hh}`;
  const dayKey = `txocr:day:${ymd}`;
  const mu = Number((await kv.get(monthKey)) ?? 0) || 0;
  const hu = Number((await kv.get(hourKey)) ?? 0) || 0;
  const du = Number((await kv.get(dayKey)) ?? 0) || 0;
  const newMu = mu + amt;
  await kv.put(monthKey, String(newMu));
  await kv.put(hourKey, String(hu + amt), { expirationTtl: 48 * 3600 });
  await kv.put(dayKey, String(du + amt), { expirationTtl: 48 * 3600 });

  // 80% 阈值告警（每天一次）
  const realPct = newMu / quota;
  if (realPct >= WARN) {
    const wk = `txocr:warn:${ymd}`;
    if (!(await kv.get(wk))) {
      await kv.put(wk, '1', { expirationTtl: 24 * 3600 });
      await sendAlert(env, `⚠️ OCR 用量达 ${Math.round(realPct * 100)}%（采样估算，月免费额度 ${quota}）`);
    }
  }
}

/** 解析腾讯云 GeneralBasicOCR 响应，拼成按行连接的纯文本 */
export function parseGeneralBasic(data: { Response?: { TextDetections?: Array<{ DetectedText?: string }>; Error?: { Code: string; Message: string } } }): {
  text: string;
  error?: { code: string; message: string };
} {
  const resp = data.Response ?? {};
  if (resp.Error) {
    return { text: '', error: { code: resp.Error.Code, message: resp.Error.Message } };
  }
  const text = (resp.TextDetections ?? [])
    .map((d) => d.DetectedText ?? '')
    .filter((s) => s.length > 0)
    .join('\n');
  return { text };
}

export { isOriginAllowed, corsResponse, json, base64DecodedSize };
