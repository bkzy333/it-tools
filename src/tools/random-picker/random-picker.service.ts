/**
 * 随机与抽样：不重复抽签 / 随机排序 / 加权抽样 / 随机分摊尾差配平
 *
 * 全部只依赖注入的 rand（默认 Math.random），方便单测把随机钉死。
 * 不碰 DOM、不联网、不依赖 Excel。
 */

export type Rand = () => number;

export const defaultRand: Rand = Math.random;

/** Fisher-Yates 洗牌：返回新数组，不改动入参 */
export function shuffle<T>(items: readonly T[], rand: Rand = defaultRand): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

/**
 * 不重复抽签：从候选里抽 count 个（每个最多中一次）。
 * 候选不足 count 时返回全部候选（不补、不报错），调用方自行提示。
 */
export function pickUnique<T>(items: readonly T[], count: number, rand: Rand = defaultRand): T[] {
  if (count <= 0) return [];
  return shuffle(items, rand).slice(0, Math.min(count, items.length));
}

export interface WeightedItem<T> {
  value: T;
  /** 权重，<=0 的项永远抽不到 */
  weight: number;
}

/** 按权重随机抽 n 项 */
export function pickWeighted<T>(
  items: readonly WeightedItem<T>[],
  n: number,
  unique = true,
  rand: Rand = defaultRand,
): T[] {
  const pool = items.filter((it) => Number.isFinite(it.weight) && it.weight > 0);
  if (n <= 0 || pool.length === 0) return [];

  const turned = pool.map((it) => ({ value: it.value, weight: it.weight }));
  const want = Math.min(n, unique ? turned.length : n);

  if (unique) {
    // 加权无放回（Efraimidis-Spirakis）：key = u^(1/w)，取 key 最大的前 n 个。
    // ⚠️ 不能用「先 shuffle 再取前 n」——那样权重完全失效，退化成等概率抽样。
    return turned
      .map((it) => ({ value: it.value, key: Math.pow(Math.max(rand(), Number.EPSILON), 1 / it.weight) }))
      .sort((a, b) => b.key - a.key)
      .slice(0, want)
      .map((x) => x.value);
  }

  // 加权有放回：每次在当前袋子里按权重轮盘赌，抽空了重新装袋（否则抽不出重复项）
  const out: T[] = [];
  let bag = turned.slice();
  for (let k = 0; k < want; k++) {
    if (bag.length === 0) bag = turned.slice();
    const total = bag.reduce((s, it) => s + it.weight, 0);
    let r = rand() * total;
    let idx = bag.length - 1;
    for (let i = 0; i < bag.length; i++) {
      r -= bag[i].weight;
      if (r <= 0) {
        idx = i;
        break;
      }
    }
    out.push(bag[idx].value);
    bag.splice(idx, 1);
  }
  return out;
}

/**
 * 随机分摊（尾差配平）：按权重把 amount 拆成若干份，
 * 每份保留 decimals 位小数，且**加总严格等于 amount**（差额随机补给若干份）。
 *
 * 例：100 元按 1:1:1 分给 3 人、保留 2 位 → 33.33 / 33.33 / 33.34。
 * ⚠️ 全程在「最小单位整数」上运算（分、厘），最后再除回去，
 *    不能先各自四舍五入再凑总数，那样尾差必然对不上。
 */
export function splitEvenly(
  weights: readonly number[],
  amount: number,
  decimals = 2,
  rand: Rand = defaultRand,
): number[] {
  if (weights.length === 0) return [];
  const digits = Math.max(0, Math.min(6, Math.floor(decimals)));
  const scale = 10 ** digits;

  // 输入 amounts 可能是浮点（0.1+0.2 这类），先折算到最小单位
  const targetUnits = Math.round(amount * scale);
  const ws = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const totalW = ws.reduce((s, w) => s + w, 0);

  // 权重全为 0 / 全非正 → 按人头平均
  const eff = totalW > 0 ? ws : ws.map(() => 1);

  const raw = eff.map((w) => (totalW > 0 ? (w / totalW) * targetUnits : targetUnits / eff.length));
  const base = raw.map((v) => Math.floor(v));
  let remain = targetUnits - base.reduce((s, v) => s + v, 0);

  // remain 个最小单位随机补给不同下标（等于 remain，或剩余份数不够时给前 remain 个）
  const order = shuffle(
    base.map((_, i) => i),
    rand,
  );
  const k = Math.min(Math.abs(Math.trunc(remain)), base.length);
  const sign = remain < 0 ? -1 : 1;
  for (let i = 0; i < k; i++) base[order[i]] += sign;
  remain -= sign * k;
  // 理论上上面已经配平；万一跨度极大（权重悬殊到 base 有 0），把残余继续随机补
  if (remain !== 0) {
    for (let i = 0; remain !== 0 && i < base.length * 4; i++) {
      const j = Math.floor(rand() * base.length);
      if (base[j] + sign >= 0) {
        base[j] += sign;
        remain -= sign;
      }
    }
  }

  return base.map((v) => v / scale);
}

/** 校验分摊结果：各份加总是否严格等于原额 */
export function isSplitBalanced(parts: readonly number[], amount: number, decimals = 2): boolean {
  const scale = 10 ** Math.max(0, Math.min(6, Math.floor(decimals)));
  const sumUnits = parts.reduce((s, v) => s + Math.round(v * scale), 0);
  return sumUnits === Math.round(amount * scale);
}
