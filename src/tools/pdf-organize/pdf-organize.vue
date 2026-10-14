<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import JSZip from 'jszip';
import { loadPdf, renderAllPages } from '@/composable/pdf';
import PdfPagePreview, { type PreviewPage } from '@/components/PdfPagePreview.vue';
import ProgressBar from '@/components/ProgressBar.vue';
import { organizePdf, splitPdf, type SplitFile } from './pdf-organize.service';

const { t } = useI18n();

const file = ref<File | null>(null);
const originalBytes = ref<Uint8Array | null>(null);
const totalPages = ref(0);
const pages = ref<PreviewPage[]>([]);
const baseline = ref<PreviewPage[]>([]);

const mode = ref<'organize' | 'split'>('organize');
const extractSelected = ref(false);
const splitMode = ref<'every' | 'each'>('every');
const splitEvery = ref(1);
const outputName = ref('organized.pdf');

const status = ref<'idle' | 'processing' | 'done' | 'error'>('idle');
const errorMsg = ref('');
const progressVisible = ref(false);
const progressPercent = ref(-1);
const progressText = ref('');

async function onUpload(uploaded: File) {
  file.value = uploaded;
  errorMsg.value = '';
  status.value = 'idle';
  progressVisible.value = true;
  progressPercent.value = -1;
  progressText.value = t('tools.pdf-organize.texts.progress-reading');
  try {
    const buf = new Uint8Array(await uploaded.arrayBuffer());
    originalBytes.value = buf;
    // 给 pdfjs 传副本：getDocument 会把底层 ArrayBuffer 转移到 worker（detach），
    // 若直接传 buf，originalBytes 也会被一并置空，导致后续 qpdf 拿到 0 字节。
    const doc = await loadPdf(buf.slice());
    totalPages.value = doc.numPages;
    const rendered = await renderAllPages(doc, 220, (done, total) => {
      progressPercent.value = (done / total) * 100;
      progressText.value = t('tools.pdf-organize.texts.progress-rendering', { done, total });
    });
    pages.value = rendered.map((r) => ({
      id: r.pageNumber,
      dataUrl: r.dataUrl,
      rotation: 0,
      deleted: false,
      selected: false,
    }));
    baseline.value = pages.value.map((p) => ({ ...p }));
  } catch (e: any) {
    errorMsg.value = e?.message ?? t('tools.pdf-organize.texts.error-load');
    status.value = 'error';
  } finally {
    progressVisible.value = false;
  }
}

function rotate(id: number) {
  const p = pages.value.find((x) => x.id === id);
  if (p) {
    p.rotation = (p.rotation + 90) % 360;
  }
}
function toggleDelete(id: number) {
  const p = pages.value.find((x) => x.id === id);
  if (p) {
    p.deleted = !p.deleted;
  }
}
function toggleSelect(id: number) {
  const p = pages.value.find((x) => x.id === id);
  if (p) {
    p.selected = !p.selected;
  }
}
function reorder(fromId: number, toId: number) {
  const from = pages.value.findIndex((p) => p.id === fromId);
  const to = pages.value.findIndex((p) => p.id === toId);
  if (from < 0 || to < 0 || from === to) {
    return;
  }
  const arr = pages.value.slice();
  const [item] = arr.splice(from, 1);
  arr.splice(to, 0, item);
  pages.value = arr;
}
function reverseAll() {
  pages.value = pages.value.slice().reverse();
}
function resetAll() {
  pages.value = baseline.value.map((p) => ({ ...p }));
  extractSelected.value = false;
}

// “预期效果”文字摘要：当前会输出哪些页
const previewPages = computed<PreviewPage[]>(() =>
  extractSelected.value ? pages.value.filter((p) => p.selected) : pages.value.filter((p) => !p.deleted),
);
const summaryText = computed(() =>
  t('tools.pdf-organize.texts.summary', { out: previewPages.value.length, total: totalPages.value }),
);

// 浏览器安全的 Uint8Array -> base64（避免 btoa 对超长二进制串的字符数限制）
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// 用 data: URI（base64）触发下载——与仓库 downloadBase64 范式一致，headless/真实浏览器均可靠捕获
function downloadBytes(bytes: Uint8Array, filename: string, mime = 'application/pdf') {
  const base64 = bytesToBase64(bytes);
  const a = document.createElement('a');
  a.href = `data:${mime};base64,${base64}`;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function applyOrganize() {
  if (!originalBytes.value) {
    return;
  }
  const order = previewPages.value.map((p) => p.id);
  if (!order.length) {
    errorMsg.value = t('tools.pdf-organize.texts.error-empty');
    status.value = 'error';
    return;
  }
  const rotations: Record<number, number> = {};
  for (const p of pages.value) {
    if (p.rotation) {
      rotations[p.id] = p.rotation;
    }
  }
  status.value = 'processing';
  errorMsg.value = '';
  try {
    const out = await organizePdf(originalBytes.value, order, rotations);
    downloadBytes(out, outputName.value);
    status.value = 'done';
  } catch (e: any) {
    errorMsg.value = e?.message ?? t('tools.pdf-organize.texts.error-run');
    status.value = 'error';
  }
}

async function applySplit() {
  if (!originalBytes.value) {
    return;
  }
  status.value = 'processing';
  errorMsg.value = '';
  try {
    let files: SplitFile[];
    if (splitMode.value === 'each') {
      const sel = pages.value.filter((p) => p.selected).map((p) => p.id);
      if (!sel.length) {
        errorMsg.value = t('tools.pdf-organize.texts.error-select');
        status.value = 'error';
        return;
      }
      files = await splitPdf(originalBytes.value, totalPages.value, 'each', 0, sel);
    } else {
      files = await splitPdf(originalBytes.value, totalPages.value, 'every', splitEvery.value, []);
    }
    if (files.length === 1) {
      downloadBytes(files[0].bytes, files[0].name);
    } else {
      const zip = new JSZip();
      files.forEach((f) => zip.file(f.name, f.bytes));
      const b = await zip.generateAsync({ type: 'uint8array' });
      downloadBytes(b, 'split-pages.zip', 'application/zip');
    }
    status.value = 'done';
  } catch (e: any) {
    errorMsg.value = e?.message ?? t('tools.pdf-organize.texts.error-run');
    status.value = 'error';
  }
}
</script>

<template>
  <div>
    <div mx-auto mb-2 max-w-600px>
      <c-file-upload
        :title="t('tools.pdf-organize.texts.upload-title')"
        accept=".pdf"
        @file-upload="onUpload"
      />

      <ProgressBar :visible="progressVisible" :percent="progressPercent" :text="progressText" />
    </div>

    <c-alert v-if="errorMsg" type="error" mt-2>{{ errorMsg }}</c-alert>

    <div v-if="pages.length" mt-3>
      <n-radio-group v-model:value="mode" size="small">
        <n-radio-button value="organize">{{ t('tools.pdf-organize.texts.mode-organize') }}</n-radio-button>
        <n-radio-button value="split">{{ t('tools.pdf-organize.texts.mode-split') }}</n-radio-button>
      </n-radio-group>

      <!-- 整理模式 -->
      <div v-if="mode === 'organize'">
        <div flex items-center gap-2 mt-2 flex-wrap>
          <c-button size="small" secondary @click="reverseAll">{{ t('tools.pdf-organize.texts.btn-reverse') }}</c-button>
          <c-button size="small" secondary @click="resetAll">{{ t('tools.pdf-organize.texts.btn-reset') }}</c-button>
          <n-checkbox v-model:checked="extractSelected">{{ t('tools.pdf-organize.texts.opt-extract-selected') }}</n-checkbox>
          <span ml-auto text-sm op-70>{{ summaryText }}</span>
        </div>
        <PdfPagePreview
          :pages="pages"
          :selectable="extractSelected"
          :select-label="t('tools.pdf-organize.texts.select-label')"
          @rotate="rotate"
          @toggle-delete="toggleDelete"
          @toggle-select="toggleSelect"
          @reorder="reorder"
        />
        <p text-xs op-60>
          {{ t('tools.pdf-organize.texts.hint-organize') }}
        </p>
        <div mt-2 flex items-center gap-2>
          <c-input-text
            v-model:value="outputName"
            :label="t('tools.pdf-organize.texts.label-output-name')"
            label-position="left"
            style="width: 240px"
          />
          <c-button :disabled="status === 'processing'" @click="applyOrganize">
            {{ t('tools.pdf-organize.texts.btn-apply') }}
          </c-button>
        </div>
      </div>

      <!-- 拆分模式 -->
      <div v-else>
        <n-radio-group v-model:value="splitMode" size="small" mt-2>
          <n-radio-button value="every">{{ t('tools.pdf-organize.texts.split-every') }}</n-radio-button>
          <n-radio-button value="each">{{ t('tools.pdf-organize.texts.split-each') }}</n-radio-button>
        </n-radio-group>

        <div v-if="splitMode === 'every'" flex items-center gap-2 mt-2>
          <span text-sm>{{ t('tools.pdf-organize.texts.split-every-n') }}</span>
          <n-input-number v-model:value="splitEvery" :min="1" :max="totalPages || 999" size="small" style="width: 100px" />
          <span text-sm op-70>{{ t('tools.pdf-organize.texts.split-every-hint') }}</span>
        </div>
        <div v-else mt-2>
          <p text-sm op-70>{{ t('tools.pdf-organize.texts.split-each-hint') }}</p>
          <PdfPagePreview
            :pages="pages"
            :rotatable="false"
            :deletable="false"
            :selectable="true"
            :select-label="t('tools.pdf-organize.texts.select-label')"
            @toggle-select="toggleSelect"
          />
        </div>

        <div mt-2 flex items-center gap-2>
          <c-button :disabled="status === 'processing'" @click="applySplit">
            {{ t('tools.pdf-organize.texts.btn-split') }}
          </c-button>
          <n-spin v-if="status === 'processing'" size="small" />
        </div>
      </div>
    </div>
  </div>
</template>
