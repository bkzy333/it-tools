// 文本合并 的纯逻辑层（多行拼接 / 多列拼接）。
//
// 2026-10-13：已合并原「文本拼接」(/text-join) —— 两者核心都是「多行文本用分隔符拼成一行」，
// 本工具多出「按列合并 / 输入列分隔符 / 复制为 TSV / 导出 Excel / 跳过空值」，故保留本工具、
// 下线 /text-join，并把它的两个独有选项（去首尾空格 / 删除所有空格）搬了过来。
//
// ⚠️ 搬过来的两个空格选项口径是照搬原 text-join 的，别顺手「优化」：
//   1. removeFirstLastSpace 只处理**半角**空格（/^ +/ 与 / +$/），不碰制表符；
//   2. removeAllSpace 删的是**所有**空白（含制表符、全角空格），不是只删半角空格。
//   两条都有单测锁死（见 describe('空格清理（原「文本拼接」口径）')）。
import { trimAllSpace } from '@/utils/text-delimiters';

export type MergeMode = 'rows' | 'cols';

export interface MergeSettings {
  /** 输入文本（每行一条记录；多列模式下每行内以 inputDelimiter 拆列） */
  input: string;
  /** rows = 把所有行连成一行；cols = 每行内部按列连接 */
  mode: MergeMode;
  /** 输出分隔符（连接时用） */
  outputDelimiter: string;
  /** 仅 cols 模式使用：每行内的列分隔符，默认 Tab（Excel 复制即是 Tab） */
  inputDelimiter: string;
  /** 跳过空值（行模式跳空行；列模式跳空单元格，整行变空则跳过） */
  skipEmpty: boolean;
  /** 去掉每行首尾的半角空格（原「文本拼接」功能合并而来） */
  removeFirstLastSpace?: boolean;
  /** 删掉行内所有空白字符（含制表符、全角空格，原「文本拼接」功能合并而来） */
  removeAllSpace?: boolean;
}

export interface MergeResult {
  /** 按输出分隔符拼接的纯文本（行模式为单行，列模式为多行） */
  output: string;
  /** 复制为 TSV 用：Tab 分隔、换行分行，可直接粘回 Excel */
  tsv: string;
  /** 结构化二维数组，供「导出 Excel」使用 */
  rows: string[][];
  /** 单元格总数（用于状态显示） */
  cellCount: number;
}

/**
 * 按「去首尾空格 → 删所有空格」的顺序清理一行。
 * 顺序不能反：先删所有空格的话，首尾空格早没了，去首尾就成了空操作。
 */
function cleanLine(line: string, removeFirstLastSpace: boolean, removeAllSpace: boolean): string {
  let out = line;
  if (removeFirstLastSpace) {
    out = out.replace(/^ +/, '').replace(/ +$/, '');
  }
  if (removeAllSpace) {
    out = trimAllSpace(out);
  }
  return out;
}

/**
 * 把多行/多列文本按要求合并。纯函数、不抛错——空输入返回全空结果。
 *
 * 处理顺序：先做空格清理，再判空 —— 这样开了「删除所有空格」后整行变空的行才会被
 * skipEmpty 丢掉（原 text-join 的口径：先 trimAllSpace 再判空串，单测已锁死）。
 */
export function mergeText(settings: MergeSettings): MergeResult {
  const { input, mode, outputDelimiter, inputDelimiter, skipEmpty } = settings;
  const removeFirstLastSpace = settings.removeFirstLastSpace ?? false;
  const removeAllSpace = settings.removeAllSpace ?? false;
  if (!input) return { output: '', tsv: '', rows: [], cellCount: 0 };

  const needsClean = removeFirstLastSpace || removeAllSpace;
  const lines = input.split(/\r?\n/);

  // 行模式：所有行用输出分隔符连成一行；TSV 退化为单列（每行一个值）
  if (mode === 'rows') {
    let parts = needsClean ? lines.map((l) => cleanLine(l, removeFirstLastSpace, removeAllSpace)) : lines;
    if (skipEmpty) parts = parts.filter((l) => l.trim() !== '');
    const output = parts.join(outputDelimiter);
    const tsv = parts.join('\n');
    const rows = parts.map((p) => [p]);
    return { output, tsv, rows, cellCount: parts.length };
  }

  // 列模式：每行按 inputDelimiter 拆列，再用 outputDelimiter 连接
  const rows: string[][] = [];
  for (const rawLine of lines) {
    const line = needsClean ? cleanLine(rawLine, removeFirstLastSpace, removeAllSpace) : rawLine;
    if (skipEmpty && line.trim() === '') continue;
    let cells = line.split(inputDelimiter);
    if (skipEmpty) cells = cells.filter((c) => c.trim() !== '');
    if (skipEmpty && cells.length === 0) continue;
    rows.push(cells);
  }
  const output = rows.map((cells) => cells.join(outputDelimiter)).join('\n');
  const tsv = rows.map((cells) => cells.join('\t')).join('\n');
  const cellCount = rows.reduce((n, r) => n + r.length, 0);
  return { output, tsv, rows, cellCount };
}
