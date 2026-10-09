import { describe, expect, it } from 'vitest';
import { numberLines, type NumberingOptions } from './text-numbering.service';

function opts(patch: Partial<NumberingOptions> = {}): NumberingOptions {
  return {
    input: '苹果\n香蕉\n橙子',
    format: 'dot',
    start: 1,
    step: 1,
    padWidth: 0,
    spaceAfter: false,
    ...patch,
  };
}

describe('numberLines 文本加序号', () => {
  it('默认点号格式', () => {
    expect(numberLines(opts())).toBe('1.苹果\n2.香蕉\n3.橙子');
  });

  it('括号格式 + 空格分隔', () => {
    const r = numberLines(opts({ format: 'paren', spaceAfter: true }));
    expect(r).toBe('(1) 苹果\n(2) 香蕉\n(3) 橙子');
  });

  it('起始值 + 步长', () => {
    const r = numberLines(opts({ start: 10, step: 5 }));
    expect(r).toBe('10.苹果\n15.香蕉\n20.橙子');
  });

  it('前置补零', () => {
    const r = numberLines(opts({ padWidth: 2, format: 'none' }));
    expect(r).toBe('01苹果\n02香蕉\n03橙子');
  });

  it('支持 CRLF 换行', () => {
    const r = numberLines(opts({ input: 'a\r\nb\r\nc' }));
    expect(r).toBe('1.a\n2.b\n3.c');
  });
});
