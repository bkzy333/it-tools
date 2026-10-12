// Cloudflare Pages Functions：实时汇率代理（GET /api/rates）
//
// 为什么需要它：
//   本站 CSP 的 connect-src 只放行自家域 + AdSense，浏览器直连 open.er-api.com 等第三方接口
//   会被 CSP 拦掉（fetch 直接抛 TypeError），页面上就一直显示「获取实时汇率失败，当前展示的是
//   内置参考汇率」。走自家 /api/rates 是同源请求，不受 CSP 限制。
//
//   附带两个好处：
//     1. 请求由 Cloudflare 边缘节点发出，对国内访客比浏览器直连 jsDelivr / er-api 稳得多
//        （这类域名在国内经常被墙或超时）；
//     2. 响应带浏览器缓存，同一访客 30 分钟内只回源一次。
//
// 无状态、不需要绑定任何 KV / 环境变量，部署即可用。
//
// 数据源（按顺序尝试，任意一个成功即用）：
//   1. open.er-api.com        —— 免 key、覆盖 160+ 币种、实时
//   2. fawazahmed0 (jsDelivr) —— 免 key、覆盖 180+ 币种、每日更新
//   3. frankfurter.dev        —— 免 key、欧洲央行参考价、约 30 个主流币种
// 三家都返回「相对 USD」的汇率：value = 1 USD 可兑换多少该币种。

/** 单个上游源的超时时间（毫秒）。边缘节点网络很好，6 秒足够；卡住就换下一个源。 */
const UPSTREAM_TIMEOUT_MS = 6000;

/** 响应缓存时长（秒）。汇率一天一更新，30 分钟一刷足够，也避免每个访客都回源。 */
const CACHE_MAX_AGE_S = 30 * 60;

/** 归一化后的汇率快照 */
interface RatesSnapshot {
  base: string;
  date: string;
  rates: Record<string, number>;
  source: string;
}

/** 上游返回体里我们关心的形状（各源字段不同，统一先当成 unknown 再收窄） */
interface UpstreamPayload {
  result?: unknown;
  rates?: unknown;
  usd?: unknown;
  date?: unknown;
  time_last_update_unix?: unknown;
  time_last_update_utc?: unknown;
}

/** 从上游响应里挑出「相对 USD」的汇率表，挑不出来返回 null */
type RatesExtractor = (data: UpstreamPayload) => { rates: Record<string, number>; date?: string } | null;

/** 把任意结构收拾成「相对 USD、key 大写、数值有限」的汇率表，并强制带上 USD: 1 */
function toUsdRates(raw: unknown): Record<string, number> | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return null;
  }
  const rates: Record<string, number> = { USD: 1 };
  let count = 0;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      rates[key.toUpperCase()] = value;
      count += 1;
    }
  }
  // 只有 USD 一条说明上游返回了空壳，当失败处理，交给下一个源
  return count > 1 ? rates : null;
}

/** 取日期字符串，优先用上游给的时间，兜底用今天（UTC） */
function pickDate(data: UpstreamPayload): string {
  const raw = data.date ?? data.time_last_update_utc;
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }
  if (typeof raw === 'string') {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }
  const unix = data.time_last_update_unix;
  if (typeof unix === 'number' && Number.isFinite(unix)) {
    return new Date(unix * 1000).toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

/** open.er-api.com：{ result:'success', rates:{...}, time_last_update_unix } */
const extractErApi: RatesExtractor = (data) => {
  if (data.result !== 'success') {
    return null;
  }
  const rates = toUsdRates(data.rates);
  return rates ? { rates, date: pickDate(data) } : null;
};

/** fawazahmed0 (jsDelivr)：{ date:'2026-10-12', usd:{ eur:0.89, ... } } */
const extractFawazahmed: RatesExtractor = (data) => {
  const rates = toUsdRates(data.usd);
  return rates ? { rates, date: pickDate(data) } : null;
};

/** frankfurter.dev：{ base:'USD', date:'2026-10-12', rates:{ EUR:0.89, ... } }（不含 USD 自身） */
const extractFrankfurter: RatesExtractor = (data) => {
  const rates = toUsdRates(data.rates);
  return rates ? { rates, date: pickDate(data) } : null;
};

const UPSTREAMS: { name: string; url: string; extract: RatesExtractor }[] = [
  {
    name: 'open.er-api.com',
    url: 'https://open.er-api.com/v6/latest/USD',
    extract: extractErApi,
  },
  {
    name: 'fawazahmed0 (jsDelivr)',
    url: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json',
    extract: extractFawazahmed,
  },
  {
    name: 'frankfurter.dev',
    url: 'https://api.frankfurter.dev/v1/latest?from=USD',
    extract: extractFrankfurter,
  },
];

/** 带超时地抓一个源，失败返回 null */
async function tryUpstream(upstream: { name: string; url: string; extract: RatesExtractor }): Promise<RatesSnapshot | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(upstream.url, {
      signal: controller.signal,
      headers: { accept: 'application/json', 'user-agent': 'gjxtools-currency-converter' },
    });
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as UpstreamPayload;
    const picked = upstream.extract(data);
    if (!picked) {
      return null;
    }
    return { base: 'USD', date: picked.date ?? pickDate(data), rates: picked.rates, source: upstream.name };
  } catch {
    // 超时 / 网络错误 / JSON 解析失败，一律当作这个源挂了
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${CACHE_MAX_AGE_S}`,
      ...extraHeaders,
    },
  });
}

export async function onRequestGet(): Promise<Response> {
  for (const upstream of UPSTREAMS) {
    const snap = await tryUpstream(upstream);
    if (snap) {
      return json(snap);
    }
  }
  // 三个源全挂：返 502，前端收到后走内置备用汇率表并提示。
  // 这里故意只缓存 60 秒，方便上游恢复后尽快自动好起来。
  return json(
    { error: 'all upstream rate sources failed' },
    502,
    { 'cache-control': 'public, max-age=60' },
  );
}

// 只导出 onRequestGet：这个接口只读、不接受任何外部输入，非 GET 方法由平台自动回 405。
