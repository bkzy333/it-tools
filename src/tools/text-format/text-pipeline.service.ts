// 文本处理流水线 的纯逻辑层（对外身份：/text-format「文本处理」）。
//
// 2026-10-15 融合工程：本文件由 text-workflow.service.ts 升级而来，吸收五个工具的精华：
//   - text-workflow（自由编排底座，本文件前身）
//   - text-format（固定流水线：缩进 / A9 高级变换倒序·上下标·截取·插入）
//   - text-dedupe（行重复统计 Tab：计数口径 + CSV 导出）
//   - text-merge（按列合并 / TSV / 跳空值口径）
//   - text-split（首尾空段丢弃的拆分怪癖）
//   - list-converter（正则过滤 + 9 种排序，仅吸收能力、不并工具）
//
// 模型：一组「操作」，每个操作是 { type, params }，按数组顺序依次作用在文本上，
// 前一个的输出是后一个的输入。UI 分三层：一键预设（预配 op 序列）→ 高级编排（本文件）→
// 结果区（文本 / 重复统计两个 Tab）。
//
// 各处口径怪癖均为参考站原行为，单测已锁死，别顺手「优化」：
//   1. trim 认 `^\s+` / `\s+$`，不只半角空格（text-format 口径，粘贴代码去缩进更直觉）。
//   2. 替换走字面量（split/join），不走正则；from 含 `|` 时按多组逐一替换（text-format 口径）。
//   3. split 切出来的首尾空段丢弃、中间空段保留；找不到分隔符原样返回（text-split 口径）。
//   4. sort 默认 localeCompare 不传 locale（跟随宿主语言）；9 种模式复用 byOrder（list-converter 口径）。
//   5. indent 反缩进是 `line.replace(unit, '')` 只替第一个匹配、不限定行首（text-format 口径）。
//   6. 统计 Tab 的空行（trim 后为空串）也计入计数表，key 为 ''（text-dedupe 口径）。
import { byOrder, type SortOrder } from '@/utils/array';

export type PipelineOpType =
  // —— 行级（对行集合生效）——
  | 'trim'
  | 'remove-empty'
  | 'dedupe'
  | 'sort'
  | 'add-prefix'
  | 'add-suffix'
  | 'number'
  | 'wrap-quote'
  | 'indent'
  | 'filter'
  | 'split'
  | 'merge'
  // —— 文本级（对整段文本生效）——
  | 'case'
  | 'replace'
  | 'reverse'
  | 'script'
  | 'truncate'
  | 'insert';

export interface PipelineOp {
  id: string;
  type: PipelineOpType;
  params: Record<string, string>;
}

export interface PipelineOptions {
  input: string;
  ops: PipelineOp[];
}

/** op 分组（UI 的「添加操作」按钮按此分排）。label 是 i18n key 后缀。 */
export const PIPELINE_OP_GROUPS: { label: string; ops: PipelineOpType[] }[] = [
  {
    label: 'group-line',
    ops: ['trim', 'remove-empty', 'dedupe', 'sort', 'add-prefix', 'add-suffix', 'number', 'wrap-quote', 'indent', 'filter', 'split', 'merge'],
  },
  {
    label: 'group-text',
    ops: ['case', 'replace', 'reverse', 'script', 'truncate', 'insert'],
  },
];

/** 每个操作类型的参数定义（key → label i18n key 后缀），供 UI 渲染参数输入框。 */
export const OP_PARAM_KEYS: Record<PipelineOpType, { key: string; label: string }[]> = {
  trim: [],
  'remove-empty': [],
  dedupe: [],
  sort: [{ key: 'mode', label: 'mode' }],
  'add-prefix': [{ key: 'text', label: 'text' }],
  'add-suffix': [{ key: 'text', label: 'text' }],
  number: [
    { key: 'start', label: 'start' },
    { key: 'step', label: 'step' },
  ],
  'wrap-quote': [{ key: 'quote', label: 'quote' }],
  indent: [
    { key: 'mode', label: 'mode' },
    { key: 'method', label: 'method' },
    { key: 'count', label: 'count' },
  ],
  filter: [
    { key: 'pattern', label: 'pattern' },
    { key: 'invert', label: 'invert' },
  ],
  split: [{ key: 'delimiter', label: 'delimiter' }],
  merge: [
    { key: 'mode', label: 'mode' },
    { key: 'output', label: 'output' },
    { key: 'input', label: 'input' },
    { key: 'skipEmpty', label: 'skip-empty' },
    { key: 'allSpace', label: 'all-space' },
  ],
  case: [{ key: 'mode', label: 'mode' }],
  replace: [
    { key: 'from', label: 'from' },
    { key: 'to', label: 'to' },
  ],
  reverse: [{ key: 'mode', label: 'mode' }],
  script: [{ key: 'mode', label: 'mode' }],
  truncate: [
    { key: 'mode', label: 'mode' },
    { key: 'n', label: 'n' },
    { key: 'from', label: 'from' },
    { key: 'to', label: 'to' },
  ],
  insert: [
    { key: 'mode', label: 'mode' },
    { key: 'text', label: 'text' },
    { key: 'position', label: 'position' },
    { key: 'interval', label: 'interval' },
  ],
};

export const PIPELINE_OP_TYPES: PipelineOpType[] = PIPELINE_OP_GROUPS.flatMap((g) => g.ops);

/** 生成一个操作（带默认参数 + 唯一 id）。 */
export function createOp(type: PipelineOpType): PipelineOp {
  const params: Record<string, string> = {};
  for (const { key } of OP_PARAM_KEYS[type]) {
    params[key] = '';
  }
  // 各 op 的合理默认值（与旧工具默认行为对齐）
  if (type === 'sort') params.mode = 'asc';
  if (type === 'wrap-quote') params.quote = "'";
  if (type === 'indent') {
    params.mode = 'add';
    params.method = 'space';
    params.count = '4';
  }
  if (type === 'filter') {
    params.pattern = '';
    params.invert = 'false';
  }
  if (type === 'split') params.delimiter = ',';
  if (type === 'merge') {
    params.mode = 'rows';
    params.output = ',';
    params.input = '\t';
    params.skipEmpty = 'true';
    params.allSpace = 'false';
  }
  if (type === 'case') params.mode = 'lower';
  if (type === 'reverse') params.mode = 'lines';
  if (type === 'script') params.mode = 'sub';
  if (type === 'truncate') {
    params.mode = 'head';
    params.n = '10';
    params.from = '0';
    params.to = '10';
  }
  if (type === 'insert') {
    params.mode = 'atPos';
    params.text = '';
    params.position = '0';
    params.interval = '2';
  }
  if (type === 'number') {
    params.start = '1';
    params.step = '1';
  }
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type, params };
}

/** 依次执行流水线，返回最终文本。 */
export function runPipeline(options: PipelineOptions): string {
  let text = options.input;
  for (const op of options.ops) {
    text = applyOp(text, op);
  }
  return text;
}

/* ==========================================================================
 * 一键预设
 *
 * 防 UX 倒退的核心：新用户不用理解「编排」，点一下 chip 即填好整条流水线。
 * 预设只是 op 序列的快捷填写，之后仍可在高级编排里任意增删改。
 * ========================================================================== */

export interface PresetSpec {
  type: PipelineOpType;
  params?: Record<string, string>;
}

export interface PresetDef {
  key: string;
  ops: PresetSpec[];
}

export const PRESETS: PresetDef[] = [
  { key: 'dedupe-sort', ops: [{ type: 'dedupe' }, { type: 'sort', params: { mode: 'asc' } }] },
  { key: 'clean-space', ops: [{ type: 'trim' }, { type: 'remove-empty' }] },
  { key: 'add-number', ops: [{ type: 'number' }] },
  { key: 'split', ops: [{ type: 'split', params: { delimiter: ',' } }] },
  { key: 'merge-rows', ops: [{ type: 'merge', params: { mode: 'rows', output: ',' } }] },
  {
    key: 'merge-cols',
    ops: [{ type: 'merge', params: { mode: 'cols', input: '\t', output: ',' } }],
  },
  { key: 'filter', ops: [{ type: 'filter', params: { pattern: '' } }] },
  { key: 'upper', ops: [{ type: 'case', params: { mode: 'upper' } }] },
  { key: 'lower', ops: [{ type: 'case', params: { mode: 'lower' } }] },
  {
    key: 'one-click-clean',
    ops: [{ type: 'trim' }, { type: 'remove-empty' }, { type: 'dedupe' }, { type: 'sort', params: { mode: 'asc' } }],
  },
  { key: 'add-affix', ops: [{ type: 'add-prefix' }, { type: 'add-suffix' }] },
];

/** 按预设 key 生成一条完整流水线（替换当前编排）。 */
export function buildPreset(key: string): PipelineOp[] {
  const preset = PRESETS.find((p) => p.key === key);
  if (!preset) return [];
  return preset.ops.map((spec) => {
    const op = createOp(spec.type);
    if (spec.params) {
      for (const [k, v] of Object.entries(spec.params)) {
        op.params[k] = v;
      }
    }
    return op;
  });
}

/* ==========================================================================
 * op 实现
 * ========================================================================== */

function applyOp(input: string, op: PipelineOp): string {
  switch (op.type) {
    case 'trim':
      return input
        .split('\n')
        .map((line) => line.replace(/^\s+/, '').replace(/\s+$/, ''))
        .join('\n');
    case 'remove-empty':
      return input
        .split('\n')
        .filter((line) => line.trim() !== '')
        .join('\n');
    case 'dedupe': {
      const seen = new Set<string>();
      return input
        .split('\n')
        .filter((line) => {
          if (seen.has(line)) return false;
          seen.add(line);
          return true;
        })
        .join('\n');
    }
    case 'sort': {
      const mode = op.params.mode ?? 'asc';
      if (mode === 'none') return input;
      const lines = input.split('\n');
      lines.sort(byOrder({ order: mode as SortOrder }));
      return lines.join('\n');
    }
    case 'add-prefix': {
      const prefix = op.params.text ?? '';
      return input
        .split('\n')
        .map((line) => prefix + line)
        .join('\n');
    }
    case 'add-suffix': {
      const suffix = op.params.text ?? '';
      return input
        .split('\n')
        .map((line) => line + suffix)
        .join('\n');
    }
    case 'number': {
      const start = parseInt(op.params.start ?? '1', 10) || 1;
      const step = parseInt(op.params.step ?? '1', 10) || 1;
      return input
        .split('\n')
        .map((line, i) => `${start + i * step}. ${line}`)
        .join('\n');
    }
    case 'wrap-quote': {
      const quote = op.params.quote ?? "'";
      return input
        .split('\n')
        .map((line) => `${quote}${line}${quote}`)
        .join('\n');
    }
    case 'indent': {
      const unit =
        op.params.method === 'tab' ? '\t' : ' '.repeat(Math.max(1, parseInt(op.params.count ?? '4', 10) || 4));
      return input
        .split('\n')
        .map((line) => {
          if (op.params.mode === 'remove') {
            // text-format 口径：只替换第一个匹配、不限定行首，原行为别改
            return line.replace(unit, '');
          }
          return unit + line;
        })
        .join('\n');
    }
    case 'filter': {
      const pattern = op.params.pattern ?? '';
      if (!pattern) return input;
      try {
        const re = new RegExp(pattern, 'v');
        const invert = op.params.invert === 'true';
        return input
          .split('\n')
          .filter((line) => (invert ? !re.test(line) : re.test(line)))
          .join('\n');
      } catch {
        return input; // 非法正则不过滤
      }
    }
    case 'split': {
      const delimiter = op.params.delimiter ?? '';
      if (!delimiter) return input;
      return textSplitArr(input, delimiter).join('\n');
    }
    case 'merge': {
      const mode = op.params.mode ?? 'rows';
      const output = op.params.output ?? ',';
      const inputDelimiter = op.params.input ?? '\t';
      const skipEmpty = op.params.skipEmpty !== 'false';
      const allSpace = op.params.allSpace === 'true';
      const lines = input.split(/\r?\n/);
      const clean = (line: string) => (allSpace ? line.replace(/\s*/g, '') : line);
      if (mode === 'rows') {
        let parts = lines.map(clean);
        if (skipEmpty) parts = parts.filter((l) => l.trim() !== '');
        return parts.join(output);
      }
      // cols：每行按 inputDelimiter 拆列，再用 output 连接
      const out: string[] = [];
      for (const raw of lines) {
        const line = clean(raw);
        if (skipEmpty && line.trim() === '') continue;
        let cells = line.split(inputDelimiter);
        if (skipEmpty) cells = cells.filter((c) => c.trim() !== '');
        if (skipEmpty && cells.length === 0) continue;
        out.push(cells.join(output));
      }
      return out.join('\n');
    }
    case 'case':
      return op.params.mode === 'upper' ? input.toUpperCase() : input.toLowerCase();
    case 'replace': {
      const from = op.params.from ?? '';
      const to = op.params.to ?? '';
      if (!from) return input;
      // 字面量替换；from 含 | 时按多组逐一替换（text-format 口径）
      for (const f of from.split('|')) {
        if (f) input = input.split(f).join(to);
      }
      return input;
    }
    case 'reverse': {
      const mode = op.params.mode ?? 'lines';
      if (mode === 'chars') return Array.from(input).reverse().join('');
      if (mode === 'words') {
        return input
          .split('\n')
          .map((line) => line.split(/\s+/).filter(Boolean).reverse().join(' '))
          .join('\n');
      }
      return input.split('\n').reverse().join('\n');
    }
    case 'script':
      return toScript(input, op.params.mode === 'super' ? 'super' : 'sub');
    case 'truncate': {
      const mode = op.params.mode ?? 'head';
      if (mode === 'none') return input;
      const chars = Array.from(input);
      if (mode === 'head') return chars.slice(0, Math.max(0, parseInt(op.params.n ?? '10', 10) || 0)).join('');
      if (mode === 'tail') {
        const n = Math.max(0, parseInt(op.params.n ?? '10', 10) || 0);
        return chars.slice(Math.max(0, chars.length - n)).join('');
      }
      const start = Math.max(0, parseInt(op.params.from ?? '0', 10) || 0);
      const end = parseInt(op.params.to ?? '10', 10) || 0;
      if (end <= start) return '';
      return chars.slice(start, end).join('');
    }
    case 'insert': {
      const insert = op.params.text ?? '';
      const chars = Array.from(input);
      if (op.params.mode === 'everyN') {
        const step = Math.max(1, parseInt(op.params.interval ?? '2', 10) || 1);
        const out: string[] = [];
        for (let i = 0; i < chars.length; i += step) {
          out.push(chars.slice(i, i + step).join(''));
          if (i + step < chars.length) out.push(insert);
        }
        return out.join('');
      }
      const pos = Math.max(0, Math.min(chars.length, parseInt(op.params.position ?? '0', 10) || 0));
      return chars.slice(0, pos).join('') + insert + chars.slice(pos).join('');
    }
    default:
      return input;
  }
}

/* ==========================================================================
 * 行重复统计（结果区第二个 Tab 的数据源）
 *
 * 口径对齐 text-dedupe 的 duplicateCount（单测锁死）：
 *   - 对流水线输出的每一行，以 trim() 后的文本为 key 计数；空行（key ''）也计入。
 *   - 「重复行数」= 总行数 − 非空唯一行数 − 空行数。
 *   - 排序：'count-desc' 按次数降序，'count-asc' 升序，'none' 原样（首次出现序）。
 * ========================================================================== */

export interface LineCountItem {
  key: string;
  count: number;
}

export interface LineCountResult {
  items: LineCountItem[];
  /** 总行数 */
  total: number;
  /** 重复行数 = 总行数 − 非空唯一行数 − 空行数 */
  duplicate: number;
  /** 空行数（trim 后为空的行） */
  empty: number;
}

/** 参考站 `addOrUpdateArr`：命中已有键则计数 +1，否则新建。 */
export function addOrUpdateCount(items: LineCountItem[], key: string): void {
  const found = items.find((item) => item.key === key);
  if (found === undefined) {
    items.push({ key, count: 1 });
    return;
  }
  found.count += 1;
}

export function countLines(output: string): LineCountResult {
  const segments = output.split('\n');
  const counts: LineCountItem[] = [];
  for (const segment of segments) {
    addOrUpdateCount(counts, segment.trim());
  }
  const total = segments.length;
  const blank = counts.find((item) => item.key === '')?.count ?? 0;
  const distinct = counts.filter((item) => item.key !== '').length;
  return {
    items: counts,
    total,
    duplicate: Math.max(0, total - distinct - blank),
    empty: blank,
  };
}

/** 参考站 `arrSort`：'count-desc' 按次数降序，'count-asc' 升序，其余原样。 */
export function sortCountItems(items: LineCountItem[], order: string): LineCountItem[] {
  const sorted = [...items];
  if (order === 'count-desc') {
    sorted.sort((a, b) => b.count - a.count);
  } else if (order === 'count-asc') {
    sorted.sort((a, b) => a.count - b.count);
  }
  return sorted;
}

/** 统计文本形式：`key    出现次数：N 次`（对齐 text-dedupe 输出格式）。 */
export function formatCountItems(items: LineCountItem[]): string {
  return items.map((item) => `${item.key}    出现次数：${item.count} 次`).join('\n');
}

/** 导出 CSV（统计 Tab 专用）：表头「文本,出现次数」，行内容是 key,count。 */
export function toStatisticsCsv(items: LineCountItem[]): string {
  const lines = ['文本,出现次数'];
  for (const item of items) {
    lines.push(`${item.key},${item.count}`);
  }
  return lines.join('\n');
}

/* ==========================================================================
 * 以下为从各被融工具搬来的字符串级变换（text-format A9 口径，单测锁死）
 * ========================================================================== */

const SUPERSCRIPT_MAP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', f: 'ᶠ', g: 'ᵍ', h: 'ʰ', i: 'ⁱ', j: 'ʲ', k: 'ᵏ', l: 'ˡ',
  m: 'ᵐ', n: 'ⁿ', o: 'ᵒ', p: 'ᵖ', r: 'ʳ', s: 'ˢ', t: 'ᵗ', u: 'ᵘ', v: 'ᵛ', w: 'ʷ', x: 'ˣ', y: 'ʸ', z: 'ᶻ',
  A: 'ᴬ', B: 'ᴮ', D: 'ᴰ', E: 'ᴱ', G: 'ᴳ', H: 'ᴴ', I: 'ᴵ', J: 'ᴶ', K: 'ᴷ', L: 'ᴸ', M: 'ᴹ',
  N: 'ᴺ', O: 'ᴼ', P: 'ᴾ', R: 'ᴿ', T: 'ᵀ', U: 'ᵁ', V: 'ⱽ', W: 'ᵂ',
};
const SUBSCRIPT_MAP: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
  a: 'ₐ', e: 'ₑ', h: 'ₕ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ', s: 'ₛ', t: 'ₜ', x: 'ₓ',
};

/** 上下标。没有 Unicode 对应形的字符原样保留。 */
export function toScript(text: string, mode: 'none' | 'sub' | 'super'): string {
  if (mode === 'none' || !text) return text;
  const map = mode === 'sub' ? SUBSCRIPT_MAP : SUPERSCRIPT_MAP;
  return Array.from(text).map((ch) => map[ch] ?? ch).join('');
}

/**
 * 参考站 `textSplitArr` 的移植（text-split 口径，单测锁死）：
 * 切出来的**首尾空段直接丢弃**，中间的**空段保留**（`a,,b` → `['a','','b']`）；
 * 整个文本里找不到分隔符时，原样作为一段返回。
 */
export function textSplitArr(text: string, delimiter: string, result: string[] = []): string[] {
  if (delimiter === '' || text === '') {
    result.push(text);
    return result;
  }
  const segments = text.split(delimiter);
  if (segments.length === 1) {
    result.push(text);
    return result;
  }
  segments.forEach((segment, index) => {
    const emptyEdge = (index === 0 || index === segments.length - 1) && segment === '';
    if (emptyEdge) return;
    result.push(segment);
  });
  return result;
}
