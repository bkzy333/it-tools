import { describe, expect, it } from 'vitest';
import { aggregate, formatNumber, toNumber, toText, unpivot } from './table-pivot.service';

/**
 * 源表（第一行是表头）
 *  区域  销售  金额  日期
 *  华东  张三  120   1
 *  华东  李四  80    2
 *  华南  张三  95    1
 *  华东  张三  100   3   ← 华东·张三 出现两次
 */
const SRC: string[][] = [
  ['区域', '销售', '金额', '日期'],
  ['华东', '张三', '120', '1'],
  ['华东', '李四', '80', '2'],
  ['华南', '张三', '95', '1'],
  ['华东', '张三', '100', '3'],
];

describe('toNumber / formatNumber', () => {
  it('认千分位与货币符号，认空', () => {
    expect(toNumber('1,234.5')).toBe(1234.5);
    expect(toNumber('¥99')).toBe(99);
    expect(toNumber('')).toBeNull();
    expect(toNumber('  ')).toBeNull();
    expect(toNumber('abc')).toBeNull();
    expect(toNumber('2026-10-07')).toBeNull();
  });

  it('整数不带小数点，小数最多 4 位', () => {
    expect(formatNumber(120)).toBe('120');
    expect(formatNumber(120.5)).toBe('120.5');
    expect(formatNumber(1 / 3)).toBe('0.3333');
    expect(formatNumber(null)).toBe('');
  });
});

describe('aggregate 分组汇总', () => {
  it('按单列求和，分组顺序保持首次出现（华东在前，不是字母序）', () => {
    const r = aggregate(SRC, [0], [{ col: 2, agg: 'sum' }], true);
    expect(r.header).toEqual(['区域', '金额·sum']);
    expect(r.rows).toEqual([
      ['华东', '300'],
      ['华南', '95'],
    ]);
    expect(r.dataRows).toBe(4);
  });

  it('多列分组（区域 + 销售）', () => {
    const r = aggregate(SRC, [0, 1], [{ col: 2, agg: 'sum' }], true);
    expect(r.rows).toEqual([
      ['华东', '张三', '220'],
      ['华东', '李四', '80'],
      ['华南', '张三', '95'],
    ]);
  });

  it('平均值按数字单元格算，非数字忽略', () => {
    const r = aggregate([['组', '值'], ['A', '10'], ['A', '20'], ['A', 'abc']], [0], [{ col: 1, agg: 'avg' }], true);
    expect(r.rows).toEqual([['A', '15']]);
  });

  it('浮点尾巴被抹平（0.1+0.2 不该显示成 0.30000000000000004）', () => {
    const r = aggregate([['组', '值'], ['A', '0.1'], ['A', '0.2'], ['A', '0.3']], [0], [{ col: 1, agg: 'sum' }], true);
    expect(r.rows[0][1]).toBe('0.6');
  });

  it('最值与中位数（奇数/偶数）', () => {
    const odd = aggregate([['组', '值'], ['A', '1'], ['A', '3'], ['A', '5']], [0], [{ col: 1, agg: 'median' }], true);
    expect(odd.rows[0][1]).toBe('3');
    const even = aggregate([['组', '值'], ['A', '1'], ['A', '2'], ['A', '3'], ['A', '4']], [0], [{ col: 1, agg: 'median' }], true);
    expect(even.rows[0][1]).toBe('2.5');
    const mx = aggregate(SRC, [0], [{ col: 2, agg: 'max' }, { col: 2, agg: 'min' }], true);
    expect(mx.rows[0]).toEqual(['华东', '120', '80']);
  });

  it('count 数非空单元格，distinct 数不同值', () => {
    const r = aggregate(
      [['组', '销售', '金额'], ['A', '张三', '1'], ['A', '张三', ''], ['A', '', '2']],
      [0],
      [
        { col: 1, agg: 'count' },
        { col: 1, agg: 'distinct' },
      ],
      true,
    );
    expect(r.rows[0][1]).toBe('2'); // 张三 / 张三 / 空 → 非空 2 个
    expect(r.rows[0][2]).toBe('1'); // 不同值 1 个
  });

  it('整组没有可算的数字时输出空串而不是 NaN', () => {
    const r = aggregate([['组', '值'], ['A', 'abc'], ['A', 'xyz']], [0], [{ col: 1, agg: 'sum' }], true);
    expect(r.rows[0][1]).toBe('');
  });

  it('表头行开关生效：headerRow=false 时第一行也当数据', () => {
    const withHead = aggregate(SRC, [0], [{ col: 2, agg: 'sum' }], true);
    const noHead = aggregate(SRC, [0], [{ col: 2, agg: 'sum' }], false);
    expect(withHead.dataRows).toBe(4);
    expect(noHead.dataRows).toBe(5);
    expect(noHead.rows).toHaveLength(3); // 多出「区域 金额」这一组
  });

  it('空表头兜底成「列N」', () => {
    const r = aggregate([['', ''], ['A', '1']], [0], [{ col: 1, agg: 'count' }], true);
    expect(r.header[0]).toBe('列1');
  });

  it('没有分组列时退化为整表聚合', () => {
    const r = aggregate(SRC, [], [{ col: 2, agg: 'sum' }], true);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0][0]).toBe('395');
  });
});

describe('unpivot 反透视', () => {
  const WIDE: string[][] = [
    ['日期', '渠道', '曝光', '点击'],
    ['1/1', '天猫', '1000', '50'],
    ['1/1', '京东', '800', '30'],
  ];

  it('把宽表的多个指标拆成「指标/值」两列，id 列原样保留', () => {
    const r = unpivot(WIDE, [0, 1], [2, 3], true);
    expect(r.header).toEqual(['日期', '渠道', '指标', '值']);
    expect(r.rows).toEqual([
      ['1/1', '天猫', '曝光', '1000'],
      ['1/1', '天猫', '点击', '50'],
      ['1/1', '京东', '曝光', '800'],
      ['1/1', '京东', '点击', '30'],
    ]);
  });

  it('输出能直接粘回 Excel（tab 分隔）', () => {
    const r = unpivot(WIDE, [0], [2, 3], true);
    expect(toText([r.header, ...r.rows])).toBe(
      ['日期\t指标\t值', '1/1\t曝光\t1000', '1/1\t点击\t50', '1/1\t曝光\t800', '1/1\t点击\t30'].join('\n'),
    );
  });

  it('表头行=false 时把第一行也当数据（没有表头名可用，指标列沿用占位列的首行值）', () => {
    const r = unpivot([['k', 'v'], ['a', '10'], ['b', '20']], [0], [1], false);
    expect(r.rows).toEqual([
      ['k', 'v', 'v'],
      ['a', 'v', '10'],
      ['b', 'v', '20'],
    ]);
  });
});
