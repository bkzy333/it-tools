import { describe, expect, it } from 'vitest';
import { applyTypography, DEFAULT_TYPOGRAPHY_OPTIONS } from './text-typography.service';

describe('applyTypography 排版纠正', () => {
  it('中英文之间加空格', () => {
    const r = applyTypography('这是English单词', DEFAULT_TYPOGRAPHY_OPTIONS);
    expect(r).toBe('这是 English 单词');
  });

  it('中文与数字之间加空格', () => {
    const r = applyTypography('有123个数字', DEFAULT_TYPOGRAPHY_OPTIONS);
    expect(r).toBe('有 123 个数字');
  });

  it('半角标点转全角', () => {
    const r = applyTypography('你好,世界!', DEFAULT_TYPOGRAPHY_OPTIONS);
    expect(r).toBe('你好，世界！');
  });

  it('折叠重复标点', () => {
    const r = applyTypography('真的吗？？？', { ...DEFAULT_TYPOGRAPHY_OPTIONS });
    expect(r).toBe('真的吗？');
  });

  it('空文本原样返回', () => {
    expect(applyTypography('', DEFAULT_TYPOGRAPHY_OPTIONS)).toBe('');
  });
});
