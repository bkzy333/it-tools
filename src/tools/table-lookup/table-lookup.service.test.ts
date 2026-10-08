import { describe, expect, it } from 'vitest';
import { columnValues, lookup, matches, mergeTables, normalizeCell } from './table-lookup.service';

/**
 * 源表（第一行是表头）
 *  学号   姓名   部门   城市   金额
 *  1001   张三   销售   上海   120
 *  1002   李四   销售   北京   80
 *  1003   王五   财务   上海   95
 *  1001   张三   销售   上海   300   ← 学号重复，用来验「一对多」
 */
const SRC: string[][] = [
  ['学号', '姓名', '部门', '城市', '金额'],
  ['1001', '张三', '销售', '上海', '120'],
  ['1002', '李四', '销售', '北京', '80'],
  ['1003', '王五', '财务', '上海', '95'],
  ['1001', '张三', '销售', '上海', '300'],
];

describe('normalizeCell / matches', () => {
  it('去空白、null 转空串', () => {
    expect(normalizeCell('  张三 ')).toBe('张三');
    expect(normalizeCell(null)).toBe('');
    expect(normalizeCell(undefined)).toBe('');
  });

  it('精确匹配区分空格', () => {
    expect(matches(' 张三 ', '张三', 'exact')).toBe(true);
    expect(matches('张三丰', '张三', 'exact')).toBe(false);
  });

  it('包含 / 前缀匹配', () => {
    expect(matches('上海市浦东新区', '上海', 'contains')).toBe(true);
    expect(matches('上海', '上海', 'startsWith')).toBe(true);
    expect(matches('北京', '上海', 'startsWith')).toBe(false);
  });

  it('空条件不参与约束（等价于放行）', () => {
    expect(matches('任何值', '', 'exact')).toBe(true);
  });
});

describe('lookup 基本查询', () => {
  it('按学号精确查姓名（VLOOKUP 的常规用法）', () => {
    const r = lookup({ source: SRC, keys: [['1002']], keyCols: [0], resultCols: [0, 1], headerRow: true });
    expect(r.notFound).toBe(0);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].values).toEqual(['1002', '李四']);
  });

  it('表头行会跳过，不把「学号」当成数据行返回', () => {
    const r = lookup({ source: SRC, keys: [['学号']], keyCols: [0], resultCols: [0], headerRow: true });
    expect(r.rows).toHaveLength(0);
    expect(r.notFound).toBe(1);
  });

  it('一条不存在的 key 只计一次未命中，不抛错', () => {
    const r = lookup({
      source: SRC,
      keys: [['1001'], ['9999']],
      keyCols: [0],
      resultCols: [1],
      headerRow: true,
    });
    expect(r.notFound).toBe(1);
  });

  it('一对多：一个学号命中两行，全部返回且按源表顺序', () => {
    const r = lookup({ source: SRC, keys: [['1001']], keyCols: [0], resultCols: [4], headerRow: true });
    expect(r.rows).toHaveLength(2);
    expect(r.rows.map((x) => x.values[0])).toEqual(['120', '300']);
  });

  it('dedupe 时同一源行不再重复返回（两个相同 key 本来会凑出 4 条）', () => {
    const withDedupe = lookup({
      source: SRC,
      keys: [['1001'], ['1001']],
      keyCols: [0],
      resultCols: [4],
      headerRow: true,
      dedupe: true,
    });
    const without = lookup({
      source: SRC,
      keys: [['1001'], ['1001']],
      keyCols: [0],
      resultCols: [4],
      headerRow: true,
    });
    expect(without.rows).toHaveLength(4);
    expect(withDedupe.rows).toHaveLength(2);
    expect(withDedupe.rows.map((x) => x.values[0])).toEqual(['120', '300']);
  });

  it('keys 为空返回空结果', () => {
    const r = lookup({ source: SRC, keys: [], keyCols: [0], resultCols: [1], headerRow: true });
    expect(r.rows).toEqual([]);
    expect(r.notFound).toBe(0);
  });
});

describe('lookup 模糊匹配', () => {
  it('contains 模式能命中子串', () => {
    const r = lookup({
      source: [['城市'], ['上海浦东'], ['北京'], ['深圳']],
      keys: [['上海']],
      keyCols: [0],
      resultCols: [0],
      mode: 'contains',
    });
    expect(r.rows).toHaveLength(1);
  });

  it('startsWith 模式只认前缀', () => {
    const r = lookup({
      source: [['编码'], ['1001'], ['2100'], ['1002']],
      keys: [['100']],
      keyCols: [0],
      resultCols: [0],
      mode: 'startsWith',
    });
    // 2100 以 2 开头，不算 100 的前缀
    expect(r.rows.map((x) => x.values[0])).toEqual(['1001', '1002']);
  });
});

describe('lookup 多条件 AND', () => {
  it('部门=销售 且 城市=上海 只命中上海那两笔（源表里张三有重复行）', () => {
    const r = lookup({
      source: SRC,
      keys: [['销售', '上海']],
      keyCols: [2, 3],
      resultCols: [0, 1],
      headerRow: true,
    });
    expect(r.rows).toHaveLength(2);
    expect(r.rows.every((x) => x.values[1] === '张三')).toBe(true);
  });

  it('多条件在整表范围内互斥时返回空（不像逐关键字那样记未命中）', () => {
    const r = lookup({
      source: SRC,
      keys: [['销售', '深圳']],
      keyCols: [2, 3],
      resultCols: [0, 1],
      headerRow: true,
    });
    expect(r.rows).toHaveLength(0);
    expect(r.notFound).toBe(1);
  });

  it('多个关键字各自一对多，会累加到总结果里', () => {
    const r = lookup({
      source: SRC,
      keys: [['销售'], ['财务']],
      keyCols: [2],
      resultCols: [0],
      headerRow: true,
    });
    expect(r.rows).toHaveLength(4);
  });
});

describe('columnValues', () => {
  it('去重且保留首次出现顺序，跳过空值', () => {
    expect(columnValues(SRC, 2, true)).toEqual(['销售', '财务']);
    expect(columnValues([['a'], [''], ['a']], 0)).toEqual(['a']);
  });
});

describe('mergeTables 两表合并', () => {
  const RIGHT: string[][] = [
    ['订单号', '备注'],
    ['1001', '加急'],
    ['1003', '已发货'],
  ];

  it('按 key 拼列，左表 key 列被右表列头替换，只留一份', () => {
    const r = mergeTables({
      left: SRC,
      leftKey: 0,
      right: RIGHT,
      rightKey: 0,
      rightCols: [1],
      headerRow: true,
      rightHeader: ['订单号', '备注'],
    });
    expect(r.header).toEqual(['学号', '姓名', '部门', '城市', '金额', '备注']);
    // 带表头时 rows 第一行就是表头
    expect(r.rows[0]).toEqual(r.header);
    expect(r.rows[1]).toEqual(['1001', '张三', '销售', '上海', '120', '加急']);
  });

  it('右表没匹配上的行补空串，并计入 unmatched', () => {
    const r = mergeTables({
      left: SRC,
      leftKey: 0,
      right: RIGHT,
      rightKey: 0,
      rightCols: [1],
      headerRow: true,
      rightHeader: ['订单号', '备注'],
    });
    expect(r.unmatched).toBe(1); // 1002 在右表里没有
    expect(r.rows[2][5]).toBe('');
  });

  it('右表 key 重复时取第一条（不做一对多拼接）', () => {
    const dup: string[][] = [
      ['k', 'v'],
      ['1', '第一条'],
      ['1', '第二条'],
    ];
    const r = mergeTables({ left: [['1', 'a']], leftKey: 0, right: dup, rightKey: 0, rightCols: [1], headerRow: false });
    expect(r.rows).toEqual([['1', 'a', '第一条']]);
  });

  it('无表头时列头用「列N」兜底', () => {
    const r = mergeTables({ left: [['1', 'a']], leftKey: 0, right: RIGHT, rightKey: 0, rightCols: [1], headerRow: false });
    expect(r.header[r.header.length - 1]).toBe('列2');
  });
});
