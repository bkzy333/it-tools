/**
 * 支票/票据日期大写转换。
 *
 * 参考 iamwawa.cn/riqidaxie.html 的规则（会计日期大写规范），纯自研实现。
 *
 * 规则（与参考站对齐，注释+单测双锁）：
 * - 年：每位数字直接换成大写汉字（2026 → 贰零贰陆）。
 * - 月：1、2、10 月前必须加「零」；3~9 月前可加可不加（本实现加零）；
 *   10 月写「零壹拾」、11 月「壹拾壹」、12 月「壹拾贰」。
 * - 日：1~9、10、20、30 前加「零」；11~19 写「壹拾壹」~「壹拾玖」；
 *   21~29 写「贰拾壹」~「贰拾玖」；31 写「叁拾壹」。
 */

const DIGITS = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];

function yearToUppercase(year: number): string {
  return String(year)
    .split('')
    .map((d) => DIGITS[Number(d)])
    .join('');
}

function monthToUppercase(month: number): string {
  if (month === 10) {
    return '零壹拾';
  }
  if (month === 11) {
    return '壹拾壹';
  }
  if (month === 12) {
    return '壹拾贰';
  }
  // 1~9 月，前加零
  return `零${DIGITS[month]}`;
}

function dayToUppercase(day: number): string {
  if (day === 10) {
    return '零壹拾';
  }
  if (day === 20) {
    return '零贰拾';
  }
  if (day === 30) {
    return '零叁拾';
  }
  if (day < 10) {
    return `零${DIGITS[day]}`;
  }
  if (day < 20) {
    return `壹拾${day === 10 ? '' : DIGITS[day - 10]}`;
  }
  if (day < 30) {
    return `贰拾${DIGITS[day - 20]}`;
  }
  return `叁拾${day === 31 ? '壹' : ''}`;
}

export interface DateUppercaseResult {
  /** 完整结果，如「贰零贰陆年零壹拾月零玖日」 */
  full: string;
  year: string;
  month: string;
  day: string;
}

export function dateToUppercase(year: number, month: number, day: number): DateUppercaseResult {
  const y = yearToUppercase(year);
  const m = monthToUppercase(month);
  const d = dayToUppercase(day);
  return {
    full: `${y}年${m}月${d}日`,
    year: `${y}年`,
    month: `${m}月`,
    day: `${d}日`,
  };
}

/** 从 Date 对象或字符串解析年/月/日并转大写 */
export function dateStringToUppercase(input: string): DateUppercaseResult {
  const match = input.trim().match(/^(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})/);
  if (!match) {
    throw new Error('Invalid date');
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error('Invalid date');
  }
  return dateToUppercase(year, month, day);
}
