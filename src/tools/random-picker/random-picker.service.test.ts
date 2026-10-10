import { describe, expect, it } from 'vitest';
import {
  isSplitBalanced,
  pickUnique,
  pickWeighted,
  shuffle,
  splitEvenly,
} from './random-picker.service';

/** 固定种子的 LCG，把随机钉死，测的是逻辑不是运气 */
function lcg(seed = 42) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('shuffle', () => {
  it('不改动入参、长度与元素集合不变', () => {
    const src = [1, 2, 3, 4, 5];
    const copy = [...src];
    const out = shuffle(src, lcg(7));
    expect(src).toEqual(copy);
    expect(out).toHaveLength(5);
    // 必须给比较器：默认 sort 是字典序，元素一旦超过个位数（10+）就会排错
    expect([...out].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('空数组与单元素不炸', () => {
    expect(shuffle([], lcg())).toEqual([]);
    expect(shuffle(['a'], lcg())).toEqual(['a']);
  });
});

describe('pickUnique', () => {
  it('返回结果互不相同', () => {
    for (let seed = 0; seed < 20; seed++) {
      const out = pickUnique([1, 2, 3, 4, 5, 6, 7, 8], 3, lcg(seed));
      expect(out).toHaveLength(3);
      expect(new Set(out).size).toBe(3);
    }
  });

  it('抽取数超过候选时返回全部候选，不补空不报错（顺序随机）', () => {
    expect([...pickUnique(['a', 'b'], 5, lcg(1))].sort()).toEqual(['a', 'b']);
  });

  it('count<=0 返回空数组', () => {
    expect(pickUnique(['a', 'b'], 0, lcg(1))).toEqual([]);
    expect(pickUnique(['a', 'b'], -3, lcg(1))).toEqual([]);
  });

  it('空候选返回空数组', () => {
    expect(pickUnique([], 3, lcg(1))).toEqual([]);
  });
});

describe('pickWeighted', () => {
  const pool = [
    { value: 'A', weight: 9 },
    { value: 'B', weight: 1 },
  ];

  it('可重复模式下可能抽到重复项', () => {
    const seen = new Set<string>();
    let dup = false;
    for (let seed = 0; seed < 40; seed++) {
      const out = pickWeighted(pool, 8, false, lcg(seed));
      out.forEach((v) => seen.add(v));
      if (out.length !== new Set(out).size) dup = true;
    }
    expect(seen.has('A')).toBe(true);
    expect(dup).toBe(true);
  });

  it('unique 模式下不重复，且受候选数上限约束', () => {
    for (let seed = 0; seed < 20; seed++) {
      const out = pickWeighted(pool, 5, true, lcg(seed));
      expect(out.length).toBeLessThanOrEqual(2);
      expect(new Set(out).size).toBe(out.length);
    }
  });

  it('权重非正的项永远抽不到', () => {
    const out = pickWeighted(
      [
        { value: 'x', weight: 0 },
        { value: 'y', weight: -5 },
        { value: 'z', weight: 1 },
      ],
      5,
      true,
      lcg(3),
    );
    expect(new Set(out)).toEqual(new Set(['z']));
  });

  it('权重全非正 / n<=0 / 空池 返回空数组', () => {
    const none = [
      { value: 'x', weight: 0 },
      { value: 'y', weight: -1 },
    ];
    expect(pickWeighted(none, 3, true, lcg())).toEqual([]);
    expect(pickWeighted(pool, 0, true, lcg())).toEqual([]);
    expect(pickWeighted([], 3, true, lcg())).toEqual([]);
  });

  it('倾斜度可观测：A 的权重远高于 B，多次抽样 A 明显更多（不依赖真随机）', () => {
    const big = [
      { value: 'A', weight: 1000 },
      { value: 'B', weight: 1 },
    ];
    const rand = lcg(99);
    let a = 0;
    for (let i = 0; i < 200; i++) {
      if (pickWeighted(big, 1, true, rand)[0] === 'A') a++;
    }
    expect(a).toBeGreaterThan(190);
  });
});

describe('splitEvenly 随机分摊（尾差配平）', () => {
  it('100 元 1:1:1 分 3 份，保留 2 位 → 总数为 100 且含 34 尾差', () => {
    for (let seed = 0; seed < 30; seed++) {
      const parts = splitEvenly([1, 1, 1], 100, 2, lcg(seed));
      expect(parts).toHaveLength(3);
      expect(parts.reduce((s, v) => s + v, 0).toFixed(2)).toBe('100.00');
      expect(parts.some((v) => v.toFixed(2).endsWith('.34'))).toBe(true);
    }
  });

  it('任意权重 × 任意小数位 × 200 个随机种子，加总恒等于原额', () => {
    const cases: Array<[number[], number, number]> = [
      [[1, 1, 1], 100, 2],
      [[3, 1], 0.07, 2],
      [[1, 999999], 123.45, 2],
      [[5, 5, 5, 5, 5, 5], 1, 3],
      [[1, 0, 0], 88.88, 2],
      [[7], 33.3, 1],
      [[2, 3, 5, 7, 11], 99999.99, 2],
    ];
    for (const [weights, amount, decimals] of cases) {
      for (let seed = 0; seed < 200; seed++) {
        const parts = splitEvenly(weights, amount, decimals, lcg(seed));
        expect(isSplitBalanced(parts, amount, decimals)).toBe(true);
      }
    }
  });

  it('权重全为 0 时按人头平均', () => {
    const parts = splitEvenly([0, 0, 0], 10, 2, lcg(1));
    expect(parts.reduce((s, v) => s + v, 0).toFixed(2)).toBe('10.00');
    expect(parts.every((v) => v > 0)).toBe(true);
  });

  it('负权重与非数字权重按 0 处理，仍配平', () => {
    const parts = splitEvenly([1, -2, Number.NaN], 50, 2, lcg(2));
    expect(parts).toHaveLength(3);
    expect(isSplitBalanced(parts, 50, 2)).toBe(true);
  });

  it('权重悬殊到某份被 floor 成 0 时，尾差不会把它压成负数', () => {
    for (let seed = 0; seed < 50; seed++) {
      const parts = splitEvenly([1, 1, 1000000], 0.03, 2, lcg(seed));
      expect(parts.every((v) => v >= 0)).toBe(true);
      expect(isSplitBalanced(parts, 0.03, 2)).toBe(true);
    }
  });

  it('exponents 很大时仍配平（decimal=0 走整数）', () => {
    const parts = splitEvenly([1, 2], 100000, 0, lcg(5));
    expect(parts.reduce((s, v) => s + v, 0)).toBe(100000);
  });

  it('空权重返回空数组', () => {
    expect(splitEvenly([], 100, 2, lcg())).toEqual([]);
  });

  it('decimals 为负被夹到 0（最小单位 = 1，尾差只能补给某一份 1）', () => {
    const parts = splitEvenly([1, 1], 1, -3, lcg(3));
    expect(parts).toHaveLength(2);
    expect(parts.reduce((s, v) => s + v, 0)).toBe(1);
    expect(parts.filter((v) => v === 1)).toHaveLength(1);
  });

  it('decimals 超大被夹到 6', () => {
    expect(splitEvenly([1, 1], 1, 99, lcg()).length).toBe(2);
    expect(splitEvenly([1, 1], 1, 99, lcg()).every((v) => v * 1e6 > 0)).toBe(true);
  });
});

describe('isSplitBalanced', () => {
  it('浮点误差不算失衡（0.1+0.2 vs 0.3 在 2 位小数下成立）', () => {
    expect(isSplitBalanced([0.1, 0.2], 0.3, 2)).toBe(true);
  });
});
