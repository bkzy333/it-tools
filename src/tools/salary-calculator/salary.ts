/**
 * 工资计算器：五险一金 + 全年累计预扣法个税。
 *
 * 为什么一定要按月算 12 遍，而不是拿"月薪 × 12"套一次年度税率表：
 * 工资薪金用的是累计预扣预缴，前几个月累计应纳税所得额还低，适用低档税率，
 * 到某一月跨档之后每月预扣会突然变多。所以"一年里 1 月到手最多、12 月最少"
 * 是常态，只给一个平均值的计算器会把这件事整个抹掉。
 *
 * 与个税计算器的分工：那边是年度汇算口径（含年终奖两种计税对比），
 * 这边是"我每个月实际能拿到多少"。
 */

/** 综合所得年度税率表（超额累进）：上限、税率、速算扣除数 */
export const YEARLY_BRACKETS = [
  { upTo: 36000, rate: 0.03, quickDeduction: 0 },
  { upTo: 144000, rate: 0.1, quickDeduction: 2520 },
  { upTo: 300000, rate: 0.2, quickDeduction: 16920 },
  { upTo: 420000, rate: 0.25, quickDeduction: 31920 },
  { upTo: 660000, rate: 0.3, quickDeduction: 52920 },
  { upTo: 960000, rate: 0.35, quickDeduction: 85920 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.45, quickDeduction: 181920 },
];

/** 按月换算后的税率表，年终奖单独计税时用 */
export const MONTHLY_BRACKETS = [
  { upTo: 3000, rate: 0.03, quickDeduction: 0 },
  { upTo: 12000, rate: 0.1, quickDeduction: 210 },
  { upTo: 25000, rate: 0.2, quickDeduction: 1410 },
  { upTo: 35000, rate: 0.25, quickDeduction: 2660 },
  { upTo: 55000, rate: 0.3, quickDeduction: 4410 },
  { upTo: 80000, rate: 0.35, quickDeduction: 7160 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.45, quickDeduction: 15160 },
];

export function taxOf(taxable: number, brackets: typeof YEARLY_BRACKETS) {
  if (taxable <= 0) {
    return { tax: 0, rate: 0, quickDeduction: 0 };
  }
  const bracket = brackets.find((item) => taxable <= item.upTo) ?? brackets[brackets.length - 1];
  return {
    tax: taxable * bracket.rate - bracket.quickDeduction,
    rate: bracket.rate,
    quickDeduction: bracket.quickDeduction,
  };
}

export interface SalaryInput {
  /** 税前月薪（元） */
  monthlySalary: number;
  /** 年终奖（元），0 表示没有 */
  annualBonus: number;
  /** 年终奖在哪个月发，1~12 */
  bonusMonth: number;
  /** 年终奖是否单独计税（false = 并入综合所得） */
  bonusSeparate: boolean;
  /** 社保缴费基数（元） */
  socialBase: number;
  /** 住房公积金个人缴存比例（%），5~12 */
  housingFundRate: number;
  /** 单位缴纳比例（%），用于算用工成本 */
  employerPensionRate: number;
  employerMedicalRate: number;
  employerFundRate: number;
  /** 单位其他险种合计（失业 + 工伤 + 生育，约 1.9%） */
  employerOtherRate: number;
  /** 专项附加扣除月额（元） */
  additionalMonthly: number;
}

export interface MonthRow {
  month: number;
  /** 应发 */
  gross: number;
  /** 五险一金个人部分 */
  insurance: number;
  /** 当月个税 */
  tax: number;
  /** 到手 */
  net: number;
  /** 累计已预扣个税 */
  cumulativeTax: number;
}

export interface SalaryResult {
  rows: MonthRow[];
  /** 全年应发合计 */
  totalGross: number;
  /** 全年五险一金个人合计 */
  totalInsurance: number;
  /** 全年个税合计 */
  totalTax: number;
  /** 全年到手合计 */
  totalNet: number;
  /** 年终奖个税（单独计税时才有） */
  bonusTax: number;
  /** 单位全年用工成本（含单位缴纳的五险一金） */
  employerCost: number;
  /** 实际综合税负（全年个税 / 全年应发） */
  effectiveTaxRate: number;
}

const MONTHLY_THRESHOLD = 5000;

/** 五险一金个人比例：养老 8% + 医疗 2% + 失业 0.5%，工伤和生育个人不缴 */
const PERSONAL_SOCIAL_RATE = 0.105;

export function computeSalary(input: SalaryInput): SalaryResult {
  const insuranceMonthly = input.socialBase * PERSONAL_SOCIAL_RATE;
  const fundMonthly = (input.socialBase * input.housingFundRate) / 100;
  const specialMonthly = insuranceMonthly + fundMonthly;

  const employerMonthly =
    (input.socialBase *
      (input.employerPensionRate +
        input.employerMedicalRate +
        input.employerFundRate +
        input.employerOtherRate)) /
    100;

  const rows: MonthRow[] = [];
  let cumulativeIncome = 0;
  let cumulativeThreshold = 0;
  let cumulativeSpecial = 0;
  let cumulativeAdditional = 0;
  let cumulativeTaxPaid = 0;
  let bonusTax = 0;

  for (let month = 1; month <= 12; month += 1) {
    const bonusThisMonth = month === input.bonusMonth ? input.annualBonus : 0;
    const gross = input.monthlySalary + bonusThisMonth;

    // 年终奖单独计税：不进累计，单独算。
    // 这里有个经典陷阱——要先用「奖金 ÷ 12」去月度税率表里定档，
    // 再用定到的税率和速算扣除数对全额计税。直接拿全额查表会跳到高档，
    // 6.6 万奖金能多算出近一万块的税。
    let bonusTaxThisMonth = 0;
    if (bonusThisMonth > 0 && input.bonusSeparate) {
      const bracket =
        MONTHLY_BRACKETS.find((item) => bonusThisMonth / 12 <= item.upTo) ??
        MONTHLY_BRACKETS[MONTHLY_BRACKETS.length - 1];
      bonusTaxThisMonth = bonusThisMonth * bracket.rate - bracket.quickDeduction;
      bonusTax += bonusTaxThisMonth;
    }

    cumulativeIncome += input.monthlySalary + (bonusThisMonth > 0 && !input.bonusSeparate ? bonusThisMonth : 0);
    cumulativeThreshold += MONTHLY_THRESHOLD;
    cumulativeSpecial += specialMonthly;
    cumulativeAdditional += input.additionalMonthly;

    const taxable = Math.max(
      0,
      cumulativeIncome - cumulativeThreshold - cumulativeSpecial - cumulativeAdditional,
    );
    const cumulativeTax = taxOf(taxable, YEARLY_BRACKETS).tax;
    const monthTax = Math.max(0, cumulativeTax - cumulativeTaxPaid) + bonusTaxThisMonth;
    cumulativeTaxPaid = cumulativeTax;

    const net = gross - specialMonthly - monthTax;

    rows.push({
      month,
      gross,
      insurance: specialMonthly,
      tax: monthTax,
      net,
      cumulativeTax: cumulativeTaxPaid,
    });
  }

  const totalGross = rows.reduce((sum, row) => sum + row.gross, 0);
  const totalInsurance = rows.reduce((sum, row) => sum + row.insurance, 0);
  const totalTax = rows.reduce((sum, row) => sum + row.tax, 0);
  const totalNet = rows.reduce((sum, row) => sum + row.net, 0);

  return {
    rows,
    totalGross,
    totalInsurance,
    totalTax,
    totalNet,
    bonusTax,
    employerCost: totalGross + employerMonthly * 12,
    effectiveTaxRate: totalGross > 0 ? totalTax / totalGross : 0,
  };
}

/**
 * 反推：想要某个全年到手数字，税前月薪得是多少。
 * 到手随税前单调递增，直接二分即可。
 */
export function solveMonthlySalaryForNet(targetNet: number, input: SalaryInput): number {
  let low = 0;
  let high = 500000;
  for (let i = 0; i < 60; i += 1) {
    const mid = (low + high) / 2;
    if (computeSalary({ ...input, monthlySalary: mid }).totalNet < targetNet) {
      low = mid;
    }
    else {
      high = mid;
    }
  }
  return Math.round((low + high) / 2);
}

export function formatMoney(value: number): string {
  return value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}
