// 文本查重（两段文本重复率检测）的纯逻辑层。
//
// 行为依据：参考站 iamwawa.cn/textcheck.html 的「内容重复率检测」。
// 参考站口径：先对两段内容分词，再对词组比较，高亮重复内容，算重复率。
//
// 本站实现（纯前端、零依赖）：
//   - 中文按「字符 2-gram」切分（跨句、忽略空白），英文按「单词」切分；
//   - 用 N-gram 集合的 Jaccard / 覆盖率计算重复率；
//   - 高亮：把「文本 B 里命中的 n-gram」标记出来，返回带 <mark> 的 HTML 片段。
//
// 重复率定义（对齐参考站「重复率」直觉）：文本 B 中，与文本 A 相同的 n-gram
// 覆盖了多少 —— 用「B 的 n-gram 中被 A 命中的比例」作为主口径，
// 同时给出 Jaccard 相似度作为参考。这样「B 抄 A」时数值更直观。

export interface SimilarityResult {
  /** 文本 B 的 n-gram 中被 A 命中的比例（0~1），主口径 */
  coverage: number;
  /** Jaccard 相似度（0~1），参考口径 */
  jaccard: number;
  /** 命中的 n-gram 数量 */
  matched: number;
  /** 文本 B 的 n-gram 总数 */
  totalB: number;
  /** 高亮后的文本 B（HTML，含 <mark>） */
  highlighted: string;
}

/** 中文 2-gram 切分：把连续的中文字符（含中日韩统一表意）两两一组。 */
function chineseBigrams(text: string): string[] {
  const chars = text.replace(/[\s\p{P}\p{S}]+/gu, '').split('');
  const grams: string[] = [];
  for (let i = 0; i < chars.length - 1; i++) {
    grams.push(chars[i] + chars[i + 1]);
  }
  return grams;
}

/** 英文/拉丁按单词切分，转小写、去标点。 */
function wordTokens(text: string): string[] {
  return text
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu)
    ?.filter((w) => w.length > 0) ?? [];
}

/**
 * 提取文本的 n-gram 集合（去重）。
 * 混合策略：中文用 2-gram，英文单词单独作为 token 混入。
 */
export function tokenize(text: string): string[] {
  return [...new Set([...chineseBigrams(text), ...wordTokens(text)])];
}

/** 计算重复率。 */
export function computeSimilarity(textA: string, textB: string): SimilarityResult {
  const tokensA = tokenize(textA);
  const tokensB = tokenize(textB);

  if (tokensB.length === 0) {
    return { coverage: 0, jaccard: 0, matched: 0, totalB: 0, highlighted: escapeHtml(textB) };
  }

  const setA = new Set(tokensA);
  let matched = 0;
  for (const t of tokensB) {
    if (setA.has(t)) matched += 1;
  }

  const coverage = matched / tokensB.length;
  const union = new Set([...tokensA, ...tokensB]).size;
  const jaccard = union === 0 ? 0 : matched / union;

  return {
    coverage,
    jaccard,
    matched,
    totalB: tokensB.length,
    highlighted: highlightText(textB, setA),
  };
}

/**
 * 把文本 B 里「命中 A 的 n-gram」用 <mark> 包起来。
 * 简化策略：逐中文字符对 + 逐英文单词判断是否命中。
 */
function highlightText(text: string, setA: Set<string>): string {
  // 逐字符扫描：遇到连续中文，判断相邻两个字符构成的 bigram 是否命中；
  // 遇到英文单词，判断整个小写单词是否命中。
  let out = '';
  let i = 0;
  const chars = Array.from(text);

  while (i < chars.length) {
    const ch = chars[i];
    // 中文（CJK 统一表意文字）
    if (/[\u4e00-\u9fff]/.test(ch)) {
      // 收集连续中文段
      let j = i;
      let seg = '';
      while (j < chars.length && /[\u4e00-\u9fff]/.test(chars[j])) {
        seg += chars[j];
        j += 1;
      }
      out += highlightChineseSegment(seg, setA);
      i = j;
    } else if (/[\p{L}\p{N}]/u.test(ch)) {
      // 英文单词/数字
      let j = i;
      let seg = '';
      while (j < chars.length && /[\p{L}\p{N}]/u.test(chars[j])) {
        seg += chars[j];
        j += 1;
      }
      out += setA.has(seg.toLowerCase()) ? `<mark>${escapeHtml(seg)}</mark>` : escapeHtml(seg);
      i = j;
    } else {
      out += escapeHtml(ch);
      i += 1;
    }
  }
  return out;
}

/** 中文段内，对每个 bigram 判断是否命中；命中的两个字符都标黄（重叠则顺延）。 */
function highlightChineseSegment(seg: string, setA: Set<string>): string {
  const chars = Array.from(seg);
  const marked = new Array<boolean>(chars.length).fill(false);

  for (let k = 0; k < chars.length - 1; k++) {
    const gram = chars[k] + chars[k + 1];
    if (setA.has(gram)) {
      marked[k] = true;
      marked[k + 1] = true;
    }
  }

  let out = '';
  let k = 0;
  while (k < chars.length) {
    if (marked[k]) {
      let end = k;
      while (end < chars.length && marked[end]) end += 1;
      out += `<mark>${escapeHtml(chars.slice(k, end).join(''))}</mark>`;
      k = end;
    } else {
      out += escapeHtml(chars[k]);
      k += 1;
    }
  }
  return out;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
