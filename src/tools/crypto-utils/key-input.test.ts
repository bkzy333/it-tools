import { describe, expect, it } from 'vitest';
import { HEX_PREFIX, parseKeyInput, splitHexPrefix } from './key-input';

const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

describe('splitHexPrefix', () => {
  it('认出前缀，并把后面的内容原样留下', () => {
    expect(splitHexPrefix('[HEX]:0011')).toEqual({ body: '0011', usedHexPrefix: true });
  });

  it('前缀大小写不敏感，且容忍前导空白', () => {
    expect(splitHexPrefix('  [hex]:aabb')).toEqual({ body: 'aabb', usedHexPrefix: true });
  });

  it('没有前缀原样返回', () => {
    expect(splitHexPrefix('my key')).toEqual({ body: 'my key', usedHexPrefix: false });
  });

  it('前缀出现在中间不算前缀（否则口令里的 [HEX]: 会被误判）', () => {
    expect(splitHexPrefix('a[HEX]:0011').usedHexPrefix).toBe(false);
  });
});

describe('parseKeyInput', () => {
  it('不带前缀按字符集编码', () => {
    const parsed = parseKeyInput('my secret key 16', 'utf8');

    expect(parsed.usedHexPrefix).toBe(false);
    expect(parsed.bytes.length).toBe(16);
    expect(parsed.targetLength).toBeNull();
    expect(parsed.delta).toBeNull();
  });

  it('带前缀按原始字节解析，不受字符集影响', () => {
    const parsed = parseKeyInput('[HEX]:00112233445566778899aabbccddeeff', 'utf8', 16);

    expect(hex(parsed.bytes)).toBe('00112233445566778899aabbccddeeff');
    expect(parsed.usedHexPrefix).toBe(true);
    expect(parsed.delta).toBe(0);
  });

  it('前缀后的十六进制容忍空格、冒号、连字符、0x 与大小写', () => {
    const parsed = parseKeyInput('[HEX]:00 11:22-33 0xAA bb', 'utf8', null);

    expect(hex(parsed.bytes)).toBe('00112233aabb');
  });

  it('前缀后出现非法字符时报错，并指出是哪个字符', () => {
    expect(() => parseKeyInput('[HEX]:00zz', 'utf8', null)).toThrow(/十六进制字符.*"z"/);
  });

  it('前缀后是奇数长度时明确报错（不能悄悄补 0）', () => {
    expect(() => parseKeyInput('[HEX]:001', 'utf8', null)).toThrow(/奇数/);
  });

  it('不足目标长度时末尾补 0x00', () => {
    const parsed = parseKeyInput('1234567890', 'utf8', 16);

    expect(parsed.sourceLength).toBe(10);
    expect(parsed.delta).toBe(6);
    expect(parsed.bytes.length).toBe(16);
    expect(hex(parsed.bytes.slice(10))).toBe('000000000000');
  });

  it('超出目标长度时丢弃末尾多余部分', () => {
    const parsed = parseKeyInput('0123456789abcdefEXTRA', 'utf8', 16);

    expect(parsed.sourceLength).toBe(21);
    expect(parsed.delta).toBe(-5);
    expect(hex(parsed.bytes)).toBe(hex(new TextEncoder().encode('0123456789abcdef')));
  });

  it('刚好等长时 delta 是 0（UI 据此不显示补齐提示）', () => {
    expect(parseKeyInput('0123456789abcdef', 'utf8', 16).delta).toBe(0);
  });

  it('GBK 密钥按两字节一字计算（中文 8 字 = 16 字节正合适）', () => {
    const parsed = parseKeyInput('中文密钥测试八字', 'gbk', 16);

    expect(parsed.sourceLength).toBe(16);
    expect(parsed.delta).toBe(0);
  });

  it('GBK 与 UTF-8 对同一串中文给出不同长度（确认真的按字符集算了）', () => {
    const text = '中文密钥';

    expect(parseKeyInput(text, 'gbk').sourceLength).toBe(8);
    expect(parseKeyInput(text, 'utf8').sourceLength).toBe(12);
  });

  it('十六进制字符集下的明文文本也走 hex 解析（不带前缀时）', () => {
    const parsed = parseKeyInput('00112233', 'hex', null);

    expect(hex(parsed.bytes)).toBe('00112233');
    expect(parsed.usedHexPrefix).toBe(false);
  });

  it('空前缀内容是 0 字节，补齐后仍是目标长度的全零密钥', () => {
    const parsed = parseKeyInput(`${HEX_PREFIX}`, 'utf8', 4);

    expect(hex(parsed.bytes)).toBe('00000000');
    expect(parsed.delta).toBe(4);
  });
});
