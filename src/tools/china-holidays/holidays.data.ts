/**
 * 中国法定节假日放假安排数据。
 *
 * 数据来源一律是**国务院办公厅的正式通知**，不采用任何"预测版""推算版"。
 * 每年 11 月前后国务院会公布次年的安排，届时在 HOLIDAY_PLANS 里加一项即可，
 * 页面会自动出现年份切换器，不需要改组件。
 *
 * 各假期「法定节假日天数」的合计为 13 天（元旦 1、春节 4、清明 1、劳动节 2、端午 1、中秋 1、国庆 3），
 * 这是《全国年节及纪念日放假办法》2024 年修订后的口径；其余放假天数来自周末与调休。
 */

export interface HolidaySegment {
  /** 假期名，如「春节」 */
  name: string;
  /** 放假首日，YYYY-MM-DD */
  start: string;
  /** 放假末日，YYYY-MM-DD */
  end: string;
  /** 放假调休天数 */
  days: number;
  /** 该假期是否在高速免费范围内（春节、清明、劳动节、国庆 4 个） */
  freeToll: boolean;
}

export interface HolidayPlan {
  year: number;
  /** 发布机构与日期，页面上要显示，方便用户核对 */
  source: string;
  publishedAt: string;
  segments: HolidaySegment[];
  /** 调休上班日（周末要上班的那几天） */
  makeupWorkdays: string[];
}

export const HOLIDAY_PLANS: HolidayPlan[] = [
  {
    year: 2026,
    source: '国务院办公厅关于2026年部分节假日安排的通知',
    publishedAt: '2025-11-04',
    segments: [
      { name: '元旦', start: '2026-01-01', end: '2026-01-03', days: 3, freeToll: false },
      { name: '春节', start: '2026-02-15', end: '2026-02-23', days: 9, freeToll: true },
      { name: '清明节', start: '2026-04-04', end: '2026-04-06', days: 3, freeToll: true },
      { name: '劳动节', start: '2026-05-01', end: '2026-05-05', days: 5, freeToll: true },
      { name: '端午节', start: '2026-06-19', end: '2026-06-21', days: 3, freeToll: false },
      { name: '中秋节', start: '2026-09-25', end: '2026-09-27', days: 3, freeToll: false },
      { name: '国庆节', start: '2026-10-01', end: '2026-10-07', days: 7, freeToll: true },
    ],
    makeupWorkdays: [
      '2026-01-04',
      '2026-02-14',
      '2026-02-28',
      '2026-05-09',
      '2026-09-20',
      '2026-10-10',
    ],
  },
];

/** 高速免费的假期固定是这 4 个，写在文案里比逐个数据里翻更稳 */
export const FREE_TOLL_NAMES = ['春节', '清明节', '劳动节', '国庆节'];

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/**
 * 取日期字符串的星期。刻意用 UTC 构造，避免本地时区把日期挪到前一天 ——
 * 用 new Date('2026-01-01') 在 UTC+8 下是 08:00，看着没事，但换成 UTC-5 的机器就会变成前一天的 19:00。
 */
export function weekdayOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return WEEKDAY_LABELS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** 把 2026-01-01 显示成 1月1日 */
export function shortDate(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m}月${d}日`;
}

export function formatRange(segment: HolidaySegment): string {
  return `${shortDate(segment.start)} - ${shortDate(segment.end)}`;
}

/** 今天（按本地日历日，不含时间），用来判断假期是已过、进行中还是还没到 */
export function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export type HolidayStatus = 'passed' | 'ongoing' | 'upcoming';

export function statusOf(segment: HolidaySegment, today = todayIso()): HolidayStatus {
  if (today > segment.end) {
    return 'passed';
  }
  if (today >= segment.start) {
    return 'ongoing';
  }
  return 'upcoming';
}

/** 距假期首日还有几天；已开始或已结束返回 null */
export function daysUntil(start: string, today = todayIso()): number | null {
  if (today >= start) {
    return null;
  }
  const [y1, m1, d1] = today.split('-').map(Number);
  const [y2, m2, d2] = start.split('-').map(Number);
  const from = Date.UTC(y1, m1 - 1, d1);
  const to = Date.UTC(y2, m2 - 1, d2);
  return Math.round((to - from) / 86400000);
}

export function nextHoliday(plan: HolidayPlan, today = todayIso()): HolidaySegment | undefined {
  return plan.segments.find((s) => statusOf(s, today) !== 'passed');
}
