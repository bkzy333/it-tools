/**
 * 表格查询匹配：VLOOKUP 的网页版
 *
 * 输入是两块纯文本表格（粘贴 Excel 区域即可），找出「查询区」里
 * 每个关键字在「数据表」中命中的行，返回指定列。
 * 支持精确 / 包含 / 前缀三种匹配、多条件 AND、一对多、两表合并。
 */

export type MatchMode = 'exact' | 'contains' | 'startsWith';

export interface LookupParams {
  /** 数据表（二维数组） */
  source: readonly (readonly string[])[];
  /**
   * 待查关键字。每个元素是一组「值」，元素之间是与关系（多条件 AND）。
   * 单个关键字写成 ['1001']，两条件写成 ['销售', '上海']。
   */
  keys: readonly (readonly string[])[];
  /** 关键字对应源表里的列下标，与 keys 里的每组值一一对应 */
  keyCols: readonly number[];
  /** 要返回哪些列（0 基） */
  resultCols: readonly number[];
  mode?: MatchMode;
  /** 源表第一行是表头，扫表时跳过它 */
  headerRow?: boolean;
  /** 结果里按「源行下标」去重（一对多时只想留一条） */
  dedupe?: boolean;
}

export interface LookupRow {
  /** 按 resultCols 顺序取出的值 */
  values: string[];
  /** 命中的数据表行下标（0 基，含表头） */
  sourceIndex: number;
}

export interface LookupResult {
  rows: LookupRow[];
  /** 有多少个关键字没命中 */
  notFound: number;
}

/** 单元格比较：先 trim，忽略首尾空白 */
export function normalizeCell(v: unknown): string {
  return v == null ? '' : String(v).trim();
}

/** 匹配判定。cond 是查询条件值，cell 是数据表现有内容 */
export function matches(cell: string, cond: string, mode: MatchMode): boolean {
  const c = normalizeCell(cell);
  const q = normalizeCell(cond);
  if (q === '') return true; // 空条件不参与约束
  switch (mode) {
    case 'contains':
      return c.includes(q);
    case 'startsWith':
      return c.startsWith(q);
    case 'exact':
    default:
      return c === q;
  }
}

function rowMatches(row: readonly string[], keyCols: readonly number[], key: readonly string[], mode: MatchMode): boolean {
  if (keyCols.length !== key.length) return false;
  return keyCols.every((col, i) => matches(row[col] ?? '', key[i], mode));
}

/**
 * 主查询：keys 里的每个关键字（一组值，彼此是 AND）在源表里找出**所有**命中行。
 * 一个关键字命中多行就是「一对多」，命中的行会按源表顺序全部返回。
 * keys 为空时返回空结果。
 */
export function lookup(params: LookupParams): LookupResult {
  const { source, resultCols, keys, keyCols, mode = 'exact', headerRow = false, dedupe = false } = params;
  const rows: LookupRow[] = [];
  const seen = new Set<number>();
  let notFound = 0;

  for (const key of keys) {
    let hit = false;
    for (let i = headerRow ? 1 : 0; i < source.length; i++) {
      const row = source[i];
      if (!row || !rowMatches(row, keyCols, key, mode)) continue;
      hit = true;
      if (dedupe && seen.has(i)) continue;
      seen.add(i);
      rows.push({ values: resultCols.map((c) => normalizeCell(row?.[c] ?? '')), sourceIndex: i });
    }
    if (!hit) notFound++;
  }
  return { rows, notFound };
}

/** 取某一列的全部值（去重后的顺序不变） */
export function columnValues(source: readonly (readonly string[])[], col: number, headerRow = false): string[] {
  const out: string[] = [];
  for (let i = headerRow ? 1 : 0; i < source.length; i++) {
    const v = normalizeCell(source[i]?.[col] ?? '');
    if (v !== '' && !out.includes(v)) out.push(v);
  }
  return out;
}

export interface MergeParams {
  left: readonly (readonly string[])[];
  /** 左表用于连接的列 */
  leftKey: number;
  right: readonly (readonly string[])[];
  rightKey: number;
  /** 右表要拼过来的列（左表没有的那些） */
  rightCols: readonly number[];
  headerRow?: boolean;
  /** 右表列头，用来生成结果表头（左表 key 列用右表的头） */
  rightHeader?: readonly string[];
}

export interface MergeResult {
  header: string[];
  rows: string[][];
  /** 左表有多少行在右表没找到 */
  unmatched: number;
}

/**
 * 两表合并：按 key 把右表的指定列拼到左表后面。
 * 左表的 key 列会被右表的列头替换（VLOOKUP 的常见习惯：key 只留一份）。
 */
export function mergeTables(params: MergeParams): MergeResult {
  const { left, leftKey, right, rightKey, rightCols, headerRow = false, rightHeader } = params;

  const head = headerRow ? (left[0] ?? []) : [];
  // ⚠️ 合并后的 key 列保留左表自己的列头；右表的列名只在左表这一列没名字时才兜底。
  // 反过来的话，拼一次表 key 列名就被右表顶掉了，看结果表会莫名其妙。
  const keyName =
    normalizeCell(head[leftKey]) || normalizeCell(rightHeader?.[rightKey]) || `列${leftKey + 1}`;
  const rightNames = rightHeader && headerRow ? right[0] : [];
  const header = [...head.map((v, i) => (i === leftKey ? keyName : normalizeCell(v))), ...rightCols.map((c) => normalizeCell(rightNames?.[c] ?? `列${c + 1}`))];

  // 右表建索引：key -> 行
  const index = new Map<string, readonly string[]>();
  for (let i = headerRow ? 1 : 0; i < right.length; i++) {
    const row = right[i];
    if (!row) continue;
    const k = normalizeCell(row[rightKey]);
    if (k === '') continue;
    if (!index.has(k)) index.set(k, row);
  }

  const rows: string[][] = [];
  let unmatched = 0;
  for (let i = headerRow ? 1 : 0; i < left.length; i++) {
    const row = left[i];
    if (!row) continue;
    const k = normalizeCell(row[leftKey]);
    const hit = index.get(k);
    if (!hit) unmatched++;
    rows.push([...row.map((v) => normalizeCell(v)), ...rightCols.map((c) => normalizeCell(hit?.[c] ?? ''))]);
  }

  // 表头行也要拼上右表列头
  if (headerRow) rows.unshift(header);
  return { header: header, rows, unmatched };
}
