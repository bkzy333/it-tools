import { describe, expect, it } from 'vitest';
import { allEnglishDateFormats, formatEnglishDate, ordinalSuffix } from './english-date-format.service';

describe('ordinalSuffix', () => {
  it('1st/2nd/3rd/4th', () => {
    expect(ordinalSuffix(1)).toBe('st');
    expect(ordinalSuffix(2)).toBe('nd');
    expect(ordinalSuffix(3)).toBe('rd');
    expect(ordinalSuffix(4)).toBe('th');
    expect(ordinalSuffix(11)).toBe('th');
    expect(ordinalSuffix(12)).toBe('th');
    expect(ordinalSuffix(13)).toBe('th');
    expect(ordinalSuffix(21)).toBe('st');
    expect(ordinalSuffix(22)).toBe('nd');
  });
});

describe('formatEnglishDate', () => {
  const d = { year: 2022, month: 10, day: 24 };

  it('美式', () => {
    expect(formatEnglishDate(d, 'MMMM_D_YYYY')).toBe('October 24, 2022');
    expect(formatEnglishDate(d, 'MMMM_Do_YYYY')).toBe('October 24th, 2022');
    expect(formatEnglishDate(d, 'MMM_D_YYYY')).toBe('Oct. 24, 2022');
    expect(formatEnglishDate(d, 'MMM_Do_YYYY')).toBe('Oct. 24th, 2022');
  });

  it('英式', () => {
    expect(formatEnglishDate(d, 'D_MMMM_YYYY')).toBe('24, October, 2022');
    expect(formatEnglishDate(d, 'Do_MMMM_YYYY')).toBe('24th, October, 2022');
    expect(formatEnglishDate(d, 'D_MMM_YYYY')).toBe('24, Oct., 2022');
    expect(formatEnglishDate(d, 'Do_MMM_YYYY')).toBe('24th, Oct., 2022');
  });
});

describe('allEnglishDateFormats', () => {
  it('返回 8 种格式', () => {
    const r = allEnglishDateFormats('2022-10-24');
    expect(Object.keys(r)).toHaveLength(8);
    expect(r.MMMM_Do_YYYY).toBe('October 24th, 2022');
  });
});
