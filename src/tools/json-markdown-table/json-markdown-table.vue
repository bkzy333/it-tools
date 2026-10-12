<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMessage } from 'naive-ui';
import JSON5 from 'json5';
import { arrayToMarkdown, markdownToArray, type NestedMode, type AlignmentMode } from './json-markdown-table.service';
import { useCopy } from '@/composable/copy';

const { t } = useI18n();
const message = useMessage();

const defaultValue = `[
  {
    "name": "Alice",
    "age": 30,
    "address": { "city": "Beijing", "zip": "100000" }
  },
  {
    "name": "Bob",
    "age": 25,
    "tags": ["a", "b"]
  }
]`;

type Direction = 'json2md' | 'md2json';

const direction = ref<Direction>('json2md');
const input = ref(defaultValue);
const nested = ref<NestedMode>('all');
const alignment = ref<AlignmentMode>('default');
const trim = ref(false);
const skipEmptyRows = ref(false);

function loadExample() {
  input.value = defaultValue;
  direction.value = 'json2md';
  nested.value = 'all';
  alignment.value = 'default';
  trim.value = false;
  skipEmptyRows.value = false;
}

const jsonError = computed(() => {
  if (direction.value !== 'json2md' || input.value.trim() === '') {
    return '';
  }
  try {
    JSON5.parse(input.value);
    return '';
  } catch {
    return t('tools.json-markdown-table.texts.msg-json-invalid');
  }
});

const parsed = computed(() => {
  if (direction.value !== 'json2md' || jsonError.value) {
    return null;
  }
  try {
    return JSON5.parse(input.value);
  } catch {
    return null;
  }
});

const mdRows = computed(() => {
  if (direction.value !== 'md2json') {
    return null;
  }
  return markdownToArray(input.value, trim.value);
});

const mdHint = computed(() => {
  if (direction.value !== 'md2json' || input.value.trim() === '') {
    return '';
  }
  return mdRows.value && mdRows.value.length > 0 ? '' : t('tools.json-markdown-table.texts.msg-no-table');
});

const output = computed(() => {
  if (direction.value === 'json2md') {
    if (!parsed.value) {
      return '';
    }
    return arrayToMarkdown({
      arrayOrObject: parsed.value,
      nested: nested.value,
      alignment: alignment.value,
      trim: trim.value,
      skipEmptyRows: skipEmptyRows.value,
    });
  }
  if (!mdRows.value || mdRows.value.length === 0) {
    return '';
  }
  return JSON.stringify(mdRows.value, null, 2);
});

const { copy: copyOut } = useCopy();

function copyAll() {
  if (!output.value) {
    message.warning(t('tools.json-markdown-table.texts.msg-empty'));
    return;
  }
  copyOut(output.value, { notificationMessage: t('tools.json-markdown-table.texts.msg-copied') });
}

function exportFile() {
  if (!output.value) {
    message.warning(t('tools.json-markdown-table.texts.msg-empty'));
    return;
  }
  const isMd = direction.value === 'json2md';
  const filename = isMd ? 'table.md' : 'table.json';
  const mime = isMd ? 'text/markdown' : 'application/json';
  const blob = new Blob(['﻿' + output.value], { type: `${mime};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
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

    <c-card :title="t('tools.json-markdown-table.texts.direction-title')">
      <n-radio-group v-model:value="direction">
        <n-radio-button value="json2md">{{ t('tools.json-markdown-table.texts.dir-json2md') }}</n-radio-button>
        <n-radio-button value="md2json">{{ t('tools.json-markdown-table.texts.dir-md2json') }}</n-radio-button>
      </n-radio-group>
    </c-card>

    <c-card
      :title="
        direction === 'json2md'
          ? t('tools.json-markdown-table.texts.input-label-json')
          : t('tools.json-markdown-table.texts.input-label-md')
      "
    >
      <c-input-text
        v-model:value="input"
        :placeholder="
          direction === 'json2md'
            ? t('tools.json-markdown-table.texts.placeholder-json')
            : t('tools.json-markdown-table.texts.placeholder-md')
        "
        multiline
        rows="8"
        clearable
      />
      <p v-if="jsonError || mdHint" mt-2 mb-0 text-sm text-red-500>
        {{ jsonError || mdHint }}
      </p>
    </c-card>

    <c-card :title="t('tools.json-markdown-table.texts.options-title')">
      <n-space vertical :size="14">
        <div v-if="direction === 'json2md'" flex flex-wrap items-center gap-3>
          <span text-sm op-70>{{ t('tools.json-markdown-table.texts.nested-title') }}</span>
          <n-radio-group v-model:value="nested" size="small">
            <n-radio-button value="none">{{ t('tools.json-markdown-table.texts.nested-none') }}</n-radio-button>
            <n-radio-button value="objects">{{ t('tools.json-markdown-table.texts.nested-objects') }}</n-radio-button>
            <n-radio-button value="arrays">{{ t('tools.json-markdown-table.texts.nested-arrays') }}</n-radio-button>
            <n-radio-button value="all">{{ t('tools.json-markdown-table.texts.nested-both') }}</n-radio-button>
          </n-radio-group>
        </div>

        <div v-if="direction === 'json2md'" flex flex-wrap items-center gap-3>
          <span text-sm op-70>{{ t('tools.json-markdown-table.texts.align-title') }}</span>
          <n-radio-group v-model:value="alignment" size="small">
            <n-radio-button value="default">{{ t('tools.json-markdown-table.texts.align-default') }}</n-radio-button>
            <n-radio-button value="left">{{ t('tools.json-markdown-table.texts.align-left') }}</n-radio-button>
            <n-radio-button value="center">{{ t('tools.json-markdown-table.texts.align-center') }}</n-radio-button>
            <n-radio-button value="right">{{ t('tools.json-markdown-table.texts.align-right') }}</n-radio-button>
          </n-radio-group>
        </div>

        <div flex flex-wrap items-center gap-3>
          <span text-sm op-70>{{ t('tools.json-markdown-table.texts.trim-title') }}</span>
          <n-radio-group v-model:value="trim" size="small">
            <n-radio-button :value="true">{{ t('tools.json-markdown-table.texts.trim-remove') }}</n-radio-button>
            <n-radio-button :value="false">{{ t('tools.json-markdown-table.texts.trim-keep') }}</n-radio-button>
          </n-radio-group>
        </div>

        <div v-if="direction === 'json2md'" flex flex-wrap items-center gap-3>
          <span text-sm op-70>{{ t('tools.json-markdown-table.texts.empty-title') }}</span>
          <n-radio-group v-model:value="skipEmptyRows" size="small">
            <n-radio-button :value="true">{{ t('tools.json-markdown-table.texts.empty-remove') }}</n-radio-button>
            <n-radio-button :value="false">{{ t('tools.json-markdown-table.texts.empty-keep') }}</n-radio-button>
          </n-radio-group>
        </div>
      </n-space>
    </c-card>

    <c-card v-if="output" :title="t('tools.json-markdown-table.texts.output-label')">
      <c-input-text :value="output" multiline rows="8" readonly />
      <div flex flex-wrap gap-2 mt-3>
        <c-button secondary @click="copyAll">{{ t('tools.json-markdown-table.texts.action-copy') }}</c-button>
        <c-button secondary @click="exportFile">
          {{
            direction === 'json2md'
              ? t('tools.json-markdown-table.texts.action-export-md')
              : t('tools.json-markdown-table.texts.action-export-json')
          }}
        </c-button>
      </div>
    </c-card>
  </div>
</template>
