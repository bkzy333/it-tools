/**
 * 表格转换服务：把多种输入解析成二维字符串网格，提供网格清洗/变换操作，
 * 再把网格导出成 JSON / CSV / Markdown / HTML / TSV。
 * （Excel 由共享模块 xlsx-writer/xlsx-export.ts 负责，保持本文件纯文本、易单测。）
 *
 * 设计要点：
 * - 网格统一是 string[][]，所有操作返回新数组（不原地改，便于 Vue 响应式替换）。
 * - 解析优先识别 JSON，其次 Markdown 表格，其次 TSV（Excel 粘贴），最后 CSV。
 * - 数字单元格在 xlsx 里才被判为数值；文本格式一律保留字符串，避免精度丢失。
 */

export type GridOp =
  | 'remove-empty-rows'
  | 'remove-empty-cols'
  | 'trim'
  | 'upper'
  | 'lower'
  | 'transpose';

export type OutFormat = 'json' | 'csv' | 'markdown' | 'html' | 'tsv';

function isEmptyCell(s: string): boolean {
  return s.trim() === '';
}

/** 把任意行补齐到指定宽度（短行补空串），保证网格是矩形的 */
export function normalizeGrid(grid: string[][], width?: number): string[][] {
  const w = width ?? grid.reduce((m, r) => Math.max(m, r.length), 0);
  return grid.map((r) => Array.from({ length: w }, (_, i) => (r[i] ?? '').toString()));
}

/* ----------------------------------------------------------- 解析：多种输入 → 网格 */

function jsonToGrid(data: unknown): string[][] {
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return [];
    }
    // 数组的数组
    if (Array.isArray(data[0])) {
      return data.map((row) => (row as unknown[]).map((c) => (c == null ? '' : String(c))));
    }
    // 对象数组 → 用所有 key 的并集当表头
    if (typeof data[0] === 'object' && data[0] !== null) {
      const headers = new Set<string>();
      (data as Record<string, unknown>[]).forEach((o) => Object.keys(o).forEach((k) => headers.add(k)));
      const h = Array.from(headers);
      const rows = (data as Record<string, unknown>[]).map((o) =>
        h.map((k) => (o[k] == null ? '' : String(o[k]))),
      );
      return normalizeGrid([h, ...rows]);
    }
    // 基础类型数组 → 一行
    return normalizeGrid([data.map((c) => (c == null ? '' : String(c)))]);
  }
  if (typeof data === 'object' && data !== null) {
    const entries = Object.entries(data as Record<string, unknown>);
    return normalizeGrid([
      ['key', 'value'],
      ...entries.map(([k, v]) => [k, v == null ? '' : String(v)]),
    ]);
  }
  return [[String(data)]];
}

function parseMarkdownTable(text: string): string[][] {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|') || (l.includes('|') && l.length > 0));

  const rows = lines.map((l) => {
    let s = l;
    if (s.startsWith('|')) {
      s = s.slice(1);
    }
    if (s.endsWith('|')) {
      s = s.slice(0, -1);
    }
    return s.split('|').map((c) => c.trim());
  });

  // 去掉分隔行（形如 |---|---| 或 |:--:|:--:|）
  const filtered = rows.filter((cells, i) => {
    if (i === 1 && cells.every((c) => /^:?-+:?$/.test(c))) {
      return false;
    }
    return true;
  });

  return normalizeGrid(filtered);
}

/** 极简 CSV 解析：支持引号包裹、字段内双引号转义、逗号分隔 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // 丢弃「只有单个空字段」的空行（CSV 行尾换行留下的）
  return normalizeGrid(rows.filter((r) => !(r.length === 1 && r[0] === '')));
}

export function parseToGrid(input: string): string[][] {
  const text = input.replace(/\r\n/g, '\n').trim();
  if (!text) {
    return [];
  }

  // 1) JSON
  if (text.startsWith('[') || text.startsWith('{')) {
    try {
      return jsonToGrid(JSON.parse(text));
    } catch {
      // 不是合法 JSON，继续走文本解析
    }
  }

  // 2) Markdown 表格
  if (/\|/.test(text) && /\n/.test(text) && /^\s*\|/.test(text)) {
    return parseMarkdownTable(text);
  }

  // 3) TSV（Excel 复制过来是 tab 分隔）
  if (text.includes('\t')) {
    return normalizeGrid(text.split('\n').map((line) => line.split('\t')));
  }

  // 4) CSV
  return parseCsv(text);
}

/* ----------------------------------------------------------- 网格操作 */

export function applyOp(grid: string[][], op: GridOp): string[][] {
  switch (op) {
    case 'remove-empty-rows':
      return grid.filter((r) => r.some((c) => !isEmptyCell(c)));

    case 'remove-empty-cols': {
      if (grid.length === 0) {
        return grid;
      }
      const width = grid.reduce((m, r) => Math.max(m, r.length), 0);
      const keep: number[] = [];
      for (let c = 0; c < width; c++) {
        if (grid.some((r) => !isEmptyCell(r[c] ?? ''))) {
          keep.push(c);
        }
      }
      return grid.map((r) => keep.map((c) => r[c] ?? ''));
    }

    case 'trim':
      return grid.map((r) => r.map((c) => c.trim()));

    case 'upper':
      return grid.map((r) => r.map((c) => c.toUpperCase()));

    case 'lower':
      return grid.map((r) => r.map((c) => c.toLowerCase()));

    case 'transpose': {
      if (grid.length === 0) {
        return [];
      }
      const width = grid.reduce((m, r) => Math.max(m, r.length), 0);
      const out: string[][] = [];
      for (let c = 0; c < width; c++) {
        const nr: string[] = [];
        for (let r = 0; r < grid.length; r++) {
          nr.push(grid[r][c] ?? '');
        }
        out.push(nr);
      }
      return out;
    }
  }
}

/** 把一块解析结果从 (startRow,startCol) 起覆盖写回基准网格，按需扩展尺寸 */
export function mergeIntoGrid(base: string[][], patch: string[][], startRow: number, startCol: number): string[][] {
  if (patch.length === 0) {
    return normalizeGrid(base);
  }
  const baseWidth = base.reduce((m, r) => Math.max(m, r.length), 0);
  const patchWidth = patch.reduce((m, r) => Math.max(m, r.length), 0);
  const width = Math.max(baseWidth, startCol + patchWidth);
  const height = Math.max(base.length, startRow + patch.length);

  const out: string[][] = [];
  for (let r = 0; r < height; r++) {
    const row: string[] = [];
    for (let c = 0; c < width; c++) {
      if (r >= startRow && r < startRow + patch.length && c >= startCol && c < startCol + patchWidth) {
        const pr = patch[r - startRow];
        row.push(pr?.[c - startCol] ?? '');
      } else {
        row.push(base[r]?.[c] ?? '');
      }
    }
    out.push(row);
  }
  return out;
}

/* ----------------------------------------------------------- 网格 → 文本格式 */

export function gridToJson(grid: string[][], hasHeader: boolean): string {
  if (grid.length === 0) {
    return '[]';
  }
  if (hasHeader) {
    const [header, ...rest] = grid;
    const objs = rest.map((row) => {
      const o: Record<string, string> = {};
      (header ?? []).forEach((h, i) => {
        o[h] = row[i] ?? '';
      });
      return o;
    });
    return JSON.stringify(objs, null, 2);
  }
  return JSON.stringify(grid, null, 2);
}

function csvEscape(s: string): string {
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function gridToCsv(grid: string[][]): string {
  return grid.map((row) => row.map((c) => csvEscape(c ?? '')).join(',')).join('\n');
}

export function gridToTsv(grid: string[][]): string {
  return grid.map((row) => row.map((c) => (c ?? '').replace(/\t/g, ' ')).join('\t')).join('\n');
}

export function gridToMarkdown(grid: string[][]): string {
  if (grid.length === 0) {
    return '';
  }
  const esc = (s: string) => (s ?? '').replace(/\|/g, '\\|');
  const header = grid[0] ?? [];
  const lines: string[] = [];
  lines.push(`| ${header.map(esc).join(' | ')} |`);
  lines.push(`| ${header.map(() => '---').join(' | ')} |`);
  for (let i = 1; i < grid.length; i++) {
    lines.push(`| ${grid[i].map(esc).join(' | ')} |`);
  }
  return lines.join('\n');
}

function htmlEscape(s: string): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function gridToHtml(grid: string[][]): string {
  if (grid.length === 0) {
    return '';
  }
  const esc = htmlEscape;
  let html = '<table>\n';
  html += '  <thead>\n    <tr>';
  html += (grid[0] ?? []).map((c) => `<th>${esc(c)}</th>`).join('');
  html += '</tr>\n  </thead>\n';
  html += '  <tbody>\n';
  for (let i = 1; i < grid.length; i++) {
    html += '    <tr>';
    html += grid[i].map((c) => `<td>${esc(c)}</td>`).join('');
    html += '</tr>\n';
  }
  html += '  </tbody>\n</table>';
  return html;
}

export function gridToText(grid: string[][], format: OutFormat): string {
  switch (format) {
    case 'json':
      return gridToJson(grid, true);
    case 'csv':
      return gridToCsv(grid);
    case 'tsv':
      return gridToTsv(grid);
    case 'markdown':
      return gridToMarkdown(grid);
    case 'html':
      return gridToHtml(grid);
  }
}
