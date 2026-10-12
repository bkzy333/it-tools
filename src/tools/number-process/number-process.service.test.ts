import { describe, expect, it } from 'vitest';
import { processNumbers } from './number-process.service';

describe('number-process: 添加/移除千分位', () => {
  it('添加千分位（默认逗号）', () => {
    const r = processNumbers('120943423.4567', { op: 'addThousands' });
    expect(r.lines[0].value).toBe('120,943,423.4567');
  });

  it('添加千分位支持负数', () => {
    const r = processNumbers('-120943423.4567', { op: 'addThousands' });
    expect(r.lines[0].value).toBe('-120,943,423.4567');
  });

  it('添加千分位 + 精度', () => {
    const r = processNumbers('120943423.456789', { op: 'addThousands', precision: 2 });
    expect(r.lines[0].value).toBe('120,943,423.46');
  });

  it('自定义千分位字符', () => {
    const r = processNumbers('120943423', { op: 'addThousands', thousandsSep: ' ' });
    expect(r.lines[0].value).toBe('120 943 423');
  });

  it('移除千分位', () => {
    const r = processNumbers('120,943,423.4567', { op: 'removeThousands' });
    expect(r.lines[0].value).toBe('120943423.4567');
  });

  it('移除千分位 + 精度', () => {
    const r = processNumbers('120,943,423.4567', { op: 'removeThousands', precision: 0 });
    expect(r.lines[0].value).toBe('120943423');
  });
});

describe('number-process: 科学计数法互转', () => {
  it('转为科学计数法', () => {
    const r = processNumbers('120943423.4567', { op: 'toScientific' });
    expect(r.lines[0].value).toBe('1.209434234567e+8');
  });

  it('转为科学计数法 + 精度', () => {
    const r = processNumbers('120943423.4567', { op: 'toScientific', precision: 3 });
    expect(r.lines[0].value).toBe('1.209e+8');
  });

  it('科学计数法转普通数字', () => {
    const r = processNumbers('1.209434234567e+8', { op: 'fromScientific' });
    expect(r.lines[0].value).toBe('120943423.4567');
  });

  it('科学计数法转普通数字 + 精度', () => {
    const r = processNumbers('1.209434234567e+8', { op: 'fromScientific', precision: 2 });
    expect(r.lines[0].value).toBe('120943423.46');
  });
});

describe('number-process: 英文/中文 大写', () => {
  it('转为英文大写数字', () => {
    const r = processNumbers('123', { op: 'toEnglish' });
    expect(r.lines[0].value).toBe('one hundred twenty-three');
  });

  it('转为英文金额大写（美分表达）', () => {
    const r = processNumbers('123.68', { op: 'toEnglishAmount' });
    expect(r.lines[0].value).toBe('SAY US DOLLARS ONE HUNDRED TWENTY-THREE DOLLARS AND SIXTY-EIGHT CENTS ONLY');
  });

  it('英文金额大写仅支持单值', () => {
    const r = processNumbers('123.68\n456.00', { op: 'toEnglishAmount' });
    expect(r.lines).toHaveLength(1);
    expect(r.warnings.some((w) => w.includes('单个数字'))).toBe(true);
  });

  it('英文金额大写不支持负数', () => {
    const r = processNumbers('-123.68', { op: 'toEnglishAmount' });
    expect(r.lines[0].ok).toBe(false);
  });

  it('转为中文金额大写', () => {
    const r = processNumbers('1314.52', { op: 'toChineseAmount' });
    expect(r.lines[0].value).toBe('壹仟叁佰壹拾肆元伍角贰分');
  });
});

describe('number-process: 罗马数字互转', () => {
  it('数字转罗马', () => {
    const r = processNumbers('3999', { op: 'toRoman' });
    expect(r.lines[0].value).toBe('MMMCMXCIX');
  });

  it('罗马转数字', () => {
    const r = processNumbers('MMMCMXCIX', { op: 'fromRoman' });
    expect(r.lines[0].value).toBe('3999');
  });

  it('罗马往返一致', () => {
    const fwd = processNumbers('1987', { op: 'toRoman' }).lines[0].value;
    const back = processNumbers(fwd, { op: 'fromRoman' }).lines[0].value;
    expect(back).toBe('1987');
  });

  it('数字转罗马(Unicode)', () => {
    const r = processNumbers('8', { op: 'toRomanUnicode' });
    expect(r.lines[0].value).toBe('ⅤⅠⅠⅠ');
  });

  it('罗马(Unicode)转数字往返一致', () => {
    const fwd = processNumbers('1987', { op: 'toRomanUnicode' }).lines[0].value;
    const back = processNumbers(fwd, { op: 'fromRomanUnicode' }).lines[0].value;
    expect(back).toBe('1987');
  });

  it('罗马超范围报错', () => {
    const r = processNumbers('4000', { op: 'toRoman' });
    expect(r.lines[0].ok).toBe(false);
  });
});

describe('number-process: 批量与异常', () => {
  it('批量逐行处理保持行数', () => {
    const r = processNumbers('123\n456\n789', { op: 'toRoman' });
    expect(r.lines.map((l) => l.value)).toEqual(['CXXIII', 'CDLVI', 'DCCLXXXIX']);
  });

  it('非法行保留原值并记警告', () => {
    const r = processNumbers('123\nabc', { op: 'toRoman' });
    expect(r.lines[1].value).toBe('abc');
    expect(r.lines[1].ok).toBe(false);
    expect(r.warnings.length).toBe(1);
  });

  it('空行原样保留', () => {
    const r = processNumbers('123\n\n456', { op: 'toRoman' });
    expect(r.lines).toHaveLength(3);
    expect(r.lines[1].value).toBe('');
  });
});
