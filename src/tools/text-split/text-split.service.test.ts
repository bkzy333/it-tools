import { describe, expect, it } from 'vitest';
import { splitText, type TextSplitOptions } from './text-split.service';

const base: Omit<TextSplitOptions, 'orderBy'> = {
  input: 'apple\nbanana\npear',
  inputDelimiterKey: '1', // 换行符
  inputDelimiterCustom: '',
  outputDelimiterKey: '1',
  outputDelimiterCustom: '',
  removeFirstLastSpace: false,
  showLineNumber: false,
};

function opts(patch: Partial<TextSplitOptions> = {}): TextSplitOptions {
  return { ...base, orderBy: 'none', ...patch };
}

describe('splitText 切分', () => {
  it('按换行切成多行，默认原样拼回', () => {
    const r = splitText(opts());
    expect(r.output).toBe('apple\nbanana\npear');
    expect(r.parts).toBe(3);
    expect(r.unchanged).toBe(false);
  });

  it('按逗号切、按制表符拼回', () => {
    const r = splitText(opts({
      input: 'a,b,c',
      inputDelimiterKey: '4',
      outputDelimiterKey: '2',
    }));
    expect(r.output).toBe('a\tb\tc');
  });

  it('自定义分隔符支持多字符', () => {
    const r = splitText(opts({
      input: 'apple--- banana---pear',
      inputDelimiterKey: '0',
      inputDelimiterCustom: '---',
    }));
    expect(r.output).toBe('apple\n banana\npear');
  });

  it('找不到分隔符时原样回显，unchanged 为 true', () => {
    const r = splitText(opts({ input: 'no delimiter here' }));
    expect(r.output).toBe('no delimiter here');
    expect(r.unchanged).toBe(true);
    expect(r.parts).toBe(1);
  });

  it('首尾空段被丢弃，中间空段保留（参考站 textSplitArr 的原行为）', () => {
    const r = splitText(opts({ input: ',a,', inputDelimiterKey: '4' }));
    expect(r.output).toBe('a');

    const middle = splitText(opts({ input: 'a,,b', inputDelimiterKey: '4' }));
    expect(middle.output).toBe('a\n\nb');
  });
});

describe('splitText 后处理', () => {
  it('去除行首尾空格', () => {
    const r = splitText(opts({
      input: '  apple  \n  banana',
      removeFirstLastSpace: true,
    }));
    expect(r.output).toBe('apple\nbanana');
  });

  it('排序只在 ASCII 上断言：localeCompare 不传 locale，塞汉字会变环境依赖', () => {
    const input = 'c\na\nb';
    expect(splitText(opts({ input, orderBy: 'asc' })).output).toBe('a\nb\nc');
    expect(splitText(opts({ input, orderBy: 'desc' })).output).toBe('c\nb\na');
    expect(splitText(opts({ input, orderBy: 'none' })).output).toBe('c\na\nb');
  });

  it('行号排在排序之后，用全角冒号', () => {
    const r = splitText(opts({ input: 'c\na', orderBy: 'asc', showLineNumber: true }));
    expect(r.output).toBe('1：a\n2：c');
  });
});

describe('splitText 边界', () => {
  it('输入为空返回空，不抛错', () => {
    const r = splitText(opts({ input: '' }));
    expect(r.output).toBe('');
    expect(r.parts).toBe(0);
  });

  it('输入分隔符 Key 为空时不做任何处理（防误传自定义未填）', () => {
    const r = splitText(opts({ input: 'a,b', inputDelimiterKey: '0', inputDelimiterCustom: '' }));
    expect(r.output).toBe('a,b');
    expect(r.unchanged).toBe(true);
  });
});
