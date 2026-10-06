/**
 * 解除/终止劳动合同的经济补偿金计算。
 *
 * 法条依据：
 *   《劳动合同法》第四十七条 —— 经济补偿按劳动者在本单位工作的年限，每满一年支付一个月工资；
 *     六个月以上不满一年的，按一年计算；不满六个月的，支付半个月工资。
 *     劳动者月工资高于用人单位所在直辖市、设区的市级人民政府公布的本地区上年度职工月平均
 *     工资三倍的，按职工月平均工资三倍的数额支付，且支付年限最高不超过十二年。
 *     月工资 = 劳动合同解除或者终止前十二个月的平均工资（不是某一个月，也不是基本工资）。
 *   《劳动合同法》第八十七条 —— 用人单位违法解除或终止的，按第四十七条标准的**二倍**支付赔偿金。
 *
 * 两个容易踩的坑（页面里也会提示）：
 *   1. 「十二年上限」只在月工资超过社平三倍时才适用。没超三倍的，按实际年限算，不受 12 年限制。
 *   2. 基数是「离职前 12 个月平均**应得**工资」，含奖金、津贴、加班费，不是到手工资。
 */

export interface SeveranceInput {
  /** 入职日期 YYYY-MM-DD */
  startDate: string;
  /** 离职日期 YYYY-MM-DD */
  endDate: string;
  /** 解除或终止前 12 个月的平均工资（元/月） */
  monthlyWage: number;
  /**
   * 用人单位所在地上年度职工月平均工资（元/月）。
   * 填了才会启用三倍封顶判断；不填就按实际工资算（适用于没超三倍的大多数情况）。
   */
  localAverageWage?: number | null;
}

export interface SeveranceResult {
  /** 在本单位的完整工作月数 */
  workMonths: number;
  workYears: number;
  workRemainderMonths: number;
  /** 经济补偿的月数 N（可能是 0.5 的倍数） */
  compensatedMonths: number;
  /** 计算基数（元/月），触发封顶时等于社平三倍 */
  baseWage: number;
  /** 是否触发三倍封顶 */
  capped: boolean;
  /** 是否因封顶而适用十二年上限 */
  yearsCapped: boolean;
  /** 封顶门槛：社平三倍 */
  tripleCap: number | null;
  /** 经济补偿金 N */
  compensation: number;
  /** 违法解除赔偿金 2N */
  doubleCompensation: number;
}

const parseIso = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
};

/** 完整工作月数：按「对日」口径，未做满整月的零头不计 */
export function completedMonths(startDate: string, endDate: string): number {
  const start = parseIso(startDate);
  const end = parseIso(endDate);
  let months = (end.y - start.y) * 12 + (end.m - start.m);
  if (end.d < start.d) {
    months -= 1;
  }
  return Math.max(months, 0);
}

/** 由工作月数换算补偿月数 N */
export function compensatedMonthsOf(workMonths: number): number {
  if (workMonths <= 0) {
    return 0.5;
  }
  const years = Math.floor(workMonths / 12);
  const remainder = workMonths % 12;
  if (remainder === 0) {
    return years;
  }
  return years + (remainder >= 6 ? 1 : 0.5);
}

export function computeSeverance(input: SeveranceInput): SeveranceResult {
  const workMonths = completedMonths(input.startDate, input.endDate);
  const workYears = Math.floor(workMonths / 12);
  const workRemainderMonths = workMonths % 12;

  const tripleCap = input.localAverageWage && input.localAverageWage > 0 ? input.localAverageWage * 3 : null;
  const capped = tripleCap !== null && input.monthlyWage > tripleCap;
  const baseWage = capped && tripleCap !== null ? tripleCap : input.monthlyWage;

  let compensatedMonths = compensatedMonthsOf(workMonths);
  // 十二年上限是「封顶」的伴生规则：只有月工资高于社平三倍时才生效
  const yearsCapped = capped && compensatedMonths > 12;
  if (yearsCapped) {
    compensatedMonths = 12;
  }

  const compensation = baseWage * compensatedMonths;

  return {
    workMonths,
    workYears,
    workRemainderMonths,
    compensatedMonths,
    baseWage,
    capped,
    yearsCapped,
    tripleCap,
    compensation,
    doubleCompensation: compensation * 2,
  };
}

/** 把「38 个月」显示成「3 年 2 个月」 */
export function monthsToYearsText(workMonths: number, yearUnit: string, monthUnit: string): string {
  return `${Math.floor(workMonths / 12)}${yearUnit}${workMonths % 12}${monthUnit}`;
}
