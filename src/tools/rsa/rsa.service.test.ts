import { beforeAll, describe, expect, it } from 'vitest';
import {
  decryptRsa,
  encryptRsa,
  generateRsaKeyPair,
  maxPlaintextBytes,
  parsePrivateKey,
  parsePublicKey,
  signRsa,
  verifyRsa,
  type RsaKeyPairPem,
} from './rsa.service';

const utf8 = (text: string) => new TextEncoder().encode(text);
const fromUtf8 = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

// 1024 位生成最快，单测里用它；位数相关的断言单独用 2048 校验一次
let keys: RsaKeyPairPem;

beforeAll(() => {
  keys = generateRsaKeyPair(1024);
}, 30_000);

describe('密钥生成', () => {
  it('公钥是 SPKI 头、私钥是 PKCS#1 头、另有一份 PKCS#8', () => {
    expect(keys.publicKeyPem.startsWith('-----BEGIN PUBLIC KEY-----')).toBe(true);
    expect(keys.privateKeyPem.startsWith('-----BEGIN RSA PRIVATE KEY-----')).toBe(true);
    expect(keys.privateKeyPkcs8Pem.startsWith('-----BEGIN PRIVATE KEY-----')).toBe(true);
    expect(keys.bits).toBe(1024);
  });

  it('公钥能解析回同样的位数', () => {
    expect(parsePublicKey(keys.publicKeyPem).n.bitLength()).toBe(1024);
  });

  it('PKCS#1 与 PKCS#8 私钥解析出的是同一把钥匙', () => {
    const a = parsePrivateKey(keys.privateKeyPem);
    const b = parsePrivateKey(keys.privateKeyPkcs8Pem);

    expect(a.n.equals(b.n)).toBe(true);
    expect(a.d.equals(b.d)).toBe(true);
  });

  it('不支持的位数直接报错', () => {
    expect(() => generateRsaKeyPair(512 as never)).toThrow(/只能选/);
  });
});

describe('PEM 容错', () => {
  it('只给裸 base64 也能解析出公钥', () => {
    const body = keys.publicKeyPem.replace(/-----[A-Z ]+-----/g, '').replace(/\s/g, '');

    expect(parsePublicKey(body).n.bitLength()).toBe(1024);
  });

  it('PKCS#1 公钥头（BEGIN RSA PUBLIC KEY）也认', () => {
    const pkc1 = keys.publicKeyPem.replace('BEGIN PUBLIC KEY', 'BEGIN RSA PUBLIC KEY').replace('END PUBLIC KEY', 'END RSA PUBLIC KEY');
    const key = parsePublicKey(pkc1);

    expect(key.n.bitLength()).toBe(1024);
  });

  it('把私钥填进公钥框时，提示明确指出这是私钥', () => {
    expect(() => parsePublicKey(keys.privateKeyPem)).toThrow(/这是\*\*私钥\*\*/);
  });

  it('把公钥填进私钥框时，提示明确指出这是公钥', () => {
    expect(() => parsePrivateKey(keys.publicKeyPem)).toThrow(/这是\*\*公钥\*\*/);
  });

  it('EC / OpenSSH 密钥给出针对性的提示', () => {
    expect(() => parsePublicKey('-----BEGIN EC PRIVATE KEY-----\nabc\n-----END EC PRIVATE KEY-----')).toThrow(/EC 密钥/);
  });

  it('空输入报错而不是静默返回 null', () => {
    expect(() => parsePublicKey('')).toThrow(/空的|不是一个能解析/);
  });
});

describe('加密解密', () => {
  it('PKCS#1 v1.5 往返', () => {
    const cipher = encryptRsa(utf8('hello RSA'), keys.publicKeyPem, { padding: 'pkcs1' });
    const plain = decryptRsa(cipher, keys.privateKeyPem, { padding: 'pkcs1' });

    expect(fromUtf8(plain)).toBe('hello RSA');
  });

  it('OAEP-SHA256 往返（含中文）', () => {
    const cipher = encryptRsa(utf8('中文也行 🎉'), keys.publicKeyPem, { padding: 'oaep', hash: 'sha256' });
    const plain = decryptRsa(cipher, keys.privateKeyPem, { padding: 'oaep', hash: 'sha256' });

    expect(fromUtf8(plain)).toBe('中文也行 🎉');
  });

  it('OAEP 用 PKCS#1 去解会失败（提示填充校验不通过）', () => {
    const cipher = encryptRsa(utf8('x'), keys.publicKeyPem, { padding: 'oaep' });

    expect(() => decryptRsa(cipher, keys.privateKeyPem, { padding: 'pkcs1' })).toThrow(/填充校验不通过/);
  });

  it('密文长度恒等于密钥长度', () => {
    const cipher = encryptRsa(utf8('x'), keys.publicKeyPem, { padding: 'pkcs1' });

    expect(cipher.length).toBe(128);
  });

  it('换一把密钥解不出来', () => {
    const other = generateRsaKeyPair(1024);
    const cipher = encryptRsa(utf8('x'), keys.publicKeyPem, { padding: 'pkcs1' });

    expect(() => decryptRsa(cipher, other.privateKeyPem, { padding: 'pkcs1' })).toThrow(/填充校验不通过/);
  });
});

describe('明文长度上限', () => {
  it('1024 位：PKCS#1 上限 117、OAEP-SHA256 上限 62', () => {
    expect(maxPlaintextBytes(1024, 'pkcs1')).toBe(117);
    expect(maxPlaintextBytes(1024, 'oaep', 'sha256')).toBe(62);
  });

  it('2048 位：PKCS#1 上限 245、OAEP-SHA256 上限 190', () => {
    expect(maxPlaintextBytes(2048, 'pkcs1')).toBe(245);
    expect(maxPlaintextBytes(2048, 'oaep', 'sha256')).toBe(190);
  });

  it('刚好到上限能加密，多 1 字节就报错并给出超了多少', () => {
    const limit = maxPlaintextBytes(1024, 'pkcs1');
    const ok = encryptRsa(new Uint8Array(limit).fill(65), keys.publicKeyPem, { padding: 'pkcs1' });

    expect(ok.length).toBe(128);
    expect(() => encryptRsa(new Uint8Array(limit + 1).fill(65), keys.publicKeyPem, { padding: 'pkcs1' })).toThrow(
      new RegExp(`最多 ${limit} 字节.*超了 1 字节`),
    );
  });

  it('空明文报错', () => {
    expect(() => encryptRsa(new Uint8Array(0), keys.publicKeyPem, { padding: 'pkcs1' })).toThrow(/没有可加密/);
  });

  it('密文长度不对时给出「长度必须等于密钥长度」的解释', () => {
    expect(() => decryptRsa(new Uint8Array(64), keys.privateKeyPem, { padding: 'pkcs1' })).toThrow(/恒等于密钥长度/);
  });
});

describe('签名验签', () => {
  it('SHA-256 签名后能验过', () => {
    const message = utf8('要签名的内容');
    const signature = signRsa(message, keys.privateKeyPem, 'sha256');

    expect(verifyRsa(message, signature, keys.publicKeyPem, 'sha256')).toBe(true);
  });

  it('消息被改一个字节就验不过', () => {
    const signature = signRsa(utf8('原始消息'), keys.privateKeyPem, 'sha256');

    expect(verifyRsa(utf8('原始消西'), signature, keys.publicKeyPem, 'sha256')).toBe(false);
  });

  it('哈希算法不一致时验不过（SHA-256 签的用 SHA-1 验）', () => {
    const message = utf8('abc');
    const signature = signRsa(message, keys.privateKeyPem, 'sha256');

    expect(verifyRsa(message, signature, keys.publicKeyPem, 'sha1')).toBe(false);
  });

  it('换公钥验不过', () => {
    const other = generateRsaKeyPair(1024);
    const message = utf8('abc');
    const signature = signRsa(message, keys.privateKeyPem, 'sha256');

    expect(verifyRsa(message, signature, other.publicKeyPem, 'sha256')).toBe(false);
  });

  it('长消息也能签（签名先哈希，不受 RSA 长度限制）', () => {
    const message = new Uint8Array(5000).fill(97);
    const signature = signRsa(message, keys.privateKeyPem, 'sha256');

    expect(signature.length).toBe(128);
    expect(verifyRsa(message, signature, keys.publicKeyPem, 'sha256')).toBe(true);
  });

  it('签名长度不对时给出可读提示', () => {
    expect(() => verifyRsa(utf8('a'), new Uint8Array(10), keys.publicKeyPem, 'sha256')).toThrow(/不是签名|截断/);
  });

  it('签名是确定性的（PKCS#1 v1.5 签名不做随机化）', () => {
    const message = utf8('same message');
    const a = signRsa(message, keys.privateKeyPem, 'sha256');
    const b = signRsa(message, keys.privateKeyPem, 'sha256');

    expect(hex(a)).toBe(hex(b));
  });
});
