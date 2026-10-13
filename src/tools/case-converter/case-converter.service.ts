import { type LanguageCode } from 'stopword';
import * as stopwords from 'stopword';
import langs from 'langs';

const STARTING_PUNCT = /^[({[\“"']+/;
const TRAILING_PUNCT = /[.,;:!?'"”’)\]}]+$/;
const FRENCH_ELISION = /^(l|d|j|t|m|n|s|c|qu)['’](.+)$/iu;

/**
 * 返回所有受支持语言的 { value, label } 列表。
 * 注意：stopword 包的导出除了各语言停用词数组（3 字母 ISO 639-3 码，如 eng/zho），
 * 还混有非语言导出（removeStopwords 函数、_123/lggNd/panGu/porBr 等），直接 Object.entries 会把它们当选项吐进下拉。
 * 这里过滤出「3 字母小写码且能被 langs 解析为真实语言」的项，剔除脏键；eng 默认项始终保留。
 */
export function getSupportedLanguages(): Array<{ value: string; label: string }> {
  return Object.entries(stopwords)
    .map(([code]) => ({ code, lang: langs.where('3', code) }))
    .filter(({ code, lang }) => /^[a-z]{3}$/.test(code) && lang)
    .map(({ code, lang }) => ({ value: code, label: lang!.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * 连接符保护用的哨兵串。
 * 取 6 个小写字母：正常文本里几乎不可能出现，且能被 change-case 一起做大小写变换，
 * 转换后按「大小写不敏感」还原即可。
 */
export const CONNECTOR_SENTINEL = 'qxzjqv';

/**
 * 哨兵下标字母。
 * 每个连接符配一个「带下标的独立哨兵」：早期所有连接符共用一个哨兵，
 * 还原时 qxzjqv 会被整体换成 chars 全串，导致 - 和 _ 都变成 "-_"。
 */
const SENTINEL_INDEX_LETTERS = 'abcdefghijklmnopqrstuvwxyz';

/** 去重后的连接符字符列表（保持出现顺序） */
function uniqueChars(chars: string): string[] {
  return [...new Set(chars.split(''))];
}

/** 第 index 个连接符对应的哨兵串 */
function markerFor(index: number): string {
  return CONNECTOR_SENTINEL + (SENTINEL_INDEX_LETTERS[index] ?? '');
}

/** 把「单词构成规则」里的字符安全地放进正则字符类。 */
export function escapeCharClass(chars: string): string {
  return chars.replace(/[\\\]^-]/g, '\\$&');
}

/**
 * 转换前：把用户指定的连接符（如 _ 或 -）换成各自独立的哨兵串。
 * 这样 change-case 就不会在这些字符处断词。
 */
export function protectConnectors(input: string, chars: string): string {
  if (!chars) {
    return input;
  }
  try {
    const list = uniqueChars(chars);
    const markers = new Map<string, string>();
    list.forEach((ch, i) => markers.set(ch, markerFor(i)));
    // 单次扫描 + 回调替换：已插入的哨兵不会被再次扫描，避免二次替换污染哨兵本身
    return input.replace(new RegExp(`[${escapeCharClass(list.join(''))}]`, 'g'), (m) => markers.get(m) ?? m);
  } catch {
    return input;
  }
}

/** 转换后：按大小写不敏感把各哨兵还原成对应连接符。 */
export function restoreConnectors(input: string, chars: string): string {
  if (!chars) {
    return input;
  }
  try {
    const list = uniqueChars(chars);
    let out = input;
    list.forEach((ch, i) => {
      out = out.replace(new RegExp(markerFor(i), 'gi'), ch);
    });
    return out;
  } catch {
    return input;
  }
}

/**
 * 带连接符保护的单行转换：保护 → 转换 → 还原。
 * 转换函数抛异常时回退为「已保护的原串」还原后的结果，不影响其他行（U5 容错）。
 */
export function convertWithConnectors(
  fn: (s: string) => string,
  input: string,
  chars: string,
): string {
  const guarded = protectConnectors(input, chars);
  let out: string;
  try {
    out = fn(guarded);
  } catch {
    out = guarded;
  }
  return restoreConnectors(out, chars);
}

/** 内容过滤：按顺序把每条正则从文本里清除；无效正则跳过，不让一条规则拖垮整体。
 *  使用 `u` 标志以支持 Unicode 属性转义（如 \p{P}\p{S}），否则「去除特殊符号」无法保留中文等非 ASCII 文字。 */
export function applyCleaningPatterns(input: string, patterns: string[]): string {
  let cleaned = input;
  for (const pattern of patterns) {
    try {
      cleaned = cleaned.replace(new RegExp(pattern, 'gu'), '');
    } catch {
      // 忽略无效正则
    }
  }
  return cleaned;
}

/**
 * Title Case with stopwords, punctuation handling (start & end),
 * and French elisions.
 */
export function toLanguageTitleCase(input: string, lang: string = 'eng'): string {
  const stop = new Set(stopwords[lang as LanguageCode] ?? []);

  const words = input
    .trim()
    .split(/\s+/)
    .map((w) => w.toLowerCase());

  let wasBoundary = true; // Start of string is a boundary
  return words
    .map((rawWord) => {
      // Extract starting punctuation
      const startMatch = rawWord.match(STARTING_PUNCT);
      const startPunct = startMatch ? startMatch[0] : '';
      const withoutStart = startPunct ? rawWord.slice(startPunct.length) : rawWord;

      // Extract trailing punctuation
      const endMatch = withoutStart.match(TRAILING_PUNCT);
      const endPunct = endMatch ? endMatch[0] : '';
      const core = endPunct ? withoutStart.slice(0, -endPunct.length) : withoutStart;

      const isBoundary = wasBoundary;
      const isStopword = stop.has(core);

      wasBoundary = withoutStart.match(/[.!?]['"”’)\]}]*$/) !== null;

      if (lang === 'fra') {
        const elision = core.match(FRENCH_ELISION);
        if (elision) {
          const [, prefix, rest] = elision;
          const capPrefix = isBoundary ? prefix.charAt(0).toUpperCase() + prefix.slice(1) : prefix;
          const capRest = rest.charAt(0).toUpperCase() + rest.slice(1);
          return `${startPunct}${capPrefix}’${capRest}${endPunct}`;
        }
      }

      if (isStopword && !isBoundary) {
        return `${startPunct}${core}${endPunct}`;
      }

      // Default capitalization
      const cap = core.charAt(0).toUpperCase() + core.slice(1);
      return `${startPunct}${cap}${endPunct}`;
    })
    .join(' ');
}
