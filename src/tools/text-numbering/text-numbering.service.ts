// 文本加序号 的纯逻辑层。
//
// 行为依据：参考站 iamwawa.cn/xuhao.html 的「文本增加序号工具」。
// 逐行处理：按换行切分输入，每行前面加一个按序递增的序号。
// 参考站支持的序号格式有 n. n n, n、 (n) [n] n# n-，本站对齐这些格式。

export type NumberingFormat = 'dot' | 'none' | 'comma' | 'comma-cn' | 'paren' | 'bracket' | 'hash' | 'dash';

export interface NumberingOptions {
  input: string;
  /** 序号格式 */
  format: NumberingFormat;
  /** 起始数字 */
  start: number;
  /** 数字间隔（步长） */
  step: number;
  /** 前置补零位数，0 表示不补零 */
  padWidth: number;
  /** 序号与正文之间的分隔（紧贴 or 空格） */
  spaceAfter: boolean;
}

/** 格式 key → 参考站「n.」这类模板里的中间分隔。 */
const FORMAT_AFFIX: Record<NumberingFormat, { left: string; right: string }> = {
  dot: { left: '', right: '.' },
  none: { left: '', right: '' },
  comma: { left: '', right: ',' },
  'comma-cn': { left: '', right: '、' },
  paren: { left: '(', right: ')' },
  bracket: { left: '[', right: ']' },
  hash: { left: '', right: '#' },
  dash: { left: '', right: '-' },
};

export const NUMBERING_FORMATS: { key: NumberingFormat; sample: string }[] = [
  { key: 'dot', sample: '1.' },
  { key: 'none', sample: '1' },
  { key: 'comma', sample: '1,' },
  { key: 'comma-cn', sample: '1、' },
  { key: 'paren', sample: '(1)' },
  { key: 'bracket', sample: '[1]' },
  { key: 'hash', sample: '1#' },
  { key: 'dash', sample: '1-' },
];

/** 防止误填超大数量把内存撑爆 */
const MAX_LINES = 20000;

export function numberLines(options: NumberingOptions): string {
  const lines = options.input.split(/\r\n|\r|\n/);
  const count = Math.max(0, Math.min(MAX_LINES, lines.length));
  const start = Number.isFinite(options.start) ? Math.floor(options.start) : 1;
  const step = Number.isFinite(options.step) && options.step !== 0 ? Math.floor(options.step) : 1;
  const padWidth = Math.max(0, Math.min(20, Math.floor(options.padWidth || 0)));
  const affix = FORMAT_AFFIX[options.format] ?? FORMAT_AFFIX.dot;
  const sep = options.spaceAfter ? ' ' : '';

  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const v = start + i * step;
    const digits = padWidth > 0 ? String(v).padStart(padWidth, '0') : String(v);
    const number = `${affix.left}${digits}${affix.right}`;
    out.push(`${number}${sep}${lines[i]}`);
  }
  return out.join('\n');
}
