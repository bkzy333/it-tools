import { describe, expect, it } from 'vitest';
import { joinText, type TextJoinOptions } from './text-join.service';

const base: TextJoinOptions = {
  input: 'apple\nbanana\npear',
  outputDelimiterKey: '', // 默认连接字符是空串
  outputDelimiterCustom: '',
  removeFirstLastSpace: false,
  removeAllSpace: false,
};

function opts(patch: Partial<TextJoinOptions> = {}): TextJoinOptions {
  return { ...base, ...patch };
}

describe('joinText 拼接', () => {
  it('默认连接字符为空串，直接压成一行', () => {
    const r = joinText(opts());
    expect(r.output).toBe('applebananapear');
    expect(r.lines).toBe(3);
  });

  it('用逗号连接（预设 Key 4）', () => {
    const r = joinText(opts({ outputDelimiterKey: '4' }));
    expect(r.output).toBe('apple,banana,pear');
  });

  it('自定义连接符', () => {
    const r = joinText(opts({ outputDelimiterKey: '0', outputDelimiterCustom: ' | ' }));
    expect(r.output).toBe('apple | banana | pear');
  });

  it('入口永远是按换行切，所以换行会被连接符吃掉', () => {
    const r = joinText(opts({ input: 'a\nb', outputDelimiterKey: '4' }));
    expect(r.output).toBe('a,b');
  });
});

describe('joinText 过滤与清理', () => {
  it('去掉行首尾空格', () => {
    const r = joinText(opts({ input: '  apple  \n banana', removeFirstLastSpace: true }));
    expect(r.output).toBe('applebanana');
  });

  it('删除所有空格后整行变空 → 该行被丢掉（参考站先 trimAllSpace 再判空串）', () => {
    const r = joinText(opts({
      input: 'a b\nc d e\nf',
      removeAllSpace: true,
    }));
    expect(r.output).toBe('abcdef');
    expect(r.lines).toBe(3);
  });

  it('空行被丢掉（严格空串判定，参考站同口径）', () => {
    const r = joinText(opts({ input: 'a\n\nb\n', outputDelimiterKey: '4' }));
    expect(r.output).toBe('a,b');
    expect(r.lines).toBe(2);
  });
});

describe('joinText 边界', () => {
  it('输入为空返回空', () => {
    const r = joinText(opts({ input: '' }));
    expect(r.output).toBe('');
    expect(r.lines).toBe(0);
  });

  it('全是空行 → 输出空串，行数 0', () => {
    const r = joinText(opts({ input: '\n\n' }));
    expect(r.output).toBe('');
    expect(r.lines).toBe(0);
  });
});
