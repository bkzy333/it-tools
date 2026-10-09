// 表格形状转换 的纯逻辑层。放在这里而不是 .vue 里，是为了能跑 vitest 单测。
//
// 只做「形状变换」，不做聚合 / 反透视（那是 table-pivot 的活），两者职责分开，
// 避免一个工具又聚合又变形、边界糊成一团。
//
// 支持的四种变换：
//   transpose —— 行列互换
//   chunk     —— 按列数把宽表纵向切成若干块（每块自带表头）
//   flatten   —— 把整张表摊平成一列（每个单元格一行）
//   merge     —— 把所有单元格合并成一行（用分隔符连接）

export type TableShapeOp = 'transpose' | 'chunk' | 'flatten' | 'merge';

export interface TableShapeOptions {
  op: TableShapeOp;
  /** 解析 / 序列化用的单元格分隔符，默认 tab */
  delimiter: string;
  /** chunk 模式：每块多少列 */
  chunkCols: number;
  /** merge 模式：连接所有单元格的分隔符 */
  mergeSep: string;
}

/** 自动挑分隔符：有 tab 优先 tab（TSV），否则看逗号密度，再否则退化为空白/分号 */
export function detectDelimiter(text: string): string {
  const sample = text.slice(0, 4096);
  if (sample.includes('\t')) return '\t';
  const lines = sample.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length >= 2) {
    const commaCounts = lines.map((l) => (l.match(/,/g) || []).length);
    const semicolonCounts = lines.map((l) => (l.match(/;/g) || []).length);
    const avgComma = commaCounts.reduce((a, b) => a + b, 0) / lines.length;
    const avgSemi = semicolonCounts.reduce((a, b) => a + b, 0) / lines.length;
    if (avgSemi > avgComma && avgSemi > 0) return ';';
    if (avgComma > 0) return ',';
  }
  return '\t';
}

/** 把文本解析成二维数组；空行跳过，保证返回的是「有内容的行」 */
export function parseTable(text: string, delimiter: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => line.split(delimiter).map((c) => c.trim()));
}

/** 把二维数组序列化回文本 */
export function serializeTable(rows: string[][], delimiter: string): string {
  return rows.map((r) => r.join(delimiter)).join('\n');
}

/** 转置：行列互换；长短不齐时按最长行补空串 */
export function transpose(rows: string[][]): string[][] {
  if (rows.length === 0) return [];
  const cols = Math.max(...rows.map((r) => r.length));
  const out: string[][] = [];
  for (let c = 0; c < cols; c++) {
    const line: string[] = [];
    for (let r = 0; r < rows.length; r++) line.push(rows[r][c] ?? '');
    out.push(line);
  }
  return out;
}

/**
 * 按列数分页：把宽表纵向切成若干块，每块保留完整表头 + 数据行。
 * 块与块之间用空行分隔，方便直接粘回 Excel 的不同区域。
 */
export function chunkColumns(rows: string[][], chunkCols: number): string[][] {
  if (rows.length === 0) return [];
  const n = Math.max(1, Math.floor(chunkCols));
  const out: string[][] = [];
  let first = true;
  for (let start = 0; start < rows[0].length; start += n) {
    if (!first) out.push(['']); // 块间空行
    first = false;
    for (const row of rows) {
      out.push(row.slice(start, start + n));
    }
  }
  return out;
}

/** 展平：每个单元格独立成行（行优先），输出单列 */
export function flatten(rows: string[][]): string[][] {
  const out: string[][] = [];
  for (const row of rows) {
    for (const cell of row) out.push([cell]);
  }
  return out;
}

/** 合并：所有单元格用 mergeSep 连成一长串，输出一行一列 */
export function mergeAll(rows: string[][], mergeSep: string): string[][] {
  const cells = rows.flat();
  return [[cells.join(mergeSep)]];
}

/** 主入口：根据 op 分发 */
export function transformTable(text: string, options: TableShapeOptions): string {
  const delim = options.delimiter || detectDelimiter(text);
  const rows = parseTable(text, delim);
  if (rows.length === 0) return '';

  let result: string[][];
  switch (options.op) {
    case 'transpose':
      result = transpose(rows);
      break;
    case 'chunk':
      result = chunkColumns(rows, options.chunkCols);
      break;
    case 'flatten':
      result = flatten(rows);
      break;
    case 'merge':
      result = mergeAll(rows, options.mergeSep);
      break;
    default:
      result = rows;
  }
  return serializeTable(result, delim);
}
