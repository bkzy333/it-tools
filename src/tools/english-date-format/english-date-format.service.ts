/**
 * 英文日期格式转换。
 *
 * 参考 iamwawa.cn/dateformat.html：美式（Month Day, Year）与英式（Day Month Year）
 * 8 种格式互转，支持序数词后缀（1st/2nd/3rd/4th…）。
 *
 * 支持的格式（与参考站一致）：
 * 美式：MMMM D, YYYY / MMMM Do, YYYY / MMM. D, YYYY / MMM. Do, YYYY
 * 英式：D, MMMM, YYYY / Do, MMMM, YYYY / D, MMM., YYYY / Do, MMM., YYYY
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTH_ABBR = [
  'Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.',
  'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.',
];

/** 序数词后缀：1→st, 2→nd, 3→rd, 其余→th（11/12/13 特殊） */
export function ordinalSuffix(day: number): string {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return 'th';
  }
  switch (day % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

export interface EnglishDate {
  year: number;
  month: number; // 1-12
  day: number;
}

export type DateFormat =
  | 'MMMM_D_YYYY'
  | 'MMMM_Do_YYYY'
  | 'MMM_D_YYYY'
  | 'MMM_Do_YYYY'
  | 'D_MMMM_YYYY'
  | 'Do_MMMM_YYYY'
  | 'D_MMM_YYYY'
  | 'Do_MMM_YYYY';

export function formatEnglishDate(date: EnglishDate, format: DateFormat): string {
  const monthFull = MONTHS[date.month - 1];
  const monthAbbr = MONTH_ABBR[date.month - 1];
  const d = date.day;
  const doStr = `${d}${ordinalSuffix(d)}`;
  const y = date.year;

  switch (format) {
    case 'MMMM_D_YYYY':
      return `${monthFull} ${d}, ${y}`;
    case 'MMMM_Do_YYYY':
      return `${monthFull} ${doStr}, ${y}`;
    case 'MMM_D_YYYY':
      return `${monthAbbr} ${d}, ${y}`;
    case 'MMM_Do_YYYY':
      return `${monthAbbr} ${doStr}, ${y}`;
    case 'D_MMMM_YYYY':
      return `${d}, ${monthFull}, ${y}`;
    case 'Do_MMMM_YYYY':
      return `${doStr}, ${monthFull}, ${y}`;
    case 'D_MMM_YYYY':
      return `${d}, ${monthAbbr}, ${y}`;
    case 'Do_MMM_YYYY':
      return `${doStr}, ${monthAbbr}, ${y}`;
  }
}

/** 从一个标准日期（Date 或 YYYY-MM-DD）生成全部 8 种格式 */
export function allEnglishDateFormats(input: string | Date): Record<DateFormat, string> {
  let date: Date;
  if (input instanceof Date) {
    date = input;
  } else {
    const m = input.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (!m) {
      throw new Error('Invalid date');
    }
    date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  const d: EnglishDate = { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
  const keys: DateFormat[] = [
    'MMMM_D_YYYY', 'MMMM_Do_YYYY', 'MMM_D_YYYY', 'MMM_Do_YYYY',
    'D_MMMM_YYYY', 'Do_MMMM_YYYY', 'D_MMM_YYYY', 'Do_MMM_YYYY',
  ];
  return Object.fromEntries(keys.map((k) => [k, formatEnglishDate(d, k)])) as Record<DateFormat, string>;
}
