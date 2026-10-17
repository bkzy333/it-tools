// 文件哈希报告的 PDF 生成器 —— 零依赖、手写 PDF 结构。
//
// 为什么不用 jsPDF / pdf-lib：为一个「哈希清单」引一个几百 KB 的库不划算，
// 而 PDF 的报告型子集（Catalog / Pages / Page / Contents / 三种 base-14 字体）
// 完全可以手写。这里生成的 PDF 有几个刻意选择：
//
// 1. **标签用英文**。试过 Type0 + UniGB-UCS2-H 的非嵌入 CID 字体方案（本可以
//    输出中文），但 Chrome 的 PDFium 对非嵌入 CJK 字体只做 Latin 替换、中文字形
//    直接丢弃，Acrobat 之外的表现不可控。哈希工具的输出惯例本来就是英文
//    （sha256sum、OpenSSL、certutil 全是英文标签），跟着惯例走最稳。
// 2. **非 ASCII 文件名按 UTF-8 百分号转写**（%E4%B8%AD…）。丢成 '?' 会让两个
//    中文文件在报告里撞名，转写至少无损且可还原；报告尾部有一行说明，
//    并指向保留原始文件名的 CSV / JSON / TXT 导出。
// 3. 哈希值是 ASCII 十六进制，用 Courier 等宽渲染，88 字符折行。
// 4. 不压缩内容流、整个文件纯 ASCII —— xref 偏移可以按字符数精确算，测试好写。

import type { HashAlgoMeta } from './file-hash.service';

export interface PdfFileEntry {
  name: string;
  size: number;
  /** algoId -> 十六进制摘要 */
  hashes: Record<string, string>;
  /** 与预期哈希的比对结果 */
  verified: 'match' | 'mismatch' | null;
}

export interface PdfReportInput {
  algorithms: readonly HashAlgoMeta[];
  expectedHash: string | null;
  files: readonly PdfFileEntry[];
  generatedAt: Date;
  /** 报告编号（调用方生成，如 nanoid） */
  reportId: string;
}

// ---------------------------------------------------------------- 基础工具

/** 每行可容纳的字符数（按字体度量估的，宁可保守） */
const MAX_CHARS = { F1: 58, F2: 92, F3: 88 } as const;
type FontId = keyof typeof MAX_CHARS;
const FONT_SIZE: Record<FontId, number> = { F1: 16, F2: 9, F3: 8 };

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN_X = 48;
const TOP_Y = 792;
const BOTTOM_Y = 64;

/** 是否发生过非 ASCII 转写（决定报告尾部要不要加说明行） */
let hadNonAscii = false;

/** 字符 → UTF-8 字节序列（不依赖 Node 的 Buffer，浏览器里直接用） */
function utf8Bytes(ch: string): number[] {
  const code = ch.codePointAt(0) as number;
  if (code < 0x80) {
    return [code];
  }
  if (code < 0x800) {
    return [0xc0 | (code >> 6), 0x80 | (code & 0x3f)];
  }
  if (code < 0x10000) {
    return [0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f)];
  }
  return [
    0xf0 | (code >> 18),
    0x80 | ((code >> 12) & 0x3f),
    0x80 | ((code >> 6) & 0x3f),
    0x80 | (code & 0x3f),
  ];
}

/**
 * 文本 → 纯 ASCII。非 ASCII 字符按 UTF-8 百分号转写，避免任何查看器乱码，
 * 也避免两个非 ASCII 文件名在报告里退化成同一个 '???'。
 */
function toAscii(text: string): string {
  if (/^[\x20-\x7e]*$/.test(text)) {
    return text;
  }
  hadNonAscii = true;
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0) as number;
    if (code >= 0x20 && code <= 0x7e) {
      out += ch;
      continue;
    }
    for (const byte of utf8Bytes(ch)) {
      out += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
    }
  }
  return out;
}

/** 字面量串（只接收纯 ASCII；转义在 toAscii 之后做，顺序不能反） */
function pdfString(text: string): string {
  return `(${text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')})`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDateTime(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

/** 按字数折行（等宽字体下字符数就是宽度） */
function wrapText(text: string, font: FontId, indent: number): { text: string; indent: number }[] {
  const limit = MAX_CHARS[font];
  const lines: { text: string; indent: number }[] = [];
  let rest = text;
  let first = true;
  while (rest.length > limit) {
    lines.push({ text: rest.slice(0, limit), indent: first ? indent : indent + 12 });
    rest = rest.slice(limit);
    first = false;
  }
  if (rest.length > 0 || lines.length === 0) {
    lines.push({ text: rest, indent: first ? indent : indent + 12 });
  }
  return lines;
}

// ---------------------------------------------------------------- 版面构建

interface Line {
  text: string;
  font: FontId;
  size: number;
  indent: number;
  gapBefore: number;
}

function buildLines(input: PdfReportInput): Line[] {
  hadNonAscii = false;
  const lines: Line[] = [];
  const push = (text: string, font: FontId, opts: { indent?: number; gapBefore?: number; size?: number } = {}) => {
    lines.push({
      text: toAscii(text),
      font,
      size: opts.size ?? FONT_SIZE[font],
      indent: opts.indent ?? 0,
      gapBefore: opts.gapBefore ?? 0,
    });
  };

  push('FILE HASH VERIFICATION REPORT', 'F1', { gapBefore: 0 });
  push('gjxtools.com - File Hash Calculator', 'F2', { gapBefore: 4 });
  push('', 'F2', { gapBefore: 6 });
  push(`Report ID: ${input.reportId}`, 'F2');
  push(`Generated: ${formatDateTime(input.generatedAt)}`, 'F2');
  push(`Algorithms: ${input.algorithms.map((a) => a.label).join(', ')}`, 'F2');
  // 预期哈希可能 128 位，按 F2 行宽折行，避免冲出右边界
  for (const line of wrapText(`Expected hash: ${input.expectedHash ? input.expectedHash.toLowerCase() : '(none)'}`, 'F2', 0)) {
    push(line.text, 'F2', { indent: line.indent });
  }
  push(`Files: ${input.files.length}`, 'F2');

  input.files.forEach((file, index) => {
    const verdict = file.verified === 'match' ? 'MATCH' : file.verified === 'mismatch' ? 'MISMATCH' : 'not compared';
    push('', 'F2', { gapBefore: 10 });
    for (const line of wrapText(`[${index + 1}] ${file.name}`, 'F1', 0)) {
      push(line.text, 'F1', { size: 11, gapBefore: index === 0 ? 8 : 0, indent: line.indent });
    }
    push(`Size: ${formatFileSize(file.size)} | Expected hash: ${verdict}`, 'F2', { gapBefore: 2 });
    for (const algo of input.algorithms) {
      const hash = file.hashes[algo.id];
      if (!hash) {
        continue;
      }
      push(algo.label, 'F2', { indent: 8, gapBefore: 3, size: 8 });
      for (const line of wrapText(hash, 'F3', 20)) {
        push(line.text, 'F3', { size: 8, indent: line.indent });
      }
    }
  });

  if (hadNonAscii) {
    push('', 'F2', { gapBefore: 10 });
    push('Note: non-ASCII characters in file names are UTF-8 percent-encoded.', 'F2', { size: 8 });
    push('Use the CSV / JSON / TXT export for original file names.', 'F2', { size: 8 });
  }

  return lines;
}

// ---------------------------------------------------------------- PDF 组装

/**
 * 生成 PDF 字节。
 *
 * 结构：1 Catalog / 2 Pages / 3~5 字体 / 之后每页两个对象（Contents + Page）。
 * xref 表按 ASCII 字节精确计算偏移（整个文件不含非 ASCII 字节）。
 */
export function buildHashReportPdf(input: PdfReportInput): Uint8Array<ArrayBuffer> {
  const lines = buildLines(input);

  // —— 第一遍：分页 ——
  const pages: Line[][] = [];
  let current: Line[] = [];
  let y = TOP_Y;
  for (const line of lines) {
    const lineHeight = line.size * 1.45;
    if (y - lineHeight < BOTTOM_Y) {
      pages.push(current);
      current = [];
      y = TOP_Y;
    }
    y -= lineHeight + line.gapBefore;
    current.push(line);
  }
  if (current.length > 0) {
    pages.push(current);
  }
  if (pages.length === 0) {
    pages.push([]);
  }

  // —— 第二遍：逐页生成内容流 ——
  const contentStreams = pages.map((pageLines, pageIndex) => {
    const ops: string[] = [];
    let y = TOP_Y;
    for (const line of pageLines) {
      y -= line.size * 1.45 + line.gapBefore;
      ops.push(
        `BT /${line.font} ${line.size} Tf 1 0 0 1 ${MARGIN_X + line.indent} ${y.toFixed(2)} Tm ${pdfString(line.text)} Tj ET`,
      );
    }
    // 页脚：左「本地生成」声明，右页码
    const footerY = 40;
    ops.push(
      `BT /F2 8 Tf 1 0 0 1 ${MARGIN_X} ${footerY} Tm ${pdfString('Generated locally in your browser. No file was uploaded.')} Tj ET`,
    );
    const pageLabel = `Page ${pageIndex + 1} / ${pages.length}`;
    const pageLabelWidth = pageLabel.length * 4;
    ops.push(`BT /F2 8 Tf 1 0 0 1 ${PAGE_W - MARGIN_X - pageLabelWidth} ${footerY} Tm ${pdfString(pageLabel)} Tj ET`);
    return ops.join('\n');
  });

  // —— 第三遍：拼装对象，记录偏移 ——
  const totalPages = pages.length;
  const pageObjIds = Array.from({ length: totalPages }, (_, i) => 7 + i * 2);
  const kids = pageObjIds.map((id) => `${id} 0 R`).join(' ');

  const objects: string[] = [
    // 1 Catalog
    '<< /Type /Catalog /Pages 2 0 R >>',
    // 2 Pages
    `<< /Type /Pages /Kids [${kids}] /Count ${totalPages} >>`,
    // 3~5 字体（base-14，不嵌入）
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>',
  ];

  pageObjIds.forEach((pageId, index) => {
    const contentId = 6 + index * 2;
    const stream = contentStreams[index];
    objects.push(
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
  });

  let pdf = '%PDF-1.7\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  // 显式包一层 ArrayBuffer：new Uint8Array(number) 的泛型是 ArrayBufferLike，
  // 直接喂给 new Blob([bytes]) 会被 TS 5.7+ 的 lib.dom 判掉（SharedArrayBuffer 不容）。
  const buffer = new ArrayBuffer(pdf.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < pdf.length; i += 1) {
    bytes[i] = pdf.charCodeAt(i) & 0xff;
  }
  return bytes;
}
