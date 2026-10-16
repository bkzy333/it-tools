<script setup lang="ts">
import type { BackgroundRemovalPipeline, ProgressInfo } from '@huggingface/transformers';
import { RawImage, env, pipeline } from '@huggingface/transformers';
import { useMessage } from 'naive-ui';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import ImageCompareSlider from '@/components/ImageCompareSlider.vue';
import { useQueryParamOrStorage } from '@/composable/queryParams';
import { appBaseUrl } from '@/utils/base-url';

// ——— 模型与推理运行时全部自托管同源（public/ai/），不依赖任何第三方域名 ———
// 模型：Xenova/modnet 的 fp16 版（12.4MB）；运行时：onnxruntime-web 的 wasm（21MB）。
// 为什么自托管：hf-mirror.com 对浏览器跨域请求不返回 CORS 头（真浏览器实测直接被拒），
// huggingface.co 在国内连接超时——「让浏览器去远程仓库下模型」这条路走不通。
// 为什么用 fp16 而不是 q8 量化版：q8 会明显劣化抠图质量（实测正面特写人像会被整张误删），
// fp16 与 fp32 输出一致而体积只有一半。
//
// ⚠ 这里必须用 appBaseUrl（运行期解析 <base href>），不能用 import.meta.env.BASE_URL：
// 本仓库的构建是路径无关的，BASE_URL 在产物里是 "./"，而 ORT 加载 wasm 用的是动态 import()，
// 它按**模块** URL（/assets/）解析而不是页面 URL —— 用 "./ai/ort/" 会去请求
// /assets/ai/ort/ort-wasm-simd-threaded.jsep.mjs，落到 SPA fallback 拿到 text/html，
// 最终报 "no available backend found"。详见 src/utils/base-url.ts。
const modelBase = `${appBaseUrl}ai/`;
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = `${modelBase}models/`;
env.backends.onnx.wasm!.wasmPaths = `${modelBase}ort/`;
// 本站不能开 COOP/COEP（会连带打死 AdSense 与第三方统计），crossOriginIsolated 恒为 false，
// 多线程 wasm 只会拿到一个假 worker 并在控制台报错。显式钉成 1 线程，单张图实测 1~2 秒。
env.backends.onnx.wasm!.numThreads = 1;

const MODEL_FILE = 'Xenova/modnet';

const { t } = useI18n();
const message = useMessage();

const inputImage = ref<File | null>(null);
const inputUrl = ref<string | null>(null);
const outputUrl = ref<string | null>(null);
const loading = ref(false);
const error = ref('');

/** 模型加载阶段：idle 未开始 / runtime 下载运行时 wasm / model 下载模型权重 / ready 就绪 */
const modelPhase = ref<'idle' | 'runtime' | 'model' | 'ready'>('idle');
const modelPercent = ref(0);

const backgroundMode = useQueryParamOrStorage({ name: 'bgmode', storageName: 'rmbg:bgm', defaultValue: 'transparent' });
const backgroundOptions = [
  { label: t('tools.remove-background.texts.label-transparent'), value: 'transparent' },
  { label: t('tools.remove-background.texts.label-solid-color'), value: 'color' },
  { label: t('tools.remove-background.texts.label-pattern'), value: 'pattern' },
  { label: t('tools.remove-background.texts.label-blurred-original'), value: 'blur' },
  { label: t('tools.remove-background.texts.label-adjust-contrast-brightness'), value: 'adjust' },
];

const backgroundColor = useQueryParamOrStorage({ name: 'bgcolor', storageName: 'rmbg:bg', defaultValue: '#ffffff' });
const patternName = useQueryParamOrStorage({ name: 'pattern', storageName: 'rmbg:pa', defaultValue: 'stripes' });
const patternOptions = [
  { label: t('tools.remove-background.texts.label-diagonal-stripes'), value: 'stripes' },
  { label: t('tools.remove-background.texts.label-dots'), value: 'dots' },
  { label: t('tools.remove-background.texts.label-checkerboard'), value: 'checker' },
];

const blurAmount = useQueryParamOrStorage({ name: 'blur', storageName: 'rmbg:bl', defaultValue: 12 });
const contrast = useQueryParamOrStorage({ name: 'contrast', storageName: 'rmbg:co', defaultValue: 1 });
const brightness = useQueryParamOrStorage({ name: 'bright', storageName: 'rmbg:br', defaultValue: 1 });

let bodyRemovalPipeline: BackgroundRemovalPipeline | null = null;

// pipeline() 的重载签名有几十个任务分支，直接调用会让 tsc 报 TS2590（联合类型过于复杂），
// 所以先收窄成一个窄签名再调用。
const createPipeline = pipeline as unknown as (
  task: string,
  model: string,
  options: { dtype: string; progress_callback: (p: ProgressInfo) => void },
) => Promise<BackgroundRemovalPipeline>;

function onUpload(file: File) {
  if (inputUrl.value) {
    URL.revokeObjectURL(inputUrl.value);
  }
  inputImage.value = file;
  inputUrl.value = URL.createObjectURL(file);
  outputUrl.value = null;
  error.value = '';
}

function onProgress(p: ProgressInfo) {
  // 运行时 wasm 由 onnxruntime 自己加载，没有进度回调；只有模型文件会报进度
  if (p && typeof (p as any).progress === 'number') {
    modelPhase.value = 'model';
    modelPercent.value = Math.round((p as any).progress);
  }
}

async function ensurePipeline() {
  if (bodyRemovalPipeline) {
    return;
  }

  modelPhase.value = 'runtime';
  modelPercent.value = 0;

  try {
    bodyRemovalPipeline = await createPipeline('background-removal', MODEL_FILE, {
      dtype: 'fp16',
      progress_callback: onProgress,
    });
    modelPhase.value = 'ready';
    modelPercent.value = 100;
  } catch (e) {
    modelPhase.value = 'idle';
    throw e;
  }
}

const backgroundRenderers = {
  transparent(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.clearRect(0, 0, w, h);
  },

  color(ctx: CanvasRenderingContext2D, w: number, h: number, opts: { backgroundColor: string }) {
    ctx.fillStyle = opts.backgroundColor;
    ctx.fillRect(0, 0, w, h);
  },

  pattern(ctx: CanvasRenderingContext2D, w: number, h: number, opts: { patternName: string }) {
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 40;
    pCanvas.height = 40;
    const pCtx = pCanvas.getContext('2d')!;

    if (opts.patternName === 'stripes') {
      pCtx.fillStyle = '#ddd';
      pCtx.fillRect(0, 0, 40, 40);
      pCtx.strokeStyle = '#aaa';
      pCtx.lineWidth = 6;
      pCtx.beginPath();
      pCtx.moveTo(0, 40);
      pCtx.lineTo(40, 0);
      pCtx.stroke();
    }

    if (opts.patternName === 'dots') {
      pCtx.fillStyle = '#eee';
      pCtx.fillRect(0, 0, 40, 40);
      pCtx.fillStyle = '#bbb';
      pCtx.beginPath();
      pCtx.arc(20, 20, 6, 0, Math.PI * 2);
      pCtx.fill();
    }

    if (opts.patternName === 'checker') {
      pCtx.fillStyle = '#fff';
      pCtx.fillRect(0, 0, 40, 40);
      pCtx.fillStyle = '#ccc';
      pCtx.fillRect(0, 0, 20, 20);
      pCtx.fillRect(20, 20, 20, 20);
    }

    const pattern = ctx.createPattern(pCanvas, 'repeat');
    ctx.fillStyle = pattern!;
    ctx.fillRect(0, 0, w, h);
  },

  blur(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    opts: { blurAmount: number },
    originalImage: CanvasImageSource,
  ) {
    ctx.filter = `blur(${opts.blurAmount}px)`;
    ctx.drawImage(originalImage, 0, 0, w, h);
    ctx.filter = 'none';
  },

  adjust(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    opts: { contrast: number; brightness: number },
    originalImage: CanvasImageSource,
  ) {
    ctx.filter = `contrast(${opts.contrast}) brightness(${opts.brightness})`;
    ctx.drawImage(originalImage, 0, 0, w, h);
    ctx.filter = 'none';
  },
} as unknown as {
  [index: string]: (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    opts: any,
    originalImage: CanvasImageSource,
  ) => void;
};

function rawImageToCanvas(raw: RawImage) {
  const canvas = document.createElement('canvas');
  canvas.width = raw.width;
  canvas.height = raw.height;

  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(raw.width, raw.height);

  const { data, width, height, channels } = raw;

  for (let i = 0, j = 0; i < width * height; i++) {
    const r = data[i * channels + 0] ?? 0;
    const g = data[i * channels + 1] ?? 0;
    const b = data[i * channels + 2] ?? 0;
    const a = channels === 4 ? data[i * channels + 3] : 255;

    imageData.data[j++] = r;
    imageData.data[j++] = g;
    imageData.data[j++] = b;
    imageData.data[j++] = a;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

async function removeBackground() {
  // loading 期间再点会并发跑两次推理（n-spin 只加遮罩，不禁用按钮），这里直接拦住
  if (!inputImage.value || loading.value) {
    return;
  }

  error.value = '';
  loading.value = true;

  try {
    // 模型/运行时加载失败与图片处理失败要分开报，否则「图片格式不支持」会被误报成「模型加载失败」
    try {
      await ensurePipeline();
    } catch (e: any) {
      console.error('[remove-background] 模型加载失败', e);
      error.value = t('tools.remove-background.texts.error-model-load-failed');
      return;
    }

    const file = inputImage.value;
    const originalImage = await createImageBitmap(file);
    const imageBitmap = await RawImage.fromBlob(file)!;
    const results = await bodyRemovalPipeline!(imageBitmap);

    const canvas = document.createElement('canvas');
    canvas.width = imageBitmap.width;
    canvas.height = imageBitmap.height;
    const ctx = canvas.getContext('2d')!;

    backgroundRenderers[backgroundMode.value](
      ctx,
      canvas.width,
      canvas.height,
      {
        backgroundColor: backgroundColor.value,
        patternName: patternName.value,
        blurAmount: blurAmount.value,
        contrast: contrast.value,
        brightness: brightness.value,
      },
      originalImage,
    );

    ctx.drawImage(rawImageToCanvas(results[0]), 0, 0, canvas.width, canvas.height);

    outputUrl.value = canvas.toDataURL('image/png')!;
    originalImage.close();
  } catch (e: any) {
    console.error('[remove-background] 处理失败', e);
    error.value = t('tools.remove-background.texts.error-process-failed');
  } finally {
    loading.value = false;
  }
}

const outputFileName = computed(() => {
  const base = (inputImage.value?.name || 'image').replace(/\.[^.]+$/, '');
  return `${base}-removebg.png`;
});

function downloadResult() {
  const a = document.createElement('a');
  a.href = outputUrl.value!;
  a.download = outputFileName.value;
  a.click();
}

async function copyResult() {
  if (!outputUrl.value) {
    return;
  }

  try {
    const ClipboardItemCtor = (window as any).ClipboardItem;
    if (!navigator.clipboard || !ClipboardItemCtor) {
      throw new Error('clipboard-image-unsupported');
    }
    // 传入 Promise<Blob> 而不是先 await：Chrome 要求写入动作发生在用户手势内
    const item = new ClipboardItemCtor({
      'image/png': fetch(outputUrl.value).then((r) => r.blob()),
    });
    await navigator.clipboard.write([item]);
    message.success(t('tools.remove-background.texts.tag-copied'));
  } catch (e) {
    console.warn('[remove-background] 复制失败', e);
    message.error(t('tools.remove-background.texts.error-copy-failed'));
  }
}
</script>

<template>
  <div>
    <c-file-upload
      :title="t('tools.remove-background.texts.title-drag-and-drop-an-image-or-click-to-select')"
      paste-image
      accept="image/*"
      mb-3
      @file-upload="onUpload"
    />

    <n-form label-placement="left">
      <n-form-item :label="t('tools.remove-background.texts.label-background-mode')">
        <n-select v-model:value="backgroundMode" :options="backgroundOptions" />
      </n-form-item>

      <n-form-item v-if="backgroundMode === 'color'" :label="t('tools.remove-background.texts.label-background-color')">
        <n-color-picker v-model:value="backgroundColor" />
      </n-form-item>

      <n-form-item v-if="backgroundMode === 'pattern'" :label="t('tools.remove-background.texts.label-pattern')">
        <n-select v-model:value="patternName" :options="patternOptions" />
      </n-form-item>

      <n-form-item v-if="backgroundMode === 'blur'" :label="t('tools.remove-background.texts.label-blur')">
        <n-slider v-model:value="blurAmount" :min="0" :max="40" />
      </n-form-item>

      <div v-if="backgroundMode === 'adjust'">
        <n-form-item :label="t('tools.remove-background.texts.label-contrast')">
          <n-slider v-model:value="contrast" :min="0.5" :max="2" :step="0.01" />
        </n-form-item>

        <n-form-item :label="t('tools.remove-background.texts.label-brightness')">
          <n-slider v-model:value="brightness" :min="0.5" :max="2" :step="0.01" />
        </n-form-item>
      </div>
    </n-form>

    <!-- 首次使用提示：模型与运行环境都是本站自己托管，加载一次后走浏览器缓存 -->
    <n-alert v-if="modelPhase === 'idle'" type="info" mb-3>
      {{ t('tools.remove-background.texts.hint-first-load') }}
    </n-alert>

    <div v-if="modelPhase === 'runtime'" mb-3>
      <n-progress type="line" :percentage="100" processing />
      <div class="text-sm opacity-70">
        {{ t('tools.remove-background.texts.hint-loading-runtime') }}
      </div>
    </div>

    <n-progress
      v-else-if="modelPhase === 'model'"
      type="line"
      :percentage="modelPercent"
      indicator-placement="inside"
      mb-3
    />

    <n-space justify="center" mb-1>
      <n-spin :show="loading" mb-1>
        <n-button type="success" :disabled="!inputImage || loading" @click="removeBackground">
          {{ t('tools.remove-background.texts.tag-apply-background') }}
        </n-button>
      </n-spin>
    </n-space>

    <c-alert v-if="error" mb-1>
      {{ error }}
    </c-alert>

    <div v-if="outputUrl && inputUrl">
      <ImageCompareSlider
        :before-src="inputUrl"
        :after-src="outputUrl"
        :before-label="t('tools.remove-background.texts.title-original')"
        :after-label="t('tools.remove-background.texts.title-result')"
        checkerboard
        mb-3
      />

      <n-space justify="center" mb-3>
        <n-button type="success" @click="downloadResult">
          {{ t('tools.remove-background.texts.tag-download-result') }}
        </n-button>
        <n-button @click="copyResult">
          {{ t('tools.remove-background.texts.tag-copy-result') }}
        </n-button>
      </n-space>
    </div>
  </div>
</template>
