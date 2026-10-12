<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import ToolExampleButton from '@/components/ToolExampleButton.vue';
import { useCopy } from '@/composable/copy';
import { downloadCsvFile, downloadTextFile } from '@/composable/export';
import {
  applyOp,
  gridToText,
  mergeIntoGrid,
  normalizeGrid,
  parseToGrid,
  type GridOp,
  type OutFormat,
} from './table-converter.service';
import { gridToXlsx } from './xlsx-export';

const { t } = useI18n();
const { copy } = useCopy();

/* -------------------------------------------------------------- 状态 */
const rawInput = ref('');
const grid = ref<string[][]>([]);
const format = ref<OutFormat>('csv');
const hasHeader = ref(true);

const gridWidth = computed(() => grid.value.reduce((m, r) => Math.max(m, r.length), 0));
const outputText = computed(() => (grid.value.length === 0 ? '' : gridToText(grid.value, format.value)));

const exampleData = {
  raw: '姓名\t年龄\t城市\n张三\t28\t北京\n李四\t34\t上海\n王五\t\t广州',
};

function loadExample() {
  rawInput.value = exampleData.raw;
  parseNow();
}

function parseNow() {
  grid.value = parseToGrid(rawInput.value);
}

function clearAll() {
  rawInput.value = '';
  grid.value = [];
}

/* -------------------------------------------------------------- 网格编辑 */
function addRow() {
  const w = gridWidth.value || 1;
  grid.value = [...grid.value, Array.from({ length: w }, () => '')];
}

function addCol() {
  grid.value = grid.value.map((r) => [...r, '']);
  if (grid.value.length === 0) {
    grid.value = [['']];
  }
}

function removeRow(r: number) {
  grid.value = grid.value.filter((_, i) => i !== r);
}

function removeCol(c: number) {
  grid.value = grid.value.map((row) => row.filter((_, i) => i !== c));
}

/** 选中单元格后 Ctrl+V 粘贴 Excel/CSV：从当前格起覆盖写回网格 */
function onCellPaste(e: ClipboardEvent, r: number, c: number) {
  const text = e.clipboardData?.getData('text') ?? '';
  if (!text.includes('\t') && !text.includes('\n')) {
    return; // 普通文本，交给输入框默认行为
  }
  e.preventDefault();
  const parsed = parseToGrid(text);
  grid.value = mergeIntoGrid(grid.value, parsed, r, c);
}

/* -------------------------------------------------------------- 操作 */
function doOp(op: GridOp) {
  if (grid.value.length === 0) {
    return;
  }
  grid.value = normalizeGrid(applyOp(grid.value, op));
}

const opButtons: { op: GridOp; label: string }[] = [
  { op: 'remove-empty-rows', label: t('tools.table-converter.texts.op-remove-empty-rows') },
  { op: 'remove-empty-cols', label: t('tools.table-converter.texts.op-remove-empty-cols') },
  { op: 'trim', label: t('tools.table-converter.texts.op-trim') },
  { op: 'upper', label: t('tools.table-converter.texts.op-upper') },
  { op: 'lower', label: t('tools.table-converter.texts.op-lower') },
  { op: 'transpose', label: t('tools.table-converter.texts.op-transpose') },
];

const formatOptions = computed(() => [
  { value: 'csv' as OutFormat, label: t('tools.table-converter.texts.fmt-csv') },
  { value: 'json' as OutFormat, label: t('tools.table-converter.texts.fmt-json') },
  { value: 'markdown' as OutFormat, label: t('tools.table-converter.texts.fmt-markdown') },
  { value: 'html' as OutFormat, label: t('tools.table-converter.texts.fmt-html') },
  { value: 'tsv' as OutFormat, label: t('tools.table-converter.texts.fmt-tsv') },
]);

/* -------------------------------------------------------------- 导出 */
function copyAll() {
  copy(outputText.value, { notificationMessage: t('tools.table-converter.texts.message-copied') });
}

function exportTxt() {
  const fmt = format.value;
  // CSV / TSV 会被 Excel 打开，必须带 UTF-8 BOM，否则中文乱码
  if (fmt === 'csv') {
    downloadCsvFile('table.csv', grid.value);
    return;
  }
  const content = fmt === 'tsv' ? `﻿${outputText.value}` : outputText.value;
  downloadTextFile(`table.${fmt}`, content);
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportXlsx() {
  downloadBlob('table.xlsx', gridToXlsx(grid.value));
}
</script>

<template>
  <div>
    <c-card :title="t('tools.table-converter.texts.label-input')">
      <div flex items-center justify-between gap-2 mb-2>
        <ToolExampleButton @click="loadExample" />
        <c-button size="small" @click="clearAll">{{ t('tools.table-converter.texts.action-clear') }}</c-button>
      </div>

      <c-input-text
        v-model:value="rawInput"
        :placeholder="t('tools.table-converter.texts.placeholder-input')"
        multiline
        rows="5"
        clearable
      />

      <div flex items-center gap-2 mt-2>
        <c-button size="small" @click="parseNow">{{ t('tools.table-converter.texts.action-parse') }}</c-button>
        <span text-sm op-70>{{ t('tools.table-converter.texts.hint-parse') }}</span>
      </div>

      <!-- 网格操作 -->
      <div flex flex-wrap gap-2 mt-4>
        <c-button
          v-for="b in opButtons"
          :key="b.op"
          size="small"
          :disabled="grid.length === 0"
          @click="doOp(b.op)"
        >
          {{ b.label }}
        </c-button>
      </div>

      <!-- 可编辑网格 -->
      <div mt-4>
        <div flex items-center justify-between mb-1>
          <span text-sm font-medium>{{ t('tools.table-converter.texts.label-grid') }}</span>
          <span text-xs op-60>{{ grid.length }} {{ t('tools.table-converter.texts.unit-rows') }} × {{ gridWidth }} {{ t('tools.table-converter.texts.unit-cols') }}</span>
        </div>

        <div class="grid-scroll">
          <table v-if="grid.length > 0" class="grid-table">
            <tbody>
              <tr v-for="(row, r) in grid" :key="r">
                <td v-for="(cell, c) in row" :key="c" class="grid-cell">
                  <input
                    v-model="grid[r][c]"
                    class="grid-input"
                    @paste="onCellPaste($event, r, c)"
                  />
                </td>
                <td class="grid-ctrl">
                  <button class="row-del" :title="t('tools.table-converter.texts.action-remove-row')" @click="removeRow(r)">×</button>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-else class="grid-empty">{{ t('tools.table-converter.texts.hint-grid') }}</p>
        </div>

        <div flex gap-2 mt-2>
          <c-button size="small" @click="addRow">{{ t('tools.table-converter.texts.action-add-row') }}</c-button>
          <c-button size="small" @click="addCol">{{ t('tools.table-converter.texts.action-add-col') }}</c-button>
        </div>
      </div>
    </c-card>

    <c-card :title="t('tools.table-converter.texts.title-result')" mt-4>
      <div flex items-center justify-between gap-3 mb-2 flex-wrap>
        <c-select v-model:value="format" :options="formatOptions" style="width: 200px" />
        <label flex items-center gap-1 text-sm>
          <input v-model="hasHeader" type="checkbox" />
          {{ t('tools.table-converter.texts.label-header') }}
        </label>
      </div>

      <c-input-text
        :value="outputText"
        :placeholder="t('tools.table-converter.texts.placeholder-result')"
        multiline
        rows="12"
        readonly
      />

      <div flex items-center gap-2 mt-2 justify-end>
        <c-button size="small" secondary :disabled="!outputText" @click="copyAll">
          {{ t('tools.table-converter.texts.action-copy') }}
        </c-button>
        <c-button size="small" secondary :disabled="!outputText" @click="exportTxt">
          {{ t('tools.table-converter.texts.action-export-txt') }}
        </c-button>
        <c-button size="small" secondary :disabled="grid.length === 0" @click="exportXlsx">
          {{ t('tools.table-converter.texts.action-export-xlsx') }}
        </c-button>
      </div>
    </c-card>
  </div>
</template>

<style scoped>
.grid-scroll {
  overflow: auto;
  max-height: 420px;
  border: 1px solid var(--c-border-color, #e5e7eb);
  border-radius: 8px;
}
.grid-table {
  border-collapse: collapse;
  width: 100%;
  font-size: 13px;
}
.grid-cell {
  border: 1px solid var(--c-border-color, #e5e7eb);
  padding: 0;
}
.grid-input {
  width: 100%;
  min-width: 80px;
  border: none;
  outline: none;
  padding: 6px 8px;
  background: transparent;
  color: inherit;
  font: inherit;
}
.grid-input:focus {
  box-shadow: inset 0 0 0 2px #3b82f6;
}
.grid-ctrl {
  border: 1px solid var(--c-border-color, #e5e7eb);
  padding: 0 4px;
  width: 28px;
  text-align: center;
}
.row-del {
  border: none;
  background: transparent;
  color: #ef4444;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
}
.grid-empty {
  padding: 16px;
  text-align: center;
  opacity: 0.6;
  font-size: 13px;
}
</style>
