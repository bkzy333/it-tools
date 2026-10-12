/** JSON ↔ HTML 表格互转服务层。
 *  行为对齐 tabletool.cn 的 json2html / html2json（宽松增强版）：
 *  - JSON→HTML：对象数组（或单个对象） → 带 thead/tbody 的 <table>，键为表头；
 *    嵌套对象/数组转 JSON 字符串，null/undefined → 空串，HTML 特殊字符转义（防 XSS）。
 *  - HTML→JSON：首个 <table> → 对象数组；自动识别 thead / 首行表头、无表头用 column_1…；
 *    纯数字（含小数/负号）智能识别为 number，其余字符串；解码实体保证与 JSON→HTML 往返一致。
 */

const INDENT = '    ';

// ---------------------------------------------------------------- 转义 / 解码
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 实体解码：&amp; 必须最后解码，避免 &amp;lt; 被二次解码成 <
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&');
}

// ---------------------------------------------------------------- 单元格
function serializeCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNumberLike(s: string): boolean {
  return /^[-+]?\d+(\.\d+)?$/.test(s);
}

// ---------------------------------------------------------------- JSON → HTML
export function jsonToHtml({
  data,
  pretty = true,
}: {
  data: unknown;
  pretty?: boolean;
}): string {
  const array = Array.isArray(data) ? data : [data];
  const rows = array.filter(isPlainObject) as Record<string, unknown>[];

  if (rows.length === 0) {
    return pretty
      ? '<table>\n    <thead>\n        <tr></tr>\n    </thead>\n    <tbody></tbody>\n</table>'
      : '<table><thead><tr></tr></thead><tbody></tbody></table>';
  }

  // 表头：按首次出现顺序去重
  const headers: string[] = [];
  rows.forEach((row) => {
    Object.keys(row).forEach((k) => {
      if (!headers.includes(k)) {
        headers.push(k);
      }
    });
  });

  if (!pretty) {
    const thead =
      '<tr>' + headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('') + '</tr>';
    const tbody = rows
      .map(
        (row) =>
          '<tr>' +
          headers.map((h) => `<td>${escapeHtml(serializeCell(row[h]))}</td>`).join('') +
          '</tr>',
      )
      .join('');
    return `<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
  }

  const lines = [
    '<table>',
    `${INDENT}<thead>`,
    `${INDENT}${INDENT}<tr>`,
    ...headers.map((h) => `${INDENT}${INDENT}${INDENT}<th>${escapeHtml(h)}</th>`),
    `${INDENT}${INDENT}</tr>`,
    `${INDENT}</thead>`,
    `${INDENT}<tbody>`,
  ];
  rows.forEach((row) => {
    lines.push(`${INDENT}${INDENT}<tr>`);
    headers.forEach((h) => {
      lines.push(`${INDENT}${INDENT}${INDENT}<td>${escapeHtml(serializeCell(row[h]))}</td>`);
    });
    lines.push(`${INDENT}${INDENT}</tr>`);
  });
  lines.push(`${INDENT}</tbody>`, '</table>');
  return lines.join('\n');
}

// ---------------------------------------------------------------- HTML → JSON
interface Cell {
  tag: 'th' | 'td';
  text: string;
}

function parseRowCells(rowInner: string): Cell[] {
  const cells: Cell[] = [];
  const cellRe = /<t(h|d)(?:\s[^>]*)?>([\s\S]*?)<\/t\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = cellRe.exec(rowInner)) !== null) {
    const raw = m[2].replace(/<[^>]+>/g, '');
    cells.push({ tag: m[1].toLowerCase() === 'h' ? 'th' : 'td', text: decodeEntities(raw).replace(/\s+/g, ' ').trim() });
  }
  return cells;
}

function extractRowInners(tableHtml: string): string[] {
  const inners: string[] = [];
  const rowRe = /<tr(?:\s[^>]*)?>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(tableHtml)) !== null) {
    inners.push(m[1]);
  }
  return inners;
}

export function htmlToJson({
  html,
  detectTypes = true,
}: {
  html: string;
  detectTypes?: boolean;
}): Record<string, unknown>[] {
  const tableMatch = html.match(/<table[\s\S]*?<\/table>/i);
  if (!tableMatch) {
    return [];
  }
  const tableHtml = tableMatch[0];
  const rowInners = extractRowInners(tableHtml);
  if (rowInners.length === 0) {
    return [];
  }

  const hasThead = /<thead/i.test(tableHtml);
  const firstCells = parseRowCells(rowInners[0]);

  let headerTexts: string[];
  let dataInners: string[];

  if (hasThead || firstCells.length > 0 && firstCells.every((c) => c.tag === 'th')) {
    // 有 thead，或首行全是 <th>：首行作表头
    headerTexts = firstCells.map((c) => c.text);
    dataInners = rowInners.slice(1);
  } else {
    // 无表头（首行全是 <td>）：自动生成 column_1…
    const maxCols = Math.max(...rowInners.map((r) => parseRowCells(r).length), 0);
    headerTexts = Array.from({ length: maxCols }, (_, i) => `column_${i + 1}`);
    dataInners = rowInners;
  }

  const result = dataInners.map((inner) => {
    const cells = parseRowCells(inner);
    const obj: Record<string, unknown> = {};
    headerTexts.forEach((key, i) => {
      const raw = cells[i]?.text ?? '';
      obj[key] = detectTypes && isNumberLike(raw) ? Number(raw) : raw;
    });
    return obj;
  });

  return result;
}

/** HTML→JSON：按 pretty 选项序列化（与 jsonToHtml 对称，供 UI 直接调用）。 */
export function htmlToJsonString({
  html,
  detectTypes = true,
  pretty = true,
}: {
  html: string;
  detectTypes?: boolean;
  pretty?: boolean;
}): string {
  const arr = htmlToJson({ html, detectTypes });
  return pretty ? JSON.stringify(arr, null, 2) : JSON.stringify(arr);
}
