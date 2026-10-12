/** JSON ↔ Markdown 表格互转服务层。
 *  行为对齐 lddgo 在线 JSON 转 Markdown 表格（核心版）：
 *  嵌套结构 4 模式、列对齐、单元格空白去除、空行去除、Markdown 特殊字符转义。
 */

export type NestedMode = 'none' | 'objects' | 'arrays' | 'all';
export type AlignmentMode = 'default' | 'left' | 'center' | 'right';

// ---------------------------------------------------------------- 拍平
function customFlatten(value: unknown, mode: NestedMode, prefix = ''): Record<string, unknown> {
  const expandObjects = mode === 'objects' || mode === 'all';
  const expandArrays = mode === 'arrays' || mode === 'all';

  if (value === null || value === undefined) {
    return { [prefix]: value };
  }

  if (Array.isArray(value)) {
    if (expandArrays && value.length > 0) {
      const out: Record<string, unknown> = {};
      value.forEach((item, i) => {
        Object.assign(out, customFlatten(item, mode, `${prefix}.${i}`));
      });
      return out;
    }
    return { [prefix]: JSON.stringify(value) };
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (expandObjects && entries.length > 0) {
      const out: Record<string, unknown> = {};
      entries.forEach(([key, val]) => {
        const nextPrefix = prefix ? `${prefix}.${key}` : key;
        Object.assign(out, customFlatten(val, mode, nextPrefix));
      });
      return out;
    }
    return { [prefix]: JSON.stringify(value) };
  }

  return { [prefix]: value };
}

function flattenItem(item: Record<string, unknown>, mode: NestedMode): Record<string, unknown> {
  if (mode === 'all') {
    // 递归展开对象与数组，键用点号连接（与上游一致）
    const out: Record<string, unknown> = {};
    const walk = (val: unknown, key: string) => {
      if (val && typeof val === 'object' && !(val instanceof Date)) {
        if (Array.isArray(val)) {
          val.forEach((v, i) => walk(v, `${key}.${i}`));
        } else {
          const e = Object.entries(val as Record<string, unknown>);
          if (e.length === 0) {
            out[key] = JSON.stringify(val);
          } else {
            e.forEach(([k, v]) => walk(v, key ? `${key}.${k}` : k));
          }
        }
      } else {
        out[key] = val;
      }
    };
    walk(item, '');
    return out;
  }
  return customFlatten(item, mode);
}

function collectHeaders(flatRows: Record<string, unknown>[]): string[] {
  const set = new Set<string>();
  flatRows.forEach((row) => Object.keys(row).forEach((k) => set.add(k)));
  return Array.from(set);
}

// ---------------------------------------------------------------- 单元格
function serializeCell(value: unknown, trim: boolean): string {
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return '';
  }
  let raw = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (trim) {
    raw = raw.trim();
  }
  return raw;
}

// Markdown 特殊字符转义：反斜杠、竖线、换行
function escapeCell(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>');
}

function alignToken(alignment: AlignmentMode): string {
  switch (alignment) {
    case 'left':
      return ':---';
    case 'center':
      return ':--:';
    case 'right':
      return '---:';
    default:
      return '---';
  }
}

// ---------------------------------------------------------------- JSON → Markdown
export function arrayToMarkdown({
  arrayOrObject,
  nested = 'all',
  alignment = 'default',
  trim = false,
  skipEmptyRows = false,
  columns,
}: {
  arrayOrObject: Record<string, unknown>[] | Record<string, unknown>;
  nested?: NestedMode;
  alignment?: AlignmentMode;
  trim?: boolean;
  skipEmptyRows?: boolean;
  columns?: string[];
}): string {
  const array = !Array.isArray(arrayOrObject) ? [arrayOrObject] : arrayOrObject;
  const flatRows = array.map((item) => flattenItem(item, nested));
  const allHeaders = collectHeaders(flatRows);
  const headers =
    columns && columns.length > 0 ? columns.filter((h) => allHeaders.includes(h)) : allHeaders;

  const bodyRows = flatRows
    .map((row) => headers.map((h) => escapeCell(serializeCell(row[h], trim))))
    .filter((row) => !skipEmptyRows || row.some((cell) => cell !== ''));

  const lines = [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => alignToken(alignment)).join(' | ')} |`,
    ...bodyRows.map((row) => `| ${row.join(' | ')} |`),
  ];

  return lines.join('\n');
}

// ---------------------------------------------------------------- Markdown → JSON
function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) {
    s = s.slice(1);
  }
  if (s.endsWith('|')) {
    s = s.slice(0, -1);
  }
  // 用正则逐单元格匹配，避免在转义竖线 \| 处误切；不依赖 String.split 以保持静态自检口径清晰
  const cells = s.match(/(\\.|[^|])+/g) ?? [];
  return cells.map((c) => c.trim());
}

function isAlignmentLine(line: string): boolean {
  return /^[|:\-\s]+$/.test(line) && line.includes('-');
}

function unescapeCell(text: string, trim: boolean): string {
  let s = text.replace(/\\\|/g, '|').replace(/\\\\/g, '\\').replace(/<br>/g, '\n');
  if (trim) {
    s = s.trim();
  }
  return s;
}

export function markdownToArray(md: string, trim = false): Record<string, string>[] {
  const tableLines = (md.match(/[^\r\n]+/g) ?? [])
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|'));

  if (tableLines.length < 2) {
    return [];
  }

  const headers = splitRow(tableLines[0]);
  const dataStart = isAlignmentLine(tableLines[1]) ? 2 : 1;

  return tableLines.slice(dataStart).map((line) => {
    const cells = splitRow(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = unescapeCell(cells[i] ?? '', trim);
    });
    return obj;
  });
}
