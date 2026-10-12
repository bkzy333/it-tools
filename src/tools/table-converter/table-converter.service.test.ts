import { describe, expect, it } from 'vitest';
import {
  applyOp,
  gridToCsv,
  gridToHtml,
  gridToJson,
  gridToMarkdown,
  gridToTsv,
  mergeIntoGrid,
  parseToGrid,
} from './table-converter.service';
import { gridToXlsx } from './xlsx-export';

describe('parseToGrid', () => {
  it('parses Excel TSV (tab separated)', () => {
    const g = parseToGrid('a\tb\tc\n1\t2\t3');
    expect(g).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('parses CSV with quoted fields and embedded commas', () => {
    const g = parseToGrid('name,note\n"Smith, John","hello ""world"""');
    expect(g).toEqual([
      ['name', 'note'],
      ['Smith, John', 'hello "world"'],
    ]);
  });

  it('parses JSON array of arrays', () => {
    const g = parseToGrid('[["x","y"],[1,2]]');
    expect(g).toEqual([
      ['x', 'y'],
      ['1', '2'],
    ]);
  });

  it('parses JSON array of objects into header + rows', () => {
    const g = parseToGrid('[{"a":1,"b":2},{"a":3,"b":4}]');
    expect(g[0]).toEqual(['a', 'b']);
    expect(g[1]).toEqual(['1', '2']);
    expect(g[2]).toEqual(['3', '4']);
  });

  it('parses Markdown table (drops separator row)', () => {
    const md = '| name | age |\n| --- | --- |\n| Tom | 10 |\n| Jim | 20 |';
    const g = parseToGrid(md);
    expect(g).toEqual([
      ['name', 'age'],
      ['Tom', '10'],
      ['Jim', '20'],
    ]);
  });

  it('returns empty grid for blank input', () => {
    expect(parseToGrid('   ')).toEqual([]);
  });
});

describe('applyOp', () => {
  it('remove-empty-rows drops all-blank rows', () => {
    const g = [
      ['a', 'b'],
      ['', ''],
      ['1', '2'],
    ];
    expect(applyOp(g, 'remove-empty-rows')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('remove-empty-cols drops all-blank columns', () => {
    const g = [
      ['a', '', 'c'],
      ['1', '', '3'],
    ];
    expect(applyOp(g, 'remove-empty-cols')).toEqual([
      ['a', 'c'],
      ['1', '3'],
    ]);
  });

  it('trim strips cell whitespace', () => {
    expect(applyOp([['  x  ', 'y']], 'trim')).toEqual([['x', 'y']]);
  });

  it('upper / lower transform cells', () => {
    expect(applyOp([['Ab']], 'upper')).toEqual([['AB']]);
    expect(applyOp([['Ab']], 'lower')).toEqual([['ab']]);
  });

  it('transpose swaps rows and cols', () => {
    const g = [
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ];
    expect(applyOp(g, 'transpose')).toEqual([
      ['a', '1'],
      ['b', '2'],
      ['c', '3'],
    ]);
  });
});

describe('grid to text formats', () => {
  const grid = [
    ['name', 'age'],
    ['Tom', '10'],
    ['Jim', '20'],
  ];

  it('JSON with header -> array of objects', () => {
    expect(gridToJson(grid, true)).toBe(
      '[\n  {\n    "name": "Tom",\n    "age": "10"\n  },\n  {\n    "name": "Jim",\n    "age": "20"\n  }\n]',
    );
  });

  it('JSON without header -> array of arrays (pretty-printed)', () => {
    expect(gridToJson(grid, false)).toBe(JSON.stringify(grid, null, 2));
  });

  it('CSV quotes fields with commas', () => {
    expect(gridToCsv([['a,b', 'c']])).toBe('"a,b",c');
  });

  it('Markdown has header + separator + rows', () => {
    const md = gridToMarkdown(grid);
    expect(md.split('\n')[0]).toBe('| name | age |');
    expect(md.split('\n')[1]).toBe('| --- | --- |');
    expect(md).toContain('| Tom | 10 |');
  });

  it('HTML wraps thead/tbody', () => {
    const html = gridToHtml(grid);
    expect(html).toContain('<thead>');
    expect(html).toContain('<th>name</th>');
    expect(html).toContain('<td>Tom</td>');
  });

  it('TSV joins with tabs and neutralizes inner tabs', () => {
    expect(gridToTsv([['a\tb', 'c']])).toBe('a b\tc');
  });
});

describe('mergeIntoGrid (cell paste)', () => {
  it('overlays patch at an offset and expands grid', () => {
    const base = [
      ['a', 'b'],
      ['c', 'd'],
    ];
    const patch = [
      ['x', 'y'],
      ['z', 'w'],
    ];
    expect(mergeIntoGrid(base, patch, 1, 1)).toEqual([
      ['a', 'b', ''],
      ['c', 'x', 'y'],
      ['', 'z', 'w'],
    ]);
  });
});

describe('gridToXlsx (hand-rolled, dependency-free)', () => {
  it('produces a valid ZIP/xlsx blob', async () => {
    const rows = [
      ['name', 'age', 'note'],
      ['Tom', '10', 'hello & <world>'],
      ['Jim', '20', 'a,b'],
    ];
    const blob = gridToXlsx(rows);
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    const buf = new Uint8Array(await blob.arrayBuffer());
    // ZIP local file header signature: PK\x03\x04
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
    expect(buf[2]).toBe(0x03);
    expect(buf[3]).toBe(0x04);

    const text = new TextDecoder().decode(buf);
    expect(text).toContain('[Content_Types].xml');
    expect(text).toContain('xl/worksheets/sheet1.xml');
    expect(text).toContain('<worksheet');
    // numeric cell written as <v>, text cell as inlineStr
    expect(text).toContain('<v>10</v>');
    expect(text).toContain('inlineStr');
    expect(text).toContain('hello &amp; &lt;world&gt;');
  });
});
