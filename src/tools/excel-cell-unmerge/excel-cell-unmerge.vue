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
const mode = ref<'fill' | 'first'>('fill');
const processing = ref(false);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadXlsx(): Promise<any> {
  return import('xlsx');
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
      const m = (ws['!merges'] as { s: { r: number; c: number }; e: { r: number; c: number } }[]) || [];
      total += m.length;
      parts.push(`${name}: ${m.length}`);
    }
    mergeCount.value = total;
    previewText.value = parts.join('；');
    message.success(t('tools.excel-cell-unmerge.texts.scanned'));
  } catch (err) {
    message.error(`${t('tools.excel-cell-unmerge.texts.read-error')}: ${String(err)}`);
  } finally {
    processing.value = false;
  }
}

async function doUnmerge() {
  if (!fileName.value) {
    message.warning(t('tools.excel-cell-unmerge.texts.no-file'));
    return;
  }
  if (mergeCount.value === 0) {
    message.info(t('tools.excel-cell-unmerge.texts.no-merges'));
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
      const merges =
        (ws['!merges'] as { s: { r: number; c: number }; e: { r: number; c: number } }[]) || [];
      for (const mg of merges) {
        const topLeft = aoa[mg.s.r]?.[mg.s.c] ?? '';
        for (let r = mg.s.r; r <= mg.e.r; r++) {
          for (let c = mg.s.c; c <= mg.e.c; c++) {
            if (mode.value === 'fill') {
              aoa[r][c] = topLeft;
            } else {
              aoa[r][c] = r === mg.s.r && c === mg.s.c ? topLeft : '';
            }
          }
        }
      }
      const newWs = XLSX.utils.aoa_to_sheet(aoa as unknown[][]);
      // 不设置 !merges 即等于删除合并区域
      XLSX.utils.book_append_sheet(out, newWs, name.slice(0, 31));
    }
    XLSX.writeFile(out, `拆分单元格_${Date.now()}.xlsx`);
    message.success(t('tools.excel-cell-unmerge.texts.done'));
  } catch (err) {
    message.error(`${t('tools.excel-cell-unmerge.texts.read-error')}: ${String(err)}`);
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
  <c-card :title="t('tools.excel-cell-unmerge.title')" max-w-900px>
    <div flex items-center justify-between gap-2 mb-2>
      <span class="privacy">🔒 {{ t('tools.excel-cell-unmerge.texts.privacy') }}</span>
      <ToolExampleButton :label="t('tools.excel-cell-unmerge.texts.pick-file')" @click="openPicker" />
    </div>

    <input ref="fileInput" type="file" accept=".xlsx,.xls,.csv" class="file-input" @change="onFiles" />

    <p class="hint">{{ t('tools.excel-cell-unmerge.texts.hint') }}</p>

    <n-form-item :label="t('tools.excel-cell-unmerge.texts.mode')" label-placement="left" mb-2>
      <c-select
        v-model:value="mode"
        label-width="130px"
        :options="[
          { label: t('tools.excel-cell-unmerge.texts.opt-fill'), value: 'fill' },
          { label: t('tools.excel-cell-unmerge.texts.opt-first'), value: 'first' },
        ]"
      />
    </n-form-item>

    <div v-if="fileName" class="preview">
      <p>{{ fileName }}</p>
      <p class="preview-title">
        {{ t('tools.excel-cell-unmerge.texts.preview') }}：{{ t('tools.excel-cell-unmerge.texts.merge-count') }}
        <strong>{{ mergeCount }}</strong>
      </p>
      <p v-if="previewText" class="meta">{{ previewText }}</p>
    </div>

    <div flex items-center gap-3 mt-3>
      <c-button :disabled="processing || !fileName" @click="doUnmerge">{{
        t('tools.excel-cell-unmerge.texts.btn-unmerge')
      }}</c-button>
      <c-button variant="text" @click="clearAll">{{ t('tools.excel-cell-unmerge.texts.btn-clear') }}</c-button>
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
