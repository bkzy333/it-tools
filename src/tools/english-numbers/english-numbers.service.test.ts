import { describe, expect, it } from 'vitest';
import { englishToNumber, normalizeNumberInput, numberToEnglish } from './english-numbers.service';

describe('numberToEnglish', () => {
  it('整数', () => {
    expect(numberToEnglish(0)).toBe('zero');
    expect(numberToEnglish(1)).toBe('one');
    expect(numberToEnglish(21)).toBe('twenty-one');
    expect(numberToEnglish(100)).toBe('one hundred');
    expect(numberToEnglish(123)).toBe('one hundred twenty-three');
  });

  it('千位与逗号', () => {
    expect(numberToEnglish(1234)).toBe('one thousand, two hundred thirty-four');
    expect(numberToEnglish(1000000)).toBe('one million');
  });

  it('连字符关闭', () => {
    expect(numberToEnglish(21, { hyphenated: false })).toBe('twenty one');
  });

  it('小数', () => {
    expect(numberToEnglish(3.14)).toBe('three point one four');
  });

  it('负数', () => {
    expect(numberToEnglish(-5)).toBe('minus five');
  });
});

describe('englishToNumber', () => {
  it('基本', () => {
    expect(englishToNumber('one')).toBe('1');
    expect(englishToNumber('twenty-one')).toBe('21');
    expect(englishToNumber('one hundred twenty-three')).toBe('123');
  });

  it('千位', () => {
    expect(englishToNumber('one thousand, two hundred thirty-four')).toBe('1234');
    expect(englishToNumber('one million')).toBe('1000000');
  });

  it('and 可省略', () => {
    expect(englishToNumber('one hundred and twenty-three')).toBe('123');
  });

  it('小数', () => {
    expect(englishToNumber('three point one four')).toBe('3.14');
  });

  it('负数', () => {
    expect(englishToNumber('minus five')).toBe('-5');
  });
});

describe('normalizeNumberInput', () => {
  it('千分位逗号', () => {
    expect(normalizeNumberInput('1,234.5')).toBe('1234.5');
    expect(normalizeNumberInput('1,234,567')).toBe('1234567');
  });

  it('非标准分组不吞逗号（避免把 1,23 误当 123）', () => {
    expect(normalizeNumberInput('1,23')).toBe('1,23');
  });

  it('全角字符', () => {
    expect(normalizeNumberInput('１２３。５')).toBe('123.5');
  });

  it('数字中间空格与货币符号', () => {
    expect(normalizeNumberInput('1 234')).toBe('1234');
    expect(normalizeNumberInput('¥1,234')).toBe('1234');
  });

  it('原文已经是干净数字时不动它', () => {
    expect(normalizeNumberInput('-42')).toBe('-42');
    expect(normalizeNumberInput('3.14')).toBe('3.14');
  });

  it('脏输入依旧会让 numberToEnglish 报错（不静默改数）', () => {
    expect(() => numberToEnglish(normalizeNumberInput('12abc'))).toThrow();
    expect(() => numberToEnglish(normalizeNumberInput('1,23'))).toThrow();
  });
});
