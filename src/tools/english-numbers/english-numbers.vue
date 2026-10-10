<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { englishToNumber, numberToEnglish } from './english-numbers.service';

const { t } = useI18n();

const tab = ref<'to-english' | 'to-number'>('to-english');

const numberInput = ref('');
const hyphenated = ref(true);
const useComma = ref(true);
const englishInput = ref('');

// 结果用「单一 computed 派生出 { output, error }」表达，避免在 computed 里写 ref
// （副作用会让依赖追踪失真，并可能触发额外的渲染周期）。
const numberResult = computed(() => {
  const input = numberInput.value.trim();
  if (!input) {
    return { output: '', error: '' };
  }
  try {
    return {
      output: numberToEnglish(input, { hyphenated: hyphenated.value, useComma: useComma.value }),
      error: '',
    };
  }
  catch (e) {
    return { output: '', error: (e as Error).message };
  }
});
const numberOutput = computed(() => numberResult.value.output);
const numberError = computed(() => numberResult.value.error);

const englishResult = computed(() => {
  const input = englishInput.value.trim();
  if (!input) {
    return { output: '', error: '' };
  }
  try {
    return { output: englishToNumber(input), error: '' };
  }
  catch (e) {
    return { output: '', error: (e as Error).message };
  }
});
const englishOutput = computed(() => englishResult.value.output);
const englishError = computed(() => englishResult.value.error);

const exampleData = {
  number: '1234567.89',
  english: 'one million, two hundred and thirty-four thousand, five hundred and sixty-seven',
};

function loadExample() {
  if (tab.value === 'to-english') {
    numberInput.value = exampleData.number;
    hyphenated.value = true;
    useComma.value = true;
  } else {
    englishInput.value = exampleData.english;
  }
}
</script>

<template>
  <div flex flex-col gap-3>
    <div flex justify-end>
      <ToolExampleButton @click="loadExample" />
    </div>

    <n-tabs v-model:value="tab" type="line">
      <n-tab-pane name="to-english" :tab="t('tools.english-numbers.texts.tab-to-english')">
        <c-card :title="t('tools.english-numbers.texts.title-input-number')" mt-3>
          <c-input-text
            v-model:value="numberInput"
            :placeholder="t('tools.english-numbers.texts.placeholder-number')"
            clearable
          />
          <n-space mt-3>
            <n-checkbox v-model:checked="hyphenated">
              {{ t('tools.english-numbers.texts.opt-hyphenated') }}
            </n-checkbox>
            <n-checkbox v-model:checked="useComma">
              {{ t('tools.english-numbers.texts.opt-comma') }}
            </n-checkbox>
          </n-space>
          <div v-if="numberError" mt-2 text-red-500>{{ numberError }}</div>
        </c-card>

        <c-card :title="t('tools.english-numbers.texts.title-result')" mt-3>
          <input-copyable v-if="numberOutput" :value="numberOutput" />
          <div v-else op-60>{{ t('tools.english-numbers.texts.hint-empty') }}</div>
        </c-card>
      </n-tab-pane>

      <n-tab-pane name="to-number" :tab="t('tools.english-numbers.texts.tab-to-number')">
        <c-card :title="t('tools.english-numbers.texts.title-input-english')" mt-3>
          <c-input-text
            v-model:value="englishInput"
            :placeholder="t('tools.english-numbers.texts.placeholder-english')"
            multiline
            rows="3"
            clearable
          />
          <div v-if="englishError" mt-2 text-red-500>{{ englishError }}</div>
        </c-card>

        <c-card :title="t('tools.english-numbers.texts.title-result')" mt-3>
          <input-copyable v-if="englishOutput" :value="englishOutput" />
          <div v-else op-60>{{ t('tools.english-numbers.texts.hint-empty') }}</div>
        </c-card>
      </n-tab-pane>
    </n-tabs>
  </div>
</template>
