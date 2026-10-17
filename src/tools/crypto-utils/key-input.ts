/**
 * 密钥 / IV 输入的解析与归一 —— 全站加密类工具共用。
 *
 * 为什么要有 `[HEX]:` 前缀：密钥和 IV 天生是「一串字节」，但用户手里可能只有
 * 十六进制串（`0011223344...`），也可能只有一句口令（`my secret key`）。
 * 让用户去下拉里选「这是文本 / 这是 Hex」很容易漏点，漏点的后果是**加密能跑通、
 * 但对方解不开**，而且看不出来哪错了。所以这里学 the-x.cn 的做法：用前缀显式声明
 * `[HEX]:` 后面是原始字节，没前缀就按当前字符集当文本处理。
 *
 * 前缀的合法性必须是硬的：`[HEX]:` 后面只允许十六进制与空白，出现别的字符直接报错
 * 并指出是哪个字符 —— 否则 `[HEX]:zz1122` 会被悄悄当成文本编码，变成一段谁也解不开
 * 的密文。
 *
 * 归一半径（对齐 the-x.cn 页面自述的语义）：
 * - 不足目标长度：末尾补 0x00
 * - 超出目标长度：**丢弃**超出部分
 * 两者都在 UI 上如实展示（补了几字节 / 截了几字节），不静默处理。
 */

import type { Charset } from './charset';
import { bytesToHex, encodeText, hexToBytes } from './charset';

/** 十六进制输入的前缀标记 */
export const HEX_PREFIX = '[HEX]:';

export interface ParsedKeyInput {
  /** 实际参与运算的字节 */
  bytes: Uint8Array;
  /** 是否用了 [HEX]: 前缀 */
  usedHexPrefix: boolean;
  /** 去掉前缀、调整长度**之前**的字节数 */
  sourceLength: number;
  /** 目标长度；null 表示不做归一 */
  targetLength: number | null;
  /** 补了正数、截了负数、刚好为 0、未归一为 null */
  delta: number | null;
}

/** 拆出 [HEX]: 前缀。前缀大小写不敏感，但必须出现在开头 */
export function splitHexPrefix(input: string): { body: string; usedHexPrefix: boolean } {
  const trimmed = input.trimStart();

  if (trimmed.slice(0, HEX_PREFIX.length).toUpperCase() === HEX_PREFIX) {
    return { body: trimmed.slice(HEX_PREFIX.length), usedHexPrefix: true };
  }

  return { body: input, usedHexPrefix: false };
}

/**
 * 解析 `[HEX]:` 后面的内容。只允许十六进制与空白（含换行、冒号、连字符）。
 * 报错信息里带上第一个非法字符，方便用户定位。
 */
function parseHexBody(body: string): Uint8Array {
  const cleaned = body
    .replace(/0x/gi, '')
    .replace(/[\s:,-]/g, '')
    .toLowerCase();

  if (cleaned === '') {
    return new Uint8Array(0);
  }

  const illegal = cleaned.replace(/[0-9a-f]/g, '');

  if (illegal !== '') {
    throw new Error(
      `${HEX_PREFIX} 后面只能有十六进制字符，出现了 ${JSON.stringify(illegal[0])}（位置 ${cleaned.indexOf(illegal[0]) + 1}）`,
    );
  }
  if (cleaned.length % 2 !== 0) {
    throw new Error(`${HEX_PREFIX} 后面有 ${cleaned.length} 个十六进制字符，是奇数，每两个才是一个字节`);
  }

  return hexToBytes(cleaned);
}

/**
 * 把用户输入（可能带 [HEX]:）解析成字节，并按 targetLength 补 0x00 / 截断。
 *
 * @param input 用户在密钥框里输入的内容
 * @param charset 没带前缀时按这个字符集当文本编码
 * @param targetLength 目标字节数（AES 128/192/256 → 16/24/32；SM4 固定 16；IV 固定块长）
 */
export function parseKeyInput(input: string, charset: Charset, targetLength: number | null = null): ParsedKeyInput {
  const { body, usedHexPrefix } = splitHexPrefix(input);
  // 带前缀时内容按空白容错（用户常从文档里连空格一起复制），不带前缀时原样保留
  const raw = usedHexPrefix ? parseHexBody(body) : encodeText(body, charset);
  const sourceLength = raw.length;

  if (targetLength === null || sourceLength === targetLength) {
    return { bytes: raw, usedHexPrefix, sourceLength, targetLength, delta: targetLength === null ? null : 0 };
  }

  if (sourceLength > targetLength) {
    return {
      bytes: raw.slice(0, targetLength),
      usedHexPrefix,
      sourceLength,
      targetLength,
      delta: targetLength - sourceLength,
    };
  }

  const padded = new Uint8Array(targetLength);

  padded.set(raw);

  return { bytes: padded, usedHexPrefix, sourceLength, targetLength, delta: targetLength - sourceLength };
}

/**
 * 给 UI 的一句话说明：这段密钥被识别成了什么、有没有被补齐或截断。
 * 前缀是 `[HEX]:` 时附带十六进制预览（`aa bb cc`），让用户一眼确认字节对不对。
 */
export function describeKeyInput(parsed: ParsedKeyInput): string {
  const parts: string[] = [];

  if (parsed.usedHexPrefix) {
    const preview = bytesToHex(parsed.bytes.slice(0, 8), false, ' ');

    parts.push(`按 ${HEX_PREFIX} 前缀当作原始字节，共 ${parsed.sourceLength} 字节（${preview}${parsed.sourceLength > 8 ? ' …' : ''}）`);
  } else {
    parts.push(`按文本编码，共 ${parsed.sourceLength} 字节`);
  }

  if (parsed.targetLength !== null && parsed.delta !== null) {
    if (parsed.delta > 0) {
      parts.push(`不足 ${parsed.targetLength} 字节，末尾补了 ${parsed.delta} 个 0x00`);
    } else if (parsed.delta < 0) {
      parts.push(`超过 ${parsed.targetLength} 字节，末尾多出的 ${-parsed.delta} 字节已丢弃`);
    }
  }

  return parts.join('；');
}
