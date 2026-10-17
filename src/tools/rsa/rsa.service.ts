/**
 * RSA 加解密与签名（node-forge）。
 *
 * 三件值得单独说明的事：
 *
 * 1. **RSA 不能加密长文本**。PKCS#1 v1.5 的上限是 keyBytes - 11，OAEP-SHA256 是
 *    keyBytes - 2*32 - 2 —— 2048 位密钥下分别是 245 和 190 字节。forge 自己会抛
 *    "Message is too long for PKCS#1 v1.5 padding."，那句英文对普通用户等于没说，
 *    所以这里先自己算一遍上限，超了就用中文说清「最多多少字节、超了多少」。
 *
 * 2. **PEM 的四种头都要认**。公钥有 SPKI（BEGIN PUBLIC KEY）和 PKCS#1
 *    （BEGIN RSA PUBLIC KEY），私钥有 PKCS#1（BEGIN RSA PRIVATE KEY）和
 *    PKCS#8（BEGIN PRIVATE KEY）。用户从 openssl、Java、各种在线工具拿到的
 *    格式各不相同，只认一种就会一直「解析失败」。另外很多人只复制了裸 base64，
 *    所以没有 BEGIN 行时也尝试补头解析。
 *
 * 3. **签名不是加密**。签名用私钥、验签用公钥，且消息先哈希再签，所以消息长度
 *    不受 RSA 长度限制 —— 这一点和加密正好相反，页面上要分开讲。
 */

import forge from 'node-forge';

export type RsaKeySize = 1024 | 2048 | 4096;
export type RsaPadding = 'pkcs1' | 'oaep';
export type RsaHash = 'sha1' | 'sha256' | 'sha512';

export const RSA_KEY_SIZES: RsaKeySize[] = [1024, 2048, 4096];
export const RSA_PADDINGS: RsaPadding[] = ['pkcs1', 'oaep'];
export const RSA_HASHES: RsaHash[] = ['sha256', 'sha1', 'sha512'];

/** 各哈希的摘要长度（字节），算 OAEP 上限要用 */
const HASH_LENGTH: Record<RsaHash, number> = { sha1: 20, sha256: 32, sha512: 64 };

// `as const` 不能省：forge 的 encrypt/decrypt 第二个参数是字面量联合类型
// （EncryptionScheme），写成 Record<string, string> 会丢掉字面量而报类型错。
const PADDING_SCHEME = {
  pkcs1: 'RSAES-PKCS1-V1_5',
  oaep: 'RSA-OAEP',
} as const satisfies Record<RsaPadding, string>;

export interface RsaKeyPairPem {
  publicKeyPem: string;
  /** PKCS#1 私钥（BEGIN RSA PRIVATE KEY），兼容面最广 */
  privateKeyPem: string;
  /** PKCS#8 私钥（BEGIN PRIVATE KEY），Java / openssl genpkey 常用 */
  privateKeyPkcs8Pem: string;
  bits: number;
}

// ---------------------------------------------------------------- 字节 ↔ forge

/** forge 全程用「binary string」（每字符 0-255），这里统一转 */
function bytesToBinary(bytes: Uint8Array): string {
  let out = '';

  for (const byte of bytes) {
    out += String.fromCharCode(byte);
  }

  return out;
}

function binaryToBytes(binary: string): Uint8Array {
  const out = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }

  return out;
}

// ---------------------------------------------------------------- 密钥生成

export function generateRsaKeyPair(bits: RsaKeySize): RsaKeyPairPem {
  if (!RSA_KEY_SIZES.includes(bits)) {
    throw new Error(`不支持 ${bits} 位密钥，只能选 ${RSA_KEY_SIZES.join(' / ')}`);
  }
  // 同步生成：2048 位在这台机器约 70ms、4096 位约 0.7s，按钮触发足够；
  // 用 worker 会引入额外的打包路径问题，不值得。
  const keyPair = forge.pki.rsa.generateKeyPair({ bits, e: 0x10001 });
  const privateKeyPkcs8Pem = forge.pki.privateKeyInfoToPem(
    forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(keyPair.privateKey)),
  );

  return {
    publicKeyPem: forge.pki.publicKeyToPem(keyPair.publicKey),
    privateKeyPem: forge.pki.privateKeyToPem(keyPair.privateKey),
    privateKeyPkcs8Pem,
    bits,
  };
}

// ---------------------------------------------------------------- PEM 解析

const PEM_HEADS = {
  'PUBLIC KEY': 'PUBLIC KEY',
  'RSA PUBLIC KEY': 'RSA PUBLIC KEY',
  'PRIVATE KEY': 'PRIVATE KEY',
  'RSA PRIVATE KEY': 'RSA PRIVATE KEY',
};

/** 把任意输入折成 forge 能吃的 PEM：没有 BEGIN 行就当成裸 base64 补上指定头 */
function toPem(input: string, head: keyof typeof PEM_HEADS): string {
  const body = input.trim();

  if (body.includes('-----BEGIN')) {
    return body;
  }
  const base64 = body.replace(/\s+/g, '');

  if (base64 === '') {
    throw new Error('密钥是空的');
  }
  // 裸 base64 也要按 64 字符折行，否则部分 PEM 解析器会挑刺
  const wrapped = base64.replace(/(.{64})/g, '$1\n').replace(/\n$/, '');

  return `-----BEGIN ${head}-----\n${wrapped}\n-----END ${head}-----`;
}

/**
 * 解析公钥。顺序：SPKI → PKCS#1。两者都失败时抛出一句人能看懂的话，
 * 而不是 forge 的 "Invalid PEM formatted message."。
 */
export function parsePublicKey(input: string): forge.pki.rsa.PublicKey {
  const attempts = ['PUBLIC KEY', 'RSA PUBLIC KEY'] as const;
  let lastError: unknown = null;

  for (const head of attempts) {
    try {
      return forge.pki.publicKeyFromPem(toPem(input, head)) as forge.pki.rsa.PublicKey;
    }
    catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `这不是一个能解析的 RSA 公钥（试过 PUBLIC KEY 与 RSA PUBLIC KEY 两种 PEM 头）。${describePemHint('public', input, lastError)}`,
  );
}

/** 解析私钥。顺序：PKCS#1 → PKCS#8（forge 的 privateKeyFromPem 对两者都支持） */
export function parsePrivateKey(input: string): forge.pki.rsa.PrivateKey {
  const attempts = ['RSA PRIVATE KEY', 'PRIVATE KEY'] as const;
  let lastError: unknown = null;

  for (const head of attempts) {
    try {
      return forge.pki.privateKeyFromPem(toPem(input, head)) as forge.pki.rsa.PrivateKey;
    }
    catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `这不是一个能解析的 RSA 私钥（试过 PKCS#1 与 PKCS#8 两种 PEM 头）。${describePemHint('private', input, lastError)}`,
  );
}

/**
 * 解析失败的补充提示。常见错误其实就三类：PEM 头被换成了别的算法（EC / OPENSSH）、
 * 复制时漏了中间几行、以及把公钥填到私钥框里。最后一类最容易发生在两个框长得一样时。
 */
function describePemHint(kind: 'public' | 'private', input: string, lastError: unknown): string {
  if (/BEGIN (EC|OPENSSH|CERTIFICATE)/.test(input)) {
    return '这个 PEM 头不是 RSA 的 —— EC 密钥、OpenSSH 格式、证书都不能直接用于 RSA 运算。';
  }
  if (kind === 'private' && /BEGIN (RSA )?PUBLIC KEY/.test(input)) {
    return '这是**公钥**，私钥框需要 BEGIN RSA PRIVATE KEY 或 BEGIN PRIVATE KEY 开头的那段。';
  }
  if (kind === 'public' && /BEGIN (RSA )?PRIVATE KEY/.test(input)) {
    return '这是**私钥**，公钥框需要 BEGIN PUBLIC KEY 或 BEGIN RSA PUBLIC KEY 开头的那段（私钥里也能导出公钥）。';
  }
  if (/ENCRYPTED/.test(input)) {
    return '这是被口令加密过的私钥，本站不支持解密口令保护的私钥，请先 openssl rsa -in key.pem -out plain.pem 解出来。';
  }
  const message = lastError instanceof Error ? lastError.message : '';

  if (message && !/Invalid PEM formatted message/.test(message)) {
    return `底层报错：${message}`;
  }

  return '常见原因：复制时漏了中间几行、base64 里有换行以外的杂字符、或者这段其实是证书而不是密钥。';
}

/** 密钥的位数与类型摘要，给 UI 显示 */
export function describePublicKey(key: forge.pki.rsa.PublicKey): { bits: number } {
  return { bits: key.n.bitLength() };
}

export function describePrivateKey(key: forge.pki.rsa.PrivateKey): { bits: number } {
  return { bits: key.n.bitLength() };
}

// ---------------------------------------------------------------- 加解密

/** 当前密钥与填充方式下，一段明文最多能有多少字节 */
export function maxPlaintextBytes(bits: number, padding: RsaPadding, hash: RsaHash = 'sha256'): number {
  const keyBytes = Math.ceil(bits / 8);

  return padding === 'pkcs1' ? keyBytes - 11 : keyBytes - 2 * HASH_LENGTH[hash] - 2;
}

export interface RsaEncryptOptions {
  padding: RsaPadding;
  hash?: RsaHash;
}

export function encryptRsa(plainBytes: Uint8Array, publicKeyInput: string, options: RsaEncryptOptions): Uint8Array {
  const publicKey = parsePublicKey(publicKeyInput);
  const bits = publicKey.n.bitLength();
  const limit = maxPlaintextBytes(bits, options.padding, options.hash ?? 'sha256');

  if (plainBytes.length === 0) {
    throw new Error('没有可加密的内容');
  }
  if (plainBytes.length > limit) {
    throw new Error(
      `${bits} 位密钥 + ${options.padding === 'pkcs1' ? 'PKCS#1 v1.5' : `OAEP-${(options.hash ?? 'sha256').toUpperCase()}`} 下，明文最多 ${limit} 字节，当前 ${plainBytes.length} 字节（超了 ${plainBytes.length - limit} 字节）。RSA 只适合加密密钥这类短数据，长文本请用混合加密：AES 加密内容，RSA 只加密那把 AES 密钥。`,
    );
  }
  try {
    const encrypted = publicKey.encrypt(bytesToBinary(plainBytes), PADDING_SCHEME[options.padding], {
      md: forge.md[(options.hash ?? 'sha256') as 'sha256'].create(),
    });

    return binaryToBytes(encrypted);
  }
  catch (error) {
    throw new Error(`加密失败：${(error as Error).message}`);
  }
}

export function decryptRsa(cipherBytes: Uint8Array, privateKeyInput: string, options: RsaEncryptOptions): Uint8Array {
  const privateKey = parsePrivateKey(privateKeyInput);
  const keyBytes = Math.ceil(privateKey.n.bitLength() / 8);

  if (cipherBytes.length === 0) {
    throw new Error('没有可解密的密文');
  }
  if (cipherBytes.length !== keyBytes) {
    throw new Error(
      `密文长度 ${cipherBytes.length} 字节，与密钥长度（${keyBytes} 字节）不一致。RSA 密文长度恒等于密钥长度，差一点都说明这一段不是用这把密钥加密的，或者复制时缺了字符。`,
    );
  }
  try {
    return binaryToBytes(
      privateKey.decrypt(bytesToBinary(cipherBytes), PADDING_SCHEME[options.padding], {
        md: forge.md[(options.hash ?? 'sha256') as 'sha256'].create(),
      }),
    );
  }
  catch {
    // forge 在填充校验失败时只抛一句英文；这里给出真正有用的三种可能
    throw new Error(
      '解密失败：填充校验不通过。可能是密钥不对、填充方式（PKCS#1 v1.5 / OAEP）与加密方不一致，或 OAEP 的哈希算法不同（SHA-1 与 SHA-256 互不兼容）。',
    );
  }
}

// ---------------------------------------------------------------- 签名

/** 摘要对象：签名与验签必须用同一个哈希，否则签名永远验不过 */
function createDigest(hash: RsaHash, messageBytes: Uint8Array) {
  const md = forge.md[hash].create();

  md.update(bytesToBinary(messageBytes));

  return md;
}

export function signRsa(messageBytes: Uint8Array, privateKeyInput: string, hash: RsaHash = 'sha256'): Uint8Array {
  const privateKey = parsePrivateKey(privateKeyInput);

  if (messageBytes.length === 0) {
    throw new Error('没有可签名的内容');
  }
  try {
    return binaryToBytes(privateKey.sign(createDigest(hash, messageBytes)));
  }
  catch (error) {
    throw new Error(`签名失败：${(error as Error).message}`);
  }
}

export function verifyRsa(
  messageBytes: Uint8Array,
  signatureBytes: Uint8Array,
  publicKeyInput: string,
  hash: RsaHash = 'sha256',
): boolean {
  const publicKey = parsePublicKey(publicKeyInput);
  const keyBytes = Math.ceil(publicKey.n.bitLength() / 8);

  if (signatureBytes.length !== keyBytes) {
    throw new Error(
      `签名长度 ${signatureBytes.length} 字节，与公钥长度（${keyBytes} 字节）不一致 —— 这段多半不是签名，或者签名被截断了。`,
    );
  }
  try {
    return publicKey.verify(createDigest(hash, messageBytes).digest().bytes(), bytesToBinary(signatureBytes));
  }
  catch {
    // verify 在长度不对时会抛，但长度已在上面校验过；这里兜住异常形式的数据
    return false;
  }
}
