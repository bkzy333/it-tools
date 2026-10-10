/**
 * 实时汇率换算服务层。
 *
 * 数据源（多源容灾，按顺序尝试，任意一个成功即用）：
 *   1. open.er-api.com  —— 免 key、CORS 放开（access-control-allow-origin: *）、覆盖 160+ 币种、
 *                          返回相对 USD 的汇率，标注「实时」。
 *   2. fawazahmed0/currency-api（经 jsDelivr CDN） —— 免 key、CORS 放开、覆盖 180+ 币种、每日更新。
 *   3. frankfurter.dev（欧洲央行参考价） —— 免 key、覆盖约 30 个主流币种、每日更新。
 *
 * 三家都返回「相对 USD 的汇率」：value = 1 USD 可兑换多少该币种，因此换算口径统一为
 *   usd = amount / rates[from]
 *   result = usd * rates[to]
 *   toFixed(4)
 * （与旧版 fxratesapi 口径一致，注释 + 单测双锁，别改回 6 位）
 *
 * 为什么不引 forex-python / node-openex：二者都是服务端/Node 包，而本工具是纯浏览器端页面，
 * 浏览器直接 fetch 公开接口即可，无需服务端依赖；若以后要上服务端代理，再单独评估。
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

/** 备用汇率表（全部数据源都失败时兜底，相对 USD，key 大写） */
export const FALLBACK_RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.85,
  GBP: 0.73,
  JPY: 110.0,
  CNY: 6.45,
  KRW: 1180.0,
  HKD: 7.78,
  CAD: 1.25,
  AUD: 1.35,
  CHF: 0.92,
  SGD: 1.33,
  INR: 83.0,
  RUB: 90.0,
  BRL: 5.0,
  MXN: 17.0,
  SEK: 10.5,
  NOK: 11.0,
  DKK: 6.9,
  NZD: 1.65,
  ZAR: 18.5,
  THB: 35.0,
  MYR: 4.7,
  IDR: 15500.0,
  PHP: 56.0,
  VND: 24000.0,
  TWD: 31.0,
  AED: 3.67,
  SAR: 3.75,
  TRY: 32.0,
  PLN: 4.0,
  CZK: 23.0,
  HUF: 360.0,
  ILS: 3.7,
  EGP: 48.0,
  NGN: 1500.0,
  PKR: 278.0,
  BDT: 110.0,
  LKR: 300.0,
  CLP: 950.0,
  COP: 4000.0,
  ISK: 138.0,
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

/** 数据源顺序：任意一个成功即用，全部失败才走备用表 */
const RATE_SOURCES: { name: string; fetch: () => Promise<RatesSnapshot | null> }[] = [
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
