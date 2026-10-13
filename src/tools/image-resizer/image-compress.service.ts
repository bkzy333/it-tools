/**
 * 图片压缩到目标体积。
 *
 * 参考 iamwawa.cn/tinyimg.html：设置目标大小(KB) + 最大长宽，自动有损压缩。
 * 纯前端 canvas 实现，不上传服务器。
 *
 * 算法：canvas 重绘（可选缩放到最大长宽）→ 以 JPEG/WebP 编码 → 用二分法调 quality
 * 逼近目标体积。JPEG 不支持透明，透明区域会填白；PNG 无损无法压缩体积，所以这里
 * 只用 JPEG/WebP 两种有损格式。
 */

export interface CompressOptions {
  /** 目标文件大小，单位 KB */
  targetKb: number;
  /** 最大长宽（px），0 表示不限制 */
  maxDimension: number;
  /** 输出格式 */
  format: 'jpeg' | 'webp';
}

export interface CompressResult {
  blob: Blob;
  /** 实际大小，KB */
  sizeKb: number;
  /** 实际输出尺寸 */
  width: number;
  height: number;
}

/** 读 File 为可绘制 Image */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

/** 计算缩放后的尺寸（不超过 maxDimension，等比） */
function scaledDimensions(w: number, h: number, maxDimension: number): { width: number; height: number } {
  if (maxDimension <= 0) {
    return { width: w, height: h };
  }
  const ratio = Math.min(1, maxDimension / Math.max(w, h));
  return { width: Math.round(w * ratio), height: Math.round(h * ratio) };
}

/** canvas 转指定格式的 Blob，返回字节数 */
function encode(canvas: HTMLCanvasElement, format: OutputFormat, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const mime = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Encode failed'));
        }
      },
      mime,
      quality,
    );
  });
}

/**
 * 压缩图片到目标体积。用二分法逼近，最多迭代 8 次。
 * 若最低 quality 仍超目标，返回最低 quality 的结果（尽力压缩）。
 */
export async function compressImage(file: File, options: CompressOptions): Promise<CompressResult> {
  const img = await loadImage(file);
  const { width, height } = scaledDimensions(img.naturalWidth, img.naturalHeight, options.maxDimension);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  if (options.format === 'jpeg') {
    // JPEG 不支持透明，填白底
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(img, 0, 0, width, height);

  const targetBytes = options.targetKb * 1024;
  let low = 0;
  let high = 1;
  let best: Blob = await encode(canvas, options.format, 0.7);

  for (let i = 0; i < 8; i++) {
    const mid = (low + high) / 2;
    const blob = await encode(canvas, options.format, mid);
    if (blob.size <= targetBytes) {
      best = blob;
      low = mid; // 还能再降质量，但记录当前达标结果
    } else {
      high = mid;
    }
    // 如果已经非常接近目标，提前结束
    if (Math.abs(blob.size - targetBytes) / targetBytes < 0.05) {
      break;
    }
  }

  return {
    blob: best,
    sizeKb: best.size / 1024,
    width,
    height,
  };
}

// ===================== 统一处理（批量管线共用） =====================

export type OutputFormat = 'jpeg' | 'png' | 'webp';

export interface ProcessOptions {
  /** resize = 等比/显式缩放；compress = 压到目标体积 */
  mode: 'resize' | 'compress';
  format: OutputFormat;
  /** 有损格式的质量 0.1~1 */
  quality: number;
  /** resize 模式：百分比缩放（如 50 表示 50%） */
  scalePercent?: number;
  /** resize 模式：显式尺寸（优先于 scalePercent） */
  width?: number;
  height?: number;
  /** JPEG 不支持透明，是否先填白底（透明图转 JPG 必开） */
  fillWhite: boolean;
  /** compress 模式：目标体积 KB */
  targetKb?: number;
  /** compress 模式：最大长宽，0 不限 */
  maxDimension?: number;
}

export interface ProcessResult {
  blob: Blob;
  sizeKb: number;
  width: number;
  height: number;
  format: OutputFormat;
}

/** canvas 转指定格式 Blob（统一出口） */
function canvasToBlob(canvas: HTMLCanvasElement, format: OutputFormat, quality: number): Promise<Blob> {
  return encode(canvas, format, quality);
}

/** 计算 resize 模式的目标尺寸 */
function resolveResizeDimensions(origW: number, origH: number, opts: ProcessOptions): { width: number; height: number } {
  if (opts.scalePercent && opts.scalePercent > 0) {
    const ratio = opts.scalePercent / 100;
    return { width: Math.max(1, Math.round(origW * ratio)), height: Math.max(1, Math.round(origH * ratio)) };
  }
  return {
    width: Math.max(1, Math.round(opts.width ?? origW)),
    height: Math.max(1, Math.round(opts.height ?? origH)),
  };
}

/** compress 模式：在已缩放画布上用二分法逼近目标体积 */
async function compressOnCanvas(
  canvas: HTMLCanvasElement,
  format: OutputFormat,
  targetBytes: number,
): Promise<Blob> {
  let low = 0;
  let high = 1;
  let best: Blob = await canvasToBlob(canvas, format, 0.7);
  for (let i = 0; i < 8; i++) {
    const mid = (low + high) / 2;
    const blob = await canvasToBlob(canvas, format, mid);
    if (blob.size <= targetBytes) {
      best = blob;
      low = mid;
    } else {
      high = mid;
    }
    if (Math.abs(blob.size - targetBytes) / targetBytes < 0.05) {
      break;
    }
  }
  return best;
}

/**
 * 统一处理单张图片：支持 resize / compress 两种模式，输出指定格式。
 * 纯前端 canvas 实现，不上传服务器；canvas 重绘天然剥离 EXIF（隐私保护）。
 */
export async function processImage(file: File, opts: ProcessOptions): Promise<ProcessResult> {
  const img = await loadImage(file);
  const origW = img.naturalWidth;
  const origH = img.naturalHeight;

  let width: number;
  let height: number;
  let blob: Blob;

  if (opts.mode === 'compress') {
    // 先按最大长宽等比缩放
    const scaled = scaledDimensions(origW, origH, opts.maxDimension ?? 0);
    width = scaled.width;
    height = scaled.height;
  } else {
    const resolved = resolveResizeDimensions(origW, origH, opts);
    width = resolved.width;
    height = resolved.height;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  // JPEG 不支持透明；或用户显式要求填白
  if (opts.format === 'jpeg' || opts.fillWhite) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(img, 0, 0, width, height);

  if (opts.mode === 'compress' && opts.targetKb && opts.targetKb > 0) {
    blob = await compressOnCanvas(canvas, opts.format, opts.targetKb * 1024);
  } else {
    blob = await canvasToBlob(canvas, opts.format, opts.quality);
  }

  return {
    blob,
    sizeKb: blob.size / 1024,
    width,
    height,
    format: opts.format,
  };
}

/** 检测图片是否含有透明像素（仅 PNG/WebP 有意义，JPEG 无 alpha 通道） */
export async function hasAlphaChannel(file: File): Promise<boolean> {
  const isAlphaFormat =
    /\.(png|webp)$/i.test(file.name) || file.type === 'image/png' || file.type === 'image/webp';
  if (!isAlphaFormat) {
    return false;
  }
  const img = await loadImage(file);
  const sample = 32;
  const canvas = document.createElement('canvas');
  canvas.width = sample;
  canvas.height = sample;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, sample, sample);
  const data = ctx.getImageData(0, 0, sample, sample).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) {
      return true;
    }
  }
  return false;
}

/**
 * 批量处理（手写并发限制，不引入 p-limit 依赖）。
 * 失败的单张标记为 error 并继续，不中断整个队列。
 * opts 可以是固定配置，也可以是根据每张图动态生成的函数（批量缩放需按各图原始比例算百分比）。
 */
export async function processBatch(
  files: File[],
  opts: ProcessOptions | ((file: File, index: number) => ProcessOptions),
  onItem: (index: number, result: ProcessResult | null, error: string | null) => void,
  concurrency = 3,
): Promise<void> {
  const getOpts = typeof opts === 'function' ? opts : () => opts;
  let cursor = 0;
  const worker = async () => {
    while (cursor < files.length) {
      const index = cursor++;
      try {
        const result = await processImage(files[index], getOpts(files[index], index));
        onItem(index, result, null);
      } catch (e: any) {
        onItem(index, null, e?.message ?? String(e));
      }
    }
  };
  const poolSize = Math.min(concurrency, Math.max(1, files.length));
  await Promise.all(Array.from({ length: poolSize }, () => worker()));
}
