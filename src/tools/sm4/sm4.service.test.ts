import { describe, expect, it } from 'vitest';
import { hexToBytes } from '../crypto-utils/charset';
import { decryptSm4, encryptSm4, SM4_BLOCK_SIZE, type Sm4Config } from './sm4.service';

const KEY_HEX = '0123456789abcdeffedcba9876543210';
const IV_HEX = '000102030405060708090a0b0c0d0e0f';

function config(over: Partial<Sm4Config> = {}): Sm4Config {
  return {
    mode: 'cbc',
    padding: 'pkcs7',
    key: `[HEX]:${KEY_HEX}`,
    keyCharset: 'utf8',
    iv: `[HEX]:${IV_HEX}`,
    ivCharset: 'utf8',
    ...over,
  };
}

const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const utf8 = (text: string) => new TextEncoder().encode(text);
const fromUtf8 = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe('SM4 官方向量（GB/T 32907 附录 A）', () => {
  it('ECB + 不填充时命中标准密文 681edf34d206965e86b3e94f536e4246', () => {
    // 标准用例：key = 明文 = 0123456789abcdeffedcba9876543210
    const cipher = encryptSm4(hexToBytes(KEY_HEX), config({ mode: 'ecb', padding: 'none' }));

    expect(hex(cipher)).toBe('681edf34d206965e86b3e94f536e4246');
  });

  it('对同一向量的密文能解回原文', () => {
    const plain = decryptSm4(hexToBytes('681edf34d206965e86b3e94f536e4246'), config({ mode: 'ecb', padding: 'none' }));

    expect(hex(plain)).toBe(KEY_HEX);
  });
});

describe('SM4 往返', () => {
  it('CBC + PKCS7 往返中文', () => {
    const plain = utf8('国密算法 SM4 测试');

    expect(fromUtf8(decryptSm4(encryptSm4(plain, config()), config()))).toBe('国密算法 SM4 测试');
  });

  it('ECB + PKCS7 往返', () => {
    const cfg = config({ mode: 'ecb' });

    expect(fromUtf8(decryptSm4(encryptSm4(utf8('hello'), cfg), cfg))).toBe('hello');
  });

  it('刚好 16 字节的明文在 PKCS7 下会多出一整块（这是标准行为，不是 bug）', () => {
    const cfg = config();

    expect(encryptSm4(utf8('0123456789abcdef'), cfg).length).toBe(SM4_BLOCK_SIZE * 2);
    expect(fromUtf8(decryptSm4(encryptSm4(utf8('0123456789abcdef'), cfg), cfg))).toBe('0123456789abcdef');
  });

  it('换 IV 会得到不同密文，且各自的密文都只能用自己的 IV 解', () => {
    const a = config({ iv: `[HEX]:${IV_HEX}` });
    const b = config({ iv: `[HEX]:${'ff'.repeat(16)}` });
    const ca = encryptSm4(utf8('same plaintext'), a);
    const cb = encryptSm4(utf8('same plaintext'), b);

    expect(hex(ca)).not.toBe(hex(cb));
    expect(fromUtf8(decryptSm4(ca, a))).toBe('same plaintext');
    expect(fromUtf8(decryptSm4(cb, b))).toBe('same plaintext');
  });
});

describe('SM4 密钥归一', () => {
  it('密钥不足 16 字节时补 0x00，且与「显式写全 0x00」结果一致', () => {
    const short = config({ key: 'shortkey' });
    const explicit = config({ key: `[HEX]:${hex(utf8('shortkey'))}${'00'.repeat(8)}` });

    expect(hex(encryptSm4(utf8('x'), short))).toBe(hex(encryptSm4(utf8('x'), explicit)));
  });

  it('密钥超出 16 字节时截断，且与只用前 16 字节结果一致', () => {
    const long = config({ key: `[HEX]:${KEY_HEX}ffffffffffffffff` });

    expect(hex(encryptSm4(utf8('x'), long))).toBe(hex(encryptSm4(utf8('x'), config())));
  });

  it('[HEX]: 前缀里的非法字符直接报错，不会悄悄当成文本', () => {
    expect(() => encryptSm4(utf8('x'), config({ key: '[HEX]:zz' }))).toThrow(/十六进制字符/);
  });

  it('空密钥明确报错', () => {
    expect(() => encryptSm4(utf8('x'), config({ key: '' }))).toThrow(/不能为空/);
  });

  it('CBC 模式下空 IV 明确报错（避免默默用全零 IV）', () => {
    expect(() => encryptSm4(utf8('x'), config({ iv: '' }))).toThrow(/IV/);
  });
});

describe('SM4 不填充模式', () => {
  it('明文不是 16 的倍数时报错并说明该补到多少', () => {
    expect(() => encryptSm4(utf8('abc'), config({ padding: 'none' }))).toThrow(/整数倍.*3 字节.*16 字节/);
  });

  it('16 倍数明文可以不填充，密文长度等于明文长度', () => {
    const cfg = config({ padding: 'none' });
    const plain = utf8('0123456789abcdef');

    expect(encryptSm4(plain, cfg).length).toBe(16);
    expect(fromUtf8(decryptSm4(encryptSm4(plain, cfg), cfg))).toBe('0123456789abcdef');
  });

  it('密文不是 16 的倍数时解密报错（不让库静默产出半截结果）', () => {
    expect(() => decryptSm4(new Uint8Array(10), config())).toThrow(/不是 16 的整数倍/);
  });
});

describe('SM4 错误密钥', () => {
  it('PKCS7 下用错密钥会给出可读提示而不是英文栈', () => {
    const cipher = encryptSm4(utf8('secret message'), config());

    expect(() => decryptSm4(cipher, config({ key: `[HEX]:${'11'.repeat(16)}` }))).toThrow(/填充校验不通过/);
  });
});
