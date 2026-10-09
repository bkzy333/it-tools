import { describe, expect, it } from 'vitest';
import { lunarToSolar, solarToLunar } from './lunar-calendar.service';

describe('solarToLunar', () => {
  it('参考站示例：2020-10-23 → 九月初七', () => {
    const r = solarToLunar('2020-10-23');
    expect(r).not.toBeNull();
    expect(r!.lunarDateCn).toBe('九月初七');
    expect(r!.zodiac).toBe('鼠');
    expect(r!.ganzhiYear).toBe('庚子年');
    expect(r!.constellation).toBe('天秤座');
  });

  it('2026-01-01 农历年仍是乙巳（蛇）', () => {
    const r = solarToLunar('2026-01-01');
    expect(r!.ganzhiYear).toBe('乙巳年');
    expect(r!.zodiac).toBe('蛇');
  });
});

describe('lunarToSolar', () => {
  it('农历 2020 年九月初七 → 公历 2020-10-23', () => {
    expect(lunarToSolar(2020, 9, 7)).toBe('2020-10-23');
  });

  it('超出范围返回 null', () => {
    expect(lunarToSolar(1800, 1, 1)).toBeNull();
  });
});
