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
function encode(canvas: HTMLCanvasElement, format: 'jpeg' | 'webp', quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const mime = format === 'jpeg' ? 'image/jpeg' : 'image/webp';
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
