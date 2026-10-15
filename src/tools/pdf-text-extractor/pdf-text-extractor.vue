<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { loadPdf, renderAllPages } from '@/composable/pdf';
import PdfPagePreview, { type PreviewPage } from '@/components/PdfPagePreview.vue';
import ProgressBar from '@/components/ProgressBar.vue';

const { t } = useI18n();

const file = ref<File | null>(null);
const totalPages = ref(0);
const pages = ref<PreviewPage[]>([]);
/** 逐页文本缓存（1-based 页码 -> 该页原始文本），口径与 unpdf 的 getPageText 完全一致 */
const pageTexts = ref<Record<number, string>>({});
const ready = ref(false);
const mergePages = ref(false);
const errorMessage = ref('');
const progressVisible = ref(false);
const progressPercent = ref(-1);
const progressText = ref('');

const selectedCount = computed(() => pages.value.filter((p) => p.selected).length);

/** 输出 = 选中页文本实时重组，无需重新解析 PDF */
const text = computed(() => {
  const parts = pages.value.filter((p) => p.selected).map((p) => pageTexts.value[p.id] ?? '');
  if (parts.length === 0) {
    return '';
  }
  return mergePages.value ? normalizeMergedText(parts) : parts.join('\n');
});

/** 全部页都提不到文字 → 大概率是扫描版/图片型 PDF，给用户一个明确提示 */
const noTextAtAll = computed(() => ready.value && Object.values(pageTexts.value).every((s) => s.trim() === ''));

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
  ready.value = false;
  errorMessage.value = '';
  progressVisible.value = true;
  progressPercent.value = -1;
  progressText.value = t('tools.pdf-text-extractor.texts.progress-reading');
  try {
    const buf = new Uint8Array(await uploaded.arrayBuffer());
    // 给 pdfjs 传副本：getDocument 会把底层 ArrayBuffer 转移到 worker（detach），
    // 若直接传 buf，后续再次读取同一缓冲区会得到 0 字节。
    const doc = await loadPdf(buf.slice());
    totalPages.value = doc.numPages;

    // 1) 渲染页面缩略图（带进度）
    const rendered = await renderAllPages(doc, 220, (done, total) => {
      progressPercent.value = (done / total) * 100;
      progressText.value = t('tools.pdf-text-extractor.texts.progress-rendering', { done, total });
    });
    pages.value = rendered.map((r) => ({
      id: r.pageNumber,
      dataUrl: r.dataUrl,
      rotation: 0,
      deleted: false,
      selected: true,
    }));

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
        @toggle-select="toggleSelect"
      />
      <p text-xs op-60>{{ t('tools.pdf-text-extractor.texts.hint-select') }}</p>
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
