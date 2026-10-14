/**
 * 图片格式编码（统一出口）。
 *
 * 浏览器 canvas 原生只可靠编码 jpeg / png / webp（Chrome 还能 avif，但未纳入）。
 * 为满足「多种格式」需求，这里用纯前端方式自研 BMP / ICO / SVG 编码器，
 * 零依赖、全浏览器可打开，不引入 GIF/TIFF 编码库（包体大、Safari 支持差）。
 *
 * - BMP：24 位非压缩，底部向上扫描，行 4 字节对齐（Windows 标准）。
 * - ICO：把 canvas 的 PNG 快照嵌进 ICONDIR + ICONDIRENTRY（PNG-in-ICO，Vista+ 通用）。
 * - SVG：把位图包进 <svg><image href=dataURL/></svg>，矢量容器、处处可打开。
 */

import type { OutputFormat } from './image-compress.service';

/** 归一化裁剪框：相对原图的比例，范围 0~1 */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const SUPPORTED_FORMATS: OutputFormat[] = ['jpeg', 'png', 'webp', 'bmp', 'ico', 'svg'];

export const FORMAT_LABELS: Record<OutputFormat, string> = {
  jpeg: 'JPG',
  png: 'PNG',
  webp: 'WebP',
  bmp: 'BMP',
  ico: 'ICO',
  svg: 'SVG',
};

/** 输出文件扩展名（jpeg -> jpg） */
export function formatExt(format: OutputFormat): string {
  return format === 'jpeg' ? 'jpg' : format;
}

/** 浏览器原生可编码的格式 */
const NATIVE_MIME: Partial<Record<OutputFormat, string>> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

function nativeEncode(canvas: HTMLCanvasElement, format: OutputFormat, quality: number): Promise<Blob> {
  const mime = NATIVE_MIME[format] ?? 'image/png';
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))),
      mime,
      quality,
    );
  });
}

/** 统一编码入口：按格式分发到原生或自研编码器 */
export async function encodeImage(
  canvas: HTMLCanvasElement,
  format: OutputFormat,
  quality: number,
): Promise<Blob> {
  if (format === 'bmp') {
    return encodeBmp(canvas);
  }
  if (format === 'ico') {
    return encodeIco(canvas);
  }
  if (format === 'svg') {
    return encodeSvg(canvas);
  }
  return nativeEncode(canvas, format, quality);
}

/** 24 位非压缩 BMP */
function encodeBmp(canvas: HTMLCanvasElement): Blob {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  const data = ctx.getImageData(0, 0, w, h).data;
  const rowSize = Math.floor((24 * w + 31) / 32) * 4;
  const imgSize = rowSize * h;
  const buf = new ArrayBuffer(54 + imgSize);
  const dv = new DataView(buf);

  // BITMAPFILEHEADER (14)
  dv.setUint8(0, 0x42);
  dv.setUint8(1, 0x4d); // 'BM'
  dv.setUint32(2, 54 + imgSize, true);
  dv.setUint32(6, 0, true);
  dv.setUint32(10, 54, true);

  // BITMAPINFOHEADER (40)
  dv.setUint32(14, 40, true);
  dv.setInt32(18, w, true);
  dv.setInt32(22, h, true);
  dv.setUint16(26, 1, true); // planes
  dv.setUint16(28, 24, true); // bpp
  dv.setUint32(30, 0, true); // no compression
  dv.setUint32(34, imgSize, true);
  dv.setInt32(38, 2835, true); // 72 DPI
  dv.setInt32(42, 2835, true);
  dv.setUint32(46, 0, true);
  dv.setUint32(50, 0, true);

  let off = 54;
  for (let y = h - 1; y >= 0; y--) {
    let p = off;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      dv.setUint8(p++, data[i + 2]); // B
      dv.setUint8(p++, data[i + 1]); // G
      dv.setUint8(p++, data[i]); // R
    }
    while (p < off + rowSize) {
      dv.setUint8(p++, 0);
    }
    off += rowSize;
  }
  return new Blob([buf], { type: 'image/bmp' });
}

/** ICO：把 PNG 快照嵌进标准结构（超 256px 先缩到 256 以内，兼容旧加载器） */
async function encodeIco(canvas: HTMLCanvasElement): Promise<Blob> {
  let src = canvas;
  if (canvas.width > 256 || canvas.height > 256) {
    const scale = 256 / Math.max(canvas.width, canvas.height);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(canvas.width * scale));
    c.height = Math.max(1, Math.round(canvas.height * scale));
    c.getContext('2d')!.drawImage(canvas, 0, 0, c.width, c.height);
    src = c;
  }
  const pngBlob = await nativeEncode(src, 'png', 1);
  const png = new Uint8Array(await pngBlob.arrayBuffer());

  const dir = new ArrayBuffer(6);
  const dv = new DataView(dir);
  dv.setUint16(0, 0, true); // reserved
  dv.setUint16(2, 1, true); // type = icon
  dv.setUint16(4, 1, true); // count

  const entry = new ArrayBuffer(16);
  const ev = new DataView(entry);
  ev.setUint8(0, src.width >= 256 ? 0 : src.width);
  ev.setUint8(1, src.height >= 256 ? 0 : src.height);
  ev.setUint8(2, 0); // colors
  ev.setUint8(3, 0); // reserved
  ev.setUint16(4, 1, true); // planes
  ev.setUint16(6, 32, true); // bpp
  ev.setUint32(8, png.length, true); // bytes in PNG
  ev.setUint32(12, 22, true); // offset = 6 + 16

  const out = new Uint8Array(6 + 16 + png.length);
  out.set(new Uint8Array(dir), 0);
  out.set(new Uint8Array(entry), 6);
  out.set(png, 22);
  return new Blob([out], { type: 'image/x-icon' });
}

/** SVG：位图以 dataURL 嵌入 <image> */
function encodeSvg(canvas: HTMLCanvasElement): Blob {
  const dataUrl = canvas.toDataURL('image/png');
  const w = canvas.width;
  const h = canvas.height;
  const svg =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<image width="${w}" height="${h}" href="${dataUrl}" xlink:href="${dataUrl}"/></svg>`;
  return new Blob([svg], { type: 'image/svg+xml' });
}

/**
 * 计算「居中裁剪到目标比例」的归一化框。
 * 在保持目标宽高比的前提下，取原图中最大的居中区域。
 */
export function centerCropRect(origW: number, origH: number, targetW: number, targetH: number): CropRect {
  if (origW <= 0 || origH <= 0 || targetW <= 0 || targetH <= 0) {
    return { x: 0, y: 0, w: 1, h: 1 };
  }
  const targetRatio = targetW / targetH;
  const origRatio = origW / origH;
  let cw: number;
  let ch: number;
  if (origRatio > targetRatio) {
    ch = origH;
    cw = origH * targetRatio;
  } else {
    cw = origW;
    ch = origW / targetRatio;
  }
  const x = (origW - cw) / 2;
  const y = (origH - ch) / 2;
  return { x: x / origW, y: y / origH, w: cw / origW, h: ch / origH };
}
