/**
 * SM2 椭圆曲线公钥密码（GB/T 32918）。
 *
 * 三个和 RSA 不一样的坑，都在这一层收口：
 *
 * 1. **密文有两种排列**。C1C3C2 是国密标准（GM/T 0009）的顺序，C1C2C3 是早期实现
 *    （很多 Java 库和 BouncyCastle 老版本）的顺序。两者长度完全一样，选错了解出来
 *    是乱码而不是报错 —— 所以页面必须把这一项摆出来，而不是默认替用户猜。
 *
 * 2. **签名绑定 userId**。SM2 签名会把 userId（默认 "1234567812345678"）混进摘要，
 *    签名方与验签方用不同的 userId，验签必然失败且看不出原因。很多跨系统「验签不过」
 *    都是这一项不一致。
 *
 * 3. **公钥是 04 开头的 130 位十六进制**（未压缩点），私钥是 64 位。用户从别处复制时
 *    常丢掉 04 前缀，也常拿到 02/03 开头的压缩公钥 —— 这两种都要给出可操作的提示。
 */

import { sm2 } from 'sm-crypto';

export type Sm2CipherMode = 'c1c3c2' | 'c1c2c3';

/** GM/T 0009 规定的默认用户标识 */
export const SM2_DEFAULT_USER_ID = '1234567812345678';

const CIPHER_MODE_VALUE: Record<Sm2CipherMode, 0 | 1> = {
  // sm-crypto 的约定：1 = C1C3C2（国密标准），0 = C1C2C3（旧实现）
  c1c3c2: 1,
  c1c2c3: 0,
};

export interface Sm2KeyPairHex {
  privateKey: string;
  publicKey: string;
}

function hexOnly(input: string): string {
  // 容忍从本站其它加密工具带过来的 [HEX]: 前缀
  return input
    .trim()
    .replace(/^\[HEX\]:/i, '')
    .replace(/0x/gi, '')
    .replace(/[\s:,-]/g, '')
    .toLowerCase();
}

/**
 * 归一公钥：容忍缺 04 前缀（补上）、容忍空格与大小写。
 * 压缩公钥（02/03 开头 66 位）明确拒绝并说明怎么解压 —— 悄悄当错的用只会得到乱码。
 */
export function normalizeSm2PublicKey(input: string): string {
  const hex = hexOnly(input);

  if (hex === '') {
    throw new Error('公钥是空的');
  }
  if (!/^[0-9a-f]+$/.test(hex)) {
    const bad = hex.replace(/[0-9a-f]/g, '').slice(0, 6);

    throw new Error(`公钥里有非十六进制字符：${JSON.stringify(bad)}`);
  }
  if (hex.length === 128) {
    // 少了 04 前缀（未压缩点标识），补回来即可
    return `04${hex}`;
  }
  if (hex.length === 130) {
    if (!hex.startsWith('04')) {
      throw new Error('130 位公钥必须以 04 开头（未压缩点），现在的前两位是 ' + hex.slice(0, 2));
    }

    return hex;
  }
  if (hex.length === 66 && (hex.startsWith('02') || hex.startsWith('03'))) {
    throw new Error(
      '这是压缩格式的 SM2 公钥（02 / 03 开头，66 位）。本站按未压缩格式运算，请先用 openssl ec -pubin -in key.pem -text 之类的方式解压，或直接提供 04 开头的 130 位公钥。',
    );
  }

  throw new Error(`公钥长度是 ${hex.length} 个十六进制字符，SM2 未压缩公钥应为 130 个（04 开头 + 64 位 X + 64 位 Y）`);
}

export function normalizeSm2PrivateKey(input: string): string {
  const hex = hexOnly(input);

  if (hex === '') {
    throw new Error('私钥是空的');
  }
  if (!/^[0-9a-f]+$/.test(hex)) {
    const bad = hex.replace(/[0-9a-f]/g, '').slice(0, 6);

    throw new Error(`私钥里有非十六进制字符：${JSON.stringify(bad)}`);
  }
  if (hex.length !== 64) {
    throw new Error(`私钥长度是 ${hex.length} 个十六进制字符，SM2 私钥固定为 64 个（32 字节）`);
  }

  return hex;
}

export function generateSm2KeyPair(): Sm2KeyPairHex {
  const pair = sm2.generateKeyPairHex();

  return { privateKey: pair.privateKey, publicKey: pair.publicKey };
}

/** 从私钥推导公钥（用户只给了私钥时用） */
export function publicKeyFromPrivate(privateKeyInput: string): string {
  return sm2.getPublicKeyFromPrivateKey(normalizeSm2PrivateKey(privateKeyInput));
}

// ---------------------------------------------------------------- 加解密

/**
 * 密文的固定开销：C1 64 字节（X||Y，sm-crypto 不带 04 标识）+ C3 32 字节摘要 = 96。
 * 实测：17 字节明文 → 113 字节密文，正好差 96。
 */
const SM2_OVERHEAD = 96;

/** 某一模式下的密文长度（字节），用于解密前的长度校验 */
export function sm2CipherBytesForPlainLength(plainLength: number): number {
  return plainLength + SM2_OVERHEAD;
}

export function encryptSm2(plainBytes: Uint8Array, publicKeyInput: string, mode: Sm2CipherMode): Uint8Array {
  const publicKey = normalizeSm2PublicKey(publicKeyInput);

  if (!sm2.verifyPublicKey(publicKey)) {
    throw new Error('这个公钥不在 SM2 曲线（sm2p256v1）上 —— 多半是复制时漏了字符，或者它其实是另一条曲线的公钥');
  }
  if (plainBytes.length === 0) {
    throw new Error('没有可加密的内容');
  }
  // 传 number[] 而不是字符串：字符串会被库按它自己的 UTF-8 规则再转一遍，
  // 而我们已经在外面按用户选的字符集编好了码（可能是 GBK）
  const cipherHex = sm2.doEncrypt(Array.from(plainBytes), publicKey, CIPHER_MODE_VALUE[mode]);

  return hexToUint8(cipherHex);
}

export function decryptSm2(cipherBytes: Uint8Array, privateKeyInput: string, mode: Sm2CipherMode): Uint8Array {
  const privateKey = normalizeSm2PrivateKey(privateKeyInput);

  if (cipherBytes.length <= SM2_OVERHEAD) {
    throw new Error(
      `密文只有 ${cipherBytes.length} 字节，至少要有 ${SM2_OVERHEAD + 1} 字节（C1 64 字节 + C3 32 字节 + 正文）。多半是复制不完整或格式选错。`,
    );
  }
  const cipherHex = uint8ToHex(cipherBytes);
  let plainBytes: number[];

  try {
    // 必须显式要 output: 'array' —— doDecrypt 默认返回**已经解码的字符串**（output: 'string'），
    // 拿它当十六进制再解一次会得到一串全零字节。踩过。
    plainBytes = sm2.doDecrypt(cipherHex, privateKey, CIPHER_MODE_VALUE[mode], { output: 'array' }) as number[];
  }
  catch (error) {
    throw new Error(
      `解密失败：${(error as Error).message}。最常见的原因是私钥不对，或密文的排列方式（C1C3C2 / C1C2C3）与加密方不一致。`,
    );
  }
  if (!plainBytes || plainBytes.length === 0) {
    throw new Error('解密结果为空：私钥可能不对，或密文的 C1 部分不是这条曲线上的点');
  }

  return new Uint8Array(plainBytes);
}

// ---------------------------------------------------------------- 签名

export interface Sm2SignOptions {
  userId?: string;
  /** DER 编码（Java / openssl 常用）；默认 false 即 r||s 拼接 */
  der?: boolean;
}

function assertUserId(userId: string): string {
  const value = userId.trim();

  return value === '' ? SM2_DEFAULT_USER_ID : value;
}

export function signSm2(messageBytes: Uint8Array, privateKeyInput: string, options: Sm2SignOptions = {}): Uint8Array {
  const privateKey = normalizeSm2PrivateKey(privateKeyInput);

  if (messageBytes.length === 0) {
    throw new Error('没有可签名的内容');
  }
  const hex = sm2.doSignature(Array.from(messageBytes), privateKey, {
    hash: true,
    // publicKey 必须给：签名内部要算 Z 值（含公钥），不给会算错
    publicKey: publicKeyFromPrivate(privateKey),
    userId: assertUserId(options.userId ?? ''),
    der: options.der ?? false,
  });

  return hexToUint8(hex);
}

export function verifySm2(
  messageBytes: Uint8Array,
  signatureBytes: Uint8Array,
  publicKeyInput: string,
  options: Sm2SignOptions = {},
): boolean {
  const publicKey = normalizeSm2PublicKey(publicKeyInput);
  const der = options.der ?? false;

  // r||s 固定 64 字节；DER 长度随整数前导零浮动（通常 70~72 字节）
  if (!der && signatureBytes.length !== 64) {
    throw new Error(
      `签名是 ${signatureBytes.length} 字节，非 DER 格式的 SM2 签名固定 64 字节（r 32 字节 + s 32 字节）。长度不对多半是复制不完整，或者它其实是 DER 格式。`,
    );
  }
  try {
    return sm2.doVerifySignature(Array.from(messageBytes), uint8ToHex(signatureBytes), publicKey, {
      hash: true,
      userId: assertUserId(options.userId ?? ''),
      der,
    });
  }
  catch {
    return false;
  }
}

// ---------------------------------------------------------------- 字节工具

function hexToUint8(hex: string): Uint8Array {
  const clean = hex.replace(/\s/g, '');
  const out = new Uint8Array(Math.floor(clean.length / 2));

  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }

  return out;
}

function uint8ToHex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
