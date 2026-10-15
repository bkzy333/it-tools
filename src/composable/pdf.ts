// PDF 通用能力：用已自托管的 pdfjs-dist 加载并渲染页面缩略图（worker 走 Vite ?url 本地打包，非 CDN）
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker?url';
import type { PDFDocumentProxy } from 'pdfjs-dist';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type PdfDoc = PDFDocumentProxy;

export async function loadPdf(data: Uint8Array): Promise<PdfDoc> {
  return pdfjs.getDocument({ data, isEvalSupported: false }).promise;
}

export interface RenderedPage {
  pageNumber: number;
  width: number;
  height: number;
  dataUrl: string;
}

/** 渲染单页为 PNG dataURL，缩放使宽度约为 targetWidth 像素（清晰且体积小） */
export async function renderPage(doc: PdfDoc, pageNumber: number, targetWidth = 220): Promise<RenderedPage> {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = targetWidth / base.width || 1;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('无法创建画布上下文');
  }
  await page.render({ canvasContext: ctx, viewport }).promise;
  return {
    pageNumber,
    width: canvas.width,
    height: canvas.height,
    dataUrl: canvas.toDataURL('image/png'),
  };
}

export async function renderAllPages(
  doc: PdfDoc,
  targetWidth = 220,
  onProgress?: (done: number, total: number) => void,
): Promise<RenderedPage[]> {
  const out: RenderedPage[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    out.push(await renderPage(doc, i, targetWidth));
    onProgress?.(i, doc.numPages);
  }
  return out;
}

/**
 * 渲染单页为「高清图片」用于 OCR 送图（默认 1500px 宽 ≈ 150DPI，腾讯 GeneralBasicOCR 识别良好）。
 * 默认 JPEG：填白底、体积小（避免透明通道膨胀，且腾讯对 JPG 支持最好）。
 * 返回带 data: 前缀的 dataURL，调用方需自行剥离前缀后只传 base64 给后端。
 */
export async function renderPageImage(
  doc: PdfDoc,
  pageNumber: number,
  targetWidth = 1500,
  type: 'jpeg' | 'png' = 'jpeg',
): Promise<{ pageNumber: number; dataUrl: string; bytes: number }> {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = targetWidth / (base.width || 1);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('无法创建画布上下文');
  }
  if (type === 'jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  await page.render({ canvasContext: ctx, viewport }).promise;
  const dataUrl = canvas.toDataURL(type === 'jpeg' ? 'image/jpeg' : 'image/png', 0.92);
  // 估算字节数（base64 比原图膨胀约 1.33 倍），用于前端粗判体积，避免徒劳请求被后端 413 拒掉
  const comma = dataUrl.indexOf(',');
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const pad = (b64.match(/=+$/) || [''])[0].length;
  const bytes = Math.floor((b64.length * 3) / 4) - pad;
  return { pageNumber, dataUrl, bytes };
}
