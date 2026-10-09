<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import ToolExampleButton from '@/components/ToolExampleButton.vue';
import { useCopy } from '@/composable/copy';
import {
  numberLines,
  NUMBERING_FORMATS,
  type NumberingFormat,
} from './text-numbering.service';

const { t } = useI18n();
const { copy } = useCopy();

const input = ref('');
const format = ref<NumberingFormat>('dot');
const start = ref(1);
const step = ref(1);
const padWidth = ref(0);
const spaceAfter = ref(false);

const formatOptions = computed(() =>
  NUMBERING_FORMATS.map(({ key, sample }) => ({
    value: key,
    label: `${sample}　${t(`tools.text-numbering.texts.opt-format-${key}`)}`,
  })),
);

const output = computed(() =>
  numberLines({
    input: input.value,
    format: format.value,
    start: Number(start.value) || 1,
    step: Number(step.value) || 1,
    padWidth: Number(padWidth.value) || 0,
    spaceAfter: spaceAfter.value,
  }),
);

const canCopy = computed(() => output.value.length > 0);

function copyResult() {
  copy(output.value);
}

function downloadResult() {
  const blob = new Blob([output.value], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = document.documentElement.lang.startsWith('zh') ? '加序号.txt' : 'numbered-lines.txt';
  anchor.click();
  URL.revokeObjectURL(url);
}

function clearAll() {
  input.value = '';
}

const exampleData = {
  input: '苹果\n香蕉\n橙子\n葡萄\n西瓜',
  format: 'dot' as NumberingFormat,
  start: 1,
  step: 1,
  padWidth: 0,
  spaceAfter: true,
};

function loadExample() {
  input.value = exampleData.input;
  format.value = exampleData.format;
  start.value = exampleData.start;
  step.value = exampleData.step;
  padWidth.value = exampleData.padWidth;
  spaceAfter.value = exampleData.spaceAfter;
}
</script>

<template>
  <c-card :title="t('tools.text-numbering.title')" max-w-800px>
    <div flex items-center justify-between gap-2 mb-2>
      <span />
      <ToolExampleButton @click="loadExample" />
    </div>

    <n-form-item :label="t('tools.text-numbering.texts.label-input')" label-placement="left" mb-1>
      <n-input
        v-model:value="input"
        type="textarea"
        :rows="8"
        :placeholder="t('tools.text-numbering.texts.placeholder-input')"
      />
    </n-form-item>

    <div grid grid-cols-1 sm:grid-cols-2 gap-3>
      <c-select
        v-model:value="format"
        :options="formatOptions"
        :label="t('tools.text-numbering.texts.label-format')"
        label-width="110px"
        label-position="left"
      />
      <div flex items-center gap-2>
        <span w-110px shrink-0 text-right>{{ t('tools.text-numbering.texts.label-start') }}</span>
        <n-input-number v-model:value="start" :show-button="false" w-120px />
      </div>
      <div flex items-center gap-2>
        <span w-110px shrink-0 text-right>{{ t('tools.text-numbering.texts.label-step') }}</span>
        <n-input-number v-model:value="step" :show-button="false" w-120px />
      </div>
      <div flex items-center gap-2>
        <span w-110px shrink-0 text-right>{{ t('tools.text-numbering.texts.label-pad') }}</span>
        <n-input-number v-model:value="padWidth" :min="0" :max="20" :show-button="false" w-120px />
      </div>
    </div>

    <n-checkbox v-model:checked="spaceAfter" mt-2>
      {{ t('tools.text-numbering.texts.opt-space-after') }}
    </n-checkbox>

    <c-card :title="t('tools.text-numbering.texts.title-result')" size="small" mt-3>
      <n-input :value="output" type="textarea" :rows="10" readonly
        :placeholder="t('tools.text-numbering.texts.placeholder-result')" />
      <div flex items-center gap-2 mt-2>
        <c-button type="primary" :disabled="!canCopy" @click="copyResult">
          {{ t('tools.text-numbering.texts.action-copy') }}
        </c-button>
        <c-button :disabled="!canCopy" @click="downloadResult">
          {{ t('tools.text-numbering.texts.action-download') }}
        </c-button>
        <c-button @click="clearAll">{{ t('tools.text-numbering.texts.action-clear') }}</c-button>
      </div>
    </c-card>
  </c-card>
</template>
