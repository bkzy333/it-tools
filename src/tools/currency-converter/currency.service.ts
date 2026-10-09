/**
 * 实时汇率换算服务层。
 *
 * 数据源与参考站 https://www.bauniv.cn/currency-converter/ 一致：
 *   GET https://api.fxratesapi.com/latest
 * 该接口免 key、CORS 放开（`access-control-allow-origin: *`），返回
 *   { base:"USD", date, rates:{ USD:1, EUR:0.85, ... } }，key 为**大写** ISO 4217。
 *
 * 换算口径（与参考站 SOURCE 逐条一致）：
 *   usd = amount / rates[from]
 *   result = usd * rates[to]     —— 先归一化到 USD 再折到目标币，避免交叉汇率漂移
 *   toFixed(4)                    —— 参考站代码实际用 4 位，页面文案虽写「6 位精度」但实现是 4 位，
 *                                   我们按实现走（注释 + 单测双锁，别改成 6 位）
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
}

/** 数据源地址（真实，见 index.ts 的 externAccessDescription） */
export const RATES_ENDPOINT = 'https://api.fxratesapi.com/latest';

/** 参考站自带的备用汇率表（接口失败时兜底，与 bauniv SOURCE 一致，key 大写） */
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
};

/** 货币 → 国旗 emoji（参考站 SOURCE 的 currencyFlags 表） */
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
};

/** 汇率表默认展示的币种（参考站 SOURCE 的 rates-table 顺序） */
export const TABLE_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'KRW', 'HKD', 'CAD', 'AUD', 'CHF', 'SGD'];

/** 热门货币快捷按钮（参考站 SOURCE） */
export const POPULAR_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'KRW'];

/**
 * 抓取实时汇率。成功返回快照；失败返回 null（由调用方决定是否走备用表）。
 * 注意：接口 key 是小写友好（返回大写 key），这里统一 `toUpperCase()` 归一化，
 * 这样无论接口以后改大小写都能对齐。
 */
export async function fetchLiveRates(): Promise<RatesSnapshot | null> {
  try {
    const response = await fetch(RATES_ENDPOINT);
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as {
      base?: string;
      date?: string;
      rates?: Record<string, number>;
    };
    if (!data.rates || typeof data.rates !== 'object') {
      return null;
    }

    const rates: Record<string, number> = {};
    for (const [key, value] of Object.entries(data.rates)) {
      rates[key.toUpperCase()] = value;
    }

    return {
      base: (data.base || 'USD').toUpperCase(),
      date: data.date ?? new Date().toISOString().slice(0, 10),
      rates,
    };
  } catch {
    return null;
  }
}

/**
 * 换算金额：amount 个 from 币 → to 币。
 * 参考站 SOURCE 口径：先折 USD 再折目标币，`toFixed(4)`。
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
