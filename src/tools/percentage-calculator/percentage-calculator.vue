<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import ToolExampleButton from '@/components/ToolExampleButton.vue';

const { t } = useI18n();

// 原来六个框全空，用户得自己想数字才看得到结果。
// 这三组示例互相呼应（15% × 200 = 30、30/200 = 15%、100→130 涨 30%），
// 打开就能明白三个卡片分别是「求部分」「求占比」「求涨跌」。
const exampleData = {
  percentageX: 15,
  percentageY: 200,
  numberX: 30,
  numberY: 200,
  numberFrom: 100,
  numberTo: 130,
};

const percentageX = ref(exampleData.percentageX);
const percentageY = ref(exampleData.percentageY);
const percentageResult = computed(() => {
  if (percentageX.value === undefined || percentageY.value === undefined) {
    return '';
  }
  return ((percentageX.value / 100) * percentageY.value).toString();
});

const numberX = ref(exampleData.numberX);
const numberY = ref(exampleData.numberY);
const numberResult = computed(() => {
  if (numberX.value === undefined || numberY.value === undefined) {
    return '';
  }
  const result = (100 * numberX.value) / numberY.value;
  return !Number.isFinite(result) || Number.isNaN(result) ? '' : result.toString();
});

const numberFrom = ref(exampleData.numberFrom);
const numberTo = ref(exampleData.numberTo);
const percentageIncreaseDecrease = computed(() => {
  if (numberFrom.value === undefined || numberTo.value === undefined) {
    return '';
  }
  const result = ((numberTo.value - numberFrom.value) / numberFrom.value) * 100;
  return !Number.isFinite(result) || Number.isNaN(result) ? '' : result.toString();
});

function loadExample() {
  percentageX.value = exampleData.percentageX;
  percentageY.value = exampleData.percentageY;
  numberX.value = exampleData.numberX;
  numberY.value = exampleData.numberY;
  numberFrom.value = exampleData.numberFrom;
  numberTo.value = exampleData.numberTo;
}
</script>

<template>
  <div style="flex: 0 0 100%">
    <div style="margin: 0 auto; max-width: 600px">
      <div flex justify-end mb-2>
        <ToolExampleButton @click="loadExample" />
      </div>

      <c-card mb-3>
        <div mb-3 sm:hidden>
          {{ t('tools.percentage-calculator.texts.tag-what-is') }}
        </div>
        <div flex gap-2>
          <div hidden pt-1 sm:block style="min-width: 48px">
            {{ t('tools.percentage-calculator.texts.tag-what-is') }}
          </div>
          <n-input-number-i18n
            v-model:value="percentageX"
            data-test-id="percentageX"
            :placeholder="t('tools.percentage-calculator.texts.placeholder-x')"
          />
          <div min-w-fit pt-1>
            {{ t('tools.percentage-calculator.texts.tag-of') }}
          </div>
          <n-input-number-i18n
            v-model:value="percentageY"
            data-test-id="percentageY"
            :placeholder="t('tools.percentage-calculator.texts.placeholder-y')"
          />
          <input-copyable
            v-model:value="percentageResult"
            data-test-id="percentageResult"
            readonly
            :placeholder="t('tools.percentage-calculator.texts.placeholder-result')"
            style="max-width: 150px"
          />
        </div>
      </c-card>

      <c-card mb-3>
        <div mb-3 sm:hidden>
          {{ t('tools.percentage-calculator.texts.tag-x-is-what-percent-of-y') }}
        </div>
        <div flex gap-2>
          <n-input-number-i18n
            v-model:value="numberX"
            data-test-id="numberX"
            :placeholder="t('tools.percentage-calculator.texts.placeholder-x')"
          />
          <div hidden min-w-fit pt-1 sm:block>
            {{ t('tools.percentage-calculator.texts.tag-is-what-percent-of') }}
          </div>
          <n-input-number-i18n
            v-model:value="numberY"
            data-test-id="numberY"
            :placeholder="t('tools.percentage-calculator.texts.placeholder-y')"
          />
          <input-copyable
            v-model:value="numberResult"
            data-test-id="numberResult"
            readonly
            :placeholder="t('tools.percentage-calculator.texts.placeholder-result')"
            style="max-width: 150px"
          />
        </div>
      </c-card>

      <c-card mb-3>
        <div mb-3>
          {{ t('tools.percentage-calculator.texts.tag-what-is-the-percentage-increase-decrease') }}
        </div>
        <div flex gap-2>
          <n-input-number-i18n
            v-model:value="numberFrom"
            data-test-id="numberFrom"
            :placeholder="t('tools.percentage-calculator.texts.placeholder-from')"
          />
          <n-input-number-i18n
            v-model:value="numberTo"
            data-test-id="numberTo"
            :placeholder="t('tools.percentage-calculator.texts.placeholder-to')"
          />
          <input-copyable
            v-model:value="percentageIncreaseDecrease"
            data-test-id="percentageIncreaseDecrease"
            readonly
            :placeholder="t('tools.percentage-calculator.texts.placeholder-result')"
            style="max-width: 150px"
          />
        </div>
      </c-card>
    </div>
  </div>
</template>
