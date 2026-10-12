import { flatten } from 'flatten-anything';

export { getHeaders, convertArrayToCsv };

/** 嵌套结构处理策略，对齐 lddgo 的「不展开 / 展开对象 / 展开数组 / 展开对象和数组」 */
export type NestedMode = 'none' | 'objects' | 'arrays' | 'all';

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
    // 不展开数组：整段序列化为 JSON 文本
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
    // 不展开对象：整段序列化为 JSON 文本
    return { [prefix]: JSON.stringify(value) };
  }

  return { [prefix]: value };
}

/** 按嵌套模式把一条记录拍平成「键 → 标量」的扁平对象 */
function flattenItem(item: Record<string, unknown>, mode: NestedMode): Record<string, unknown> {
  // 'all' 沿用 flatten-anything，保证与历史单测口径完全一致
  if (mode === 'all') {
    return flatten(item) as Record<string, unknown>;
  }
  return customFlatten(item, mode);
}

function getHeaders({ array }: { array: Record<string, unknown>[] }): string[] {
  const headers = new Set<string>();

  array.forEach((item) =>
    Object.keys(flatten(item) as Record<string, unknown>).forEach((key) => headers.add(key)),
  );

  return Array.from(headers);
}

function serializeValue(value: unknown, trim: boolean): string {
  if (value === null) {
    return 'null';
  }

  if (value === undefined) {
    return '';
  }

  // 数组 / 嵌套对象这类非标量不能直接 String()，否则整格变成 "[object Object]"。
  // 非 'all' 模式下嵌套值已被 customFlatten 序列化为 JSON 文本，这里兜底再兜一层。
  let raw = typeof value === 'object' ? (JSON.stringify(value) ?? '') : String(value);

  if (trim) {
    raw = raw.trim();
  }

  const valueAsString = raw
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/"/g, '\\"');

  if (valueAsString.includes(',')) {
    return `"${valueAsString}"`;
  }

  return valueAsString;
}

function convertArrayToCsv({
  arrayOrObject,
  nested = 'all',
  trim = false,
  skipEmptyRows = false,
  columns,
}: {
  arrayOrObject: Record<string, unknown>[] | Record<string, unknown>;
  nested?: NestedMode;
  trim?: boolean;
  skipEmptyRows?: boolean;
  columns?: string[];
}): string {
  const array = !Array.isArray(arrayOrObject) ? [arrayOrObject] : arrayOrObject;

  const flatRows = array.map((item) => flattenItem(item, nested));

  const allHeaders = getHeaders({ array: flatRows });

  // 列选择：保留用户在多选框里勾选的列（按勾选顺序），未勾选则全部保留
  const headers =
    columns && columns.length > 0 ? columns.filter((h) => allHeaders.includes(h)) : allHeaders;

  const rows = flatRows.map((item) => headers.map((header) => serializeValue(item[header], trim)));

  const keptRows = skipEmptyRows ? rows.filter((row) => row.some((cell) => cell !== '')) : rows;

  return [headers.join(','), ...keptRows].join('\n');
}

/** 返回按当前嵌套模式拍平后的全部表头（用于列选择控件） */
export function getTableHeaders(
  arrayOrObject: Record<string, unknown>[] | Record<string, unknown>,
  nested: NestedMode = 'all',
): string[] {
  const array = !Array.isArray(arrayOrObject) ? [arrayOrObject] : arrayOrObject;
  return getHeaders({ array: array.map((item) => flattenItem(item, nested)) });
}
