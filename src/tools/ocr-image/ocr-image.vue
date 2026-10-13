<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { ref, watch } from 'vue';
import { createWorker } from 'tesseract.js';
import { getDocument } from 'pdfjs-dist';
import * as pdfJS from 'pdfjs-dist';
import pdfJSWorkerURL from 'pdfjs-dist/build/pdf.worker?url';
import { textStatistics } from '../text-statistics/text-statistics.service';
import TextareaCopyable from '@/components/TextareaCopyable.vue';
import { useQueryParamOrStorage } from '@/composable/queryParams';

const { t } = useI18n();

// 百度智能云 OCR 支持的 language_type（accurate_basic）。默认中英文混合，覆盖绝大多数中文站场景。
const languages = [
  { name: '中英文混合', code: 'CHN_ENG' },
  { name: 'English', code: 'ENG' },
  { name: '日本語', code: 'JAP' },
  { name: '한국어', code: 'KOR' },
  { name: 'Français', code: 'FRE' },
  { name: 'Español', code: 'SPA' },
  { name: 'Русский', code: 'RUS' },
  { name: 'Deutsch', code: 'GER' },
  { name: 'Português', code: 'POR' },
  { name: 'Italiano', code: 'ITA' },
  { name: 'Nederlands', code: 'DUT' },
  { name: 'Türkçe', code: 'TUR' },
  { name: 'Polski', code: 'POL' },
  { name: 'Svenska', code: 'SWE' },
  { name: 'Bahasa Indonesia', code: 'IND' },
  { name: 'Melayu', code: 'MAL' },
  { name: 'Dansk', code: 'DAN' },
  { name: 'Ελληνικά', code: 'GRE' },
  { name: 'Magyar', code: 'HUN' },
  { name: 'Română', code: 'ROM' },
  { name: 'Tiếng Việt', code: 'VIE' },
  { name: 'ไทย', code: 'THA' },
  { name: 'العربية', code: 'ARA' },
];
const languagesOptions = languages.map((l) => ({ label: l.name, value: l.code }));
// tesseract.js 兜底用的语言码（仅兜底路径使用）
const TESS_MAP: Record<string, string> = {
  CHN_ENG: 'chi_sim+eng',
  ENG: 'eng',
  JAP: 'jpn',
  KOR: 'kor',
  FRE: 'fra',
  SPA: 'spa',
  RUS: 'rus',
  GER: 'deu',
  POR: 'por',
  ITA: 'ita',
  DUT: 'nld',
  TUR: 'tur',
  POL: 'pol',
  SWE: 'swe',
  IND: 'ind',
  MAL: 'msa',
  DAN: 'dan',
  GRE: 'ell',
  HUN: 'hun',
  ROM: 'ron',
  THA: 'tha',
  VIE: 'vie',
  ARA: 'ara',
};

const language = useQueryParamOrStorage({ name: 'lang', storageName: 'ocr-image:lang', defaultValue: 'CHN_ENG' });

const pageSeparator = '\n=============\n';
const ocrInProgress = ref(false);
const ocrError = ref('');
const ocrHitCache = ref(false);
const fileInput = ref<File | null>(null);
const ocrText = ref('');

const stats = computed(() => textStatistics(ocrText.value?.replace(new RegExp(pageSeparator, 'g'), ' ') || ''));
const pageCount = computed(() => ocrText.value?.split(new RegExp(pageSeparator, 'g')).length || 0);

function onUpload(file: File) {
  if (file) {
    fileInput.value = file;
  }
}

// —— 上传前压缩（照搬 image-translate）：长边 ≤1920px，JPEG 0.85，≤3MB ——
// 这一步是额度保护关键：绝大多数浪费来自重复传大图，前端先压能直接砍掉一大半。
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

async function compressCanvas(dataUrl: string, maxEdge = 1920, maxBytes = 3 * 1024 * 1024): Promise<string> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('image load failed'));
    img.src = dataUrl;
  });
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('canvas unsupported');
  }
  ctx.drawImage(img, 0, 0, w, h);
  let quality = 0.85;
  let out = canvas.toDataURL('image/jpeg', quality);
  while (out.length > maxBytes && quality > 0.5) {
    quality -= 0.07;
    out = canvas.toDataURL('image/jpeg', quality);
  }
  if (out.length > maxBytes && Math.max(w, h) > 1280) {
    const s2 = 1280 / Math.max(w, h);
    canvas.width = Math.round(w * s2);
    canvas.height = Math.round(h * s2);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    quality = 0.85;
    out = canvas.toDataURL('image/jpeg', quality);
    while (out.length > maxBytes && quality > 0.5) {
      quality -= 0.07;
      out = canvas.toDataURL('image/jpeg', quality);
    }
  }
  return out;
}

function stripPrefix(dataUrl: string): string {
  return dataUrl.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
}

// PDF → 逐页渲染成图片（最多 20 页，防单文件刷爆额度）
async function convertPdfToImage(file: File): Promise<string[]> {
  const pdf = await loadPdfFile(file);
  const total = Math.min(pdf.numPages, 20);
  const images: string[] = [];
  const container = document.getElementById('container');
  for (let pageNumber = 1; pageNumber <= total; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    container?.appendChild(canvas);
    await page
      .render({ canvasContext: canvas.getContext('2d') as CanvasRenderingContext2D, viewport })
      .promise.catch(() => undefined);
    images.push(canvas.toDataURL('image/png'));
  }
  return images;
}

async function loadPdfFile(file: File) {
  const arrBuffer = await file.arrayBuffer();
  const byteArray = new Uint8Array(arrBuffer);
  return getDocument({ data: byteArray }).promise;
}

// —— 主路径：调本站 /api/ocr（服务端代理百度 OCR）——
async function callOcrApi(base64: string, languageType: string): Promise<string> {
  const resp = await fetch('/api/ocr', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image: base64, language: languageType }),
  });
  const data = (await resp.json()) as { text?: string; error?: string; message?: string; hitCache?: boolean };
  if (resp.status === 501 && data.error === 'not_configured') {
    const e = new Error('not_configured') as Error & { notConfigured?: boolean };
    e.notConfigured = true;
    throw e;
  }
  if (!resp.ok) {
    throw new Error(data.message || data.error || `OCR 请求失败 (${resp.status})`);
  }
  ocrHitCache.value = Boolean(data.hitCache);
  return data.text || '';
}

// —— 兜底路径：tesseract.js（仅当 API 不可达时，中国网络下可能因 jsdelivr 被墙而失败）——
async function runOcrTesseract(file: File, lang: string) {
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  try {
    worker = await withTimeout(
      createWorker(TESS_MAP[lang] || 'eng'),
      90_000,
      'OCR 引擎初始化超时：无法下载语言包或核心文件，请检查网络后重试（首次使用需联网下载语言数据包）。',
    );
    const allTexts: string[] = [];
    if (file.type.match('^image/')) {
      const ret = await worker.recognize(file);
      allTexts.push(ret.data.text);
    } else {
      pdfJS.GlobalWorkerOptions.workerSrc = pdfJSWorkerURL;
      for (const image of await convertPdfToImage(file)) {
        const ret = await worker.recognize(image);
        allTexts.push(ret.data.text);
      }
    }
    ocrText.value = allTexts.join(pageSeparator);
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch {
        /* ignore */
      }
    }
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(msg)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

watch(
  [fileInput, language],
  ([file, lang]) => {
    if (!file) {
      ocrText.value = '';
      ocrError.value = '';
      ocrHitCache.value = false;
      return;
    }
    void runOcr(file, lang);
  },
  { flush: 'post' },
);

async function runOcr(file: File, lang: string) {
  // 防抖 / 重叠保护：处理中忽略新触发，避免无意识重复上传刷额度（与 text-translate 同款）。
  if (ocrInProgress.value) {
    return;
  }
  ocrInProgress.value = true;
  ocrError.value = '';
  ocrHitCache.value = false;
  try {
    const isPdf = !file.type.match('^image/');
    const b64list: string[] = [];
    if (!isPdf) {
      const du = await readFileAsDataUrl(file);
      b64list.push(stripPrefix(await compressCanvas(du)));
    } else {
      const pages = await convertPdfToImage(file);
      for (const du of pages) {
        b64list.push(stripPrefix(await compressCanvas(du)));
      }
    }
    const texts: string[] = [];
    for (const b64 of b64list) {
      texts.push(await callOcrApi(b64, lang));
    }
    ocrText.value = texts.join(pageSeparator);
  } catch (e: any) {
    if (e?.notConfigured) {
      // API 未配置：明确提示，不再走（在中国网络下必失败的）tesseract 兜底。
      ocrError.value =
        'OCR 服务未配置：请在 Cloudflare Pages 设置 BAIDU_OCR_API_KEY / BAIDU_OCR_SECRET_KEY 环境变量后重试。';
      ocrText.value = '';
      return;
    }
    // 其他异常（网络/限流/配额）：尝试 tesseract 兜底，再失败才报错。
    try {
      await runOcrTesseract(file, lang);
    } catch (e2: any) {
      ocrError.value = e2?.message || String(e2);
      ocrText.value = '';
    }
  } finally {
    ocrInProgress.value = false;
  }
}
</script>

<template>
  <div>
    <c-select
      v-model:value="language"
      :label="t('tools.ocr-image.texts.label-language')"
      :options="languagesOptions"
      searchable
      mb-2
    />

    <c-file-upload
      :title="t('tools.ocr-image.texts.title-drag-and-drop-a-image-or-pdf-here-or-click-to-select-a-file')"
      :paste-image="true"
      @file-upload="onUpload"
    />

    <n-divider />

    <div id="container" style="display: none" />

    <div>
      <h3>{{ t('tools.ocr-image.texts.tag-ocr') }}</h3>
      <TextareaCopyable
        v-if="!ocrInProgress && !ocrError && ocrText"
        v-model:value="ocrText"
        :word-wrap="true"
        download-file-name="output.txt"
      />
      <n-spin v-if="ocrInProgress" size="small" />
      <n-alert v-if="ocrHitCache && ocrText" type="success" :show-icon="true">
        {{ t('tools.text-translate.texts.cached-hint') }}
      </n-alert>
      <n-alert v-if="ocrError" type="error" title="OCR 失败">
        {{ ocrError }}
      </n-alert>
    </div>

    <c-card v-if="!ocrInProgress && !ocrError && ocrText" :title="t('tools.ocr-image.texts.title-statistics')">
      <n-space mt-3>
        <n-statistic :label="t('tools.ocr-image.texts.label-character-count')" :value="stats.chars" />
        <n-statistic :label="t('tools.ocr-image.texts.label-word-count')" :value="stats.words" />
        <n-statistic :label="t('tools.ocr-image.texts.label-line-count')" :value="stats.lines" />
        <n-statistic :label="t('tools.ocr-image.texts.label-pages-count')" :value="pageCount" />
        <n-statistic :label="t('tools.ocr-image.texts.label-sentences-count')" :value="stats.sentences" />
      </n-space>

      <n-divider />

      <n-space>
        <n-statistic :label="t('tools.ocr-image.texts.label-chars-no-spaces')" :value="stats.chars_no_spaces" />
        <n-statistic :label="t('tools.ocr-image.texts.label-uppercase-chars')" :value="stats.chars_upper" />
        <n-statistic :label="t('tools.ocr-image.texts.label-lowercase-chars')" :value="stats.chars_lower" />
        <n-statistic :label="t('tools.ocr-image.texts.label-digit-chars')" :value="stats.chars_digits" />
        <n-statistic :label="t('tools.ocr-image.texts.label-punctuations')" :value="stats.chars_puncts" />
        <n-statistic :label="t('tools.ocr-image.texts.label-spaces-chars')" :value="stats.chars_spaces" />
        <n-statistic :label="t('tools.ocr-image.texts.label-word-count-no-punct')" :value="stats.words_no_puncs" />
      </n-space>
    </c-card>
  </div>
</template>

<style lang="less" scoped>
::v-deep(.n-upload-trigger) {
  width: 100%;
}
</style>
