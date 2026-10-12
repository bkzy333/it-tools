<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMessage } from 'naive-ui';
import JSON5 from 'json5';
import { convertArrayToCsv, getTableHeaders, type NestedMode } from './json-to-csv.service';
import { useCopy } from '@/composable/copy';

const { t } = useI18n();
const message = useMessage();

const defaultValue =
  '[\n  {\n    "name": "Alice",\n    "age": 30,\n    "address": { "city": "Beijing", "zip": "100000" }\n  },\n  {\n    "name": "Bob",\n    "age": 25,\n    "tags": ["a", "b"]\n  }\n]';

const input = ref(defaultValue);
const nested = ref<NestedMode>('all');
const trim = ref(false);
const skipEmptyRows = ref(false);
const columns = ref<string[]>([]);

function loadExample() {
  input.value = defaultValue;
  nested.value = 'all';
  trim.value = false;
  skipEmptyRows.value = false;
  columns.value = [];
}

const parsed = computed(() => {
  if (input.value.trim() === '') {
    return null;
  }
  try {
    return JSON5.parse(input.value);
  } catch {
    return null;
  }
});

const parseError = computed(() => {
  if (input.value.trim() === '') {
    return '';
  }
  try {
    JSON5.parse(input.value);
    return '';
  } catch {
    return t('tools.json-to-csv.texts.message-provided-json-is-not-valid');
  }
});

// 列选择的可选项：按当前嵌套模式拍平后的所有表头
const headerOptions = computed(() => {
  if (!parsed.value) {
    return [];
  }
  return getTableHeaders(parsed.value, nested.value);
});

const csv = computed(() => {
  if (!parsed.value) {
    return '';
  }
  return convertArrayToCsv({
    arrayOrObject: parsed.value,
    nested: nested.value,
    trim: trim.value,
    skipEmptyRows: skipEmptyRows.value,
    // 列选择留空 = 全部列
    columns: columns.value.length ? columns.value : undefined,
  });
});

const { copy: copyCsv } = useCopy();

function copyAll() {
  if (!csv.value) {
    message.warning(t('tools.json-to-csv.texts.msg-empty'));
    return;
  }
  copyCsv(csv.value, { notificationMessage: t('tools.json-to-csv.texts.msg-copied') });
}

function exportCsv() {
  if (!csv.value) {
    message.warning(t('tools.json-to-csv.texts.msg-empty'));
    return;
  }
  const blob = new Blob(['﻿' + csv.value], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'output.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div flex flex-col gap-3>
    <div flex justify-end>
      <ToolExampleButton @click="loadExample" />
    </div>

    <c-card :title="t('tools.json-to-csv.texts.input-label-your-raw-json')">
      <c-input-text
        v-model:value="input"
        :placeholder="t('tools.json-to-csv.texts.input-placeholder-paste-your-raw-json-here')"
        multiline
        rows="8"
        clearable
      />
      <p v-if="parseError" mt-2 mb-0 text-sm text-red-500>
        {{ parseError }}
      </p>
    </c-card>

    <c-card :title="t('tools.json-to-csv.texts.options-title')">
      <n-space vertical :size="14">
        <div flex flex-wrap items-center gap-3>
          <span text-sm op-70>{{ t('tools.json-to-csv.texts.nested-title') }}</span>
          <n-radio-group v-model:value="nested" size="small">
            <n-radio-button value="none">{{ t('tools.json-to-csv.texts.nested-none') }}</n-radio-button>
            <n-radio-button value="objects">{{ t('tools.json-to-csv.texts.nested-objects') }}</n-radio-button>
            <n-radio-button value="arrays">{{ t('tools.json-to-csv.texts.nested-arrays') }}</n-radio-button>
            <n-radio-button value="all">{{ t('tools.json-to-csv.texts.nested-both') }}</n-radio-button>
          </n-radio-group>
        </div>

        <div flex flex-wrap items-center gap-3>
          <span text-sm op-70>{{ t('tools.json-to-csv.texts.trim-title') }}</span>
          <n-radio-group v-model:value="trim" size="small">
            <n-radio-button :value="true">{{ t('tools.json-to-csv.texts.trim-remove') }}</n-radio-button>
            <n-radio-button :value="false">{{ t('tools.json-to-csv.texts.trim-keep') }}</n-radio-button>
          </n-radio-group>
        </div>

        <div flex flex-wrap items-center gap-3>
          <span text-sm op-70>{{ t('tools.json-to-csv.texts.empty-title') }}</span>
          <n-radio-group v-model:value="skipEmptyRows" size="small">
            <n-radio-button :value="true">{{ t('tools.json-to-csv.texts.empty-remove') }}</n-radio-button>
            <n-radio-button :value="false">{{ t('tools.json-to-csv.texts.empty-keep') }}</n-radio-button>
          </n-radio-group>
        </div>

        <div flex flex-wrap items-center gap-3>
          <span text-sm op-70>{{ t('tools.json-to-csv.texts.columns-title') }}</span>
          <n-select
            v-model:value="columns"
            multiple
            :placeholder="t('tools.json-to-csv.texts.columns-all')"
            :options="headerOptions.map((h) => ({ label: h, value: h }))"
            style="min-width: 280px; max-width: 100%"
            :disabled="headerOptions.length === 0"
          />
        </div>
      </n-space>
    </c-card>

    <c-card v-if="csv" :title="t('tools.json-to-csv.texts.output-label-csv-version-of-your-json')">
      <c-input-text :value="csv" multiline rows="8" readonly />
      <div flex flex-wrap gap-2 mt-3>
        <c-button secondary @click="copyAll">{{ t('tools.json-to-csv.texts.action-copy') }}</c-button>
        <c-button secondary @click="exportCsv">{{ t('tools.json-to-csv.texts.action-export-csv') }}</c-button>
      </div>
    </c-card>
  </div>
</template>
