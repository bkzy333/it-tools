<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import ToolExampleButton from '@/components/ToolExampleButton.vue';
import { translateImage } from './image-translate.service';

const { t } = useI18n();

// 约定：每个工具都要有 exampleData + 「一键示例」按钮。
const exampleData = {
  hint: '选择一张包含文字的图片（PNG/JPG），点「翻译图片」即可，前端会自动压缩到 3MB / 长边 1920px。',
};

const source = ref<'zh' | 'en'>('zh');
const target = ref<'zh' | 'en'>('en');

const loading = ref(false);
const errorMsg = ref('');
const statusMsg = ref('');
const resultDataUrl = ref('');
const fileName = ref('translated.jpg');
const fileInput = ref<HTMLInputElement | null>(null);

const LANG_OPTIONS = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: '英文' },
];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

// 上传前前端压缩：长边 ≤1920px，导出 JPEG 并压到 ≤3MB（先降质，仍超再缩边）。
// 这一步是图片额度保护的关键——绝大多数浪费来自重复上传大图，前端先压能直接砍掉一大半。
async function compressImage(file: File, maxEdge = 1920, maxBytes = 3 * 1024 * 1024): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('canvas unsupported');
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  let quality = 0.92;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  while (dataUrl.length > maxBytes && quality > 0.5) {
    quality -= 0.07;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }
  // 仍超限则继续缩边到 1280px 再试一次
  if (dataUrl.length > maxBytes && Math.max(w, h) > 1280) {
    const s2 = 1280 / Math.max(w, h);
    const w2 = Math.round(w * s2);
    const h2 = Math.round(h * s2);
    canvas.width = w2;
    canvas.height = h2;
    ctx.drawImage(bitmap, 0, 0, w2, h2);
    quality = 0.85;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
    while (dataUrl.length > maxBytes && quality > 0.5) {
      quality -= 0.07;
      dataUrl = canvas.toDataURL('image/jpeg', quality);
    }
  }
  return dataUrl;
}

// 把逐行坐标 + 译文绘制回原图：白底遮挡原文，自适应字号写译文。
function renderTranslated(
  imageDataUrl: string,
  records: { X?: number; Y?: number; W?: number; H?: number; TargetText?: string }[],
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('canvas unsupported'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      records.forEach((r) => {
        const x = Number(r.X) || 0;
        const y = Number(r.Y) || 0;
        const w = Number(r.W) || 0;
        const h = Number(r.H) || 0;
        const text = r.TargetText || '';
        if (!text) {
          return;
        }
        // 白底遮挡原文
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, w, h);
        // 字号自适应：先按行高估算，超框则缩小到能放下
        let fs = Math.max(10, Math.floor(h * 0.82));
        ctx.fillStyle = '#111111';
        ctx.font = `${fs}px sans-serif`;
        let tw = ctx.measureText(text).width;
        while (tw > w && fs > 8) {
          fs -= 1;
          ctx.font = `${fs}px sans-serif`;
          tw = ctx.measureText(text).width;
        }
        ctx.fillText(text, x + 2, y + (h - fs) / 2);
      });
      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = () => reject(new Error('image load failed'));
    img.src = imageDataUrl;
  });
}

async function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) {
    return;
  }
  errorMsg.value = '';
  // 原始文件过大先拦（压缩救不回来的直接打回，避免无意义上传）
  if (file.size > 10 * 1024 * 1024) {
    errorMsg.value = t('tools.image-translate.texts.error-too-large');
    return;
  }
  loading.value = true;
  statusMsg.value = t('tools.image-translate.texts.status-compressing');
  resultDataUrl.value = '';
  try {
    const dataUrl = await compressImage(file);
    const base64 = dataUrl.split(',')[1];
    statusMsg.value = t('tools.image-translate.texts.status-translating');
    const data = await translateImage(base64, source.value, target.value);
    if (data.err) {
      errorMsg.value = data.err;
      statusMsg.value = '';
      return;
    }
    const records = data.records || [];
    if (records.length === 0) {
      errorMsg.value = t('tools.image-translate.texts.error-no-result');
      statusMsg.value = '';
      return;
    }
    resultDataUrl.value = await renderTranslated(dataUrl, records);
    fileName.value = `translated-${source.value}-${target.value}.jpg`;
    statusMsg.value = t('tools.image-translate.texts.status-done', {
      n: records.length,
      from: LANG_OPTIONS.find((o) => o.value === (data.source || source.value))?.label ?? source.value,
      to: LANG_OPTIONS.find((o) => o.value === (data.target || target.value))?.label ?? target.value,
    });
  } catch {
    errorMsg.value = t('tools.image-translate.texts.error-network');
    statusMsg.value = '';
  } finally {
    loading.value = false;
  }
}

function loadExample() {
  errorMsg.value = '';
  statusMsg.value = t('tools.image-translate.texts.example-hint');
}

function swap() {
  const s = source.value;
  source.value = target.value;
  target.value = s;
}
</script>

<template>
  <c-card :title="t('tools.image-translate.texts.title-image-translate')" max-w-800px>
    <div flex flex-col gap-3>
      <n-alert type="info" :show-icon="true">{{ t('tools.image-translate.texts.tip-only-zh-en') }}</n-alert>

      <div flex flex-col gap-2 sm:flex-row sm:items-end>
        <n-form-item :label="t('tools.image-translate.texts.label-from')" label-placement="top" flex-1 mb-0>
          <n-select v-model:value="source" :options="LANG_OPTIONS" />
        </n-form-item>
        <n-button secondary circle mb-1 :title="t('tools.image-translate.texts.swap')" @click="swap">⇄</n-button>
        <n-form-item :label="t('tools.image-translate.texts.label-to')" label-placement="top" flex-1 mb-0>
          <n-select v-model:value="target" :options="LANG_OPTIONS" />
        </n-form-item>
      </div>

      <input ref="fileInput" type="file" accept="image/png,image/jpeg" hidden @change="onFileChange" />

      <div flex flex-wrap gap-2>
        <n-button type="primary" :loading="loading" :disabled="loading" @click="fileInput?.click()">
          {{ t('tools.image-translate.texts.button-translate') }}
        </n-button>
        <ToolExampleButton @click="loadExample" />
        <span v-if="loading" text-sm text-muted>{{ statusMsg }}</span>
      </div>

      <n-alert v-if="errorMsg" type="error" :show-icon="true">{{ errorMsg }}</n-alert>
      <span v-if="statusMsg && !loading" text-sm text-muted>{{ statusMsg }}</span>

      <div v-if="resultDataUrl" flex flex-col gap-2>
        <img :src="resultDataUrl" alt="translated" max-w-full rounded border />
        <n-button tag="a" :href="resultDataUrl" :download="fileName" secondary>
          {{ t('tools.image-translate.texts.button-download') }}
        </n-button>
      </div>
    </div>
  </c-card>
</template>
