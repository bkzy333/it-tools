/**
 * 代码生成模块的回归测试。
 * 重点是各语言的字符串/定界符转义 —— 正则里出现 / " ' \ 时最容易生成粘过去就报错的代码。
 */
import { describe, expect, it } from 'vitest';
import { CODEGEN_LANGS, sampleForCode } from './regex-codegen';

const lang = (id: string) => CODEGEN_LANGS.find((l) => l.id === id)!;

/** 生成的代码要能被目标语言的语法容下：这里用 JS 语法检查 JS 字面量是否闭合 */
function jsRegexLiteralIsParseable(pattern: string, flags: string) {
  const code = lang('js').gen(pattern, flags, 'x');
  const line = code.split('\n')[0];
  expect(line.startsWith('const pattern = /')).toBe(true);
  // 取出 /.../flags 字面量本体，交给 RegExp 构造验证（去掉两侧的 / 和尾部 flags）
  const body = line.replace('const pattern = /', '').replace(/[a-z]*;$/, '');
  expect(() => new RegExp(body, flags.replace('v', 'u'))).not.toThrow();
}

describe('regex-codegen', () => {
  it('六种语言都能产出非空代码', () => {
    for (const l of CODEGEN_LANGS) {
      const code = l.gen('\\d{4}-\\d{2}-\\d{2}', 'gi', '2024-01-15');
      expect(code.length).toBeGreaterThan(20);
      expect(code).toContain('2024-01-15');
    }
  });

  it('正则里含斜杠时 JS 字面量不会被提前截断', () => {
    // 连续两个斜杠是 escapeUnescapedChar 最容易漏掉的情况
    jsRegexLiteralIsParseable('a//b', 'g');
    jsRegexLiteralIsParseable('https?://', 'gi');
    jsRegexLiteralIsParseable('a\\/b', 'g');
    jsRegexLiteralIsParseable('\\\\/', 'g');
  });

  it('正则和示例文本里的引号不会破坏目标语言的字符串字面量', () => {
    // Java 用双引号字符串，' 不用转义、" 必须转义
    const java = lang('java').gen('a\'b"c', 'g', 'x\'y"z');
    expect(java).toContain('String text = "x\'y\\"z";');
    expect(java).toContain('Pattern.compile("a\'b\\"c")');

    // JS / Python / PHP / Ruby 用单引号字符串，" 不用转义、' 必须转义
    for (const id of ['js', 'python', 'php', 'ruby']) {
      const code = lang(id).gen('a\'b"c', 'g', 'x\'y"z');
      expect(code).toContain('x\\\'y"z');
      expect(code).not.toContain("x'y\"z';");
    }

    // Go 用双引号字符串
    expect(lang('go').gen('a\'b"c', 'g', 'x\'y"z')).toContain('text := "x\'y\\"z"');
  });

  it('各语言的标志位单独映射，不是把 JS 标志原样拼过去', () => {
    // JS 的 g 在 PHP 里对应 preg_match_all，不进标志位
    expect(lang('php').gen('a', 'gi', 'x')).toContain("preg_match('/a/i'");
    expect(lang('php').gen('a', 'gi', 'x')).toContain("preg_match_all('/a/i'");

    // Go 用内联 (?ims) 前缀，且只映射自己认识的标志
    expect(lang('go').gen('a', 'gis', 'x')).toContain('(?is)a');
    expect(lang('go').gen('a', 'gims', 'x')).toContain('(?ims)a');

    // Ruby 的 m 等价于 JS 的 s（dotall）
    expect(lang('ruby').gen('a', 's', 'x')).toContain('/a/m');
    expect(lang('ruby').gen('a', 'm', 'x')).toContain('/a/');

    // JS 的 v 落到别家语言时退化成 u
    expect(lang('js').gen('a', 'v', 'x')).toContain('/a/u');
  });

  it('i/m/s/u 到 Python 标志位的映射', () => {
    const code = lang('python').gen('a', 'ims', 'x');
    expect(code).toContain('re.IGNORECASE');
    expect(code).toContain('re.MULTILINE');
    expect(code).toContain('re.DOTALL');
  });

  it('示例文本缺省时使用兜底文案并截断过长文本', () => {
    expect(sampleForCode('', '测试文本')).toBe('测试文本');
    expect(sampleForCode('   \n  \n', '测试文本')).toBe('测试文本');
    expect(sampleForCode('短', '测试文本')).toBe('短');
    expect(sampleForCode('x'.repeat(80), '测试文本')).toBe(`${'x'.repeat(40)}…`);
  });
});
