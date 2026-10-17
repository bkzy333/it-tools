/**
 * 统一的结果导出工具 —— 全站「下载结果」的唯一出口。
 *
 * 为什么集中在这里：之前每个工具各自写 Blob + a.click() + revokeObjectURL，
 * 写法散落，还容易漏 UTF-8 BOM（漏了 Excel 打开中文就是乱码）。这里收敛成两个
 * 函数，所有工具复用，从根上消除「能复制却不能导出」和「导出乱码」两类问题。
 *
 * 关于「导出 Excel」：仓库 package.json 虽声明了 xlsx，但本地并未真正安装，且全站
 * 没有任何工具实际使用它。为保持零新增依赖、零构建风险，Excel 用「CSV + UTF-8 BOM」
 * 实现 —— Excel 原生可打开，按钮文案写「导出 Excel」贴合用户心智（这正是 rmb-numbers
 * 早已验证的成熟做法）。A 列输入、B 列输出这种两列场景，CSV 天然就是它。
 */

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/** 导出纯文本文件（TXT）。 */
export function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  triggerDownload(blob, filename);
}

/**
 * 导出任意 Blob（PDF 报告、JSON 等二进制/结构化产物）。
 *
 * 与 downloadTextFile 的分工：那个管「纯文本结果」，这个管「程序生成的字节产物」——
 * 文件哈希计算器的 PDF 报告（手写 PDF 结构，无依赖）走这里，JSON 报告也走这里。
 */
export function downloadBlobFile(filename: string, blob: Blob) {
  triggerDownload(blob, filename);
}

function escapeCsvCell(cell: string): string {
  if (/[",\n\r]/.test(cell)) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

/**
 * 导出为 CSV（带 UTF-8 BOM，Excel 正确识别中文）。
 * @param rows 二维数组，每个内层数组是一行；列用逗号分隔。
 * @param withBom 默认 true，保证 Excel 不乱码；与老系统对接时可关。
 */
export function downloadCsvFile(filename: string, rows: string[][], withBom = true) {
  const body = rows
    .map((row) => row.map((cell) => escapeCsvCell(String(cell ?? ''))).join(','))
    .join('\r\n');
  const csv = withBom ? `﻿${body}` : body;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename);
}
