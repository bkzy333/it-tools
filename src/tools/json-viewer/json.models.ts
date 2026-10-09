import { type MaybeRef, get } from '@vueuse/core';
import { jsonrepair } from 'jsonrepair';
import '@/utils/json5-bignum';

export { sortObjectKeys, formatJson };

function sortObjectKeys<T>(obj: T): T {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys) as unknown as T;
  }

  return Object.keys(obj)
    .sort((a, b) => a.localeCompare(b))
    .reduce(
      (sortedObj, key) => {
        sortedObj[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
        return sortedObj;
      },
      Object.create(obj, {}) as Record<string, unknown>,
    ) as T;
}

function unescapeUnicodeJSON(str: string) {
  return str.replace(/\\u([\dA-Fa-f]{4})/g, (match, grp) => String.fromCharCode(Number.parseInt(grp, 16)));
}

/**
 * Unicode 转中文：把文本中的 `\uXXXX` / `\uXXXX\uXXXX`（代理对）转成实际字符。
 * 行为规格来自 toolhelper.cn（`ys.unescape`，标准 JS 转义还原）：
 * - `\u9524\u5b50` → `锤子`
 * - 代理对 `\uD83D\uDE00` → `😀`（emoji）
 * - 非 `\u` 序列原样保留；反斜杠转义 `\\uXXXX`（字面量）不会被误转。
 */
export function unicodeToChinese(str: string): string {
  return str.replace(/\\u([\dA-Fa-f]{4})/g, (match, grp) => String.fromCharCode(Number.parseInt(grp, 16)));
}

/**
 * 中文转 Unicode：把字符串中的非 ASCII 字符转成 `\uXXXX` 形式。
 * 行为规格来自 toolhelper.cn（`ys.escape`）：
 * - BMP 字符 → `\uXXXX`（小写十六进制）
 * - 代理对（emoji 等）→ 拆成两个 `\uXXXX`（如 `😀` → `\ud83d\ude00`）
 * - ASCII（含数字、字母、常用标点）原样保留
 */
export function chineseToUnicode(str: string): string {
  return str.replace(/[^\x00-\x7F]/g, (ch) => {
    const code = ch.codePointAt(0)!;
    if (code > 0xffff) {
      // 代理对拆成两个 \uXXXX
      const high = Math.floor((code - 0x10000) / 0x400) + 0xd800;
      const low = ((code - 0x10000) % 0x400) + 0xdc00;
      return `\\u${high.toString(16)}\\u${low.toString(16)}`;
    }
    return `\\u${code.toString(16).padStart(4, '0')}`;
  });
}

function unescapeJson(jsonString: string): string {
  try {
    // First, try to handle double-escaped scenarios
    let result = jsonString.trim();

    // If the string starts and ends with quotes, and contains escaped quotes inside,
    // it might be a JSON string that needs to be unescaped
    if ((result.startsWith('"') && result.endsWith('"')) || (result.startsWith("'") && result.endsWith("'"))) {
      // Remove outer quotes first
      result = result.slice(1, -1);
    }

    // Handle common escape sequences
    result = result
      .replace(/\\"/g, '"') // Unescape quotes
      .replace(/\\\\/g, '\\') // Unescape backslashes (do this after quotes!)
      .replace(/\\n/g, '\n') // Unescape newlines
      .replace(/\\r/g, '\r') // Unescape carriage returns
      .replace(/\\t/g, '\t') // Unescape tabs
      .replace(/\\f/g, '\f') // Unescape form feeds
      .replace(/\\b/g, '\b') // Unescape backspaces
      .replace(/\\\//g, '/'); // Unescape forward slashes

    return result;
  } catch {
    return jsonString;
  }
}

function formatJson({
  rawJson,
  sortKeys = true,
  indentSize = 3,
  unescapeUnicode = false,
  unescapeJsonString = false,
  repairJson = false,
}: {
  rawJson: MaybeRef<string>;
  sortKeys?: MaybeRef<boolean>;
  indentSize?: MaybeRef<number>;
  unescapeUnicode?: MaybeRef<boolean>;
  unescapeJsonString?: MaybeRef<boolean>;
  repairJson?: MaybeRef<boolean>;
}) {
  let unwrappedJson = get(rawJson)?.trim();
  if (get(unescapeJsonString)) {
    unwrappedJson = unescapeJson(unwrappedJson);
  }
  const jsonString = get(repairJson) ? jsonrepair(unwrappedJson) : unwrappedJson;
  const parsedObject = JSON.parseBigNum(get(unescapeUnicode) ? unescapeUnicodeJSON(jsonString) : jsonString);

  return JSON.stringify(get(sortKeys) ? sortObjectKeys(parsedObject) : parsedObject, null, get(indentSize));
}
