export function getStringSizeInBytes(text: string) {
  return new TextEncoder().encode(text).buffer.byteLength;
}

export function textStatistics(text: string) {
  const words_no_puncts = text.replace(/\p{P}/gu, '').trim().split(/\s+/).filter(Boolean);
  const read_word_per_minutes = 200;
  return {
    chars: text.length,
    chars_no_spaces: text.replace(/\s+/gu, '').length,
    chars_upper: text.replace(/[^\p{Lu}]/gu, '').length,
    chars_lower: text.replace(/[^\p{Ll}]/gu, '').length,
    chars_digits: text.replace(/\D+/gu, '').length,
    chars_puncts: text.replace(/[^\p{P}]/gu, '').length,
    chars_spaces: text.replace(/\S/gu, '').length,
    words: text.trim().split(/\s+/).filter(Boolean).length,
    read_time: (words_no_puncts.length / read_word_per_minutes) * 60,
    words_no_puncs: words_no_puncts.length,
    words_uniques: new Set(words_no_puncts).size,
    words_uniques_ci: new Set(words_no_puncts.map((s) => s.toLowerCase())).size,
    sentences: `${text} `.split(/\w\s*[\.!\?][\s\p{P}]*\s/u).filter((s) => s && s?.length > 0).length,
    lines: text.split(/\r\n|\r|\n/).length,
  };
}

/* ---------------------------------------------------------------------------
 * 词频统计（对齐参考站 cipin.html 的「词频统计工具」）
 *
 * 参考站三个开关：
 *   - 英文不统计介词（stopword）
 *   - 中文不统计单个字
 *   - 不统计纯数字
 * 结果按出现次数降序，显示前 N 项。
 *
 * 本站实现（纯前端、零依赖）：
 *   - 英文按「单词」切分（去标点、转小写）
 *   - 中文按「单字」切分（可选排除单个字）
 *   - 提供一个内置英文 stopword 小集合（介词/冠词/连词）
 * ------------------------------------------------------------------------ */

export interface WordFrequencyOptions {
  /** 英文不统计介词 */
  excludeStopwords: boolean;
  /** 中文不统计单个字 */
  excludeSingleCjk: boolean;
  /** 不统计纯数字 */
  excludeDigits: boolean;
  /** 结果前 N 项 */
  topN: number;
}

export interface WordFrequencyItem {
  word: string;
  count: number;
}

/** 内置英文 stopword 集合（介词/冠词/连词/代词等高频虚词）。 */
const ENGLISH_STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'by',
  'in', 'of', 'up', 'as', 'so', 'yet', 'off', 'if', 'per', 'via', 'out',
  'with', 'without', 'from', 'into', 'over', 'under', 'about', 'between',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'its', 'our', 'their', 'this', 'that', 'these', 'those',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am', 'do', 'does', 'did',
  'have', 'has', 'had', 'will', 'would', 'can', 'could', 'should', 'may', 'might',
  'not', 'no', 'yes', 'just', 'also', 'very', 'more', 'most', 'some', 'any',
]);

/**
 * 统计词频。
 * 英文单词与中文单字分开统计：中文单字只有当「不排除单个字」时才计入。
 * 英文单词切分后统一转小写（大小写视为同一词）。
 */
export function wordFrequency(text: string, options: WordFrequencyOptions): WordFrequencyItem[] {
  const map = new Map<string, number>();
  const add = (word: string) => {
    if (!word) return;
    map.set(word, (map.get(word) ?? 0) + 1);
  };

  // 1. 英文单词：按空白/标点切分，转小写
  const englishWords = text
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? [];

  for (const word of englishWords) {
    // 纯数字
    if (options.excludeDigits && /^\p{N}+$/u.test(word)) continue;
    // 纯英文单词
    if (/^[a-z]+$/u.test(word)) {
      if (options.excludeStopwords && ENGLISH_STOPWORDS.has(word)) continue;
      add(word);
      continue;
    }
    // 含数字的混合串（如 abc123）也跳过数字过滤后计入
    add(word);
  }

  // 2. 中文单字：逐个字符统计
  if (!options.excludeSingleCjk) {
    const cjkChars = text.match(/[\u4e00-\u9fff]/gu) ?? [];
    for (const ch of cjkChars) {
      add(ch);
    }
  }

  // 降序排序，取前 N
  const items = [...map.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count);

  return items.slice(0, Math.max(1, Math.min(500, Math.floor(options.topN) || 50)));
}

