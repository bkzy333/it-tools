<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMessage } from 'naive-ui';
import ToolExampleButton from '@/components/ToolExampleButton.vue';

const { t } = useI18n();
const message = useMessage();

const fileInput = ref<HTMLInputElement | null>(null);
const fileName = ref('');
const mergeCount = ref(0);
const previewText = ref('');
const ignoreEmpty = ref(true);
const processing = ref(false);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadXlsx(): Promise<any> {
  return import('xlsx');
}

// 扫描一个 sheet 的 aoa，按列找出纵向连续的相同单元格，返回 merges 区间
function scanMerges(aoa: unknown[][], ignoreEmpty: boolean) {
  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];
  if (aoa.length === 0) {
    return merges;
  }
  const cols = Math.max(...aoa.map((row) => row.length));
  for (let c = 0; c < cols; c++) {
    let runStart = -1;
    let runVal: string | null = null;
    const flush = (end: number) => {
      if (runStart >= 0 && end - runStart >= 1) {
        merges.push({ s: { r: runStart, c }, e: { r: end, c } });
      }
      runStart = -1;
      runVal = null;
    };
    for (let r = 0; r < aoa.length; r++) {
      const raw = aoa[r][c];
      const v = raw === null || raw === undefined ? '' : String(raw);
      if (v === '') {
        if (ignoreEmpty) {
          flush(r - 1);
        } else {
          // 不忽略空：空单元格与任何值都不相等，自然断开
          if (runStart >= 0 && r - 1 - runStart >= 1) {
            merges.push({ s: { r: runStart, c }, e: { r: r - 1, c } });
          }
          runStart = -1;
          runVal = null;
        }
        continue;
      }
      if (runVal === null) {
        runStart = r;
        runVal = v;
      } else if (v === runVal) {
        // 继续延长
      } else {
        if (r - 1 - runStart >= 1) {
          merges.push({ s: { r: runStart, c }, e: { r: r - 1, c } });
        }
        runStart = r;
        runVal = v;
      }
    }
    flush(aoa.length - 1);
  }
  return merges;
}

async function onFiles(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) {
    return;
  }
  const f = input.files[0];
  fileName.value = f.name;
  processing.value = true;
  try {
    const XLSX = await loadXlsx();
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    let total = 0;
    const parts: string[] = [];
    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as unknown[][];
      const m = scanMerges(aoa, ignoreEmpty.value);
      total += m.length;
      parts.push(`${name}: ${m.length}`);
    }
    mergeCount.value = total;
    previewText.value = parts.join('；');
    message.success(t('tools.excel-cell-merge.texts.scanned'));
  } catch (err) {
    message.error(`${t('tools.excel-cell-merge.texts.read-error')}: ${String(err)}`);
  } finally {
    processing.value = false;
  }
}

async function doMerge() {
  if (!fileName.value) {
    message.warning(t('tools.excel-cell-merge.texts.no-file'));
    return;
  }
  if (mergeCount.value === 0) {
    message.info(t('tools.excel-cell-merge.texts.no-merges'));
    return;
  }
  processing.value = true;
  try {
    const XLSX = await loadXlsx();
    const input = fileInput.value;
    if (!input?.files?.length) {
      return;
    }
    const f = input.files[0];
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    const out = XLSX.utils.book_new();
    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }) as unknown[][];
      const m = scanMerges(aoa, ignoreEmpty.value);
      const newWs = XLSX.utils.aoa_to_sheet(aoa as unknown[][]);
      (newWs as Record<string, unknown>)['!merges'] = m;
      XLSX.utils.book_append_sheet(out, newWs, name.slice(0, 31));
    }
    XLSX.writeFile(out, `合并单元格_${Date.now()}.xlsx`);
    message.success(t('tools.excel-cell-merge.texts.done'));
  } catch (err) {
    message.error(`${t('tools.excel-cell-merge.texts.read-error')}: ${String(err)}`);
  } finally {
    processing.value = false;
  }
}

function clearAll() {
  fileName.value = '';
  mergeCount.value = 0;
  previewText.value = '';
  if (fileInput.value) {
    fileInput.value.value = '';
  }
}

function openPicker() {
  fileInput.value?.click();
}
</script>

<template>
  <c-card :title="t('tools.excel-cell-merge.title')" max-w-900px>
    <div flex items-center justify-between gap-2 mb-2>
      <span class="privacy">🔒 {{ t('tools.excel-cell-merge.texts.privacy') }}</span>
      <ToolExampleButton :label="t('tools.excel-cell-merge.texts.pick-file')" @click="openPicker" />
    </div>

    <input ref="fileInput" type="file" accept=".xlsx,.xls,.csv" class="file-input" @change="onFiles" />

    <p class="hint">{{ t('tools.excel-cell-merge.texts.hint') }}</p>

    <n-checkbox v-model:checked="ignoreEmpty" mb-2>{{ t('tools.excel-cell-merge.texts.ignore-empty') }}</n-checkbox>

    <div v-if="fileName" class="preview">
      <p>{{ fileName }}</p>
      <p class="preview-title">
        {{ t('tools.excel-cell-merge.texts.preview') }}：{{ t('tools.excel-cell-merge.texts.merge-count') }}
        <strong>{{ mergeCount }}</strong>
      </p>
      <p v-if="previewText" class="meta">{{ previewText }}</p>
    </div>

    <div flex items-center gap-3 mt-3>
      <c-button :disabled="processing || !fileName" @click="doMerge">{{
        t('tools.excel-cell-merge.texts.btn-merge')
      }}</c-button>
      <c-button variant="text" @click="clearAll">{{ t('tools.excel-cell-merge.texts.btn-clear') }}</c-button>
    </div>
  </c-card>
</template>

<style lang="less" scoped>
.privacy {
  font-size: 13px;
  opacity: 0.8;
}
.file-input {
  width: 100%;
  margin-bottom: 10px;
}
.hint {
  font-size: 13px;
  opacity: 0.75;
  margin: 0 0 8px;
}
.preview {
  background: #f7f8fa;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 13px;

  p {
    margin: 0 0 4px;
  }
  .meta {
    opacity: 0.8;
  }
}
</style>
