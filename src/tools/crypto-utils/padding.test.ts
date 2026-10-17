import { describe, expect, it } from 'vitest';
import { applyPadding, paddingLengthFor, removePadding } from './padding';

const bytes = (...values: number[]) => new Uint8Array(values);
const text = (s: string) => new TextEncoder().encode(s);
const fromBytes = (b: Uint8Array) => Array.from(b);

describe('paddingLengthFor', () => {
  it('PKCS#7 对齐时补满一整块（不是补 0）', () => {
    expect(paddingLengthFor(16, 'pkcs7')).toBe(16);
    expect(paddingLengthFor(0, 'pkcs7')).toBe(16);
    expect(paddingLengthFor(15, 'pkcs7')).toBe(1);
  });

  it('Zero 对齐时不补', () => {
    expect(paddingLengthFor(16, 'zero')).toBe(0);
    expect(paddingLengthFor(15, 'zero')).toBe(1);
  });

  it('不填充永远补 0', () => {
    expect(paddingLengthFor(15, 'none')).toBe(0);
  });

  it('ISO10126 与 Ansix923 与 PKCS#7 同长度规则', () => {
    expect(paddingLengthFor(16, 'iso10126')).toBe(16);
    expect(paddingLengthFor(5, 'ansix923')).toBe(11);
  });
});

describe('PKCS#7', () => {
  it('补的每个字节都等于填充长度', () => {
    const padded = applyPadding(text('abc'), 'pkcs7');

    expect(padded.length).toBe(16);
    expect(fromBytes(padded.slice(3))).toEqual(new Array(13).fill(13));
  });

  it('往返无损（含对齐的情况）', () => {
    for (const len of [0, 1, 15, 16, 17, 31, 32]) {
      const data = new Uint8Array(len).fill(65);

      expect(removePadding(applyPadding(data, 'pkcs7'), 'pkcs7').length).toBe(len);
    }
  });

  it('最后一字节是 0 时报错（不是合法填充）', () => {
    const zeroTail = new Uint8Array(16).fill(1);
    zeroTail[15] = 0;

    expect(() => removePadding(zeroTail, 'pkcs7')).toThrow(/不在 1~16/);
  });

  it('最后一字节超过块大小时报错', () => {
    expect(() => removePadding(new Uint8Array(16).fill(0).map((_, i) => (i === 15 ? 17 : 1)), 'pkcs7')).toThrow(
      /不在 1~16/,
    );
  });

  it('填充字节值不一致时报错', () => {
    const bad = new Uint8Array(16).fill(0);

    bad[15] = 4;
    bad[14] = 4;
    bad[13] = 4;
    bad[12] = 9; // 应该是 4

    expect(() => removePadding(bad, 'pkcs7')).toThrow(/值不一致/);
  });
});

describe('Zero', () => {
  it('补的是 0，且对齐时不补', () => {
    const padded = applyPadding(text('abcd'), 'zero');

    expect(padded.length).toBe(16);
    expect(fromBytes(padded.slice(4))).toEqual(new Array(12).fill(0));
    expect(applyPadding(new Uint8Array(16).fill(1), 'zero').length).toBe(16);
  });

  it('去填充会去掉所有尾部 0（所以末尾本来是 0 的内容会丢，这是这套填充的固有限制）', () => {
    const tail = new Uint8Array(16);
    tail[0] = 65;
    tail[1] = 66;

    expect(removePadding(tail, 'zero').length).toBe(2);
  });
});

describe('ISO10126', () => {
  it('填充字节用注入的随机源，最后一字节是长度', () => {
    const padded = applyPadding(text('abc'), 'iso10126', {
      randomBytes: length => new Uint8Array(length).fill(0xee),
    });

    expect(padded.length).toBe(16);
    expect(padded[15]).toBe(13);
    expect(fromBytes(padded.slice(3, 15))).toEqual(new Array(12).fill(0xee));
  });

  it('往返无损，且不校验随机内容', () => {
    const data = text('hello world');

    expect(removePadding(applyPadding(data, 'iso10126'), 'iso10126').length).toBe(data.length);
  });
});

describe('Ansix923', () => {
  it('填充区除最后一字节外全为 0', () => {
    const padded = applyPadding(text('abc'), 'ansix923');

    expect(padded[15]).toBe(13);
    expect(fromBytes(padded.slice(3, 15))).toEqual(new Array(12).fill(0));
  });

  it('填充区不是 0 时报错', () => {
    const bad = new Uint8Array(16).fill(0);

    bad[15] = 2;
    bad[14] = 7; // 应该是 0

    expect(() => removePadding(bad, 'ansix923')).toThrow(/Ansix923/);
  });

  it('往返无损', () => {
    const data = text('hello');

    expect(removePadding(applyPadding(data, 'ansix923'), 'ansix923').length).toBe(data.length);
  });
});

describe('不填充', () => {
  it('长度不是整块时报错并说明当前长度', () => {
    expect(() => applyPadding(text('abc'), 'none')).toThrow(/16 字节的整数倍.*3 字节/);
  });

  it('整块长度原样返回', () => {
    const data = new Uint8Array(32).fill(7);

    expect(applyPadding(data, 'none')).toBe(data);
    expect(removePadding(data, 'none')).toBe(data);
  });
});

describe('去填充的长度检查', () => {
  it('密文不是整块时报错', () => {
    expect(() => removePadding(new Uint8Array(10), 'pkcs7')).toThrow(/不是 16 的整数倍/);
  });

  it('空密文报错', () => {
    expect(() => removePadding(new Uint8Array(0), 'pkcs7')).toThrow(/不是 16 的整数倍/);
  });
});
