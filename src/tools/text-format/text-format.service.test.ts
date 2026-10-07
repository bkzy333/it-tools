import { describe, expect, it } from 'vitest';
import { applyTextFormat, DEFAULT_TEXT_FORMAT_OPTIONS, type TextFormatOptions } from './text-format.service';

/** 只开默认项（去左/右空格），便于逐项叠加 */
function opts(patch: Partial<TextFormatOptions> = {}): TextFormatOptions {
  return { ...DEFAULT_TEXT_FORMAT_OPTIONS, ...patch };
}

describe('applyTextFormat 去空格 / 空行', () => {
  it('去掉行首行尾的半角空格与制表符（参考站只认半角空格，本站刻意扩到 \\s）', () => {
    const r = applyTextFormat('  \tapple  \n  banana', opts({ removeLeftSpace: true, removeRightSpace: true }));
    expect(r.output).toBe('apple\nbanana');
  });

  it('只去左边空格时保留右边', () => {
    const r = applyTextFormat('  apple  ', opts({ removeLeftSpace: true, removeRightSpace: false }));
    expect(r.output).toBe('apple  ');
  });

  it('removeAllSpace 删掉行内全部空白但不破坏换行', () => {
    const r = applyTextFormat('a b\tc', opts({ removeAllSpace: true }));
    expect(r.output).toBe('abc');
  });

  it('removeEmptyLine 连纯空白行一起删，并给出被删数量', () => {
    const r = applyTextFormat('a\n   \n\nb', opts({ removeEmptyLine: true }));
    expect(r.output).toBe('a\nb');
    expect(r.emptyLinesRemoved).toBe(2);
  });

  it('四选全开：去空格 + 去空行', () => {
    const r = applyTextFormat('  a \n\n  b\t\n   ', opts({
      removeLeftSpace: true,
      removeRightSpace: true,
      removeEmptyLine: true,
    }));
    expect(r.output).toBe('a\nb');
  });

  it('尾部换行会被切成一段空行（参考站同样如此），开去空行后才消失', () => {
    expect(applyTextFormat('a\n', opts()).output).toBe('a\n');
    expect(applyTextFormat('a\n', opts({ removeEmptyLine: true })).output).toBe('a');
  });
});

describe('applyTextFormat 前后缀', () => {
  it('add：每行前后都包上', () => {
    const r = applyTextFormat('a\nb', opts({ prefixSuffixMode: 'add', prefix: '[', suffix: ']' }));
    expect(r.output).toBe('[a]\n[b]');
  });

  it('remove：剥掉匹配的后缀', () => {
    const r = applyTextFormat('[a]\n[b]', opts({ prefixSuffixMode: 'remove', prefix: '[', suffix: ']' }));
    expect(r.output).toBe('a\nb');
  });

  it('remove：前缀对不上就不剥', () => {
    const r = applyTextFormat('a]', opts({ prefixSuffixMode: 'remove', prefix: '[', suffix: '' }));
    expect(r.output).toBe('a]');
  });

  it('remove：后缀比整行还长时参考站原行为是不剥（留着别「优化」）', () => {
    const r = applyTextFormat('ab', opts({ prefixSuffixMode: 'remove', prefix: '', suffix: 'abcdef' }));
    expect(r.output).toBe('ab');
  });
});

describe('applyTextFormat 缩进 / 反缩进', () => {
  it('add：指定空格数', () => {
    const r = applyTextFormat('a\nb', opts({ indentMode: 'add', indentMethod: 'space', indentUnitCount: 2 }));
    expect(r.output).toBe('  a\n  b');
  });

  it('add：Tab', () => {
    const r = applyTextFormat('a', opts({ indentMode: 'add', indentMethod: 'tab' }));
    expect(r.output).toBe('\ta');
  });

  it('remove：只替换首个匹配，且不限定在行首（参考站原行为）', () => {
    // 'a  a  b' 里首个「两空格」在第 1 位之后，剥掉后变成 'aa  b'，第二个缩进符还在
    const r = applyTextFormat('a  a  b', opts({ indentMode: 'remove', indentMethod: 'space', indentUnitCount: 2 }));
    expect(r.output).toBe('aa  b');
  });
});

describe('applyTextFormat 替换', () => {
  it('字面量替换：内容里的 . 不当正则', () => {
    const r = applyTextFormat('a.b\na.b', opts({ replaceUsing: true, replaceFromText: '.', replaceToText: '-' }));
    expect(r.output).toBe('a-b\na-b');
  });

  it('换行符作为「将」的内容：整段被拆开重连', () => {
    const r = applyTextFormat('a\nb', opts({ replaceUsing: true, replaceFromMode: 'newline', replaceToText: ',' }));
    expect(r.output).toBe('a,b');
  });

  it('字面量替换：from 里的 $& 不会被当成替换模式展开', () => {
    const r = applyTextFormat('$&', opts({ replaceUsing: true, replaceFromText: '&', replaceToText: 'X' }));
    expect(r.output).toBe('$X');
  });
});

describe('applyTextFormat 排序 / 去重 / 行号', () => {
  // 注意：排序用 localeCompare 且不传 locale（对齐参考站），所以断言只用 ASCII。
  // 一旦塞汉字，本机 zh 与 CI en 的 collation 结果不同，测试会变成环境依赖。
  it('asc / desc 只动 ASCII，顺序稳定', () => {
    const input = 'c\na\nb';
    expect(applyTextFormat(input, opts({ orderBy: 'asc' })).output).toBe('a\nb\nc');
    expect(applyTextFormat(input, opts({ orderBy: 'desc' })).output).toBe('c\nb\na');
    expect(applyTextFormat(input, opts({ orderBy: 'none' })).output).toBe('c\na\nb');
  });

  it('去重保留首次出现，并统计被删行数', () => {
    const r = applyTextFormat('a\nb\na\nc\nb', opts({ removeRepeat: true }));
    expect(r.output).toBe('a\nb\nc');
    expect(r.duplicateLinesRemoved).toBe(2);
  });

  it('行号用全角冒号分隔，且加在排序之后', () => {
    const r = applyTextFormat('c\na', opts({ orderBy: 'asc', showLineNumber: true }));
    expect(r.output).toBe('1：a\n2：c');
  });

  it('totalLines 记的是排序前的行数', () => {
    const r = applyTextFormat('a\nb\na', opts({ removeRepeat: true, orderBy: 'asc' }));
    expect(r.totalLines).toBe(3);
    expect(r.output).toBe('a\nb');
  });
});

describe('applyTextFormat 边界', () => {
  it('输入为空直接返回空，不报错', () => {
    const r = applyTextFormat('', opts());
    expect(r.output).toBe('');
    expect(r.totalLines).toBe(0);
  });

  it('流水线顺序：去空格 → 前后缀 → 缩进 → 替换 → 排序', () => {
    const r = applyTextFormat('  b  \na', opts({
      removeLeftSpace: true,
      removeRightSpace: true,
      prefixSuffixMode: 'add',
      prefix: '# ',
      suffix: '',
      orderBy: 'asc',
    }));
    expect(r.output).toBe('# a\n# b');
  });
});
