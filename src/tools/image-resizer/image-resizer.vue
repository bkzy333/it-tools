<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { computed, ref, watch } from 'vue';
import {
  NAlert,
  NCheckbox,
  NModal,
  NRadioButton,
  NRadioGroup,
  NSlider,
} from 'naive-ui';
import { IconLock, IconLockOpen2, IconReload } from '@tabler/icons-vue';
import JSZip from 'jszip';
import { compressImage, type CompressResult } from './image-compress.service';
import {
  hasAlphaChannel,
  processBatch,
  type OutputFormat,
  type ProcessOptions,
  type ProcessResult,
} from './image-compress.service';
import {
  centerCropRect,
  encodeImage,
  formatExt,
  FORMAT_LABELS,
  SUPPORTED_FORMATS,
  type CropRect,
} from './image-encode.service';
import ImageCropSelector from '@/components/ImageCropSelector.vue';
import ProgressBar from '@/components/ProgressBar.vue';

const { t } = useI18n();

// State variables
const imageFile = ref<File | null>(null);
const imageUrl = ref<string | null>(null);
const originalImageUrl = ref<string | null>(null); // To store original image data
const imageWidth = ref(1920); // Default width
const imageHeight = ref(1080); // Default height
const originalImageWidth = ref<number | null>(null); // Store original image width
const originalImageHeight = ref<number | null>(null); // Store original image height
const resizedImageUrl = ref<string | null>(null);
const aspectRatioLocked = ref(false);
const aspectRatio = ref<number | null>(null);
const isUpdatingDimensions = ref(false);
const selectedAspectRatio = ref<string>('custom');
const customAspectRatioWidth = ref<number>(16);
const customAspectRatioHeight = ref<number>(9);
const aspectRatioPriority = ref<'width' | 'height'>('width');

// Predefined aspect ratios
const aspectRatioOptions = [
  { label: t('tools.image-resizer.texts.label-custom'), value: 'custom' },
  { label: t('tools.image-resizer.texts.label-original'), value: 'original' },
  { label: t('tools.image-resizer.texts.label-21-9-ultrawide'), value: '21:9' },
  { label: t('tools.image-resizer.texts.label-16-9-widescreen'), value: '16:9' },
  { label: t('tools.image-resizer.texts.label-4-3-standard'), value: '4:3' },
  { label: t('tools.image-resizer.texts.label-3-2-photography'), value: '3:2' },
  { label: t('tools.image-resizer.texts.label-1-1-square'), value: '1:1' },
  { label: t('tools.image-resizer.texts.label-3-4-portrait'), value: '3:4' },
  { label: t('tools.image-resizer.texts.label-9-16-portrait'), value: '9:16' },
];

// 场景预设（社交平台封面尺寸）
const scenePresets = [
  { label: t('tools.image-resizer.texts.preset-custom'), value: 'custom', w: 0, h: 0 },
  { label: t('tools.image-resizer.texts.preset-wechat'), value: 'wechat', w: 900, h: 383 },
  { label: t('tools.image-resizer.texts.preset-xhs'), value: 'xhs', w: 1000, h: 1333 },
  { label: t('tools.image-resizer.texts.preset-ppt'), value: 'ppt', w: 1920, h: 1080 },
  { label: t('tools.image-resizer.texts.preset-ig'), value: 'ig', w: 1080, h: 1080 },
];
const selectedScenePreset = ref<string>('custom');

function applyScenePreset(value: string) {
  selectedScenePreset.value = value;
  if (value === 'custom') {
    return;
  }
  const preset = scenePresets.find((p) => p.value === value);
  if (!preset) {
    return;
  }
  imageWidth.value = preset.w;
  imageHeight.value = preset.h;
  // 锁定比例，避免后续手改宽高时错位
  if (!aspectRatioLocked.value) {
    toggleAspectRatioLock();
  }
}

const MAX_CANVAS_DIMENSION = 32767; // Maximum pixels per side
const MAX_CANVAS_AREA = 268435456; // Maximum total pixels (conservative estimate)

const isCanvasTooLarge = computed(() => {
  return (
    imageWidth.value > MAX_CANVAS_DIMENSION ||
    imageHeight.value > MAX_CANVAS_DIMENSION ||
    imageWidth.value * imageHeight.value > MAX_CANVAS_AREA
  );
});

const isPreviewTooLarge = computed(() => {
  return imageWidth.value > 7680 || imageHeight.value > 7680;
});

// Computed property to check if dimensions are valid for download
const canDownload = computed(() => {
  return (
    (resizedImageUrl.value || (originalImageUrl.value && isPreviewTooLarge.value)) &&
    imageFile.value &&
    imageWidth.value > 0 &&
    imageHeight.value > 0 &&
    !isCanvasTooLarge.value
  );
});

// Computed property to check if reset is available
const canReset = computed(() => {
  return originalImageWidth.value !== null && originalImageHeight.value !== null;
});

// Helper function to calculate Greatest Common Divisor
function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

// Computed property to display aspect ratio
const displayedAspectRatio = computed(() => {
  if (!imageWidth.value || !imageHeight.value || imageWidth.value <= 0 || imageHeight.value <= 0) {
    return '';
  }

  const currentRatio = imageWidth.value / imageHeight.value;
  const tolerance = 0.01; // Allow 1% tolerance for matching standard ratios

  // Standard aspect ratios to check against
  const standardRatios = [
    { ratio: 21 / 9, display: '21:9' },
    { ratio: 16 / 9, display: '16:9' },
    { ratio: 4 / 3, display: '4:3' },
    { ratio: 3 / 2, display: '3:2' },
    { ratio: 1 / 1, display: '1:1' },
    { ratio: 3 / 4, display: '3:4' },
    { ratio: 2 / 3, display: '2:3' },
    { ratio: 9 / 16, display: '9:16' },
  ];

  // Check if current ratio matches any standard ratio within tolerance
  for (const standard of standardRatios) {
    if (Math.abs(currentRatio - standard.ratio) <= tolerance) {
      return standard.display;
    }
  }

  // If no standard ratio matches, calculate simplified ratio using GCD
  const width = Math.round(imageWidth.value);
  const height = Math.round(imageHeight.value);
  const divisor = gcd(width, height);
  const simplifiedWidth = width / divisor;
  const simplifiedHeight = height / divisor;

  return `${simplifiedWidth}:${simplifiedHeight}`;
});

// Function to get aspect ratio value from selection
function getAspectRatioValue(ratioString: string): number | null {
  switch (ratioString) {
    case 'original':
      return originalImageWidth.value && originalImageHeight.value
        ? originalImageWidth.value / originalImageHeight.value
        : null;
    case '16:9':
      return 16 / 9;
    case '4:3':
      return 4 / 3;
    case '1:1':
      return 1;
    case '3:2':
      return 3 / 2;
    case '21:9':
      return 21 / 9;
    case '9:16':
      return 9 / 16;
    case '3:4':
      return 3 / 4;
    case 'custom':
      return customAspectRatioWidth.value && customAspectRatioHeight.value
        ? customAspectRatioWidth.value / customAspectRatioHeight.value
        : null;
    default:
      return null;
  }
}

// Watch for aspect ratio selection changes
watch(selectedAspectRatio, (newRatio) => {
  const newAspectRatioValue = getAspectRatioValue(newRatio);
  if (newAspectRatioValue) {
    aspectRatio.value = newAspectRatioValue;
    if (!aspectRatioLocked.value) {
      aspectRatioLocked.value = true;
    }
    imageHeight.value = Math.round(imageWidth.value / newAspectRatioValue);
  }
});

// Watch for custom aspect ratio changes
watch([customAspectRatioWidth, customAspectRatioHeight], () => {
  if (selectedAspectRatio.value === 'custom' && aspectRatioLocked.value) {
    const newAspectRatioValue = getAspectRatioValue('custom');
    if (newAspectRatioValue) {
      aspectRatio.value = newAspectRatioValue;
      imageHeight.value = Math.round(imageWidth.value / newAspectRatioValue);
    }
  }
});

function toggleAspectRatioLock() {
  aspectRatioLocked.value = !aspectRatioLocked.value;

  if (aspectRatioLocked.value) {
    if (selectedAspectRatio.value !== 'custom') {
      aspectRatio.value = getAspectRatioValue(selectedAspectRatio.value);
    } else if (imageWidth.value && imageHeight.value && imageWidth.value > 0 && imageHeight.value > 0) {
      aspectRatio.value = imageWidth.value / imageHeight.value;
      const divisor = gcd(Math.round(imageWidth.value), Math.round(imageHeight.value));
      customAspectRatioWidth.value = Math.round(imageWidth.value) / divisor;
      customAspectRatioHeight.value = Math.round(imageHeight.value) / divisor;
    } else {
      // Don't lock if dimensions are invalid
      aspectRatioLocked.value = false;
    }
  } else {
    aspectRatio.value = null;
  }
}

function getLockStateIcon() {
  return aspectRatioLocked.value ? IconLock : IconLockOpen2;
}

// Function to apply selected aspect ratio
function applyAspectRatio() {
  const newAspectRatioValue = getAspectRatioValue(selectedAspectRatio.value);
  if (newAspectRatioValue) {
    aspectRatio.value = newAspectRatioValue;
    if (!aspectRatioLocked.value) {
      aspectRatioLocked.value = true;
    }
    imageHeight.value = Math.round(imageWidth.value / newAspectRatioValue);
  }
}

// Function to reset dimensions to original values
function resetToOriginal() {
  if (originalImageWidth.value && originalImageHeight.value) {
    // Temporarily turn off aspect ratio lock to prevent issues during reset
    if (aspectRatioLocked.value) {
      toggleAspectRatioLock();
    }

    imageWidth.value = originalImageWidth.value;
    imageHeight.value = originalImageHeight.value;

    // Update custom aspect ratio to match original image
    const divisor = gcd(originalImageWidth.value, originalImageHeight.value);
    customAspectRatioWidth.value = originalImageWidth.value / divisor;
    customAspectRatioHeight.value = originalImageHeight.value / divisor;
  }
}

function onWidthFocus() {
  aspectRatioPriority.value = 'width';
}

function onHeightFocus() {
  aspectRatioPriority.value = 'height';
}

watch(imageWidth, () => {
  if (aspectRatioLocked.value && aspectRatio.value && !isUpdatingDimensions.value && imageWidth.value > 0) {
    if (aspectRatioPriority.value === 'width') {
      isUpdatingDimensions.value = true;
      const newHeight = Math.round(imageWidth.value / aspectRatio.value);
      if (newHeight > 0) {
        imageHeight.value = newHeight;
      }
      isUpdatingDimensions.value = false;
    }
  }

  // Only resize if not too large for preview
  if (!isPreviewTooLarge.value) {
    resizeImage();
  }
});

watch(imageHeight, () => {
  if (aspectRatioLocked.value && aspectRatio.value && !isUpdatingDimensions.value && imageHeight.value > 0) {
    if (aspectRatioPriority.value === 'height') {
      isUpdatingDimensions.value = true;
      const newWidth = Math.round(imageHeight.value * aspectRatio.value);
      if (newWidth > 0) {
        imageWidth.value = newWidth;
      }
      isUpdatingDimensions.value = false;
    }
  }

  // Only resize if not too large for preview
  if (!isPreviewTooLarge.value) {
    resizeImage();
  }
});

// 原图是否含透明通道（用于透明→JPG 提示）
const originalHasAlpha = ref(false);

// 上传 / 处理进度条（复用 ProgressBar 组件）
const progressVisible = ref(false);
const progressPercent = ref(-1);
const progressText = ref('');

// ---- 单图模式：输出格式 / 质量 / 白底 ----
const singleQuality = ref(0.9);
const singleFillWhite = ref(true);
// 单图下载支持的全部格式（含 BMP/ICO/SVG）
const formatOptionsAll = SUPPORTED_FORMATS.map((f) => ({ label: FORMAT_LABELS[f], value: f }));
// JPG 必填白；BMP/ICO/SVG 无 alpha 通道，透明源需在勾选时填白，避免变黑
function shouldFill(format: OutputFormat): boolean {
  return format === 'jpeg' || (singleFillWhite.value && (format === 'bmp' || format === 'ico' || format === 'svg'));
}

// Handle file upload
async function handleFileUpload(uploadedFile: File) {
  if (!uploadedFile) {
    return;
  }

  imageFile.value = uploadedFile;
  progressVisible.value = true;
  progressPercent.value = -1;
  progressText.value = t('tools.image-resizer.texts.progress-reading');

  try {
    // Read the file as a Data URL
    const reader = new FileReader();
    const fileDataUrl = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(uploadedFile);
    });

    imageUrl.value = fileDataUrl; // Preview image
    originalImageUrl.value = fileDataUrl; // Store original image for resizing
    resizedImageUrl.value = null; // Clear previous resized image

    // Create an image to get original dimensions
    const img = new Image();
    img.src = fileDataUrl;

    await new Promise<void>((resolve) => {
      img.onload = () => {
        // Set original image dimensions
        originalImageWidth.value = img.naturalWidth;
        originalImageHeight.value = img.naturalHeight;

        // Temporarily turn off the aspect ratio lock to prevent issues during setting the new values if it is turned on
        let restoreAspectRatioLock = false;
        if (aspectRatioLocked.value) {
          restoreAspectRatioLock = true;
          toggleAspectRatioLock();
        }

        // Load the current image dimensions into the width and height inputs
        imageWidth.value = img.naturalWidth;
        imageHeight.value = img.naturalHeight;

        // Update custom aspect ratio to match original image
        const divisor = gcd(img.naturalWidth, img.naturalHeight);
        customAspectRatioWidth.value = img.naturalWidth / divisor;
        customAspectRatioHeight.value = img.naturalHeight / divisor;

        // Restore the aspect ratio lock if it was on before
        if (restoreAspectRatioLock) {
          toggleAspectRatioLock();
        }

        // Automatically resize if width and height are set
        if (imageWidth.value > 0 && imageHeight.value > 0) {
          resizeImage();
        }

        resolve();
      };
    });

    // 检测透明通道
    originalHasAlpha.value = await hasAlphaChannel(uploadedFile);
  } catch (error) {
    console.error('Error reading file:', error);
  } finally {
    progressVisible.value = false;
  }
}

async function resizeImage() {
  if (!originalImageUrl.value) {
    return; // Ensure there's an original image to work with
  }

  // Check if canvas would exceed browser limits
  if (isCanvasTooLarge.value) {
    resizedImageUrl.value = null; // Clear preview
    return;
  }

  const img = new Image();
  img.src = originalImageUrl.value; // Use the original image for resizing

  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = imageWidth.value;
    canvas.height = imageHeight.value;

    const ctx = canvas.getContext('2d');
    ctx?.drawImage(img, 0, 0, imageWidth.value, imageHeight.value);
    resizedImageUrl.value = canvas.toDataURL('image/png');
  };
}

// Function to download resized image with validation and correct format conversion
async function downloadImage(format: OutputFormat) {
  if (!imageFile.value || !originalImageUrl.value) {
    console.warn('No image available for download');
    return;
  }

  // Check for invalid dimensions
  if (imageWidth.value <= 0 || imageHeight.value <= 0) {
    console.warn('Invalid dimensions: Width and height must be greater than 0');
    return;
  }

  // Check for canvas size limits
  if (isCanvasTooLarge.value) {
    console.warn('Canvas size exceeds browser limits');
    return;
  }

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = imageWidth.value;
    canvas.height = imageHeight.value;
    const ctx = canvas.getContext('2d');
    if (shouldFill(format)) {
      ctx!.fillStyle = '#ffffff';
      ctx!.fillRect(0, 0, imageWidth.value, imageHeight.value);
    }
    ctx?.drawImage(img, 0, 0, imageWidth.value, imageHeight.value);

    encodeImage(canvas, format, singleQuality.value)
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const originalFilename = imageFile.value!.name.replace(/\.[^/.]+$/, '');
        const ext = formatExt(format);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${originalFilename}-${imageWidth.value}x${imageHeight.value}.${ext}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      })
      .catch((e) => console.error('encode failed', e));
  };
  img.src = originalImageUrl.value;
}

// ---- 压缩到目标大小（参考 tinyimg） ----
const compressFile = ref<File | null>(null);
const compressTargetKb = ref(300);
const compressMaxDim = ref(0);
const compressFormat = ref<'jpeg' | 'webp'>('jpeg');
const compressStatus = ref<'idle' | 'processing' | 'done' | 'error'>('idle');
const compressResult = ref<CompressResult | null>(null);
const compressError = ref('');

async function handleCompressFile(uploadedFile: File) {
  compressFile.value = uploadedFile;
  compressResult.value = null;
  compressStatus.value = 'processing';
  compressError.value = '';
  progressVisible.value = true;
  progressPercent.value = -1;
  progressText.value = t('tools.image-resizer.texts.progress-compressing');
  try {
    const result = await compressImage(uploadedFile, {
      targetKb: compressTargetKb.value,
      maxDimension: compressMaxDim.value,
      format: compressFormat.value,
    });
    compressResult.value = result;
    compressStatus.value = 'done';
  } catch (e: any) {
    compressError.value = e.toString();
    compressStatus.value = 'error';
  } finally {
    progressVisible.value = false;
  }
}

function downloadCompressed() {
  if (!compressResult.value || !compressFile.value) {
    return;
  }
  const url = URL.createObjectURL(compressResult.value.blob);
  const originalFilename = compressFile.value.name.replace(/\.[^/.]+$/, '');
  const ext = compressFormat.value === 'jpeg' ? 'jpg' : 'webp';
  const link = document.createElement('a');
  link.href = url;
  link.download = `${originalFilename}-compressed.${ext}`;
  link.click();
  URL.revokeObjectURL(url);
}

// ===================== 批量处理 =====================
interface BatchItem {
  id: string;
  file: File;
  baseName: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  originalSizeKb: number;
  originalWidth: number;
  originalHeight: number;
  originalUrl: string;
  resultBlob: Blob | null;
  resultUrl: string | null;
  resultWidth: number;
  resultHeight: number;
  resultSizeKb: number;
  format: OutputFormat;
  savedPercent: number;
  error: string;
  comparePos: number;
  /** 单独裁剪覆盖框（归一化）；存在时优先于批量裁剪设置 */
  cropOverride?: CropRect | null;
}

const batchQueue = ref<BatchItem[]>([]);
const batchProcessing = ref(false);
const batchMode = ref<'resize' | 'compress'>('resize');
const batchFormat = ref<OutputFormat>('jpeg');
const batchScalePercent = ref<number>(100);
const batchWidth = ref<number>(1920);
const batchHeight = ref<number>(1080);
const batchKeepRatio = ref<boolean>(true);
const batchQuality = ref<number>(0.9);
const batchFillWhite = ref<boolean>(true);
const batchTargetKb = ref<number>(300);
const batchMaxDim = ref<number>(0);
const batchHasTransparent = ref<boolean>(false);
const batchScenePreset = ref<string>('custom');

const formatOptions = SUPPORTED_FORMATS.map((f) => ({ label: FORMAT_LABELS[f], value: f }));

// ===================== 批量裁剪 =====================
// none = 不裁剪；preset = 按预设尺寸居中裁；custom = 自定义裁剪（每张图独立区域，可「应用到全部」）
const batchCropType = ref<'none' | 'preset' | 'custom'>('none');
// 自定义裁剪：当前正在编辑的图片 id（null = 未在编辑，蓝框/遮罩隐藏）
const editingId = ref<string | null>(null);
// 当前编辑中的临时裁剪框（未确认）
const editingRect = ref<CropRect>({ x: 0, y: 0, w: 1, h: 1 });
const editingItem = computed(() => batchQueue.value.find((i) => i.id === editingId.value) ?? null);
// 已划定裁剪区域的图片数
const croppedCount = computed(() => batchQueue.value.filter((i) => i.cropOverride).length);

// 切换裁剪方式
function onCropTypeChange(value: 'none' | 'preset' | 'custom') {
  batchCropType.value = value;
  if (value === 'custom') {
    // 进入自定义裁剪：默认编辑第一张
    const first = batchQueue.value[0];
    if (first) {
      editingId.value = first.id;
      editingRect.value = first.cropOverride ? { ...first.cropOverride } : { x: 0, y: 0, w: 1, h: 1 };
    } else {
      editingId.value = null;
    }
  } else {
    editingId.value = null;
  }
}

// 裁剪区选预设：切到「按预设居中裁剪」模式（复用原 resize 预设设置）
function onCropPresetChange(value: string) {
  batchCropType.value = 'preset';
  editingId.value = null;
  applyBatchScenePreset(value);
}

// 点缩略图切换编辑该图
function editItem(item: BatchItem) {
  editingId.value = item.id;
  editingRect.value = item.cropOverride ? { ...item.cropOverride } : { x: 0, y: 0, w: 1, h: 1 };
}

// 确认：保存当前编辑图的裁剪区域，退出编辑（蓝框/遮罩消失）
function confirmCrop() {
  const item = batchQueue.value.find((i) => i.id === editingId.value);
  if (item) {
    item.cropOverride = { ...editingRect.value };
  }
  editingId.value = null;
}

// 应用到全部：当前区域复制到所有图片
function applyCropToAll() {
  for (const item of batchQueue.value) {
    item.cropOverride = { ...editingRect.value };
  }
  editingId.value = null;
}

// 取消：撤销当前这张图的裁剪（恢复整图），退出编辑
function cancelCrop() {
  const item = batchQueue.value.find((i) => i.id === editingId.value);
  if (item) {
    item.cropOverride = null;
  }
  editingId.value = null;
}

/**
 * 批量选项解析（模块级，供 startBatch 与单独裁剪重处理共用）。
 * 裁剪框优先级：单独裁剪覆盖 > 批量预设居中裁 > 批量统一区域裁。
 */
function getOpts(item: BatchItem): ProcessOptions {
  let crop: CropRect | undefined;
  if (item.cropOverride) {
    crop = item.cropOverride;
  } else if (batchCropType.value === 'preset') {
    const preset = scenePresets.find((p) => p.value === batchScenePreset.value);
    if (preset && preset.w) {
      crop = centerCropRect(item.originalWidth, item.originalHeight, preset.w, preset.h);
    }
  }

  const base: Omit<ProcessOptions, 'mode'> = {
    format: batchFormat.value,
    quality: batchQuality.value,
    fillWhite: batchFillWhite.value,
    targetKb: batchTargetKb.value,
    maxDimension: batchMaxDim.value,
  };

  if (crop) {
    if (batchMode.value === 'compress') {
      return { ...base, mode: 'compress', crop };
    }
    const hasSize = batchMode.value === 'resize' && batchWidth.value > 0 && batchHeight.value > 0;
    return hasSize
      ? { ...base, mode: 'resize', crop, width: batchWidth.value, height: batchHeight.value }
      : { ...base, mode: 'resize', crop };
  }

  if (batchMode.value === 'resize') {
    if (batchKeepRatio.value) {
      const w = batchWidth.value || item.originalWidth || 1;
      const pct = w > 0 && item.originalWidth ? (w / item.originalWidth) * 100 : batchScalePercent.value;
      return { ...base, mode: 'resize', scalePercent: pct };
    }
    return { ...base, mode: 'resize', width: batchWidth.value, height: batchHeight.value };
  }
  return { ...base, mode: 'compress' };
}

const batchDoneCount = computed(() => batchQueue.value.filter((i) => i.status === 'done').length);
const batchErrorCount = computed(() => batchQueue.value.filter((i) => i.status === 'error').length);

const showTransparentWarning = computed(
  () => batchHasTransparent.value && batchFormat.value === 'jpeg',
);

function readDimensions(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({ w: 0, h: 0 });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

async function onBatchUpload(files: File[]) {
  if (!files.length) {
    return;
  }
  // 释放旧队列的预览 URL
  batchQueue.value.forEach((item) => {
    if (item.originalUrl) {
      URL.revokeObjectURL(item.originalUrl);
    }
    if (item.resultUrl) {
      URL.revokeObjectURL(item.resultUrl);
    }
  });

  progressVisible.value = true;
  progressPercent.value = 0;
  progressText.value = t('tools.image-resizer.texts.progress-reading-batch', { done: 0, total: files.length });

  const items: BatchItem[] = [];
  let anyAlpha = false;
  try {
    for (const file of files) {
      const { w, h } = await readDimensions(file);
      const isAlpha = await hasAlphaChannel(file);
      if (isAlpha) {
        anyAlpha = true;
      }
      items.push({
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        baseName: file.name.replace(/\.[^/.]+$/, ''),
        status: 'pending',
        originalSizeKb: file.size / 1024,
        originalWidth: w,
        originalHeight: h,
        originalUrl: URL.createObjectURL(file),
        resultBlob: null,
        resultUrl: null,
        resultWidth: 0,
        resultHeight: 0,
        resultSizeKb: 0,
        format: batchFormat.value,
        savedPercent: 0,
        error: '',
        comparePos: 50,
      });
      progressPercent.value = (items.length / files.length) * 100;
      progressText.value = t('tools.image-resizer.texts.progress-reading-batch', {
        done: items.length,
        total: files.length,
      });
    }
  } finally {
    progressVisible.value = false;
  }
  batchHasTransparent.value = anyAlpha;
  batchQueue.value = items;
}

function applyBatchScenePreset(value: string) {
  batchScenePreset.value = value;
  if (value === 'custom') {
    return;
  }
  const preset = scenePresets.find((p) => p.value === value);
  if (!preset) {
    return;
  }
  batchWidth.value = preset.w;
  batchHeight.value = preset.h;
  batchMode.value = 'resize';
  batchKeepRatio.value = true;
}

async function startBatch() {
  if (!batchQueue.value.length || batchProcessing.value) {
    return;
  }
  batchProcessing.value = true;
  // 重置状态
  batchQueue.value.forEach((item) => {
    item.status = 'pending';
    item.resultBlob = null;
    item.resultUrl = null;
    item.error = '';
    item.savedPercent = 0;
  });

  progressVisible.value = true;
  progressPercent.value = 0;
  progressText.value = t('tools.image-resizer.texts.progress-processing-batch', {
    done: 0,
    total: batchQueue.value.length,
  });

  const files = batchQueue.value.map((i) => i.file);
  const total = files.length;
  let doneCount = 0;
  await processBatch(
    files,
    (file: File, index: number) => getOpts(batchQueue.value[index]),
    (index: number, result: ProcessResult | null, error: string | null) => {
      doneCount++;
      progressPercent.value = (doneCount / total) * 100;
      progressText.value = t('tools.image-resizer.texts.progress-processing-batch', { done: doneCount, total });
      const item = batchQueue.value[index];
      if (result) {
        item.status = 'done';
        item.resultBlob = result.blob;
        item.resultUrl = URL.createObjectURL(result.blob);
        item.resultWidth = result.width;
        item.resultHeight = result.height;
        item.resultSizeKb = result.sizeKb;
        item.format = result.format;
        item.savedPercent =
          item.originalSizeKb > 0
            ? Math.max(0, Math.round((1 - result.sizeKb / item.originalSizeKb) * 100))
            : 0;
      } else {
        item.status = 'error';
        item.error = error ?? t('tools.image-resizer.texts.text-failed');
      }
    },
    3,
  );
  batchProcessing.value = false;
  progressVisible.value = false;
}

function downloadOne(item: BatchItem) {
  if (!item.resultBlob) {
    return;
  }
  const ext = item.format === 'jpeg' ? 'jpg' : item.format;
  const url = URL.createObjectURL(item.resultBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${item.baseName}-${item.resultWidth}x${item.resultHeight}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function downloadAllZip() {
  const ready = batchQueue.value.filter((i) => i.status === 'done' && i.resultBlob);
  if (!ready.length) {
    return;
  }
  const zip = new JSZip();
  for (const item of ready) {
    const ext = item.format === 'jpeg' ? 'jpg' : item.format;
    zip.file(`${item.baseName}-${item.resultWidth}x${item.resultHeight}.${ext}`, item.resultBlob!);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '图片批量处理结果.zip';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function formatSize(kb: number): string {
  if (kb >= 1024) {
    return `${(kb / 1024).toFixed(2)} MB`;
  }
  return `${kb.toFixed(1)} KB`;
}
</script>

<template>
  <n-card>
    <div>
      <ProgressBar :visible="progressVisible" :percent="progressPercent" :text="progressText" />

      <!-- File input -->
      <c-file-upload
        mb-2
        accept="image/*"
        :title="t('tools.image-resizer.texts.title-drag-and-drop-an-image-file-here')"
        @file-upload="handleFileUpload"
      />

      <!-- Original image dimensions -->
      <div v-if="originalImageWidth && originalImageHeight" display="flex" direction="row" style="align-items: center">
        <p style="margin: 0; margin-right: 10px">
          Original Image Dimensions: {{ originalImageWidth }}x{{ originalImageHeight }}px
        </p>
        <n-button
          v-if="canReset"
          type="tertiary"
          :title="t('tools.image-resizer.texts.title-reset-to-original-dimensions')"
          mt-1
          @click="resetToOriginal"
        >
          <n-icon :component="IconReload" size="16" style="margin-right: 5px" />{{
            t('tools.image-resizer.texts.tag-reset-width-and-height-to-image-dimensions')
          }}
        </n-button>
      </div>

      <!-- 场景预设 -->
      <div mt-3 mb-2>
        <n-space align="center" :wrap="false">
          <span style="font-size: 13px; font-weight: 500">{{ t('tools.image-resizer.texts.label-scene-preset') }}：</span>
          <n-select
            v-model:value="selectedScenePreset"
            :options="scenePresets"
            size="small"
            style="width: 240px"
            @update:value="applyScenePreset"
          />
        </n-space>
      </div>

      <!-- Compact Width/Height and Aspect Ratio Controls -->
      <div class="compact-controls" style="margin-bottom: 20px; margin-top: 20px">
        <!-- Left side: Width and Height inputs -->
        <div class="dimensions-section">
          <h4>{{ t('tools.image-resizer.texts.tag-dimensions') }}</h4>
          <div class="input-group">
            <label for="widthInput">{{ t('tools.image-resizer.texts.tag-width-px') }}</label>
            <n-input-number
              id="widthInput"
              v-model:value="imageWidth"
              :placeholder="t('tools.image-resizer.texts.placeholder-width-px')"
              :min="1"
              :max="MAX_CANVAS_DIMENSION"
              @focus="onWidthFocus"
            />
          </div>
          <div class="input-group">
            <label for="heightInput">{{ t('tools.image-resizer.texts.tag-height-px') }}</label>
            <n-input-number
              id="heightInput"
              v-model:value="imageHeight"
              :placeholder="t('tools.image-resizer.texts.placeholder-height-px')"
              :min="1"
              :max="MAX_CANVAS_DIMENSION"
              @focus="onHeightFocus"
            />
          </div>

          <!-- Validation warnings -->
          <div v-if="imageWidth <= 0 || imageHeight <= 0" class="validation-warning">
            <p style="color: red; font-size: 12px; margin: 5px 0 0 0">
              {{ t('tools.image-resizer.texts.tag-️-width-and-height-must-be-greater-than-0') }}
            </p>
          </div>
          <div v-else-if="isCanvasTooLarge" class="validation-warning">
            <p style="color: red; font-size: 12px; margin: 5px 0 0 0">
              ⚠️ Canvas size exceeds browser limits (max: {{ MAX_CANVAS_DIMENSION.toLocaleString() }}px per side, max
              area: {{ Math.floor(MAX_CANVAS_AREA / 1000000) }}M pixels)
            </p>
          </div>
        </div>

        <!-- Middle: Current aspect ratio display, lock, and priority -->
        <div class="aspect-ratio-middle">
          <h4>{{ t('tools.image-resizer.texts.tag-aspect-ratio') }}</h4>

          <!-- Current aspect ratio display -->
          <div v-if="displayedAspectRatio" class="current-ratio-display">
            {{ displayedAspectRatio }}
          </div>

          <!-- Lock icon -->
          <div
            class="lock-icon flex cursor-pointer items-center justify-center rounded text-gray-500 transition-colors hover:text-blue-600"
            :title="t('tools.image-resizer.texts.title-lock-unlock-aspect-ratio')"
            @click="toggleAspectRatioLock()"
          >
            <n-icon :component="getLockStateIcon()" size="26" />
          </div>
        </div>

        <!-- Right side: Aspect Ratio presets only -->
        <div class="aspect-ratio-section-compact">
          <h4>{{ t('tools.image-resizer.texts.tag-aspect-ratio-presets') }}</h4>

          <!-- Aspect ratio selector -->
          <div class="aspect-ratio-selector-compact">
            <n-select
              id="aspectRatioSelect"
              v-model:value="selectedAspectRatio"
              :options="aspectRatioOptions"
              :placeholder="t('tools.image-resizer.texts.placeholder-choose-ratio')"
              size="small"
              style="width: 160px"
            />
            <n-button type="primary" size="small" @click="applyAspectRatio">
              {{ t('tools.image-resizer.texts.tag-apply') }}
            </n-button>
          </div>

          <!-- Custom aspect ratio inputs -->
          <div v-if="selectedAspectRatio === 'custom'" class="custom-ratio-inputs-compact">
            <div class="custom-ratio-group-compact">
              <n-input-number
                v-model:value="customAspectRatioWidth"
                :placeholder="t('tools.image-resizer.texts.placeholder-w')"
                :min="1"
                size="small"
                style="width: 100px"
              />
              <span>{{ t('tools.image-resizer.texts.tag-') }}</span>
              <n-input-number
                v-model:value="customAspectRatioHeight"
                :placeholder="t('tools.image-resizer.texts.placeholder-h')"
                :min="1"
                size="small"
                style="width: 100px"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Image preview and download section -->
      <div v-if="originalImageUrl" class="image-container" style="text-align: center; margin-top: 20px">
        <!-- Show preview when dimensions are within limits -->
        <div v-if="resizedImageUrl && !isPreviewTooLarge" class="image-wrapper">
          <img
            :src="resizedImageUrl"
            :alt="`Resized Preview (${imageWidth}px x ${imageHeight}px)`"
            :style="{ width: `${imageWidth}px`, height: `${imageHeight}px` }"
          />
          <p>Preview: {{ imageWidth }}x{{ imageHeight }}px</p>
        </div>

        <!-- Show message when preview is too large -->
        <div v-if="isPreviewTooLarge" class="preview-too-large">
          <p style="color: #666; font-style: italic; margin: 20px 0">
            ⚠️ Preview not shown - dimensions too large ({{ imageWidth }}x{{ imageHeight }}px) <br />{{
              t(
                'tools.image-resizer.texts.tag-preview-is-disabled-when-width-or-height-exceeds-7-680-pixels-for-performance-reasons',
              )
            }}
          </p>
        </div>

        <!-- 透明背景提示 -->
        <n-alert
          v-if="originalHasAlpha && (canDownload)"
          type="warning"
          :show-icon="true"
          style="margin: 10px 0; text-align: left"
        >
          {{ t('tools.image-resizer.texts.warn-transparent') }}
        </n-alert>

        <!-- Download options (always show when image is loaded) -->
        <div v-if="originalImageUrl">
          <h3>{{ t('tools.image-resizer.texts.tag-download-options') }}</h3>
          <n-space align="center" :wrap="false" mb-2>
            <span style="font-size: 13px; font-weight: 500; min-width: 70px">{{ t('tools.image-resizer.texts.label-quality') }}：</span>
            <n-slider v-model:value="singleQuality" :min="0.1" :max="1" :step="0.05" style="width: 200px" />
            <span style="color: #666; font-size: 12px">{{ Math.round(singleQuality * 100) }}%</span>
            <n-checkbox v-model:checked="singleFillWhite" style="margin-left: 12px">
              {{ t('tools.image-resizer.texts.label-fill-white-single') }}
            </n-checkbox>
          </n-space>
          <div class="download-grid">
            <n-button
              v-for="opt in formatOptionsAll"
              :key="opt.value"
              :disabled="!canDownload"
              @click.prevent="downloadImage(opt.value)"
            >
              {{ t('tools.image-resizer.texts.tag-download-format', { fmt: opt.label }) }}
            </n-button>
          </div>
        </div>
      </div>
    </div>
  </n-card>

  <n-card mt-3>
    <h3 style="margin: 0 0 12px">{{ t('tools.image-resizer.texts.tag-compress-to-target-size') }}</h3>

    <c-file-upload
      mb-2
      accept="image/*"
      :title="t('tools.image-resizer.texts.title-drag-and-drop-image-to-compress')"
      @file-upload="handleCompressFile"
    />

    <n-space mb-3 align="end">
      <n-form-item :label="t('tools.image-resizer.texts.tag-target-size-kb')" label-placement="left">
        <n-input-number v-model:value="compressTargetKb" :min="1" :max="100000" />
      </n-form-item>
      <n-form-item :label="t('tools.image-resizer.texts.tag-max-dimension-px')" label-placement="left">
        <n-input-number v-model:value="compressMaxDim" :min="0" :max="32767" />
      </n-form-item>
      <n-form-item :label="t('tools.image-resizer.texts.tag-output-format')" label-placement="left">
        <n-select v-model:value="compressFormat" :options="[{ label: 'JPEG', value: 'jpeg' }, { label: 'WebP', value: 'webp' }]" style="width: 120px" />
      </n-form-item>
    </n-space>

    <n-spin v-if="compressStatus === 'processing'" size="small" />
    <div v-if="compressStatus === 'error'" style="color: red; margin-top: 8px">{{ compressError }}</div>
    <div v-if="compressStatus === 'done' && compressResult" style="margin-top: 8px">
      <p>
        {{ t('tools.image-resizer.texts.tag-compressed-size') }}:
        <strong>{{ compressResult.sizeKb.toFixed(1) }} KB</strong>
        ({{ compressResult.width }}x{{ compressResult.height }}px)
      </p>
      <n-button type="primary" @click="downloadCompressed">
        {{ t('tools.image-resizer.texts.tag-download-compressed') }}
      </n-button>
    </div>
  </n-card>

  <!-- 批量处理 -->
  <n-card mt-3>
    <h3 style="margin: 0 0 4px">{{ t('tools.image-resizer.texts.tag-batch-processing') }}</h3>
    <p style="margin: 0 0 12px; color: #666; font-size: 13px">{{ t('tools.image-resizer.texts.desc-batch') }}</p>

    <c-file-upload
      multiple
      mb-2
      accept="image/*"
      :title="t('tools.image-resizer.texts.title-drag-and-drop-an-image-file-here')"
      @files-upload="onBatchUpload"
    />

    <n-alert type="info" :show-icon="true" style="margin-bottom: 12px; text-align: left">
      {{ t('tools.image-resizer.texts.text-exif-cleared') }}
    </n-alert>

    <n-alert v-if="showTransparentWarning" type="warning" :show-icon="true" style="margin-bottom: 12px; text-align: left">
      {{ t('tools.image-resizer.texts.warn-transparent') }}
    </n-alert>

    <!-- 全局参数 -->
    <n-space vertical :size="12">
      <n-space align="center" :wrap="false">
        <span style="font-size: 13px; font-weight: 500; min-width: 70px">{{ t('tools.image-resizer.texts.label-batch-mode') }}：</span>
        <n-radio-group v-model:value="batchMode">
          <n-radio-button value="resize">{{ t('tools.image-resizer.texts.mode-resize') }}</n-radio-button>
          <n-radio-button value="compress">{{ t('tools.image-resizer.texts.mode-compress') }}</n-radio-button>
        </n-radio-group>
      </n-space>

      <n-space align="center" :wrap="false">
        <span style="font-size: 13px; font-weight: 500; min-width: 70px">{{ t('tools.image-resizer.texts.label-output-format') }}：</span>
        <n-select v-model:value="batchFormat" :options="formatOptions" size="small" style="width: 140px" />
      </n-space>

      <!-- 裁剪 -->
      <n-space align="center" :wrap="false">
        <span style="font-size: 13px; font-weight: 500; min-width: 70px">{{ t('tools.image-resizer.texts.label-crop-mode') }}：</span>
        <n-radio-group v-model:value="batchCropType" @update:value="onCropTypeChange">
          <n-radio-button value="none">{{ t('tools.image-resizer.texts.crop-none') }}</n-radio-button>
          <n-radio-button value="preset">{{ t('tools.image-resizer.texts.crop-preset') }}</n-radio-button>
          <n-radio-button value="custom">{{ t('tools.image-resizer.texts.crop-custom') }}</n-radio-button>
        </n-radio-group>
      </n-space>

      <n-space v-if="batchCropType === 'preset'" align="center" :wrap="false">
        <span style="font-size: 13px; font-weight: 500; min-width: 70px">{{ t('tools.image-resizer.texts.label-scene-preset') }}：</span>
        <n-select
          v-model:value="batchScenePreset"
          :options="scenePresets"
          size="small"
          style="width: 240px"
          @update:value="onCropPresetChange"
        />
        <span style="color: #666; font-size: 12px">{{ t('tools.image-resizer.texts.text-crop-preset-hint') }}</span>
      </n-space>

      <div v-if="batchCropType === 'custom'" style="border: 1px solid #e0e0e0; border-radius: 8px; padding: 12px">
        <n-alert type="info" :show-icon="true" style="margin-bottom: 10px">
          {{ t('tools.image-resizer.texts.text-crop-custom-hint') }}
        </n-alert>

        <!-- 当前编辑图 + 蓝框 + 确认/取消/应用到全部按钮 -->
        <ImageCropSelector v-if="editingItem" :src="editingItem.originalUrl" v-model="editingRect">
          <template #actions>
            <n-button size="tiny" type="primary" @click="confirmCrop">
              {{ t('tools.image-resizer.texts.btn-crop-confirm') }}
            </n-button>
            <n-button size="tiny" quaternary @click="cancelCrop">
              {{ t('tools.image-resizer.texts.btn-crop-cancel') }}
            </n-button>
            <n-button size="tiny" @click="applyCropToAll">
              {{ t('tools.image-resizer.texts.btn-crop-apply-all') }}
            </n-button>
          </template>
        </ImageCropSelector>
        <n-alert v-else-if="!batchQueue.length" type="warning" :show-icon="true">
          {{ t('tools.image-resizer.texts.text-crop-region-upload-first') }}
        </n-alert>
        <n-alert v-else type="success" :show-icon="true">
          {{ t('tools.image-resizer.texts.text-crop-custom-idle', { done: croppedCount, total: batchQueue.length }) }}
        </n-alert>

        <!-- 缩略图列表：点击切换编辑该图，已裁剪的标注 -->
        <div v-if="batchQueue.length" class="crop-thumbs">
          <div
            v-for="item in batchQueue"
            :key="item.id"
            class="crop-thumb"
            :class="{ active: item.id === editingId, cropped: !!item.cropOverride }"
            @click="editItem(item)"
          >
            <img :src="item.originalUrl" :alt="item.baseName" />
            <span v-if="item.cropOverride" class="crop-thumb-badge">{{ t('tools.image-resizer.texts.tag-cropped') }}</span>
            <span class="crop-thumb-name">{{ item.baseName }}</span>
          </div>
        </div>
      </div>

      <!-- 缩放模式参数 -->
      <template v-if="batchMode === 'resize'">
        <n-space v-if="batchCropType !== 'preset'" align="center" :wrap="false">
          <span style="font-size: 13px; font-weight: 500; min-width: 70px">{{ t('tools.image-resizer.texts.label-scene-preset') }}：</span>
          <n-select
            v-model:value="batchScenePreset"
            :options="scenePresets"
            size="small"
            style="width: 240px"
            @update:value="applyBatchScenePreset"
          />
        </n-space>
        <n-space align="center" :wrap="false">
          <n-checkbox v-model:checked="batchKeepRatio">{{ t('tools.image-resizer.texts.label-keep-ratio') }}</n-checkbox>
          <n-input-number
            v-model:value="batchWidth"
            :min="1"
            :max="32767"
            size="small"
            style="width: 130px"
            :placeholder="t('tools.image-resizer.texts.placeholder-width-px')"
          />
          <span style="color: #666">×</span>
          <n-input-number
            v-model:value="batchHeight"
            :disabled="batchKeepRatio"
            :min="1"
            :max="32767"
            size="small"
            style="width: 130px"
            :placeholder="t('tools.image-resizer.texts.placeholder-height-px')"
          />
          <span style="color: #666; font-size: 12px">px</span>
        </n-space>
      </template>

      <!-- 压缩模式参数 -->
      <template v-else>
        <n-space align="center" :wrap="false">
          <n-form-item :label="t('tools.image-resizer.texts.tag-target-size-kb')" label-placement="left">
            <n-input-number v-model:value="batchTargetKb" :min="1" :max="100000" />
          </n-form-item>
          <n-form-item :label="t('tools.image-resizer.texts.tag-max-dimension-px')" label-placement="left">
            <n-input-number v-model:value="batchMaxDim" :min="0" :max="32767" />
          </n-form-item>
        </n-space>
      </template>

      <!-- 质量 + 填充白 -->
      <n-space align="center" :wrap="false">
        <span style="font-size: 13px; font-weight: 500; min-width: 70px">{{ t('tools.image-resizer.texts.label-quality') }}：</span>
        <n-slider v-model:value="batchQuality" :min="0.1" :max="1" :step="0.05" style="width: 200px" />
        <span style="color: #666; font-size: 12px">{{ Math.round(batchQuality * 100) }}%</span>
        <n-checkbox v-model:checked="batchFillWhite" style="margin-left: 12px">
          {{ t('tools.image-resizer.texts.label-fill-white') }}
        </n-checkbox>
      </n-space>
    </n-space>

    <n-space mt-3>
      <n-button type="primary" :disabled="!batchQueue.length || batchProcessing" :loading="batchProcessing" @click="startBatch">
        {{ t('tools.image-resizer.texts.btn-start-batch') }}
      </n-button>
      <n-button :disabled="batchDoneCount === 0" @click="downloadAllZip">
        {{ t('tools.image-resizer.texts.btn-download-all-zip') }}
      </n-button>
    </n-space>

    <p v-if="batchQueue.length" style="margin: 12px 0 0; font-size: 13px; color: #666">
      {{ t('tools.image-resizer.texts.text-batch-summary', { ok: batchDoneCount, fail: batchErrorCount }) }}
    </p>

    <!-- 队列 -->
    <div v-if="batchQueue.length" style="margin-top: 12px; display: flex; flex-direction: column; gap: 12px">
      <div
        v-for="item in batchQueue"
        :key="item.id"
        style="border: 1px solid #e0e0e0; border-radius: 8px; padding: 12px; display: flex; gap: 12px; align-items: flex-start"
      >
        <!-- 缩略图 / 对比 -->
        <div style="flex: 0 0 160px">
          <div v-if="item.status === 'done' && item.resultUrl" class="compare">
            <img class="compare-base" :src="item.originalUrl" :alt="t('tools.image-resizer.texts.text-origin')" />
            <img
              class="compare-top"
              :src="item.resultUrl"
              :alt="t('tools.image-resizer.texts.text-result')"
              :style="{ clipPath: `inset(0 ${100 - item.comparePos}% 0 0)` }"
            />
          </div>
          <img
            v-else
            :src="item.originalUrl"
            style="max-width: 160px; max-height: 120px; border-radius: 4px"
            :alt="item.baseName"
          />
          <input
            v-if="item.status === 'done' && item.resultUrl"
            v-model="item.comparePos"
            type="range"
            min="0"
            max="100"
            style="width: 160px; margin-top: 6px"
          />
          <p v-if="item.status === 'done' && item.resultUrl" style="font-size: 11px; color: #888; margin: 2px 0 0">
            {{ t('tools.image-resizer.texts.text-compare-hint') }}
          </p>
        </div>

        <!-- 信息 -->
        <div style="flex: 1; min-width: 0">
          <p style="margin: 0 0 4px; font-weight: 600; word-break: break-all">{{ item.baseName }}</p>
          <p style="margin: 0; font-size: 12px; color: #666">
            {{ item.originalWidth }}x{{ item.originalHeight }}px · {{ formatSize(item.originalSizeKb) }}
          </p>

          <n-spin v-if="item.status === 'processing'" size="small" style="margin-top: 6px" />
          <p v-else-if="item.status === 'error'" style="margin: 6px 0 0; color: red; font-size: 12px">
            {{ t('tools.image-resizer.texts.text-failed') }}: {{ item.error }}
          </p>
          <template v-else-if="item.status === 'done'">
            <p style="margin: 6px 0 0; font-size: 13px">
              {{ t('tools.image-resizer.texts.text-origin') }} {{ formatSize(item.originalSizeKb) }}
              →
              <strong>{{ formatSize(item.resultSizeKb) }}</strong>
              ({{ item.resultWidth }}x{{ item.resultHeight }}px)
              <span style="color: #1ea54c">· {{ t('tools.image-resizer.texts.text-saved-percent', { pct: item.savedPercent }) }}</span>
            </p>
            <n-space style="margin-top: 6px">
              <n-button size="small" @click="downloadOne(item)">
                {{ t('tools.image-resizer.texts.btn-download-one') }}
              </n-button>
            </n-space>
          </template>
          <p v-else style="margin: 6px 0 0; font-size: 12px; color: #999">
            {{ t('tools.image-resizer.texts.text-processing') }}
          </p>
        </div>
      </div>
    </div>
  </n-card>
</template>

<style scoped>
.compact-controls {
  display: flex;
  gap: 30px;
  padding: 15px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
}

.dimensions-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dimensions-section h4 {
  margin: 0 0 10px 0;
  font-size: 14px;
  font-weight: 600;
}

.input-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.input-group label {
  min-width: 80px;
  font-size: 13px;
  font-weight: 500;
}

.aspect-ratio-middle {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.aspect-ratio-middle h4 {
  margin: 0 0 10px 0;
  font-size: 14px;
  font-weight: 600;
}

.current-ratio-display {
  font-weight: 600;
  font-size: 16px;
  color: #1ea54c;
  text-align: center;
}

.lock-icon {
  margin: 5px 0;
}

.aspect-ratio-section-compact {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.aspect-ratio-section-compact h4 {
  margin: 0 0 10px 0;
  font-size: 14px;
  font-weight: 600;
}

.aspect-ratio-selector-compact {
  display: flex;
  align-items: center;
  gap: 8px;
}

.custom-ratio-inputs-compact {
  margin-top: 5px;
}

.custom-ratio-group-compact {
  display: flex;
  align-items: center;
  justify-content: left;
  gap: 5px;
}

.custom-ratio-group-compact span {
  font-weight: bold;
  color: #666;
  font-size: 14px;
}

.validation-warning {
  margin-top: 5px;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .compact-controls {
    flex-direction: column;
    gap: 20px;
  }
}

.aspect-ratio-controls {
  display: flex;
  flex-direction: column;
  gap: 15px;
  padding: 15px;
  border-radius: 8px;
}

.aspect-ratio-selector {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.aspect-ratio-selector label {
  font-weight: 600;
  min-width: 100px;
}

.custom-ratio-inputs {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.custom-ratio-inputs label {
  font-weight: 600;
  text-align: center;
}

.custom-ratio-group {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
}

.custom-ratio-group span {
  font-weight: bold;
  color: #666;
}

.image-container {
  max-width: 100%;
  overflow: auto;
}

.image-wrapper {
  max-width: 100%;
  max-height: 500px;
  overflow: auto;
}

.preview-too-large {
  padding: 20px;
  border: 1px dashed #ccc;
  border-radius: 8px;
  margin: 20px 0;
}

.download-grid {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 10px;
}

a {
  color: #007bff;
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

/* 前后对比滑块 */
.compare {
  position: relative;
  width: 160px;
  max-width: 160px;
  border-radius: 4px;
  overflow: hidden;
  line-height: 0;
}

.compare-base,
.compare-top {
  display: block;
  width: 160px;
  max-width: 160px;
  height: auto;
}

.compare-top {
  position: absolute;
  top: 0;
  left: 0;
}

/* 自定义裁剪缩略图列表 */
.crop-thumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
.crop-thumb {
  position: relative;
  width: 72px;
  cursor: pointer;
  border: 2px solid transparent;
  border-radius: 6px;
  overflow: hidden;
  transition: border-color 0.15s;
}
.crop-thumb:hover {
  border-color: #b0d4ff;
}
.crop-thumb.active {
  border-color: #2080f0;
}
.crop-thumb img {
  display: block;
  width: 100%;
  height: 54px;
  object-fit: cover;
  border-radius: 4px;
}
.crop-thumb-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  background: #1ea54c;
  color: #fff;
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 8px;
  line-height: 1.2;
}
.crop-thumb-name {
  display: block;
  font-size: 10px;
  color: #666;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 1px 0;
}
</style>
