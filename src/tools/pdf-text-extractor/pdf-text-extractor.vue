<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { loadPdf, renderAllPages, renderPageImage, type PdfDoc } from '@/composable/pdf';
import PdfPagePreview, { type PreviewPage } from '@/components/PdfPagePreview.vue';
import ProgressBar from '@/components/ProgressBar.vue';

const { t } = useI18n();

const file = ref<File | null>(null);
const totalPages = ref(0);
const pages = ref<PreviewPage[]>([]);
/** 逐页文本缓存（1-based 页码 -> 该页文本：原生提取或 OCR 回填），口径与 unpdf 的 getPageText 一致 */
const pageTexts = ref<Record<number, string>>({});
/** 已经过 OCR 识别的页码集合（避免重复送图） */
const ocrDone = ref<Set<number>>(new Set());
/** 上传后保留 PDF 文档句柄，供 OCR 时按页重新高清渲染（用 shallowRef 避免 UnwrapRef 拆掉 pdfjs 的私有品牌类型） */
const docRef = shallowRef<PdfDoc | null>(null);
const ready = ref(false);
const mergePages = ref(false);
const errorMessage = ref('');
const progressVisible = ref(false);
const progressPercent = ref(-1);
const progressText = ref('');

// —— OCR 相关状态 ——
const ocrRange = ref('');
const ocrRunning = ref(false);
const ocrPercent = ref(-1);
const ocrText = ref('');
const ocrError = ref('');

/** 单次上传 PDF 的页数上限（超出直接在读取阶段拒绝，避免渲染/提取大文件浪费资源） */
const MAX_PDF_PAGES = 50;

const selectedCount = computed(() => pages.value.filter((p) => p.selected).length);

/** 待 OCR 的页数 = 已勾选 且 尚无文字 且 尚未 OCR 过的页 */
const ocrPendingCount = computed(
  () => pages.value.filter((p) => p.selected && !(pageTexts.value[p.id] ?? '').trim() && !ocrDone.value.has(p.id)).length,
);

/** 输出 = 选中页文本实时重组，无需重新解析 PDF */
const text = computed(() => {
  const parts = pages.value.filter((p) => p.selected).map((p) => pageTexts.value[p.id] ?? '');
  if (parts.length === 0) {
    return '';
  }
  return mergePages.value ? normalizeMergedText(parts) : parts.join('\n');
});

/** 全部页都提不到文字（原生/已OCR 都空）→ 大概率是扫描版/图片型 PDF，给用户一个明确提示 */
const noTextAtAll = computed(
  () => ready.value && pages.value.length > 0 && pages.value.every((p) => !(pageTexts.value[p.id] ?? '').trim()),
);

/**
 * 与 unpdf 的 normalizeMergedText 同一口径：折叠空白但保留换行结构
 * （页间换行存活，至多保留一个空行）。逐页缓存后在这里对选中页子集做同样处理，
 * 保证「合并页面」的结果与直接用 unpdf extractText({ mergePages: true }) 一致。
 */
function normalizeMergedText(parts: string[]): string {
  return parts
    .join('\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

async function onUpload(uploaded: File) {
  file.value = uploaded;
  totalPages.value = 0;
  pages.value = [];
  pageTexts.value = {};
  ocrDone.value = new Set();
  docRef.value = null;
  ready.value = false;
  errorMessage.value = '';
  ocrError.value = '';
  ocrRange.value = '';
  progressVisible.value = true;
  progressPercent.value = -1;
  progressText.value = t('tools.pdf-text-extractor.texts.progress-reading');
  try {
    const buf = new Uint8Array(await uploaded.arrayBuffer());
    // 给 pdfjs 传副本：getDocument 会把底层 ArrayBuffer 转移到 worker（detach），
    // 若直接传 buf，后续再次读取同一缓冲区会得到 0 字节。
    const doc = await loadPdf(buf.slice());
    docRef.value = doc;
    totalPages.value = doc.numPages;

    // 页数上限：超出直接拒绝，不再渲染/提取，先给明确提示
    if (totalPages.value > MAX_PDF_PAGES) {
      errorMessage.value = t('tools.pdf-text-extractor.texts.error-too-many-pages', {
        count: totalPages.value,
        max: MAX_PDF_PAGES,
      });
      return;
    }

    // 1) 渲染页面缩略图（带进度）
    const rendered = await renderAllPages(doc, 220, (done, total) => {
      progressPercent.value = (done / total) * 100;
      progressText.value = t('tools.pdf-text-extractor.texts.progress-rendering', { done, total });
    });

    // 2) 逐页提取文本并缓存（带进度）——之后勾选/取消勾选只需重组缓存，不再解析 PDF
    // pdfjs 的 TextContent.items 是 TextItem | TextMarkedContent 联合类型，
    // 只取带 str 的文本项（与 unpdf getPageText 同口径）；本地声明形状，不依赖 pdfjs 内部类型路径。
    const texts: Record<number, string> = {};
    for (let i = 1; i <= totalPages.value; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const items = content.items as Array<{ str?: string; hasEOL?: boolean }>;
      texts[i] = items
        .filter((item) => item.str != null)
        .map((item) => item.str! + (item.hasEOL ? '\n' : ''))
        .join('');
      progressPercent.value = (i / totalPages.value) * 100;
      progressText.value = t('tools.pdf-text-extractor.texts.progress-extracting', { done: i, total: totalPages.value });
    }
    pageTexts.value = texts;

    // 3) 初始化每页文本状态徽标：有原生文字 → text；否则 → none（待 OCR）
    pages.value = rendered.map((r) => ({
      id: r.pageNumber,
      dataUrl: r.dataUrl,
      rotation: 0,
      deleted: false,
      selected: true,
      status: (texts[r.pageNumber] ?? '').trim() ? 'text' : 'none',
    }));
    ready.value = true;
  } catch (e: any) {
    // 面向终端用户给友好中文提示，原始错误进 console 便于排查
    console.error('pdf-text-extractor:', e);
    errorMessage.value =
      e?.name === 'PasswordException'
        ? t('tools.pdf-text-extractor.texts.error-encrypted')
        : t('tools.pdf-text-extractor.texts.error-load');
    pages.value = [];
  } finally {
    progressVisible.value = false;
  }
}

function toggleSelect(id: number) {
  const p = pages.value.find((x) => x.id === id);
  if (p) {
    p.selected = !p.selected;
  }
}
function selectAll() {
  for (const p of pages.value) {
    p.selected = true;
  }
}
function invertSelection() {
  for (const p of pages.value) {
    p.selected = !p.selected;
  }
}
function clearSelection() {
  for (const p of pages.value) {
    p.selected = false;
  }
}

/** 解析页码范围字符串（如 "2, 20-38" 或 "2 20-38"）→ 1..max 内的页码集合 */
function parseRange(input: string, max: number): Set<number> {
  const out = new Set<number>();
  const parts = input.split(/[,\s]+/).filter(Boolean);
  for (const part of parts) {
    if (part.includes('-')) {
      const [a, b] = part.split('-').map((s) => parseInt(s, 10));
      if (Number.isFinite(a) && Number.isFinite(b)) {
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        for (let i = lo; i <= hi; i++) {
          if (i >= 1 && i <= max) {
            out.add(i);
          }
        }
      }
    } else {
      const n = parseInt(part, 10);
      if (Number.isFinite(n) && n >= 1 && n <= max) {
        out.add(n);
      }
    }
  }
  return out;
}

/** 应用范围：把勾选框精确设为范围内那些页（其余取消），解决百页里选几十页要点几十下的痛点 */
function applyRange() {
  const set = parseRange(ocrRange.value, totalPages.value);
  if (set.size === 0) {
    return;
  }
  for (const p of pages.value) {
    p.selected = set.has(p.id);
  }
}

/** 开始 OCR：只送「已勾选 + 尚无文字 + 未 OCR 过」的页，逐页渲染成图 → /api/pdf-ocr → 回填文本 */
async function startOcr() {
  if (!docRef.value) {
    return;
  }
  const targets = pages.value.filter(
    (p) => p.selected && !(pageTexts.value[p.id] ?? '').trim() && !ocrDone.value.has(p.id),
  );
  if (targets.length === 0) {
    ocrError.value = t('tools.pdf-text-extractor.texts.error-ocr-empty');
    return;
  }
  ocrError.value = '';
  ocrRunning.value = true;
  ocrPercent.value = 0;
  ocrText.value = t('tools.pdf-text-extractor.texts.progress-ocr', { done: 0, total: targets.length });
  try {
    let done = 0;
    for (const p of targets) {
      ocrPercent.value = (done / targets.length) * 100;
      ocrText.value = t('tools.pdf-text-extractor.texts.progress-ocr', { done, total: targets.length });
      // 高清渲染该页为 JPEG（白底、1500px 宽 ≈ 150DPI）
      const img = await renderPageImage(docRef.value, p.id, 1500, 'jpeg');
      const base64 = img.dataUrl.split(',')[1] ?? '';
      const res = await fetch('/api/pdf-ocr', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64 }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { err?: string };
        throw new Error(j.err || `HTTP ${res.status}`);
      }
      const j = (await res.json()) as { text?: string; err?: string };
      if (j.err) {
        throw new Error(j.err);
      }
      // 回填文本并标记已 OCR（再勾选变化只是重组缓存，不会重复送图）
      pageTexts.value[p.id] = j.text ?? '';
      ocrDone.value.add(p.id);
      p.status = 'ocr';
      done++;
      ocrPercent.value = (done / targets.length) * 100;
    }
    ocrText.value = '';
  } catch (e: any) {
    ocrError.value = t('tools.pdf-text-extractor.texts.error-ocr', { msg: e?.message ?? String(e) });
  } finally {
    ocrRunning.value = false;
    ocrPercent.value = -1;
  }
}
</script>

<template>
  <div>
    <div style="flex: 0 0 100%" mb-1>
      <div mx-auto max-w-600px>
        <c-file-upload
          :title="t('tools.pdf-text-extractor.texts.title-drag-and-drop-a-pdf-file-here-or-click-to-select-a-file')"
          accept=".pdf"
          @file-upload="onUpload"
        />
        <p text-xs op-60 mt-1>
          {{ t('tools.pdf-text-extractor.texts.hint-max-pages', { max: MAX_PDF_PAGES }) }}
        </p>
        <ProgressBar :visible="progressVisible" :percent="progressPercent" :text="progressText" />
      </div>
    </div>

    <c-alert v-if="errorMessage" type="error" mb-2>{{ errorMessage }}</c-alert>

    <div v-if="pages.length" mb-2>
      <div flex items-center gap-2 flex-wrap>
        <span text-sm op-70>
          {{ t('tools.pdf-text-extractor.texts.label-selected', { selected: selectedCount, total: totalPages }) }}
        </span>
        <c-button size="small" secondary @click="selectAll">{{ t('tools.pdf-text-extractor.texts.btn-select-all') }}</c-button>
        <c-button size="small" secondary @click="invertSelection">
          {{ t('tools.pdf-text-extractor.texts.btn-invert') }}
        </c-button>
        <c-button size="small" secondary @click="clearSelection">
          {{ t('tools.pdf-text-extractor.texts.btn-clear') }}
        </c-button>
        <n-checkbox v-model:checked="mergePages" ml-auto>
          {{ t('tools.pdf-text-extractor.texts.label-merge-pages') }}
        </n-checkbox>
      </div>

      <PdfPagePreview
        :pages="pages"
        :rotatable="false"
        :deletable="false"
        :movable="false"
        :selectable="true"
        :select-label="t('tools.pdf-text-extractor.texts.select-label')"
        :status-need-text="t('tools.pdf-text-extractor.texts.badge-need-ocr')"
        :status-ocr-text="t('tools.pdf-text-extractor.texts.badge-ocr-done')"
        @toggle-select="toggleSelect"
      />
      <p text-xs op-60>{{ t('tools.pdf-text-extractor.texts.hint-select') }}</p>

      <!-- OCR 控制区：仅对勾选且尚无文字的页识别，减少用量 -->
      <n-divider />
      <div flex items-center gap-2 flex-wrap>
        <n-input
          v-model:value="ocrRange"
          :placeholder="t('tools.pdf-text-extractor.texts.ocr-range')"
          style="width: 220px"
          size="small"
        />
        <c-button size="small" secondary :disabled="!ocrRange.trim()" @click="applyRange">
          {{ t('tools.pdf-text-extractor.texts.btn-apply-range') }}
        </c-button>
        <c-button size="small" :disabled="ocrRunning || ocrPendingCount === 0" @click="startOcr">
          {{ t('tools.pdf-text-extractor.texts.btn-ocr') }}
        </c-button>
        <span v-if="ocrPendingCount > 0" text-sm op-70>
          {{ t('tools.pdf-text-extractor.texts.label-ocr-pending', { n: ocrPendingCount }) }}
        </span>
        <span v-else-if="ready" text-sm op-50>{{ t('tools.pdf-text-extractor.texts.label-ocr-none') }}</span>
      </div>
      <ProgressBar :visible="ocrRunning" :percent="ocrPercent" :text="ocrText" />
      <c-alert v-if="ocrError" type="error" mt-2>{{ ocrError }}</c-alert>
      <p text-xs op-60>{{ t('tools.pdf-text-extractor.texts.hint-ocr') }}</p>
    </div>

    <c-alert v-if="ready && selectedCount === 0" type="warning" mb-2>
      {{ t('tools.pdf-text-extractor.texts.error-empty-selection') }}
    </c-alert>
    <c-alert v-else-if="noTextAtAll" type="warning" mb-2>
      {{ t('tools.pdf-text-extractor.texts.warn-no-text') }}
    </c-alert>

    <c-card v-if="ready" :title="t('tools.pdf-text-extractor.texts.title-output')">
      <input-copyable :label="t('tools.pdf-text-extractor.texts.label-file-name')" :value="file?.name" mb-1 />
      <textarea-copyable
        :label="t('tools.pdf-text-extractor.texts.label-text')"
        :value="text"
        mb-1
        download-file-name="output.txt"
      />
      <input-copyable
        :label="t('tools.pdf-text-extractor.texts.label-total-pages')"
        :value="totalPages.toString()"
        mb-1
      />
    </c-card>
  </div>
</template>
