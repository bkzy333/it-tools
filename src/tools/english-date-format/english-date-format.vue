<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { allEnglishDateFormats } from './english-date-format.service';

const { t } = useI18n();

const input = ref('2022-10-24');
const error = ref('');

const formats = computed(() => {
  if (!input.value.trim()) {
    error.value = '';
    return null;
  }
  try {
    error.value = '';
    return allEnglishDateFormats(input.value);
  } catch (e) {
    error.value = (e as Error).message;
    return null;
  }
});

const exampleData = { date: '2022-10-24' };

function loadExample() {
  input.value = exampleData.date;
}
</script>

<template>
  <div flex flex-col gap-3>
    <div flex justify-end>
      <ToolExampleButton @click="loadExample" />
    </div>

    <c-card :title="t('tools.english-date-format.texts.title-input')">
      <c-input-text
        v-model:value="input"
        :placeholder="t('tools.english-date-format.texts.placeholder-date')"
        clearable
      />
      <div v-if="error" mt-2 text-red-500>{{ error }}</div>
    </c-card>

    <c-card v-if="formats" :title="t('tools.english-date-format.texts.title-result')">
      <div flex flex-col gap-2>
        <div v-for="(value, key) in formats" :key="key" flex items-center justify-between gap-3>
          <span op-60 text-sm font-mono>{{ key }}</span>
          <input-copyable :value="value" />
        </div>
      </div>
    </c-card>
  </div>
</template>
