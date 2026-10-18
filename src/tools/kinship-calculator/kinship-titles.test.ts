import { describe, expect, it } from 'vitest';

import { KINSHIP_TITLES, suggestKinshipTitles } from './kinship-titles';
import relationship from './relationship';

/**
 * 候选表的两条硬契约（改表必跑，红了就说明加了死候选）：
 *   - 无重复
 *   - 每一条都能被 relationship 反查吃下去 —— 否则用户点了候选，结果区却显示
 *     「这个关系太复杂，暂时算不出来」，那就是「点了没反应」的体验。
 */
describe('KINSHIP_TITLES 契约', () => {
  it('无重复条目', () => {
    expect(KINSHIP_TITLES.length).toBe(new Set(KINSHIP_TITLES).size);
  });

  it('规模在合理区间（人工收敛，不是全量灌库）', () => {
    expect(KINSHIP_TITLES.length).toBeGreaterThan(150);
    expect(KINSHIP_TITLES.length).toBeLessThan(500);
  });

  // 216 条 × 约 40ms（库的反查是遍历三万多条映射，单次不便宜），默认 5s 超时不够，
  // 这里给足 60s。是整个套件里最慢的一条，但它守的是「点了候选不能空手」这条底线。
  it(
    '每一条都能被库反查出结果',
    () => {
      const dead = KINSHIP_TITLES.filter((title) => {
        try {
          return (relationship({ text: title, sex: -1, reverse: true }) ?? []).length === 0;
        } catch {
          return true;
        }
      });

      expect(dead).toEqual([]);
    },
    60_000,
  );
});

describe('suggestKinshipTitles', () => {
  it('输入「舅」能给出舅舅、舅父、舅母这类候选', () => {
    const { items, total } = suggestKinshipTitles('舅');

    expect(total).toBeGreaterThan(5);
    expect(items).toContain('舅舅');
    expect(items).toContain('舅父');
    expect(items).toContain('舅母');
    expect(items).toContain('舅妈');
  });

  it('以输入开头的排在「仅包含」前面', () => {
    const { items } = suggestKinshipTitles('舅', 50);
    const prefixCount = items.filter((title) => title.startsWith('舅')).length;

    // 前 prefixCount 条必须全是以「舅」开头，之后才是「大舅」「堂舅」这类包含匹配
    expect(items.slice(0, prefixCount).every((title) => title.startsWith('舅'))).toBe(true);
    expect(items[prefixCount]).not.toMatch(/^舅/);
  });

  it('同层候选里常用称呼打头（打「舅」先给舅舅，不是舅爷爷）', () => {
    expect(suggestKinshipTitles('舅', 50).items.slice(0, 4)).toEqual(['舅舅', '舅父', '舅母', '舅妈']);
    expect(suggestKinshipTitles('姑', 50).items.slice(0, 3)).toEqual(['姑姑', '姑妈', '姑母']);
    expect(suggestKinshipTitles('孙', 50).items.slice(0, 2)).toEqual(['孙子', '孙女']);
  });

  it('与输入完全相同的条目置顶', () => {
    const { items } = suggestKinshipTitles('舅舅', 5);

    expect(items[0]).toBe('舅舅');
  });

  it('limit 截断候选但 total 仍是命中总数', () => {
    const full = suggestKinshipTitles('舅', 100);
    const capped = suggestKinshipTitles('舅', 3);

    expect(capped.items).toHaveLength(3);
    expect(capped.total).toBe(full.total);
    expect(capped.items).toEqual(full.items.slice(0, 3));
  });

  it('空输入 / 纯空格不给候选', () => {
    expect(suggestKinshipTitles('')).toEqual({ items: [], total: 0 });
    expect(suggestKinshipTitles('   ')).toEqual({ items: [], total: 0 });
  });

  it('忽略首尾空格', () => {
    expect(suggestKinshipTitles('  舅 ').total).toBe(suggestKinshipTitles('舅').total);
  });

  it('查不到的字返回空而不是报错', () => {
    expect(suggestKinshipTitles('龘')).toEqual({ items: [], total: 0 });
  });

  it('「姑」能带上姑父、姑妈这些同族说法', () => {
    const { items } = suggestKinshipTitles('姑', 50);

    expect(items).toContain('姑姑');
    expect(items).toContain('姑妈');
    expect(items).toContain('姑父');
    // 前缀匹配优先，「大姑子」这种要排在后面
    expect(items.indexOf('姑姑')).toBeLessThan(items.indexOf('大姑子'));
  });
});
