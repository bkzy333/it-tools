<script setup lang="ts">
/**
 * 信用卡分期真实利率计算器。
 *
 * 页面的重点不是那个数字，而是"表面年化 vs 折算年化"的对比 —— 把两个数并排放在一起，
 * 用户才会意识到「月费率 0.6%」不等于年化 7.2%。所以列表里两个值同屏、且折算年化用大字号。
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { computeInstallment, type FeeCollection } from './installment.service';

const { t } = useI18n();

const principal = ref(12000);
const periods = ref(12);
/** 用户输入的是百分数，服务里要的是小数 */
const feeRatePercent = ref(0.6);
const feeCollection = ref<FeeCollection>('installment');

const periodOptions = computed(() =>
  [3, 6, 9, 12, 18, 24, 36].map((n) => ({ label: `${n}`, value: n })),
);

const result = computed(() =>
  computeInstallment({
    principal: principal.value ?? 0,
    periods: periods.value,
    feeRatePerPeriod: (feeRatePercent.value ?? 0) / 100,
    feeCollection: feeCollection.value,
  }),
);

const percent = (value: number, digits = 2) => `${(value * 100).toFixed(digits)}%`;
const money = (value: number) =>
  value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 折算年化 ÷ 表面年化，用来说明"宣传值被放大了多少倍" */
const gapRatio = computed(() =>
  result.value.nominalAnnualRate > 0 ? result.value.annualIrrSimple / result.value.nominalAnnualRate : 0,
);

/** 同一费率下不同期数的对比，帮用户看清"分期越长越划算"是错觉 */
const periodComparison = computed(() =>
  [3, 6, 12, 24, 36].map((n) => {
    const r = computeInstallment({
      principal: principal.value ?? 0,
      periods: n,
      feeRatePerPeriod: (feeRatePercent.value ?? 0) / 100,
      feeCollection: feeCollection.value,
    });
    return { periods: n, nominal: r.nominalAnnualRate, real: r.annualIrrSimple };
  }),
);

// ------------------------------------------------------------------ 示例

const exampleData = {
  principal: 20000,
  periods: 12,
  feeRatePercent: 0.75,
  feeCollection: 'installment' as FeeCollection,
};

function loadExample() {
  principal.value = exampleData.principal;
  periods.value = exampleData.periods;
  feeRatePercent.value = exampleData.feeRatePercent;
  feeCollection.value = exampleData.feeCollection;
}
</script>

<template>
  <div flex flex-col gap-3>
    <div flex justify-end>
      <ToolExampleButton @click="loadExample" />
    </div>

    <c-card :title="t('tools.credit-card-installment-calculator.texts.title-input')">
      <div flex items-center gap-2 mb-3 flex-wrap>
        <span w-140px text-sm op-70 shrink-0>{{ t('tools.credit-card-installment-calculator.texts.label-principal') }}</span>
        <n-input-number-i18n v-model:value="principal" w-200px :min="0" :show-button="false" />
        <span op-70>{{ t('tools.credit-card-installment-calculator.texts.unit-yuan') }}</span>
      </div>

      <c-buttons-select
        v-model:value="periods"
        :options="periodOptions"
        :label="t('tools.credit-card-installment-calculator.texts.label-periods')"
        label-position="left"
        label-width="140px"
        mb-3
      />

      <div flex items-center gap-2 mb-3 flex-wrap>
        <span w-140px text-sm op-70 shrink-0>{{ t('tools.credit-card-installment-calculator.texts.label-fee-rate') }}</span>
        <n-input-number-i18n v-model:value="feeRatePercent" w-200px :min="0" :max="10" :step="0.05" :show-button="false" />
        <span op-70>%</span>
      </div>

      <c-buttons-select
        v-model:value="feeCollection"
        :options="[
          { label: t('tools.credit-card-installment-calculator.texts.collection-installment'), value: 'installment' },
          { label: t('tools.credit-card-installment-calculator.texts.collection-upfront'), value: 'upfront' },
        ]"
        :label="t('tools.credit-card-installment-calculator.texts.label-collection')"
        label-position="left"
        label-width="140px"
        mb-3
      />

      <div text-sm op-60>{{ t('tools.credit-card-installment-calculator.texts.hint-fee-rate') }}</div>
    </c-card>

    <c-card :title="t('tools.credit-card-installment-calculator.texts.title-result')">
      <div text-sm op-70>{{ t('tools.credit-card-installment-calculator.texts.label-real-rate') }}</div>
      <div text-3xl font-bold mb-1>{{ percent(result.annualIrrSimple) }}</div>
      <div op-70 mb-3>
        {{ t('tools.credit-card-installment-calculator.texts.label-real-rate-suffix') }}
      </div>

      <div grid grid-cols-1 md:grid-cols-2 gap-2>
        <div>
          <span op-60 text-sm>{{ t('tools.credit-card-installment-calculator.texts.label-nominal-rate') }}</span>
          <div font-medium>{{ percent(result.nominalAnnualRate) }}（{{ periods }}{{ t('tools.credit-card-installment-calculator.texts.unit-period') }} × {{ feeRatePercent }}%）</div>
        </div>
        <div>
          <span op-60 text-sm>{{ t('tools.credit-card-installment-calculator.texts.label-gap') }}</span>
          <div font-medium>{{ gapRatio.toFixed(2) }}{{ t('tools.credit-card-installment-calculator.texts.unit-times') }}</div>
        </div>
        <div>
          <span op-60 text-sm>{{ t('tools.credit-card-installment-calculator.texts.label-payment') }}</span>
          <div font-medium>¥{{ money(result.paymentPerPeriod) }}</div>
        </div>
        <div>
          <span op-60 text-sm>{{ t('tools.credit-card-installment-calculator.texts.label-total-fee') }}</span>
          <div font-medium>¥{{ money(result.totalFee) }}</div>
        </div>
        <div>
          <span op-60 text-sm>{{ t('tools.credit-card-installment-calculator.texts.label-total-repayment') }}</span>
          <div font-medium>¥{{ money(result.totalRepayment) }}</div>
        </div>
        <div>
          <span op-60 text-sm>{{ t('tools.credit-card-installment-calculator.texts.label-monthly-irr') }}</span>
          <div font-medium>{{ percent(result.monthlyIrr) }}</div>
        </div>
        <div>
          <span op-60 text-sm>{{ t('tools.credit-card-installment-calculator.texts.label-compound-rate') }}</span>
          <div font-medium>{{ percent(result.annualIrrCompound) }}</div>
        </div>
      </div>
    </c-card>

    <c-card :title="t('tools.credit-card-installment-calculator.texts.title-compare')">
      <div flex flex-col gap-2>
        <div
          v-for="row in periodComparison"
          :key="row.periods"
          flex items-center gap-3 flex-wrap border="~ gray-200 dark:gray-700"
          rounded
          px-3
          py-2
        >
          <span font-bold w-70px shrink-0>{{ row.periods }}{{ t('tools.credit-card-installment-calculator.texts.unit-period') }}</span>
          <span text-sm w-180px shrink-0 op-70>
            {{ t('tools.credit-card-installment-calculator.texts.label-nominal-rate') }}{{ percent(row.nominal) }}
          </span>
          <span text-sm w-180px shrink-0>
            {{ t('tools.credit-card-installment-calculator.texts.label-real-rate') }}{{ percent(row.real) }}
          </span>
          <span
            v-if="row.periods === periods"
            text-xs px-2 py-0.5 rounded-full
            bg-blue-100
            dark:bg-blue-900
          >
            {{ t('tools.credit-card-installment-calculator.texts.tag-current') }}
          </span>
        </div>
      </div>
      <div mt-3 text-sm op-60>{{ t('tools.credit-card-installment-calculator.texts.hint-compare') }}</div>
    </c-card>

    <c-alert :title="t('tools.credit-card-installment-calculator.texts.title-notice')">
      {{ t('tools.credit-card-installment-calculator.texts.hint-notice') }}
    </c-alert>
  </div>
</template>
