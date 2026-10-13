// 纯前端「文字区域」启发式检测：不调任何外部 API，零额度消耗。
// 输入一张图（ImageData 的像素数组），输出归一化包围盒 {x,y,w,h}（相对原图比例，0~1）。
// 思路：文字通常是「暗底上的亮字」或「亮底上的暗字」，先按平均亮度判断墨迹是暗还是亮，
// 再求墨迹像素的最小外接矩形，外扩一点 margin。过于空 / 过于满（接近整图）则返回 null，
// 让调用方回退到「整图」。

export interface NormRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface InkBoxOptions {
  /** 外扩边距，占各自边长的比例，默认 0.02 */
  margin?: number;
  /** 墨迹占比下限，低于此视为「几乎无内容」，返回 null（用整图） */
  minInkRatio?: number;
  /** 墨迹占比上限，高于此视为「几乎全满」，返回 null（用整图） */
  maxInkRatio?: number;
  /** 判定墨迹的亮度阈值（0~255），默认 128 */
  threshold?: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * 给定 RGBA 像素数组，返回墨迹包围盒（归一化）。无有效墨迹时返回 null。
 * data 长度应为 width*height*4。
 */
export function computeInkBBox(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  opts: InkBoxOptions = {},
): NormRect | null {
  const margin = opts.margin ?? 0.02;
  const minInkRatio = opts.minInkRatio ?? 0.002;
  const maxInkRatio = opts.maxInkRatio ?? 0.97;
  const threshold = opts.threshold ?? 128;

  const n = width * height;
  if (n === 0 || data.length < n * 4) {
    return null;
  }

  // 第一遍：平均亮度，判断墨迹是暗(亮底)还是亮(暗底)
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += luminance(data[i], data[i + 1], data[i + 2]);
  }
  const mean = sum / n;
  const inkIsDark = mean >= threshold; // 平均偏亮 → 墨迹是暗的

  // 第二遍：累加墨迹像素的包围盒
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let ink = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const lum = luminance(data[i], data[i + 1], data[i + 2]);
      const isInk = inkIsDark ? lum < threshold : lum >= threshold;
      if (isInk) {
        ink++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const ratio = ink / n;
  if (ink === 0 || ratio < minInkRatio || ratio > maxInkRatio) {
    return null; // 太 sparse / 太满 → 用整图
  }

  // 外扩 margin（像素），并夹到 [0, width-1]/[0, height-1]
  const mx = Math.round(width * margin);
  const my = Math.round(height * margin);
  minX = Math.max(0, minX - mx);
  minY = Math.max(0, minY - my);
  maxX = Math.min(width - 1, maxX + mx);
  maxY = Math.min(height - 1, maxY + my);

  return {
    x: minX / width,
    y: minY / height,
    w: (maxX - minX + 1) / width,
    h: (maxY - minY + 1) / height,
  };
}

/** 把归一化矩形夹到合法范围（0~1，最小边长 minW） */
export function clampRect(r: NormRect, minW = 0.05): NormRect {
  const w = clamp(r.w, minW, 1);
  const h = clamp(r.h, minW, 1);
  const x = clamp(r.x, 0, 1 - w);
  const y = clamp(r.y, 0, 1 - h);
  return { x, y, w, h };
}
