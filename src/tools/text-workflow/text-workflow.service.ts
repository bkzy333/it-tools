// 文本工作流 的纯逻辑层。
//
// 行为依据：参考站 iamwawa.cn/textworkflow.html 的「文本处理工作流工具」。
// 参考站让用户从左侧菜单挑选操作，按顺序串成一个工作流，逐步处理文本。
// 本站对齐：定义一组「操作」，每个操作是一个 { type, params }，按数组顺序依次
// 作用在文本上，前一个的输出是后一个的输入。
//
// 操作类型（对齐参考站常见操作，纯前端实现）：
//   - trim         去每行首尾空格
//   - remove-empty 删除空行
//   - lowercase    转小写
//   - uppercase    转大写
//   - reverse      反转（chars / lines）
//   - sort         排序（asc / desc）
//   - dedupe       去重（保留首次出现）
//   - replace      替换（字面量）
//   - add-prefix   每行加前缀
//   - add-suffix   每行加后缀
//   - number       每行加序号

export type WorkflowOpType =
  | 'trim'
  | 'remove-empty'
  | 'lowercase'
  | 'uppercase'
  | 'reverse'
  | 'sort'
  | 'dedupe'
  | 'replace'
  | 'add-prefix'
  | 'add-suffix'
  | 'number';

export interface WorkflowOp {
  id: string;
  type: WorkflowOpType;
  params: Record<string, string>;
}

export interface WorkflowOptions {
  input: string;
  ops: WorkflowOp[];
}

/** 每个操作类型的默认参数（key → 默认值），供 UI 渲染参数输入框。 */
export const OP_PARAM_KEYS: Record<WorkflowOpType, { key: string; label: string }[]> = {
  trim: [],
  'remove-empty': [],
  lowercase: [],
  uppercase: [],
  reverse: [{ key: 'mode', label: 'mode' }],
  sort: [{ key: 'mode', label: 'mode' }],
  dedupe: [],
  replace: [
    { key: 'from', label: 'from' },
    { key: 'to', label: 'to' },
  ],
  'add-prefix': [{ key: 'text', label: 'text' }],
  'add-suffix': [{ key: 'text', label: 'text' }],
  number: [
    { key: 'start', label: 'start' },
    { key: 'step', label: 'step' },
  ],
};

export const WORKFLOW_OP_TYPES: WorkflowOpType[] = [
  'trim',
  'remove-empty',
  'lowercase',
  'uppercase',
  'reverse',
  'sort',
  'dedupe',
  'replace',
  'add-prefix',
  'add-suffix',
  'number',
];

/** 生成一个操作（带默认参数 + 唯一 id）。 */
export function createOp(type: WorkflowOpType): WorkflowOp {
  const params: Record<string, string> = {};
  for (const { key } of OP_PARAM_KEYS[type]) {
    params[key] = '';
  }
  // 给 reverse / sort / number 预设合理默认
  if (type === 'reverse' || type === 'sort') params.mode = 'lines';
  if (type === 'sort') params.mode = 'asc';
  if (type === 'number') {
    params.start = '1';
    params.step = '1';
  }
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type, params };
}

/** 依次执行工作流，返回最终文本。 */
export function runWorkflow(options: WorkflowOptions): string {
  let text = options.input;
  for (const op of options.ops) {
    text = applyOp(text, op);
  }
  return text;
}

function applyOp(input: string, op: WorkflowOp): string {
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
    case 'lowercase':
      return input.toLowerCase();
    case 'uppercase':
      return input.toUpperCase();
    case 'reverse': {
      const mode = op.params.mode ?? 'lines';
      if (mode === 'chars') return Array.from(input).reverse().join('');
      return input.split('\n').reverse().join('\n');
    }
    case 'sort': {
      const mode = op.params.mode ?? 'asc';
      // split 已经返回新数组，再展开一次只是多分配一个数组
      const lines = input.split('\n');
      lines.sort((a, b) => (mode === 'desc' ? b.localeCompare(a) : a.localeCompare(b)));
      return lines.join('\n');
    }
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
    case 'replace': {
      const from = op.params.from ?? '';
      const to = op.params.to ?? '';
      if (!from) return input;
      return input.split(from).join(to);
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
    default:
      return input;
  }
}
