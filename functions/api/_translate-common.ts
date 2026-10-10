// 翻译接口的公共防护层（文本 + 图片共用）。所有层都「优雅降级」：对应绑定 / 环境变量
// 未配置时跳过该层，绝不让接口崩溃。Cloudflare Pages Functions 跑在边缘，用 Web Crypto 做哈希。
//
// 复用的 KV：TOOLS_USAGE（与 /api/hot、/api/feedback 同一个命名空间，全部以 tx: 前缀隔离）。
// 可选的 R2：TRANSLATE_R2（未绑定则图片缓存回退到 KV，接口依旧可用）。
// 可选的告警：TG_BOT_TOKEN + TG_CHAT_ID（Telegram 机器人），未配则只 console.warn。

const ALLOWED_HOSTS = ['gjxtools.com', 'localhost'];

// 允许的来源：本站、本地调试、以及 Cloudflare 自带的 *.pages.dev 预览域名。
// 这样既能挡掉第三方站点把 /api/translate 嵌进自己页面（烧你的额度），
// 又不会把你的预览部署（*.pages.dev）也一起误杀。
function hostOf(url: string | null): string | null {
  if (!url) {
    return null;
  }
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export function isOriginAllowed(req: Request): boolean {
  const o = hostOf(req.headers.get('Origin'));
  const r = hostOf(req.headers.get('Referer'));
  const ok = (h: string | null) =>
    !h || ALLOWED_HOSTS.some((base) => h === base || h.endsWith('.' + base)) || h.endsWith('.pages.dev');
  return ok(o) && ok(r);
}

// 预检响应：缓存一天，且 Access-Control-Allow-Origin 写死本站，绝不用 *。
export function corsResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': 'https://gjxtools.com',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
      'Cache-Control': 'max-age=86400',
    },
  });
}

// —— KV / R2 最小接口（不依赖 @cloudflare/workers-types，避免类型缺失）——
export interface KvLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}
export interface R2Like {
  get(key: string): Promise<{ text(): Promise<string> } | null>;
  put(key: string, value: string, opts?: Record<string, unknown>): Promise<unknown>;
}
export interface TranslateEnv {
  TENCENT_SECRET_ID?: string;
  TENCENT_SECRET_KEY?: string;
  TOOLS_USAGE?: KvLike;
  TRANSLATE_R2?: R2Like;
  TG_BOT_TOKEN?: string;
  TG_CHAT_ID?: string;
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

// —— 缓存 key ——
async function sha256Hex(msg: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function normalizeText(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
}

export async function textCacheKey(text: string, from: string, to: string): Promise<string> {
  const h = await sha256Hex(normalizeText(text));
  return `tx:t:${from}:${to}:${h.slice(0, 32)}`;
}

export async function imageCacheKey(imageBase64: string): Promise<string> {
  const h = await sha256Hex(imageBase64);
  return `tx:img:${h.slice(0, 32)}`;
}

// 读 / 写文本缓存（TTL 30 天）。命中 = 0 字符消耗、不限速、不记账。
export async function getTextCache(kv: KvLike | undefined, key: string): Promise<string | null> {
  if (!kv) {
    return null;
  }
  try {
    return await kv.get(key);
  } catch {
    return null;
  }
}
export async function putTextCache(kv: KvLike | undefined, key: string, value: string): Promise<void> {
  if (!kv) {
    return;
  }
  try {
    await kv.put(key, value, { expirationTtl: 30 * 24 * 3600 });
  } catch {
    /* 缓存写失败不影响主流程 */
  }
}

// 读 / 写图片缓存：R2 优先（KV 只存指针），未绑 R2 时 KV 直接存结果。
export async function getImageCache(
  kv: KvLike | undefined,
  r2: R2Like | undefined,
  key: string,
): Promise<string | null> {
  if (!kv) {
    return null;
  }
  try {
    const ptr = await kv.get(key);
    if (!ptr) {
      return null;
    }
    if (ptr.startsWith('r2:') && r2) {
      const obj = await r2.get(ptr.slice(3));
      return obj ? await obj.text() : null;
    }
    return ptr; // 直接存的 JSON
  } catch {
    return null;
  }
}
export async function putImageCache(
  kv: KvLike | undefined,
  r2: R2Like | undefined,
  key: string,
  value: string,
): Promise<void> {
  if (!kv) {
    return;
  }
  try {
    if (r2) {
      const sha = key.split(':').pop() ?? 'x';
      const objKey = `tx:imgobj:${sha}`;
      await r2.put(objKey, value);
      await kv.put(key, `r2:${objKey}`, { expirationTtl: 30 * 24 * 3600 });
    } else {
      await kv.put(key, value, { expirationTtl: 30 * 24 * 3600 });
    }
  } catch {
    /* 缓存写失败不影响主流程 */
  }
}

// —— IP 软限流（KV 按小时 / 按天分桶，自带过期）——
const TXT_PER_HOUR = 200;
const IMG_PER_HOUR = 5;
const IMG_PER_DAY = 20;

export async function ipToken(req: Request): Promise<string> {
  const ip =
    req.headers.get('CF-Connecting-IP') ||
    req.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown';
  const h = await sha256Hex(ip);
  return h.slice(0, 16);
}

export async function rateLimited(
  kv: KvLike | undefined,
  req: Request,
  kind: 'txt' | 'img',
  capOverride?: number,
): Promise<{ limited: boolean; count: number }> {
  if (!kv) {
    return { limited: false, count: 0 };
  }
  const ip = await ipToken(req);
  const now = new Date();
  const ymd = now.toISOString().slice(0, 10);
  const hh = now.toISOString().slice(11, 13);

  if (kind === 'txt') {
    const cap = capOverride ?? TXT_PER_HOUR;
    const bk = `tx:rl:txt:${ip}:${ymd}-${hh}`;
    const n = Number((await kv.get(bk)) ?? 0) || 0;
    if (n >= cap) {
      return { limited: true, count: n };
    }
    await kv.put(bk, String(n + 1), { expirationTtl: 3600 });
    return { limited: false, count: n + 1 };
  }

  // 图片：每小时 + 每天双闸（比文本严得多）
  const bkh = `tx:rl:imgh:${ip}:${ymd}-${hh}`;
  const bkd = `tx:rl:imgd:${ip}:${ymd}`;
  const nh = Number((await kv.get(bkh)) ?? 0) || 0;
  const nd = Number((await kv.get(bkd)) ?? 0) || 0;
  if (nh >= IMG_PER_HOUR || nd >= IMG_PER_DAY) {
    return { limited: true, count: Math.max(nh, nd) };
  }
  await kv.put(bkh, String(nh + 1), { expirationTtl: 3600 });
  await kv.put(bkd, String(nd + 1), { expirationTtl: 24 * 3600 });
  return { limited: false, count: nd + 1 };
}

// —— 全局预算闸（免费额度：文本 500 万字符/月，图片 1 万次/月）——
const TXT_FREE = 5_000_000;
const IMG_FREE = 10_000;
const WARN = 0.8;
const LIMIT = 0.9;
const STOP = 0.95;

export interface BudgetState {
  level: 'ok' | 'warn' | 'limit' | 'stop';
  used: number;
  quota: number;
}

export async function budgetState(kv: KvLike | undefined, kind: 'txt' | 'img'): Promise<BudgetState> {
  const quota = kind === 'txt' ? TXT_FREE : IMG_FREE;
  if (!kv) {
    return { level: 'ok', used: 0, quota };
  }
  const ym = new Date().toISOString().slice(0, 7);
  const used = Number((await kv.get(`tx:used:${kind}:${ym}`)) ?? 0) || 0;
  let level: BudgetState['level'] = 'ok';
  if (used >= quota * STOP) {
    level = 'stop';
  } else if (used >= quota * LIMIT) {
    level = 'limit';
  } else if (used >= quota * WARN) {
    level = 'warn';
  }
  return { level, used, quota };
}

function yesterday(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// 累加用量 + 突增检测 + 阈值一次性告警。仅在「真实调用腾讯云」后调用（缓存命中不记账）。
export async function addUsage(
  kv: KvLike | undefined,
  env: TranslateEnv,
  kind: 'txt' | 'img',
  amount: number,
): Promise<void> {
  if (!kv) {
    return;
  }
  const now = new Date();
  const ym = now.toISOString().slice(0, 7);
  const ymd = now.toISOString().slice(0, 10);
  const hh = now.toISOString().slice(11, 13);

  const monthKey = `tx:used:${kind}:${ym}`;
  const hourKey = `tx:hr:${kind}:${ymd}-${hh}`;
  const dayKey = `tx:day:${kind}:${ymd}`;

  const mu = Number((await kv.get(monthKey)) ?? 0) || 0;
  const hu = Number((await kv.get(hourKey)) ?? 0) || 0;
  const du = Number((await kv.get(dayKey)) ?? 0) || 0;
  const newMu = mu + amount;
  const newHu = hu + amount;
  await kv.put(monthKey, String(newMu));
  await kv.put(hourKey, String(newHu), { expirationTtl: 48 * 3600 });
  await kv.put(dayKey, String(du + amount), { expirationTtl: 48 * 3600 });

  // 突增：本小时 > 昨日同时段 ×3（每小时最多告警一次）
  const yest = Number((await kv.get(`tx:hr:${kind}:${yesterday(ymd)}-${hh}`)) ?? 0) || 0;
  if (yest > 0 && newHu > yest * 3) {
    const flag = `tx:spk:${kind}:${ymd}-${hh}`;
    if (!(await kv.get(flag))) {
      await kv.put(flag, '1', { expirationTtl: 3600 });
      await sendAlert(env, `⚠️ 翻译突增[${kind}]：本小时 ${newHu} vs 昨日同时段 ${yest}，超 3 倍`);
    }
  }

  // 80% / 90% 阈值告警（每天每种一次）
  const pct = newMu / (kind === 'txt' ? TXT_FREE : IMG_FREE);
  if (pct >= WARN) {
    const wk = `tx:warn:${kind}:${ymd}`;
    if (!(await kv.get(wk))) {
      await kv.put(wk, '1', { expirationTtl: 24 * 3600 });
      await sendAlert(env, `⚠️ 翻译用量达 ${Math.round(pct * 100)}%（${kind}），月免费额度 ${kind === 'txt' ? TXT_FREE : IMG_FREE}`);
    }
  }
}

export async function sendAlert(env: TranslateEnv, message: string): Promise<void> {
  const token = env.TG_BOT_TOKEN;
  const chat = env.TG_CHAT_ID;
  if (!token || !chat) {
    console.warn('[translate-alert]', message);
    return;
  }
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: message }),
    });
  } catch (e) {
    console.warn('[translate-alert-fail]', String(e));
  }
}
