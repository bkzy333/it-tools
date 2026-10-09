import { describe, expect, it } from 'vitest';
import { queryWubi, queryWubiText } from './wubi-dict.service';

describe('queryWubi', () => {
  it('常用字', () => {
    expect(queryWubi('中', '86')).toBe('khk');
    expect(queryWubi('国', '86')).toBe('lgyi');
    expect(queryWubi('人', '86')).toBe('wwww');
  });

  it('86 与 98 版可能不同（笔字）', () => {
    expect(queryWubi('笔', '86')).toBe('ttfn');
    expect(queryWubi('笔', '98')).toBe('teb');
  });

  it('非汉字返回空', () => {
    expect(queryWubi('A')).toBe('');
    expect(queryWubi('1')).toBe('');
  });
});

describe('queryWubiText', () => {
  it('逐字查询，跳过非汉字', () => {
    const r = queryWubiText('中国', '86');
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({ char: '中', code: 'khk', found: true });
    expect(r[1]).toEqual({ char: '国', code: 'lgyi', found: true });
  });
});
