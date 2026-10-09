import { describe, expect, it } from 'vitest';
import { computeSimilarity, tokenize } from './text-similarity.service';

describe('computeSimilarity 文本查重', () => {
  it('完全相同文本：重复率 100%', () => {
    const r = computeSimilarity('这是一段完全相同的文本内容', '这是一段完全相同的文本内容');
    expect(r.coverage).toBe(1);
    expect(r.jaccard).toBe(1);
  });

  it('完全不同文本：重复率 0%', () => {
    const r = computeSimilarity('苹果香蕉橙子', '计算机编程语言');
    expect(r.coverage).toBe(0);
  });

  it('部分重复：英文单词按词匹配', () => {
    const r = computeSimilarity('the quick brown fox jumps over the lazy dog', 'the quick brown fox is very fast');
    expect(r.coverage).toBeGreaterThan(0);
    expect(r.coverage).toBeLessThan(1);
  });

  it('空文本 B：返回 0 且不高亮', () => {
    const r = computeSimilarity('abc', '');
    expect(r.coverage).toBe(0);
    expect(r.totalB).toBe(0);
  });

  it('tokenize 中文按 2-gram、英文按单词', () => {
    const tokens = tokenize('在线工具 online tool');
    expect(tokens).toContain('在线');
    expect(tokens).toContain('online');
    expect(tokens).toContain('tool');
  });
});
