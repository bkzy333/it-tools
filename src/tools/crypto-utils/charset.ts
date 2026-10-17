/**
 * 文本 ↔ 字节 的统一编解码 —— 全站加密类工具（SM3 / SM4 / AES / RSA / SM2）共用。
 *
 * 为什么要这一层：加密工具的输入永远不是「一串字符」，而是「一串字节」。
 * 用户看到的是「中」或「d6d0」，底层都必须是同一个 Uint8Array。之前 /encryption
 * 把这件事写死成 UTF-8，遇到老系统来的 GBK 报文或手里只有 hex 的密钥就抓瞎。
 *
 * 支持的字符集（与 the-x.cn 的 AES 页对齐）：
 * utf8 / gbk / utf16le / base64 / hex
 *
 * GBK 的坑：浏览器只有**解码**能力（TextDecoder('gbk')），没有编码能力
 * （TextEncoder 只认 utf-8）。所以这里在首次需要编码时，用原生解码器把
 * 0x81-0xFE × 0x40-0xFE 逐对反解一遍，反推出一张「字符 → GBK 双字节」表
 * （实测 23939 个字符，建表 22ms）。这样不用背一张 100KB+ 的静态表，
 * 也不会有「解码用 A 表、编码用 B 表导致来回不一致」的问题。
 */

export type Charset = 'utf8' | 'gbk' | 'utf16le' | 'base64' | 'hex';

/** 二进制导向的字符集：输入框里放的就是字节的文本表示，不是「文本」 */
export const BINARY_CHARSETS: Charset[] = ['base64', 'hex'];

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder('utf-8');

// ---------------------------------------------------------------- hex / base64

/** 十六进制 → 字节。容忍空格、换行、0x 前缀与大小写；奇数长度直接报错 */
export function hexToBytes(hex: string): Uint8Array {
  const cleaned = hex
    .replace(/0x/gi, '')
    .replace(/[\s:,-]/g, '')
    .toLowerCase();

  if (cleaned === '') {
    return new Uint8Array(0);
  }
  if (!/^[0-9a-f]+$/.test(cleaned)) {
    const bad = cleaned.replace(/[0-9a-f]/g, '').slice(0, 8);

    throw new Error(`不是合法的十六进制：出现了 ${JSON.stringify(bad)}`);
  }
  if (cleaned.length % 2 !== 0) {
    throw new Error(`十六进制长度是奇数（${cleaned.length}），每两个字符才是一个字节`);
  }
  const out = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }

  return out;
}

/** 字节 → 十六进制；separator 给了就每字节插一个（预览用 'aa bb cc'） */
export function bytesToHex(bytes: Uint8Array, upper = false, separator = ''): string {
  const joined = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join(separator);

  return upper ? joined.toUpperCase() : joined;
}

/** 字节 → base64 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

/** base64 → 字节。容忍换行与 URL-safe 变体 */
export function base64ToBytes(base64: string): Uint8Array {
  const cleaned = base64.trim().replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');

  if (cleaned === '') {
    return new Uint8Array(0);
  }
  let binary: string;
  try {
    binary = atob(cleaned.padEnd(Math.ceil(cleaned.length / 4) * 4, '='));
  }
  catch {
    throw new Error('不是合法的 Base64');
  }
  const out = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }

  return out;
}

// ---------------------------------------------------------------- GBK 编码表

let gbkEncoder: Map<string, number> | null = null;
const gbkDecoder = new TextDecoder('gbk');

/**
 * 反推 GBK 编码表：遍历所有合法的双字节组合，用原生 GBK 解码器解开，
 * 拿到「字符 → 双字节」。懒建表，只在真的需要 GBK 编码时跑一次。
 */
function getGbkEncoder(): Map<string, number> {
  if (gbkEncoder) {
    return gbkEncoder;
  }
  const map = new Map<string, number>();

  for (let lead = 0x81; lead <= 0xfe; lead += 1) {
    for (let trail = 0x40; trail <= 0xfe; trail += 1) {
      if (trail === 0x7f) {
        continue;
      }
      const char = gbkDecoder.decode(new Uint8Array([lead, trail]));

      // 一个合法 GBK 码位必须解出**单个**字符；解出 2 个字符或 U+FFFD 的都是未定义区
      if (char.length === 1 && char !== '\uFFFD' && !map.has(char)) {
        map.set(char, (lead << 8) | trail);
      }
    }
  }
  gbkEncoder = map;

  return map;
}

function gbkEncode(text: string): Uint8Array {
  const map = getGbkEncoder();
  const bytes: number[] = [];

  for (const char of text) {
    const code = char.codePointAt(0) as number;

    // 单字节区：ASCII 原样，0x80 在 GBK 里是欧元符号
    if (code < 0x80) {
      bytes.push(code);
      continue;
    }
    if (char === '€') {
      bytes.push(0x80);
      continue;
    }
    const double = map.get(char);

    if (double === undefined) {
      throw new Error(`字符「${char}」不在 GBK 字符集里，无法按 GBK 编码（可改用 UTF-8）`);
    }
    bytes.push(double >> 8, double & 0xff);
  }

  return new Uint8Array(bytes);
}

// ---------------------------------------------------------------- 统一入口

/** 文本 → 字节（按目标字符集） */
export function encodeText(text: string, charset: Charset): Uint8Array {
  switch (charset) {
    case 'utf8':
      return utf8Encoder.encode(text);
    case 'gbk':
      return gbkEncode(text);
    case 'utf16le': {
      const out = new Uint8Array(text.length * 2);

      for (let i = 0; i < text.length; i += 1) {
        const code = text.charCodeAt(i);
        out[i * 2] = code & 0xff;
        out[i * 2 + 1] = code >> 8;
      }

      return out;
    }
    case 'base64':
      return base64ToBytes(text);
    case 'hex':
      return hexToBytes(text);
  }
}

/**
 * 字节 → 文本（按来源字符集）。
 * UTF-8 用 fatal 解码：二进制密文按 UTF-8 解会得到一堆 U+FFFD，
 * 这时候宁可报错让用户换「Hex / Base64」看，也不要默默吐乱码。
 */
export function decodeBytes(bytes: Uint8Array, charset: Charset): string {
  switch (charset) {
    case 'utf8':
      try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      }
      catch {
        throw new Error('这段字节不是合法的 UTF-8（多半是二进制密文），请改用 Base64 或 Hex 输出');
      }
    case 'gbk':
      return gbkDecoder.decode(bytes);
    case 'utf16le': {
      if (bytes.length % 2 !== 0) {
        throw new Error('UTF-16_LE 的字节数必须是偶数');
      }
      let text = '';

      for (let i = 0; i < bytes.length; i += 2) {
        text += String.fromCharCode(bytes[i] | (bytes[i + 1] << 8));
      }

      return text;
    }
    case 'base64':
      return bytesToBase64(bytes);
    case 'hex':
      return bytesToHex(bytes);
  }
}
