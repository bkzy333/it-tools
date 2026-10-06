/**
 * 农历 / 干支 / 生肖 的对拍测试。
 *
 * 锚点表 lunar.anchors.ts 由基准库 lunar-javascript 一次性导出（7236 条，覆盖 1900—2100
 * 每年每月的 1 号、15 号、月末），基准库本身不进项目依赖 —— 所以这里能纯离线跑，
 * 却仍然守得住整张农历表：只要有人手改 LUNAR_YEAR_CODES / TERM_DAY_OFFSETS，
 * 或者动了干支月的节气切分逻辑，这里立刻报红。
 *
 * 生成锚点的脚本：qa-20261005/target/gen-lunar-anchors.mjs
 * （当初做全量逐日对拍用的是 verify-lunar.mjs，1900-01-01 ~ 2100-12-31 共 73414 天全一致）
 */
import { describe, expect, it } from 'vitest';
import {
  diffDays,
  formatDateMs,
  getConstellation,
  getLunar,
  isLeapYear,
  isoWeek,
  MAX_LUNAR_YEAR,
  MIN_LUNAR_YEAR,
  parseDateMs,
  prettyDate,
  weekdayCn,
} from './lunar.service';
import { LUNAR_ANCHORS } from './lunar.anchors';

describe('getLunar 对拍锚点', () => {
  it('1900—2100 每年每月的 1 号 / 15 号 / 月末与基准库一致', () => {
    expect(LUNAR_ANCHORS.length).toBeGreaterThan(7000);
    const bad: string[] = [];
    for (const [date, monthDay, monthGanzhi, dayGanzhi, leapMonth] of LUNAR_ANCHORS) {
      const info = getLunar(date);
      if (!info) {
        // 锚点已经排除了 1900-01-31 之前的日期，走到这里就是 bug
        bad.push(`${date} 应为有效日期但返回 null`);
        continue;
      }
      const actual = `${info.monthCn}${info.dayCn}`;
      if (actual !== monthDay) {
        bad.push(`${date} 农历 ${actual} ≠ 基准 ${monthDay}`);
      }
      if (info.ganzhiMonth !== monthGanzhi) {
        bad.push(`${date} 月干支 ${info.ganzhiMonth} ≠ 基准 ${monthGanzhi}`);
      }
      if (info.ganzhiDay !== dayGanzhi) {
        bad.push(`${date} 日干支 ${info.ganzhiDay} ≠ 基准 ${dayGanzhi}`);
      }
      if (info.leapMonth !== leapMonth) {
        bad.push(`${date} leapMonth ${info.leapMonth} ≠ 基准 ${leapMonth}`);
      }
    }
    expect(bad.slice(0, 10)).toEqual([]);
    expect(bad.length).toBe(0);
  });
});

describe('干支月的两个坑', () => {
  it('地支按节气切，不按农历月初一切（2026-01-15 是己丑不是戊子）', () => {
    expect(getLunar('2026-01-15')?.ganzhiMonth).toBe('己丑');
  });

  it('天干在立春换年（1900-01-31 立春前算丁丑，1900-02-06 立春后算戊寅）', () => {
    expect(getLunar('1900-01-31')?.ganzhiMonth).toBe('丁丑');
    expect(getLunar('1900-02-06')?.ganzhiMonth).toBe('戊寅');
  });

  it('2026 年干支月按 12 个节气顺序走完一整圈地支（子丑寅…亥）', () => {
    // 2026-01-01 还没过小寒（1/5），所以年初是子月；之后每过一个「节」换一个地支
    const cycle = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
    const seen: string[] = [];
    let prev = '';
    for (let i = 0; i < 365; i++) {
      const d = new Date(Date.UTC(2026, 0, 1) + i * 86400000);
      const date = formatDateMs(d.getTime());
      const z = getLunar(date)!.ganzhiMonth[1];
      expect(cycle, `${date} 的地支 ${z} 不在循环里`).toContain(z);
      if (z !== prev) {
        seen.push(z);
        prev = z;
      }
    }
    // 年底 12 月 7 日过了大雪，又回到子月 —— 跨年的那一格也归在 2026 里
    expect(seen).toEqual([...cycle, '子']);
  });
});

describe('闰月', () => {
  it('闰月插在正确位置且标了闰字', () => {
    // [日期, 月名开头, 闰几月]；日期必须真的落在闰月里（闰月之前一个月仍然是普通月）
    const leapCases: [string, string, number][] = [
      ['1900-10-01', '闰八', 8],
      ['1903-07-01', '闰五', 5],
      ['1906-06-01', '闰四', 4],
      ['2023-04-01', '闰二', 2],
      ['2025-08-01', '闰六', 6],
    ];
    for (const [date, prefix, leapAt] of leapCases) {
      const info = getLunar(date);
      expect(info, date).not.toBeNull();
      expect(info!.monthCn.startsWith(prefix), `${date} → ${info!.monthCn}`).toBe(true);
      expect(info!.leapMonth).toBe(leapAt);
      expect(info!.isLeap).toBe(leapAt > 0);
    }
  });

  it('闰月前一个月仍是普通月（别把整年都标成闰）', () => {
    // 2023 年闰二月，但 3 月 1 日还在普通二月里
    expect(getLunar('2023-03-01')?.monthCn).toBe('二');
    expect(getLunar('2023-03-01')?.isLeap).toBe(false);
    expect(getLunar('2023-04-01')?.monthCn).toBe('闰二');
  });

  it('同一年内的农历日号不会重复（闰月只是多一个月，不是多一天）', () => {
    const seen = new Set<string>();
    for (const [date] of LUNAR_ANCHORS) {
      const info = getLunar(date)!;
      if (!info) continue;
      const key = `${info.year}-${info.month}-${info.isLeap ? 'L' : 'N'}-${info.day}`;
      if (info.day === 1) {
        expect(seen.has(key), `${date} 重复命中 ${key}`).toBe(false);
      }
      seen.add(key);
    }
  });
});

describe('边界与空值', () => {
  it('1900-01-31 之前没有农历（表从正月初一起算）', () => {
    expect(getLunar('1900-01-30')).toBeNull();
    expect(getLunar('1899-12-31')).toBeNull();
  });

  it('表内首尾可用', () => {
    expect(getLunar('1900-01-31')?.day).toBe(1);
    expect(getLunar('2026-01-01')?.zodiac).toBe('蛇');
    expect(getLunar(`2100-12-31`)).not.toBeNull();
  });

  it('声明了支持区间', () => {
    expect(MIN_LUNAR_YEAR).toBe(1900);
    expect(MAX_LUNAR_YEAR).toBe(2100);
  });
});

describe('生肖 / 干支年', () => {
  it('2026 是乙巳年蛇，2024 是甲辰年龙，1900 是庚子年鼠', () => {
    expect(getLunar('2026-01-01')?.zodiac).toBe('蛇');
    expect(getLunar('2024-02-10')?.zodiac).toBe('龙');
    expect(getLunar('1948-02-10')?.zodiac).toBe('鼠');
    expect(getLunar('1900-01-31')?.ganzhiYear).toBe('庚子');
    expect(getLunar('2025-01-29')?.ganzhiYear).toBe('乙巳');
  });

  it('生肖跟干支年的地支对得上', () => {
    const zodiacOf = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];
    for (const [date] of LUNAR_ANCHORS) {
      const info = getLunar(date);
      if (!info) continue;
      const zhiIndex = '子丑寅卯辰巳午未申酉戌亥'.indexOf(info.ganzhiYear[1]);
      expect(info.zodiac, date).toBe(zodiacOf[zhiIndex]);
    }
  });
});

describe('星座 / 闰平年 / ISO 周 / 星期', () => {
  it('星座分界', () => {
    expect(getConstellation('2026-01-01')).toBe('摩羯座');
    expect(getConstellation('2026-01-20')).toBe('水瓶座');
    expect(getConstellation('2026-04-21')).toBe('金牛座');
    expect(getConstellation('2026-12-25')).toBe('摩羯座');
  });

  it('公历闰年', () => {
    expect(isLeapYear('2024-03-01')).toBe(true);
    expect(isLeapYear('2025-03-01')).toBe(false);
    expect(isLeapYear('1900-03-01')).toBe(false); // 整百年要被 400 整除才是闰年
    expect(isLeapYear('2000-03-01')).toBe(true);
  });

  it('ISO 周：跨年归到周多的那一年', () => {
    expect(isoWeek('2026-01-01')).toEqual({ week: 1, year: 2026 });
    expect(isoWeek('2027-01-01')).toEqual({ week: 53, year: 2026 });
    expect(isoWeek('2026-12-31')).toEqual({ week: 53, year: 2026 });
  });

  it('星期中文名', () => {
    expect(weekdayCn('2026-01-01')).toBe('星期四');
    expect(weekdayCn('2026-01-04')).toBe('星期日');
  });

  it('prettyDate', () => {
    expect(prettyDate('2026-01-01')).toBe('1月1日 星期四');
  });
});

describe('日期字符串与天数', () => {
  it('parseDateMs / formatDateMs 对称，且不跨时区掉一天', () => {
    for (const [date, , , ] of LUNAR_ANCHORS.slice(0, 500)) {
      expect(formatDateMs(parseDateMs(date))).toBe(date);
    }
  });

  it('diffDays 按 UTC 整天算', () => {
    expect(diffDays('2026-01-01', '2026-12-31')).toBe(364);
    expect(diffDays('2026-12-31', '2026-01-01')).toBe(-364);
    expect(diffDays('2026-01-01', '2026-01-01')).toBe(0);
    expect(diffDays('2024-02-28', '2024-03-01')).toBe(2); // 闰年
    expect(diffDays('2025-02-28', '2025-03-01')).toBe(1);
  });
});
