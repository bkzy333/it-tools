import { isNullOrEmpty, resolveDelimiter, textArraySort } from '@/utils/text-delimiters';

/**
 * 「文本去重排序 / 行重复统计」的纯逻辑层（同一个工具的两个 Tab）。
 *
 * 实现依据：参考站 toolhelper.cn 的
 *   - /js/page/text/duplicate-remove.min.js 的 `duplicateRemove`
 *   - /js/page/text/duplicate-count.min.js 的 `duplicateCount` / `addOrUpdateArr` / `arrSort`
 * 两边共用「输入分隔符 + 去除行首尾空格」这两套参数，所以本站合成一个工具两个 Tab。
 *
 * 三处**反直觉但必须照做**的参考站口径（单测已锁死）：
 *
 * 1. 去空行判定用 `trim()===''`，即纯空白行也算空行（参考站这里用的是 `ys.trim(r)`）。
 * 2. 去重关闭（`removeRepeat === false`）时，参考站会在收集完唯一项之后
 *    **再无条件 push 一遍当前行**，导致重复行反而留在结果里；
 *    重复行数统计仍按 `总行数 − 唯一行数 − 空行数` 算。
 *    这是原行为，不是漏写，别"顺手修"。
 * 3. 统计里的「重复行数」= 总行数 − 非空唯一行数 − 空行数。
 *    turn 开/关去重时这个数字的含义会变（关掉时它是"理论上被去重会去掉的行数"）。
 */

export type DedupeOrder = 'none' | 'asc' | 'desc';
export type DuplicateCountOrder = 'none' | 'count-desc' | 'count-asc';
export type DedupeTab = 'dedupe' | 'count';

export interface DedupeBaseOptions {
  input: string;
  inputDelimiterKey: string;
  inputDelimiterCustom: string;
  removeFirstLastSpace: boolean;
  removeEmptyLine: boolean;
}

export interface DedupeModeOptions extends DedupeBaseOptions {
  tab: 'dedupe';
  orderBy: DedupeOrder;
  removeRepeat: boolean;
  showLineNumber: boolean;
}

export interface CountModeOptions extends DedupeBaseOptions {
  tab: 'count';
  orderBy: DuplicateCountOrder;
}

export type TextDedupeOptions = DedupeModeOptions | CountModeOptions;

export interface DedupeStats {
  /** 总行数（按输入分隔符切出来的段数） */
  total: number;
  /** 重复行数 = 总行数 − 非空唯一行数 − 空行数 */
  duplicate: number;
  /** 空行数 */
  empty: number;
}

export interface DedupeCountItem {
  key: string;
  count: number;
}

export interface TextDedupeResult {
  output: string;
  stats: DedupeStats;
  /** 统计 Tab 用的明细（去重 Tab 为空数组） */
  items: DedupeCountItem[];
}

/** 参考站 `addOrUpdateArr`：命中已有键则计数 +1 并返回 false，否则新建并返回 true。 */
export function addOrUpdateCount(items: DedupeCountItem[], key: string): boolean {
  const found = items.find((item) => item.key === key);
  if (found === undefined) {
    items.push({ key, count: 1 });
    return true;
  }
  found.count += 1;
  return false;
}

export function runTextDedupe(options: TextDedupeOptions): TextDedupeResult {
  if (isNullOrEmpty(options.input)) {
    return {
      output: '',
      stats: { total: 0, duplicate: 0, empty: 0 },
      items: [],
    };
  }

  const delimiter = resolveDelimiter(options.inputDelimiterKey, options.inputDelimiterCustom);
  const segments = options.input.split(delimiter);

  const items: string[] = [];
  const counts: DedupeCountItem[] = [];
  let total = 0;
  let empty = 0;
  let unique = 0;

  for (const rawSegment of segments) {
    total += 1;
    let segment = rawSegment;
    if (options.removeFirstLastSpace) {
      segment = segment.replace(/^\s+/, '').replace(/\s+$/, '');
    }

    if (options.removeEmptyLine && segment.trim() === '') {
      empty += 1;
      continue;
    }

    if (segment !== '') {
      if (items.indexOf(segment) === -1) {
        unique += 1;
        if (options.tab === 'dedupe' && options.removeRepeat) {
          items.push(segment);
        }
      }
    } else {
      empty += 1;
    }

    // 参考站原行为：去重关闭时再把当前行无条件塞回去（此时 items 里已经是全部非空行）
    if (options.tab === 'dedupe' && !options.removeRepeat) {
      items.push(segment);
    }
  }

  const stats: DedupeStats = {
    total,
    duplicate: Math.max(0, total - unique - empty),
    empty,
  };

  if (options.tab === 'count') {
    // 参考站 duplicateCount 会把 trim 后的空段也记进计数表（key 为 ''）
    for (const rawSegment of segments) {
      let segment = rawSegment;
      if (options.removeFirstLastSpace) {
        segment = segment.replace(/^\s+/, '').replace(/\s+$/, '');
      }
      addOrUpdateCount(counts, segment.trim());
    }
    // sortCountItems 返回的是新数组，必须赋回 counts；直接丢弃返回值的话
    // 「按出现次数排序」会静默失效（2026-10-07 单测抓出来的真 bug）。
    counts.splice(0, counts.length, ...sortCountItems(counts, options.orderBy));

    // 统计 Tab 的「总/重复/空行」与去重 Tab 用同一套口径，也是参考站 duplicateCount 的
    // `h = e - c - o`（总行数 − 不同行数 − 空行数）。别为了"看起来更合理"改成按 count>1 反推。
    const blank = counts.find((item) => item.key === '')?.count ?? 0;
    const distinct = counts.filter((item) => item.key !== '').length;

    return {
      output: counts
        .map((item) => `${item.key}    出现次数：${item.count} 次`)
        .join('\n'),
      stats: {
        total,
        duplicate: Math.max(0, total - distinct - blank),
        empty: blank,
      },
      items: counts,
    };
  }

  // 去重 Tab
  let lines = textArraySort(items, orderToLegacy(options.orderBy));
  if (options.showLineNumber) {
    lines = lines.map((line, index) => `${index + 1}：${line}`);
  }

  return { output: lines.join('\n'), stats, items: [] };
}

/** 导出 CSV（统计 Tab 专用）：表头「文本,出现次数」，行内容是 key,count。 */
export function toStatisticsCsv(items: DedupeCountItem[]): string {
  const lines = ['文本,出现次数'];
  for (const item of items) {
    lines.push(`${item.key},${item.count}`);
  }
  return lines.join('\n');
}

/** 参考站 `arrSort`：'2' 按次数降序，'3' 按次数升序，其余原样。 */
export function sortCountItems(items: DedupeCountItem[], orderBy: DuplicateCountOrder): DedupeCountItem[] {
  const sorted = [...items];
  if (orderBy === 'count-desc') {
    sorted.sort((a, b) => b.count - a.count);
  } else if (orderBy === 'count-asc') {
    sorted.sort((a, b) => a.count - b.count);
  }
  return sorted;
}

function orderToLegacy(order: DedupeOrder): string {
  if (order === 'asc') return '2';
  if (order === 'desc') return '3';
  return '1';
}
