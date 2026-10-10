<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { dateStringToUppercase } from './date-uppercase.service';

const { t } = useI18n();

const input = ref('2026-10-09');

// 结果用「单一 computed 派生出 { result, error }」表达，避免在 computed 里写 ref
const computedResult = computed(() => {
  if (!input.value.trim()) {
    return { result: null, error: '' };
  }
  try {
    return { result: dateStringToUppercase(input.value), error: '' };
  }
  catch (e) {
    return { result: null, error: (e as Error).message };
  }
});
const result = computed(() => computedResult.value.result);
const error = computed(() => computedResult.value.error);

const exampleData = { date: '2026-10-09' };

function loadExample() {
  input.value = exampleData.date;
}
</script>

<template>
  <div flex flex-col gap-3>
    <div flex justify-end>
      <ToolExampleButton @click="loadExample" />
    </div>

    <c-card :title="t('tools.date-uppercase.texts.title-input')">
      <c-input-text
        v-model:value="input"
        :placeholder="t('tools.date-uppercase.texts.placeholder-date')"
        clearable
      />
      <div v-if="error" mt-2 text-red-500>{{ error }}</div>
    </c-card>

    <c-card :title="t('tools.date-uppercase.texts.title-result')">
      <template v-if="result">
        <div text-2xl font-bold mb-3>{{ result.full }}</div>
        <n-space>
          <n-tag>{{ t('tools.date-uppercase.texts.label-year') }} {{ result.year }}</n-tag>
          <n-tag>{{ t('tools.date-uppercase.texts.label-month') }} {{ result.month }}</n-tag>
          <n-tag>{{ t('tools.date-uppercase.texts.label-day') }} {{ result.day }}</n-tag>
        </n-space>
        <input-copyable :value="result.full" mt-3 />
      </template>
      <div v-else op-60>{{ t('tools.date-uppercase.texts.hint-empty') }}</div>
    </c-card>
  </div>
</template>
