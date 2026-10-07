import { isNullOrEmpty, resolveDelimiter, textArraySort } from '@/utils/text-delimiters';

/**
 * 「文本分割」的纯逻辑层。
 *
 * 实现依据：参考站 toolhelper.cn 的 /js/page/text/split.min.js，核心是 `textSplitArr`。
 * 该函数的怪癖（均为参考站原行为，单测已锁死，别改回去）：
 *
 * 1. 分隔符是**多字符**时按「任一命中即切」递归；本站 UI 只暴露单分隔符，
 *    所以递归退化成一层，但保留结构以便将来放开。
 * 2. 切出来的**首尾空段直接丢弃**，中间的**空段保留**（例如 `a,,b` 会得到 `['a','','b']`）。
 *    这是 `textSplitArr` 里 `(f==0 || f==r.length-1) && isNullOrEmpty(r[f])` 那个判断的副作用。
 * 3. 整个文本里根本找不到分隔符时，原样作为一段返回（不拆）。
 */

export type SplitOrder = 'none' | 'asc' | 'desc';

export interface TextSplitOptions {
  input: string;
  /** 预设分隔符的 Key（见 DELIMITER_OPTIONS），'0' 表示走自定义 */
  inputDelimiterKey: string;
  inputDelimiterCustom: string;
  outputDelimiterKey: string;
  outputDelimiterCustom: string;
  orderBy: SplitOrder;
  removeFirstLastSpace: boolean;
  showLineNumber: boolean;
}

export interface TextSplitResult {
  output: string;
  /** 参与输出的段数（未加行号、未拼接前的条数） */
  parts: number;
  /** 找不到分隔符时的原样回显标记，UI 用它提示「没切」 */
  unchanged: boolean;
}

export function splitText(options: TextSplitOptions): TextSplitResult {
  const { input, inputDelimiterKey, inputDelimiterCustom, outputDelimiterKey, outputDelimiterCustom } = options;

  if (isNullOrEmpty(input)) {
    return { output: '', parts: 0, unchanged: false };
  }
  if (isNullOrEmpty(inputDelimiterKey)) {
    return { output: '', parts: 0, unchanged: false };
  }

  const inputDelimiter = resolveDelimiter(inputDelimiterKey, inputDelimiterCustom);
  const outputDelimiter = resolveDelimiter(outputDelimiterKey, outputDelimiterCustom);

  let parts = textSplitArr(input, inputDelimiter);

  if (options.removeFirstLastSpace) {
    parts = parts.map((part) => part.replace(/^\s+/, '').replace(/\s+$/, ''));
  }

  parts = textArraySort(parts, orderToLegacy(options.orderBy));
  const unchanged = parts.length === 1 && parts[0] === input;

  if (options.showLineNumber) {
    parts = parts.map((part, index) => `${index + 1}：${part}`);
  }

  return {
    output: parts.join(outputDelimiter),
    parts: parts.length,
    unchanged,
  };
}

/**
 * 参考站 `textSplitArr` 的移植。
 * `delimiter.split('☆')` 那条路径是参考站用来塞「多个分隔符」的，本站没有这个入口；
 * 单分隔符时它就是一句 `text.split(delimiter)` + 首尾空段丢弃。
 */
export function textSplitArr(text: string, delimiter: string, result: string[] = []): string[] {
  if (isNullOrEmpty(delimiter) || isNullOrEmpty(text)) {
    result.push(text);
    return result;
  }

  const chunks = delimiter.split('☆');
  let matched = false;

  for (const chunk of chunks) {
    const segments = text.split(chunk);
    if (segments.length > 1) {
      matched = true;
      segments.forEach((segment, index) => {
        const emptyEdge = (index === 0 || index === segments.length - 1) && isNullOrEmpty(segment);
        if (emptyEdge) {
          return;
        }
        textSplitArr(segment, delimiter, result);
      });
      break;
    }
  }

  if (!matched) {
    result.push(text);
  }

  return result;
}

/** 本站 UI 用 none/asc/desc，参考站内部是 '1'/'2'/'3'，映射一次免得调用方记两套值。 */
function orderToLegacy(order: SplitOrder): string {
  if (order === 'asc') return '2';
  if (order === 'desc') return '3';
  return '1';
}
