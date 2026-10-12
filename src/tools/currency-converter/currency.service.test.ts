import { afterEach, describe, expect, it, vi } from 'vitest';
import { COMMON_CURRENCIES, FALLBACK_RATES, FALLBACK_RATES_DATE, convert, fetchLiveRates } from './currency.service';

/**
 * 换算口径锁定：来自参考站 https://www.bauniv.cn/currency-converter/ 生产源码（SOURCE）。
 *   usd = amount / rates[from]
 *   result = usd * rates[to]
 *   toFixed(4)
 *
 * 注意：参考站页面文案写「6 位精度」，但实现是 toFixed(4)。我们按实现走，别改回 6 位。
 *
 * 这里刻意用固定夹具 R 而不是 FALLBACK_RATES：备用汇率表是「某一时刻的真实快照」，
 * 会定期整体更新；公式测试不该跟着快照漂移，否则每次更新汇率都要改一堆断言。
 */
const R = { USD: 1, CNY: 6.45, EUR: 0.85, JPY: 110, GBP: 0.73 };

describe('currency.convert', () => {
  it('CNY→USD：100 元人民币按 6.45 折算', () => {
    // 100 / 6.45 * 1 = 15.5038...
    expect(convert(100, 'CNY', 'USD', R)).toBe(15.5039);
  });

  it('USD→CNY：1 美元 = 6.45 人民币', () => {
    expect(convert(1, 'USD', 'CNY', R)).toBe(6.45);
  });

  it('交叉货币 USD→EUR：1 美元 = 0.85 欧元', () => {
    expect(convert(1, 'USD', 'EUR', R)).toBe(0.85);
  });

  it('EUR→USD：先折回 USD 再折目标，1 欧元 = 1/0.85 美元', () => {
    expect(convert(1, 'EUR', 'USD', R)).toBe(1.1765);
  });

  it('缺少汇率返回 null', () => {
    expect(convert(1, 'USD', 'XXX', R)).toBeNull();
    expect(convert(1, 'XXX', 'USD', R)).toBeNull();
  });

  it('金额非法（负数 / NaN / 无穷）返回 null', () => {
    expect(convert(-1, 'USD', 'CNY', R)).toBeNull();
    expect(convert(Number.NaN, 'USD', 'CNY', R)).toBeNull();
    expect(convert(Number.POSITIVE_INFINITY, 'USD', 'CNY', R)).toBeNull();
  });

  it('金额为 0 返回 0', () => {
    expect(convert(0, 'USD', 'CNY', R)).toBe(0);
  });

  it('币种大小写不敏感', () => {
    expect(convert(1, 'usd', 'cny', R)).toBe(6.45);
  });

  it('交叉汇率 CNY→JPY 经由 USD 中转', () => {
    // 100 / 6.45 * 110 = 1705.4263...
    expect(convert(100, 'CNY', 'JPY', R)).toBe(1705.4264);
  });
});

/**
 * 备用汇率表是离线兜底，全站数据源都挂了才会用到。
 * 它不追求精准，但不能离谱——曾经 JPY=110、CNY=6.45 这类值放了两年，偏差大到一眼假。
 * 这里只锁「结构性正确」，具体数值随快照更新。
 */
describe('currency.FALLBACK_RATES', () => {
  it('快照日期格式正确（提醒维护者记得一起更新）', () => {
    expect(FALLBACK_RATES_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('USD 恒为 1（所有换算的基准）', () => {
    expect(FALLBACK_RATES.USD).toBe(1);
  });

  it('全部是正数且有限', () => {
    for (const [code, value] of Object.entries(FALLBACK_RATES)) {
      expect(Number.isFinite(value), code).toBe(true);
      expect(value, code).toBeGreaterThan(0);
    }
  });

  it('覆盖下拉框里所有可选币种，且 key 全大写', () => {
    for (const code of COMMON_CURRENCIES) {
      expect(FALLBACK_RATES[code], `备用表缺少 ${code}`).toBeTypeOf('number');
      expect(code).toBe(code.toUpperCase());
    }
  });
});

/**
 * 取数链路：线上唯一稳定的路径是同源的 /api/rates（浏览器直连第三方会被本站 CSP 拦掉）。
 * Cloudflare Pages 的 SPA 回退有个坑：未命中的路径也会返回 200 + index.html，
 * 只看 res.ok 会把一段 HTML 当汇率数据喂进去，所以这里锁死 content-type 校验。
 */
describe('currency.fetchLiveRates', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** 只放行 /api/rates 的桩，其它 URL 一律抛错（模拟 CSP 拦截 / 网络不可达） */
  function stubFetch(impl: (url: string) => Promise<unknown>) {
    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/rates')) {
        return impl(url);
      }
      throw new TypeError('blocked by CSP');
    });
  }

  it('/api/rates 返回正常 JSON 时命中代理，source 标注来源', async () => {
    stubFetch(async () => ({
      ok: true,
      headers: { get: () => 'application/json; charset=utf-8' },
      json: async () => ({
        base: 'USD',
        date: '2026-10-12',
        rates: { USD: 1, CNY: 6.7, JPY: 158.23 },
        source: 'open.er-api.com',
      }),
    }));

    const snap = await fetchLiveRates();
    expect(snap).not.toBeNull();
    expect(snap!.base).toBe('USD');
    expect(snap!.date).toBe('2026-10-12');
    expect(snap!.rates.CNY).toBe(6.7);
    expect(snap!.source).toContain('open.er-api.com');
  });

  it('SPA 回退返回 200 + HTML 时不能当成汇率数据（content-type 校验）', async () => {
    stubFetch(async () => ({
      ok: true,
      headers: { get: () => 'text/html' },
      // 如果是真 HTML，这里 await res.json() 会抛错；即使不抛也必须被 content-type 拦下
      json: async () => ({ rates: { USD: 1, CNY: 999 } }),
    }));

    // 剩下三个直连源在测试里都会抛错，所以期望整体取数失败（返回 null）
    expect(await fetchLiveRates()).toBeNull();
  });

  it('代理返回 502（上游全挂）时不误用响应体', async () => {
    stubFetch(async () => ({
      ok: false,
      status: 502,
      headers: { get: () => 'application/json' },
      json: async () => ({ error: 'all upstream rate sources failed' }),
    }));

    expect(await fetchLiveRates()).toBeNull();
  });

  it('全部源失败返回 null，由调用方决定走备用表', async () => {
    vi.stubGlobal('fetch', () => {
      throw new TypeError('blocked by CSP');
    });
    expect(await fetchLiveRates()).toBeNull();
  });
});
