// 中英文混排纠正 的纯逻辑层。
//
// 行为依据：参考站 iamwawa.cn/paiban.html 的「中英文排版纠正器」。
// 规则（参考站原文，本站逐条对齐）：
//   1. 中英文之间需要增加空格
//   2. 中文与数字之间需要增加空格
//   3. 数字与单位之间无需增加空格
//   4. 全角标点与其他字符之间不加空格
//   5. 标点符号不重复使用
//   6. 使用全角中文标点（英文整句/特殊名词内用半角标点）
//   7. 专有名词使用正确大小写（本站不做词典替换，仅做结构纠正）
//
// 说明：规则 6/7 涉及语义判断，参考站也是靠词典 + 启发式，效果有限。
// 本站聚焦「空格规则 + 去重复标点 + 半角标点转全角」这三类确定性强、收益高的纠正，
// 不做有争议的专有名词大小写替换（那需要维护一份专有名词表，且容易改错）。

export interface TypographyOptions {
  /** 中英文之间加空格 */
  spaceCjkLatin: boolean;
  /** 中文与数字之间加空格 */
  spaceCjkDigit: boolean;
  /** 半角标点转全角 */
  halfToFullPunct: boolean;
  /** 去除重复标点（如 「。。。」 → 「。」） */
  dedupePunct: boolean;
}

export const DEFAULT_TYPOGRAPHY_OPTIONS: TypographyOptions = {
  spaceCjkLatin: true,
  spaceCjkDigit: true,
  halfToFullPunct: true,
  dedupePunct: true,
};

const CJK = /[\u4e00-\u9fff\u3400-\u4dbf]/;
const LATIN = /[A-Za-z]/;
const DIGIT = /[0-9]/;

/** 半角标点 → 全角标点。 */
const HALF_TO_FULL: Record<string, string> = {
  ',': '，',
  '.': '。',
  '?': '？',
  '!': '！',
  ';': '；',
  ':': '：',
  '(': '（',
  ')': '）',
  '[': '【',
  ']': '】',
  '<': '《',
  '>': '》',
};

/** 允许重复（不折叠）的全角标点：省略号、破折号、书名号等。 */
const PUNCT_NO_COLLAPSE = new Set(['…', '—', '「', '」', '『', '』', '《', '》', '（', '）', '【', '】', '"', '"']);

export function applyTypography(text: string, options: TypographyOptions): string {
  if (!text) return text;

  const chars = Array.from(text);

  // 先做「中英文 / 中文数字 之间加空格」—— 通过插入空格的字符数组操作。
  let spaced = insertSpaces(chars, options);

  let result = spaced.join('');

  // 半角标点转全角（仅当标点不在英文/数字紧邻的「英文上下文」里 —— 简化：直接转）
  if (options.halfToFullPunct) {
    result = Array.from(result)
      .map((ch) => HALF_TO_FULL[ch] ?? ch)
      .join('');
  }

  // 去重复标点
  if (options.dedupePunct) {
    result = collapseRepeatedPunct(result);
  }

  return result;
}

/**
 * 中英文/中文数字之间加空格。
 * 规则：
 *   - CJK 字符后紧跟 Latin → 中间加空格
 *   - Latin 后紧跟 CJK → 中间加空格
 *   - CJK 后紧跟数字 → 中间加空格
 *   - 数字后紧跟 CJK → 中间加空格
 *   - 数字与单位（Latin 字母）之间不加空格（由第 3 条规则规避：数字-Latin 不插）
 */
function insertSpaces(chars: string[], options: TypographyOptions): string[] {
  const out: string[] = [];
  for (let i = 0; i < chars.length; i++) {
    const cur = chars[i];
    out.push(cur);

    const next = chars[i + 1];
    if (next === undefined) continue;

    const curIsCjk = CJK.test(cur);
    const nextIsCjk = CJK.test(next);
    const curIsLatin = LATIN.test(cur);
    const nextIsLatin = LATIN.test(next);
    const curIsDigit = DIGIT.test(cur);
    const nextIsDigit = DIGIT.test(next);

    // 需要加空格的情形
    let needSpace = false;
    if (options.spaceCjkLatin) {
      // 中↔英
      if ((curIsCjk && nextIsLatin) || (curIsLatin && nextIsCjk)) needSpace = true;
    }
    if (options.spaceCjkDigit) {
      // 中↔数字
      if ((curIsCjk && nextIsDigit) || (curIsDigit && nextIsCjk)) needSpace = true;
    }

    // 数字与单位之间不加空格：数字-拉丁、拉丁-数字 都不插（已由上面规则天然规避，
    // 因为既不涉及 CJK）。这里无需额外处理。

    if (needSpace && out[out.length - 1] !== ' ' && next !== ' ') {
      out.push(' ');
    }
  }
  return out;
}

/**
 * 折叠连续重复的标点（不含可合法重复的省略号/破折号等）。
 * 例如 「。。。！！」 → 「。！」、「，，」 → 「，」。
 */
function collapseRepeatedPunct(text: string): string {
  const chars = Array.from(text);
  const out: string[] = [];
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i];
    out.push(ch);
    // 若当前是「不可重复」的标点，且后续相同，则跳过后续
    if (isCollapsiblePunct(ch)) {
      let j = i + 1;
      while (j < chars.length && chars[j] === ch) j += 1;
      i = j;
    } else {
      i += 1;
    }
  }
  return out.join('');
}

function isCollapsiblePunct(ch: string): boolean {
  // 只折叠「标点符号」类，且不在白名单里
  if (PUNCT_NO_COLLAPSE.has(ch)) return false;
  return /[\p{P}\p{S}]/u.test(ch);
}
