import { describe, expect, it } from 'vitest';
import { dateStringToUppercase, dateToUppercase } from './date-uppercase.service';

describe('dateToUppercase', () => {
  it('参考站示例：2026-10-09 → 贰零贰陆年零壹拾月零玖日', () => {
    const r = dateToUppercase(2026, 10, 9);
    expect(r.full).toBe('贰零贰陆年零壹拾月零玖日');
  });

  it('1 月 1 日加零', () => {
    const r = dateToUppercase(2023, 1, 1);
    expect(r.full).toBe('贰零贰叁年零壹月零壹日');
  });

  it('11 月、12 月', () => {
    expect(dateToUppercase(2024, 11, 15).month).toBe('壹拾壹月');
    expect(dateToUppercase(2024, 12, 15).month).toBe('壹拾贰月');
  });

  it('20 日、30 日、31 日', () => {
    expect(dateToUppercase(2024, 1, 20).day).toBe('零贰拾日');
    expect(dateToUppercase(2024, 1, 30).day).toBe('零叁拾日');
    expect(dateToUppercase(2024, 1, 31).day).toBe('叁拾壹日');
  });
});

describe('dateStringToUppercase', () => {
  it('支持 YYYY-MM-DD 与 YYYY/MM/DD', () => {
    expect(dateStringToUppercase('2026-10-09').full).toBe('贰零贰陆年零壹拾月零玖日');
    expect(dateStringToUppercase('2026/10/09').full).toBe('贰零贰陆年零壹拾月零玖日');
  });

  it('非法日期抛错', () => {
    expect(() => dateStringToUppercase('abc')).toThrow();
    expect(() => dateStringToUppercase('2026-13-01')).toThrow();
  });
});
