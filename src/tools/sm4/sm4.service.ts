/**
 * SM4 分组密码（GB/T 32907-2016）。
 *
 * 用 sm-crypto 的实现，但**边界条件全部在这一层收口**，不把库的脾气漏给 UI：
 * - 它只有 `mode: 'cbc' | 其他(ecb)` 两档，没有 CTR/OFB/CFB —— 页面上如实说明，
 *   别让用户以为选了「SM4」就等于拿到了全家桶（要流模式请用 /encryption 的 AES-CTR）
 * - 它只有 `padding: 'pkcs#5' | 'pkcs#7' | 其他(等于不填充)`，没有 Zero/ISO10126/Ansix923
 * - **不填充且长度不是 16 的倍数时它会静默截断**（加密循环只处理整块），
 *   这是最危险的一档：用户会拿到一段能加密、但少了几字节的密文。这里直接拦住报错。
 *
 * key 与 IV 固定 16 字节，走共享的 parseKeyInput（支持 `[HEX]:` 前缀、不足补 0x00、超出截断）。
 */

import { sm4 } from 'sm-crypto';
import type { Charset } from '../crypto-utils/charset';
import { parseKeyInput } from '../crypto-utils/key-input';

export const SM4_BLOCK_SIZE = 16;

export type Sm4Mode = 'cbc' | 'ecb';
export type Sm4Padding = 'pkcs7' | 'none';

export interface Sm4Config {
  mode: Sm4Mode;
  padding: Sm4Padding;
  /** 密钥原始输入（可带 [HEX]: 前缀） */
  key: string;
  keyCharset: Charset;
  /** IV 原始输入（仅 CBC 用） */
  iv: string;
  ivCharset: Charset;
}

/** 服务层报错都带上这一层前缀，UI 区分「参数问题」与「数据问题」时好判断 */
function fail(message: string): never {
  throw new Error(message);
}

function resolveKey(config: Sm4Config): number[] {
  const parsed = parseKeyInput(config.key, config.keyCharset, SM4_BLOCK_SIZE);

  if (parsed.sourceLength === 0) {
    fail('SM4 的密钥不能为空（需要 16 字节，可以用 [HEX]: 后面跟 32 个十六进制字符）');
  }

  return Array.from(parsed.bytes);
}

function resolveIv(config: Sm4Config): number[] {
  if (config.mode !== 'cbc') {
    return [];
  }
  const parsed = parseKeyInput(config.iv, config.ivCharset, SM4_BLOCK_SIZE);

  if (parsed.sourceLength === 0) {
    fail('CBC 模式需要 16 字节的 IV（全零 IV 不安全，但可以用 [HEX]:00000000000000000000000000000000 显式声明）');
  }

  return Array.from(parsed.bytes);
}

function baseOptions(config: Sm4Config) {
  return {
    mode: config.mode,
    padding: config.padding === 'pkcs7' ? 'pkcs#7' : 'none',
    iv: resolveIv(config),
  } as const;
}

/** SM4 加密。入参与出参都是字节，字符集的事交给调用方 */
export function encryptSm4(plainBytes: Uint8Array, config: Sm4Config): Uint8Array {
  const key = resolveKey(config);

  if (config.padding === 'none' && plainBytes.length % SM4_BLOCK_SIZE !== 0) {
    fail(
      `选了「不填充」时明文长度必须是 ${SM4_BLOCK_SIZE} 的整数倍，当前 ${plainBytes.length} 字节。改用 PKCS#7 填充，或自行补齐到 ${Math.ceil(plainBytes.length / SM4_BLOCK_SIZE) * SM4_BLOCK_SIZE} 字节。`,
    );
  }

  const out = sm4.encrypt(Array.from(plainBytes), key, { ...baseOptions(config), output: 'array' });

  return new Uint8Array(out as number[]);
}

/** SM4 解密 */
export function decryptSm4(cipherBytes: Uint8Array, config: Sm4Config): Uint8Array {
  const key = resolveKey(config);

  if (cipherBytes.length === 0) {
    fail('没有可解密的密文');
  }
  // 这条同样要自己拦：库对非整块密文会静默产出半截结果
  if (cipherBytes.length % SM4_BLOCK_SIZE !== 0) {
    fail(`密文长度 ${cipherBytes.length} 字节，不是 ${SM4_BLOCK_SIZE} 的整数倍，多半是复制时漏了字符或格式选错`);
  }
  try {
    const out = sm4.decrypt(Array.from(cipherBytes), key, { ...baseOptions(config), output: 'array' });

    return new Uint8Array(out as number[]);
  }
  catch (error) {
    const message = (error as Error).message;

    // 库在 padding 校验失败时抛的是英文短句，翻成人话并给出最常见的原因
    if (/padding/i.test(message)) {
      fail('解密失败：填充校验不通过。最常见的原因是密钥或 IV 不对，也可能是模式（CBC/ECB）选错了。');
    }
    fail(`解密失败：${message}`);
  }
}

/** 供 UI 展示：这把密钥最终被用成了什么（补齐/截断都要如实说） */
export function describeSm4Key(config: Sm4Config) {
  return parseKeyInput(config.key, config.keyCharset, SM4_BLOCK_SIZE);
}
