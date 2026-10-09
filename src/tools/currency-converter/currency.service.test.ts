import { describe, expect, it } from 'vitest';
import { convert, FALLBACK_RATES } from './currency.service';

/**
 * 换算口径锁定：来自参考站 https://www.bauniv.cn/currency-converter/ 生产源码（SOURCE）。
 *   usd = amount / rates[from]
 *   result = usd * rates[to]
 *   toFixed(4)
 *
 * 注意：参考站页面文案写「6 位精度」，但实现是 toFixed(4)。我们按实现走，别改回 6 位。
 */
describe('currency.convert', () => {
  it('CNY→USD：100 元人民币按备用表 6.45 折算', () => {
    // 100 / 6.45 * 1 = 15.5038...
    expect(convert(100, 'CNY', 'USD', FALLBACK_RATES)).toBe(15.5039);
  });

  it('USD→CNY：1 美元 = 6.45 人民币', () => {
    expect(convert(1, 'USD', 'CNY', FALLBACK_RATES)).toBe(6.45);
  });

  it('交叉货币 USD→EUR：1 美元 = 0.85 欧元', () => {
    expect(convert(1, 'USD', 'EUR', FALLBACK_RATES)).toBe(0.85);
  });

  it('EUR→USD：先折回 USD 再折目标，1 欧元 = 1/0.85 美元', () => {
    expect(convert(1, 'EUR', 'USD', FALLBACK_RATES)).toBe(1.1765);
  });

  it('缺少汇率返回 null', () => {
    expect(convert(1, 'USD', 'XXX', FALLBACK_RATES)).toBeNull();
    expect(convert(1, 'XXX', 'USD', FALLBACK_RATES)).toBeNull();
  });

  it('金额非法（负数 / NaN / 无穷）返回 null', () => {
    expect(convert(-1, 'USD', 'CNY', FALLBACK_RATES)).toBeNull();
    expect(convert(Number.NaN, 'USD', 'CNY', FALLBACK_RATES)).toBeNull();
    expect(convert(Number.POSITIVE_INFINITY, 'USD', 'CNY', FALLBACK_RATES)).toBeNull();
  });

  it('金额为 0 返回 0', () => {
    expect(convert(0, 'USD', 'CNY', FALLBACK_RATES)).toBe(0);
  });

  it('币种大小写不敏感', () => {
    expect(convert(1, 'usd', 'cny', FALLBACK_RATES)).toBe(6.45);
  });
});
