import { describe, expect, it } from 'vitest';
import { hexToBytes, bytesToHex } from '../crypto-utils/charset';
import { aesDecrypt, aesEncrypt, describeAesKey, isAesStreamMode, type AesConfig } from './aes-configurable';

/**
 * 用 NIST SP 800-38A 的官方测试向量对齐 —— 不是「自己算一遍自己验」。
 * 全部是 ECB/CBC/CFB/OFB/CTR 的第一块（16 字节整块，所以统一用 padding: none）。
 */
const NIST_KEY_128 = '2b7e151628aed2a6abf7158809cf4f3c';
const NIST_KEY_192 = '8e73b0f7da0e6452c810f32b809079e562f8ead2522c6b7b';
const NIST_KEY_256 = '603deb1015ca71be2b73aef0857d77811f352c073b6108d72d9810a30914dff4';
const NIST_PLAIN = '6bc1bee22e409f96e93d7e117393172a';
const NIST_IV = '000102030405060708090a0b0c0d0e0f';
const NIST_CTR = 'f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff';

function config(over: Partial<AesConfig> = {}): AesConfig {
  return {
    mode: 'cbc',
    bits: 128,
    padding: 'none',
    key: `[HEX]:${NIST_KEY_128}`,
    keyCharset: 'utf8',
    iv: `[HEX]:${NIST_IV}`,
    ivCharset: 'utf8',
    ...over,
  };
}

const hex = (bytes: Uint8Array) => bytesToHex(bytes);
const bytes = (value: string) => hexToBytes(value);

describe('NIST SP 800-38A 官方向量', () => {
  it('AES-128-ECB', () => {
    const out = aesEncrypt(bytes(NIST_PLAIN), config({ mode: 'ecb' }));

    expect(hex(out)).toBe('3ad77bb40d7a3660a89ecaf32466ef97');
  });

  it('AES-128-CBC', () => {
    expect(hex(aesEncrypt(bytes(NIST_PLAIN), config()))).toBe('7649abac8119b246cee98e9b12e9197d');
  });

  it('AES-128-CFB128', () => {
    expect(hex(aesEncrypt(bytes(NIST_PLAIN), config({ mode: 'cfb' })))).toBe('3b3fd92eb72dad20333449f8e83cfb4a');
  });

  it('AES-128-OFB', () => {
    expect(hex(aesEncrypt(bytes(NIST_PLAIN), config({ mode: 'ofb' })))).toBe('3b3fd92eb72dad20333449f8e83cfb4a');
  });

  it('AES-128-CTR', () => {
    const out = aesEncrypt(bytes(NIST_PLAIN), config({ mode: 'ctr', iv: `[HEX]:${NIST_CTR}` }));

    expect(hex(out)).toBe('874d6191b620e3261bef6864990db6ce');
  });

  it('AES-192-CBC', () => {
    const out = aesEncrypt(bytes(NIST_PLAIN), config({ bits: 192, key: `[HEX]:${NIST_KEY_192}` }));

    expect(hex(out)).toBe('4f021db243bc633d7178183a9fa071e8');
  });

  it('AES-256-CBC', () => {
    const out = aesEncrypt(bytes(NIST_PLAIN), config({ bits: 256, key: `[HEX]:${NIST_KEY_256}` }));

    expect(hex(out)).toBe('f58c4c04d6e5f1ba779eabfb5f7bfbd6');
  });

  it('每个向量都能解回原文', () => {
    const cases: AesConfig[] = [
      config({ mode: 'ecb' }),
      config(),
      config({ mode: 'cfb' }),
      config({ mode: 'ofb' }),
      config({ mode: 'ctr', iv: `[HEX]:${NIST_CTR}` }),
      config({ bits: 192, key: `[HEX]:${NIST_KEY_192}` }),
      config({ bits: 256, key: `[HEX]:${NIST_KEY_256}` }),
    ];

    for (const cfg of cases) {
      expect(hex(aesDecrypt(aesEncrypt(bytes(NIST_PLAIN), cfg), cfg))).toBe(NIST_PLAIN);
    }
  });
});

describe('填充', () => {
  it('PKCS#7 往返中文（CBC）', () => {
    const cfg = config({ padding: 'pkcs7' });
    const plain = new TextEncoder().encode('中文 AES 加密测试');

    expect(new TextDecoder().decode(aesDecrypt(aesEncrypt(plain, cfg), cfg))).toBe('中文 AES 加密测试');
  });

  it('Zero 填充往返（末尾无 0 的内容）', () => {
    const cfg = config({ padding: 'zero' });
    const plain = new TextEncoder().encode('abcdef');

    expect(new TextDecoder().decode(aesDecrypt(aesEncrypt(plain, cfg), cfg))).toBe('abcdef');
  });

  it('Ansix923 往返', () => {
    const cfg = config({ padding: 'ansix923' });
    const plain = new TextEncoder().encode('hello');

    expect(new TextDecoder().decode(aesDecrypt(aesEncrypt(plain, cfg), cfg))).toBe('hello');
  });

  it('ISO10126 往返', () => {
    const cfg = config({ padding: 'iso10126' });
    const plain = new TextEncoder().encode('hello world');

    expect(new TextDecoder().decode(aesDecrypt(aesEncrypt(plain, cfg), cfg))).toBe('hello world');
  });

  it('流模式忽略 padding 选项（选了 PKCS#7 也不会补块）', () => {
    const cfg = config({ mode: 'ctr', padding: 'pkcs7', iv: `[HEX]:${NIST_CTR}` });
    const plain = new TextEncoder().encode('x');

    // 流模式密文长度等于明文长度
    expect(aesEncrypt(plain, cfg).length).toBe(1);
  });

  it('isAesStreamMode 判定正确', () => {
    expect(isAesStreamMode('ctr')).toBe(true);
    expect(isAesStreamMode('ofb')).toBe(true);
    expect(isAesStreamMode('cfb')).toBe(true);
    expect(isAesStreamMode('cbc')).toBe(false);
    expect(isAesStreamMode('ecb')).toBe(false);
  });
});

describe('参数校验', () => {
  it('空密钥报错', () => {
    expect(() => aesEncrypt(bytes(NIST_PLAIN), config({ key: '' }))).toThrow(/不能为空/);
  });

  it('[HEX]: 里有非法字符时报错', () => {
    expect(() => aesEncrypt(bytes(NIST_PLAIN), config({ key: '[HEX]:zz' }))).toThrow(/十六进制字符/);
  });

  it('密钥不足位数时补 0x00（128 位密钥补到 16 字节）', () => {
    const short = config({ key: 'short' });
    const info = describeAesKey(short);

    expect(info.bytes.length).toBe(16);
    expect(info.delta).toBe(11);
  });

  it('ECB 不需要 IV，也不校验 IV', () => {
    expect(() => aesEncrypt(bytes(NIST_PLAIN), config({ mode: 'ecb', iv: '' }))).not.toThrow();
  });

  it('非 ECB 模式空 IV 报错', () => {
    expect(() => aesEncrypt(bytes(NIST_PLAIN), config({ iv: '' }))).toThrow(/需要 16 字节的 IV/);
  });

  it('分组模式密文不是整块时解密报错并说明原因', () => {
    expect(() => aesDecrypt(new Uint8Array(10), config())).toThrow(/不是 16 的整数倍/);
  });

  it('空密文报错', () => {
    expect(() => aesDecrypt(new Uint8Array(0), config())).toThrow(/没有可解密的密文/);
  });

  it('CBC 用错 IV 时填充校验失败（不会静默返回乱码）', () => {
    const cipher = aesEncrypt(new TextEncoder().encode('secret message'), config({ padding: 'pkcs7' }));
    const wrongIv = config({ padding: 'pkcs7', iv: `[HEX]:${'ff'.repeat(16)}` });

    expect(() => aesDecrypt(cipher, wrongIv)).toThrow(/填充校验不通过/);
  });
});
