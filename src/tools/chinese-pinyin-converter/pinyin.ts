/**
 * 汉字转拼音。
 *
 * 字典是构建时就放进 public/data 的静态 JSON（来自 Unihan kMandarin 读音数据，
 * 只保留 CJK 基本区约 2 万字），运行时按需 fetch —— 267KB 不能进主包，
 * 但不进主包又不影响功能，因为没人一进站就要转拼音。
 *
 * 多音字说明：字典里多音字只取最常用读音。要做"银行 / 行动"这种词组级
 * 消歧需要词库 + 分词，那是另一个量级的事，这里不假装能做到。
 */

export type PinyinStyle = 'tone' | 'number' | 'plain' | 'initial';

/** 带调号字母 → [基础字母, 声调] */
const TONE_MAP: Record<string, [string, number]> = {
  ā: ['a', 1], á: ['a', 2], ǎ: ['a', 3], à: ['a', 4],
  ō: ['o', 1], ó: ['o', 2], ǒ: ['o', 3], ò: ['o', 4],
  ē: ['e', 1], é: ['e', 2], ě: ['e', 3], è: ['e', 4],
  ī: ['i', 1], í: ['i', 2], ǐ: ['i', 3], ì: ['i', 4],
  ū: ['u', 1], ú: ['u', 2], ǔ: ['u', 3], ù: ['u', 4],
  ǖ: ['ü', 1], ǘ: ['ü', 2], ǚ: ['ü', 3], ǜ: ['ü', 4],
  ń: ['n', 2], ň: ['n', 3], ǹ: ['n', 4],
  m̄: ['m', 1], ḿ: ['m', 2], m̀: ['m', 4],
};

/** 带声调 → 数字声调，如 yī → yi1 */
export function toNumberTone(pinyin: string): string {
  let tone = 0;
  let result = '';
  for (const char of pinyin) {
    const mapped = TONE_MAP[char];
    if (mapped) {
      result += mapped[0];
      tone = mapped[1];
    }
    else {
      result += char;
    }
  }
  return tone > 0 ? `${result}${tone}` : result;
}

/** 带声调 → 无声调，ü 转写成 u（输入法里打 v，但对外展示 u 更通用） */
export function toPlain(pinyin: string): string {
  let result = '';
  for (const char of pinyin) {
    result += TONE_MAP[char] ? TONE_MAP[char][0] : char;
  }
  return result.replace(/ü/g, 'u');
}

/** 声母首字母，如 zhōng → Z */
export function toInitial(pinyin: string): string {
  const plain = toPlain(pinyin);
  return plain.slice(0, 1).toUpperCase();
}

export function formatPinyin(pinyin: string, style: PinyinStyle): string {
  switch (style) {
    case 'tone':
      return pinyin;
    case 'number':
      return toNumberTone(pinyin);
    case 'plain':
      return toPlain(pinyin);
    case 'initial':
      return toInitial(pinyin);
  }
}

const CJK_RANGE = /[\u4e00-\u9fa5]/;

let cache: Record<string, string> | null = null;
let pending: Promise<Record<string, string>> | null = null;

/** 首次调用时才拉取字典，后续复用 */
export function loadPinyinDict(baseUrl: string): Promise<Record<string, string>> {
  if (cache) {
    return Promise.resolve(cache);
  }
  if (!pending) {
    pending = fetch(`${baseUrl}data/hanzi-pinyin.json`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`字典加载失败：${response.status}`);
        }
        return response.json() as Promise<Record<string, string>>;
      })
      .then((dict) => {
        cache = dict;
        return dict;
      });
  }
  return pending;
}

export interface PinyinItem {
  char: string;
  /** 词典里的原始读音（可能多个，空格分隔） */
  raw: string;
  /** 是否多音字 */
  polyphone: boolean;
  /** 是否为汉字 */
  isHan: boolean;
}

/** 逐字查字典，非汉字原样保留 */
export function tokenize(text: string, dict: Record<string, string>): PinyinItem[] {
  return Array.from(text).map((char) => {
    const raw = dict[char];
    if (!raw) {
      return { char, raw: '', polyphone: false, isHan: CJK_RANGE.test(char) };
    }
    const parts = raw.split(' ').filter(Boolean);
    return { char, raw: parts[0], polyphone: parts.length > 1, isHan: true };
  });
}

export function joinPinyin(items: PinyinItem[], style: PinyinStyle, separator: string): string {
  return items
    .map((item) => {
      if (!item.isHan || !item.raw) {
        return item.char;
      }
      return formatPinyin(item.raw, style);
    })
    .join(separator);
}
