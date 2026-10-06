/**
 * 信用卡 / 消费分期「真实年化利率」计算。
 *
 * 为什么需要算：银行宣传的是「月费率 0.6%」，听起来等于年化 7.2%（0.6% × 12）。
 * 但手续费是按**最初本金**全额收取的，而你每个月都在还本金 —— 借的钱在逐月变少，
 * 手续费却没变少。真正付出的资金成本要用 IRR（内部收益率）解，通常会接近宣传值的两倍。
 *
 * 两种收费方式必须分开算，因为现金流完全不同：
 *   分期收取（installment）：每期还 本金/n + 本金×期费率，手续费摊在每期
 *   一次性收取（upfront）：放款时先把总手续费扣掉，之后每期只还 本金/n
 *
 * 求解方法用二分法：IRR 的现金流是「先收后付」的标准形态，月利率在 [0, 1] 内单调递减，
 * 二分 100 次足够把误差压到 1e-12 以下。不用牛顿法是因为它对初值敏感，
 * 极端参数（超短期数 + 超低费率）下容易跳出定义域，二分更稳，多算几十次也无所谓。
 */

export type FeeCollection = 'installment' | 'upfront';

export interface InstallmentInput {
  /** 分期本金（元） */
  principal: number;
  /** 期数（月） */
  periods: number;
  /** 每期手续费率，小数。0.6% 传 0.006 */
  feeRatePerPeriod: number;
  /** 手续费收取方式 */
  feeCollection: FeeCollection;
}

export interface InstallmentResult {
  /** 每期还款额（元） */
  paymentPerPeriod: number;
  /** 总手续费（元） */
  totalFee: number;
  /** 总还款额（元） */
  totalRepayment: number;
  /** 表面上的年化：每期费率 × 期数（银行宣传口径） */
  nominalAnnualRate: number;
  /** 真实月利率（IRR） */
  monthlyIrr: number;
  /** 折算年化利率 = 月利率 × 12，这是银行必须在合同里披露的口径 */
  annualIrrSimple: number;
  /** 按复利折算的年化 = (1 + 月利率)^12 - 1，反映真实资金成本 */
  annualIrrCompound: number;
}

/** 用二分法解月利率，使「收到的本金」等于「未来还款的现值」 */
export function solveMonthlyIrr(principal: number, payment: number, periods: number, netProceeds = principal): number {
  if (principal <= 0 || periods <= 0 || payment <= 0) {
    return 0;
  }

  // 现值为未来还款折现之和；月利率越高现值越低，所以在 [0, 1] 上单调递减
  const presentValue = (rate: number) => {
    let pv = 0;
    for (let k = 1; k <= periods; k += 1) {
      pv += payment / (1 + rate) ** k;
    }
    return pv;
  };

  let low = 0;
  let high = 1;

  // 极端情况下连 high 都不够（比如 1 期 + 极高费率），再放宽上限
  while (presentValue(high) > netProceeds && high < 100) {
    high *= 2;
  }

  for (let i = 0; i < 200; i += 1) {
    const mid = (low + high) / 2;
    if (presentValue(mid) > netProceeds) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return (low + high) / 2;
}

export function computeInstallment(input: InstallmentInput): InstallmentResult {
  const { principal, periods, feeRatePerPeriod, feeCollection } = input;

  if (principal <= 0 || periods <= 0 || feeRatePerPeriod < 0) {
    return {
      paymentPerPeriod: 0,
      totalFee: 0,
      totalRepayment: 0,
      nominalAnnualRate: 0,
      monthlyIrr: 0,
      annualIrrSimple: 0,
      annualIrrCompound: 0,
    };
  }

  const totalFee = principal * feeRatePerPeriod * periods;
  const principalPerPeriod = principal / periods;

  const paymentPerPeriod =
    feeCollection === 'installment' ? principalPerPeriod + principal * feeRatePerPeriod : principalPerPeriod;

  // 一次性收取时，实际到手的钱少了总手续费这一块，折现的基准要跟着降
  const netProceeds = feeCollection === 'upfront' ? principal - totalFee : principal;
  const monthlyIrr = solveMonthlyIrr(principal, paymentPerPeriod, periods, netProceeds);

  return {
    paymentPerPeriod,
    totalFee,
    totalRepayment: paymentPerPeriod * periods,
    nominalAnnualRate: feeRatePerPeriod * periods,
    monthlyIrr,
    annualIrrSimple: monthlyIrr * 12,
    annualIrrCompound: (1 + monthlyIrr) ** 12 - 1,
  };
}
