import { describe, expect, it } from 'vitest';
import {
  chunkColumns,
  detectDelimiter,
  flatten,
  mergeAll,
  parseTable,
  serializeTable,
  transformTable,
  transpose,
  type TableShapeOptions,
} from './table-transpose.service';

const TAB = '\t';

describe('parseTable / serializeTable', () => {
  it('TSV 解析并跳过空行', () => {
    const text = `a\tb\n\nc\td`;
    expect(parseTable(text, TAB)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
  it('序列化', () => {
    expect(serializeTable([['a', 'b'], ['c', 'd']], TAB)).toBe('a\tb\nc\td');
  });
});

describe('detectDelimiter', () => {
  it('优先 tab', () => {
    expect(detectDelimiter('a\tb\nc\td')).toBe('\t');
  });
  it('逗号密度高则用逗号', () => {
    expect(detectDelimiter('a,b\nc,d')).toBe(',');
  });
  it('分号明显多于逗号时优先分号', () => {
    expect(detectDelimiter('a;b;c,d\ne;f;g,h')).toBe(';');
  });
});

describe('transpose', () => {
  it('方阵转置', () => {
    const r = transpose([['a', 'b'], ['c', 'd']]);
    expect(r).toEqual([['a', 'c'], ['b', 'd']]);
  });
  it('长短不齐按空串补齐', () => {
    const r = transpose([['a', 'b', 'c'], ['d', 'e']]);
    expect(r).toEqual([['a', 'd'], ['b', 'e'], ['c', '']]);
  });
});

describe('chunkColumns', () => {
  it('每 2 列切一块，块间空行', () => {
    const input = [
      ['h1', 'h2', 'h3', 'h4'],
      ['1', '2', '3', '4'],
    ];
    const out = chunkColumns(input, 2);
    expect(out).toEqual([
      ['h1', 'h2'],
      ['1', '2'],
      [''], // 块间空行
      ['h3', 'h4'],
      ['3', '4'],
    ]);
  });
});

describe('flatten', () => {
  it('每个单元格一行（行优先）', () => {
    expect(flatten([['a', 'b'], ['c', 'd']])).toEqual([['a'], ['b'], ['c'], ['d']]);
  });
});

describe('mergeAll', () => {
  it('用分隔符连成一串', () => {
    expect(mergeAll([['a', 'b'], ['c', 'd']], ',')).toEqual([['a,b,c,d']]);
  });
});

describe('transformTable 集成', () => {
  const base: TableShapeOptions = { op: 'transpose', delimiter: TAB, chunkCols: 2, mergeSep: ',' };

  it('transpose 走主入口', () => {
    expect(transformTable('a\tb\nc\td', base)).toBe('a\tc\nb\td');
  });
  it('chunk 走主入口', () => {
    const text = 'h1\th2\th3\th4\n1\t2\t3\t4';
    expect(transformTable(text, { ...base, op: 'chunk' })).toBe(
      'h1\th2\n1\t2\n\nh3\th4\n3\t4',
    );
  });
  it('flatten 走主入口', () => {
    expect(transformTable('a\tb\nc\td', { ...base, op: 'flatten' })).toBe('a\nb\nc\nd');
  });
  it('merge 走主入口', () => {
    expect(transformTable('a\tb\nc\td', { ...base, op: 'merge' })).toBe('a,b,c,d');
  });
  it('空输入返回空串', () => {
    expect(transformTable('   \n\n  ', base)).toBe('');
  });
});
