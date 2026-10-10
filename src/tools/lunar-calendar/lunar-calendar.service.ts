/**
 * 农历 ↔ 公历转换。
 *
 * 参考 iamwawa.cn/nongli.html：公历↔农历互转 + 干支纪年 + 生肖 + 星座。
 * 农历计算复用 date-distance-calculator 里已全量对拍的 lunar.service.ts
 * （1900-2100 农历表 + 干支 + 生肖 + 星座，零依赖纯本地）。
 *
 * 本工具只做「转换 + 展示」，不搬运参考站代码（参考站无 LICENSE）。
 * 公历→农历用 getLunar；农历→公历在 1900-2100 范围内逐日反查。
 */

import { formatDateMs, getConstellation, getLunar, MAX_LUNAR_YEAR, MIN_LUNAR_YEAR } from '../date-distance-calculator/lunar.service';

export interface SolarToLunarResult {
  solar: string;
  lunarYear: number;
  lunarMonth: number;
  lunarDay: number;
  isLeap: boolean;
  /** 如「九月初七」 */
  lunarDateCn: string;
  /** 农历完整日期，如「2026年九月初七」 */
  lunarFull: string;
  /** 年干支，如「庚子」 */
  ganzhiYear: string;
  /** 月干支 */
  ganzhiMonth: string;
  /** 日干支 */
  ganzhiDay: string;
  /** 生肖，如「鼠」 */
  zodiac: string;
  /** 星座，如「天秤座」 */
  constellation: string;
}

/** 公历 → 农历 */
export function solarToLunar(date: string): SolarToLunarResult | null {
  const lunar = getLunar(date);
  if (!lunar) {
    return null;
  }
  return {
    solar: date,
    lunarYear: lunar.year,
    lunarMonth: lunar.month,
    lunarDay: lunar.day,
    isLeap: lunar.isLeap,
    lunarDateCn: `${lunar.monthCn}月${lunar.dayCn}`,
    lunarFull: `${lunar.year}年${lunar.monthCn}月${lunar.dayCn}`,
    ganzhiYear: `${lunar.ganzhiYear}年`,
    ganzhiMonth: `${lunar.ganzhiMonth}月`,
    ganzhiDay: `${lunar.ganzhiDay}日`,
    zodiac: lunar.zodiac,
    constellation: getConstellation(date),
  };
}

/**
 * 农历 → 公历。
 * 在 1900-2100 范围内逐日反查，命中「农历年 + 月 + 日 + 是否闰月」即返回公历日期。
 * 若无闰月但传入 isLeap=true，返回 null（该年没有这个闰月）。
 */
export function lunarToSolar(lunarYear: number, lunarMonth: number, lunarDay: number, isLeap = false): string | null {
  if (lunarYear < MIN_LUNAR_YEAR || lunarYear > MAX_LUNAR_YEAR) {
    return null;
  }
  // 农历年大致对应公历 lunarYear 年（正月初一通常在 1 月下旬~2 月），
  // 从公历 lunarYear-1 年 12 月起扫，400 天足够覆盖整个农历年（含闰月）
  const start = new Date(Date.UTC(lunarYear - 1, 11, 1));
  for (let i = 0; i < 400; i++) {
    const ms = start.getTime() + i * 86400000;
    const date = formatDateMs(ms);
    const lunar = getLunar(date);
    if (!lunar) {
      continue;
    }
    if (lunar.year !== lunarYear) {
      continue;
    }
    if (lunar.month === lunarMonth && lunar.day === lunarDay && lunar.isLeap === isLeap) {
      return date;
    }
  }
  return null;
}

/** 判断某公历年份是否闰年 */
export function isGregorianLeapYear(year: number): boolean {
  return year % 4 === 0 && !(year % 100 === 0 && year % 400 !== 0);
}
