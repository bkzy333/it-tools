// 文本合并 的纯逻辑层（多行拼接 / 多列拼接），与 text-join 的区别在于支持「列维度」与「复制为 TSV」。

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
 * 把多行/多列文本按要求合并。纯函数、不抛错——空输入返回全空结果。
 */
export function mergeText(settings: MergeSettings): MergeResult {
  const { input, mode, outputDelimiter, inputDelimiter, skipEmpty } = settings;
  if (!input) return { output: '', tsv: '', rows: [], cellCount: 0 };

  const lines = input.split(/\r?\n/);

  // 行模式：所有行用输出分隔符连成一行；TSV 退化为单列（每行一个值）
  if (mode === 'rows') {
    const parts = skipEmpty ? lines.filter((l) => l.trim() !== '') : lines;
    const output = parts.join(outputDelimiter);
    const tsv = parts.join('\n');
    const rows = parts.map((p) => [p]);
    return { output, tsv, rows, cellCount: parts.length };
  }

  // 列模式：每行按 inputDelimiter 拆列，再用 outputDelimiter 连接
  const rows: string[][] = [];
  for (const line of lines) {
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
