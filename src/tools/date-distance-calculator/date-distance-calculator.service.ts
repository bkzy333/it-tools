/**
 * 日期距离 / 日期推算 / 倒计时 —— 三个 Tab 的纯函数实现。
 *
 * 口径全部对齐原站（gjupai.com/tools/date_distance_calculator，已逐项浏览器对拍）：
 *
 *  1. 相差天数 = 结束日期 − 开始日期 的自然日，**不含起始当天**（2026-01-01 → 2026-12-31 = 364）。
 *     勾「包含结束日期」显示值 +1，但工作日统计区间不变。
 *  2. 按周 / 月 / 年换算走**日历推演**，不是除以 7、除以 30：
 *     364 天 →「约 11 个月零 30 天」（从起始日推 11 个月到 12-01，再补 30 天到 12-31），
 *     而不是 364/30.44。带「约」是因为它按公历月长度算，不是平均月。
 *  3. 工作日默认只按周一~周五统计，不剔除法定节假日；勾「排除法定节假日」后，
 *     法定节假日计休息日、调休上班日计工作日（数据来自国务院通知，见 china-holidays）。
 *  4. 信息框里的农历 / 干支 / 生肖 / 星座 / ISO 周 / 闰平年都来自 lunar.service.ts。
 *
 * 法定节假日直接复用 china-holidays 的 HOLIDAY_PLANS（国务院口径，别另造一份），
 * 代价是两个工具目录有依赖：删 china-holidays 之前先跑 scripts/check-refs.mjs。
 */
import { HOLIDAY_PLANS, type HolidaySegment } from '../china-holidays/holidays.data';
import {
  formatDateMs,
  getConstellation,
  getLunar,
  isLeapYear,
  isoWeek,
  lunarYearStart,
  parseDateMs,
  prettyDate,
  weekday,
  weekdayCn,
} from './lunar.service';

const MS_PER_DAY = 86400000;

export type OffsetUnit = 'day' | 'week' | 'month' | 'year';
export type OffsetDirection = 'forward' | 'backward';
/** natural = 自然日推移；workday = 只按工作日推移 */
export type CalcMode = 'natural' | 'workday';

export interface DiffOptions {
  /** 显示值 +1，把结束当天也算进去 */
  includeEndDay?: boolean;
  /** 法定节假日算休息日、调休算工作日 */
  excludeHolidays?: boolean;
}

export interface DiffResult {
  /** 自然日差（结束 − 开始），受 includeEndDay 影响 */
  days: number;
  weeks: { count: number; restDays: number };
  months: { count: number; restDays: number };
  years: { count: number; months: number; restDays: number };
  hours: number;
  minutes: number;
  seconds: number;
  workdays: number;
  weekends: number;
  /** 排除口径下的法定节假日天数（不排除时恒为 0） */
  holidays: number;
  /** 区间内的法定节假日是否都有数据；false 表示这部分只按周末算，UI 要标一句 */
  holidaysCovered: boolean;
  /** 实际参与「工作日 / 休息日」统计的左闭右开区间 */
  statFrom: string;
  statTo: string;
}

export interface DateInfo {
  date: string;
  /** 如「星期四」 */
  weekdayCn: string;
  /** 如「冬月十三」，1900-01-31 之前为 null */
  /** 如「冬月十三」；1900-01-31 之前为 null */
  lunar: string | null;
  /** 只在这一天是闰月时才有值，如「闰二月」 */
  lunarLeap: string | null;
  zodiac: string | null;
  constellation: string;
  leapCn: string;
  isoWeekCn: string;
  /** 如「乙巳年 戊子月 乙亥日」；1900-01-31 之前为 null */
  ganzhi: string | null;
}

export interface CalcOptions {
  value: number;
  unit: OffsetUnit;
  direction: OffsetDirection;
  mode: CalcMode;
  excludeHolidays?: boolean;
}

export interface CalcResult {
  date: string;
  /** 原站结果面板那行「与基准实际相差」：自然模式下是自然日数 */
  naturalDiff: number;
  /** mode = workday 时是跨过的工作日数；自然模式下为 0 */
  crossedWorkdays: number;
  info: DateInfo;
}

export interface CountdownResult {
  target: string;
  days: number;
  weeks: { count: number; restDays: number };
  hours: number;
  minutes: number;
  seconds: number;
  past: boolean;
  /** 目标日期就是今天，原站这时不摆倒计时，改显示「就是今天 🎉」 */
  isToday: boolean;
  info: DateInfo;
}

/* ---------------------------------------------------------------- 基础工具 */

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 在 yyyy-mm-dd 上加 n 天（UTC 零点，跨时区不掉日） */
export function addDays(date: string, n: number): string {
  return formatDateMs(parseDateMs(date) + n * MS_PER_DAY);
}

/** 在 yyyy-mm-dd 上加 n 个月；1 月 31 日 +1 月 → 2 月 28/29 日，不会漂到下个月 */
export function addMonths(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12 + 1;
  return formatDateMs(Date.UTC(ny, nm - 1, Math.min(d, daysInMonth(ny, nm))));
}

/** 加 n 年（闰日自动收敛到 2 月 28 日） */
export function addYears(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return formatDateMs(Date.UTC(y + n, m - 1, Math.min(d, daysInMonth(y + n, m))));
}

/** 按单位把偏移换算成目标日期 */
function shiftBase(base: string, n: number, unit: OffsetUnit): string {
  if (n === 0) return base;
  // day 就是 n 天，不能掉进下面的 n×7（那是 week 的换算），否则「+30 天」会算成 +210 天
  if (unit === 'day') return addDays(base, n);
  if (unit === 'month') return addMonths(base, n);
  if (unit === 'year') return addYears(base, n);
  return addDays(base, n * 7);
}

/* ---------------------------------------------------------------- 法定节假日 */

interface HolidayIndex {
  holidays: Set<string>;
  makeup: Set<string>;
  years: Set<number>;
}

const HOLIDAY_INDEX: HolidayIndex = (() => {
  const holidays = new Set<string>();
  const makeup = new Set<string>();
  const years = new Set<number>();
  for (const plan of HOLIDAY_PLANS) {
    years.add(plan.year);
    for (const seg of plan.segments as HolidaySegment[]) {
      for (let d = seg.start; d <= seg.end; d = addDays(d, 1)) {
        holidays.add(d);
      }
    }
    for (const d of plan.makeupWorkdays) {
      makeup.add(d);
    }
  }
  return { holidays, makeup, years };
})();

/** 该日按默认口径（只看周末）算不算工作日 */
function isPlainWorkday(date: string): boolean {
  const dow = weekday(date);
  return dow !== 0 && dow !== 6;
}

/** 是否落在左闭右开区间 [from, to) 内 */
function inRange(date: string, from: string, to: string): boolean {
  return date >= from && date < to;
}

/**
 * [from, from+total) 里的工作日天数（只看周末的默认口径）。
 * 用取整公式而不是逐日循环：上万年也不卡，且结果能跟逐日循环对拍。
 */
function countPlainWorkdays(from: string, total: number): number {
  if (total <= 0) return 0;
  const startDow = weekday(from);
  const fullWeeks = Math.floor(total / 7);
  let work = fullWeeks * 5;
  for (let i = 0; i < total % 7; i++) {
    const dow = (startDow + i) % 7;
    if (dow !== 0 && dow !== 6) work += 1;
  }
  return work;
}

/** 法定节假日数据是否覆盖了整个统计区间；没覆盖的年份只能按周末算 */
export function holidaysCover(from: string, to: string): boolean {
  const y1 = Number(from.slice(0, 4));
  const y2 = Number(addDays(to, -1).slice(0, 4));
  for (let y = y1; y <= y2; y++) {
    if (!HOLIDAY_INDEX.years.has(y)) return false;
  }
  return true;
}

/**
 * 统计 [from, to) 区间的工作日 / 休息日 / 法定节假日。
 *
 * 默认口径：周一~周五 = 工作日，周六周日 = 休息日。
 * excludeHolidays 打开后（原站叫「排除法定节假日」，本工具沿用）：
 *   · 落在工作日的法定节假日 → 从「工作日」挪到「法定节假日」这一行；
 *   · 落在周末的调休上班日 → 从「休息日」挪到「工作日」。
 * 不变量：workdays + weekends + holidays === 总天数，任何时候都成立。
 *
 * 实现上先按公式算周末口径，再只给「区间内那几个节假日 / 调休日」打补丁 ——
 * 数据集一年就几十条，比逐日循环快得多，也更好对拍。
 *
 * ⚠️ 与原站的一处已知差异（2026-01-01 ~ 2026-12-31 全年级）：
 *    原站给出「工作日 248 / 周末 104 / 法定节假日 12」，本实现给出「247 / 98 / 19」。
 *    原因不是算法不同，而是**双方内置的 2026 节假日表不一致**：原站把 04-06（清明，周一）
 *    仍算工作日、01-03（周六）也算工作日，与国办通知的放假区间对不上；
 *    这里用的是 china-holidays 里带官方出处的国办口径（见 holidays.data.ts 的文件头）。
 *    宁可跟国办通知一致，也不照搬一张对不上的表 —— 这条差异写在测试里锁死，别偷偷改回原站数字。
 */
export function workdayStats(
  from: string,
  to: string,
  excludeHolidays = false
): {
  workdays: number;
  weekends: number;
  /** 只统计到「落在工作日上的法定节假日」，落在周末的不算（那天本来就是休息日） */
  holidays: number;
  holidaysCovered: boolean;
} {
  const total = Math.round((parseDateMs(to) - parseDateMs(from)) / MS_PER_DAY);
  if (total <= 0) {
    return { workdays: 0, weekends: 0, holidays: 0, holidaysCovered: true };
  }
  const plainWork = countPlainWorkdays(from, total);
  let work = plainWork;
  let rest = total - plainWork;
  let holidays = 0;

  if (excludeHolidays) {
    for (const d of HOLIDAY_INDEX.holidays) {
      if (inRange(d, from, to) && isPlainWorkday(d)) {
        work -= 1;
        holidays += 1;
      }
    }
    for (const d of HOLIDAY_INDEX.makeup) {
      if (inRange(d, from, to) && !isPlainWorkday(d)) {
        work += 1;
        rest -= 1;
      }
    }
  }

  return {
    workdays: work,
    weekends: rest,
    holidays,
    holidaysCovered: excludeHolidays ? holidaysCover(from, to) : true,
  };
}

/* ---------------------------------------------------------------- Tab 1：日期相差 */

/**
 * 把「天数」拆成「几年几个月零几天」。
 *
 * 用日历推演而不是除法：从起始日一步步往后推，只要推完还没超过终点就继续，
 * 剩下的才是天数。这样 2026-01-01 → 2026-12-31 得到「0 年 11 个月零 30 天」，
 * 和原站一致；用 364/30 除会得出 12 个月，看着就别扭。
 */
export function splitDuration(from: string, days: number): {
  years: number;
  months: number;
  restDays: number;
} {
  const limit = parseDateMs(from) + days * MS_PER_DAY;

  // 年份先锚在起始日上整年推：addYears(from, n) 一直推到超过终点为止。
  // 这里不能用「游标逐个加月，凑满 12 个月再进年」——那样 11 个月后的游标会漂到当月 1 号，
  // 再加一年等于跳了 23 个月，年份会算少（2021-01-01 + 1827 天会被算成 2 年）。
  let years = 0;
  for (let guard = 0; guard < 300; guard++) {
    if (parseDateMs(addYears(from, years + 1)) <= limit) years += 1;
    else break;
  }

  const base = addYears(from, years);
  let months = 0;
  for (let guard = 0; guard < 12; guard++) {
    if (parseDateMs(addMonths(base, months + 1)) <= limit) months += 1;
    else break;
  }

  const anchor = addMonths(base, months);
  return {
    years,
    months,
    restDays: Math.round((limit - parseDateMs(anchor)) / MS_PER_DAY),
  };
}

export function diffDate(from: string, to: string, options: DiffOptions = {}): DiffResult | null {
  const raw = (parseDateMs(to) - parseDateMs(from)) / MS_PER_DAY;
  if (!Number.isFinite(raw) || raw < 0) return null;

  const statFrom = from;
  const statTo = addDays(from, Math.round(raw));
  const stats = workdayStats(statFrom, statTo, options.excludeHolidays ?? false);
  const days = raw + (options.includeEndDay ? 1 : 0);
  const soft = splitDuration(from, days);

  return {
    days,
    weeks: { count: Math.floor(days / 7), restDays: days % 7 },
    months: { count: soft.months, restDays: soft.restDays },
    years: { count: soft.years, months: soft.months, restDays: soft.restDays },
    hours: days * 24,
    minutes: days * 24 * 60,
    seconds: days * 24 * 60 * 60,
    workdays: stats.workdays,
    weekends: stats.weekends,
    holidays: stats.holidays,
    holidaysCovered: stats.holidaysCovered,
    statFrom,
    statTo,
  };
}

/* ---------------------------------------------------------------- 起止日期信息框 */

/** 单日的星期 / 农历 / 生肖 / 星座 / 闰平年 / ISO 周 / 干支 汇总 */
export function dateInfo(date: string): DateInfo {
  const lunar = getLunar(date);
  const week = isoWeek(date);
  return {
    date,
    weekdayCn: weekdayCn(date),
    // monthCn 平时是「冬」「九」这种简称，闰月时是「闰二」，统一补一个「月」才对得上原站：
    //   「冬月十三」「九月廿七」「闰二月十一」（原站实测文案）
    lunar: lunar ? `${lunar.monthCn}月${lunar.dayCn}` : null,
    lunarLeap: lunar && lunar.isLeap ? `${lunar.monthCn}月` : null,
    zodiac: lunar?.zodiac ?? null,
    constellation: getConstellation(date),
    leapCn: isLeapYear(date) ? '闰年' : '平年',
    isoWeekCn: `第 ${week.week} 周（ISO）`,
    ganzhi: lunar
      ? `${lunar.ganzhiYear}年 ${lunar.ganzhiMonth}月 ${lunar.ganzhiDay}日`
      : null,
  };
}

/** 信息框那行「1月1日 星期四」 */
export function infoLine(date: string): string {
  return prettyDate(date);
}

/* ---------------------------------------------------------------- Tab 2：日期推算 */

/** 这天算不算工作日（默认口径 + 可选法定节假日口径） */
export function isWorkday(date: string, excludeHolidays = false): boolean {
  if (excludeHolidays && HOLIDAY_INDEX.holidays.has(date)) return false;
  if (excludeHolidays && HOLIDAY_INDEX.makeup.has(date)) return true;
  return isPlainWorkday(date);
}

/** 从 date 出发，往后/往前推 n 个工作日，返回落点日期 */
export function addWorkdays(date: string, n: number, excludeHolidays = false): string {
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let remaining = Math.abs(n);
  let cursor = date;
  for (let guard = 0; remaining > 0 && guard < 20000; guard++) {
    cursor = addDays(cursor, step);
    if (isWorkday(cursor, excludeHolidays)) remaining -= 1;
  }
  return cursor;
}

/**
 * 从 base 挪到 target 这一段跨过几个工作日：算 base 之后、target 之前（含 target）那些天里的
 * 工作日数。基准当天本身不算，目标当天算 —— 这样「往后推 5 个工作日报 5 个」才说得通。
 */
function countWorkdaysBetween(from: string, to: string, excludeHolidays = false): number {
  const total = Math.round((parseDateMs(to) - parseDateMs(from)) / MS_PER_DAY);
  const step = total >= 0 ? 1 : -1;
  let count = 0;
  for (let i = 1; i <= Math.abs(total); i++) {
    if (isWorkday(addDays(from, i * step), excludeHolidays)) count += 1;
  }
  return count;
}

/**
 * 日期推算：从基准日期按「偏移数值 + 单位 + 方向」落到新日期。
 * mode = workday 时只按工作日跳（跳过周末，可选跳过法定节假日）。
 */
export function calcDate(base: string, options: CalcOptions): CalcResult | null {
  if (!base || !Number.isFinite(options.value)) return null;

  const value = Math.trunc(options.value);
  const sign = options.direction === 'forward' ? 1 : -1;
  const excludeHolidays = options.excludeHolidays ?? false;

  let target: string;
  if (options.mode === 'workday') {
    target = addWorkdays(base, sign * value, excludeHolidays);
  } else if (value === 0) {
    target = base;
  } else {
    target = shiftBase(base, sign * value, options.unit);
  }

  return {
    date: target,
    naturalDiff: Math.round((parseDateMs(target) - parseDateMs(base)) / MS_PER_DAY),
    crossedWorkdays:
      options.mode === 'workday' ? countWorkdaysBetween(base, target, excludeHolidays) : 0,
    info: dateInfo(target),
  };
}

/* ---------------------------------------------------------------- Tab 3：倒计时 */

/**
 * 倒计时到目标日期（算到该日结束，也就是次日 00:00）。
 * now 由调用方传进来，UI 每秒重新调一次即可；测试里也能定死时间。
 */
export function countdownTo(target: string, now: Date): CountdownResult | null {
  if (!target) return null;
  const [y, m, d] = target.split('-').map(Number);
  const targetEnd = new Date(y, m - 1, d + 1).getTime();
  const raw = targetEnd - now.getTime();
  const past = raw < 0;
  const diff = Math.abs(raw);
  const days = Math.floor(diff / MS_PER_DAY);
  return {
    target,
    days,
    weeks: { count: Math.floor(days / 7), restDays: days % 7 },
    hours: Math.floor((diff % MS_PER_DAY) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
    past,
    isToday: days === 0 && !past,
    info: dateInfo(target),
  };
}

/* ---------------------------------------------------------------- 快捷事件 */

export interface PresetEvent {
  key: string;
  /** 直接填进「事件名称」的输入框 */
  label: string;
  /** 公历日期 */
  date: string;
}

/**
 * 倒计时页的常用事件。元旦/高考/国庆是固定公历月日，春节走农历所以要查表；
 * 只能给出「今年」的日期，跨年得等下次进来重新算。
 */
export function presetEvents(now = new Date()): PresetEvent[] {
  const y = now.getFullYear();
  return [
    { key: 'newyear', label: '元旦', date: `${y}-01-01` },
    { key: 'spring', label: '春节', date: lunarYearStart(y) ?? `${y}-02-01` },
    { key: 'gaokao', label: '高考', date: `${y}-06-07` },
    { key: 'national', label: '国庆节', date: `${y}-10-01` },
  ];
}
