<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core';
import { useI18n } from 'vue-i18n';
import { nanoid } from 'nanoid';
import CopyExportBar from '@/components/CopyExportBar.vue';
import InputCopyable from '@/components/InputCopyable.vue';
import ProgressBar from '@/components/ProgressBar.vue';
import ToolExampleButton from '@/components/ToolExampleButton.vue';
import { downloadBlobFile } from '@/composable/export';
import {
  DEFAULT_ALGOS,
  EXAMPLE_FILE_SHA256,
  HASH_ALGOS,
  MAX_FILES,
  algoMeta,
  allHashesIdentical,
  buildCsvRows,
  buildJsonReport,
  buildTxtReport,
  createExampleFile,
  formatFileSize,
  hashBlobWithAlgos,
  parseExpectedHash,
  verifyAgainstExpected,
  type FileHashAlgoId,
} from './file-hash.service';
import { buildHashReportPdf, type PdfFileEntry } from './file-hash-pdf';

const { t } = useI18n();

// ——— 队列状态 ———
interface QueueItem {
  id: number;
  file: File;
  status: 'pending' | 'hashing' | 'done' | 'error';
  hashes: Record<string, string>;
  durationMs: number;
  error?: string;
}

const items = ref<QueueItem[]>([]);
const selectedAlgos = ref<FileHashAlgoId[]>([...DEFAULT_ALGOS]);
const expectedInput = ref('');
const autoEnableNote = ref('');
const notice = ref('');

const hashing = ref(false);
const progressVisible = ref(false);
const progressPercent = ref(-1);
const progressText = ref('');

/** 队列令牌：任何会改动队列的操作都把它 ++，在途的哈希循环下一个检查点就退出 */
const runToken = ref(0);
let nextId = 0;

// ——— 示例数据（U6）———
const exampleData = { name: 'gjxtools-示例文件.txt', sha256: EXAMPLE_FILE_SHA256 };

function loadExample() {
  addFiles([createExampleFile()]);
  expectedInput.value = exampleData.sha256;
  notice.value = t('tools.file-hash.texts.example-hint');
}

// ——— 计算属性 ———
const selectedAlgoMetas = computed(() => HASH_ALGOS.filter((algo) => selectedAlgos.value.includes(algo.id)));
const doneItems = computed(() => items.value.filter((item) => item.status === 'done'));
const expectedParsed = computed(() => parseExpectedHash(expectedInput.value));

type ExpectedStatus =
  | { kind: 'empty' }
  | { kind: 'unrecognized' }
  | { kind: 'unknown-length'; length: number }
  | { kind: 'waiting' }
  | { kind: 'match'; algo: string }
  | { kind: 'mismatch' }
  | { kind: 'multi'; match: number; total: number };

/** 预期哈希输入框下方的绿/红实时状态 */
const expectedStatus = computed<ExpectedStatus>(() => {
  const parsed = expectedParsed.value;
  if (!expectedInput.value.trim()) {
    return { kind: 'empty' };
  }
  if (!parsed.hex) {
    return { kind: 'unrecognized' };
  }
  if (parsed.unknownLength) {
    return { kind: 'unknown-length', length: parsed.hex.length };
  }
  const done = doneItems.value;
  if (done.length === 0) {
    return { kind: 'waiting' };
  }
  const matched = done.filter((item) => verifyAgainstExpected(parsed.hex, item.hashes).state === 'match');
  if (done.length === 1) {
    const verdict = verifyAgainstExpected(parsed.hex, done[0].hashes);
    return verdict.state === 'match' ? { kind: 'match', algo: algoMeta(verdict.algoId!).label } : { kind: 'mismatch' };
  }
  return { kind: 'multi', match: matched.length, total: done.length };
});

/** 多文件（≥2）时按算法给出「全部一致 / 存在不同」 */
const identicalInfo = computed(() => {
  if (doneItems.value.length < 2) {
    return [];
  }
  return selectedAlgoMetas.value.map((algo) => ({ algo, same: allHashesIdentical(doneItems.value, algo.id) }));
});

function statusText(item: QueueItem): string {
  if (item.status === 'pending') {
    return t('tools.file-hash.texts.status-pending');
  }
  if (item.status === 'hashing') {
    return t('tools.file-hash.texts.status-hashing');
  }
  if (item.status === 'error') {
    return t('tools.file-hash.texts.status-error');
  }
  return t('tools.file-hash.texts.status-done');
}

// ——— 导出用的整表文本（computed 避免每次渲染重算）———
const txtReport = computed(() =>
  buildTxtReport(currentResults(), selectedAlgoMetas.value, expectedParsed.value.hex, new Date()),
);
const csvRows = computed(() => buildCsvRows(currentResults(), selectedAlgoMetas.value, expectedParsed.value.hex));

// ——— 哈希队列 ———
async function runQueue() {
  const token = (runToken.value += 1);
  const queue = items.value;
  const pending = queue.filter((item) => item.status !== 'done');
  if (pending.length === 0) {
    hashing.value = false;
    progressVisible.value = false;
    return;
  }

  hashing.value = true;
  progressVisible.value = true;
  const total = pending.length;
  let doneCount = 0;

  for (let i = 0; i < queue.length; i += 1) {
    if (token !== runToken.value) {
      return; // 被更新的操作取消，状态由新调用方接管
    }
    const item = queue[i];
    if (item.status === 'done') {
      continue;
    }
    item.status = 'hashing';
    progressPercent.value = -1;
    progressText.value = t('tools.file-hash.texts.progress-hashing', { name: item.file.name, done: doneCount + 1, total });
    const started = performance.now();
    try {
      item.hashes = await hashBlobWithAlgos(item.file, selectedAlgos.value, (ratio) => {
        if (token !== runToken.value) {
          return;
        }
        progressPercent.value = Math.round(((doneCount + ratio) / total) * 100);
      });
      item.durationMs = performance.now() - started;
      item.status = 'done';
      item.error = undefined;
    } catch (error) {
      item.status = 'error';
      item.error = (error as Error).message;
    }
    doneCount += 1;
  }

  if (token === runToken.value) {
    hashing.value = false;
    progressVisible.value = false;
  }
}

function addFiles(files: File[]) {
  if (files.length === 0) {
    return;
  }
  const room = MAX_FILES - items.value.length;
  if (room <= 0) {
    notice.value = t('tools.file-hash.texts.notice-too-many', { max: MAX_FILES, count: 0 });
    return;
  }
  const seen = new Set(items.value.map((item) => `${item.file.name}|${item.file.size}|${item.file.lastModified}`));
  const fresh: File[] = [];
  let duplicates = 0;
  for (const file of files) {
    const key = `${file.name}|${file.size}|${file.lastModified}`;
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    fresh.push(file);
  }
  if (duplicates > 0) {
    notice.value = t('tools.file-hash.texts.notice-duplicate', { count: duplicates });
  }
  const accepted = fresh.slice(0, room);
  if (fresh.length > room) {
    notice.value = t('tools.file-hash.texts.notice-too-many', { max: MAX_FILES, count: room });
  }
  for (const file of accepted) {
    items.value.push({ id: (nextId += 1), file, status: 'pending', hashes: {}, durationMs: 0 });
  }
  runQueue();
}

function removeItem(id: number) {
  runToken.value += 1;
  items.value = items.value.filter((item) => item.id !== id);
  runQueue();
}

function clearAll() {
  runToken.value += 1;
  items.value = [];
  hashing.value = false;
  progressVisible.value = false;
}

// 改选算法 → 全部重算（与参考站一致：更改选择后自动重新计算）
watch(selectedAlgos, () => {
  for (const item of items.value) {
    item.status = 'pending';
    item.hashes = {};
    item.durationMs = 0;
  }
  if (selectedAlgos.value.length === 0 || items.value.length === 0) {
    runToken.value += 1;
    hashing.value = false;
    progressVisible.value = false;
    return;
  }
  runQueue();
});

// 粘贴预期哈希：长度对得上某个未勾选的算法时，自动补上（防手滑漏选导致「永远不一致」）
const autoEnableAlgo = useDebounceFn(() => {
  const parsed = parseExpectedHash(expectedInput.value);
  if (!parsed.hex || parsed.matchedAlgos.length === 0) {
    return;
  }
  const missing = parsed.matchedAlgos.filter((id) => !selectedAlgos.value.includes(id));
  if (missing.length === 0) {
    return;
  }
  const algo = algoMeta(missing[0]);
  selectedAlgos.value = [...selectedAlgos.value, algo.id];
  autoEnableNote.value = t('tools.file-hash.texts.note-auto-enabled', { algo: algo.label });
}, 500);

watch(expectedInput, () => {
  if (!expectedInput.value.trim()) {
    autoEnableNote.value = '';
  }
  autoEnableAlgo();
});

// ——— 导出 ———
function currentResults() {
  return doneItems.value.map((item) => ({
    name: item.file.name,
    size: item.file.size,
    hashes: item.hashes,
    durationMs: item.durationMs,
  }));
}

function exportJson() {
  const json = buildJsonReport(currentResults(), selectedAlgoMetas.value, expectedParsed.value.hex, new Date());
  downloadBlobFile('file-hash.json', new Blob([json], { type: 'application/json' }));
}

function exportPdf() {
  const files: PdfFileEntry[] = doneItems.value.map((item) => ({
    name: item.file.name,
    size: item.file.size,
    hashes: item.hashes,
    verified: verifyAgainstExpected(expectedParsed.value.hex, item.hashes).state,
  }));
  const bytes = buildHashReportPdf({
    algorithms: selectedAlgoMetas.value,
    expectedHash: expectedParsed.value.hex,
    files,
    generatedAt: new Date(),
    reportId: nanoid(10),
  });
  downloadBlobFile('file-hash.pdf', new Blob([bytes], { type: 'application/pdf' }));
}
</script>

<template>
  <div flex flex-col gap-4>
    <!-- ① 选择文件 -->
    <c-card :title="t('tools.file-hash.texts.title-select-files')">
      <div flex items-center justify-between gap-2 mb-2>
        <span text-sm op-60>{{ t('tools.file-hash.texts.example-hint') }}</span>
        <div flex gap-2>
          <ToolExampleButton @click="loadExample" />
          <c-button v-if="items.length > 0" size="small" secondary @click="clearAll">
            {{ t('tools.file-hash.texts.button-clear') }}
          </c-button>
        </div>
      </div>

      <c-file-upload multiple @files-upload="addFiles">
        <div flex flex-col items-center gap-2>
          <span op-70>{{ t('tools.file-hash.texts.drop-title') }}</span>
          <span text-sm op-50>{{ t('tools.file-hash.texts.drop-subtitle') }}</span>
          <c-button>{{ t('tools.file-hash.texts.button-browse') }}</c-button>
        </div>
      </c-file-upload>

      <n-alert v-if="notice" mt-3 type="warning" closable @close="notice = ''">{{ notice }}</n-alert>

      <p mt-3 text-sm op-60>{{ t('tools.file-hash.texts.privacy-note') }}</p>

      <div v-if="items.length > 0" mt-3>
        <div mb-2 text-sm font-medium>{{ t('tools.file-hash.texts.label-file-list', { count: items.length }) }}</div>
        <div overflow-x-auto>
          <table w-full border-collapse>
            <thead>
              <tr>
                <th text-left p-2 border border-gray-300 dark:border-gray-600 w-8>#</th>
                <th text-left p-2 border border-gray-300 dark:border-gray-600>{{ t('tools.file-hash.texts.label-file-name') }}</th>
                <th text-left p-2 border border-gray-300 dark:border-gray-600 whitespace-nowrap>{{ t('tools.file-hash.texts.label-size') }}</th>
                <th text-left p-2 border border-gray-300 dark:border-gray-600 whitespace-nowrap>{{ t('tools.file-hash.texts.label-status') }}</th>
                <th w-16 p-2 border border-gray-300 dark:border-gray-600 />
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in items" :key="item.id">
                <td p-2 border border-gray-300 dark:border-gray-600>{{ index + 1 }}</td>
                <td p-2 border border-gray-300 dark:border-gray-600 break-all>{{ item.file.name }}</td>
                <td p-2 border border-gray-300 dark:border-gray-600 whitespace-nowrap>{{ formatFileSize(item.file.size) }}</td>
                <td p-2 border border-gray-300 dark:border-gray-600 whitespace-nowrap>
                  <span v-if="item.status === 'error'" text-red-500>{{ statusText(item) }}</span>
                  <span v-else-if="item.status === 'done'" text-green-600>{{ statusText(item) }}</span>
                  <span v-else op-70>{{ statusText(item) }}</span>
                </td>
                <td p-2 border border-gray-300 dark:border-gray-600 text-center>
                  <c-button size="small" secondary @click="removeItem(item.id)">{{ t('tools.file-hash.texts.button-remove') }}</c-button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </c-card>

    <!-- ② 算法与预期哈希 -->
    <c-card :title="t('tools.file-hash.texts.title-algorithms')">
      <div mb-1 text-sm font-medium>{{ t('tools.file-hash.texts.label-algorithms') }}</div>
      <n-checkbox-group v-model:value="selectedAlgos">
        <n-space item-style="display:flex;align-items:center">
          <n-checkbox v-for="algo in HASH_ALGOS" :key="algo.id" :value="algo.id" :disabled="hashing">
            {{ algo.label }}
            <n-tag v-if="algo.legacy" size="small" type="warning" ml-1>{{ t('tools.file-hash.texts.tag-legacy') }}</n-tag>
          </n-checkbox>
        </n-space>
      </n-checkbox-group>
      <div mt-1 text-sm op-50>{{ t('tools.file-hash.texts.hint-legacy') }}</div>

      <n-alert v-if="selectedAlgos.length === 0" mt-3 type="warning">{{ t('tools.file-hash.texts.hint-no-algo') }}</n-alert>

      <n-divider />

      <c-input-text
        v-model:value="expectedInput"
        :label="t('tools.file-hash.texts.label-expected')"
        :placeholder="t('tools.file-hash.texts.placeholder-expected')"
      />
      <div mt-1 text-sm op-50>{{ t('tools.file-hash.texts.hint-expected-formats') }}</div>

      <n-alert v-if="expectedStatus.kind === 'unrecognized'" mt-2 type="warning">
        {{ t('tools.file-hash.texts.status-expected-unrecognized') }}
      </n-alert>
      <n-alert v-else-if="expectedStatus.kind === 'unknown-length'" mt-2 type="warning">
        {{ t('tools.file-hash.texts.status-expected-unknown-length', { length: expectedStatus.length }) }}
      </n-alert>
      <n-alert v-else-if="expectedStatus.kind === 'waiting'" mt-2 type="info">
        {{ t('tools.file-hash.texts.status-expected-waiting') }}
      </n-alert>
      <n-alert v-else-if="expectedStatus.kind === 'match'" mt-2 type="success">
        {{ t('tools.file-hash.texts.status-match', { algo: expectedStatus.algo }) }}
      </n-alert>
      <n-alert v-else-if="expectedStatus.kind === 'mismatch'" mt-2 type="error">
        {{ t('tools.file-hash.texts.status-mismatch') }}
      </n-alert>
      <n-alert
        v-else-if="expectedStatus.kind === 'multi'"
        mt-2
        :type="expectedStatus.match === expectedStatus.total ? 'success' : 'error'"
      >
        {{
          expectedStatus.match === expectedStatus.total
            ? t('tools.file-hash.texts.status-match-multi', { match: expectedStatus.match, total: expectedStatus.total })
            : t('tools.file-hash.texts.status-mismatch-multi', { match: expectedStatus.match, total: expectedStatus.total })
        }}
      </n-alert>
      <div v-if="autoEnableNote" mt-2 text-sm text-primary>{{ autoEnableNote }}</div>
    </c-card>

    <!-- ③ 结果 -->
    <c-card :title="t('tools.file-hash.texts.title-results')">
      <ProgressBar :visible="progressVisible" :percent="progressPercent" :text="progressText" />

      <div v-if="items.length === 0" text-sm op-60>{{ t('tools.file-hash.texts.empty-results') }}</div>

      <div v-for="(item, index) in items" :key="item.id" :class="index > 0 ? 'mt-4' : ''">
        <div flex items-baseline justify-between gap-2>
          <span font-medium break-all>{{ index + 1 }}. {{ item.file.name }}</span>
          <span text-sm op-60 whitespace-nowrap>
            {{ formatFileSize(item.file.size) }}
            <span v-if="item.status === 'done'"> · {{ item.durationMs.toFixed(0) }} ms</span>
          </span>
        </div>

        <div v-if="item.status === 'error'" mt-1 text-sm text-red-500>
          {{ t('tools.file-hash.texts.error-hash-failed', { reason: item.error }) }}
        </div>

        <div v-for="algo in selectedAlgoMetas" :key="algo.id" mt-2>
          <n-input-group>
            <n-input-group-label style="flex: 0 0 110px">{{ algo.label }}</n-input-group-label>
            <InputCopyable :value="item.hashes[algo.id] ?? ''" readonly />
          </n-input-group>
        </div>

        <div
          v-if="item.status === 'done' && expectedParsed.hex"
          mt-2
        >
          <n-tag v-if="verifyAgainstExpected(expectedParsed.hex, item.hashes).state === 'match'" type="success" size="small">
            {{ t('tools.file-hash.texts.status-match', { algo: algoMeta(verifyAgainstExpected(expectedParsed.hex, item.hashes).algoId!).label }) }}
          </n-tag>
          <n-tag v-else type="error" size="small">{{ t('tools.file-hash.texts.status-mismatch') }}</n-tag>
        </div>
      </div>

      <template v-if="doneItems.length > 0">
        <n-divider />

        <div v-if="identicalInfo.length > 0" mb-3 flex flex-wrap items-center gap-2>
          <span text-sm op-60>{{ t('tools.file-hash.texts.label-identical') }}：</span>
          <n-tag v-for="info in identicalInfo" :key="info.algo.id" size="small" :type="info.same ? 'success' : 'warning'">
            {{
              info.same
                ? t('tools.file-hash.texts.identical-same', { algo: info.algo.label })
                : t('tools.file-hash.texts.identical-diff', { algo: info.algo.label })
            }}
          </n-tag>
        </div>

        <div flex flex-wrap items-center justify-end gap-2>
          <CopyExportBar :text="txtReport" filename="file-hash" :rows="csvRows" />
          <c-button size="small" secondary @click="exportJson">{{ t('tools.file-hash.texts.button-export-json') }}</c-button>
          <c-button size="small" secondary @click="exportPdf">{{ t('tools.file-hash.texts.button-export-pdf') }}</c-button>
        </div>
      </template>
    </c-card>
  </div>
</template>
