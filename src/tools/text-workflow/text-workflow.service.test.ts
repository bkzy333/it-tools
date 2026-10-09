import { describe, expect, it } from 'vitest';
import { createOp, runWorkflow, type WorkflowOp } from './text-workflow.service';

function op(type: WorkflowOp['type'], params: Record<string, string> = {}): WorkflowOp {
  return { id: `t-${type}`, type, params };
}

describe('runWorkflow 文本工作流', () => {
  it('空工作流：输入原样返回', () => {
    expect(runWorkflow({ input: 'abc', ops: [] })).toBe('abc');
  });

  it('按顺序串接：trim → 去空行 → 小写', () => {
    const r = runWorkflow({
      input: '  Apple  \n\nBanana',
      ops: [op('trim'), op('remove-empty'), op('lowercase')],
    });
    expect(r).toBe('apple\nbanana');
  });

  it('去重 + 排序', () => {
    const r = runWorkflow({
      input: 'c\na\nb\na',
      ops: [op('dedupe'), op('sort', { mode: 'asc' })],
    });
    expect(r).toBe('a\nb\nc');
  });

  it('替换', () => {
    const r = runWorkflow({
      input: 'hello world',
      ops: [op('replace', { from: 'world', to: 'there' })],
    });
    expect(r).toBe('hello there');
  });

  it('加序号', () => {
    const r = runWorkflow({
      input: 'x\ny\nz',
      ops: [op('number', { start: '1', step: '1' })],
    });
    expect(r).toBe('1. x\n2. y\n3. z');
  });

  it('createOp 生成带默认参数的操作', () => {
    const numberOp = createOp('number');
    expect(numberOp.params.start).toBe('1');
    expect(numberOp.params.step).toBe('1');
    expect(numberOp.id).toBeTruthy();
  });
});
