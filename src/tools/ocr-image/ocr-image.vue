<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { ref, computed, watch } from 'vue';
import { createWorker } from 'tesseract.js';
import { getDocument } from 'pdfjs-dist';
import * as pdfJS from 'pdfjs-dist';
import pdfJSWorkerURL from 'pdfjs-dist/build/pdf.worker?url';
import { textStatistics } from '../text-statistics/text-statistics.service';
import TextareaCopyable from '@/components/TextareaCopyable.vue';
import { useQueryParamOrStorage } from '@/composable/queryParams';
import { computeInkBBox, type NormRect } from './ocr-region.service';
import ImageCropSelector from '@/components/ImageCropSelector.vue';

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
const ocrText = ref('');
const fileInput = ref<File | null>(null);

// —— 新增：选区流程状态 ——
// stage: 'upload'（未选文件）| 'select'（已上传，待框选）| 'result'（已出结果）
const stage = ref<'upload' | 'select' | 'result'>('upload');
// 显示在选区组件里的图（图片原图 dataURL，或 PDF 首页 dataURL）
const displaySrc = ref('');
// 归一化选区（相对原图比例 0~1）；null 表示整图
const selection = ref<NormRect | null>(null);
// PDF 每页渲染后的 dataURL（多页时选区归一化套用每页）
const pdfPages = ref<string[]>([]);
// 启发式自动框选是否失败（失败时提示用户可手动框选）
const autoDetectFailed = ref(false);

const stats = computed(() => textStatistics(ocrText.value?.replace(new RegExp(pageSeparator, 'g'), ' ') || ''));
const pageCount = computed(() => ocrText.value?.split(new RegExp(pageSeparator, 'g')).length || 0);

function onUpload(file: File) {
  if (file) {
    fileInput.value = file;
  }
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
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
  const img = await loadImage(dataUrl);
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

// —— 纯前端启发式默认框选：零额度，不调百度 ——
// 把图缩到 600px 取像素，用 computeInkBBox 求文字包围盒，返回归一化 rect（找不到则 null = 整图）。
async function detectRegion(du: string): Promise<NormRect | null> {
  const img = await loadImage(du);
  const nw = img.naturalWidth || img.width;
  const nh = img.naturalHeight || img.height;
  if (!nw || !nh) {
    return null;
  }
  const maxEdge = 600;
  const scale = Math.min(1, maxEdge / Math.max(nw, nh));
  const w = Math.max(1, Math.round(nw * scale));
  const h = Math.max(1, Math.round(nh * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }
  ctx.drawImage(img, 0, 0, w, h);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return null; // 跨域污染等异常 → 回退整图
  }
  return computeInkBBox(data, w, h);
}

// 按归一化选区把原图裁成小图并压缩（沿用在压缩逻辑，转 JPEG 限 3MB）
async function cropImage(img: HTMLImageElement, rect: NormRect): Promise<string> {
  const nw = img.naturalWidth || img.width;
  const nh = img.naturalHeight || img.height;
  const sx = Math.floor(clamp(rect.x, 0, 1) * nw);
  const sy = Math.floor(clamp(rect.y, 0, 1) * nh);
  const sw = Math.max(1, Math.floor(clamp(rect.w, 0, 1) * nw));
  const sh = Math.max(1, Math.floor(clamp(rect.h, 0, 1) * nh));
  const cx = Math.min(sx, nw - 1);
  const cy = Math.min(sy, nh - 1);
  const cw = Math.max(1, Math.min(sw, nw - cx));
  const ch = Math.max(1, Math.min(sh, nh - cy));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('canvas unsupported');
  }
  ctx.drawImage(img, cx, cy, cw, ch, 0, 0, cw, ch);
  const raw = canvas.toDataURL('image/png');
  return compressCanvas(raw);
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
  return data.text || '';
}

// —— 兜底路径：tesseract.js（仅当 API 不可达时，中国网络下可能因 jsdelivr 被墙而失败）——
async function runOcrTesseractFromDataUrls(dataUrls: string[], lang: string): Promise<string> {
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  try {
    worker = await withTimeout(
      createWorker(TESS_MAP[lang] || 'eng'),
      90_000,
      'OCR 引擎初始化超时：无法下载语言包或核心文件，请检查网络后重试（首次使用需联网下载语言数据包）。',
    );
    const allTexts: string[] = [];
    for (const du of dataUrls) {
      const ret = await worker.recognize(du);
      allTexts.push(ret.data.text);
    }
    return allTexts.join(pageSeparator);
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

// —— 上传后：进入选区阶段，并尝试前端启发式默认框选 ——
async function enterSelectStage(file: File) {
  ocrText.value = '';
  ocrError.value = '';
  autoDetectFailed.value = false;
  try {
    if (file.type.match('^image/')) {
      const du = await readFileAsDataUrl(file);
      displaySrc.value = du;
      pdfPages.value = [];
      selection.value = await detectRegion(du);
    } else {
      const pages = await convertPdfToImage(file);
      pdfPages.value = pages;
      displaySrc.value = pages[0] || '';
      selection.value = pages[0] ? await detectRegion(pages[0]) : null;
    }
    autoDetectFailed.value = !selection.value;
    stage.value = 'select';
  } catch (e: any) {
    ocrError.value = e?.message || '无法读取文件';
  }
}

async function reautoDetect() {
  if (!displaySrc.value) {
    return;
  }
  const r = await detectRegion(displaySrc.value);
  selection.value = r;
  autoDetectFailed.value = !r;
}

function selectAll() {
  selection.value = { x: 0, y: 0, w: 1, h: 1 };
  autoDetectFailed.value = false;
}

// —— 识别当前选区：只把裁好的小图发给 /api/ocr ——
async function recognize() {
  if (ocrInProgress.value) {
    return;
  }
  if (!displaySrc.value) {
    return;
  }
  ocrInProgress.value = true;
  ocrError.value = '';
  const rect = selection.value ?? { x: 0, y: 0, w: 1, h: 1 };
  const sources = pdfPages.value.length ? pdfPages.value : [displaySrc.value];
  // 先把选区裁好、压缩（一次），API 与 tesseract 兜底都复用同一组小图
  const cropped: string[] = [];
  try {
    for (const src of sources) {
      const img = await loadImage(src);
      cropped.push(await cropImage(img, rect));
    }
    const texts: string[] = [];
    for (const du of cropped) {
      texts.push(await callOcrApi(stripPrefix(du), language.value));
    }
    ocrText.value = texts.join(pageSeparator);
    stage.value = 'result';
  } catch (e: any) {
    if (e?.notConfigured) {
      // API 未配置：明确提示，不再走（在中国网络下必失败的）tesseract 兜底。
      ocrError.value =
        'OCR 服务未配置：请在 Cloudflare Pages 设置 BAIDU_OCR_API_KEY / BAIDU_OCR_SECRET_KEY 环境变量后重试。';
      ocrText.value = '';
      return;
    }
    // 其他异常（网络/限流/配额）：尝试 tesseract 兜底（同样用裁好的小图）
    try {
      ocrText.value = await runOcrTesseractFromDataUrls(cropped, language.value);
      stage.value = 'result';
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
      @file-upload="
        (file: File) => {
          onUpload(file);
          void enterSelectStage(file);
        }
      "
    />

    <n-divider />

    <div id="container" style="display: none" />

    <!-- 选区阶段：显示图 + 可拖拽选框 + 操作按钮 -->
    <div v-if="stage === 'select' && displaySrc">
      <h3>{{ t('tools.ocr-image.texts.title-region-select') }}</h3>
      <p class="ocr-hint">{{ t('tools.ocr-image.texts.hint-region-select') }}</p>
      <n-alert v-if="autoDetectFailed" type="warning" :show-icon="false">
        {{ t('tools.ocr-image.texts.hint-auto-detect-failed') }}
      </n-alert>

      <ImageCropSelector v-model="selection" :src="displaySrc" />

      <n-space mt-3>
        <n-button type="primary" :disabled="ocrInProgress" @click="recognize">
          {{ t('tools.ocr-image.texts.btn-recognize-region') }}
        </n-button>
        <n-button :disabled="ocrInProgress" @click="reautoDetect">
          {{ t('tools.ocr-image.texts.btn-auto-detect') }}
        </n-button>
        <n-button :disabled="ocrInProgress" @click="selectAll">
          {{ t('tools.ocr-image.texts.btn-select-all') }}
        </n-button>
      </n-space>

      <n-spin v-if="ocrInProgress" size="small" mt-2 />
    </div>

    <!-- 结果阶段 -->
    <div v-else-if="stage === 'result' && ocrText">
      <h3>{{ t('tools.ocr-image.texts.tag-ocr') }}</h3>
      <TextareaCopyable
        v-model:value="ocrText"
        :word-wrap="true"
        download-file-name="output.txt"
      />
      <n-space mt-2>
        <n-button :disabled="ocrInProgress" @click="recognize">
          {{ t('tools.ocr-image.texts.btn-recognize-region') }}
        </n-button>
        <n-button :disabled="ocrInProgress" @click="stage = 'select'">
          {{ t('tools.ocr-image.texts.btn-adjust-selection') }}
        </n-button>
      </n-space>
      <n-spin v-if="ocrInProgress" size="small" mt-2 />
    </div>

    <n-alert v-if="ocrError" type="error" title="OCR 失败" mt-2>
      {{ ocrError }}
    </n-alert>

    <c-card
      v-if="stage === 'result' && ocrText"
      :title="t('tools.ocr-image.texts.title-statistics')"
    >
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
.ocr-hint {
  color: var(--text-color-3, #888);
  font-size: 13px;
  margin: 4px 0 10px;
}

::v-deep(.n-upload-trigger) {
  width: 100%;
}
</style>
