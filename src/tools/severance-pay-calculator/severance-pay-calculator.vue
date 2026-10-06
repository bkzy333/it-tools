<script setup lang="ts">
/**
 * 离职经济补偿金计算器。
 *
 * 页面只做「收输入 → 展示 service 的结果 → 把容易误解的地方说清楚」。
 * 「当地上年度职工月平均工资」做成可选项而不是必填：绝大多数人的工资没超过社平三倍，
 * 填了反而要为查一个当地数字卡住；但如果超了，不填就会算多，所以给一行提示明确说出这件事。
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { computeSeverance, monthsToYearsText } from './severance.service';

const { t } = useI18n();

function toIso(timestamp: number | null): string {
  if (timestamp === null) {
    return '';
  }
  const d = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function yearsAgo(years: number): number {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.getTime();
}

const startDate = ref<number | null>(yearsAgo(4));
const endDate = ref<number | null>(Date.now());
const monthlyWage = ref(20000);
const localAverageWage = ref<number | null>(null);

const result = computed(() =>
  computeSeverance({
    startDate: toIso(startDate.value),
    endDate: toIso(endDate.value),
    monthlyWage: monthlyWage.value ?? 0,
    localAverageWage: localAverageWage.value,
  }),
);

const workText = computed(() =>
  monthsToYearsText(
    result.value.workMonths,
    t('tools.severance-pay-calculator.texts.unit-year'),
    t('tools.severance-pay-calculator.texts.unit-month'),
  ),
);

const formatMoney = (value: number) =>
  value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ------------------------------------------------------------------ 示例

const exampleData = {
  startYearsAgo: 6,
  monthlyWage: 28000,
  localAverageWage: 8000,
};

function loadExample() {
  startDate.value = yearsAgo(exampleData.startYearsAgo);
  endDate.value = Date.now();
  monthlyWage.value = exampleData.monthlyWage;
  localAverageWage.value = exampleData.localAverageWage;
}
</script>

<template>
  <div flex flex-col gap-3>
    <div flex justify-end>
      <ToolExampleButton @click="loadExample" />
    </div>

    <c-card :title="t('tools.severance-pay-calculator.texts.title-input')">
      <div flex items-center gap-2 mb-3 flex-wrap>
        <span w-140px text-sm op-70 shrink-0>{{ t('tools.severance-pay-calculator.texts.label-start') }}</span>
        <n-date-picker v-model:value="startDate" type="date" w-180px />
      </div>

      <div flex items-center gap-2 mb-3 flex-wrap>
        <span w-140px text-sm op-70 shrink-0>{{ t('tools.severance-pay-calculator.texts.label-end') }}</span>
        <n-date-picker v-model:value="endDate" type="date" w-180px />
      </div>

      <div flex items-center gap-2 mb-3 flex-wrap>
        <span w-140px text-sm op-70 shrink-0>{{ t('tools.severance-pay-calculator.texts.label-wage') }}</span>
        <n-input-number-i18n v-model:value="monthlyWage" w-200px :min="0" :show-button="false" />
        <span op-70>{{ t('tools.severance-pay-calculator.texts.unit-yuan-per-month') }}</span>
      </div>

      <div flex items-center gap-2 flex-wrap>
        <span w-140px text-sm op-70 shrink-0>{{ t('tools.severance-pay-calculator.texts.label-local-wage') }}</span>
        <n-input-number-i18n
          v-model:value="localAverageWage"
          w-200px
          :min="0"
          :show-button="false"
          :placeholder="t('tools.severance-pay-calculator.texts.placeholder-optional')"
        />
        <span op-70>{{ t('tools.severance-pay-calculator.texts.unit-yuan-per-month') }}</span>
      </div>

      <div mt-3 text-sm op-60>
        {{ t('tools.severance-pay-calculator.texts.hint-local-wage') }}
      </div>
    </c-card>

    <c-card :title="t('tools.severance-pay-calculator.texts.title-result')">
      <div text-sm op-70>{{ t('tools.severance-pay-calculator.texts.label-compensation') }}</div>
      <div text-3xl font-bold mb-1>
        ¥{{ formatMoney(result.compensation) }}
      </div>
      <div op-70 mb-3>
        {{ result.compensatedMonths }}{{ t('tools.severance-pay-calculator.texts.unit-month')
        }}{{ t('tools.severance-pay-calculator.texts.hint-times-base') }} ¥{{ formatMoney(result.baseWage) }}
      </div>

      <div grid grid-cols-1 md:grid-cols-2 gap-2 mt-3>
        <div>
          <span op-60 text-sm>{{ t('tools.severance-pay-calculator.texts.label-work-length') }}</span>
          <div font-medium>
            {{ workText }}（{{ result.workMonths }}{{ t('tools.severance-pay-calculator.texts.unit-month') }}）
          </div>
        </div>
        <div>
          <span op-60 text-sm>{{ t('tools.severance-pay-calculator.texts.label-n') }}</span>
          <div font-medium>{{ result.compensatedMonths }}</div>
        </div>
        <div>
          <span op-60 text-sm>{{ t('tools.severance-pay-calculator.texts.label-base') }}</span>
          <div font-medium>¥{{ formatMoney(result.baseWage) }}</div>
        </div>
        <div>
          <span op-60 text-sm>{{ t('tools.severance-pay-calculator.texts.label-double') }}</span>
          <div font-medium>
            ¥{{ formatMoney(result.doubleCompensation) }}
          </div>
        </div>
      </div>

      <c-alert v-if="result.capped" mt-3 :title="t('tools.severance-pay-calculator.texts.title-capped')">
        {{ t('tools.severance-pay-calculator.texts.hint-capped-before') }}¥{{ formatMoney(result.tripleCap ?? 0)
        }}{{ t('tools.severance-pay-calculator.texts.hint-capped-after') }}
        <span v-if="result.yearsCapped">{{ t('tools.severance-pay-calculator.texts.hint-years-capped') }}</span>
      </c-alert>
      <div v-else-if="result.tripleCap" mt-3 text-sm op-60>
        {{ t('tools.severance-pay-calculator.texts.hint-not-capped') }}
      </div>
    </c-card>

    <c-alert type="warning" :title="t('tools.severance-pay-calculator.texts.title-notice')">
      {{ t('tools.severance-pay-calculator.texts.hint-notice') }}
    </c-alert>
  </div>
</template>
