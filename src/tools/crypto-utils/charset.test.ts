import { describe, expect, it } from 'vitest';
import {
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  decodeBytes,
  encodeText,
  hexToBytes,
} from './charset';

describe('hex', () => {
  it('解析时容忍空格 / 0x / 大小写 / 冒号', () => {
    for (const input of ['d6d0', 'D6D0', 'd6 d0', 'D6:D0', '0xd6d0', 'd6-d0']) {
      expect(Array.from(hexToBytes(input))).toEqual([0xd6, 0xd0]);
    }
  });

  it('空串给空字节', () => {
    expect(hexToBytes('   ').length).toBe(0);
  });

  it('非法字符与奇数长度都报错（不能静默产出错字节）', () => {
    expect(() => hexToBytes('zz')).toThrow(/十六进制/);
    expect(() => hexToBytes('abc')).toThrow(/奇数/);
  });

  it('输出支持大写与分隔符', () => {
    const bytes = new Uint8Array([0x0a, 0xff]);

    expect(bytesToHex(bytes)).toBe('0aff');
    expect(bytesToHex(bytes, true)).toBe('0AFF');
    expect(bytesToHex(bytes, false, ' ')).toBe('0a ff');
    expect(bytesToHex(new Uint8Array(0))).toBe('');
  });
});

describe('base64', () => {
  it('往返一致，且容忍换行与 URL-safe', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255]);

    expect(bytesToBase64(bytes)).toBe('AAEC+vv/');
    expect(Array.from(base64ToBytes('AAEC+vv/'))).toEqual(Array.from(bytes));
    expect(Array.from(base64ToBytes('AAEC+vv/\n'))).toEqual(Array.from(bytes));
    expect(Array.from(base64ToBytes('AAEC-vv_'))).toEqual(Array.from(bytes));
  });

  it('非法 Base64 报错', () => {
    expect(() => base64ToBytes('***')).toThrow(/Base64/);
  });
});

describe('encodeText / decodeBytes', () => {
  it('UTF-8 往返', () => {
    expect(Array.from(encodeText('中', 'utf8'))).toEqual([0xe4, 0xb8, 0xad]);
    expect(decodeBytes(encodeText('中文 Test', 'utf8'), 'utf8')).toBe('中文 Test');
  });

  it('GBK 编码结果与标准一致（中文测试 → d6d0cec4b2e2cad4）', () => {
    expect(bytesToHex(encodeText('中文测试', 'gbk'))).toBe('d6d0cec4b2e2cad4');
    expect(decodeBytes(hexToBytes('d6d0cec4b2e2cad4'), 'gbk')).toBe('中文测试');
  });

  it('GBK 单向兼容 ASCII', () => {
    expect(bytesToHex(encodeText('abc123', 'gbk'))).toBe('616263313233');
  });

  it('GBK 编不了的字要报错而不是静默替换', () => {
    // U+1F600 不在 GBK 里
    expect(() => encodeText('😀', 'gbk')).toThrow(/GBK/);
  });

  it('UTF-16_LE 往返，字节数为奇数时报错', () => {
    expect(bytesToHex(encodeText('中', 'utf16le'))).toBe('2d4e');
    expect(decodeBytes(hexToBytes('2d4e'), 'utf16le')).toBe('中');
    expect(() => decodeBytes(new Uint8Array([0x41]), 'utf16le')).toThrow(/偶数/);
  });

  it('二进制密文按 UTF-8 解要报错提示换 Hex/Base64，而不是吐乱码', () => {
    expect(() => decodeBytes(new Uint8Array([0xff, 0xfe, 0x00]), 'utf8')).toThrow(/Base64/);
  });

  it('base64 / hex 字符集下，decode 只是做格式化', () => {
    const bytes = new Uint8Array([1, 2, 3]);

    expect(decodeBytes(bytes, 'hex')).toBe('010203');
    expect(decodeBytes(bytes, 'base64')).toBe('AQID');
  });
});
