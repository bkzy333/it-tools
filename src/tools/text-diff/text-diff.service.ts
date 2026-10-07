/**
 * 文本对比（/text-diff）的纯逻辑层。
 *
 * 这里只放「不依赖 monaco 实例」的算法，方便单测。
 * monaco 的 ILineChange 语义（见 node_modules/monaco-editor/esm/vs/editor/browser/widget/
 * diffEditor/diffEditorWidget.js 的 toLineChanges）：
 *
 *   - 纯插入：originalEndLineNumber === 0（原侧不存在对应行）
 *       行数 = modifiedEndLineNumber - modifiedStartLineNumber + 1
 *   - 纯删除：modifiedEndLineNumber === 0（改侧不存在对应行）
 *       行数 = originalEndLineNumber - originalStartLineNumber + 1
 *   - 修改：两侧都有对应行，两侧行数相等
 *
 * 注意 0 是被 monaco 当作「这一侧没有行」的哨兵值用的，不是行号；
 * 所以判断必须用「等于 0」，不能用「小于 1 之类的范围」。
 */

export interface DiffLineChange {
  /** 原侧起始行号；纯插入时为 insertion 位置 - 1 */
  originalStartLineNumber: number;
  /** 原侧结束行号；纯插入时为 0 */
  originalEndLineNumber: number;
  /** 改侧起始行号；纯删除时为删除位置 - 1 */
  modifiedStartLineNumber: number;
  /** 改侧结束行号；纯删除时为 0 */
  modifiedEndLineNumber: number;
}

export interface DiffSummary {
  /** 只在右（改后）出现的新增行数 */
  added: number;
  /** 只在左（原文）存在的删除行数 */
  removed: number;
  /** 两侧都存在但内容被改写的行数 */
  modified: number;
  /** 完全没动过的行数 */
  unchanged: number;
  /** 有差异的行数合计 = added + removed + modified */
  changed: number;
}

/**
 * 把 monaco 的行变更列表汇总成「新增 / 删除 / 修改 / 未变」四个数。
 *
 * @param changes monaco 的 getLineChanges() 返回值，没有差异时可能为 null
 * @param originalLineCount 原侧总行数，用于反推未变行数
 */
export function summarizeLineChanges(
  changes: DiffLineChange[] | null | undefined,
  originalLineCount = 0,
): DiffSummary {
  let added = 0;
  let removed = 0;
  let modified = 0;

  for (const change of changes ?? []) {
    // 纯插入：原侧哨兵为 0
    if (change.originalEndLineNumber === 0) {
      added += Math.max(1, change.modifiedEndLineNumber - change.modifiedStartLineNumber + 1);
      continue;
    }
    // 纯删除：改侧哨兵为 0
    if (change.modifiedEndLineNumber === 0) {
      removed += Math.max(1, change.originalEndLineNumber - change.originalStartLineNumber + 1);
      continue;
    }
    // 两侧都有 → 修改。**按原侧跨度算，不按改侧**：
    // 调试时抓过真实的 getLineChanges()，monaco 并不保证两侧跨度相等 ——
    // 「3 行注释被 1 行 add_header 取代」它会报
    // `original 6..8 / modified 6..6`，按改侧 end 算就只记 1 行，
    // 结果面板上「未变行数 = 原侧总行数 - 差异行数」对不上
    // （实测会显示出 8 行未变，其实只有 6 行没动）。
    // 原侧跨度才是「原文里有多少行被这次改动波及」。
    modified += Math.max(1, change.originalEndLineNumber - change.originalStartLineNumber + 1);
  }

  // 未变行数按「原侧」反推：删除行和改写行都不会留下原文
  const unchanged = Math.max(0, originalLineCount - removed - modified);

  return {
    added,
    removed,
    modified,
    unchanged,
    changed: added + removed + modified,
  };
}

/**
 * 数出一段文本的行数，口径与 monaco 的 getLineCount() 一致：
 * 行数 = EOL 个数 + 1，所以空串是 1 行、'a\n' 是 2 行（末尾空行）。
 * 差异统计里的「未变行数」是从原侧总行数反推的，口径必须跟 monaco 对齐，
 * 否则会出现「有差异行数 + 未变行数 ≠ 原侧行数」这种对不上的观感。
 */
export function countLines(value: string): number {
  if (value === '') {
    return 1;
  }
  let lines = 1;
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === '\n') {
      lines += 1;
    }
  }
  return lines;
}

/** 供导出用：把「改后」文本落成文件 */
export function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === '';
}
