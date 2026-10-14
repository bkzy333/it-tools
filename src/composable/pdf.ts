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
