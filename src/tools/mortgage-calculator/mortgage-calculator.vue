<script setup lang="ts">
/**
 * 房贷计算器：等额本息 / 等额本金 + 提前还贷测算。
 *
 * 把"提前还贷"做进同一个工具而不是单独开一个页，是因为这两个问题本质连着：
 * 用户算完月供，下一步一定想知道"我手头有钱要不要提前还、能省多少利息"。
 * 拆成两个页面用户还得把数据重新填一遍。
 *
 * 提前还贷的两种处置方式对应银行实际提供的两个选项：
 *  - 减少月供：期限不变，月供降低，缓解现金流压力，但省息少
 *  - 缩短年限：月供基本不变，期限缩短，省息多
 * 这个对比才是用户真正需要的信息，只给一个结果等于替用户做决定。
 *
 * 说明：这里按"整月、还款当月一次性还本"的理想模型计算，不区分银行具体扣款日、
 * 是否收取违约金，实际以贷款合同和银行系统为准。
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

interface MonthRow {
  month: number;
  payment: number;
  principal: number;
  interest: number;
  remaining: number;
}

interface Plan {
  rows: MonthRow[];
  monthlyPayment: number;
  firstPayment: number;
  totalInterest: number;
  totalPayment: number;
  months: number;
}

// ------------------------------------------------------------------ 输入

const loanAmount = ref(2000000);
const annualRate = ref(3.1);
const years = ref(30);
const method = ref<'equal-installment' | 'equal-principal'>('equal-installment');

// 提前还贷
const prepayEnabled = ref(false);
const prepayAtMonth = ref(36);
const prepayAmount = ref(300000);
const prepayMode = ref<'reduce-payment' | 'shorten-term'>('reduce-payment');

const exampleData = {
  loanAmount: 2000000,
  annualRate: 3.1,
  years: 30,
  method: 'equal-installment' as const,
  prepayEnabled: true,
  prepayAtMonth: 36,
  prepayAmount: 300000,
  prepayMode: 'reduce-payment' as const,
};

/** 200 万 / 30 年 / 3.1% 是当前最典型的商贷配置，第 3 年提前还 30 万 */
function loadExample() {
  loanAmount.value = exampleData.loanAmount;
  annualRate.value = exampleData.annualRate;
  years.value = exampleData.years;
  method.value = exampleData.method;
  prepayEnabled.value = exampleData.prepayEnabled;
  prepayAtMonth.value = exampleData.prepayAtMonth;
  prepayAmount.value = exampleData.prepayAmount;
  prepayMode.value = exampleData.prepayMode;
}

// ------------------------------------------------------------------ 还款计划

/** 生成逐月还款计划。等额本金下月供逐月递减，等额本息下月供固定。 */
function buildPlan(principal: number, annualRatePercent: number, months: number, mode: 'equal-installment' | 'equal-principal'): Plan {
  const r = annualRatePercent / 100 / 12;
  const rows: MonthRow[] = [];
  let remaining = principal;
  let monthlyPayment = 0;
  let firstPayment = 0;
  let totalInterest = 0;

  if (mode === 'equal-installment') {
    // 月供 = P·r·(1+r)^n / ((1+r)^n − 1)；利率为 0 时退化成等额本金
    monthlyPayment = r === 0 ? principal / months : (principal * r * (1 + r) ** months) / ((1 + r) ** months - 1);

    for (let month = 1; month <= months; month += 1) {
      const interest = remaining * r;
      let payPrincipal = monthlyPayment - interest;
      // 最后一期把尾差抹平，避免剩余本金留几分钱
      if (month === months || payPrincipal > remaining) {
        payPrincipal = remaining;
      }
      remaining -= payPrincipal;
      totalInterest += interest;
      rows.push({
        month,
        payment: payPrincipal + interest,
        principal: payPrincipal,
        interest,
        remaining: Math.max(remaining, 0),
      });
    }
    firstPayment = monthlyPayment;
  } else {
    const principalPerMonth = principal / months;
    for (let month = 1; month <= months; month += 1) {
      const interest = remaining * r;
      const payPrincipal = month === months ? remaining : Math.min(principalPerMonth, remaining);
      remaining -= payPrincipal;
      totalInterest += interest;
      rows.push({
        month,
        payment: payPrincipal + interest,
        principal: payPrincipal,
        interest,
        remaining: Math.max(remaining, 0),
      });
    }
    firstPayment = rows[0]?.payment ?? 0;
    monthlyPayment = firstPayment;
  }

  return {
    rows,
    monthlyPayment,
    firstPayment,
    totalInterest,
    totalPayment: principal + totalInterest,
    months,
  };
}

const totalMonths = computed(() => years.value * 12);
const basePlan = computed(() => buildPlan(loanAmount.value, annualRate.value, totalMonths.value, method.value));

/** 第 k 期还款后的剩余本金。等额本息和等额本金公式不同，不能共用。 */
function remainingAfter(plan: Plan, k: number): number {
  if (k <= 0) {
    return loanAmount.value;
  }
  return plan.rows[Math.min(k, plan.rows.length) - 1]?.remaining ?? 0;
}

// ------------------------------------------------------------------ 提前还贷测算

const prepayment = computed(() => {
  if (!prepayEnabled.value || prepayAmount.value <= 0) {
    return null;
  }

  const k = Math.min(Math.max(Math.round(prepayAtMonth.value), 1), basePlan.value.rows.length - 1);
  const remainingBefore = remainingAfter(basePlan.value, k);
  const effectiveAmount = Math.min(prepayAmount.value, remainingBefore);
  if (effectiveAmount <= 0) {
    return null;
  }

  const newPrincipal = remainingBefore - effectiveAmount;
  const monthsLeft = basePlan.value.rows.length - k;
  const r = annualRate.value / 100 / 12;

  // 原计划在第 k 期之后还要付多少利息
  const interestLeftBefore = basePlan.value.rows.slice(k).reduce((sum, row) => sum + row.interest, 0);

  let newMonths = monthsLeft;
  let newPayment = 0;
  let newPlan: Plan;

  if (prepayMode.value === 'shorten-term') {
    if (method.value === 'equal-installment') {
      // 月供保持不变，反解剩余期数：m = ln(M / (M − P·r)) / ln(1+r)
      const payment = basePlan.value.firstPayment;
      if (r === 0) {
        newMonths = Math.ceil(newPrincipal / (payment || 1));
      } else if (payment <= newPrincipal * r) {
        // 极端情况：月供还不够覆盖利息，说明永远还不清，退回"减少月供"口径
        newMonths = monthsLeft;
      } else {
        newMonths = Math.ceil(Math.log(payment / (payment - newPrincipal * r)) / Math.log(1 + r));
      }
      newPlan = buildPlan(newPrincipal, annualRate.value, Math.max(newMonths, 1), method.value);
      newPayment = newPlan.firstPayment;
    } else {
      // 等额本金下每月归还的本金额固定，期限缩短就是剩余本金除以每月本金
      const principalPerMonth = loanAmount.value / basePlan.value.rows.length;
      newMonths = Math.max(Math.ceil(newPrincipal / principalPerMonth), 1);
      newPlan = buildPlan(newPrincipal, annualRate.value, newMonths, method.value);
      newPayment = newPlan.firstPayment;
    }
  } else {
    newMonths = monthsLeft;
    newPlan = buildPlan(newPrincipal, annualRate.value, newMonths, method.value);
    newPayment = newPlan.firstPayment;
  }

  const interestLeftAfter = newPlan.totalInterest;

  return {
    month: k,
    remainingBefore,
    effectiveAmount,
    newPrincipal,
    newMonths,
    newPayment,
    savedInterest: interestLeftBefore - interestLeftAfter,
    monthsSaved: monthsLeft - newMonths,
    paymentBefore: basePlan.value.rows[k]?.payment ?? basePlan.value.firstPayment,
  };
});

// ------------------------------------------------------------------ 展示

/** 年度汇总：逐月表格太长（30 年 360 行），按年聚合既看得清也压住了渲染量 */
const yearlySummary = computed(() => {
  const plan = basePlan.value;
  const yearsList: { year: number; payment: number; principal: number; interest: number; remaining: number }[] = [];

  for (let y = 0; y < Math.ceil(plan.rows.length / 12); y += 1) {
    const slice = plan.rows.slice(y * 12, (y + 1) * 12);
    if (slice.length === 0) {
      continue;
    }
    yearsList.push({
      year: y + 1,
      payment: slice.reduce((sum, row) => sum + row.payment, 0),
      principal: slice.reduce((sum, row) => sum + row.principal, 0),
      interest: slice.reduce((sum, row) => sum + row.interest, 0),
      remaining: slice[slice.length - 1].remaining,
    });
  }
  return yearsList;
});

const yuan = (value: number) => value.toFixed(2);
const wan = (value: number) => (value / 10000).toFixed(2);
</script>

<template>
  <div class="mortgage-calculator">
    <div flex justify-end mb-2>
      <ToolExampleButton @click="loadExample" />
    </div>

    <c-card :title="t('tools.mortgage-calculator.texts.title-loan')" mb-3>
      <n-space>
        <n-form-item :label="t('tools.mortgage-calculator.texts.label-amount')" label-placement="left">
          <n-input-number-i18n v-model:value="loanAmount" :min="0" :step="100000" />
        </n-form-item>
        <n-form-item :label="t('tools.mortgage-calculator.texts.label-rate')" label-placement="left">
          <n-input-number-i18n v-model:value="annualRate" :min="0" :max="24" :step="0.05" />
        </n-form-item>
        <n-form-item :label="t('tools.mortgage-calculator.texts.label-years')" label-placement="left">
          <n-input-number-i18n v-model:value="years" :min="1" :max="40" :step="1" />
        </n-form-item>
        <n-form-item :label="t('tools.mortgage-calculator.texts.label-method')" label-placement="left">
          <c-select
            v-model:value="method"
            :options="[
              {
                label: t('tools.mortgage-calculator.texts.option-equal-installment'),
                value: 'equal-installment',
              },
              { label: t('tools.mortgage-calculator.texts.option-equal-principal'), value: 'equal-principal' },
            ]"
          />
        </n-form-item>
      </n-space>
    </c-card>

    <c-card :title="t('tools.mortgage-calculator.texts.title-result')" mb-3>
      <input-copyable
        :label="t('tools.mortgage-calculator.texts.label-monthly-payment')"
        label-position="left"
        label-width="160px"
        :value="yuan(basePlan.firstPayment)"
        mb-1
      />
      <input-copyable
        :label="t('tools.mortgage-calculator.texts.label-total-interest')"
        label-position="left"
        label-width="160px"
        :value="yuan(basePlan.totalInterest)"
        mb-1
      />
      <input-copyable
        :label="t('tools.mortgage-calculator.texts.label-total-payment')"
        label-position="left"
        label-width="160px"
        :value="yuan(basePlan.totalPayment)"
        mb-1
      />
      <div class="hint">
        {{
          method === 'equal-principal'
            ? t('tools.mortgage-calculator.texts.hint-equal-principal')
            : t('tools.mortgage-calculator.texts.hint-equal-installment')
        }}
      </div>
    </c-card>

    <c-card :title="t('tools.mortgage-calculator.texts.title-prepay')" mb-3>
      <n-form-item :label="t('tools.mortgage-calculator.texts.label-prepay-enabled')" label-placement="left">
        <n-switch v-model:value="prepayEnabled" />
      </n-form-item>

      <template v-if="prepayEnabled">
        <n-space>
          <n-form-item :label="t('tools.mortgage-calculator.texts.label-prepay-month')" label-placement="left">
            <n-input-number-i18n v-model:value="prepayAtMonth" :min="1" :max="totalMonths" :step="1" />
          </n-form-item>
          <n-form-item :label="t('tools.mortgage-calculator.texts.label-prepay-amount')" label-placement="left">
            <n-input-number-i18n v-model:value="prepayAmount" :min="0" :step="50000" />
          </n-form-item>
          <n-form-item :label="t('tools.mortgage-calculator.texts.label-prepay-mode')" label-placement="left">
            <c-select
              v-model:value="prepayMode"
              :options="[
                { label: t('tools.mortgage-calculator.texts.option-reduce-payment'), value: 'reduce-payment' },
                { label: t('tools.mortgage-calculator.texts.option-shorten-term'), value: 'shorten-term' },
              ]"
            />
          </n-form-item>
        </n-space>

        <template v-if="prepayment">
          <div class="divider" />
          <input-copyable
            :label="t('tools.mortgage-calculator.texts.label-remaining-before')"
            label-position="left"
            label-width="200px"
            :value="yuan(prepayment.remainingBefore)"
            mb-1
          />
          <input-copyable
            :label="t('tools.mortgage-calculator.texts.label-new-payment')"
            label-position="left"
            label-width="200px"
            :value="yuan(prepayment.newPayment)"
            mb-1
          />
          <input-copyable
            v-if="prepayMode === 'shorten-term'"
            :label="t('tools.mortgage-calculator.texts.label-months-saved')"
            label-position="left"
            label-width="200px"
            :value="`${prepayment.monthsSaved} ${t('tools.mortgage-calculator.texts.unit-month')}`"
            mb-1
          />
          <input-copyable
            :label="t('tools.mortgage-calculator.texts.label-saved-interest')"
            label-position="left"
            label-width="200px"
            :value="yuan(prepayment.savedInterest)"
            mb-1
          />
          <div class="compare-hint">
            {{
              prepayMode === 'shorten-term'
                ? t('tools.mortgage-calculator.texts.hint-shorten-term')
                : t('tools.mortgage-calculator.texts.hint-reduce-payment')
            }}
          </div>
        </template>
      </template>
    </c-card>

    <c-card :title="t('tools.mortgage-calculator.texts.title-schedule')">
      <div class="table-wrapper">
        <table class="schedule-table">
          <thead>
            <tr>
              <th>{{ t('tools.mortgage-calculator.texts.th-year') }}</th>
              <th>{{ t('tools.mortgage-calculator.texts.th-payment') }}</th>
              <th>{{ t('tools.mortgage-calculator.texts.th-principal') }}</th>
              <th>{{ t('tools.mortgage-calculator.texts.th-interest') }}</th>
              <th>{{ t('tools.mortgage-calculator.texts.th-remaining') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in yearlySummary" :key="row.year">
              <td>{{ row.year }}</td>
              <td>{{ wan(row.payment) }}</td>
              <td>{{ wan(row.principal) }}</td>
              <td>{{ wan(row.interest) }}</td>
              <td>{{ wan(row.remaining) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="disclaimer">
        {{ t('tools.mortgage-calculator.texts.unit-wan') }} · {{ t('tools.mortgage-calculator.texts.disclaimer') }}
      </div>
    </c-card>
  </div>
</template>

<style lang="less" scoped>
.mortgage-calculator {
  max-width: 900px;
  width: 100%;
}

.hint,
.disclaimer {
  font-size: 12px;
  opacity: 0.6;
  line-height: 1.7;
}

.disclaimer {
  margin-top: 12px;
}

.divider {
  height: 1px;
  background-color: rgba(128, 128, 128, 0.2);
  margin: 14px 0;
}

.compare-hint {
  font-size: 13px;
  opacity: 0.8;
  margin-top: 6px;
}

.table-wrapper {
  max-height: 420px;
  overflow: auto;
}

.schedule-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;

  th,
  td {
    border: 1px solid rgba(128, 128, 128, 0.22);
    padding: 6px 10px;
    text-align: right;
    white-space: nowrap;
  }

  th {
    position: sticky;
    top: 0;
    background-color: rgba(128, 128, 128, 0.1);
    text-align: right;
  }

  th:first-child,
  td:first-child {
    text-align: center;
  }
}
</style>
