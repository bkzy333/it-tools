/**
 * 通用贷款计算器（车贷 / 消费贷 / 经营贷）。
 *
 * 和房贷计算器分开的原因不只是场景不同，还款方式也不一样：
 * 房贷基本只有等额本息和等额本金，而消费贷、经营贷里"先息后本"
 * 和"到期一次性还本付息"很常见，这两种的月供结构完全不同。
 *
 * 四种方式的现金流：
 * - 等额本息：每期还款额固定，本金占比逐期递增
 * - 等额本金：每期本金固定，利息递减，月供逐期下降
 * - 先息后本：每期只还利息，末期一次性还本金
 * - 到期一次性：中间不还款，末期连本带利一次结清
 */

export type RepayMethod = 'equal-installment' | 'equal-principal' | 'interest-first' | 'bullet';

export interface LoanInput {
  /** 贷款本金（元） */
  principal: number;
  /** 年利率（%），如 4.35 表示 4.35% */
  annualRate: number;
  /** 贷款期限（月） */
  months: number;
  method: RepayMethod;
}

export interface LoanRow {
  period: number;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
}

export interface LoanResult {
  rows: LoanRow[];
  /** 等额本息下的固定月供；其他方式下为首月还款额 */
  monthlyPayment: number;
  firstPayment: number;
  lastPayment: number;
  totalInterest: number;
  totalPayment: number;
}

export function computeLoan(input: LoanInput): LoanResult {
  const { principal, annualRate, months, method } = input;

  if (principal <= 0 || months <= 0) {
    return { rows: [], monthlyPayment: 0, firstPayment: 0, lastPayment: 0, totalInterest: 0, totalPayment: 0 };
  }

  const monthlyRate = annualRate / 100 / 12;
  const rows: LoanRow[] = [];

  if (method === 'equal-installment') {
    const payment =
      monthlyRate === 0
        ? principal / months
        : (principal * monthlyRate * (1 + monthlyRate) ** months) / ((1 + monthlyRate) ** months - 1);

    let balance = principal;
    for (let period = 1; period <= months; period += 1) {
      const interest = balance * monthlyRate;
      let principalPart = payment - interest;
      let actualPayment = payment;
      if (period === months) {
        // 最后一期把浮点误差抹平，保证余额归零
        principalPart = balance;
        actualPayment = balance + interest;
      }
      balance = Math.max(0, balance - principalPart);
      rows.push({ period, payment: actualPayment, principal: principalPart, interest, balance });
    }

    return {
      rows,
      monthlyPayment: payment,
      firstPayment: payment,
      lastPayment: rows[rows.length - 1].payment,
      totalInterest: rows.reduce((sum, row) => sum + row.interest, 0),
      totalPayment: rows.reduce((sum, row) => sum + row.payment, 0),
    };
  }

  if (method === 'equal-principal') {
    const principalPart = principal / months;
    let balance = principal;
    for (let period = 1; period <= months; period += 1) {
      const interest = balance * monthlyRate;
      balance = Math.max(0, balance - principalPart);
      rows.push({ period, payment: principalPart + interest, principal: principalPart, interest, balance });
    }
    return {
      rows,
      monthlyPayment: rows[0].payment,
      firstPayment: rows[0].payment,
      lastPayment: rows[rows.length - 1].payment,
      totalInterest: rows.reduce((sum, row) => sum + row.interest, 0),
      totalPayment: rows.reduce((sum, row) => sum + row.payment, 0),
    };
  }

  if (method === 'interest-first') {
    const interest = principal * monthlyRate;
    for (let period = 1; period <= months; period += 1) {
      const isLast = period === months;
      rows.push({
        period,
        payment: isLast ? interest + principal : interest,
        principal: isLast ? principal : 0,
        interest,
        balance: isLast ? 0 : principal,
      });
    }
    return {
      rows,
      monthlyPayment: interest,
      firstPayment: interest,
      lastPayment: interest + principal,
      totalInterest: interest * months,
      totalPayment: interest * months + principal,
    };
  }

  // 到期一次性还本付息
  const total = principal * (1 + monthlyRate) ** months;
  for (let period = 1; period < months; period += 1) {
    rows.push({ period, payment: 0, principal: 0, interest: 0, balance: principal });
  }
  rows.push({ period: months, payment: total, principal, interest: total - principal, balance: 0 });

  return {
    rows,
    monthlyPayment: 0,
    firstPayment: 0,
    lastPayment: total,
    totalInterest: total - principal,
    totalPayment: total,
  };
}

export function formatMoney(value: number): string {
  return value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
