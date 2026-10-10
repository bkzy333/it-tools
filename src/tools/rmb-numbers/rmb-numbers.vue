<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useThemeVars, useMessage } from 'naive-ui';
import { rmb, rmbText } from './rmb-numbers.service';
import { useQueryParam } from '@/composable/queryParams';
import { useCopy } from '@/composable/copy';

const { t } = useI18n();
const themeVars = useThemeVars();
const message = useMessage();

type SepMode = 'newline' | 'comma' | 'pause' | 'custom';

const inputText = useQueryParam<string>({ tool: 'rmb-conv', name: 'amounts', defaultValue: '1314.52\n23\n1000000' });
const separator = ref<SepMode>('newline');
const customSep = ref('|');

interface Row {
  input: string;
  error: boolean;
  value?: number;
  fragments: { type: string; value: string }[];
  text: string;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitTokens(text: string): string[] {
  const sep = separator.value;
  const custom = customSep.value.trim();
  let parts: string[];
  if (sep === 'newline') {
    parts = text.split(/\r?\n/);
  } else if (sep === 'comma') {
    parts = text.split(',');
  } else if (sep === 'pause') {
    parts = text.split('、');
  } else {
    parts = custom ? text.split(new RegExp(escapeRegex(custom))) : text.split(/\r?\n/);
  }
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

function parseAmount(raw: string): number | null {
  let tok = raw.trim();
  // 非逗号分隔模式下，先去掉千分位逗号
  if (separator.value !== 'comma') {
    tok = tok.replace(/,/g, '');
  }
  tok = tok.replace(/[¥￥\s]/g, '');
  if (tok === '') {
    return null;
  }
  const n = Number(tok);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function computeRows(): Row[] {
  return splitTokens(inputText.value).map((tok) => {
    const n = parseAmount(tok);
    if (n === null) {
      return { input: tok, error: true, fragments: [], text: '' };
    }
    return { input: tok, error: false, value: n, fragments: rmb(n), text: rmbText(n) };
  });
}

// 实时联动：输入或分隔符变化时自动重算
const rows = ref<Row[]>([]);
function convert() {
  rows.value = computeRows();
}
watch([inputText, separator, customSep], convert);
onMounted(convert);

const resultsRef = ref<HTMLElement | null>(null);
function onConvert() {
  if (splitTokens(inputText.value).length === 0) {
    message.warning(t('tools.rmb-numbers.texts.msg-empty'));
    return;
  }
  convert();
  nextTick(() => resultsRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

const { copy: copyAll } = useCopy();
function copyResults() {
  const text = rows.value.map((r) => (r.error ? t('tools.rmb-numbers.texts.text-invalid') : r.text)).join('\n');
  if (!text) {
    message.warning(t('tools.rmb-numbers.texts.msg-empty'));
    return;
  }
  copyAll(text, { notificationMessage: t('tools.rmb-numbers.texts.msg-copied') });
}

function copyOne(text: string) {
  copyAll(text, { notificationMessage: t('tools.rmb-numbers.texts.msg-copied') });
}

function exportExcel() {
  if (rows.value.length === 0) {
    message.warning(t('tools.rmb-numbers.texts.msg-empty'));
    return;
  }
  const header = '录入金额,大写金额\r\n';
  const body = rows.value
    .map((r) => {
      const inVal = `"${r.input.replace(/"/g, '""')}"`;
      const outVal = `"${(r.error ? t('tools.rmb-numbers.texts.text-invalid') : r.text).replace(/"/g, '""')}"`;
      return `${inVal},${outVal}`;
    })
    .join('\r\n');
  // UTF-8 BOM 保证 Excel 正确识别中文
  const csv = '﻿' + header + body;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'rmb-numbers.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const singleBig = computed(() => rows.value.length === 1 && !rows.value[0].error);
</script>

<template>
  <div flex flex-col gap-3>
    <c-card :title="t('tools.rmb-numbers.texts.label-input')">
      <n-input
        v-model:value="inputText"
        type="textarea"
        :autosize="{ minRows: 4, maxRows: 16 }"
        :placeholder="t('tools.rmb-numbers.texts.placeholder-enter-the-amount-in-lowercase-example-1314-52')"
        w-full
      />

      <div flex flex-wrap items-center gap-3 mt-3>
        <span text-sm op-70>{{ t('tools.rmb-numbers.texts.label-separator') }}</span>
        <n-radio-group v-model:value="separator" size="small">
          <n-radio value="newline">{{ t('tools.rmb-numbers.texts.sep-newline') }}</n-radio>
          <n-radio value="comma">{{ t('tools.rmb-numbers.texts.sep-comma') }}</n-radio>
          <n-radio value="pause">{{ t('tools.rmb-numbers.texts.sep-pause') }}</n-radio>
          <n-radio value="custom">{{ t('tools.rmb-numbers.texts.sep-custom') }}</n-radio>
        </n-radio-group>
        <n-input
          v-if="separator === 'custom'"
          v-model:value="customSep"
          size="small"
          :placeholder="t('tools.rmb-numbers.texts.placeholder-custom-separator')"
          style="width: 220px"
        />
        <c-button @click="onConvert">{{ t('tools.rmb-numbers.texts.btn-convert') }}</c-button>
      </div>

      <p mt-2 mb-0 text-xs op-60>{{ t('tools.rmb-numbers.texts.tip-batch') }}</p>
    </c-card>

    <div ref="resultsRef" />
    <c-card :title="t('tools.rmb-numbers.texts.title-amount-in-capital-letters')" flex flex-col>
      <div v-if="rows.length === 0" text-sm op-60>
        {{ t('tools.rmb-numbers.texts.msg-empty') }}
      </div>

      <!-- 单笔：大字号展示 -->
      <div v-else-if="singleBig" m-0 m-x-auto text-center>
        <span v-for="(item, index) in rows[0].fragments" :key="index" :class="item.type">
          {{ item.value }}
        </span>
      </div>

      <!-- 批量：逐行对应表格 -->
      <table v-else w-full border-collapse>
        <thead>
          <tr>
            <th text-left p-2 border border-gray-300 dark:border-gray-600>
              {{ t('tools.rmb-numbers.texts.col-input') }}
            </th>
            <th text-left p-2 border border-gray-300 dark:border-gray-600>
              {{ t('tools.rmb-numbers.texts.col-output') }}
            </th>
            <th w-16 p-2 border border-gray-300 dark:border-gray-600></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, idx) in rows" :key="idx">
            <td p-2 border border-gray-300 dark:border-gray-600 font-mono>
              {{ row.input }}
            </td>
            <td p-2 border border-gray-300 dark:border-gray-600>
              <span v-if="row.error" text-red-500>{{ t('tools.rmb-numbers.texts.text-invalid') }}</span>
              <span v-else>
                <span v-for="(f, i) in row.fragments" :key="i" :class="f.type">{{ f.value }}</span>
              </span>
            </td>
            <td p-2 border border-gray-300 dark:border-gray-600 text-center>
              <c-button v-if="!row.error" size="small" secondary @click="copyOne(row.text)">
                {{ t('tools.rmb-numbers.texts.btn-copy') }}
              </c-button>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="rows.length > 0" flex flex-wrap gap-2 mt-3>
        <c-button secondary @click="copyResults">{{ t('tools.rmb-numbers.texts.btn-copy-all') }}</c-button>
        <c-button secondary @click="exportExcel">{{ t('tools.rmb-numbers.texts.btn-export-excel') }}</c-button>
      </div>
    </c-card>
  </div>
</template>

<style lang="less" scoped>
.unit {
  font-size: 1.4em;
  color: v-bind('themeVars.successColor');
}
.number {
  font-size: 2.4em;
}
.cut {
  font-size: 1.4em;
  color: v-bind('themeVars.errorColor');
}
</style>
