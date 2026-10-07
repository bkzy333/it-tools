import { describe, expect, it } from 'vitest';

import { countLines, summarizeLineChanges } from './text-diff.service';

describe('summarizeLineChanges', () => {
  it('changes 为 null 时全部为 0（monaco 无差异时返回 null）', () => {
    const summary = summarizeLineChanges(null, 10);
    expect(summary).toEqual({ added: 0, removed: 0, modified: 0, unchanged: 10, changed: 0 });
  });

  it('changes 为空数组时未变行数等于原侧总行数', () => {
    const summary = summarizeLineChanges([], 5);
    expect(summary.unchanged).toBe(5);
    expect(summary.changed).toBe(0);
  });

  it('统计纯插入（原侧哨兵为 0）', () => {
    // 原侧 0 是 monaco 的哨兵值，表示这一段在原文本里不存在；
    // 改侧 3..4 即插入了 2 行
    const summary = summarizeLineChanges([
      { originalStartLineNumber: 2, originalEndLineNumber: 0, modifiedStartLineNumber: 3, modifiedEndLineNumber: 4 },
    ], 5);
    expect(summary.added).toBe(2);
    expect(summary.removed).toBe(0);
    expect(summary.modified).toBe(0);
    expect(summary.changed).toBe(2);
  });

  it('统计纯删除（改侧哨兵为 0）', () => {
    // 原侧 2..4 共 3 行被删掉
    const summary = summarizeLineChanges([
      { originalStartLineNumber: 2, originalEndLineNumber: 4, modifiedStartLineNumber: 1, modifiedEndLineNumber: 0 },
    ], 10);
    expect(summary.removed).toBe(3);
    expect(summary.added).toBe(0);
    // 未变 = 10 - 3 = 7
    expect(summary.unchanged).toBe(7);
  });

  it('统计修改行（两侧都有对应行）', () => {
    // 注意：monaco 的对齐算法会把「原侧 N 行换成改侧 M 行」尽量折成等长的替换块，
    // 所以真实数据里 modified 出现得比 insertion / deletion 频繁得多。
    // 这也是 text-diff.vue 的示例要把差异块做成不等长的原因 —— 否则面板上
    // 「新增」「删除」两个数字会永远停在 0，像坏了。
    const summary = summarizeLineChanges([
      { originalStartLineNumber: 1, originalEndLineNumber: 1, modifiedStartLineNumber: 1, modifiedEndLineNumber: 1 },
    ], 4);
    expect(summary.modified).toBe(1);
    expect(summary.unchanged).toBe(3);
  });

  it('修改行按原侧跨度计数（monaco 不保证两侧等长）', () => {
    // 真实抓下来的形状：3 行原文被 1 行新行取代时，monaco 报的是
    // original 6..8 / modified 6..6 —— 两侧跨度不等。
    // 按原侧算才是「有多少行原文被波及」，未变行数才对得上：
    // 原侧 10 行 - 改 3 行 = 7 行未变（第 1、2、3、4、5、9、10 行）。
    const summary = summarizeLineChanges(
      [{ originalStartLineNumber: 6, originalEndLineNumber: 8, modifiedStartLineNumber: 6, modifiedEndLineNumber: 6 }],
      10,
    );
    expect(summary.modified).toBe(3);
    expect(summary.added).toBe(0);
    expect(summary.removed).toBe(0);
    expect(summary.unchanged).toBe(7);
  });

  it('混合场景：插入 + 删除 + 修改一次性汇总', () => {
    const summary = summarizeLineChanges([
      // 第 1 行被改写
      { originalStartLineNumber: 1, originalEndLineNumber: 1, modifiedStartLineNumber: 1, modifiedEndLineNumber: 1 },
      // 原侧 3..4 被删掉
      { originalStartLineNumber: 3, originalEndLineNumber: 4, modifiedStartLineNumber: 2, modifiedEndLineNumber: 0 },
      // 改侧第 6 行后面加了 1 行
      { originalStartLineNumber: 5, originalEndLineNumber: 0, modifiedStartLineNumber: 6, modifiedEndLineNumber: 6 },
    ], 6);
    expect(summary.added).toBe(1);
    expect(summary.removed).toBe(2);
    expect(summary.modified).toBe(1);
    expect(summary.changed).toBe(4);
    // 原侧 6 行 - 删 2 - 改 1 = 3 行没动
    expect(summary.unchanged).toBe(3);
  });

  it('删除行数超过原侧总行数时未变行数不为负', () => {
    const summary = summarizeLineChanges([
      { originalStartLineNumber: 1, originalEndLineNumber: 9, modifiedStartLineNumber: 0, modifiedEndLineNumber: 0 },
    ], 2);
    expect(summary.removed).toBe(9);
    expect(summary.unchanged).toBe(0);
  });
});

describe('countLines', () => {
  it('空串算 1 行（monaco 里空模型也是一行）', () => {
    expect(countLines('')).toBe(1);
  });

  it('普通文本按换行计数', () => {
    expect(countLines('a')).toBe(1);
    expect(countLines('a\nb')).toBe(2);
    expect(countLines('a\nb\nc')).toBe(3);
  });

  it('尾部换行算末尾一个空行（与 monaco getLineCount() 同口径）', () => {
    // monaco 的 TextModel 按 EOL 个数 + 1 计行，所以 "a\n" 是 2 行（第二行是空行）。
    // 统计条里的未变行数是从原侧行数反推的，口径必须跟 monaco 自己一致，
    // 否则会出现「差异数 + 未变数 ≠ 总行数」这种对不上的观感。
    expect(countLines('a\n')).toBe(2);
    expect(countLines('a\nb\n')).toBe(3);
  });

  it('连续换行算空行', () => {
    expect(countLines('a\n\nb')).toBe(3);
  });
});
