// 翻译接口的公共防护层（文本 + 图片共用）。所有层都「优雅降级」：对应绑定 / 环境变量
// 未配置时跳过该层，绝不让接口崩溃。Cloudflare Pages Functions 跑在边缘，用 Web Crypto 做哈希。
//
// 复用的 KV：TOOLS_USAGE（与 /api/hot、/api/feedback 同一个命名空间，全部以 tx: 前缀隔离）。
// 可选的 R2：TRANSLATE_R2（未绑定则缓存回退到 KV，接口依旧可用）。
// 可选的告警：TG_BOT_TOKEN + TG_CHAT_ID（Telegram 机器人），未配则只 console.warn。
//
// ─────────────────────────────────────────────────────────────────────────────
// KV 写入限额（免费版每天仅 1000 次写入）是头号约束，本文件的设计全部围绕它收敛：
//   1) 缓存优先走 R2（文本 + 图片都支持）。只有未绑 R2 时才回退 KV；回退写入失败时
//      一律「静默跳过」，用户只是少了缓存加速、绝不会报错崩接口。
//   2) IP 软限流的 KV 计数：平时（预算 ok）完全不写 KV，只交给下面的 WAF；只有预算偏紧
//      （≥warn）时才以 RATE_SAMPLE 概率采样写，把写次数压到「请求数 / RATE_SAMPLE」。
//   3) 用量记账 addUsage：只真实调用腾讯云后才记，且仅以 USAGE_SAMPLE 概率采样写，
//      写入值 ×USAGE_SAMPLE 估算总量。80/90/95% 是软闸，估算误差可接受。
//   4) 真正的硬限速交给 Cloudflare WAF Rate Limiting Rule（见下方 WAF_RULE 注释），
//      零代码、零 KV 消耗，免费版即有，是抗滥用的主防线。
// ─────────────────────────────────────────────────────────────────────────────
//
// 推荐在 Cloudflare 控制台加一条 WAF / Rate Limiting 规则（免费版即可，零 KV）：
//   名称：translate-rate-limit
//   匹配表达式：(http.request.uri.path matches "^/api/(translate|image-translate)$")
//   规则：当某个 IP 在 1 分钟内请求 > 30 次 → 动作 Managed Challenge（不是直接 Block，
//         避免把公司 NAT / 校园网 / 运营商 CGNAT 的共享 IP 真人误杀）。
//   这样边缘就把刷额度的脚本挡掉，后端 KV 限流只作次级兜底。

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
  const valid = (h: string | null) =>
    h !== null && (ALLOWED_HOSTS.some((base) => h === base || h.endsWith('.' + base)) || h.endsWith('.pages.dev'));
  // 防套壳（挡「浏览器内第三方站点把 /api/translate 嵌进自己页面烧额度」这一场景）：
  //   浏览器跨域 POST 必然带 Origin，第三方站点嵌入时 Origin=其域名（非法）→ 直接拦截。
  //   以下一律放行，避免误杀：
  //     - 同源 / 预览域名(*.pages.dev) → 合法 Origin；
  //     - Cloudflare 健康检查 / 隐私浏览器 stripping 头 → Origin 缺失；
  //     - Origin 缺失（哪怕 Referer 是第三方）→ 交给 WAF Rate Limiting Rule 与下面的预算闸处理，
  //       因为 Referer 客户端完全可控，且同源真实用户永远带合法 Origin，无需靠 Referer 判黑。
  if (o !== null && !valid(o)) {
    return false;
  }
  return true;
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
  // 归一化顺序很关键：先 NFKC 把全角字母/数字/空格统一成半角（否则全角空格能骗出不同缓存 key），
  // 再剔除零宽字符（U+200B–U+200D、U+FEFF）避免用不可见字符制造「看似不同」的文本绕过缓存命中，
  // 最后才是换行/制表符折叠与首尾去空白。
  return s
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export async function textCacheKey(text: string, from: string, to: string): Promise<string> {
  const h = await sha256Hex(normalizeText(text));
  return `tx:t:${from}:${to}:${h.slice(0, 32)}`;
}

// 图片缓存 key：对收到的 base64 整体做 SHA-256。
// 前端在上传前已把图片统一缩放（长边 ≤1920）并压缩（JPEG 0.85），所以「同一张图的不同大分辨率版本」
// 在 ≥1920 这一主流场景下会被压成同一份字节 → 命中同一 key，免掉重复 OCR。
// 已是 <1920 的小图之间不会互命中，属于可接受边界（缓存错失只是多调一次 OCR，不影响正确性）。
export async function imageCacheKey(imageBase64: string): Promise<string> {
  const h = await sha256Hex(imageBase64);
  return `tx:img:${h.slice(0, 32)}`;
}

// base64 解码后的真实字节数（base64 比原图膨胀约 1.33 倍，体积护栏要用解码值才准）。
export function base64DecodedSize(b64: string): number {
  const pad = (b64.match(/=+$/) || [''])[0].length;
  return Math.floor((b64.length * 3) / 4) - pad;
}

// 读 / 写文本缓存（TTL 30 天）。命中 = 0 字符消耗、不限速、不记账。
// 与图片缓存一致：R2 优先（KV 只存指针），未绑 R2 才直存 KV；写失败一律静默跳过。
export async function getTextCache(
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
    return ptr;
  } catch {
    return null;
  }
}
export async function putTextCache(
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
      const objKey = `tx:txtobj:${sha}`;
      await r2.put(objKey, value);
      await kv.put(key, `r2:${objKey}`, { expirationTtl: 30 * 24 * 3600 });
    } else {
      await kv.put(key, value, { expirationTtl: 30 * 24 * 3600 }); // 未绑 R2 直存 KV；写失败静默跳过
    }
  } catch {
    /* 缓存写失败不影响主流程（最多少了缓存加速） */
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
// 采样率：调用方只在「预算偏紧」时，以 1/RATE_SAMPLE 的概率真正读写 KV 计数器，
// 把 KV 写次数压到「请求数 / RATE_SAMPLE」，避免打爆免费版每天 1000 次写入限额。
// 平时（预算 ok）完全不写 KV，硬限速交给 WAF。
export const RATE_SAMPLE = 20;

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
// 采样记账：每 USAGE_SAMPLE 次真实调用只写 1 次 KV，写入值 ×USAGE_SAMPLE 估算总量，
// 把 KV 写次数压到「真实调用数 / USAGE_SAMPLE」。80/90/95% 是软闸，估算误差可接受。
const USAGE_SAMPLE = 20;

export async function addUsage(
  kv: KvLike | undefined,
  env: TranslateEnv,
  kind: 'txt' | 'img',
  amount: number,
): Promise<void> {
  if (!kv) {
    return;
  }
  if (Math.random() >= 1 / USAGE_SAMPLE) {
    return; // 采样命中才记账，省 KV 写
  }
  const amt = amount * USAGE_SAMPLE; // 用放大值估算总量
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
  const newMu = mu + amt;
  const newHu = hu + amt;
  await kv.put(monthKey, String(newMu));
  await kv.put(hourKey, String(newHu), { expirationTtl: 48 * 3600 });
  await kv.put(dayKey, String(du + amt), { expirationTtl: 48 * 3600 });

  // 突增：本小时 > 昨日同时段 ×3（每小时最多告警一次）。本月/今日都按放大值估算，比值不变。
  const yest = Number((await kv.get(`tx:hr:${kind}:${yesterday(ymd)}-${hh}`)) ?? 0) || 0;
  if (yest > 0 && newHu > yest * 3) {
    const flag = `tx:spk:${kind}:${ymd}-${hh}`;
    if (!(await kv.get(flag))) {
      await kv.put(flag, '1', { expirationTtl: 3600 });
      await sendAlert(env, `⚠️ 翻译突增[${kind}]：本小时约 ${newHu} vs 昨日同时段 ${yest}，超 3 倍`);
    }
  }

  // 80% / 90% 阈值告警（每天每种一次）
  const pct = newMu / (kind === 'txt' ? TXT_FREE : IMG_FREE);
  if (pct >= WARN) {
    const wk = `tx:warn:${kind}:${ymd}`;
    if (!(await kv.get(wk))) {
      await kv.put(wk, '1', { expirationTtl: 24 * 3600 });
      await sendAlert(env, `⚠️ 翻译用量达 ${Math.round(pct * 100)}%（${kind}），月免费额度 ${kind === 'txt' ? TXT_FREE : IMG_FREE}（采样估算）`);
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
