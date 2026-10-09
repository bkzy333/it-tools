import { describe, expect, it } from 'vitest';
import { amountToEnglish } from './english-amount.service';

describe('amountToEnglish', () => {
  it('完整句式：美元', () => {
    expect(amountToEnglish(1234.56, { currencyCode: 'USD', fullForm: true })).toBe(
      'SAY US DOLLARS ONE THOUSAND, TWO HUNDRED THIRTY-FOUR DOLLARS AND FIFTY-SIX CENTS ONLY',
    );
  });

  it('简洁句式：用货币代码', () => {
    expect(amountToEnglish(100, { currencyCode: 'USD', fullForm: false })).toBe(
      'SAY USD ONE HUNDRED DOLLARS ONLY',
    );
  });

  it('整数无分', () => {
    expect(amountToEnglish(100, { currencyCode: 'USD' })).toBe('SAY US DOLLARS ONE HUNDRED DOLLARS ONLY');
  });

  it('人民币', () => {
    const r = amountToEnglish(1, { currencyCode: 'CNY' });
    expect(r).toContain('CHINESE YUAN');
    expect(r).toContain('ONE YUAN');
  });

  it('非法金额抛错', () => {
    expect(() => amountToEnglish('abc', { currencyCode: 'USD' })).toThrow();
  });
});
