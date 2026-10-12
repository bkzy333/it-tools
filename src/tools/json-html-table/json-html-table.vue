<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMessage } from 'naive-ui';
import JSON5 from 'json5';
import { jsonToHtml, htmlToJsonString } from './json-html-table.service';
import { useCopy } from '@/composable/copy';

const { t } = useI18n();
const message = useMessage();

const defaultValue = `[
  { "name": "张三", "age": 25, "city": "北京" },
  { "name": "李四", "age": 30, "city": "上海", "active": true }
]`;

const defaultHtml = `<table>
    <thead>
        <tr>
            <th>name</th>
            <th>age</th>
            <th>city</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td>张三</td>
            <td>25</td>
            <td>北京</td>
        </tr>
        <tr>
            <td>李四</td>
            <td>30</td>
            <td>上海</td>
        </tr>
    </tbody>
</table>`;

type Direction = 'json2html' | 'html2json';

const direction = ref<Direction>('json2html');
const input = ref(defaultValue);
const pretty = ref(true);
const detectTypes = ref(true);

function loadExample() {
  input.value = direction.value === 'json2html' ? defaultValue : defaultHtml;
  pretty.value = true;
  detectTypes.value = true;
}

const jsonError = computed(() => {
  if (direction.value !== 'json2html' || input.value.trim() === '') {
    return '';
  }
  try {
    JSON5.parse(input.value);
    return '';
  } catch {
    return t('tools.json-html-table.texts.msg-json-invalid');
  }
});

const parsed = computed(() => {
  if (direction.value !== 'json2html' || jsonError.value) {
    return null;
  }
  try {
    return JSON5.parse(input.value);
  } catch {
    return null;
  }
});

const htmlError = computed(() => {
  if (direction.value !== 'html2json' || input.value.trim() === '') {
    return '';
  }
  return /<table[\s\S]*?<\/table>/i.test(input.value)
    ? ''
    : t('tools.json-html-table.texts.msg-no-table');
});

const output = computed(() => {
  if (direction.value === 'json2html') {
    if (!parsed.value) {
      return '';
    }
    return jsonToHtml({ data: parsed.value, pretty: pretty.value });
  }
  if (!htmlError.value) {
    return htmlToJsonString({ html: input.value, detectTypes: detectTypes.value, pretty: pretty.value });
  }
  return '';
});

const { copy: copyOut } = useCopy();

function copyAll() {
  if (!output.value) {
    message.warning(t('tools.json-html-table.texts.msg-empty'));
    return;
  }
  copyOut(output.value, { notificationMessage: t('tools.json-html-table.texts.msg-copied') });
}

function exportFile() {
  if (!output.value) {
    message.warning(t('tools.json-html-table.texts.msg-empty'));
    return;
  }
  const isHtml = direction.value === 'json2html';
  const filename = isHtml ? 'table.html' : 'table.json';
  const mime = isHtml ? 'text/html' : 'application/json';
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

    <c-card :title="t('tools.json-html-table.texts.direction-title')">
      <n-radio-group v-model:value="direction">
        <n-radio-button value="json2html">{{ t('tools.json-html-table.texts.dir-json2html') }}</n-radio-button>
        <n-radio-button value="html2json">{{ t('tools.json-html-table.texts.dir-html2json') }}</n-radio-button>
      </n-radio-group>
    </c-card>

    <c-card
      :title="
        direction === 'json2html'
          ? t('tools.json-html-table.texts.input-label-json')
          : t('tools.json-html-table.texts.input-label-html')
      "
    >
      <c-input-text
        v-model:value="input"
        :placeholder="
          direction === 'json2html'
            ? t('tools.json-html-table.texts.placeholder-json')
            : t('tools.json-html-table.texts.placeholder-html')
        "
        multiline
        rows="8"
        clearable
      />
      <p v-if="jsonError || htmlError" mt-2 mb-0 text-sm text-red-500>
        {{ jsonError || htmlError }}
      </p>
    </c-card>

    <c-card :title="t('tools.json-html-table.texts.options-title')">
      <n-space vertical :size="14">
        <div flex flex-wrap items-center gap-3>
          <span text-sm op-70>{{ t('tools.json-html-table.texts.pretty-title') }}</span>
          <n-radio-group v-model:value="pretty" size="small">
            <n-radio-button :value="true">{{ t('tools.json-html-table.texts.pretty-on') }}</n-radio-button>
            <n-radio-button :value="false">{{ t('tools.json-html-table.texts.pretty-off') }}</n-radio-button>
          </n-radio-group>
        </div>

        <div v-if="direction === 'html2json'" flex flex-wrap items-center gap-3>
          <span text-sm op-70>{{ t('tools.json-html-table.texts.detect-title') }}</span>
          <n-radio-group v-model:value="detectTypes" size="small">
            <n-radio-button :value="true">{{ t('tools.json-html-table.texts.detect-on') }}</n-radio-button>
            <n-radio-button :value="false">{{ t('tools.json-html-table.texts.detect-off') }}</n-radio-button>
          </n-radio-group>
        </div>
      </n-space>
    </c-card>

    <c-card v-if="output" :title="t('tools.json-html-table.texts.output-label')">
      <c-input-text :value="output" multiline rows="8" readonly />
      <div flex flex-wrap gap-2 mt-3>
        <c-button secondary @click="copyAll">{{ t('tools.json-html-table.texts.action-copy') }}</c-button>
        <c-button secondary @click="exportFile">
          {{
            direction === 'json2html'
              ? t('tools.json-html-table.texts.action-export-html')
              : t('tools.json-html-table.texts.action-export-json')
          }}
        </c-button>
      </div>
    </c-card>
  </div>
</template>
