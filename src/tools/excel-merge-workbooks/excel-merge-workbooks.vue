<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMessage } from 'naive-ui';
import ToolExampleButton from '@/components/ToolExampleButton.vue';

const { t } = useI18n();
const message = useMessage();

type LoadedSheet = { name: string; rows: number };
type LoadedFile = { name: string; sheets: LoadedSheet[]; error?: string };

const fileInput = ref<HTMLInputElement | null>(null);
const files = ref<File[]>([]);
const loaded = ref<LoadedFile[]>([]);
const mode = ref<'single' | 'multi' | 'match'>('single');
const keepHeader = ref(true);
const addSourceColumn = ref(false);
const keyColumn = ref('');
const processing = ref(false);

// xlsx 是动态 import：只有打开本工具才加载，不进首屏包
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadXlsx(): Promise<any> {
  return import('xlsx');
}

async function onFiles(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files) {
    return;
  }
  files.value = Array.from(input.files);
  await preview();
}

async function preview() {
  loaded.value = [];
  const XLSX = await loadXlsx();
  for (const f of files.value) {
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      const sheets: LoadedSheet[] = wb.SheetNames.map((name: string) => {
        const ws = wb.Sheets[name];
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false }) as unknown[][];
        return { name, rows: aoa.length };
      });
      loaded.value.push({ name: f.name, sheets });
    } catch (err) {
      loaded.value.push({ name: f.name, sheets: [], error: String(err) });
    }
  }
}

const totalRows = computed(() =>
  loaded.value.reduce((s, f) => s + f.sheets.reduce((a, sh) => a + sh.rows, 0), 0),
);

async function doMerge() {
  if (files.value.length === 0) {
    message.warning(t('tools.excel-merge-workbooks.texts.no-file'));
    return;
  }
  if (mode.value === 'match' && !keyColumn.value) {
    message.warning(t('tools.excel-merge-workbooks.texts.need-key'));
    return;
  }
  processing.value = true;
  try {
    const XLSX = await loadXlsx();
    const out = XLSX.utils.book_new();

    if (mode.value === 'multi') {
      for (const f of files.value) {
        const buf = await f.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array', cellDates: true });
        const base = f.name.replace(/\.[^.]+$/, '').slice(0, 20);
        for (const name of wb.SheetNames) {
          const sheetName = `${base}_${name}`.slice(0, 31);
          XLSX.utils.book_append_sheet(out, wb.Sheets[name], sheetName);
        }
      }
    } else {
      let header: string[] | null = null;
      const merged: unknown[][] = [];
      // 按列匹配模式：以 keyColumn 为主键做左连接累加
      const keyIndex = new Map<string, Record<string, string>>();
      let haveHeader = false;

      for (let i = 0; i < files.value.length; i++) {
        const f = files.value[i];
        const buf = await f.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array', cellDates: true });
        for (const name of wb.SheetNames) {
          const ws = wb.Sheets[name];
          const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false }) as unknown[][];
          if (aoa.length === 0) {
            continue;
          }
          let data = aoa;
          if (header === null) {
            header = (data[0] as unknown[]).map((c) => String(c ?? ''));
            haveHeader = true;
            data = data.slice(1);
          } else if (keepHeader.value) {
            // 后续文件丢弃各自的表头行，统一用第一份的表头
            data = data.slice(1);
          }

          for (const row of data) {
            let r: unknown[] = row;
            if (addSourceColumn.value) {
              r = [f.name, ...row];
            }
            if (mode.value === 'match' && header && keyColumn.value) {
              const ki = header.indexOf(keyColumn.value);
              if (ki >= 0) {
                const key = String(r[ki] ?? '');
                const prev = keyIndex.get(key);
                if (prev) {
                  header.forEach((h, c) => {
                    const v = String(r[c] ?? '');
                    if (v !== '') {
                      prev[h] = v;
                    }
                  });
                  continue;
                }
                const rec: Record<string, string> = {};
                header.forEach((h, c) => {
                  rec[h] = String(r[c] ?? '');
                });
                keyIndex.set(key, rec);
                merged.push(header.map((h) => rec[h]));
                continue;
              }
            }
            merged.push(r);
          }
        }
      }

      if (!haveHeader && header === null) {
        header = [];
      }
      const finalHeader = addSourceColumn.value ? ['来源文件', ...(header ?? [])] : header ?? [];
      const aoaOut =
        finalHeader.length > 0 ? [finalHeader, ...merged] : merged;
      const wsOut = XLSX.utils.aoa_to_sheet(aoaOut as unknown[][]);
      XLSX.utils.book_append_sheet(out, wsOut, '汇总');
    }

    XLSX.writeFile(out, `汇总结果_${Date.now()}.xlsx`);
    message.success(t('tools.excel-merge-workbooks.texts.done'));
  } catch (err) {
    message.error(`${t('tools.excel-merge-workbooks.texts.error')}: ${String(err)}`);
  } finally {
    processing.value = false;
  }
}

function clearAll() {
  files.value = [];
  loaded.value = [];
  if (fileInput.value) {
    fileInput.value.value = '';
  }
}

function openPicker() {
  fileInput.value?.click();
}
</script>

<template>
  <c-card :title="t('tools.excel-merge-workbooks.title')" max-w-900px>
    <div flex items-center justify-between gap-2 mb-2>
      <span class="privacy">🔒 {{ t('tools.excel-merge-workbooks.texts.privacy') }}</span>
      <ToolExampleButton :label="t('tools.excel-merge-workbooks.texts.pick-file')" @click="openPicker" />
    </div>

    <input
      ref="fileInput"
      type="file"
      accept=".xlsx,.xls,.csv"
      multiple
      class="file-input"
      @change="onFiles"
    />

    <n-form-item :label="t('tools.excel-merge-workbooks.texts.mode')" label-placement="left" mb-2>
      <c-select
        v-model:value="mode"
        label-width="120px"
        :options="[
          { label: t('tools.excel-merge-workbooks.texts.opt-single'), value: 'single' },
          { label: t('tools.excel-merge-workbooks.texts.opt-multi'), value: 'multi' },
          { label: t('tools.excel-merge-workbooks.texts.opt-match'), value: 'match' },
        ]"
      />
    </n-form-item>

    <div v-if="mode === 'match'" mb-2>
      <n-input
        v-model:value="keyColumn"
        :placeholder="t('tools.excel-merge-workbooks.texts.placeholder-key')"
      />
    </div>

    <div flex gap-4 mb-2>
      <n-checkbox v-model:checked="keepHeader">{{ t('tools.excel-merge-workbooks.texts.keep-header') }}</n-checkbox>
      <n-checkbox v-model:checked="addSourceColumn">{{
        t('tools.excel-merge-workbooks.texts.add-source')
      }}</n-checkbox>
    </div>

    <div v-if="loaded.length > 0" class="preview">
      <p class="preview-title">
        {{ t('tools.excel-merge-workbooks.texts.preview') }}（{{ t('tools.excel-merge-workbooks.texts.total-rows') }}：{{ totalRows }}）
      </p>
      <ul>
        <li v-for="f in loaded" :key="f.name">
          <span class="fname">{{ f.name }}</span>
          <template v-if="f.error">
            <span class="err">⚠ {{ f.error }}</span>
          </template>
          <template v-else>
            <span class="meta"
              >（{{ t('tools.excel-merge-workbooks.texts.sheet-count') }}：{{ f.sheets.length }}）</span
            >
            <span class="sheets">{{ f.sheets.map((s) => `${s.name}(${s.rows})`).join('，') }}</span>
          </template>
        </li>
      </ul>
    </div>

    <div flex items-center gap-3 mt-3>
      <c-button :disabled="processing || files.length === 0" @click="doMerge">
        {{ processing ? t('tools.excel-merge-workbooks.texts.merging') : t('tools.excel-merge-workbooks.texts.btn-merge') }}
      </c-button>
      <c-button variant="text" @click="clearAll">{{ t('tools.excel-merge-workbooks.texts.btn-clear') }}</c-button>
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
  margin-bottom: 12px;
}
.preview {
  background: #f7f8fa;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 13px;

  .preview-title {
    font-weight: 600;
    margin: 0 0 6px;
  }
  ul {
    margin: 0;
    padding-left: 18px;
  }
  li {
    margin-bottom: 4px;
  }
  .fname {
    font-weight: 500;
  }
  .meta {
    opacity: 0.7;
  }
  .sheets {
    opacity: 0.85;
  }
  .err {
    color: #d03050;
  }
}
</style>
