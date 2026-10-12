<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMessage } from 'naive-ui';
import { queryWubiText, type WubiVersion, type WubiResult } from './wubi-dict.service';
import { useCopy } from '@/composable/copy';

const { t } = useI18n();
const message = useMessage();

const input = ref('');
const version = ref<WubiVersion>('86');

const results = computed(() => queryWubiText(input.value, version.value));
const foundCount = computed(() => results.value.filter((r) => r.found).length);
const missingCount = computed(() => results.value.filter((r) => !r.found).length);

const exampleData = { input: '中华人民共和国', version: '86' as WubiVersion };

function loadExample() {
  input.value = exampleData.input;
  version.value = exampleData.version;
}

// 单条结果文本：汉字 + 空格 + 编码（未收录显示破折号）
function formatRow(r: WubiResult): string {
  return `${r.char} ${r.found ? r.code : '—'}`;
}

// 汇总为可复制 / 导出的纯文本
const plainText = computed(() => results.value.map(formatRow).join('\n'));

const { copy: copyAllText } = useCopy();

// 一键复制：全部结果
function copyAll() {
  if (!plainText.value) {
    message.warning(t('tools.wubi-dict.texts.msg-empty'));
    return;
  }
  copyAllText(plainText.value, { notificationMessage: t('tools.wubi-dict.texts.msg-copied') });
}

// 逐字复制：只复制该字对应的五笔编码
function copyOne(code: string) {
  copyAllText(code, { notificationMessage: t('tools.wubi-dict.texts.msg-copied') });
}

function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// 导出 TXT：每行「汉字 编码」
function exportTxt() {
  if (!plainText.value) {
    message.warning(t('tools.wubi-dict.texts.msg-empty'));
    return;
  }
  downloadFile(`wubi-${version.value}.txt`, plainText.value, 'text/plain');
}

// 导出 CSV：UTF-8 BOM 保证 Excel 正确识别中文（列：汉字,五笔编码,版本）
function exportCsv() {
  if (results.value.length === 0) {
    message.warning(t('tools.wubi-dict.texts.msg-empty'));
    return;
  }
  const header = '汉字,五笔编码,版本\r\n';
  const body = results.value
    .map((r) => {
      const char = `"${r.char}"`;
      const code = `"${r.found ? r.code : ''}"`;
      const ver = `"${version.value}"`;
      return `${char},${code},${ver}`;
    })
    .join('\r\n');
  const csv = '﻿' + header + body;
  downloadFile(`wubi-${version.value}.csv`, csv, 'text/csv');
}
</script>

<template>
  <div flex flex-col gap-3>
    <div flex justify-end>
      <ToolExampleButton @click="loadExample" />
    </div>

    <c-card :title="t('tools.wubi-dict.texts.title-input')">
      <c-input-text
        v-model:value="input"
        :placeholder="t('tools.wubi-dict.texts.placeholder-input')"
        multiline
        rows="3"
        clearable
      />
      <n-space mt-3>
        <n-radio-group v-model:value="version">
          <n-radio-button value="86">86</n-radio-button>
          <n-radio-button value="98">98</n-radio-button>
        </n-radio-group>
      </n-space>
    </c-card>

    <c-card v-if="results.length" :title="t('tools.wubi-dict.texts.title-result')">
      <div flex items-center justify-between mb-3>
        <span op-60 text-sm>
          {{ t('tools.wubi-dict.texts.label-found') }} {{ foundCount }}
          <template v-if="missingCount"> / {{ t('tools.wubi-dict.texts.label-missing') }} {{ missingCount }}</template>
        </span>
      </div>

      <div class="wubi-grid">
        <div v-for="(r, i) in results" :key="i" class="wubi-cell" :class="{ missing: !r.found }">
          <div class="char">{{ r.char }}</div>
          <div class="code">{{ r.found ? r.code : '—' }}</div>
          <c-button v-if="r.found" size="small" secondary class="cell-copy" @click="copyOne(r.code)">
            {{ t('tools.wubi-dict.texts.action-copy') }}
          </c-button>
        </div>
      </div>

      <div v-if="missingCount" mt-3 op-60 text-sm>
        {{ t('tools.wubi-dict.texts.hint-missing') }}
      </div>

      <div flex flex-wrap gap-2 mt-4>
        <c-button secondary @click="copyAll">{{ t('tools.wubi-dict.texts.action-copy-all') }}</c-button>
        <c-button secondary @click="exportTxt">{{ t('tools.wubi-dict.texts.action-export-txt') }}</c-button>
        <c-button secondary @click="exportCsv">{{ t('tools.wubi-dict.texts.action-export-csv') }}</c-button>
      </div>
    </c-card>
  </div>
</template>

<style scoped lang="less">
.wubi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
  gap: 8px;
}

.wubi-cell {
  padding: 8px 4px;
  border: 1px solid rgb(0 0 0 / 8%);
  border-radius: 6px;
  text-align: center;

  &.missing {
    opacity: 0.5;
  }
}

.char {
  font-size: 18px;
}

.code {
  margin-top: 2px;
  font-size: 12px;
  color: #888;
  font-family: monospace;
}

.cell-copy {
  margin-top: 6px;
  width: 100%;
}
</style>
