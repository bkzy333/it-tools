import { describe, expect, it } from 'vitest';
import {
  decryptSm2,
  encryptSm2,
  generateSm2KeyPair,
  normalizeSm2PrivateKey,
  normalizeSm2PublicKey,
  publicKeyFromPrivate,
  signSm2,
  SM2_DEFAULT_USER_ID,
  sm2CipherBytesForPlainLength,
  verifySm2,
  type Sm2KeyPairHex,
} from './sm2.service';

const utf8 = (text: string) => new TextEncoder().encode(text);
const fromUtf8 = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

// 生成一次共享给所有用例（SM2 生成是纯计算，很快，但没必要每例一次）
const keys: Sm2KeyPairHex = generateSm2KeyPair();

describe('密钥格式', () => {
  it('私钥 64 位、公钥 130 位且 04 开头', () => {
    expect(keys.privateKey).toMatch(/^[0-9a-f]{64}$/);
    expect(keys.publicKey).toMatch(/^04[0-9a-f]{128}$/);
  });

  it('从私钥能推出同一把公钥', () => {
    expect(publicKeyFromPrivate(keys.privateKey)).toBe(keys.publicKey);
  });

  it('公钥缺 04 前缀时自动补上', () => {
    expect(normalizeSm2PublicKey(keys.publicKey.slice(2))).toBe(keys.publicKey);
  });

  it('公钥容忍空格、冒号与大小写', () => {
    const messy = keys.publicKey.toUpperCase().replace(/(.{16})/g, '$1 ');

    expect(normalizeSm2PublicKey(messy)).toBe(keys.publicKey);
  });

  it('压缩公钥（02 开头 66 位）明确拒绝并说明怎么解压', () => {
    expect(() => normalizeSm2PublicKey(`02${'11'.repeat(32)}`)).toThrow(/压缩格式/);
  });

  it('长度不对时报错并写出应有长度', () => {
    expect(() => normalizeSm2PublicKey('04abcd')).toThrow(/130 个/);
  });

  it('公钥里有非十六进制字符时报错', () => {
    expect(() => normalizeSm2PublicKey('04zz')).toThrow(/非十六进制/);
  });

  it('私钥长度不是 64 位时报错', () => {
    expect(() => normalizeSm2PrivateKey('abcd')).toThrow(/固定为 64/);
  });

  it('空输入分别报错', () => {
    expect(() => normalizeSm2PublicKey('')).toThrow(/空的/);
    expect(() => normalizeSm2PrivateKey('  ')).toThrow(/空的/);
  });
});

describe('加解密', () => {
  it('C1C3C2 往返中文', () => {
    const cipher = encryptSm2(utf8('国密 SM2 测试'), keys.publicKey, 'c1c3c2');
    const plain = decryptSm2(cipher, keys.privateKey, 'c1c3c2');

    expect(fromUtf8(plain)).toBe('国密 SM2 测试');
  });

  it('C1C2C3 往返', () => {
    const cipher = encryptSm2(utf8('老实现的排列'), keys.publicKey, 'c1c2c3');

    expect(fromUtf8(decryptSm2(cipher, keys.privateKey, 'c1c2c3'))).toBe('老实现的排列');
  });

  it('两种排列长度一样但内容不同（选错不会报错，会解出乱码 —— 所以页面必须让人选）', () => {
    const a = encryptSm2(utf8('same'), keys.publicKey, 'c1c3c2');
    const b = encryptSm2(utf8('same'), keys.publicKey, 'c1c2c3');

    expect(a.length).toBe(b.length);
    expect(hex(a)).not.toBe(hex(b));
  });

  it('密文长度 = 明文长度 + 96（C1 64 字节 X||Y + C3 32 字节）', () => {
    const plain = utf8('1234567890');

    expect(encryptSm2(plain, keys.publicKey, 'c1c3c2').length).toBe(sm2CipherBytesForPlainLength(10));
  });

  it('SM2 加密是随机化的：同一明文两次加密结果不同', () => {
    const a = encryptSm2(utf8('same'), keys.publicKey, 'c1c3c2');
    const b = encryptSm2(utf8('same'), keys.publicKey, 'c1c3c2');

    expect(hex(a)).not.toBe(hex(b));
  });

  it('换一把私钥解不开', () => {
    const other = generateSm2KeyPair();
    const cipher = encryptSm2(utf8('secret'), keys.publicKey, 'c1c3c2');

    expect(() => decryptSm2(cipher, other.privateKey, 'c1c3c2')).toThrow();
  });

  it('密文太短时给出长度说明而不是抛底层异常', () => {
    expect(() => decryptSm2(new Uint8Array(10), keys.privateKey, 'c1c3c2')).toThrow(/至少要有 97 字节/);
  });

  it('空明文报错', () => {
    expect(() => encryptSm2(new Uint8Array(0), keys.publicKey, 'c1c3c2')).toThrow(/没有可加密/);
  });

  it('不在曲线上的公钥被拦下', () => {
    expect(() => encryptSm2(utf8('x'), `04${'00'.repeat(64)}`, 'c1c3c2')).toThrow(/不在 SM2 曲线/);
  });
});

describe('签名验签', () => {
  it('默认 userId 下签名 64 字节、验签通过', () => {
    const message = utf8('要签名的内容');
    const signature = signSm2(message, keys.privateKey);

    expect(signature.length).toBe(64);
    expect(verifySm2(message, signature, keys.publicKey)).toBe(true);
    expect(SM2_DEFAULT_USER_ID).toBe('1234567812345678');
  });

  it('改一个字节就验不过', () => {
    const signature = signSm2(utf8('原始消息'), keys.privateKey);

    expect(verifySm2(utf8('原始消西'), signature, keys.publicKey)).toBe(false);
  });

  it('换公钥验不过', () => {
    const other = generateSm2KeyPair();
    const signature = signSm2(utf8('abc'), keys.privateKey);

    expect(verifySm2(utf8('abc'), signature, other.publicKey)).toBe(false);
  });

  it('userId 不一致时验签失败（跨系统「验签不过」的头号原因）', () => {
    const message = utf8('abc');
    const signature = signSm2(message, keys.privateKey, { userId: 'alice@example.com' });

    expect(verifySm2(message, signature, keys.publicKey)).toBe(false);
    expect(verifySm2(message, signature, keys.publicKey, { userId: 'alice@example.com' })).toBe(true);
  });

  it('空 userId 等同默认值', () => {
    const message = utf8('abc');

    expect(verifySm2(message, signSm2(message, keys.privateKey, { userId: '   ' }), keys.publicKey)).toBe(true);
  });

  it('DER 签名能签能验，且长度与 raw 不同', () => {
    const message = utf8('abc');
    const raw = signSm2(message, keys.privateKey);
    const der = signSm2(message, keys.privateKey, { der: true });

    expect(der.length).not.toBe(64);
    expect(verifySm2(message, der, keys.publicKey, { der: true })).toBe(true);
    // 把 DER 当 raw 验会先被长度校验拦下
    expect(() => verifySm2(message, der, keys.publicKey)).toThrow(/固定 64 字节/);
  });

  it('长消息也能签（先哈希）', () => {
    const message = new Uint8Array(4000).fill(66);
    const signature = signSm2(message, keys.privateKey);

    expect(verifySm2(message, signature, keys.publicKey)).toBe(true);
  });

  it('签名是随机化的：同一消息两次签出不同结果，但都能验过', () => {
    const message = utf8('same');
    const a = signSm2(message, keys.privateKey);
    const b = signSm2(message, keys.privateKey);

    expect(hex(a)).not.toBe(hex(b));
    expect(verifySm2(message, a, keys.publicKey)).toBe(true);
    expect(verifySm2(message, b, keys.publicKey)).toBe(true);
  });

  it('空消息报错', () => {
    expect(() => signSm2(new Uint8Array(0), keys.privateKey)).toThrow(/没有可签名/);
  });
});
