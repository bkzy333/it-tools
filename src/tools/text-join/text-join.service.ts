import { isNullOrEmpty, resolveDelimiter, trimAllSpace } from '@/utils/text-delimiters';

/**
 * 「文本拼接」的纯逻辑层。
 *
 * 实现依据：参考站 toolhelper.cn 的 /js/page/text/join.min.js 的 `textJoin`。
 * 入口永远是「先按换行切成多行」，输出用「连接字符」拼回去，所以默认把多行压成一行。
 *
 * 两处与参考站一致、但容易被误「优化」的行为（单测已锁死）：
 *
 * 1. **过滤空行用的是严格空串**，即 `ys.isNullOrEmpty(t)`。
 *    开了「去除所有空格」之后，整行被 trimAllSpace 清空成 ''，才会被丢掉；
 *    光有「去除行首尾空格」时，纯空行本身已经是 '' 也会被丢 —— 这两条路径在参考站里
 *    都成立，别改成「只看 trim 之后是否为空」，那会改变「只勾去首尾空格」时的输出。
 * 2. `trimAllSpace` 删的是**所有**空白（含制表符、全角空格），不是只删半角空格。
 */

export interface TextJoinOptions {
  input: string;
  /** 连接字符的预设 Key，'0' 表示走自定义；默认 Key '' 回落到空字符串 */
  outputDelimiterKey: string;
  outputDelimiterCustom: string;
  removeFirstLastSpace: boolean;
  removeAllSpace: boolean;
}

export interface TextJoinResult {
  output: string;
  /** 参与拼接的行数（空行已被丢弃） */
  lines: number;
}

export function joinText(options: TextJoinOptions): TextJoinResult {
  if (isNullOrEmpty(options.input)) {
    return { output: '', lines: 0 };
  }

  const kept: string[] = [];
  for (const rawLine of options.input.split('\n')) {
    let line = rawLine;
    if (options.removeFirstLastSpace) {
      line = line.replace(/^ +/, '').replace(/ +$/, '');
    }
    if (options.removeAllSpace) {
      line = trimAllSpace(line);
    }
    if (isNullOrEmpty(line)) {
      continue;
    }
    kept.push(line);
  }

  return {
    output: kept.join(resolveDelimiter(options.outputDelimiterKey, options.outputDelimiterCustom)),
    lines: kept.length,
  };
}
