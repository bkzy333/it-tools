/**
 * 分组汇总与透视
 *
 * 两件事：
 *  1) aggregate —— 按若干列分组，对若干列做求和/平均/最值/计数/去重计数/中位数
 *  2) unpivot   —— 反透视：把宽表（每天多个指标并排列）拆成长表（「指标/值」两列）
 *
 * 纯计算，不依赖表格组件；输出同样是二维数组，方便直接渲染或复制成文本。
 */

export type AggType = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'distinct' | 'median';

export interface AggMeta {
  key: AggType;
  /** 界面文案用的 key（texts 下的后缀，别在这运行时拼 i18n） */
  i18nKey: string;
}

export const AGG_METAS: readonly AggMeta[] = [
  { key: 'sum', i18nKey: 'sum' },
  { key: 'avg', i18nKey: 'avg' },
  { key: 'min', i18nKey: 'min' },
  { key: 'max', i18nKey: 'max' },
  { key: 'count', i18nKey: 'count' },
  { key: 'distinct', i18nKey: 'distinct' },
  { key: 'median', i18nKey: 'median' },
];

export interface AggSpec {
  /** 要聚合的列下标（0 基，含表头行） */
  col: number;
  agg: AggType;
}

export interface PivotResult {
  header: string[];
  rows: string[][];
  /** 参与计算的行数（不含表头） */
  dataRows: number;
}

/** 千分位与空白容错后转数字；非数字返回 null */
export function toNumber(v: unknown): number | null {
  if (v == null) return null;
  // 对象不是数字语义，直接判空返回 null（避免 "[object Object]" 参与 Number() 变成 NaN 后再判断）
  if (typeof v === 'object') return null;
  const t = String(v).trim().replace(/,/g, '').replace(/[¥￥$]/g, '');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** 累加时抹掉浮点尾巴：0.1+0.2 这类不要在互联网工具的金额上露出来 */
function clean(x: number): number {
  return Number.isInteger(x) ? x : Number(x.toPrecision(12));
}

/** 统一的小数显示：整数不带小数点，小数最多 4 位并去掉尾部零 */
export function formatNumber(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '';
  const r = Number(n.toFixed(4));
  return Number.isInteger(r) ? String(r) : String(r);
}

function medianOf(list: number[]): number | null {
  if (list.length === 0) return null;
  const a = list.slice().sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 === 1 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

/**
 * 分组汇总。
 * 分组列按「首次出现顺序」输出 —— 和 VLOOKUP 的透视表一致，而不是按字母排序。
 * 聚合结果里非数字单元格一律忽略（min/max/median/avg），count/distinct 数的是单元格。
 */
export function aggregate(
  rows: readonly (readonly string[])[],
  groupCols: readonly number[],
  specs: readonly AggSpec[],
  headerRow = false,
): PivotResult {
  const groupNames = rows[0] ?? [];
  const header = [
    ...groupCols.map((c) => String(groupNames[c] || `列${c + 1}`)),
    ...specs.map((s) => `${String(rows[0]?.[s.col] ?? `列${s.col + 1}`)}·${s.agg}`),
  ];

  const map = new Map<string, { key: string; cells: string[][] }>();
  const order: string[] = [];
  let dataRows = 0;

  for (let i = headerRow ? 1 : 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const key = groupCols.map((c) => String(row[c] ?? '').trim()).join('\u0001');
    if (!map.has(key)) {
      map.set(key, { key, cells: [] });
      order.push(key);
    }
    map.get(key)!.cells.push(row.map((v) => String(v ?? '')));
    dataRows++;
  }

  const out: string[][] = [];
  for (const key of order) {
    const cells = map.get(key)!.cells;
    const line: string[] = [];
    groupCols.forEach((col) => line.push(cells[0][col] ?? ''));
    for (const spec of specs) {
      const values = cells.map((cellsRow) => (cellsRow[spec.col] ?? '').trim());
      line.push(formatNumber(reduce(spec.agg, values)));
    }
    out.push(line);
  }

  return { header, rows: out, dataRows };
}

function reduce(agg: AggType, values: readonly string[]): number | null {
  const nums = values.map(toNumber).filter((n): n is number => n !== null);
  const nonEmpty = values.filter((v) => v !== '');
  switch (agg) {
    case 'sum':
      return nums.length ? clean(nums.reduce((s, n) => clean(s + n), 0)) : null;
    case 'avg':
      return nums.length ? clean(nums.reduce((s, n) => clean(s + n), 0) / nums.length) : null;
    case 'min':
      return nums.length ? Math.min(...nums) : null;
    case 'max':
      return nums.length ? Math.max(...nums) : null;
    case 'median':
      return medianOf(nums);
    case 'count':
      return nonEmpty.length;
    case 'distinct':
      return new Set(nonEmpty).size;
    default:
      return null;
  }
}

/**
 * 反透视（宽表 → 长表）。
 * 保留 idCols 这些「每行固定」的列，把 valueCols 拆成「指标 / 值」两列。
 */
export function unpivot(
  rows: readonly (readonly string[])[],
  idCols: readonly number[],
  valueCols: readonly number[],
  headerRow = false,
): PivotResult {
  const head = rows[0] ?? [];
  // ⚠️ 指标名取自原表头（rows[0]），不是 rows[1] —— 后者是第一行数据，
  // 取错会让「指标」列变成 1000/50 这种数值，长表完全没法用。
  const names = head;
  const header = [...idCols.map((c) => String(head[c] || `列${c + 1}`)), '指标', '值'];

  const out: string[][] = [];
  const dataRows = headerRow ? 1 : 0;
  for (let i = dataRows; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    for (const col of valueCols) {
      out.push([...idCols.map((c) => String(row[c] ?? '').trim()), String(names[col] ?? `列${col + 1}`), String(row[col] ?? '')]);
    }
  }
  return { header, rows: out, dataRows };
}

/** 把二维数组渲染成文本（默认 tab 分隔，方便粘回 Excel） */
export function toText(rows: readonly (readonly string[])[], delimiter = '\t'): string {
  return rows.map((r) => r.join(delimiter)).join('\n');
}
