import { textArraySort } from '@/utils/text-delimiters';

/**
 * 「文本处理」的纯逻辑层。
 *
 * 实现依据：参考站 toolhelper.cn 的 /js/page/text/handle.min.js，
 * 核心是 `commonTextHandleBefore`（空格/空行/前后缀剥离）+ `textIndent`（缩进/反缩进）
 * + `textReplace`（双向替换）。参考站把这三者拆成 4 个区块、各带一个「应用」按钮，
 * 用户要串成流水线得手动点「交换输入/输出」；本站按约定做成单页连续流水线，
 * 顺序固定为：去空格 → 前后缀 → 缩进/反缩进 → 替换 → 排序/去重 → 行号。
 *
 * 三处与参考站**刻意不同**，已由单测锁定（别改回去）：
 *
 * 1. **去空格认 `^\s+` / `\s+$`，不只认半角空格。**
 *    参考站 `ys.trimStart(t, " ")` 拼出来的是「行首 + 若干半角空格 + 星号」那类正则，
 *    只吃半角空格，行首一个 Tab 就漏掉。
 *    这在「粘贴代码去掉缩进」的场景下很反直觉，所以统一用 `\s`。
 * 2. **替换走字面量替换，不走正则。**
 *    参考站 `ys.replaceAll(n, t, i)` 是 `n.replace(new RegExp(t, "g"), i)` —— 把「将」里的
 *    内容当正则源，用户填一个 `.` 或 `(` 就会匹配错/报错，填 `$&` 还会被当成替换模式展开。
 *    本站用 split/join 做字面量替换。要做正则替换请走站内的 /regex-tester。
 * 3. **空行判定用 trim() 之后的空串**，即纯空白行也算空行
 *    （参考站这里口径不统一：有的地方用严格 `=== ''`，有的地方用 `trim() === ''`）。
 */

export type PrefixSuffixMode = 'none' | 'add' | 'remove';
export type IndentMode = 'none' | 'add' | 'remove';
export type ReplacerMode = 'custom' | 'newline';

// A9 高级变换的类型定义
export type ReverseMode = 'none' | 'chars' | 'lines' | 'words';
export type TruncateMode = 'none' | 'head' | 'tail' | 'range';
export type InsertMode = 'none' | 'atPos' | 'everyN';

export interface TextFormatOptions {
  /** 去掉每行开头的空白 */
  removeLeftSpace: boolean;
  /** 去掉每行结尾的空白 */
  removeRightSpace: boolean;
  /** 删掉每行内部所有的空白（行与行之间的换行不被破坏） */
  removeAllSpace: boolean;
  /** 删掉空行 / 纯空白行 */
  removeEmptyLine: boolean;
  /** 前后缀处理：不处理 / 添加 / 删除 */
  prefixSuffixMode: PrefixSuffixMode;
  prefix: string;
  suffix: string;
  /** 缩进方式 */
  indentMethod: 'space' | 'tab';
  /** 一个缩进单位的空格数（indentMethod === 'tab' 时忽略） */
  indentUnitCount: number;
  indentMode: IndentMode;
  /** 是否执行替换 */
  replaceUsing: boolean;
  replaceFromMode: ReplacerMode;
  replaceFromText: string;
  replaceToMode: ReplacerMode;
  replaceToText: string;
  /** 结果排序：不排序 / 升序 / 降序 */
  orderBy: 'none' | 'asc' | 'desc';
  /** 去掉重复行（保留首次出现） */
  removeRepeat: boolean;
  /** 结果加行号 */
  showLineNumber: boolean;
  /** A9 高级变换：倒序方式（整段字符 / 逐行 / 逐词） */
  reverseMode: ReverseMode;
  /** A9 高级变换：上下标（下标 / 上标） */
  scriptMode: 'none' | 'sub' | 'super';
  /** A9 高级变换：截取方式（开头 / 末尾 / 中间） */
  truncateMode: TruncateMode;
  /** 截取：保留前/后 N 个字符 */
  truncateN: number;
  /** 截取（中间）：起始位置（含） */
  truncateFrom: number;
  /** 截取（中间）：结束位置（不含） */
  truncateTo: number;
  /** A9 高级变换：插入方式（指定位置 / 每隔 N 个） */
  insertMode: InsertMode;
  /** 插入：要插入的文本 */
  insertText: string;
  /** 插入（指定位置）：插到第几个字符之后 */
  insertPosition: number;
  /** 插入（每隔 N）：间隔字符数 */
  insertInterval: number;
}

export const DEFAULT_TEXT_FORMAT_OPTIONS: TextFormatOptions = {
  removeLeftSpace: true,
  removeRightSpace: true,
  removeAllSpace: false,
  removeEmptyLine: false,
  prefixSuffixMode: 'none',
  prefix: '',
  suffix: '',
  indentMethod: 'space',
  indentUnitCount: 4,
  indentMode: 'none',
  replaceUsing: false,
  replaceFromMode: 'custom',
  replaceFromText: '',
  replaceToMode: 'custom',
  replaceToText: '',
  orderBy: 'none',
  removeRepeat: false,
  showLineNumber: false,
  reverseMode: 'none',
  scriptMode: 'none',
  truncateMode: 'none',
  truncateN: 10,
  truncateFrom: 0,
  truncateTo: 10,
  insertMode: 'none',
  insertText: '',
  insertPosition: 0,
  insertInterval: 2,
};

export interface TextFormatResult {
  output: string;
  /** 进入排序阶段之前的行数 */
  totalLines: number;
  /** 被删掉的空行数 */
  emptyLinesRemoved: number;
  /** 被删掉的重复杂行数（removeRepeat 关闭时为 0） */
  duplicateLinesRemoved: number;
}

export function applyTextFormat(input: string, options: TextFormatOptions): TextFormatResult {
  if (!input) {
    return { output: '', totalLines: 0, emptyLinesRemoved: 0, duplicateLinesRemoved: 0 };
  }

  let text = input;
  let emptyLinesRemoved = 0;

  // ---- 1. 去除空格 / 空行（对应参考站 commonTextHandleBefore 的第一段） ----
  const kept: string[] = [];
  for (const raw of text.split('\n')) {
    let line = raw;
    if (options.removeLeftSpace) {
      line = line.replace(/^\s+/, '');
    }
    if (options.removeRightSpace) {
      line = line.replace(/\s+$/, '');
    }
    if (options.removeAllSpace) {
      line = line.replace(/\s+/g, '');
    }
    if (options.removeEmptyLine && line.trim() === '') {
      emptyLinesRemoved += 1;
      continue;
    }
    kept.push(line);
  }
  text = kept.join('\n');

  // ---- 2. 前后缀（对应参考站 textPrefixSuffix 的 case 0 / case 1） ----
  if (options.prefixSuffixMode === 'add' && (options.prefix || options.suffix)) {
    text = text
      .split('\n')
      .map((line) => options.prefix + line + options.suffix)
      .join('\n');
  } else if (options.prefixSuffixMode === 'remove' && (options.prefix || options.suffix)) {
    text = text
      .split('\n')
      .map((line) => stripPrefixSuffix(line, options.prefix, options.suffix))
      .join('\n');
  }

  // ---- 3. 缩进 / 反缩进（对应参考站 textIndent） ----
  if (options.indentMode !== 'none') {
    const unit =
      options.indentMethod === 'tab'
        ? '\t'
        : ' '.repeat(Math.max(1, Math.trunc(options.indentUnitCount) || 4));
    text = text
      .split('\n')
      .map((line) => {
        if (options.indentMode === 'add') {
          return unit + line; // 参考站 case 0：无脑前置
        }
        // 参考站 case 1：line.replace(unit, "") —— 只替换第一个匹配，且不限定在行首。
        // 这是参考站原行为，别顺手改成「只剥行首」，那会改变已有用户的预期。
        return line.replace(unit, '');
      })
      .join('\n');
  }

  // ---- 4. 替换（对应参考站 textReplace / commonTextHandleAfter） ----
  if (options.replaceUsing) {
    const from = options.replaceFromMode === 'newline' ? '\n' : options.replaceFromText;
    const to = options.replaceToMode === 'newline' ? '\n' : options.replaceToText;
    if (from) {
      // 多组替换：参考站 textreplace 支持「查找目标」用 | 分隔多个文本，
      // 全部替换成同一个「替换为」。这里对齐：from 含 | 时按 | 拆分逐一替换。
      // 注意用字面量替换（split/join），不走正则，避免 `.` `(` `$&` 被当正则。
      const froms = from.split('|');
      for (const f of froms) {
        if (f) text = text.split(f).join(to);
      }
    }
  }

  // ---- 5. 排序 / 去重 ----
  let lines = text.split('\n');
  const totalLines = lines.length;

  if (options.removeRepeat) {
    const seen = new Set<string>();
    lines = lines.filter((line) => {
      if (seen.has(line)) {
        return false;
      }
      seen.add(line);
      return true;
    });
  }
  const duplicateLinesRemoved = totalLines - lines.length;

  lines = textArraySort(lines, orderByToLegacy(options.orderBy));

  // ---- 5.5 高级变换（A9：倒序 / 上下标 / 截取 / 插入）----
  // 四个变换按「倒序 → 上下标 → 截取 → 插入」的固定顺序串接，
  // 但每个都默认关闭，单独开一个也不会影响上面的流水线。
  // 顺序刻意放在排序之后、行号之前：这样「行号」始终加在最终结果最前面，
  // 不会被插入挤到中间、也不会被截取削掉。
  if (
    options.reverseMode !== 'none' ||
    options.scriptMode !== 'none' ||
    options.truncateMode !== 'none' ||
    options.insertMode !== 'none'
  ) {
    let advanced = lines.join('\n');
    if (options.reverseMode !== 'none') {
      advanced = reverseText(advanced, options.reverseMode);
    }
    if (options.scriptMode !== 'none') {
      advanced = toScript(advanced, options.scriptMode);
    }
    if (options.truncateMode !== 'none') {
      advanced = truncateText(advanced, options.truncateMode, options.truncateN, options.truncateFrom, options.truncateTo);
    }
    if (options.insertMode !== 'none') {
      advanced = insertText(advanced, options.insertMode, options.insertText, options.insertPosition, options.insertInterval);
    }
    lines = advanced.split('\n');
  }

  // ---- 6. 行号（对应参考站 isShowLineNumber） ----
  if (options.showLineNumber) {
    lines = lines.map((line, index) => `${index + 1}：${line}`);
  }

  return {
    output: lines.join('\n'),
    totalLines,
    emptyLinesRemoved,
    duplicateLinesRemoved,
  };
}

/**
 * 参考站 `textArraySort` 的 orderBy 是字符串 '1'/'2'/'3'；
 * 本站 UI 用 'none'/'asc'/'desc'，这里做一次映射，免得调用方记两套值。
 */
function orderByToLegacy(orderBy: TextFormatOptions['orderBy']): string {
  switch (orderBy) {
    case 'asc':
      return '2';
    case 'desc':
      return '3';
    default:
      return '1';
  }
}

/**
 * 对应参考站 `textPrefixSuffix` 的 case 1（删除前后缀）。
 * 逐字还原参考站的两个边界：前缀必须「整行确实以它开头」才剥；
 * 后缀剥之前要求 `t.length - suffix.length > 0`，也就是后缀比整行还长时**不剥**
 * （参考站在该值为 <=0 时什么都不做，而不是截断）。
 */
function stripPrefixSuffix(line: string, prefix: string, suffix: string): string {
  let result = line;
  if (prefix && result.startsWith(prefix)) {
    result = result.slice(prefix.length);
  }
  if (suffix) {
    const remaining = result.length - suffix.length;
    if (remaining > 0 && result.endsWith(suffix)) {
      result = result.slice(0, remaining);
    }
  }
  return result;
}

/* ============================================================================
 * A9 高级变换：倒序 / 上下标 / 截取 / 插入
 *
 * 这些函数是「字符串级」变换，和上面基于「行」的流水线（去空格/前后缀/缩进/
 * 排序）是两套心智模型。它们被 applyTextFormat 在排序之后、行号之前统一调用一次，
 * 所以拿到的是已经排好序、去完重的整段文本。
 * ========================================================================== */

/**
 * 倒序。
 * - chars：把整段文本（含换行）当作一个字符序列整体反转，换行符也会跑到中间去
 * - lines：只反转行的顺序（行内字符不变），对应参考站「文本倒序」的逐行语义
 * - words：逐行把词序反转（按空白切分，词之间以单个空格重连）
 */
export function reverseText(text: string, mode: ReverseMode): string {
  if (mode === 'none' || !text) {
    return text;
  }
  if (mode === 'chars') {
    return Array.from(text).reverse().join('');
  }
  if (mode === 'lines') {
    return text.split('\n').reverse().join('\n');
  }
  // words：逐行反转词序
  return text
    .split('\n')
    .map((line) => line.split(/\s+/).filter(Boolean).reverse().join(' '))
    .join('\n');
}

/**
 * 上下标。把有 Unicode 下标/上标对应形的字符替换掉，没有对应形的字符原样保留。
 * 覆盖数字 0-9、常用运算符 + - = ( ) 以及一部分拉丁字母；其余字符（中文、标点等）不变。
 */
const SUPERSCRIPT_MAP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', f: 'ᶠ', g: 'ᵍ', h: 'ʰ', i: 'ⁱ', j: 'ʲ', k: 'ᵏ', l: 'ˡ',
  m: 'ᵐ', n: 'ⁿ', o: 'ᵒ', p: 'ᵖ', r: 'ʳ', s: 'ˢ', t: 'ᵗ', u: 'ᵘ', v: 'ᵛ', w: 'ʷ', x: 'ˣ', y: 'ʸ', z: 'ᶻ',
  A: 'ᴬ', B: 'ᴮ', D: 'ᴰ', E: 'ᴱ', G: 'ᴳ', H: 'ᴴ', I: 'ᴵ', J: 'ᴶ', K: 'ᴷ', L: 'ᴸ', M: 'ᴹ',
  N: 'ᴺ', O: 'ᴼ', P: 'ᴾ', R: 'ᴿ', T: 'ᵀ', U: 'ᵁ', V: 'ⱽ', W: 'ᵂ',
};
const SUBSCRIPT_MAP: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
  a: 'ₐ', e: 'ₑ', h: 'ₕ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ', s: 'ₛ', t: 'ₜ', x: 'ₓ',
};

export function toScript(text: string, mode: 'none' | 'sub' | 'super'): string {
  if (mode === 'none' || !text) {
    return text;
  }
  const map = mode === 'sub' ? SUBSCRIPT_MAP : SUPERSCRIPT_MAP;
  return Array.from(text).map((ch) => map[ch] ?? ch).join('');
}

/**
 * 截取。按字符数（不是字节）截取，跨换行一并计入。
 * - head：保留前 N 个字符
 * - tail：保留后 N 个字符
 * - range：保留 [from, to) 区间（to <= from 时返回空）
 */
export function truncateText(
  text: string,
  mode: TruncateMode,
  n: number,
  from: number,
  to: number,
): string {
  if (mode === 'none' || !text) {
    return text;
  }
  const chars = Array.from(text);
  if (mode === 'head') {
    return chars.slice(0, Math.max(0, Math.trunc(n))).join('');
  }
  if (mode === 'tail') {
    return chars.slice(Math.max(0, chars.length - Math.trunc(n))).join('');
  }
  if (mode === 'range') {
    const start = Math.max(0, Math.trunc(from));
    const end = Math.trunc(to);
    if (end <= start) {
      return '';
    }
    return chars.slice(start, end).join('');
  }
  return text;
}

/**
 * 插入。
 * - atPos：在第 position 个字符之后插入（position <= 0 时插到最前面，>= 文本长度时插到最后面）
 * - everyN：每隔 interval 个字符插入一次（interval < 1 时按 1 处理）
 */
export function insertText(
  text: string,
  mode: InsertMode,
  insert: string,
  position: number,
  interval: number,
): string {
  if (mode === 'none' || !text) {
    return text;
  }
  const chars = Array.from(text);
  if (mode === 'atPos') {
    const pos = Math.max(0, Math.min(chars.length, Math.trunc(position)));
    return chars.slice(0, pos).join('') + insert + chars.slice(pos).join('');
  }
  // everyN
  const step = Math.max(1, Math.trunc(interval));
  const out: string[] = [];
  for (let i = 0; i < chars.length; i += step) {
    out.push(chars.slice(i, i + step).join(''));
    if (i + step < chars.length) {
      out.push(insert);
    }
  }
  return out.join('');
}
