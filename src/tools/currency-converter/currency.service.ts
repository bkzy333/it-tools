/**
 * 实时汇率换算服务层。
 *
 * 取数顺序（多源容灾，任意一个成功即用）：
 *   0. /api/rates（本站 Cloudflare Pages Functions）—— **首选**。
 *      为什么必须先走自家接口：本站 CSP 的 connect-src 只放行自家域 + AdSense，
 *      浏览器直连第三方汇率接口会被 CSP 拦掉（fetch 直接抛 TypeError），
 *      页面就会一直显示「获取实时汇率失败，当前展示的是内置参考汇率」。
 *      走同源的 /api/rates 不受 CSP 限制，且请求由 Cloudflare 边缘发出，
 *      对国内访客比直连 jsDelivr / er-api 稳得多（后者在国内经常被墙或超时）。
 *      实现见 functions/api/rates.ts。
 *   1. open.er-api.com  —— 免 key、CORS 放开（access-control-allow-origin: *）、覆盖 160+ 币种。
 *   2. fawazahmed0/currency-api（经 jsDelivr CDN） —— 免 key、CORS 放开、覆盖 180+ 币种、每日更新。
 *   3. frankfurter.dev（欧洲央行参考价） —— 免 key、覆盖约 30 个主流币种、每日更新。
 *      （1~3 是直连兜底：CSP 里已放行这三个域，本地开发 / CSP 后续放宽时都能直接取到）
 *
 * 三家都返回「相对 USD 的汇率」：value = 1 USD 可兑换多少该币种，因此换算口径统一为
 *   usd = amount / rates[from]
 *   result = usd * rates[to]
 *   toFixed(4)
 * （与旧版 fxratesapi 口径一致，注释 + 单测双锁，别改回 6 位）
 *
 * 为什么不引 forex-python / node-openex：二者都是服务端/Node 包，而本工具是纯浏览器端页面，
 * 浏览器直接 fetch 公开接口即可，无需服务端依赖；服务端取数由 /api/rates 承担。
 */

/** 单次换算结果 */
export interface ConversionResult {
  from: string;
  to: string;
  amount: number;
  result: number;
}

/** 汇率快照 */
export interface RatesSnapshot {
  base: string;
  date: string;
  rates: Record<string, number>;
  /** 命中的数据源名（用于状态栏提示） */
  source: string;
}

/**
 * 备用汇率表（全部数据源都失败时兜底，相对 USD，key 大写）。
 *
 * 数据取自 open.er-api.com 的 2026-10-12 快照（time_last_update_utc: Mon, 12 Oct 2026 00:02:32 +0000）。
 * 注意：这是**离线兜底快照**，会随时间失真。更新时请重新抓一份真实汇率整体替换，
 * 不要凭印象改单个数字；同时把下面 FALLBACK_RATES_DATE 一起改成新的快照日期。
 */
export const FALLBACK_RATES_DATE = '2026-10-12';

export const FALLBACK_RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.892629,
  GBP: 0.755605,
  JPY: 158.230103,
  CNY: 6.700304,
  KRW: 1340.705374,
  HKD: 7.848048,
  CAD: 1.425643,
  AUD: 1.431802,
  CHF: 0.83034,
  SGD: 1.280746,
  INR: 96.964336,
  RUB: 85.028588,
  BRL: 4.995947,
  MXN: 18.406744,
  SEK: 9.994696,
  NOK: 9.558294,
  DKK: 6.671516,
  NZD: 1.781769,
  ZAR: 16.513783,
  THB: 33.534124,
  MYR: 4.085026,
  IDR: 17893.303251,
  PHP: 62.826658,
  VND: 25886.362178,
  TWD: 31.96443,
  AED: 3.6725,
  SAR: 3.75,
  TRY: 49.337486,
  PLN: 3.915129,
  CZK: 21.771052,
  HUF: 326.067,
  ILS: 3.07378,
  EGP: 52.502776,
  NGN: 1330.171897,
  PKR: 277.205784,
  BDT: 123.140839,
  LKR: 330.545387,
  CLP: 979.008503,
  COP: 3206.933418,
  ISK: 122.080177,
};

/** 货币 → 国旗 emoji（覆盖常用可兑换币种） */
export const CURRENCY_FLAGS: Record<string, string> = {
  USD: '🇺🇸',
  EUR: '🇪🇺',
  GBP: '🇬🇧',
  JPY: '🇯🇵',
  CNY: '🇨🇳',
  KRW: '🇰🇷',
  HKD: '🇭🇰',
  CAD: '🇨🇦',
  AUD: '🇦🇺',
  CHF: '🇨🇭',
  SGD: '🇸🇬',
  INR: '🇮🇳',
  RUB: '🇷🇺',
  BRL: '🇧🇷',
  MXN: '🇲🇽',
  SEK: '🇸🇪',
  NOK: '🇳🇴',
  DKK: '🇩🇰',
  NZD: '🇳🇿',
  ZAR: '🇿🇦',
  THB: '🇹🇭',
  MYR: '🇲🇾',
  IDR: '🇮🇩',
  PHP: '🇵🇭',
  VND: '🇻🇳',
  TWD: '🇹🇼',
  AED: '🇦🇪',
  SAR: '🇸🇦',
  TRY: '🇹🇷',
  PLN: '🇵🇱',
  CZK: '🇨🇿',
  HUF: '🇭🇺',
  ILS: '🇮🇱',
  EGP: '🇪🇬',
  NGN: '🇳🇬',
  PKR: '🇵🇰',
  BDT: '🇧🇩',
  LKR: '🇱🇰',
  CLP: '🇨🇱',
  COP: '🇨🇴',
  ISK: '🇮🇸',
};

/** 货币 → 中文名（覆盖常用币种；缺失时退回英文名） */
export const CURRENCY_NAMES_ZH: Record<string, string> = {
  USD: '美元',
  EUR: '欧元',
  GBP: '英镑',
  JPY: '日元',
  CNY: '人民币',
  KRW: '韩元',
  HKD: '港币',
  CAD: '加元',
  AUD: '澳元',
  CHF: '瑞郎',
  SGD: '新元',
  INR: '印度卢比',
  RUB: '卢布',
  BRL: '巴西雷亚尔',
  MXN: '墨西哥比索',
  SEK: '瑞典克朗',
  NOK: '挪威克朗',
  DKK: '丹麦克朗',
  NZD: '新西兰元',
  ZAR: '南非兰特',
  THB: '泰铢',
  MYR: '马来西亚林吉特',
  IDR: '印尼盾',
  PHP: '菲律宾比索',
  VND: '越南盾',
  TWD: '新台币',
  AED: '阿联酋迪拉姆',
  SAR: '沙特里亚尔',
  TRY: '土耳其里拉',
  PLN: '波兰兹罗提',
  CZK: '捷克克朗',
  HUF: '匈牙利福林',
  ILS: '以色列新谢克尔',
  EGP: '埃及镑',
  NGN: '尼日利亚奈拉',
  PKR: '巴基斯坦卢比',
  BDT: '孟加拉塔卡',
  LKR: '斯里兰卡卢比',
  CLP: '智利比索',
  COP: '哥伦比亚比索',
  ISK: '冰岛克朗',
};

/** 实时汇率表默认展示的币种（主流 11 种） */
export const TABLE_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'KRW', 'HKD', 'CAD', 'AUD', 'CHF', 'SGD'];

/** 下拉框可选择的货币（覆盖常见 41 种，均被上述数据源支持） */
export const COMMON_CURRENCIES = Object.keys(CURRENCY_FLAGS);

/** 热门货币快捷按钮 */
export const POPULAR_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'KRW'];

/* ---------------------------------------------------------------- 数据源 */

/** 归一化：把任意返回结构收拾成「相对 USD、key 大写」的汇率表 */
function toUsdRates(raw: Record<string, number>): Record<string, number> {
  const rates: Record<string, number> = { USD: 1 };
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      rates[key.toUpperCase()] = value;
    }
  }
  return rates;
}

/** 数据源 1：open.er-api.com（实时、CORS 放开、160+ 币种） */
async function fetchFromErApi(): Promise<RatesSnapshot | null> {
  const res = await fetch('https://open.er-api.com/v6/latest/USD');
  if (!res.ok) {
    return null;
  }
  const data = (await res.json()) as { result?: string; rates?: Record<string, number>; time_last_update_unix?: number };
  if (data.result !== 'success' || !data.rates) {
    return null;
  }
  const date = data.time_last_update_unix
    ? new Date(data.time_last_update_unix * 1000).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  return { base: 'USD', date, rates: toUsdRates(data.rates), source: 'open.er-api.com' };
}

/** 数据源 2：fawazahmed0/currency-api（经 jsDelivr CDN，每日更新、180+ 币种） */
async function fetchFromFawazahmed(): Promise<RatesSnapshot | null> {
  const res = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json');
  if (!res.ok) {
    return null;
  }
  const data = (await res.json()) as { date?: string; usd?: Record<string, number> };
  if (!data.usd || typeof data.usd !== 'object') {
    return null;
  }
  return {
    base: 'USD',
    date: data.date ?? new Date().toISOString().slice(0, 10),
    rates: toUsdRates(data.usd),
    source: 'fawazahmed0 (jsDelivr)',
  };
}

/** 数据源 3：frankfurter.dev（欧洲央行参考价，每日更新、约 30 主流币种） */
async function fetchFromFrankfurter(): Promise<RatesSnapshot | null> {
  const res = await fetch('https://api.frankfurter.dev/v1/latest?from=USD');
  if (!res.ok) {
    return null;
  }
  const data = (await res.json()) as { rates?: Record<string, number>; date?: string };
  if (!data.rates) {
    return null;
  }
  return {
    base: 'USD',
    date: data.date ?? new Date().toISOString().slice(0, 10),
    rates: toUsdRates(data.rates),
    source: 'frankfurter.dev',
  };
}

/**
 * 数据源 0（首选）：本站 /api/rates。
 *
 * 这是同源请求，不受 CSP 限制，是线上唯一稳定可用的取数路径。
 * 注意必须校验 content-type：Pages 的 SPA 回退会让任何未命中的路径都返回 200 + index.html，
 * 只看 res.ok 会把一段 HTML 当成汇率数据喂进去（然后 JSON 解析报错、静默走备用表）。
 */
async function fetchFromOwnApi(): Promise<RatesSnapshot | null> {
  const res = await fetch('/api/rates', { headers: { accept: 'application/json' } });
  if (!res.ok) {
    return null;
  }
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return null;
  }
  const data = (await res.json()) as { base?: string; date?: string; rates?: Record<string, number>; source?: string };
  if (!data.rates || typeof data.rates !== 'object') {
    return null;
  }
  const rates = toUsdRates(data.rates);
  if (Object.keys(rates).length <= 1) {
    return null;
  }
  return {
    base: 'USD',
    date: data.date ?? new Date().toISOString().slice(0, 10),
    rates,
    // 走代理时上游源名由 Functions 返回，标注一下是经过本站代理，方便排障
    source: data.source ? `${data.source}（经本站代理）` : '本站代理',
  };
}

/** 数据源顺序：任意一个成功即用，全部失败才走备用表 */
const RATE_SOURCES: { name: string; fetch: () => Promise<RatesSnapshot | null> }[] = [
  { name: '/api/rates', fetch: fetchFromOwnApi },
  { name: 'open.er-api.com', fetch: fetchFromErApi },
  { name: 'fawazahmed0 (jsDelivr)', fetch: fetchFromFawazahmed },
  { name: 'frankfurter.dev', fetch: fetchFromFrankfurter },
];

/**
 * 抓取实时汇率。成功返回快照（含命中的 source）；失败返回 null（由调用方决定是否走备用表）。
 */
export async function fetchLiveRates(): Promise<RatesSnapshot | null> {
  for (const src of RATE_SOURCES) {
    try {
      const snap = await src.fetch();
      if (snap && Object.keys(snap.rates).length > 1) {
        return snap;
      }
    } catch {
      // 该源失败，尝试下一个
    }
  }
  return null;
}

/**
 * 换算金额：amount 个 from 币 → to 币。
 * 口径：先折 USD 再折目标币，`toFixed(4)`。
 */
export function convert(amount: number, from: string, to: string, rates: Record<string, number>): number | null {
  const fromRate = rates[from.toUpperCase()];
  const toRate = rates[to.toUpperCase()];

  if (!fromRate || !toRate) {
    return null;
  }
  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  const usdAmount = amount / fromRate;
  const result = usdAmount * toRate;

  return Number(result.toFixed(4));
}
