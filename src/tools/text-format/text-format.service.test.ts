import { describe, expect, it } from 'vitest';
import {
  applyTextFormat,
  DEFAULT_TEXT_FORMAT_OPTIONS,
  type TextFormatOptions,
  reverseText,
  toScript,
  truncateText,
  insertText,
} from './text-format.service';

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

  it('多组替换：from 用 | 分隔，全部替换成同一个 to', () => {
    const r = applyTextFormat('苹果和香蕉', opts({ replaceUsing: true, replaceFromText: '苹果|香蕉', replaceToText: '水果' }));
    expect(r.output).toBe('水果和水果');
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

describe('A9 reverseText 倒序', () => {
  it("chars：整段（含换行）当作一个字符序列整体反转", () => {
    expect(reverseText('a\nb', 'chars')).toBe('b\na');
    expect(reverseText('abc', 'chars')).toBe('cba');
  });

  it('lines：只反转行的顺序，行内不变', () => {
    expect(reverseText('a\nb\nc', 'lines')).toBe('c\nb\na');
  });

  it('words：逐行反转词序，词之间以单空格重连', () => {
    expect(reverseText('hello world', 'words')).toBe('world hello');
    expect(reverseText('a b c', 'words')).toBe('c b a');
  });

  it("none / 空串直接返回原值", () => {
    expect(reverseText('abc', 'none')).toBe('abc');
    expect(reverseText('', 'chars')).toBe('');
  });
});

describe('A9 toScript 上下标', () => {
  it('super：数字与有对应形的字母转上标', () => {
    expect(toScript('H2O', 'super')).toBe('ᴴ²ᴼ'); // H→ᴴ, 2→², O→ᴼ
  });

  it('sub：数字与有对应形的字母转下标（大写无对应形则保留）', () => {
    expect(toScript('h2o', 'sub')).toBe('ₕ₂ₒ'); // h→ₕ, 2→₂, o→ₒ
    expect(toScript('H2O', 'sub')).toBe('H₂O'); // 大写 H/O 无下标对应形，原样保留
  });

  it('无对应形的字符（中文、标点、无下标对应形的字母）原样保留', () => {
    expect(toScript('水1', 'super')).toBe('水¹');
    expect(toScript('a+b', 'sub')).toBe('ₐ₊b'); // +→₊；b 没有下标对应形，原样保留
  });

  it('none / 空串直接返回原值', () => {
    expect(toScript('H2O', 'none')).toBe('H2O');
    expect(toScript('', 'super')).toBe('');
  });
});

describe('A9 truncateText 截取', () => {
  it('head：保留前 N 个字符', () => {
    expect(truncateText('abcdef', 'head', 3, 0, 0)).toBe('abc');
  });

  it('tail：保留后 N 个字符', () => {
    expect(truncateText('abcdef', 'tail', 2, 0, 0)).toBe('ef');
  });

  it('range：保留 [from, to)，按字符数（非字节）', () => {
    expect(truncateText('abcdef', 'range', 0, 1, 4)).toBe('bcd');
    expect(truncateText('中文字', 'range', 0, 0, 2)).toBe('中文'); // 多字节按字符计
  });

  it('range：to <= from 时返回空', () => {
    expect(truncateText('abcdef', 'range', 0, 3, 3)).toBe('');
    expect(truncateText('abcdef', 'range', 0, 4, 2)).toBe('');
  });

  it('none / 空串直接返回原值', () => {
    expect(truncateText('abc', 'none', 1, 0, 1)).toBe('abc');
    expect(truncateText('', 'head', 3, 0, 0)).toBe('');
  });
});

describe('A9 insertText 插入', () => {
  it('atPos：在第 position 个字符之后插入', () => {
    expect(insertText('abc', 'atPos', '-', 1, 0)).toBe('a-bc');
    expect(insertText('abc', 'atPos', '-', 0, 0)).toBe('-abc'); // 最前面
    expect(insertText('abc', 'atPos', '-', 99, 0)).toBe('abc-'); // 超出则插到末尾
  });

  it('everyN：每隔 interval 个字符插入一次', () => {
    expect(insertText('abcdef', 'everyN', '-', 0, 2)).toBe('ab-cd-ef');
    expect(insertText('abc', 'everyN', '-', 0, 1)).toBe('a-b-c'); // interval<1 按 1
  });

  it('none / 空串直接返回原值', () => {
    expect(insertText('abc', 'none', '-', 1, 1)).toBe('abc');
    expect(insertText('', 'atPos', '-', 0, 0)).toBe('');
  });
});

describe('applyTextFormat A9 高级变换集成', () => {
  it('四个变换默认全关时，行为和旧版流水线完全一致', () => {
    expect(applyTextFormat('  b  \na', opts({ orderBy: 'asc' })).output).toBe('a\nb');
    expect(applyTextFormat('a\nb\nc', opts()).output).toBe('a\nb\nc');
  });

  it('倒序（字符）作为第 5.5 阶段，作用在排序/去重之后', () => {
    const r = applyTextFormat('c\na', opts({ orderBy: 'asc', reverseMode: 'chars' }));
    expect(r.output).toBe('a\nc'.split('').reverse().join('')); // 'c\na' 反转
  });

  it('截取 head：只保留前 N 个字符', () => {
    const r = applyTextFormat('abcdef', opts({ truncateMode: 'head', truncateN: 3 }));
    expect(r.output).toBe('abc');
  });

  it('倒序 + 截取 串联：先倒序整段再截取前 N', () => {
    const r = applyTextFormat('abcdef', opts({ reverseMode: 'chars', truncateMode: 'head', truncateN: 3 }));
    expect(r.output).toBe('fed'); // 反转得 fedcba，取前 3 → fed
  });

  it('行号始终加在最终结果最前面（不被插入挤乱）', () => {
    // 单行输入避免换行符被当成字符插入的干扰；每隔 1 字符插 | 后再加行号
    const r = applyTextFormat('abc', opts({
      insertMode: 'everyN',
      insertText: '|',
      insertInterval: 1,
      showLineNumber: true,
    }));
    expect(r.output).toBe('1：a|b|c');
  });
});
