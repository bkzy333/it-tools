/**
 * 表格工具共用的文本解析。
 *
 * 三个表格工具（table-lookup / table-pivot）都用同一套输入习惯：
 * 从 Excel 复制过来是 tab 分隔，CSV 是逗号，所以统一允许指定分隔符。
 *
 * 这里只放纯函数，不依赖任何 Vue / naive 组件，方便单测。
 */

/** 把多行文本按分隔符切成二维数组。空行丢弃，行内不足的列补空串（保证每行长度一致） */
export function parseTableText(text: string, delimiter = '\t'): string[][] {
  const d = delimiter || '\t';
  const raw = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  const rows = raw.map((line) => line.split(d));
  if (rows.length === 0) return [];
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
  return rows.map((r) => Array.from({ length: width }, (_, i) => (r[i] ?? '').trim()));
}

/** 二维数组拼回文本（默认 tab，粘回 Excel 直接可用） */
export function tableToText(rows: readonly (readonly string[])[], delimiter = '\t'): string {
  return rows.map((r) => r.join(delimiter)).join('\n');
}

/**
 * 给表头去重：两张表合并时同名列很常见（左表「城市」+ 右表「城市」），
 * 名字撞在一起的话 c-table 渲染出来是两列一样的内容，看不出数据到底在哪列。
 */
export function uniqueHeaderNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  return names.map((raw, i) => {
    const base = String(raw ?? '').trim() || `列${i + 1}`;
    if (!seen.has(base)) {
      seen.add(base);
      return base;
    }
    let suffix = 2;
    let candidate = `${base}·${suffix}`;
    while (seen.has(candidate)) {
      suffix++;
      candidate = `${base}·${suffix}`;
    }
    seen.add(candidate);
    return candidate;
  });
}

/**
 * 二维数组 → c-table 需要的对象数组，按列下标一一对应。
 *
 * ⚠️ 列名必须显式传进来，不要用「第一行当表头」这种隐式约定：
 *   c-table 是按 headers 里的 key 去 data 里取值的，key 一旦推导错，
 *   渲染出来就是「表头对、格子全空」，静态看 HTML 完全看不出来。
 */
export function tableToObjects(rows: readonly (readonly string[])[], header: readonly string[]): Record<string, string>[] {
  if (rows.length === 0 || header.length === 0) return [];
  return rows.map((row) => {
    const obj: Record<string, string> = {};
    header.forEach((key, j) => {
      obj[key] = row[j] ?? '';
    });
    return obj;
  });
}
