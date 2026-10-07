import { expect, describe, it } from 'vitest';
import {
  calcAgeBreakdown,
  calcAgeResult,
  calcExtras,
  calcNominalAge,
  buildCopyText,
  getChineseZodiac,
  getConstellation,
  getFutureBirthdays,
  getGeneration,
  getMilestones,
  getNextBirthday,
  parseBirthDate,
} from './age-calculator.service';

/**
 * 用例直接对应 `_recon/age-calculator/BEHAVIOR.md` 第 10 节的验收对照表。
 * 所有测试都显式传 `now`，不依赖真实时钟 —— 否则倒计时类断言会在某天突然挂掉。
 */
const at = (iso: string) => new Date(iso);

describe('age-calculator / 周岁拆解', () => {
  it('恰好满整年：36 岁 0 个月 0 天', () => {
    const birth = at('1990-06-15T00:00:00');
    const now = at('2026-06-15T00:00:00');
    expect(calcAgeBreakdown(birth, now)).toMatchObject({ years: 36, months: 0, days: 0 });
  });

  it('差一天满整年：35 岁 11 个月 30 天（不是 31 天）', () => {
    // 整月循环停在 2026-05-15，再数到 06-14 是 30 天（5/15→5/31 共 16 天 + 6/1→6/14 共 14 天）
    const birth = at('1990-06-15T00:00:00');
    const now = at('2026-06-14T00:00:00');
    expect(calcAgeBreakdown(birth, now)).toMatchObject({ years: 35, months: 11, days: 30 });
  });

  it('总天数 / 总秒数按毫秒差整除', () => {
    const birth = at('2020-01-01T00:00:00');
    const now = new Date(birth.getTime() + 1000 * 86_400_000);
    const r = calcAgeBreakdown(birth, now);
    expect(r?.totalDays).toBe(1000);
    expect(r?.totalSeconds).toBe(86_400_000);
    expect(r?.totalMinutes).toBe(1_440_000);
    expect(r?.totalHours).toBe(24_000);
  });

  it('出生晚于当前时间返回 null', () => {
    expect(calcAgeBreakdown(at('2030-01-01T00:00:00'), at('2026-10-07T00:00:00'))).toBeNull();
  });
});

describe('age-calculator / 虚岁', () => {
  it('虚岁 = 当前年份 − 出生年份 + 1', () => {
    expect(calcNominalAge(at('1990-06-15T00:00:00'), at('2026-10-07T00:00:00'))).toBe(37);
  });
});

describe('age-calculator / 星座', () => {
  it('普通条目走 AND 分支', () => {
    expect(getConstellation(6, 15)).toBe('双子座');
    expect(getConstellation(7, 1)).toBe('巨蟹座');
    expect(getConstellation(1, 20)).toBe('水瓶座');
  });

  it('摩羯座跨年，走 OR 分支', () => {
    expect(getConstellation(1, 15)).toBe('摩羯座');
    expect(getConstellation(1, 19)).toBe('摩羯座');
    expect(getConstellation(12, 25)).toBe('摩羯座');
    // 1-20 起交给水瓶座，不能被摩羯的 OR 分支吃掉
    expect(getConstellation(1, 20)).toBe('水瓶座');
  });
});

describe('age-calculator / 生肖与世代', () => {
  it('生肖按年份 % 12 取', () => {
    expect(getChineseZodiac(1990)).toBe('马');
    expect(getChineseZodiac(1997)).toBe('牛');
    expect(getChineseZodiac(2024)).toBe('龙');
    expect(getChineseZodiac(2026)).toBe('马');
  });

  it('世代按区间取', () => {
    expect(getGeneration(1997)).toBe('Z 世代');
    expect(getGeneration(1985)).toBe('千禧一代');
    // 2026 落在 Alpha 世代（2013–2025）之外 → 参考站这里就是「未知」，不是我们漏了
    expect(getGeneration(2026)).toBe('未知');
  });
});

describe('age-calculator / 下一个生日', () => {
  it('今年生日还没到 → 取今年', () => {
    const next = getNextBirthday(at('1990-12-25T00:00:00'), at('2026-10-07T00:00:00'));
    expect(next?.date).toBe('2026-12-25');
  });

  it('今年生日已过 → 取明年', () => {
    const next = getNextBirthday(at('1990-01-05T00:00:00'), at('2026-10-07T00:00:00'));
    expect(next?.date).toBe('2027-01-05');
  });

  it('2 月 29 日出生：非闰年滚到 3 月 1 日（与 JS 语义、参考站一致）', () => {
    const next = getNextBirthday(at('2000-02-29T00:00:00'), at('2026-10-07T00:00:00'));
    expect(next?.date).toBe('2027-03-01');
  });

  it('生日「同刻」算已过 → 取明年（参考站用的是 t <= now，不是 t < now）', () => {
    // 只在 now 恰好等于生日那一瞬间触发，窗口 1 秒，保持与参考站一致
    const next = getNextBirthday(at('1990-01-01T00:00:00'), at('2026-01-01T00:00:00'));
    expect(next?.date).toBe('2027-01-01');
    expect(next?.days).toBe(365);
  });

  it('倒计时拆分到天/时/分/秒', () => {
    // 2026-01-01T00:00:00 → 2026-01-02T03:04:05 还差 1 天 3 小时 4 分 5 秒
    const next = getNextBirthday(at('1990-01-02T03:04:05'), at('2026-01-01T00:00:00'));
    expect(next).toMatchObject({ date: '2026-01-02', days: 1, hours: 3, minutes: 4, seconds: 5 });
  });
});

describe('age-calculator / 未来生日（⚠ 与参考站刻意不同）', () => {
  /**
   * 参考站源码：`for (s = 1..5) year = now.getFullYear() + s`，从**明年**起列。
   * 那样 1990-12-25 出生的人在 2026-10-07 会看到列表首条 = 2027-12-25，
   * 而上方倒计时说下一次生日是 2026-12-25 —— 今年这次被跳过。
   * 我们改成从「下一个生日所在年份」起，两个区块才自洽。别改回参考站口径。
   */
  it('今年生日未到 → 列表首条就是今年这次', () => {
    const list = getFutureBirthdays(at('1990-12-25T00:00:00'), at('2026-10-07T00:00:00'));
    expect(list).toHaveLength(5);
    expect(list[0]).toEqual({ year: 2026, date: '2026-12-25', ageTurning: 36 });
    expect(list[4]).toEqual({ year: 2030, date: '2030-12-25', ageTurning: 40 });
  });

  it('今年生日已过 → 从明年起列', () => {
    const list = getFutureBirthdays(at('1990-01-05T00:00:00'), at('2026-10-07T00:00:00'));
    expect(list[0]).toEqual({ year: 2027, date: '2027-01-05', ageTurning: 37 });
  });

  it('出生晚于当前时间 → 空列表', () => {
    expect(getFutureBirthdays(at('2030-01-01T00:00:00'), at('2026-10-07T00:00:00'))).toEqual([]);
  });
});

describe('age-calculator / 重要年龄节点', () => {
  it('只取还没达成的前 5 个', () => {
    const birth = at('1990-06-15T00:00:00');
    const age = calcAgeBreakdown(birth, at('2026-10-07T00:00:00'));
    const list = getMilestones(birth, age);
    expect(list.map((m) => m.age)).toEqual([40, 50, 60, 70, 80]);
    expect(list[0].date).toBe('2030-06-15');
  });

  it('全部达成 → 空数组（UI 显示「已达成全部预设节点」）', () => {
    const birth = at('1900-06-15T00:00:00');
    const age = calcAgeBreakdown(birth, at('2026-10-07T00:00:00'));
    expect(getMilestones(birth, age)).toEqual([]);
  });
});

describe('age-calculator / 附加信息与生命进度', () => {
  const birth = at('1990-06-15T08:30:00');
  const now = at('2026-06-15T08:30:00');
  const age = calcAgeBreakdown(birth, now)!;

  it('出生星期 / 出生石 / 半生日', () => {
    const e = calcExtras(birth, now, 80, age)!;
    expect(e.birthWeekday).toBe('星期五'); // 1990-06-15
    expect(e.birthstone).toBe('珍珠'); // 6 月
    expect(e.halfBirthday).toBe('1990-12-15');
  });

  it('趣味数据按分钟 / 天数换算', () => {
    const e = calcExtras(birth, now, 80, age)!;
    expect(e.heartbeats).toBe(72 * age.totalMinutes);
    expect(e.breaths).toBe(16 * age.totalMinutes);
    expect(e.sleepHours).toBe(8 * age.totalDays);
  });

  it('生命进度按 365.25 天/年 折算，80 岁预期下 36 岁约 45%', () => {
    const e = calcExtras(birth, now, 80, age)!;
    expect(e.lifeProgress).toBeCloseTo(45, 0);
  });

  it('生命进度上限 100（活过预期寿命不会超 100%）', () => {
    const old = at('1900-01-01T00:00:00');
    const oldAge = calcAgeBreakdown(old, at('2026-01-01T00:00:00'))!;
    const e = calcExtras(old, at('2026-01-01T00:00:00'), 80, oldAge)!;
    expect(e.lifeProgress).toBe(100);
  });
});

describe('age-calculator / 汇总与边界', () => {
  it('出生日期为空 → 全空结果（UI 显示「请选择出生日期以查看计算结果」）', () => {
    const r = calcAgeResult('', '00:00', at('2026-10-07T00:00:00'));
    expect(r.age).toBeNull();
    expect(r.constellation).toBeNull();
    expect(r.nextBirthday).toBeNull();
    expect(r.futureBirthdays).toEqual([]);
  });

  it('出生日期晚于当前时间 → age 为 null（UI 报「出生日期不能晚于当前时间」）', () => {
    const r = calcAgeResult('2030-01-01', '00:00', at('2026-10-07T00:00:00'));
    expect(r.age).toBeNull();
    expect(r.constellation).toBe('摩羯座'); // 星座/生肖只看出生日，不受未来日期影响
    expect(r.extras).toBeNull();
  });

  it('不填出生时间 → 按 00:00 解析', () => {
    expect(parseBirthDate('1990-06-15', '')).toEqual(at('1990-06-15T00:00:00'));
    expect(parseBirthDate('1990-06-15')).toEqual(at('1990-06-15T00:00:00'));
    expect(parseBirthDate('不是日期')).toBeNull();
  });

  it('一条龙：1990-06-15 在 2026-10-07 的完整结果', () => {
    const r = calcAgeResult('1990-06-15', '08:30', at('2026-10-07T12:00:00'));
    expect(r.constellation).toBe('双子座');
    expect(r.zodiac).toBe('马');
    expect(r.nominalAge).toBe(37);
    expect(r.nextBirthday?.date).toBe('2027-06-15');
  });
});

describe('age-calculator / 复制文案', () => {
  it('格式与参考站逐字一致', () => {
    const birth = at('1990-06-15T08:30:00');
    const now = at('2026-10-07T12:00:00');
    const age = calcAgeBreakdown(birth, now)!;
    const text = buildCopyText({
      birthDate: '1990-06-15',
      birthTime: '08:30',
      age,
      nominalAge: 37,
      constellation: '双子座',
      zodiac: '马',
      nextBirthday: getNextBirthday(birth, now),
    });

    expect(text).toContain('出生日期：1990-06-15 08:30，周岁：36 岁 3 个月 22 天，虚岁：37 岁。星座：双子座，生肖：马。');
    expect(text).toContain('已生活 ');
    expect(text).toContain('下一个生日还有 ');
  });

  it('没有下一个生日时只输出前半段', () => {
    const text = buildCopyText({
      birthDate: '1990-06-15',
      birthTime: '08:30',
      age: { years: 36, months: 0, days: 0, totalSeconds: 0, totalMinutes: 0, totalHours: 0, totalDays: 0 },
      nominalAge: 37,
      constellation: '双子座',
      zodiac: '马',
      nextBirthday: null,
    });
    expect(text.endsWith('。')).toBe(true);
    expect(text).not.toContain('下一个生日还有');
  });
});
