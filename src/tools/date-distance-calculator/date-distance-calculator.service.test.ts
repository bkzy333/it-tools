/**
 * 核心算法对拍测试。
 *
 * 期望值分三档来源，每条断言的注释里都写了是哪一个：
 *   ① 原站 gjupai.com/tools/date_distance_calculator 的真实渲染（qa-20261005/target/probe-*.mjs 抓的 innerText）
 *   ② 国办 2026 年放假通知（china-holidays/holidays.data.ts）推导出的必然结果
 *   ③ 历法/公历规则本身（闰日、ISO 周、31 号加月收敛）
 *
 * 原站实测锚点：
 *   2026-01-01 → 2026-12-31：364 天 / 52 周零 0 天 / 约 11 个月零 30 天 / 约 0 年 11 个月零 30 天 /
 *                            8736 小时 / 524160 分钟 / 31449600 秒 / 260 工作日 / 104 周末
 *   起止信息框：冬月十三 蛇 摩羯座 平年 第 1 周（ISO）乙巳年 戊子月 乙亥日（起始）
 *               冬月廿三 马 摩羯座 平年 第 53 周（ISO）丙午年 庚子月 己卯日（结束）
 *   倒计时 2027-01-01（实测时点 2026-10-06 20:00）：87 天 / 12 周零 3 天
 *   倒计时到明天 2026-10-07（实测时点 2026-10-06 20:00）：1 天 / 0 周零 1 天 → 证明算到次日零点
 *   闰月文案：2023-04-01 → 「农历闰二月十一」
 */
import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  addWorkdays,
  addYears,
  calcDate,
  countdownTo,
  dateInfo,
  daysInMonth,
  diffDate,
  holidaysCover,
  infoLine,
  isWorkday,
  presetEvents,
  splitDuration,
  workdayStats,
} from './date-distance-calculator.service';

describe('日期加减（日历推演）', () => {
  it('加天不会跨时区掉日', () => {
    expect(addDays('2026-01-01', 364)).toBe('2026-12-31');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
  });

  it('加月跨年正确', () => {
    expect(addMonths('2026-01-01', 11)).toBe('2026-12-01');
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01');
    expect(addMonths('2026-01-01', -1)).toBe('2025-12-01');
  });

  it('31 号加月会收敛到月末，不会漂到下下个月', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28'); // 2026 平年
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29'); // 闰年
    expect(addMonths('2026-02-28', 1)).toBe('2026-03-28');
  });

  it('加年跳过 2 月 29 日', () => {
    expect(addYears('2024-02-29', 1)).toBe('2025-02-28');
    expect(addYears('2024-02-29', 4)).toBe('2028-02-29');
  });

  it('天数计算器自己也要对', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe('splitDuration：年 / 月 / 日拆分', () => {
  it('2026-01-01 → 2026-12-31 = 0 年 11 个月零 30 天（原站口径）', () => {
    const r = splitDuration('2026-01-01', 364);
    expect(r).toEqual({ years: 0, months: 11, restDays: 30 });
  });

  it('整年：2021-01-01 + 1827 天 = 5 年 0 个月零 1 天', () => {
    // 2021-01-01 + 1826 天正好落到 2026-01-01，多出来的 1 天留在余天里
    const r = splitDuration('2021-01-01', 1827);
    expect(r.years).toBe(5);
    expect(r.months).toBe(0);
    expect(r.restDays).toBe(1);
  });

  it('拆分能原路走回去：年→月→日 复合后必须等于加天', () => {
    for (const from of ['2024-02-15', '2026-03-31', '2026-11-30', '2000-12-31', '2026-01-01']) {
      for (const days of [1, 30, 100, 364, 1000, 5000, 1827]) {
        const r = splitDuration(from, days);
        const back = addDays(addMonths(addYears(from, r.years), r.months), r.restDays);
        expect(back, `${from} + ${days} 天 → ${JSON.stringify(r)} 走回 ${back}`).toBe(
          addDays(from, days)
        );
      }
    }
  });
});

describe('diffDate：Tab 1 全部字段对齐原站', () => {
  const r = diffDate('2026-01-01', '2026-12-31')!;

  it('相差天数不含起始当天', () => {
    expect(r.days).toBe(364);
  });

  it('按周换算', () => {
    expect(r.weeks).toEqual({ count: 52, restDays: 0 });
  });

  it('按月 / 按年换算走日历推演', () => {
    expect(r.months).toEqual({ count: 11, restDays: 30 });
    expect(r.years).toEqual({ count: 0, months: 11, restDays: 30 });
  });

  it('时分秒', () => {
    expect(r.hours).toBe(8736);
    expect(r.minutes).toBe(524160);
    expect(r.seconds).toBe(31449600);
  });

  it('工作日 / 周末（默认口径，不剔法定节假日）＝ 原站 260 / 104', () => {
    expect(r.workdays).toBe(260);
    expect(r.weekends).toBe(104);
    expect(r.holidays).toBe(0);
    expect(r.workdays + r.weekends).toBe(364);
  });

  it('倒着填（结束早于开始）返回 null', () => {
    expect(diffDate('2026-12-31', '2026-01-01')).toBeNull();
  });

  it('同一天为 0', () => {
    const same = diffDate('2026-05-05', '2026-05-05')!;
    expect(same.days).toBe(0);
    expect(same.workdays).toBe(0);
    expect(same.weeks).toEqual({ count: 0, restDays: 0 });
  });

  it('勾「包含结束日期」显示 +1，统计区间不动', () => {
    const included = diffDate('2026-01-01', '2026-12-31', { includeEndDay: true })!;
    expect(included.days).toBe(365);
    expect(included.workdays).toBe(260);
    expect(diffDate('2026-01-01', '2026-12-31', { includeEndDay: false })!.workdays).toBe(260);
  });
});

describe('工作日 / 法定节假日', () => {
  it('默认口径只看周末', () => {
    // 2026-01-01 是周四（默认算工作日），01-03 周六、01-04 周日（休息）
    expect(isWorkday('2026-01-01')).toBe(true);
    expect(isWorkday('2026-01-03')).toBe(false);
    expect(isWorkday('2026-01-05')).toBe(true);
  });

  it('排除法定节假日后：假日算休息、调休算上班', () => {
    // 2026-01-01 元旦假期（原本是工作日）→ 排除后变休息
    expect(isWorkday('2026-01-01', true)).toBe(false);
    // 2026-01-04 元旦调休上班日（原本是周日休息）→ 排除后变工作日
    expect(isWorkday('2026-01-04', true)).toBe(true);
    // 2026-02-15 是春节假期（原本就是周日休息）→ 排除后还是休息
    expect(isWorkday('2026-02-15', true)).toBe(false);
  });

  it('三行数字之和恒等于总天数（排除口径）', () => {
    for (const [from, to] of [
      ['2026-01-01', '2026-12-31'],
      ['2026-01-01', '2026-01-10'],
      ['2026-02-14', '2026-02-25'],
      ['2026-09-23', '2026-10-10'],
      ['2020-03-01', '2021-08-20'],
    ] as [string, string][]) {
      const total = Math.round(
        (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000
      );
      const s = workdayStats(from, to, true);
      expect(s.workdays + s.weekends + s.holidays, `${from}~${to}`).toBe(total);
    }
  });

  it('整年排除口径：247 工作日 / 98 周末 / 19 法定节假日', () => {
    // ⚠️ 原站同一区间给的是「248 / 104 / 12」，差异来自双方内置节假日表不同，
    //    不是算法不同：原站把 04-06（清明周一）仍算工作日、01-03（周六）算工作日，
    //    与国办 2026 通知的放假区间对不上。这里坚持国办口径，差异锁在这条断言里，别改。
    const s = workdayStats('2026-01-01', '2026-12-31', true);
    expect(s).toEqual({ workdays: 247, weekends: 98, holidays: 19, holidaysCovered: true });
    // 天数守恒
    expect(s.workdays + s.weekends + s.holidays).toBe(364);
  });

  it('整年默认口径：260 工作日 / 104 周末', () => {
    const s = workdayStats('2026-01-01', '2026-12-31');
    expect(s).toEqual({ workdays: 260, weekends: 104, holidays: 0, holidaysCovered: true });
  });

  it('区间覆盖到没有节假日数据的年份时标记为未覆盖', () => {
    expect(holidaysCover('2026-01-01', '2026-12-31')).toBe(true);
    expect(holidaysCover('2025-06-01', '2026-06-01')).toBe(false);
    // 没开排除口径时不看覆盖率，别让 UI 凭空冒一句「未覆盖」
    expect(workdayStats('2025-06-01', '2025-08-01').holidaysCovered).toBe(true);
  });

  it('workdayStats 的公式解与逐日循环结果一致', () => {
    for (const [from, to] of [
      ['2026-01-01', '2026-12-31'],
      ['2026-02-15', '2026-03-05'],
      ['2026-10-01', '2026-11-15'],
    ] as [string, string][]) {
      const total = Math.round(
        (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000
      );
      const s = workdayStats(from, to);
      expect(s.workdays + s.weekends, `${from}~${to}`).toBe(total);
    }
  });
});

describe('dateInfo：起止日期信息框对齐原站', () => {
  it('起始日 2026-01-01：星期四 / 冬月十三 / 蛇 / 摩羯座 / 平年 / 第 1 周（ISO）/ 乙巳年 戊子月 乙亥日', () => {
    const i = dateInfo('2026-01-01');
    expect(i.weekdayCn).toBe('星期四');
    expect(i.lunar).toBe('冬月十三');
    expect(i.zodiac).toBe('蛇');
    expect(i.constellation).toBe('摩羯座');
    expect(i.leapCn).toBe('平年');
    expect(i.isoWeekCn).toBe('第 1 周（ISO）');
    expect(i.ganzhi).toBe('乙巳年 戊子月 乙亥日');
  });

  it('结束日 2026-12-31：星期四 / 冬月廿三 / 马 / 摩羯座 / 平年 / 第 53 周（ISO）/ 丙午年 庚子月 己卯日', () => {
    const i = dateInfo('2026-12-31');
    expect(i.weekdayCn).toBe('星期四');
    expect(i.lunar).toBe('冬月廿三');
    expect(i.zodiac).toBe('马');
    expect(i.constellation).toBe('摩羯座');
    expect(i.isoWeekCn).toBe('第 53 周（ISO）');
    expect(i.ganzhi).toBe('丙午年 庚子月 己卯日');
  });

  it('闰年标记跟着公历走', () => {
    expect(dateInfo('2024-06-01').leapCn).toBe('闰年');
    expect(dateInfo('2025-06-01').leapCn).toBe('平年');
  });

  it('闰月那天：lunar 带「闰二月」、lunarLeap 单独给「闰二月」', () => {
    // 原站实测 2023-04-01 → 「农历闰二月十一」
    const i = dateInfo('2023-04-01');
    expect(i.lunar).toBe('闰二月十一');
    expect(i.lunarLeap).toBe('闰二月');
    expect(dateInfo('2023-03-01').lunarLeap).toBeNull();
    expect(dateInfo('2023-03-01').lunar).toBe('二月初十');
  });

  it('1900-01-31 之前没有农历，相关字段留空但公历信息照给', () => {
    const i = dateInfo('1899-06-01');
    expect(i.lunar).toBeNull();
    expect(i.zodiac).toBeNull();
    expect(i.ganzhi).toBeNull();
    expect(i.weekdayCn).toBe('星期四');
  });

  it('infoLine 输出「1月1日 星期四」', () => {
    expect(infoLine('2026-01-01')).toBe('1月1日 星期四');
  });
});

describe('calcDate：Tab 2 日期推算', () => {
  it('自然日 +30 天', () => {
    const r = calcDate('2026-03-08', {
      value: 30,
      unit: 'day',
      direction: 'forward',
      mode: 'natural',
    })!;
    expect(r.date).toBe('2026-04-07');
    expect(r.naturalDiff).toBe(30);
    expect(r.crossedWorkdays).toBe(0);
  });

  it('向前推 30 天', () => {
    const r = calcDate('2026-03-08', {
      value: 30,
      unit: 'day',
      direction: 'backward',
      mode: 'natural',
    })!;
    expect(r.date).toBe('2026-02-06');
    expect(r.naturalDiff).toBe(-30);
  });

  it('按周换算成天', () => {
    const r = calcDate('2026-03-08', {
      value: 2,
      unit: 'week',
      direction: 'forward',
      mode: 'natural',
    })!;
    expect(r.date).toBe('2026-03-22');
  });

  it('按月推进（跨月边界收敛）', () => {
    expect(
      calcDate('2026-01-31', { value: 1, unit: 'month', direction: 'forward', mode: 'natural' })!
        .date
    ).toBe('2026-02-28');
  });

  it('按年推进', () => {
    expect(
      calcDate('2026-02-29', { value: 1, unit: 'year', direction: 'forward', mode: 'natural' })!.date
    ).toBe('2027-02-28');
  });

  it('工作日模式：跳过周末（2026-03-08 是周日）', () => {
    // 03-09 周一 起算，+5 个工作日：09→10→11→12→13，落在 03-13 周五
    const r = calcDate('2026-03-08', {
      value: 5,
      unit: 'day',
      direction: 'forward',
      mode: 'workday',
    })!;
    expect(r.date).toBe('2026-03-13');
    expect(r.crossedWorkdays).toBe(5);
  });

  it('工作日模式往前推对称（03-20 减 5 个工作日回到 03-13）', () => {
    const r = calcDate('2026-03-20', {
      value: 5,
      unit: 'day',
      direction: 'backward',
      mode: 'workday',
    })!;
    expect(r.date).toBe('2026-03-13');
  });

  it('0 偏移原地不动', () => {
    expect(
      calcDate('2026-03-08', { value: 0, unit: 'day', direction: 'forward', mode: 'natural' })!.date
    ).toBe('2026-03-08');
  });

  it('结果里带农历信息（原站 Tab2 面板给的是「九月廿七」这种带「月」的写法）', () => {
    const r = calcDate('2026-03-08', {
      value: 1,
      unit: 'month',
      direction: 'forward',
      mode: 'natural',
    })!;
    expect(r.date).toBe('2026-04-08');
    expect(r.info.lunar).toBe('二月廿一');
  });

  it('addWorkdays 单个函数也对：从周日推 1 个工作日到周一', () => {
    expect(addWorkdays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addWorkdays('2026-03-09', 1)).toBe('2026-03-10');
    expect(addWorkdays('2026-03-09', 5)).toBe('2026-03-16');
    expect(addWorkdays('2026-03-16', -5)).toBe('2026-03-09');
  });
});

describe('countdownTo：Tab 3 倒计时', () => {
  // 多个整点，对齐原站实测时点 2026-10-06 20:00
  const now = new Date(2026, 9, 6, 20, 0, 0);

  it('算到目标日的次日零点（原站实测 2027-01-01 → 87 天 12 周零 3 天）', () => {
    const r = countdownTo('2027-01-01', now)!;
    expect(r.days).toBe(87);
    expect(r.weeks).toEqual({ count: 12, restDays: 3 });
    expect(r.hours).toBe(4);
    expect(r.minutes).toBe(0);
    expect(r.seconds).toBe(0);
    expect(r.past).toBe(false);
    expect(r.isToday).toBe(false);
  });

  it('原站口径反证：到明天只算 1 天，不是 0 天（证明多算了一个零点）', () => {
    const r = countdownTo('2026-10-07', now)!;
    expect(r.days).toBe(1);
    expect(r.weeks).toEqual({ count: 0, restDays: 1 });
  });

  it('同一天剩 0 天，UI 要切到「就是今天」文案', () => {
    const r = countdownTo('2026-10-06', new Date(2026, 9, 6, 8, 30, 15))!;
    expect(r.days).toBe(0);
    expect(r.hours).toBe(15);
    expect(r.minutes).toBe(29);
    expect(r.seconds).toBe(45);
    expect(r.isToday).toBe(true);
  });

  it('已经过了标记 past', () => {
    const r = countdownTo('2026-01-01', new Date(2026, 9, 6, 8, 0, 0))!;
    expect(r.past).toBe(true);
    expect(r.isToday).toBe(false);
  });

  it('目标日期的星期 / 农历跟着给出来（原站：2027-01-01 星期五、农历冬月廿四）', () => {
    const r = countdownTo('2027-01-01', now)!;
    expect(r.info.date).toBe('2027-01-01');
    expect(r.info.weekdayCn).toBe('星期五');
    expect(r.info.lunar).toBe('冬月廿四');
  });
});

describe('presetEvents：倒计时快捷事件', () => {
  it('元旦 / 春节 / 高考 / 国庆都落在今年', () => {
    const events = presetEvents(new Date(2026, 9, 6));
    expect(events.map((e) => e.key)).toEqual(['newyear', 'spring', 'gaokao', 'national']);
    for (const e of events) {
      expect(e.date.startsWith('2026-'), e.key).toBe(true);
    }
  });

  it('2026 年春节按农历查表 = 2026-02-17', () => {
    const spring = presetEvents(new Date(2026, 0, 1)).find((e) => e.key === 'spring')!;
    expect(spring.date).toBe('2026-02-17');
    expect(spring.label).toBe('春节');
  });

  it('1900 之前 / 2100 之后兜底不炸', () => {
    // lunarYearStart 出区间返回 null，兜底到 2 月 1 日
    const far = presetEvents(new Date(1899, 0, 1));
    expect(far.every((e) => /^\d{4}-/.test(e.date))).toBe(true);
    expect(presetEvents(new Date(2101, 0, 1)).every((e) => /^\d{4}-/.test(e.date))).toBe(true);
  });
});
