/**
 * 全角 / 半角互转。
 *
 * 规则主体是 U+FF01–U+FF5E 与 U+0021–U+007E 之间固定的 0xFEE0 偏移，
 * 但有两个例外要单独处理，否则转换出来的文本会很难看：
 * 1. 半角空格是 U+0020，对应的全角是 U+3000（不是 U+FF20 那种偏移）
 * 2. 中文标点（。、，；：？！）保持原样，不要硬转
 *
 * 第 2 条特别容易写错：。和、的码点是 U+3002 / U+3001，本来就在偏移区间外，
 * 天然不会被转；但 ，；：？！（）这些是 U+FF0C / U+FF1B / U+FF1A / U+FF1F / U+FF01 /
 * U+FF08 / U+FF09，**正好落在 FF01–FF5E 里面**，照偏移公式硬转的话，
 * "你好，世界！" 会变成 "你好,世界!"。所以这里单独列一张表，默认跳过它们。
 */

const OFFSET = 0xfee0;
const FULL_SPACE = '　';
const HALF_SPACE = ' ';

/** 需要保留原样的标点，以半角码点记录，全角形态就是它 + OFFSET */
const KEEP_PUNCT = new Set([
  0x21, // !
  0x28, // (
  0x29, // )
  0x2c, // ,
  0x3a, // :
  0x3b, // ;
  0x3f, // ?
]);

function isKeptPunct(code: number): boolean {
  if (KEEP_PUNCT.has(code)) {
    return true;
  }
  if (code >= 0xff01 && code <= 0xff5e) {
    return KEEP_PUNCT.has(code - OFFSET);
  }
  return false;
}

function toHalfWidth(text: string, keepPunctuation: boolean): string {
  return Array.from(text)
    .map((char) => {
      const code = char.codePointAt(0) ?? 0;
      if (code === 0x3000) {
        return HALF_SPACE;
      }
      if (keepPunctuation && isKeptPunct(code)) {
        return char;
      }
      if (code >= 0xff01 && code <= 0xff5e) {
        return String.fromCodePoint(code - OFFSET);
      }
      return char;
    })
    .join('');
}

function toFullWidth(text: string, keepPunctuation: boolean): string {
  return Array.from(text)
    .map((char) => {
      const code = char.codePointAt(0) ?? 0;
      if (code === 0x20) {
        return FULL_SPACE;
      }
      if (keepPunctuation && isKeptPunct(code)) {
        return char;
      }
      if (code >= 0x21 && code <= 0x7e) {
        return String.fromCodePoint(code + OFFSET);
      }
      return char;
    })
    .join('');
}

export type ConvertMode = 'to-half' | 'to-full';

export interface ConvertOptions {
  /** 保留中英文标点原样（默认开启，避免把中文句子里的标点改成英文标点） */
  keepPunctuation?: boolean;
}

export function convertWidth(text: string, mode: ConvertMode, options: ConvertOptions = {}): string {
  const keep = options.keepPunctuation ?? true;
  return mode === 'to-half' ? toHalfWidth(text, keep) : toFullWidth(text, keep);
}

export interface WidthStats {
  total: number;
  fullWidth: number;
  halfWidth: number;
  /** 没有全半角之分的字符（中文、中文标点等） */
  neutral: number;
}

/** 统计一下文本里的全角占比，让用户知道这段文本到底有没有转换的必要 */
export function countWidth(text: string): WidthStats {
  const chars = Array.from(text);
  let fullWidth = 0;
  let halfWidth = 0;

  for (const char of chars) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0x3000 || (code >= 0xff01 && code <= 0xff5e)) {
      fullWidth += 1;
    }
    else if (code >= 0x21 && code <= 0x7e) {
      halfWidth += 1;
    }
  }

  return { total: chars.length, fullWidth, halfWidth, neutral: chars.length - fullWidth - halfWidth };
}
