<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Ref } from 'vue';
import qrcodeParser from 'qrcode-parser';
import { parseQRData } from './qr-code-decoder.service';
import TextareaCopyable from '@/components/TextareaCopyable.vue';

const { t } = useI18n();

// ---- 解码结果（文件/粘贴/摄像头共用） ----
const decodedRaw = ref<string | null>(null);
const qrCodeParsed = computed(() => {
  try {
    const v = decodedRaw.value;
    if (!v) {
      return '';
    }
    const parsed = parseQRData(v);
    return `Type: ${parsed.type}\nValue:${JSON.stringify(parsed.value, null, 2)}`;
  } catch (e: any) {
    return e.toString();
  }
});

// ---- 文件 / 粘贴上传（原行为保留） ----
const fileInput = ref() as Ref<File>;
const fileLoading = ref(false);
async function onUpload(file: File) {
  if (!file) {
    return;
  }
  fileLoading.value = true;
  try {
    decodedRaw.value = await qrcodeParser(file);
  } catch (e: any) {
    decodedRaw.value = e.toString();
  } finally {
    fileLoading.value = false;
  }
}

// ---- 摄像头实时扫描（浏览器原生 BarcodeDetector，零依赖） ----
type Mode = 'upload' | 'camera';
const mode = ref<Mode>('upload');

const cameraSupported = ref(false);
const cameraActive = ref(false);
const cameraError = ref('');
const videoRef = useTemplateRef<HTMLVideoElement>('videoRef');
const canvasRef = useTemplateRef<HTMLCanvasElement>('canvasRef');
let stream: MediaStream | null = null;
let rafId = 0;

// 最小类型声明，避免引入第三方类型
const BarcodeDetectorCtor: any = (window as any).BarcodeDetector;

async function checkSupport() {
  if (!BarcodeDetectorCtor) {
    cameraSupported.value = false;
    return;
  }
  try {
    const formats: string[] = await BarcodeDetectorCtor.getSupportedFormats();
    cameraSupported.value = formats.includes('qr_code');
  } catch {
    cameraSupported.value = false;
  }
}

async function startCamera() {
  cameraError.value = '';
  if (!cameraSupported.value) {
    cameraError.value = t('tools.qr-code-decoder.texts.camera-unsupported');
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    });
    const video = videoRef.value;
    if (!video) {
      return;
    }
    video.srcObject = stream;
    await video.play();
    cameraActive.value = true;
    scanLoop();
  } catch (e: any) {
    cameraError.value = e?.message || t('tools.qr-code-decoder.texts.camera-denied');
  }
}

function stopCamera() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }
  const video = videoRef.value;
  if (video) {
    video.srcObject = null;
  }
  cameraActive.value = false;
}

async function scanLoop() {
  const video = videoRef.value;
  const canvas = canvasRef.value;
  if (!video || !canvas || !cameraActive.value) {
    return;
  }
  if (video.readyState >= 2 && video.videoWidth > 0) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      try {
        const detector = new BarcodeDetectorCtor({ formats: ['qr_code'] });
        const barcodes = await detector.detect(canvas);
        if (barcodes.length > 0) {
          decodedRaw.value = barcodes[0].rawValue;
          stopCamera();
          return;
        }
      } catch {
        // 单帧失败忽略，继续下一帧
      }
    }
  }
  rafId = requestAnimationFrame(() => scanLoop());
}

function onModeChange(m: Mode) {
  if (m === 'camera') {
    nextTick(() => startCamera());
  } else {
    stopCamera();
  }
}

onMounted(() => {
  checkSupport();
});

onUnmounted(() => {
  stopCamera();
});
</script>

<template>
  <div>
    <n-radio-group
      :value="mode"
      name="mode"
      @update:value="(v: Mode) => { mode = v; onModeChange(v); }"
    >
      <n-radio-button value="upload">{{ t('tools.qr-code-decoder.texts.tab-upload') }}</n-radio-button>
      <n-radio-button value="camera" :disabled="!cameraSupported">{{
        t('tools.qr-code-decoder.texts.tab-camera')
      }}</n-radio-button>
    </n-radio-group>

    <n-p v-if="mode === 'camera' && !cameraSupported" type="warning" mt-3>
      {{ t('tools.qr-code-decoder.texts.camera-unsupported') }}
    </n-p>

    <!-- 上传 / 粘贴 -->
    <div v-if="mode === 'upload'">
      <c-file-upload
        :title="t('tools.qr-code-decoder.texts.title-drag-and-drop-a-qr-code-here-or-click-to-select-a-file')"
        :paste-image="true"
        accept="image/*"
        :loading="fileLoading"
        @file-upload="onUpload"
      />
    </div>

    <!-- 摄像头 -->
    <div v-else>
      <div flex flex-col items-center gap-3 mt-3>
        <video ref="videoRef" playsinline muted style="max-width: 100%; border-radius: 8px; background: #000" />
        <canvas ref="canvasRef" style="display: none" />
        <div flex gap-3>
          <c-button v-if="!cameraActive" @click="startCamera">
            {{ t('tools.qr-code-decoder.texts.camera-start') }}
          </c-button>
          <c-button v-else @click="stopCamera">
            {{ t('tools.qr-code-decoder.texts.camera-stop') }}
          </c-button>
        </div>
        <n-p v-if="cameraError" type="error">{{ cameraError }}</n-p>
        <n-p v-if="cameraActive" depth="3">{{ t('tools.qr-code-decoder.texts.camera-hint') }}</n-p>
      </div>
    </div>

    <n-divider />

    <div v-if="decodedRaw">
      <h3>{{ t('tools.qr-code-decoder.texts.tag-decoded') }}</h3>
      <TextareaCopyable :value="decodedRaw" :word-wrap="true" />
    </div>
    <div v-if="qrCodeParsed">
      <h3>{{ t('tools.qr-code-decoder.texts.tag-parsed') }}</h3>
      <TextareaCopyable :value="qrCodeParsed" :word-wrap="true" />
    </div>
  </div>
</template>

<style lang="less" scoped>
::v-deep(.n-upload-trigger) {
  width: 100%;
}
</style>
