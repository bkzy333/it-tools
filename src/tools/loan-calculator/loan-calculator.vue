<script setup lang="ts">
/**
 * 通用贷款计算器。
 *
 * 还款计划表默认只展开前 12 期 —— 60 期全列出来既占地方又没人看，
 * 而"前几期利息占多少"才是用户真正关心的部分。想看全可以点展开。
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { computeLoan, formatMoney, type RepayMethod } from './loan';

const { t } = useI18n();

const principal = ref(100000);
const annualRate = ref(4.35);
const months = ref(36);
const method = ref<RepayMethod>('equal-installment');
const showAll = ref(false);

const exampleData = {
  principal: 200000,
  annualRate: 5.6,
  months: 60,
  method: 'equal-principal' as RepayMethod,
};

/**
 * 示例选 20 万 5 年、等额本金：车贷和经营贷最常见的形态。
 * 用等额本金而不是等额本息，是因为它首月和末月月供差得明显，
 * 一眼就能看出两种方式的区别，换成等额本息整张表是平的。
 */
function loadExample() {
  principal.value = exampleData.principal;
  annualRate.value = exampleData.annualRate;
  months.value = exampleData.months;
  method.value = exampleData.method;
  showAll.value = false;
}

const methodOptions = [
  { label: t('tools.loan-calculator.texts.method-equal-installment'), value: 'equal-installment' },
  { label: t('tools.loan-calculator.texts.method-equal-principal'), value: 'equal-principal' },
  { label: t('tools.loan-calculator.texts.method-interest-first'), value: 'interest-first' },
  { label: t('tools.loan-calculator.texts.method-bullet'), value: 'bullet' },
];

const result = computed(() =>
  computeLoan({
    principal: principal.value,
    annualRate: annualRate.value,
    months: months.value,
    method: method.value,
  }),
);

const visibleRows = computed(() => (showAll.value ? result.value.rows : result.value.rows.slice(0, 12)));

const summaryRows = computed(() => [
  { label: t('tools.loan-calculator.texts.label-monthly-payment'), value: `${formatMoney(result.value.monthlyPayment)} 元` },
  { label: t('tools.loan-calculator.texts.label-first-payment'), value: `${formatMoney(result.value.firstPayment)} 元` },
  { label: t('tools.loan-calculator.texts.label-last-payment'), value: `${formatMoney(result.value.lastPayment)} 元` },
  { label: t('tools.loan-calculator.texts.label-total-interest'), value: `${formatMoney(result.value.totalInterest)} 元` },
  { label: t('tools.loan-calculator.texts.label-total-payment'), value: `${formatMoney(result.value.totalPayment)} 元` },
]);
</script>

<template>
  <div class="loan-calculator">
    <div flex justify-end mb-2>
      <ToolExampleButton @click="loadExample" />
    </div>

    <c-card :title="t('tools.loan-calculator.texts.title-input')" mb-3>
      <n-space mb-2>
        <n-form-item :label="t('tools.loan-calculator.texts.label-principal')" label-placement="left">
          <n-input-number-i18n v-model:value="principal" :min="0" :step="10000" />
        </n-form-item>
        <n-form-item :label="t('tools.loan-calculator.texts.label-rate')" label-placement="left">
          <n-input-number-i18n v-model:value="annualRate" :min="0" :max="36" :step="0.05" />
        </n-form-item>
        <n-form-item :label="t('tools.loan-calculator.texts.label-months')" label-placement="left">
          <n-input-number-i18n v-model:value="months" :min="1" :max="360" :step="1" />
        </n-form-item>
      </n-space>
      <c-select
        v-model:value="method"
        :label="t('tools.loan-calculator.texts.label-method')"
        label-position="left"
        :options="methodOptions"
      />
    </c-card>

    <c-card :title="t('tools.loan-calculator.texts.title-result')" mb-3>
      <div class="summary-grid">
        <div v-for="row in summaryRows" :key="row.label" class="summary-cell">
          <div class="summary-label">{{ row.label }}</div>
          <div class="summary-value">{{ row.value }}</div>
        </div>
      </div>
    </c-card>

    <c-card :title="t('tools.loan-calculator.texts.title-schedule')">
      <div class="table-wrap">
        <table class="loan-table">
          <thead>
            <tr>
              <th>{{ t('tools.loan-calculator.texts.col-period') }}</th>
              <th>{{ t('tools.loan-calculator.texts.col-payment') }}</th>
              <th>{{ t('tools.loan-calculator.texts.col-principal') }}</th>
              <th>{{ t('tools.loan-calculator.texts.col-interest') }}</th>
              <th>{{ t('tools.loan-calculator.texts.col-balance') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in visibleRows" :key="row.period">
              <td>{{ row.period }}</td>
              <td>{{ formatMoney(row.payment) }}</td>
              <td>{{ formatMoney(row.principal) }}</td>
              <td>{{ formatMoney(row.interest) }}</td>
              <td>{{ formatMoney(row.balance) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <c-button v-if="result.rows.length > 12" size="small" mt-2 @click="showAll = !showAll">
        {{ showAll ? t('tools.loan-calculator.texts.btn-collapse') : t('tools.loan-calculator.texts.btn-expand') }}
      </c-button>
    </c-card>
  </div>
</template>

<style scoped lang="less">
.loan-calculator {
  .summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 10px;
  }

  .summary-cell {
    padding: 10px 12px;
    border: 1px solid rgb(0 0 0 / 8%);
    border-radius: 6px;
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

  .loan-table {
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
}
</style>
