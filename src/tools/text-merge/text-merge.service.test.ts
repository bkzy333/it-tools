import { describe, expect, it } from 'vitest';
import { mergeText, type MergeSettings } from './text-merge.service';

const base: MergeSettings = {
  input: 'apple\nbanana\npear',
  mode: 'rows',
  outputDelimiter: ',',
  inputDelimiter: '\t',
  skipEmpty: false,
};

function opts(patch: Partial<MergeSettings> = {}): MergeSettings {
  return { ...base, ...patch };
}

describe('mergeText 行模式', () => {
  it('默认把所有行连成一行', () => {
    const r = mergeText(opts());
    expect(r.output).toBe('apple,banana,pear');
    expect(r.cellCount).toBe(3);
  });

  it('输出分隔符可换成任意字符', () => {
    const r = mergeText(opts({ outputDelimiter: ' | ' }));
    expect(r.output).toBe('apple | banana | pear');
  });

  it('TSV 与导出用的 rows 保持一致（每行一个值）', () => {
    const r = mergeText(opts());
    expect(r.tsv).toBe('apple\nbanana\npear');
    expect(r.rows).toEqual([['apple'], ['banana'], ['pear']]);
  });

  it('skipEmpty 丢掉空行', () => {
    const r = mergeText(opts({ input: 'a\n\nb\n', skipEmpty: true }));
    expect(r.output).toBe('a,b');
  });

  it('不勾 skipEmpty 时空行保留', () => {
    const r = mergeText(opts({ input: 'a\n\nb', skipEmpty: false }));
    expect(r.output).toBe('a,,b');
  });

  it('兼容 CRLF 换行', () => {
    expect(mergeText(opts({ input: 'a\r\nb' })).output).toBe('a,b');
  });
});

describe('mergeText 列模式', () => {
  it('每行按输入分隔符拆列后再用输出分隔符连接', () => {
    const r = mergeText(opts({ input: 'a\tb\tc\nd\te\tf', mode: 'cols', outputDelimiter: ',' }));
    expect(r.output).toBe('a,b,c\nd,e,f');
    expect(r.cellCount).toBe(6);
  });

  it('TSV 恒为 Tab 分隔（可直接粘回 Excel），与输出分隔符无关', () => {
    const r = mergeText(opts({ input: 'a\tb\nc\td', mode: 'cols', outputDelimiter: ';' }));
    expect(r.tsv).toBe('a\tb\nc\td');
  });

  it('导出的 rows 是二维数组', () => {
    const r = mergeText(opts({ input: 'a\tb\nc\td', mode: 'cols' }));
    expect(r.rows).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('skipEmpty 会丢掉行内的空单元格', () => {
    const r = mergeText(opts({ input: 'a\t\tb\nc\td', mode: 'cols', skipEmpty: true }));
    expect(r.rows).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('skipEmpty 时整行为空则跳过该行', () => {
    const r = mergeText(opts({ input: 'a\tb\n\n\nc\td', mode: 'cols', skipEmpty: true }));
    expect(r.rows).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
});

// ---------------------------------------------------------------------------
// 以下用例是从原「文本拼接」(/text-join) 迁移过来的，锁的是它的空格清理口径。
// 2026-10-13 两个工具合并，功能并入 /text-merge，这些断言必须原样保留 ——
// 它们保的是「删所有空格会删掉制表符和全角空格」「先清理再判空」这些容易顺手改坏的行为。
// ---------------------------------------------------------------------------
describe('空格清理（原「文本拼接」口径）', () => {
  it('去掉行首尾空格（只处理半角空格）', () => {
    const r = mergeText(opts({ input: '  apple  \n banana', removeFirstLastSpace: true }));
    expect(r.output).toBe('apple,banana');
  });

  it('删除所有空格后整行变空 → 该行被丢掉（先清理再判空）', () => {
    const r = mergeText(
      opts({ input: 'a b\nc d e\nf', removeAllSpace: true, skipEmpty: true, outputDelimiter: '' }),
    );
    expect(r.output).toBe('abcdef');
    expect(r.cellCount).toBe(3);
  });

  it('removeAllSpace 删的是所有空白，含制表符与全角空格', () => {
    // 列模式 + Tab 分隔：开了 removeAllSpace 后 Tab 会被一并删掉，这是「删所有空白」的应有语义
    const r = mergeText(opts({ input: 'a\tb', mode: 'cols', removeAllSpace: true, outputDelimiter: '' }));
    expect(r.output).toBe('ab');
  });

  it('两个选项都开时，先去首尾再删所有', () => {
    const r = mergeText(
      opts({ input: '  a b  ', removeFirstLastSpace: true, removeAllSpace: true, outputDelimiter: '' }),
    );
    expect(r.output).toBe('ab');
  });

  it('都不勾时原样保留空格', () => {
    const r = mergeText(opts({ input: ' a ', outputDelimiter: '' }));
    expect(r.output).toBe(' a ');
  });
});

describe('mergeText 边界', () => {
  it('输入为空返回全空结果', () => {
    const r = mergeText(opts({ input: '' }));
    expect(r.output).toBe('');
    expect(r.tsv).toBe('');
    expect(r.rows).toEqual([]);
    expect(r.cellCount).toBe(0);
  });

  it('全是空行且勾了 skipEmpty → 输出空串', () => {
    const r = mergeText(opts({ input: '\n\n', skipEmpty: true }));
    expect(r.output).toBe('');
    expect(r.cellCount).toBe(0);
  });
});
