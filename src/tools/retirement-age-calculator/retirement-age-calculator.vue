<script setup lang="ts">
/**
 * 法定退休年龄计算器（渐进式延迟退休）。
 *
 * 只负责收三个输入（人员类型、出生年、出生月）并把 retirement.service.ts 算出的
 * 结果翻译成人话。所有政策口径和公式都写在 service 里，这里不做二次加工 ——
 * 一旦算法要改（比如政策再调整），只改 service，页面不用动。
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { computeRetirement, splitAgeMonths, type WorkerType } from './retirement.service';

const { t } = useI18n();

const workerType = ref<WorkerType>('male');
const birthYear = ref(1990);
const birthMonth = ref(1);

const typeOptions = computed(() => [
  { label: t('tools.retirement-age-calculator.texts.type-male'), value: 'male' as const },
  { label: t('tools.retirement-age-calculator.texts.type-female-manager'), value: 'female-manager' as const },
  { label: t('tools.retirement-age-calculator.texts.type-female-worker'), value: 'female-worker' as const },
]);

const monthOptions = computed(() =>
  Array.from({ length: 12 }, (_, i) => ({ label: `${i + 1} ${t('tools.retirement-age-calculator.texts.label-month')}`, value: i + 1 })),
);

const result = computed(() => computeRetirement(birthYear.value, birthMonth.value, workerType.value));

function formatAgeMonths(totalMonths: number): string {
  const { years, months } = splitAgeMonths(totalMonths);
  return `${years}${t('tools.retirement-age-calculator.texts.unit-age-short')}${months}${t(
    'tools.retirement-age-calculator.texts.unit-month',
  )}`;
}

function formatYears(years: number): string {
  const whole = Math.floor(years);
  const half = years - whole;
  return half === 0 ? `${whole}${t('tools.retirement-age-calculator.texts.unit-year')}` : `${whole}${t('tools.retirement-age-calculator.texts.unit-year')}6${t('tools.retirement-age-calculator.texts.unit-month')}`;
}

// ------------------------------------------------------------------ 示例

const exampleData = {
  workerType: 'male' as WorkerType,
  birthYear: 1990,
  birthMonth: 5,
};

function loadExample() {
  workerType.value = exampleData.workerType;
  birthYear.value = exampleData.birthYear;
  birthMonth.value = exampleData.birthMonth;
}
</script>

<template>
  <div flex flex-col gap-3>
    <div flex justify-end>
      <ToolExampleButton @click="loadExample" />
    </div>

    <c-card :title="t('tools.retirement-age-calculator.texts.title-input')">
      <c-buttons-select
        v-model:value="workerType"
        :options="typeOptions"
        :label="t('tools.retirement-age-calculator.texts.label-worker-type')"
        label-width="90px"
        label-position="left"
        mb-3
      />

      <div flex items-center gap-2 flex-wrap>
        <span w-90px text-sm op-70 shrink-0>{{ t('tools.retirement-age-calculator.texts.label-birth') }}</span>
        <n-input-number-i18n
          v-model:value="birthYear"
          w-140px
          :min="1940"
          :max="2010"
          :show-button="false"
          :placeholder="t('tools.retirement-age-calculator.texts.placeholder-year')"
        />
        <span op-70>{{ t('tools.retirement-age-calculator.texts.unit-year') }}</span>
        <n-select v-model:value="birthMonth" w-130px :options="monthOptions" />
      </div>

      <div mt-3 text-sm op-60>
        {{ t('tools.retirement-age-calculator.texts.hint-input') }}
      </div>
    </c-card>

    <c-card :title="t('tools.retirement-age-calculator.texts.title-result')">
      <div text-3xl font-bold mb-1>{{ formatAgeMonths(result.retireAgeMonths) }}</div>
      <div op-70 mb-3>
        {{ result.retireYear }}{{ t('tools.retirement-age-calculator.texts.unit-date-year') }}{{ result.retireMonth
        }}{{ t('tools.retirement-age-calculator.texts.unit-date-month') }}
        {{ t('tools.retirement-age-calculator.texts.label-retire-date-suffix') }}
      </div>

      <div grid grid-cols-1 md:grid-cols-2 gap-2>
        <div>
          <span op-60 text-sm>{{ t('tools.retirement-age-calculator.texts.label-original-age') }}</span>
          <div font-medium>{{ result.originalAge }}{{ t('tools.retirement-age-calculator.texts.unit-age') }}</div>
        </div>
        <div>
          <span op-60 text-sm>{{ t('tools.retirement-age-calculator.texts.label-delay') }}</span>
          <div font-medium>
            {{ result.delayMonths }}{{ t('tools.retirement-age-calculator.texts.unit-month') }}
          </div>
        </div>
        <div>
          <span op-60 text-sm>{{ t('tools.retirement-age-calculator.texts.label-earliest') }}</span>
          <div font-medium>{{ formatAgeMonths(result.earliestFlexibleMonths) }}</div>
        </div>
        <div>
          <span op-60 text-sm>{{ t('tools.retirement-age-calculator.texts.label-latest') }}</span>
          <div font-medium>{{ formatAgeMonths(result.latestFlexibleMonths) }}</div>
        </div>
        <div>
          <span op-60 text-sm>{{ t('tools.retirement-age-calculator.texts.label-min-contribution') }}</span>
          <div font-medium>{{ formatYears(result.minContributionYears) }}</div>
        </div>
      </div>
    </c-card>

    <c-alert :title="t('tools.retirement-age-calculator.texts.title-notice')">
      {{ t('tools.retirement-age-calculator.texts.hint-notice') }}
    </c-alert>
  </div>
</template>
