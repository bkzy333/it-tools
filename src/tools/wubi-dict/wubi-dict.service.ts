/**
 * 五笔编码查询。
 *
 * 参考 iamwawa.cn/wubi.html：输入汉字返回五笔编码（86/98 版）。
 * 码表数据来自 UnicodeCJK-WuBi（见同目录 wubi-data.ts），仅收录 GB2312 常用汉字 6764 字。
 *
 * 数据格式：WUBI_CHARS 是连续汉字串，WUBI_CODES_86/98 用 | 分隔的编码串，
 * 两者按索引一一对应。查找用 indexOf 定位字符位置再切分编码，避免构建大对象占用内存。
 */

import { WUBI_CHARS, WUBI_CODES_86, WUBI_CODES_98 } from './wubi-data';

const CODE86_ARRAY = WUBI_CODES_86.split('|');
const CODE98_ARRAY = WUBI_CODES_98.split('|');

export type WubiVersion = '86' | '98';

export interface WubiResult {
  char: string;
  code: string;
  /** 是否在字表内 */
  found: boolean;
}

/** 单个汉字查五笔编码 */
export function queryWubi(char: string, version: WubiVersion = '86'): string {
  const idx = WUBI_CHARS.indexOf(char);
  if (idx === -1) {
    return '';
  }
  return version === '86' ? CODE86_ARRAY[idx] : CODE98_ARRAY[idx];
}

/** 一句话/一段文本逐字查五笔编码，返回每个汉字的结果（非汉字跳过） */
export function queryWubiText(text: string, version: WubiVersion = '86'): WubiResult[] {
  const results: WubiResult[] = [];
  for (const char of text) {
    // 只处理 CJK 汉字（基本区 + 扩展 A），标点/英文/数字/空白跳过
    if (!/[\u4e00-\u9fff]/u.test(char)) {
      continue;
    }
    const code = queryWubi(char, version);
    results.push({ char, code, found: code !== '' });
  }
  return results;
}
