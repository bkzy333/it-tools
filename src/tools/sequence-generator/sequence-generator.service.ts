// 序列生成器 的纯逻辑层。放在这里而不是 .vue 里，是为了能跑 vitest 单测。
//
// 覆盖 ffcell 的「录入123/ABC/罗马/中文数字/星期/月份/甲乙丙丁/子丑寅卯/自定义序列」。
// 因此 A3「数字格式互转」里的 阿拉伯↔中文数字、阿拉伯↔罗马 也一并由本工具的
// 中文数字 / 罗马数字 序列模式承接（给定起止范围即可完成「单个数字互转」的需求）。
//
// 所有函数都是纯函数，输入确定 → 输出确定，便于单测锁行为。

export type SequenceMode =
  | 'number'
  | 'letter'
  | 'roman'
  | 'chinese'
  | 'weekday'
  | 'month'
  | 'ganzhi'
  | 'zodiac'
  | 'custom';

export interface SequenceOptions {
  mode: SequenceMode;
  /** 起始序号（number/letter/roman/chinese 从这个数开始计数；cyclic 模式用它选起点偏移） */
  start: number;
  /** 生成多少项 */
  count: number;
  /** 数字/字母/罗马/中文模式的步长（默认 1） */
  step: number;
  /** 数字模式的前导零位数，0 表示不补零 */
  padWidth: number;
  prefix: string;
  suffix: string;
  /** 各项之间的连接串：'\n' | ',' | ' ' | '' */
  separator: string;
  /** letter / roman 是否小写 */
  lowercase: boolean;
  /** chinese 是否用大写（壹贰叁） */
  chineseUppercase: boolean;
  /** custom 模式：每行/逗号分隔一项，循环填充 */
  customItems: string;
}

/** 防止误填超大数量把内存撑爆 */
export const MAX_SEQ_COUNT = 20000;

export const SEQUENCE_MODES: { key: SequenceMode }[] = [
  { key: 'number' },
  { key: 'letter' },
  { key: 'roman' },
  { key: 'chinese' },
  { key: 'weekday' },
  { key: 'month' },
  { key: 'ganzhi' },
  { key: 'zodiac' },
  { key: 'custom' },
];

/* ---------------------------------------------------------- 中文数字 */

const CN_LOW = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const CN_UP = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
// 小写单位（十百千）与大写单位（拾佰仟）不同，必须分开
const CN_SMALL_LOW = ['', '十', '百', '千'];
const CN_SMALL_UP = ['', '拾', '佰', '仟'];
const CN_BIG = ['', '万', '亿', '兆'];

/** 把一个 0~9999 的段转成中文（内部函数，已处理段内零） */
function section4(n: number, d: string[], small: string[]): string {
  if (n === 0) return '';
  let res = '';
  let zero = false;
  const arr = [Math.floor(n / 1000), Math.floor(n / 100) % 10, Math.floor(n / 10) % 10, n % 10];
  for (let i = 0; i < 4; i++) {
    const digit = arr[i];
    if (digit === 0) {
      zero = true;
    } else {
      if (zero && res !== '') res += d[0];
      res += d[digit] + small[3 - i];
      zero = false;
    }
  }
  return res;
}

/**
 * 阿拉伯整数 → 中文数字（小写 一二三 或 大写 壹贰叁）。
 * 支持 0 ~ 10^16；负数 / 非整数 / 超限返回空串。
 * 10~19 顶位去「一」：10=十、13=十三（与中文书写习惯一致）。
 */
export function toChinese(num: number, uppercase = false): string {
  const d = uppercase ? CN_UP : CN_LOW;
  if (!Number.isInteger(num) || num < 0) return '';
  if (num === 0) return d[0];
  if (num >= 1e16) return '';

  const groups: number[] = [];
  let x = num;
  while (x > 0) {
    groups.push(x % 10000);
    x = Math.floor(x / 10000);
  }

  const small = uppercase ? CN_SMALL_UP : CN_SMALL_LOW;

  let out = '';
  let pendingZero = false;
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g === 0) {
      pendingZero = out !== '';
      continue;
    }
    const sec = section4(g, d, small);
    if (pendingZero && sec !== '') out += d[0];
    out += sec + CN_BIG[i];
    // 本段高位为空（<1000）→ 下一个非空段前需要补零
    pendingZero = g < 1000;
  }

  // 顶位「一十」→「十」只在 <20 且小写时发生（大写是「壹拾」，保留）
  if (!uppercase && num < 20 && out.startsWith('一十')) out = out.slice(1);
  return out;
}

/* ---------------------------------------------------------- 罗马数字 */

const ROMAN_TABLE: [string, number][] = [
  ['M', 1000], ['CM', 900], ['D', 500], ['CD', 400], ['C', 100],
  ['XC', 90], ['L', 50], ['XL', 40], ['X', 10], ['IX', 9], ['V', 5], ['IV', 4], ['I', 1],
];

/** 阿拉伯整数 → 罗马数字（1~3999）。超限或非法返回空串。 */
export function toRoman(num: number): string {
  if (!Number.isInteger(num) || num < 1 || num > 3999) return '';
  let s = '';
  let n = num;
  for (const [sym, val] of ROMAN_TABLE) {
    while (n >= val) {
      s += sym;
      n -= val;
    }
  }
  return s;
}

/* ---------------------------------------------------------- 字母序列（A, B, ..., Z, AA） */

/** 1→A, 26→Z, 27→AA。仿 Excel 列名规则。非法返回空串。 */
export function toLetters(num: number): string {
  if (!Number.isInteger(num) || num < 1) return '';
  let s = '';
  let n = num;
  while (n > 0) {
    n -= 1;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

/* ---------------------------------------------------------- 循环型序列 */

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
const GANZHI = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const ZODIAC = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

/* ---------------------------------------------------------- 主入口 */

function cycleAt(list: string[], offset: number, i: number): string {
  if (list.length === 0) return '';
  return list[(offset + i) % list.length];
}

/**
 * 生成序列。返回已加前后缀、已用 separator 拼接好的字符串。
 * count 被硬性夹在 [0, MAX_SEQ_COUNT]，超量静默截断。
 */
export function generateSequence(options: SequenceOptions): string {
  const count = Math.max(0, Math.min(MAX_SEQ_COUNT, Math.floor(options.count || 0)));
  const start = Number.isFinite(options.start) ? Math.floor(options.start) : 1;
  const step = Number.isFinite(options.step) && options.step !== 0 ? Math.floor(options.step) : 1;
  const padWidth = Math.max(0, Math.min(20, Math.floor(options.padWidth || 0)));

  const items: string[] = [];

  switch (options.mode) {
    case 'number':
      for (let i = 0; i < count; i++) {
        const v = start + i * step;
        const s = String(v);
        items.push(padWidth > 0 ? s.padStart(padWidth, '0') : s);
      }
      break;
    case 'letter':
      for (let i = 0; i < count; i++) {
        const raw = toLetters(start + i * step);
        items.push(options.lowercase ? raw.toLowerCase() : raw);
      }
      break;
    case 'roman':
      for (let i = 0; i < count; i++) {
        const raw = toRoman(start + i * step);
        items.push(options.lowercase ? raw.toLowerCase() : raw);
      }
      break;
    case 'chinese':
      for (let i = 0; i < count; i++) {
        items.push(toChinese(start + i * step, options.chineseUppercase));
      }
      break;
    case 'weekday':
      for (let i = 0; i < count; i++) items.push(cycleAt(WEEKDAYS, start - 1, i));
      break;
    case 'month':
      for (let i = 0; i < count; i++) items.push(cycleAt(MONTHS, start - 1, i));
      break;
    case 'ganzhi':
      for (let i = 0; i < count; i++) items.push(cycleAt(GANZHI, start - 1, i));
      break;
    case 'zodiac':
      for (let i = 0; i < count; i++) items.push(cycleAt(ZODIAC, start - 1, i));
      break;
    case 'custom': {
      const list = options.customItems
        .split(/[\n,，]/)
        .map((s) => s.trim())
        .filter((s) => s !== '');
      // 列表为空时没有可循环的项，直接返回空而非一堆空行
      if (list.length === 0) return '';
      for (let i = 0; i < count; i++) items.push(cycleAt(list, Math.max(0, start - 1), i));
      break;
    }
  }

  const sep = options.separator === undefined ? '\n' : options.separator;
  return items.map((it) => `${options.prefix}${it}${options.suffix}`).join(sep);
}

/** 把 separator 的可选项（用于 UI）抽出来，避免 .vue 里再写一份文案 */
export const SEPARATOR_OPTIONS: { value: string; key: string }[] = [
  { value: '\n', key: 'newline' },
  { value: ',', key: 'comma' },
  { value: ' ', key: 'space' },
  { value: '', key: 'none' },
];
