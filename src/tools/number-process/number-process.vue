<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMessage } from 'naive-ui';
import { processNumbers, type NumberOp } from './number-process.service';
import { useCopy } from '@/composable/copy';

const { t } = useI18n();
const message = useMessage();

const op = ref<NumberOp>('addThousands');
const precision = ref<number | null>(null);
const sep = ref(',');
const currency = ref('USD');

const opOptions = computed(() => [
  { value: 'addThousands', label: t('tools.number-process.texts.op-add-thousands') },
  { value: 'removeThousands', label: t('tools.number-process.texts.op-remove-thousands') },
  { value: 'toScientific', label: t('tools.number-process.texts.op-to-scientific') },
  { value: 'fromScientific', label: t('tools.number-process.texts.op-from-scientific') },
  { value: 'toEnglish', label: t('tools.number-process.texts.op-to-english') },
  { value: 'toEnglishAmount', label: t('tools.number-process.texts.op-to-english-amount') },
  { value: 'toChineseAmount', label: t('tools.number-process.texts.op-to-chinese-amount') },
  { value: 'toRoman', label: t('tools.number-process.texts.op-to-roman') },
  { value: 'fromRoman', label: t('tools.number-process.texts.op-from-roman') },
  { value: 'toRomanUnicode', label: t('tools.number-process.texts.op-to-roman-unicode') },
  { value: 'fromRomanUnicode', label: t('tools.number-process.texts.op-from-roman-unicode') },
]);

const currencyOptions = computed(() => [
  { value: 'USD', label: 'USD - US DOLLARS' },
  { value: 'CNY', label: 'CNY - CHINESE YUAN' },
  { value: 'EUR', label: 'EUR - EURO' },
  { value: 'GBP', label: 'GBP - POUNDS STERLING' },
  { value: 'JPY', label: 'JPY - JAPANESE YEN' },
  { value: 'HKD', label: 'HKD - HONG KONG DOLLARS' },
]);

const needsPrecision = computed(() =>
  ['addThousands', 'removeThousands', 'toScientific', 'fromScientific'].includes(op.value),
);
const needsSep = computed(() => ['addThousands', 'removeThousands'].includes(op.value));
const needsCurrency = computed(() => op.value === 'toEnglishAmount');

const defaultValue = '120943423.4567\n-120943423.4567';
const input = ref(defaultValue);

function loadExample() {
  input.value = defaultValue;
  precision.value = null;
  sep.value = ',';
  currency.value = 'USD';
}

const result = computed(() => {
  if (input.value.trim() === '') {
    return { lines: [] as { ok: boolean; value: string }[], warnings: [] as string[] };
  }
  return processNumbers(input.value, {
    op: op.value,
    precision: precision.value,
    thousandsSep: sep.value,
    currency: currency.value,
  });
});

const output = computed(() => result.value.lines.map((l) => l.value).join('\n'));
const warnings = computed(() => result.value.warnings);
const hasWarnings = computed(() => warnings.value.length > 0);

const { copy } = useCopy();

function copyAll() {
  if (!output.value) {
    message.warning(t('tools.number-process.texts.msg-empty'));
    return;
  }
  copy(output.value, { notificationMessage: t('tools.number-process.texts.msg-copied') });
}

function download(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportTxt() {
  if (!output.value) {
    message.warning(t('tools.number-process.texts.msg-empty'));
    return;
  }
  download(output.value, 'number-process.txt', 'text/plain;charset=utf-8');
}

function exportCsv() {
  if (!output.value) {
    message.warning(t('tools.number-process.texts.msg-empty'));
    return;
  }
  download('﻿' + output.value, 'number-process.csv', 'text/csv;charset=utf-8');
}
</script>

<template>
  <div flex flex-col gap-3>
    <div flex justify-end>
      <ToolExampleButton @click="loadExample" />
    </div>

    <c-card :title="t('tools.number-process.texts.options-title')">
      <n-space vertical :size="14">
        <div flex flex-wrap items-center gap-3>
          <span text-sm op-70>{{ t('tools.number-process.texts.label-operation') }}</span>
          <c-select
            v-model:value="op"
            :options="opOptions"
            style="min-width: 240px; max-width: 100%"
          />
        </div>

        <div v-if="needsSep" flex flex-wrap items-center gap-3>
          <span text-sm op-70>{{ t('tools.number-process.texts.label-sep') }}</span>
          <c-input-text v-model:value="sep" w-16 />
        </div>

        <div v-if="needsPrecision" flex flex-wrap items-center gap-3>
          <span text-sm op-70>{{ t('tools.number-process.texts.label-precision') }}</span>
          <n-input-number
            v-model:value="precision"
            :show-button="false"
            :min="0"
            :max="20"
            clearable
            style="width: 140px"
          />
          <span text-xs op-50>{{ t('tools.number-process.texts.hint-precision') }}</span>
        </div>

        <div v-if="needsCurrency" flex flex-wrap items-center gap-3>
          <span text-sm op-70>{{ t('tools.number-process.texts.label-currency') }}</span>
          <c-select
            v-model:value="currency"
            :options="currencyOptions"
            style="min-width: 240px; max-width: 100%"
          />
        </div>

        <p v-if="needsCurrency" m-0 text-xs op-60>
          {{ t('tools.number-process.texts.note-english-amount') }}
        </p>
      </n-space>
    </c-card>

    <c-card :title="t('tools.number-process.texts.input-label')">
      <c-input-text
        v-model:value="input"
        :placeholder="t('tools.number-process.texts.input-placeholder')"
        multiline
        rows="8"
        clearable
      />
    </c-card>

    <c-card v-if="output" :title="t('tools.number-process.texts.output-label')">
      <c-input-text :value="output" multiline rows="8" readonly />
      <n-alert v-if="hasWarnings" type="warning" :show-icon="true" mt-3>
        <ul m-0 pl-4>
          <li v-for="(w, i) in warnings" :key="i">{{ w }}</li>
        </ul>
      </n-alert>
      <div flex flex-wrap gap-2 mt-3>
        <c-button secondary @click="copyAll">{{ t('tools.number-process.texts.action-copy') }}</c-button>
        <c-button secondary @click="exportTxt">{{ t('tools.number-process.texts.action-export-txt') }}</c-button>
        <c-button secondary @click="exportCsv">{{ t('tools.number-process.texts.action-export-csv') }}</c-button>
      </div>
    </c-card>
  </div>
</template>
