/**
 * 批量数字处理：对齐 lddgo「在线数字处理」的 8 项操作。
 *
 * 覆盖：千分位加减、科学计数法互转、罗马数字 ASCII/Unicode 互转。
 * （原「转为英文大写 / 英文金额 / 中文金额」三个 op 于 2026-10 移除——
 *  能力已并入金额大写转换器 /rmb-numbers，避免同站同能力多入口互相蚕食。）
 *
 * 边界约定（注释 + 单测双锁）：
 * - 输入按换行批量处理，每行一个值；空行原样保留（行数对齐）。
 * - 罗马数字范围 [1, 3999] / [I, MMMCMXCIX]；Unicode 变体仅是字形替换，可逆。
 */

export type NumberOp =
  | 'addThousands'
  | 'removeThousands'
  | 'toScientific'
  | 'fromScientific'
  | 'toRoman'
  | 'fromRoman'
  | 'toRomanUnicode'
  | 'fromRomanUnicode';

export interface NumberProcessOptions {
  op: NumberOp;
  /** 保留小数位（千分位 / 科学计数法 相关操作可选） */
  precision?: number | null;
  /** 千分位字符，默认 ',' */
  thousandsSep?: string;
}

export interface LineResult {
  ok: boolean;
  value: string;
}

export interface NumberProcessResult {
  lines: LineResult[];
  warnings: string[];
}

// ---- 千分位 ----

function formatThousands(n: number, sep: string, precision: number | null | undefined): string {
  const fixed = precision != null ? n.toFixed(Math.max(0, Math.trunc(precision))) : null;
  const str = fixed ?? String(n);
  const neg = str.startsWith('-');
  const abs = neg ? str.slice(1) : str;
  const [intPart, fracPart = ''] = abs.split('.');
  const intSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  return (neg ? '-' : '') + intSep + (fracPart ? `.${fracPart}` : '');
}

function addThousandsOp(str: string, sep: string, precision: number | null | undefined): string {
  const n = Number(str);
  if (Number.isNaN(n)) {
    throw new Error(`不是有效数字：${str}`);
  }
  return formatThousands(n, sep, precision);
}

function removeThousandsOp(str: string, sep: string, precision: number | null | undefined): string {
  const cleaned = str.split(sep).join('');
  const n = Number(cleaned);
  if (Number.isNaN(n)) {
    throw new Error(`无法解析：${str}`);
  }
  if (precision != null) {
    return n.toFixed(Math.max(0, Math.trunc(precision)));
  }
  const fracLen = cleaned.includes('.') ? cleaned.split('.')[1].length : 0;
  return n.toFixed(fracLen);
}

// ---- 科学计数法 ----

function toScientificOp(str: string, precision: number | null | undefined): string {
  const n = Number(str);
  if (Number.isNaN(n)) {
    throw new Error(`不是有效数字：${str}`);
  }
  return precision != null ? n.toExponential(Math.max(0, Math.trunc(precision))) : n.toExponential();
}

function fromScientificOp(str: string, precision: number | null | undefined): string {
  const n = Number(str);
  if (Number.isNaN(n)) {
    throw new Error(`不是有效数字：${str}`);
  }
  if (precision != null) {
    return n.toFixed(Math.max(0, Math.trunc(precision)));
  }
  return String(n);
}

// ---- 罗马数字 ----

const ROMAN_TABLE: [number, string][] = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
  [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
  [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

function toRoman(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 3999) {
    throw new Error('罗马数字支持范围 [1, 3999]');
  }
  let s = '';
  for (const [value, symbol] of ROMAN_TABLE) {
    while (n >= value) {
      s += symbol;
      n -= value;
    }
  }
  return s;
}

const ASCII_TO_UNI: Record<string, string> = { I: 'Ⅰ', V: 'Ⅴ', X: 'Ⅹ', L: 'Ⅼ', C: 'Ⅽ', D: 'Ⅾ', M: 'Ⅿ' };
const UNI_TO_ASCII: Record<string, string> = { 'Ⅰ': 'I', 'Ⅴ': 'V', 'Ⅹ': 'X', 'Ⅼ': 'L', 'Ⅽ': 'C', 'Ⅾ': 'D', 'Ⅿ': 'M' };

function toRomanUnicode(n: number): string {
  return toRoman(n).replace(/[IVXLCDM]/g, (m) => ASCII_TO_UNI[m]);
}

const ROMAN_VALUE: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };

function fromRoman(ascii: string): string {
  const s = ascii.trim().toUpperCase();
  if (!s) {
    throw new Error('罗马数字不能为空');
  }
  let total = 0;
  let prev = 0;
  for (let i = s.length - 1; i >= 0; i -= 1) {
    const v = ROMAN_VALUE[s[i]];
    if (v === undefined) {
      throw new Error(`非法罗马数字字符：${s[i]}`);
    }
    if (v < prev) {
      total -= v;
    } else {
      total += v;
      prev = v;
    }
  }
  if (total < 1 || total > 3999) {
    throw new Error('罗马数字支持范围 [1, 3999]');
  }
  return String(total);
}

function fromRomanUnicode(unicode: string): string {
  const ascii = unicode.replace(/[ⅠⅤⅩⅬⅭⅮⅯ]/g, (m) => UNI_TO_ASCII[m]);
  return fromRoman(ascii);
}

// ---- 主入口 ----

export function processNumbers(input: string, options: NumberProcessOptions): NumberProcessResult {
  const { op, precision = null, thousandsSep = ',' } = options;
  const warnings: string[] = [];
  const lines = input.split(/\r?\n/);

  const results: LineResult[] = [];
  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (line === '') {
      results.push({ ok: true, value: '' });
      return;
    }
    try {
      let value = '';
      switch (op) {
        case 'addThousands':
          value = addThousandsOp(line, thousandsSep, precision);
          break;
        case 'removeThousands':
          value = removeThousandsOp(line, thousandsSep, precision);
          break;
        case 'toScientific':
          value = toScientificOp(line, precision);
          break;
        case 'fromScientific':
          value = fromScientificOp(line, precision);
          break;
        case 'toRoman':
          value = toRoman(Number(line));
          break;
        case 'fromRoman':
          value = fromRoman(line);
          break;
        case 'toRomanUnicode':
          value = toRomanUnicode(Number(line));
          break;
        case 'fromRomanUnicode':
          value = fromRomanUnicode(line);
          break;
      }
      results.push({ ok: true, value });
    } catch (e) {
      results.push({ ok: false, value: line });
      warnings.push(`第 ${idx + 1} 行：${(e as Error).message}`);
    }
  });

  return { lines: results, warnings };
}
