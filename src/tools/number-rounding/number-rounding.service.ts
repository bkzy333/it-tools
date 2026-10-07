/**
 * 数值舍入 / 批量运算。
 *
 * 只做「数字进 → 数字出」，不碰任何 Excel 对象，所以网页端能完整复刻。
 * 三处必须靠它稳住的地方，改动前先看注释：
 *   1. 二进制浮点：2.675*100 实际是 267.49999999999994，直接 Math.round 会舍成 2.67
 *   2. 「四舍五入」在中文口径下 0.5 是远离零的，负数 -2.5 要舍成 -3（Math.round 会给 -2）
 *   3. 银行家舍入（四舍六入五成双）用于财务口径，不能拿 Math.round 顶替
 */

/** 舍入方式：i18n 文案后缀分别是 mode-<key> */
export type RoundingMode = 'half-up' | 'half-even' | 'ceil' | 'floor' | 'truncate';

/** 批量运算，'none' 表示只舍入不做运算 */
export type BatchOp = 'none' | 'add' | 'subtract' | 'multiply' | 'divide';

export const ROUNDING_MODES: { key: RoundingMode }[] = [
  { key: 'half-up' },
  { key: 'half-even' },
  { key: 'ceil' },
  { key: 'floor' },
  { key: 'truncate' },
];

export const BATCH_OPS: { key: BatchOp }[] = [
  { key: 'none' },
  { key: 'add' },
  { key: 'subtract' },
  { key: 'multiply' },
  { key: 'divide' },
];

export const MAX_DIGITS = 12;

/** 判断半值时的容差：只在「差一点点到 0.5」时才走半值逻辑 */
const HALF_EPS = 1e-9;

/**
 * 抹掉二进制表示误差。
 * 2.675 * 100 得到 267.49999999999994，toPrecision(15) 转回来正好 267.5，
 * 后面的取整才不会被尾巴带偏。
 */
function clean(x: number): number {
  if (!Number.isFinite(x) || x === 0) return x;
  return Number(x.toPrecision(15));
}

export function clampDigits(digits: number): number {
  if (!Number.isFinite(digits)) return 0;
  return Math.min(MAX_DIGITS, Math.max(0, Math.floor(digits)));
}

/** 四舍六入五成双：半值一律向最近的偶数靠 */
function halfEven(a: number): number {
  const f = Math.floor(a);
  const frac = a - f;
  if (Math.abs(frac - 0.5) < HALF_EPS) return f % 2 === 0 ? f : f + 1;
  return f + (frac > 0.5 ? 1 : 0);
}

/**
 * 把单个数值按位数和模式舍入。
 * 负数、0 值（避免出现 -0）、非有限数（NaN/Infinity）都收口在这里，上层不用再判。
 */
export function roundTo(value: number, digits: number, mode: RoundingMode = 'half-up'): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return NaN;
  const s = 10 ** clampDigits(digits);
  const x = clean(value * s);
  const neg = x < 0;
  const a = Math.abs(x);

  let n: number;
  switch (mode) {
    // ⚠ ceil / floor 必须直接作用在带符号的 x 上：
    // 取绝对值再取整等于把方向反了，ceil(-2.001) 会错成 -2.01（-2.001 该进位到 -2）
    case 'ceil':
      n = Math.ceil(x);
      break;
    case 'floor':
      n = Math.floor(x);
      break;
    case 'truncate':
      n = Math.trunc(x);
      break;
    case 'half-even':
      // 半值朝偶数靠：先算绝对值，再按原符号翻回去
      n = neg ? -halfEven(a) : halfEven(a);
      break;
    case 'half-up':
    default:
      // ⚠ Math.round 对 .5 朝正无穷取整，直接用在 -2.5 上会得到 -2，
      // 必须先取绝对值（0.5 远离零 = -2.5 → -3）再翻回符号
      n = neg ? -Math.round(a) : Math.round(x);
      break;
  }

  const r = n / s;
  return Object.is(r, -0) ? 0 : r;
}

/* ---------------------------------------------------------------- 解析输入 */

export interface NumberCell {
  /** 解析成功即是非 null */
  value: number | null;
  /** 原始片段，解析失败时用来回显给用户 */
  raw: string;
  invalid: boolean;
}

export interface ParsedNumbers {
  values: number[];
  cells: NumberCell[];
  invalidCount: number;
}

/**
 * 从输入文本解析数字。支持三种写法混用：
 *   - 每行一个：19.99
 *   - 同一行逗号/空格分隔：19.99, 3.145  19.99 3.145
 *   - 千分位单值：1,234 / 1,234,567.89（只在「逗号后全是 3 位数字」时当千分位，
 *     否则 1,234 会被拆成 1 和 234，这正是 Excel 输入的常见歧义）
 */
export function parseNumbers(text: string): ParsedNumbers {
  const values: number[] = [];
  const cells: NumberCell[] = [];

  const push = (token: string) => {
    const t = token.trim();
    if (!t) return;
    const n = Number(t);
    const ok = Number.isFinite(n);
    cells.push({ value: ok ? n : null, raw: t, invalid: !ok });
    if (ok) values.push(n);
  };

  if (!text || !text.trim()) return { values, cells, invalidCount: 0 };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(line)) {
      push(line.replace(/,/g, ''));
      continue;
    }
    // 普通数字（不允许带逗号，否则「1,23」会被当成格式错误的单个值吞掉）
    if (/^-?\d+(\.\d+)?$/.test(line)) {
      push(line);
      continue;
    }
    line.split(/[,，\s]+/).forEach(push);
  }

  return { values, cells, invalidCount: cells.filter((c) => c.invalid).length };
}

/* ---------------------------------------------------------------- 转换输出 */

export interface TransformOptions {
  digits: number;
  mode: RoundingMode;
  /** 批量运算，'none' 时忽略 operand */
  op: BatchOp;
  operand: number;
}

export interface TransformRow {
  input: number;
  output: number;
  /** 除数为 0 这类取值异常，界面据此提示 */
  note: '' | 'divide-by-zero';
}

/** 先批量运算再舍入（和 Excel「=ROUND(A1*1.1,2)」同一顺序） */
export function transformNumbers(values: number[], options: TransformOptions): TransformRow[] {
  const { digits, mode, op, operand } = options;
  const d = clampDigits(digits);
  const divideByZero = op === 'divide' && operand === 0;

  return values.map((input) => {
    let v = input;
    let note: TransformRow['note'] = '';

    if (op === 'add') v = input + operand;
    else if (op === 'subtract') v = input - operand;
    else if (op === 'multiply') v = input * operand;
    else if (op === 'divide') {
      if (operand === 0) {
        // 不能给出 Infinity 污染后面所有统计，原样保留并打标
        note = 'divide-by-zero';
      } else {
        v = input / operand;
      }
    }

    return { input, output: divideByZero && note ? input : roundTo(v, d, mode), note };
  });
}

export interface NumberSummary {
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
}

export function summarize(values: number[]): NumberSummary {
  if (values.length === 0) return { count: 0, sum: NaN, avg: NaN, min: NaN, max: NaN };
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { count: values.length, sum, avg: sum / values.length, min, max };
}

/**
 * 结果文本的显示格式。
 * 用 String(数字) 而不是 toFixed：舍入后 repr 就是最短准确表示（268/100 → "2.68"），
 * 再 toFixed 反而会补出一堆不需要的零。
 */
export function formatValue(value: number, digits: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const d = clampDigits(digits);
  if (d === 0) return String(roundTo(value, 0));
  return String(roundTo(value, d));
}
