import { describe, expect, it } from 'vitest';
import {
  buildPreset,
  countLines,
  createOp,
  formatCountItems,
  PRESETS,
  runPipeline,
  sortCountItems,
  textSplitArr,
  toScript,
  toStatisticsCsv,
  type PipelineOp,
  type PipelineOpType,
} from './text-pipeline.service';

function op(type: PipelineOpType, params: Record<string, string> = {}): PipelineOp {
  return { id: `t-${type}`, type, params };
}

describe('runPipeline 基础（原 text-workflow 用例）', () => {
  it('空流水线：输入原样返回', () => {
    expect(runPipeline({ input: 'abc', ops: [] })).toBe('abc');
  });

  it('按顺序串接：trim → 去空行 → 小写', () => {
    const r = runPipeline({
      input: '  Apple  \n\nBanana',
      ops: [op('trim'), op('remove-empty'), op('case', { mode: 'lower' })],
    });
    expect(r).toBe('apple\nbanana');
  });

  it('去重 + 排序', () => {
    const r = runPipeline({
      input: 'c\na\nb\na',
      ops: [op('dedupe'), op('sort', { mode: 'asc' })],
    });
    expect(r).toBe('a\nb\nc');
  });

  it('字面量替换：点不当正则', () => {
    const r = runPipeline({
      input: 'a.b\na.b',
      ops: [op('replace', { from: '.', to: '-' })],
    });
    expect(r).toBe('a-b\na-b');
  });

  it('多组替换：from 含 | 逐一替换', () => {
    const r = runPipeline({
      input: '苹果和香蕉',
      ops: [op('replace', { from: '苹果|香蕉', to: '水果' })],
    });
    expect(r).toBe('水果和水果');
  });

  it('替换里的 $& 不被当成替换模式展开', () => {
    const r = runPipeline({ input: '$&', ops: [op('replace', { from: '&', to: 'X' })] });
    expect(r).toBe('$X');
  });

  it('加序号', () => {
    const r = runPipeline({ input: 'x\ny\nz', ops: [op('number')] });
    expect(r).toBe('1. x\n2. y\n3. z');
  });

  it('createOp 生成带默认参数的操作', () => {
    const numberOp = createOp('number');
    expect(numberOp.params.start).toBe('1');
    expect(numberOp.params.step).toBe('1');
    expect(numberOp.id).toBeTruthy();
  });
});

describe('sort 排序模式（list-converter 9 种口径）', () => {
  it('none：原样返回', () => {
    expect(runPipeline({ input: 'c\na\nb', ops: [op('sort', { mode: 'none' })] })).toBe('c\na\nb');
  });

  it('asc / desc：localeCompare（只断言 ASCII）', () => {
    expect(runPipeline({ input: 'c\na\nb', ops: [op('sort', { mode: 'asc' })] })).toBe('a\nb\nc');
    expect(runPipeline({ input: 'c\na\nb', ops: [op('sort', { mode: 'desc' })] })).toBe('c\nb\na');
  });

  it('asc-num：按数值大小而非字典序', () => {
    expect(runPipeline({ input: 'item10\nitem2\nitem1', ops: [op('sort', { mode: 'asc-num' })] })).toBe(
      'item1\nitem2\nitem10',
    );
  });

  it('asc-bin：二进制字典序，大写在小写前', () => {
    expect(runPipeline({ input: 'a\nC\nB', ops: [op('sort', { mode: 'asc-bin' })] })).toBe('B\nC\na');
  });

  it('asc-upper：同字母时大写优先（caseFirst 只影响大小写次序，不影响字母次序）', () => {
    expect(runPipeline({ input: 'a\nA', ops: [op('sort', { mode: 'asc-upper' })] })).toBe('A\na');
  });
});

describe('split 拆分（text-split 口径）', () => {
  it('首尾空段丢弃、中间空段保留', () => {
    expect(runPipeline({ input: 'a,b,,c,', ops: [op('split', { delimiter: ',' })] })).toBe('a\nb\n\nc');
  });

  it('找不到分隔符：原样作为一段返回', () => {
    expect(runPipeline({ input: 'abc', ops: [op('split', { delimiter: ',' })] })).toBe('abc');
  });

  it('分隔符为空：不过滤', () => {
    expect(runPipeline({ input: 'a,b', ops: [op('split', { delimiter: '' })] })).toBe('a,b');
  });

  it('textSplitArr 直接调用一致', () => {
    expect(textSplitArr('a,,b', ',')).toEqual(['a', '', 'b']);
    expect(textSplitArr(',a,', ',')).toEqual(['a']);
  });
});

describe('merge 合并（text-merge 口径）', () => {
  it('rows：所有行连成一行', () => {
    expect(runPipeline({ input: 'a\nb\nc', ops: [op('merge', { mode: 'rows', output: ',' })] })).toBe('a,b,c');
  });

  it('rows + skipEmpty：跳空行', () => {
    expect(runPipeline({ input: 'a\n\nb', ops: [op('merge', { mode: 'rows', output: ',' })] })).toBe('a,b');
  });

  it('rows + allSpace：删掉所有空白再拼', () => {
    expect(
      runPipeline({ input: 'a b\nc d', ops: [op('merge', { mode: 'rows', output: ',', allSpace: 'true' })] }),
    ).toBe('ab,cd');
  });

  it('cols：每行按输入分隔符拆列再连接', () => {
    expect(
      runPipeline({ input: '苹果\t红\t5', ops: [op('merge', { mode: 'cols', input: '\t', output: ',' })] }),
    ).toBe('苹果,红,5');
  });

  it('cols + skipEmpty：跳空单元格，整行变空则跳过', () => {
    expect(
      runPipeline({ input: 'a\t\tb\n\nc', ops: [op('merge', { mode: 'cols', input: '\t', output: ',' })] }),
    ).toBe('a,b\nc');
  });
});

describe('indent 缩进（text-format 口径）', () => {
  it('add：指定空格数', () => {
    expect(runPipeline({ input: 'a\nb', ops: [op('indent', { mode: 'add', method: 'space', count: '2' })] })).toBe(
      '  a\n  b',
    );
  });

  it('add：Tab', () => {
    expect(runPipeline({ input: 'a', ops: [op('indent', { mode: 'add', method: 'tab' })] })).toBe('\ta');
  });

  it('remove：只替换首个匹配、不限定行首（原行为别优化）', () => {
    expect(
      runPipeline({ input: 'a  a  b', ops: [op('indent', { mode: 'remove', method: 'space', count: '2' })] }),
    ).toBe('aa  b');
  });
});

describe('filter 正则过滤（list-converter 口径）', () => {
  it('保留匹配行', () => {
    expect(runPipeline({ input: 'apple\nbanana\ncherry', ops: [op('filter', { pattern: '^a' })] })).toBe('apple');
  });

  it('invert：保留不匹配行', () => {
    expect(
      runPipeline({ input: 'apple\nbanana\ncherry', ops: [op('filter', { pattern: '^a', invert: 'true' })] }),
    ).toBe('banana\ncherry');
  });

  it('pattern 为空：不过滤', () => {
    expect(runPipeline({ input: 'a\nb', ops: [op('filter', { pattern: '' })] })).toBe('a\nb');
  });

  it('非法正则：原样返回不炸', () => {
    expect(runPipeline({ input: 'a\nb', ops: [op('filter', { pattern: '[' })] })).toBe('a\nb');
  });
});

describe('wrap-quote / case', () => {
  it('wrap-quote：默认单引号包裹', () => {
    expect(runPipeline({ input: 'a\nb', ops: [op('wrap-quote')] })).toBe("'a'\n'b'");
  });

  it('wrap-quote：自定义引号', () => {
    expect(runPipeline({ input: 'a\nb', ops: [op('wrap-quote', { quote: '"' })] })).toBe('"a"\n"b"');
  });

  it('case upper / lower', () => {
    expect(runPipeline({ input: 'aBc', ops: [op('case', { mode: 'upper' })] })).toBe('ABC');
    expect(runPipeline({ input: 'aBc', ops: [op('case', { mode: 'lower' })] })).toBe('abc');
  });
});

describe('A9 高级变换 op（text-format 口径）', () => {
  it('reverse chars：整段含换行整体反转', () => {
    expect(runPipeline({ input: 'a\nb', ops: [op('reverse', { mode: 'chars' })] })).toBe('b\na');
    expect(runPipeline({ input: 'abc', ops: [op('reverse', { mode: 'chars' })] })).toBe('cba');
  });

  it('reverse lines / words', () => {
    expect(runPipeline({ input: 'a\nb\nc', ops: [op('reverse', { mode: 'lines' })] })).toBe('c\nb\na');
    expect(runPipeline({ input: 'hello world', ops: [op('reverse', { mode: 'words' })] })).toBe('world hello');
  });

  it('script super / sub', () => {
    expect(runPipeline({ input: 'H2O', ops: [op('script', { mode: 'super' })] })).toBe('ᴴ²ᴼ');
    expect(runPipeline({ input: 'H2O', ops: [op('script', { mode: 'sub' })] })).toBe('H₂O');
  });

  it('toScript 直接调用一致', () => {
    expect(toScript('h2o', 'sub')).toBe('ₕ₂ₒ');
    expect(toScript('水1', 'super')).toBe('水¹');
    expect(toScript('abc', 'none')).toBe('abc');
  });

  it('truncate head / tail / range（按字符计）', () => {
    expect(runPipeline({ input: 'abcdef', ops: [op('truncate', { mode: 'head', n: '3' })] })).toBe('abc');
    expect(runPipeline({ input: 'abcdef', ops: [op('truncate', { mode: 'tail', n: '2' })] })).toBe('ef');
    expect(runPipeline({ input: '中文字', ops: [op('truncate', { mode: 'range', from: '0', to: '2' })] })).toBe('中文');
  });

  it('truncate range：to <= from 返回空', () => {
    expect(runPipeline({ input: 'abcdef', ops: [op('truncate', { mode: 'range', from: '4', to: '2' })] })).toBe('');
  });

  it('insert atPos / everyN', () => {
    expect(runPipeline({ input: 'abc', ops: [op('insert', { mode: 'atPos', text: '-', position: '1' })] })).toBe('a-bc');
    expect(runPipeline({ input: 'abc', ops: [op('insert', { mode: 'atPos', text: '-', position: '99' })] })).toBe('abc-');
    expect(runPipeline({ input: 'abcdef', ops: [op('insert', { mode: 'everyN', text: '-', interval: '2' })] })).toBe(
      'ab-cd-ef',
    );
  });

  it('串联：倒序 + 截取', () => {
    const r = runPipeline({
      input: 'abcdef',
      ops: [op('reverse', { mode: 'chars' }), op('truncate', { mode: 'head', n: '3' })],
    });
    expect(r).toBe('fed');
  });
});

describe('一键预设', () => {
  it('dedupe-sort 预配两步', () => {
    const ops = buildPreset('dedupe-sort');
    expect(ops.map((o) => o.type)).toEqual(['dedupe', 'sort']);
    expect(ops[1].params.mode).toBe('asc');
  });

  it('one-click-clean 预配四步', () => {
    const ops = buildPreset('one-click-clean');
    expect(ops.map((o) => o.type)).toEqual(['trim', 'remove-empty', 'dedupe', 'sort']);
  });

  it('未知 key 返回空数组', () => {
    expect(buildPreset('not-exist')).toEqual([]);
  });

  it('每个预设都能真的跑一遍（预配参数合法）', () => {
    for (const preset of PRESETS) {
      const r = runPipeline({ input: 'b\na\nb', ops: buildPreset(preset.key) });
      expect(typeof r).toBe('string');
    }
  });
});

describe('行重复统计（text-dedupe 口径）', () => {
  it('countLines：空行也计入、重复行数口径', () => {
    // a / b / a / '' / c → a:2, b:1, '':1, c:1；total=5, distinct=3, blank=1, duplicate=1
    const r = countLines('a\nb\na\n\nc');
    expect(r.total).toBe(5);
    expect(r.empty).toBe(1);
    expect(r.duplicate).toBe(1);
    expect(r.items).toEqual([
      { key: 'a', count: 2 },
      { key: 'b', count: 1 },
      { key: '', count: 1 },
      { key: 'c', count: 1 },
    ]);
  });

  it('countLines：key 用 trim 后的文本', () => {
    const r = countLines(' a \n a ');
    expect(r.items).toEqual([{ key: 'a', count: 2 }]);
  });

  it('sortCountItems：按次数降序 / 升序 / none', () => {
    const items = [
      { key: 'a', count: 1 },
      { key: 'b', count: 3 },
      { key: 'c', count: 2 },
    ];
    expect(sortCountItems(items, 'count-desc').map((i) => i.key)).toEqual(['b', 'c', 'a']);
    expect(sortCountItems(items, 'count-asc').map((i) => i.key)).toEqual(['a', 'c', 'b']);
    expect(sortCountItems(items, 'none').map((i) => i.key)).toEqual(['a', 'b', 'c']);
  });

  it('formatCountItems / toStatisticsCsv 输出格式', () => {
    const items = [
      { key: 'a', count: 2 },
      { key: 'b', count: 1 },
    ];
    expect(formatCountItems(items)).toBe('a    出现次数：2 次\nb    出现次数：1 次');
    expect(toStatisticsCsv(items)).toBe('文本,出现次数\na,2\nb,1');
  });
});

describe('组合场景', () => {
  it('一键清洗：trim → 去空行 → 去重 → 排序', () => {
    const r = runPipeline({
      input: '  b  \n\n a \n b \na',
      ops: buildPreset('one-click-clean'),
    });
    expect(r).toBe('a\nb');
  });

  it('拆分 + 包裹引号 + 合并（模拟生成 SQL IN 列表）', () => {
    const r = runPipeline({
      input: '1,2,3',
      ops: [op('split', { delimiter: ',' }), op('wrap-quote'), op('merge', { mode: 'rows', output: ',' })],
    });
    expect(r).toBe("'1','2','3'");
  });
});
