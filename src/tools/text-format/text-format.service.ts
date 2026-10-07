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
      text = text.split(from).join(to); // 字面量全量替换，不走正则
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
