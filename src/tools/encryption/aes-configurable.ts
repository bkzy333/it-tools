/**
 * 可配置的 AES —— 补上 the-x.cn 那一档的四个自由度：bit 数、模式、填充、输入输出字符集。
 *
 * 与原 `encryption.service.ts` 里那 19 个算法的关系：
 * **并存，不替换**。原来的算法名（AES-CBC / AES-GCM / AES-CTR …）继续走原实现，
 * 它们的历史密文仍然能解；这里的 `aesEncrypt/aesDecrypt` 是新增的一条独立链路，
 * 对应页面上的「AES（可配置）」这一项。这么做的原因是老实现把「自动生成随机 nonce
 * 并前置到密文」烘进了算法名里，硬改成显式 IV 会让所有旧密文失效。
 *
 * 三个实现细节：
 *
 * 1. **OFB 自己实现**。@noble/ciphers 1.3 没有导出 ofb，而 OFB 与 CFB 有个等价关系：
 *    CFB 加密**全零数据**得到的就是 OFB 密钥流（C_i = P_i XOR E(前一个密钥流块)，
 *    当 P 全零时 C_i 就是密钥流本身）。实测与 Node 的 aes-128-ofb 逐字节一致。
 *    另一种写法是逐块 new ecb 做 E()，也一致，但每块都要重做 key expansion，慢得多。
 *
 * 2. **noble 的密码实例不能复用**。同一个 (key, nonce) 调两次 encrypt 会抛
 *    「cannot encrypt() twice with same key + nonce」，所以每次加解密都新建实例。
 *
 * 3. **流模式不接受填充**。CTR / OFB / CFB 是流模式，长度任意，填了反而错；
 *    这里对这些模式强制 `none`，不让用户选到一个不生效的选项。
 */

import { cbc, cfb, ctr, ecb } from '@noble/ciphers/aes';
import type { Charset } from '../crypto-utils/charset';
import { parseKeyInput, type ParsedKeyInput } from '../crypto-utils/key-input';
import { applyPadding, removePadding, type PaddingMode } from '../crypto-utils/padding';

export type AesMode = 'ecb' | 'cbc' | 'ctr' | 'ofb' | 'cfb';
export type AesKeyBits = 128 | 192 | 256;

export const AES_MODES: AesMode[] = ['cbc', 'ecb', 'ctr', 'ofb', 'cfb'];
export const AES_KEY_BITS: AesKeyBits[] = [128, 192, 256];
export const AES_BLOCK_SIZE = 16;

/** 流模式：不需要（也不应该）填充 */
export const AES_STREAM_MODES: AesMode[] = ['ctr', 'ofb', 'cfb'];

export const isAesStreamMode = (mode: AesMode): boolean => AES_STREAM_MODES.includes(mode);

export interface AesConfig {
  mode: AesMode;
  bits: AesKeyBits;
  padding: PaddingMode;
  /** 密钥原始输入，可带 [HEX]: 前缀 */
  key: string;
  keyCharset: Charset;
  iv: string;
  ivCharset: Charset;
}

function resolveKey(config: AesConfig): Uint8Array {
  const parsed = parseKeyInput(config.key, config.keyCharset, config.bits / 8);

  if (parsed.sourceLength === 0) {
    throw new Error(`AES-${config.bits} 的密钥不能为空（需要 ${config.bits / 8} 字节）`);
  }

  return parsed.bytes;
}

function resolveIv(config: AesConfig): Uint8Array | null {
  if (config.mode === 'ecb') {
    return null;
  }
  const parsed = parseKeyInput(config.iv, config.ivCharset, AES_BLOCK_SIZE);

  if (parsed.sourceLength === 0) {
    throw new Error(`${config.mode.toUpperCase()} 模式需要 16 字节的 IV`);
  }

  return parsed.bytes;
}

/**
 * OFB 的核心：用「CFB 加密全零」得到与数据等长的密钥流，再与数据 XOR。
 * 加密与解密是同一个操作（流密码）。
 */
function ofbXor(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array {
  const keyStream = cfb(key, iv).encrypt(new Uint8Array(data.length));
  const out = new Uint8Array(data.length);

  for (let i = 0; i < data.length; i += 1) {
    out[i] = data[i] ^ keyStream[i];
  }

  return out;
}

export function aesEncrypt(plainBytes: Uint8Array, config: AesConfig): Uint8Array {
  const key = resolveKey(config);
  const iv = resolveIv(config);
  // 流模式**完全跳过**填充层：不走 applyPadding 的「必须是整块」校验，
  // 因为 CTR/OFB/CFB 本来就接受任意长度（之前这里传 'none' 进去会被长度校验拦掉）
  const padded = isAesStreamMode(config.mode)
    ? plainBytes
    : applyPadding(plainBytes, config.padding, { blockSize: AES_BLOCK_SIZE });

  switch (config.mode) {
    case 'ecb':
      return ecb(key, { disablePadding: true }).encrypt(padded);
    case 'cbc':
      return cbc(key, iv as Uint8Array, { disablePadding: true }).encrypt(padded);
    case 'ctr':
      return ctr(key, iv as Uint8Array).encrypt(padded);
    case 'cfb':
      return cfb(key, iv as Uint8Array).encrypt(padded);
    case 'ofb':
      return ofbXor(key, iv as Uint8Array, padded);
  }
}

export function aesDecrypt(cipherBytes: Uint8Array, config: AesConfig): Uint8Array {
  const key = resolveKey(config);
  const iv = resolveIv(config);

  if (cipherBytes.length === 0) {
    throw new Error('没有可解密的密文');
  }
  // 分组模式（ECB/CBC）的密文必须是整块；流模式不要求
  if (!isAesStreamMode(config.mode) && cipherBytes.length % AES_BLOCK_SIZE !== 0) {
    throw new Error(
      `密文长度 ${cipherBytes.length} 字节，不是 ${AES_BLOCK_SIZE} 的整数倍。ECB / CBC 是分组模式，密文必然是整块 —— 多半是 Base64 / Hex 里少了字符，或者这段不是 AES 密文`,
    );
  }
  let decrypted: Uint8Array;

  switch (config.mode) {
    case 'ecb':
      decrypted = ecb(key, { disablePadding: true }).decrypt(cipherBytes);
      break;
    case 'cbc':
      decrypted = cbc(key, iv as Uint8Array, { disablePadding: true }).decrypt(cipherBytes);
      break;
    case 'ctr':
      decrypted = ctr(key, iv as Uint8Array).decrypt(cipherBytes);
      break;
    case 'cfb':
      decrypted = cfb(key, iv as Uint8Array).decrypt(cipherBytes);
      break;
    case 'ofb':
      decrypted = ofbXor(key, iv as Uint8Array, cipherBytes);
      break;
  }

  return isAesStreamMode(config.mode)
    ? decrypted
    : removePadding(decrypted, config.padding, { blockSize: AES_BLOCK_SIZE });
}

/** 给 UI 显示：这把密钥最终被用成了什么（补齐 / 截断如实说） */
export function describeAesKey(config: AesConfig): ParsedKeyInput {
  return parseKeyInput(config.key, config.keyCharset, config.bits / 8);
}

export function describeAesIv(config: AesConfig): ParsedKeyInput {
  return parseKeyInput(config.iv, config.ivCharset, AES_BLOCK_SIZE);
}
