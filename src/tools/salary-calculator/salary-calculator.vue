<script setup lang="ts">
/**
 * 工资计算器（五险一金 + 全年到手）。
 *
 * 结果区刻意把 12 个月的明细全列出来，而不是只给一个"月均到手"：
 * 累计预扣法下每月到手本来就不一样，跨档那个月会明显掉一截，
 * 只报平均值等于把用户最想看的信息藏起来了。
 */
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import {
  computeSalary,
  formatMoney,
  formatPercent,
  solveMonthlySalaryForNet,
  type SalaryInput,
} from './salary';

const { t } = useI18n();

const monthlySalary = ref(15000);
const annualBonus = ref(30000);
const bonusMonth = ref(12);
const bonusSeparate = ref(true);

const socialBase = ref(15000);
const autoBase = ref(true);
const housingFundRate = ref(12);
const additionalMonthly = ref(3000);

const employerPensionRate = ref(16);
const employerMedicalRate = ref(10);
const employerFundRate = ref(12);
const employerOtherRate = ref(1.9);

const targetNet = ref(150000);
const reverseResult = ref<number | null>(null);

const exampleData = {
  monthlySalary: 22000,
  annualBonus: 66000,
  bonusMonth: 12,
  bonusSeparate: true,
  housingFundRate: 12,
  additionalMonthly: 4000,
  targetNet: 220000,
};

/**
 * 示例取月薪 2.2 万 + 年终奖 6.6 万：这个量级在累计预扣法中一定会跨档，
 * 明细表里能直接看到"某一月起个税突然变多"的现象，工具的核心价值才体现得出来。
 * 月薪 5000 那种示例算出来全年一条直线，等于什么都没展示。
 */
function loadExample() {
  monthlySalary.value = exampleData.monthlySalary;
  annualBonus.value = exampleData.annualBonus;
  bonusMonth.value = exampleData.bonusMonth;
  bonusSeparate.value = exampleData.bonusSeparate;
  housingFundRate.value = exampleData.housingFundRate;
  additionalMonthly.value = exampleData.additionalMonthly;
  targetNet.value = exampleData.targetNet;
  autoBase.value = true;
  socialBase.value = exampleData.monthlySalary;
  reverseResult.value = null;
}

watch([monthlySalary, autoBase], () => {
  if (autoBase.value) {
    socialBase.value = monthlySalary.value;
  }
});

const input = computed<SalaryInput>(() => ({
  monthlySalary: monthlySalary.value,
  annualBonus: annualBonus.value,
  bonusMonth: bonusMonth.value,
  bonusSeparate: bonusSeparate.value,
  socialBase: socialBase.value,
  housingFundRate: housingFundRate.value,
  employerPensionRate: employerPensionRate.value,
  employerMedicalRate: employerMedicalRate.value,
  employerFundRate: employerFundRate.value,
  employerOtherRate: employerOtherRate.value,
  additionalMonthly: additionalMonthly.value,
}));

const result = computed(() => computeSalary(input.value));

const bonusOptions = [
  { label: t('tools.salary-calculator.texts.option-bonus-separate'), value: true },
  { label: t('tools.salary-calculator.texts.option-bonus-combined'), value: false },
];

const monthOptions = Array.from({ length: 12 }, (_, index) => ({
  label: `${index + 1} 月`,
  value: index + 1,
}));

const summaryRows = computed(() => [
  { label: t('tools.salary-calculator.texts.label-total-net'), value: `${formatMoney(result.value.totalNet)} 元`, highlight: true },
  { label: t('tools.salary-calculator.texts.label-monthly-average'), value: `${formatMoney(result.value.totalNet / 12)} 元` },
  { label: t('tools.salary-calculator.texts.label-first-month'), value: `${formatMoney(result.value.rows[0].net)} 元` },
  { label: t('tools.salary-calculator.texts.label-last-month'), value: `${formatMoney(result.value.rows[11].net)} 元` },
  { label: t('tools.salary-calculator.texts.label-total-tax'), value: `${formatMoney(result.value.totalTax)} 元` },
  { label: t('tools.salary-calculator.texts.label-bonus-tax'), value: `${formatMoney(result.value.bonusTax)} 元` },
  { label: t('tools.salary-calculator.texts.label-total-insurance'), value: `${formatMoney(result.value.totalInsurance)} 元` },
  { label: t('tools.salary-calculator.texts.label-effective-rate'), value: formatPercent(result.value.effectiveTaxRate) },
  { label: t('tools.salary-calculator.texts.label-employer-cost'), value: `${formatMoney(result.value.employerCost)} 元` },
]);

function runReverse() {
  reverseResult.value = solveMonthlySalaryForNet(targetNet.value, input.value);
}
</script>

<template>
  <div class="salary-calculator">
    <div flex justify-end mb-2>
      <ToolExampleButton @click="loadExample" />
    </div>

    <c-card :title="t('tools.salary-calculator.texts.title-income')" mb-3>
      <n-space mb-2>
        <n-form-item :label="t('tools.salary-calculator.texts.label-monthly-salary')" label-placement="left">
          <n-input-number-i18n v-model:value="monthlySalary" :min="0" :step="1000" />
        </n-form-item>
        <n-form-item :label="t('tools.salary-calculator.texts.label-annual-bonus')" label-placement="left">
          <n-input-number-i18n v-model:value="annualBonus" :min="0" :step="1000" />
        </n-form-item>
      </n-space>

      <n-space mb-2>
        <c-select
          v-model:value="bonusMonth"
          :label="t('tools.salary-calculator.texts.label-bonus-month')"
          label-position="left"
          :options="monthOptions"
        />
        <c-select
          v-model:value="bonusSeparate"
          :label="t('tools.salary-calculator.texts.label-bonus-mode')"
          label-position="left"
          :options="bonusOptions"
        />
      </n-space>
    </c-card>

    <c-card :title="t('tools.salary-calculator.texts.title-insurance')" mb-3>
      <n-form-item :label="t('tools.salary-calculator.texts.label-auto-base')" label-placement="left" mb-2>
        <n-switch v-model:value="autoBase" />
      </n-form-item>
      <n-space mb-2>
        <n-form-item :label="t('tools.salary-calculator.texts.label-social-base')" label-placement="left">
          <n-input-number-i18n v-model:value="socialBase" :min="0" :step="1000" :disabled="autoBase" />
        </n-form-item>
        <n-form-item :label="t('tools.salary-calculator.texts.label-housing-fund-rate')" label-placement="left">
          <n-input-number-i18n v-model:value="housingFundRate" :min="0" :max="12" :step="1" />
        </n-form-item>
        <n-form-item :label="t('tools.salary-calculator.texts.label-additional')" label-placement="left">
          <n-input-number-i18n v-model:value="additionalMonthly" :min="0" :step="500" />
        </n-form-item>
      </n-space>
      <div class="hint">
        {{ t('tools.salary-calculator.texts.hint-insurance-rate') }}
      </div>
    </c-card>

    <c-card :title="t('tools.salary-calculator.texts.title-result')" mb-3>
      <div class="summary-grid">
        <div v-for="row in summaryRows" :key="row.label" :class="row.highlight ? 'summary-cell summary-cell-main' : 'summary-cell'">
          <div class="summary-label">{{ row.label }}</div>
          <div class="summary-value">{{ row.value }}</div>
        </div>
      </div>
    </c-card>

    <c-card :title="t('tools.salary-calculator.texts.title-detail')" mb-3>
      <div class="table-wrap">
        <table class="salary-table">
          <thead>
            <tr>
              <th>{{ t('tools.salary-calculator.texts.col-month') }}</th>
              <th>{{ t('tools.salary-calculator.texts.col-gross') }}</th>
              <th>{{ t('tools.salary-calculator.texts.col-insurance') }}</th>
              <th>{{ t('tools.salary-calculator.texts.col-tax') }}</th>
              <th>{{ t('tools.salary-calculator.texts.col-net') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in result.rows" :key="row.month">
              <td>{{ row.month }} 月</td>
              <td>{{ formatMoney(row.gross) }}</td>
              <td>{{ formatMoney(row.insurance) }}</td>
              <td>{{ formatMoney(row.tax) }}</td>
              <td class="col-strong">{{ formatMoney(row.net) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </c-card>

    <c-card :title="t('tools.salary-calculator.texts.title-reverse')" mb-3>
      <n-form-item :label="t('tools.salary-calculator.texts.label-target-net')" label-placement="left" mb-2>
        <n-input-number-i18n v-model:value="targetNet" :min="0" :step="10000" />
      </n-form-item>
      <c-button @click="runReverse">
        {{ t('tools.salary-calculator.texts.btn-reverse') }}
      </c-button>
      <div v-if="reverseResult !== null" class="reverse-result">
        {{ t('tools.salary-calculator.texts.reverse-prefix') }}
        <strong>{{ formatMoney(reverseResult) }}</strong>
        {{ t('tools.salary-calculator.texts.reverse-suffix') }}
      </div>
    </c-card>

    <c-card :title="t('tools.salary-calculator.texts.title-employer')">
      <n-space>
        <n-form-item :label="t('tools.salary-calculator.texts.label-employer-pension')" label-placement="left">
          <n-input-number-i18n v-model:value="employerPensionRate" :min="0" :max="30" :step="1" />
        </n-form-item>
        <n-form-item :label="t('tools.salary-calculator.texts.label-employer-medical')" label-placement="left">
          <n-input-number-i18n v-model:value="employerMedicalRate" :min="0" :max="30" :step="0.5" />
        </n-form-item>
        <n-form-item :label="t('tools.salary-calculator.texts.label-employer-fund')" label-placement="left">
          <n-input-number-i18n v-model:value="employerFundRate" :min="0" :max="12" :step="1" />
        </n-form-item>
        <n-form-item :label="t('tools.salary-calculator.texts.label-employer-other')" label-placement="left">
          <n-input-number-i18n v-model:value="employerOtherRate" :min="0" :max="10" :step="0.1" />
        </n-form-item>
      </n-space>
      <div class="hint">
        {{ t('tools.salary-calculator.texts.hint-employer') }}
      </div>
    </c-card>
  </div>
</template>

<style scoped lang="less">
.salary-calculator {
  .hint {
    font-size: 13px;
    color: var(--n-text-color-disabled, #999);
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 10px;
  }

  .summary-cell {
    padding: 10px 12px;
    border: 1px solid rgb(0 0 0 / 8%);
    border-radius: 6px;
  }

  .summary-cell-main {
    border-color: rgb(24 160 88 / 40%);
    background-color: rgb(24 160 88 / 6%);
  }

  .summary-label {
    font-size: 12px;
    color: #999;
  }

  .summary-value {
    margin-top: 4px;
    font-size: 17px;
    font-weight: 600;
  }

  .table-wrap {
    overflow-x: auto;
  }

  .salary-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    font-variant-numeric: tabular-nums;

    th,
    td {
      padding: 6px 10px;
      text-align: right;
      border-bottom: 1px solid rgb(0 0 0 / 8%);
      white-space: nowrap;
    }

    th:first-child,
    td:first-child {
      text-align: left;
    }

    th {
      color: #999;
      font-weight: 500;
    }
  }

  .col-strong {
    font-weight: 600;
  }

  .reverse-result {
    margin-top: 10px;
    font-size: 15px;
  }
}
</style>
