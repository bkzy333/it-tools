/**
 * 渐进式延迟法定退休年龄的计算。
 *
 * 政策依据：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》，
 * 自 2025 年 1 月 1 日起施行，用 15 年时间完成过渡。
 *
 * 三类人、三套节奏：
 *   男职工              60 → 63 岁，每 4 个月延迟 1 个月
 *   原 55 岁女职工（管理岗/干部）  55 → 58 岁，每 4 个月延迟 1 个月
 *   原 50 岁女职工（非管理岗/工人）50 → 55 岁，每 2 个月延迟 1 个月
 *
 * 关键公式（人社部政策问答里的官方口径，不是我们自己推的）：
 *   延迟月数 = 从 2025 年 1 月到「原法定退休年月」的**含两端月数** ÷ 节奏，**有小数直接进一位**（向上取整）。
 *   再按上限截断（男/女55 最多 36 个月，女50 最多 60 个月）。
 *
 * 已用官方公布的 4 个样例反证过（见 retirement.service.test.ts 的思路，此处留注释）：
 *   1976-01 男      → 2036-01 起算，133 个月 ÷ 4 = 33.25 → 延迟 34 → 2038-11 ✓
 *   1976-01 女(55)  → 2031-01 起算， 73 个月 ÷ 4 = 18.25 → 延迟 19 → 2032-08 ✓
 *   1976-01 女(50)  → 2026-01 起算， 13 个月 ÷ 2 =  6.5  → 延迟  7 → 2026-08 ✓
 *   1965-05 男      → 2025-05 起算，  5 个月 ÷ 4 =  1.25 → 延迟  2 → 2025-07 ✓
 */

export type WorkerType = 'male' | 'female-manager' | 'female-worker';

interface ReformRule {
  /** 改革前的法定退休年龄（周岁） */
  originalAge: number;
  /** 每多少个月出生时间延迟 1 个月 */
  step: number;
  /** 延迟上限（月） */
  maxDelay: number;
}

export const REFORM_RULES: Record<WorkerType, ReformRule> = {
  male: { originalAge: 60, step: 4, maxDelay: 36 },
  'female-manager': { originalAge: 55, step: 4, maxDelay: 36 },
  'female-worker': { originalAge: 50, step: 2, maxDelay: 60 },
};

/** 改革起算月：2025 年 1 月。用「年 × 12 + 月」当线性月序号，比较时不用管闰年 */
const REFORM_START_INDEX = 2025 * 12 + 1;

/** 弹性退休的幅度上限：提前最多 3 年、延迟最多 3 年 */
export const FLEXIBLE_MONTHS = 36;

const toIndex = (year: number, month: number) => year * 12 + month;
const fromIndex = (index: number) => {
  const zeroBased = index - 1;
  return { year: Math.floor(zeroBased / 12), month: (zeroBased % 12) + 1 };
};

export interface RetirementResult {
  /** 改革后的法定退休年龄，按月表示（方便表达「60 岁 2 个月」） */
  retireAgeMonths: number;
  /** 改革后法定退休年月 */
  retireYear: number;
  retireMonth: number;
  /** 比改革前推迟了几个月 */
  delayMonths: number;
  /** 改革前的法定退休年龄（周岁） */
  originalAge: number;
  /** 弹性提前退休最早可选的年龄（月） */
  earliestFlexibleMonths: number;
  /** 弹性延迟退休最晚可选的年龄（月） */
  latestFlexibleMonths: number;
  /** 按月领取基本养老金的最低缴费年限（年，可能是 15.5 这种半年） */
  minContributionYears: number;
}

export function computeRetirement(birthYear: number, birthMonth: number, type: WorkerType): RetirementResult {
  const rule = REFORM_RULES[type];
  const birthIndex = toIndex(birthYear, birthMonth);
  const originalRetireIndex = birthIndex + rule.originalAge * 12;

  // 含两端月数：2025-01 到原退休年月之间一共跨了几个月（含首尾）
  const spanMonths = originalRetireIndex - REFORM_START_INDEX + 1;
  const rawDelay = spanMonths <= 0 ? 0 : Math.ceil(spanMonths / rule.step);
  const delayMonths = Math.min(Math.max(rawDelay, 0), rule.maxDelay);

  const retireIndex = originalRetireIndex + delayMonths;
  const { year: retireYear, month: retireMonth } = fromIndex(retireIndex);
  const retireAgeMonths = rule.originalAge * 12 + delayMonths;

  return {
    retireAgeMonths,
    retireYear,
    retireMonth,
    delayMonths,
    originalAge: rule.originalAge,
    // 弹性提前：最多 3 年，但不能早于改革前的法定退休年龄
    earliestFlexibleMonths: Math.max(rule.originalAge * 12, retireAgeMonths - FLEXIBLE_MONTHS),
    // 弹性延迟：最多 3 年，且需要与单位协商一致
    latestFlexibleMonths: retireAgeMonths + FLEXIBLE_MONTHS,
    minContributionYears: getMinContributionYears(retireYear),
  };
}

/**
 * 按月领取基本养老金的最低缴费年限。
 *
 * 2030 年 1 月 1 日起由 15 年逐步提高到 20 年，每年提高 6 个月：
 * 2029 年及以前退休 → 15 年；2030 年 → 15.5 年；……；2039 年 → 20 年；2040 年起 → 20 年。
 */
export function getMinContributionYears(retireYear: number): number {
  if (retireYear <= 2029) {
    return 15;
  }
  if (retireYear >= 2039) {
    return 20;
  }
  return 15 + (retireYear - 2029) * 0.5;
}

/** 把「72 个月」这种表达拆成 { years, months }，方便拼「6 岁 0 个月」 */
export function splitAgeMonths(totalMonths: number): { years: number; months: number } {
  return { years: Math.floor(totalMonths / 12), months: totalMonths % 12 };
}
