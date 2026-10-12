import { describe, expect, it } from 'vitest';
import { arrayToMarkdown, markdownToArray } from './json-markdown-table.service';

describe('json-markdown-table service', () => {
  describe('arrayToMarkdown', () => {
    it('converts an array of objects to a markdown table', () => {
      const md = arrayToMarkdown({
        arrayOrObject: [
          { a: 1, b: 2 },
          { a: 3, b: 4 },
        ],
      });
      expect(md).toBe(['| a | b |', '| --- | --- |', '| 1 | 2 |', '| 3 | 4 |'].join('\n'));
    });

    it('uses center alignment tokens when alignment is center', () => {
      const md = arrayToMarkdown({
        arrayOrObject: [{ a: 1 }],
        alignment: 'center',
      });
      expect(md.split('\n')[1]).toBe('| :--: |');
    });

    it('serializes nested objects as JSON text when nested is none', () => {
      const md = arrayToMarkdown({
        arrayOrObject: [{ a: { c: 1 }, b: 2 }],
        nested: 'none',
      });
      expect(md).toContain('{"c":1}');
    });

    it('flattens nested objects with dotted keys when nested is all', () => {
      const md = arrayToMarkdown({
        arrayOrObject: [{ a: { c: 1 }, b: 2 }],
        nested: 'all',
      });
      expect(md.split('\n')[0]).toBe('| a.c | b |');
    });

    it('escapes the pipe character in cell values', () => {
      const md = arrayToMarkdown({
        arrayOrObject: [{ a: 'x|y' }],
      });
      // 单元格里的 | 必须转义为 \|
      expect(md).toContain('x\\|y');
    });

    it('removes fully empty rows when skipEmptyRows is on', () => {
      const md = arrayToMarkdown({
        arrayOrObject: [
          { a: 1, b: 2 },
          { a: undefined, b: '' },
        ],
        skipEmptyRows: true,
      });
      const lines = md.split('\n');
      expect(lines).toHaveLength(3); // 表头 + 对齐 + 1 数据行
    });
  });

  describe('markdownToArray', () => {
    it('parses a markdown table back to objects', () => {
      const md = ['| a | b |', '| --- | --- |', '| 1 | 2 |', '| 3 | 4 |'].join('\n');
      expect(markdownToArray(md)).toEqual([
        { a: '1', b: '2' },
        { a: '3', b: '4' },
      ]);
    });

    it('unescapes the pipe character in cells', () => {
      const md = ['| a |', '| --- |', '| x\\|y |'].join('\n');
      expect(markdownToArray(md)).toEqual([{ a: 'x|y' }]);
    });

    it('round-trips JSON -> Markdown -> JSON (as text)', () => {
      const data = [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ];
      const md = arrayToMarkdown({ arrayOrObject: data });
      expect(markdownToArray(md)).toEqual([
        { name: 'Alice', age: '30' },
        { name: 'Bob', age: '25' },
      ]);
    });

    it('returns empty array when no table is present', () => {
      expect(markdownToArray('just some text')).toEqual([]);
    });
  });
});
