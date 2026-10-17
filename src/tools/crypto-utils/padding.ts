/**
 * 分组密码的填充 / 去填充 —— 全站加密类工具共用（AES 可配置模式、SM4 若有需要也能用）。
 *
 * 为什么要自己实现：@noble/ciphers 只内置 PKCS#7（可以用 disablePadding 关掉），
 * 而 the-x.cn 那一档用户会期望能选 Zero / ISO10126 / Ansix923 / 不填充。这几种填充
 * 的差异全在「补什么字节」和「最后几字节怎么解」上，实现很短，但**校验必须严格** ——
 * 宽松的校验会把「密钥错了」伪装成「解出了一段带乱码的明文」，让人往错的方向排查。
 *
 * 四个易错点：
 * - PKCS#7 在对齐时要**补满一整块**（值 16），不能补 0 字节；解密时 0 与 >blockSize 都是非法
 * - Zero 填充对齐时**不补**（补了也没法去），所以解密只能尽量去掉尾部的 0 —— 属于有损，
 *   页面上要提醒「零填充无法还原明文末尾本来就是 0 的内容」
 * - ISO10126 是「随机字节 + 最后一字节是长度」，Ansix923 是「全 0 + 最后一字节是长度」
 * - 不填充时长度必须已经是块大小的整数倍，否则不能用
 */

export type PaddingMode = 'pkcs7' | 'zero' | 'iso10126' | 'ansix923' | 'none';

export const PADDING_MODES: PaddingMode[] = ['pkcs7', 'zero', 'iso10126', 'ansix923', 'none'];

export const DEFAULT_BLOCK_SIZE = 16;

/** 默认随机源：浏览器的 crypto.getRandomValues；单测里可以注入确定性实现 */
function defaultRandomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);

  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(out);

    return out;
  }
  // 非浏览器环境（jsdom 没给 crypto 时）退化成伪随机，只用于让流程跑通
  for (let i = 0; i < length; i += 1) {
    out[i] = Math.floor(Math.random() * 256);
  }

  return out;
}

export interface PaddingOptions {
  blockSize?: number;
  /** 注入随机源（ISO10126 用），默认 crypto.getRandomValues */
  randomBytes?: (length: number) => Uint8Array;
}

/** 这一模式下明文需要补多少字节（0 表示不需要补） */
export function paddingLengthFor(dataLength: number, mode: PaddingMode, blockSize = DEFAULT_BLOCK_SIZE): number {
  if (mode === 'none') {
    return 0;
  }
  if (mode === 'zero') {
    // 对齐时不补，否则解出来会多一整块 0
    return (blockSize - (dataLength % blockSize)) % blockSize;
  }

  // PKCS#7 / ISO10126 / Ansix923 都至少要补 1 字节，对齐时补满一整块
  return blockSize - (dataLength % blockSize);
}

export function applyPadding(
  data: Uint8Array,
  mode: PaddingMode,
  options: PaddingOptions = {},
): Uint8Array {
  const blockSize = options.blockSize ?? DEFAULT_BLOCK_SIZE;
  const padLength = paddingLengthFor(data.length, mode, blockSize);

  if (mode === 'none') {
    if (data.length % blockSize !== 0) {
      throw new Error(
        `选了「不填充」时数据长度必须是 ${blockSize} 字节的整数倍，当前 ${data.length} 字节`,
      );
    }

    return data;
  }
  if (padLength === 0) {
    return data;
  }

  const out = new Uint8Array(data.length + padLength);

  out.set(data);
  if (mode === 'zero') {
    // 已经是 0，什么都不用做
    return out;
  }
  if (mode === 'pkcs7') {
    out.fill(padLength, data.length);
  }
  else if (mode === 'ansix923') {
    // 前面补 0（已为 0），只有最后一字节是长度
    out[out.length - 1] = padLength;
  }
  else {
    // ISO10126：随机字节 + 最后一字节是长度
    const random = (options.randomBytes ?? defaultRandomBytes)(padLength);

    out.set(random.subarray(0, padLength), data.length);
    out[out.length - 1] = padLength;
  }

  return out;
}

export function removePadding(
  data: Uint8Array,
  mode: PaddingMode,
  options: PaddingOptions = {},
): Uint8Array {
  const blockSize = options.blockSize ?? DEFAULT_BLOCK_SIZE;

  if (mode === 'none') {
    return data;
  }
  if (data.length === 0 || data.length % blockSize !== 0) {
    throw new Error(
      `密文长度 ${data.length} 字节，不是 ${blockSize} 的整数倍，无法去填充 —— 多半是密钥或模式不对`,
    );
  }
  if (mode === 'zero') {
    let end = data.length;

    while (end > 0 && data[end - 1] === 0) {
      end -= 1;
    }

    return data.slice(0, end);
  }

  const padLength = data[data.length - 1];

  if (padLength === 0 || padLength > blockSize) {
    throw new Error(
      `填充校验不通过：最后一字节是 ${padLength}，不在 1~${blockSize} 范围内。多半是密钥不对、模式（CBC/ECB）选错，或者填充方式与加密方不一致`,
    );
  }
  if (mode === 'pkcs7') {
    for (let i = data.length - padLength; i < data.length; i += 1) {
      if (data[i] !== padLength) {
        throw new Error(
          `填充校验不通过：末尾 ${padLength} 字节的值不一致。多半是密钥不对、模式选错，或者填充方式与加密方不一致`,
        );
      }
    }
  }
  else if (mode === 'ansix923') {
    for (let i = data.length - padLength; i < data.length - 1; i += 1) {
      if (data[i] !== 0) {
        throw new Error('填充校验不通过：Ansix923 的填充字节除最后一字节外应当全为 0，实际不是');
      }
    }
  }
  // ISO10126 的填充字节是随机的，无可校验项，只校验长度范围（上面已做）

  return data.slice(0, data.length - padLength);
}
