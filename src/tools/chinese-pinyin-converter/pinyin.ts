/**
 * 汉字转拼音。
 *
 * 字典是构建时就放进 public/data 的静态 JSON（来自 Unihan kMandarin 读音数据，
 * 只保留 CJK 基本区约 2 万字），运行时按需 fetch —— 267KB 不能进主包，
 * 但不进主包又不影响功能，因为没人一进站就要转拼音。
 *
 * 多音字说明：字典里多音字只取最常用读音。要做"银行 / 行动"这种词组级
 * 消歧需要词库 + 分词，那是另一个量级的事，这里不假装能做到。
 *
 * 本文件负责「单个读音 → 目标格式」以及「整段 → 含原文位置的结果串」，
 * 所有与布局/位置相关的组合逻辑都收敛到这里，方便单测与复用。
 */

export type PinyinStyle = 'tone' | 'number' | 'number-mid' | 'plain' | 'initial';

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

/** 带声调 → 数字声调（末位），如 yī → yi1 */
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

/**
 * 带声调 → 数字声调（中置），按标准声调元音位置插入数字，如 zhōng → zho1ng。
 * 元音优先级：a > e > o > 最后一个 i/u/ü（覆盖 iu/ui 取末位元音的规则）。
 */
export function toNumberToneMid(pinyin: string): string {
  let tone = 0;
  const base: string[] = [];
  for (const char of pinyin) {
    const mapped = TONE_MAP[char];
    if (mapped) {
      base.push(mapped[0]);
      tone = mapped[1];
    }
    else {
      base.push(char);
    }
  }
  const s = base.join('');
  if (tone === 0) {
    return s;
  }
  const idx = toneVowelIndex(s);
  return `${s.slice(0, idx + 1)}${tone}${s.slice(idx + 1)}`;
}

/** 标准拼音声调元音位置 */
function toneVowelIndex(s: string): number {
  let i = s.indexOf('a');
  if (i >= 0) {
    return i;
  }
  i = s.indexOf('e');
  if (i >= 0) {
    return i;
  }
  i = s.indexOf('o');
  if (i >= 0) {
    return i;
  }
  let idx = -1;
  for (let k = 0; k < s.length; k++) {
    if ('iuü'.includes(s[k])) {
      idx = k;
    }
  }
  return idx >= 0 ? idx : s.length - 1;
}

/**
 * 带声调 → 无声调。默认 ü 转写为 v（与输入法习惯、lddgo 默认一致），
 * keepUmlaut=true 时保留 ü。
 */
export function toPlain(pinyin: string, keepUmlaut = false): string {
  let result = '';
  for (const char of pinyin) {
    result += TONE_MAP[char] ? TONE_MAP[char][0] : char;
  }
  return keepUmlaut ? result : result.replace(/ü/g, 'v');
}

/** 声母首字母，如 zhōng → Z */
export function toInitial(pinyin: string): string {
  const plain = toPlain(pinyin, true);
  return plain.slice(0, 1).toUpperCase();
}

export interface PinyinFormatOptions {
  /** 全大写 */
  upper?: boolean;
  /** 保留 ü（否则 ü→u，仅影响无声调 / 数字声调） */
  keepUmlaut?: boolean;
}

export function formatPinyin(pinyin: string, style: PinyinStyle, opts: PinyinFormatOptions = {}): string {
  let result: string;
  switch (style) {
    case 'tone':
      result = pinyin;
      break;
    case 'number':
      result = toNumberTone(pinyin);
      break;
    case 'number-mid':
      result = toNumberToneMid(pinyin);
      break;
    case 'plain':
      result = toPlain(pinyin, opts.keepUmlaut);
      break;
    case 'initial':
      result = toInitial(pinyin);
      break;
  }
  return opts.upper ? result.toUpperCase() : result;
}

const CJK_RANGE = /[一-鿿]/; // CJK 基本区

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

export interface JoinOptions extends PinyinFormatOptions {
  /** 删除无法注音的字符（含标点与字典缺失的汉字），默认保留 */
  keepUnrecognized?: boolean;
}

/** 整段拼音串：keepUnrecognized=false 时才整体跳过无法注音的字符（连同分隔符），默认保留 */
export function joinPinyin(items: PinyinItem[], style: PinyinStyle, separator: string, opts: JoinOptions = {}): string {
  const parts: string[] = [];
  for (const item of items) {
    if (!item.isHan || !item.raw) {
      if (opts.keepUnrecognized === false) {
        continue;
      }
      parts.push(item.char);
      continue;
    }
    parts.push(formatPinyin(item.raw, style, opts));
  }
  return parts.join(separator);
}

/** 单字拼音（用于逐字对照卡片 / 文字在下对齐块），非汉字回显原字符 */
export function formatItem(item: PinyinItem, style: PinyinStyle, opts: PinyinFormatOptions = {}): string {
  if (!item.isHan || !item.raw) {
    return item.char;
  }
  return formatPinyin(item.raw, style, opts);
}

function isWide(ch: string): boolean {
  return /[㐀-䶿一-鿿豈-﫿]/.test(ch);
}

/** 显示宽度：CJK 等宽字符记 2，其余记 1（用于等宽对齐） */
function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    w += isWide(ch) ? 2 : 1;
  }
  return w;
}

function padEndWidth(s: string, len: number): string {
  return s + ' '.repeat(Math.max(0, len - displayWidth(s)));
}

/**
 * 文字在下：返回上下两行、按 alignLength（显示宽度）等宽对齐的注音块。
 * 拼音在上、原文在下，需在等宽字体下查看（CJK 宽度约为拉丁的 2 倍）。
 *
 * ⚠️ 只在**复制/导出**用，不要再拿它渲染到页面上：
 * 这套对齐隐含「CJK 的渲染宽度 = 等宽字体里 2 个拉丁字符」这个前提，而它只在
 * 「拉丁字符恰好 0.5em」的等宽字体下成立（Ubuntu Mono 是；Consolas 0.55em、
 * Cascadia Code 0.6em 都不是）。字体一换，汉字列每列就比拼音列窄几像素，
 * 误差逐列累积，越往右越对不上（16px 下实测每列短 2.75px）。
 * 页面上请用 buildAlignedCells + 真实列布局（见 .vue 的 .aligned-grid）。
 */
export function buildAlignedBlock(
  items: PinyinItem[],
  style: PinyinStyle,
  alignLength: number,
  opts: JoinOptions = {},
): { pinyinLine: string; textLine: string } {
  const pinyinCells: string[] = [];
  const textCells: string[] = [];
  for (const item of items) {
    if (!item.isHan || !item.raw) {
      if (opts.keepUnrecognized === false) {
        continue;
      }
      pinyinCells.push(padEndWidth(item.char, alignLength));
      textCells.push(padEndWidth(item.char, alignLength));
      continue;
    }
    pinyinCells.push(padEndWidth(formatPinyin(item.raw, style, opts), alignLength));
    textCells.push(padEndWidth(item.char, alignLength));
  }
  return { pinyinLine: pinyinCells.join(''), textLine: textCells.join('') };
}

export interface AlignedCell {
  /** 该列的注音（非汉字 / 无读音时就是原字符） */
  pinyin: string;
  /** 该列的原文 */
  char: string;
}

/**
 * 「文字在下」的**逐列**数据：页面上用真实列布局渲染它，不靠空格撑宽度。
 *
 * 两行共享同一批列宽 → 任何字体下拼音都正好压在对应汉字上。
 * 与 buildAlignedBlock 必须覆盖同一批字符（同一套 keepUnrecognized 过滤），
 * 否则页面上看到的列和复制出去的文本会对不上。
 */
export function buildAlignedCells(
  items: PinyinItem[],
  style: PinyinStyle,
  opts: JoinOptions = {},
): AlignedCell[] {
  const cells: AlignedCell[] = [];
  for (const item of items) {
    if (!item.isHan || !item.raw) {
      if (opts.keepUnrecognized === false) {
        continue;
      }
      cells.push({ pinyin: item.char, char: item.char });
      continue;
    }
    cells.push({ pinyin: formatPinyin(item.raw, style, opts), char: item.char });
  }
  return cells;
}

