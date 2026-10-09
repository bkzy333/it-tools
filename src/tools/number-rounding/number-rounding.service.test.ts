import { describe, expect, it } from 'vitest';
import {
  clampDigits,
  decimalToFraction,
  formatValue,
  fractionToDecimal,
  MAX_DIGITS,
  normalizeTextNumber,
  parseNumbers,
  roundTo,
  summarize,
  transformNumbers,
} from './number-rounding.service';

describe('roundTo 基础口径', () => {
  it('四舍五入：正负数 0.5 都远离零', () => {
    expect(roundTo(2.5, 0)).toBe(3);
    expect(roundTo(2.4, 0)).toBe(2);
    expect(roundTo(-2.5, 0)).toBe(-3); // Math.round(-2.5) 会给 -2，这里必须是对的那条
    expect(roundTo(-2.4, 0)).toBe(-2);
  });

  it('四舍五入：保留 2 位', () => {
    expect(roundTo(3.14159, 2)).toBe(3.14);
    expect(roundTo(1.005, 2)).toBe(1.01); // 2.675/1.005 这类经典浮点坑
    expect(roundTo(2.675, 2)).toBe(2.68);
  });

  it('四舍五入：保留 2 位时不能出现 -0', () => {
    expect(roundTo(-0.001, 2)).toBe(0);
    expect(Object.is(roundTo(-0.001, 2), -0)).toBe(false);
  });

  it('非有限数返回 NaN，不抛错', () => {
    expect(roundTo(NaN, 2)).toBeNaN();
    expect(roundTo(Infinity, 2)).toBeNaN();
  });
});

describe('roundTo 四种模式', () => {
  it('向上进位 ceil 朝正无穷', () => {
    expect(roundTo(2.001, 2, 'ceil')).toBe(2.01);
    expect(roundTo(-2.001, 2, 'ceil')).toBe(-2); // -2.001 进位到 -2（不是 -2.01）
  });

  it('向下舍去 floor 朝负无穷', () => {
    expect(roundTo(2.009, 2, 'floor')).toBe(2);
    expect(roundTo(-2.009, 2, 'floor')).toBe(-2.01);
  });

  it('直接截断 truncate 朝零', () => {
    expect(roundTo(2.009, 2, 'truncate')).toBe(2);
    expect(roundTo(-2.009, 2, 'truncate')).toBe(-2); // 和 floor 的区别就在这里
    expect(roundTo(-2.999, 2, 'truncate')).toBe(-2.99); // 截断到 2 位，不是取整到 -2
    expect(roundTo(-2.009, 2, 'truncate')).toBe(-2);
  });

  it('银行家舍入 half-even：半值向偶数靠', () => {
    expect(roundTo(2.5, 0, 'half-even')).toBe(2);
    expect(roundTo(3.5, 0, 'half-even')).toBe(4);
    expect(roundTo(-2.5, 0, 'half-even')).toBe(-2);
    expect(roundTo(2.4, 0, 'half-even')).toBe(2);
    expect(roundTo(2.6, 0, 'half-even')).toBe(3);
  });
});

describe('clampDigits / MAX_DIGITS', () => {
  it('夹在 0..MAX_DIGITS 的整数', () => {
    expect(clampDigits(-3)).toBe(0);
    expect(clampDigits(2.7)).toBe(2);
    expect(clampDigits(99)).toBe(MAX_DIGITS);
    expect(clampDigits(Number.NaN)).toBe(0);
  });
});

describe('parseNumbers', () => {
  it('每行一个数字', () => {
    const r = parseNumbers('19.99\n3.145\n\n  100  ');
    expect(r.values).toEqual([19.99, 3.145, 100]);
    expect(r.invalidCount).toBe(0);
  });

  it('逗号 / 空格 / 全角逗号分隔', () => {
    const r = parseNumbers('1, 2 3，4');
    expect(r.values).toEqual([1, 2, 3, 4]);
  });

  it('千分位单值不当分隔符', () => {
    expect(parseNumbers('1,234').values).toEqual([1234]);
    expect(parseNumbers('1,234,567.89').values).toEqual([1234567.89]);
  });

  it('「1,234」这种歧义按千分位处理（先出现的规则），「1,23」按分隔符', () => {
    expect(parseNumbers('1,234').values).toEqual([1234]);
    expect(parseNumbers('1,23').values).toEqual([1, 23]);
  });

  it('非法片段单独标记，不拖垮其它行', () => {
    const r = parseNumbers('12\nabc\n3.5');
    expect(r.values).toEqual([12, 3.5]);
    expect(r.invalidCount).toBe(1);
    expect(r.cells[1]).toEqual({ value: null, raw: 'abc', invalid: true });
  });

  it('空输入不炸', () => {
    expect(parseNumbers('').values).toEqual([]);
    expect(parseNumbers('   ').values).toEqual([]);
  });
});

describe('transformNumbers', () => {
  const base = { digits: 2, mode: 'half-up' as const };

  it('op=none 只舍入', () => {
    expect(transformNumbers([1.005, 2.675], { ...base, op: 'none', operand: 0 }).map((r) => r.output))
      .toEqual([1.01, 2.68]);
  });

  it('批量运算后再舍入（Excel ROUND(A1*1.1,2) 的顺序）', () => {
    expect(transformNumbers([1.234, 2.345], { ...base, op: 'multiply', operand: 1.1 }).map((r) => r.output))
      .toEqual([1.36, 2.58]);
    expect(transformNumbers([10, 20], { ...base, op: 'divide', operand: 3 }).map((r) => r.output))
      .toEqual([3.33, 6.67]);
  });

  it('除数为 0：保留原值并打标记，不产生 Infinity', () => {
    const rows = transformNumbers([10, 20], { ...base, op: 'divide', operand: 0 });
    expect(rows.map((r) => r.note)).toEqual(['divide-by-zero', 'divide-by-zero']);
    expect(rows.map((r) => r.output)).toEqual([10, 20]);
  });

  it('空列表返回空数组', () => {
    expect(transformNumbers([], { ...base, op: 'add', operand: 1 })).toEqual([]);
  });
});

describe('summarize', () => {
  it('统计全部字段', () => {
    expect(summarize([1, 2, 3, 4])).toEqual({ count: 4, sum: 10, avg: 2.5, min: 1, max: 4 });
  });

  it('空列表返回 NaN 而不抛错', () => {
    const s = summarize([]);
    expect(s.count).toBe(0);
    expect(s.avg).toBeNaN();
  });
});

describe('formatValue', () => {
  it('按位数输出最短准确表示', () => {
    expect(formatValue(2.68, 2)).toBe('2.68');
    expect(formatValue(3, 0)).toBe('3');
    expect(formatValue(1.5, 2)).toBe('1.5');
  });

  it('非法值显示破折号', () => {
    expect(formatValue(NaN, 2)).toBe('—');
  });
});

describe('decimalToFraction (A3 折入)', () => {
  it('有限小数约分', () => {
    expect(decimalToFraction(0.75)?.display).toBe('3/4');
    expect(decimalToFraction(0.5)?.display).toBe('1/2');
    expect(decimalToFraction(0.2)?.display).toBe('1/5');
  });
  it('带整数', () => {
    expect(decimalToFraction(1.5)?.display).toBe('1 1/2');
    expect(decimalToFraction(2.25)?.display).toBe('2 1/4');
  });
  it('负数与整数', () => {
    expect(decimalToFraction(-0.2)?.display).toBe('-1/5');
    expect(decimalToFraction(5)?.display).toBe('5');
  });
  it('非有限数返回 null', () => {
    expect(decimalToFraction(NaN)).toBeNull();
    expect(decimalToFraction(Infinity)).toBeNull();
  });
});

describe('fractionToDecimal (A3 折入)', () => {
  it('整除与除不尽', () => {
    expect(fractionToDecimal(3, 4)).toBe(0.75);
    expect(fractionToDecimal(1, 3)).toBeCloseTo(0.333333, 5);
  });
  it('分母为 0 返回 null', () => {
    expect(fractionToDecimal(1, 0)).toBeNull();
  });
});

describe('normalizeTextNumber (A3 折入)', () => {
  it('去前导零', () => {
    expect(normalizeTextNumber('007', 0)).toBe('7');
    expect(normalizeTextNumber('00', 0)).toBe('0');
    expect(normalizeTextNumber('-007', 0)).toBe('-7');
  });
  it('去千分位逗号', () => {
    expect(normalizeTextNumber('1,234.5', 0)).toBe('1234.5');
    expect(normalizeTextNumber('1,234,567', 0)).toBe('1234567');
  });
  it('补尾零到 N 位', () => {
    expect(normalizeTextNumber('7', 2)).toBe('7.00');
    expect(normalizeTextNumber('1,234.5', 2)).toBe('1234.50');
  });
  it('非数字原样保留', () => {
    expect(normalizeTextNumber('abc', 0)).toBe('abc');
  });
});
