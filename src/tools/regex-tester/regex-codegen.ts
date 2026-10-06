/**
 * 把当前正则和修饰符翻译成各语言可直接粘贴的代码。
 *
 * 各语言的标志位并不一一对应（JS 的 g 在 Python 里是 findall、在 PHP 里是
 * preg_match_all，Go 干脆没有全局标志），所以每种语言单独做映射，不做统一
 * 字符串拼接 —— 统一拼接很容易生成一份看起来对、粘过去却行为不同的代码。
 */

export interface CodegenLang {
  id: string;
  label: string;
  gen: (pattern: string, flags: string, sample: string) => string;
}

/**
 * 给「未被转义的指定字符」加反斜杠。
 *
 * 不能用 s.replace(/(^|[^\\])\//g, '$1\\/') 这种写法：碰到连续的 // 时，
 * 第一次替换会吃掉前一个字符，第二个 / 就漏掉了，生成的正则字面量会被提前截断。
 * 逐字符扫描并记录转义状态才能处理 \\/ 这种情况。
 */
function escapeUnescapedChar(input: string, target: string): string {
  let out = '';
  let escaped = false;

  for (const ch of input) {
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === target) {
      out += `\\${ch}`;
      continue;
    }
    out += ch;
  }
  return out;
}

const escSingle = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const escDouble = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const escSlash = (s: string) => escapeUnescapedChar(s, '/');

const has = (flags: string, flag: string) => flags.includes(flag);

/** 示例文本取第一行并截断，避免把整篇测试文本塞进代码示例里 */
export function sampleForCode(text: string, fallback: string): string {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? '';
  if (firstLine.length === 0) {
    return fallback;
  }
  return firstLine.length > 40 ? `${firstLine.slice(0, 40)}…` : firstLine;
}

export const CODEGEN_LANGS: CodegenLang[] = [
  {
    id: 'js',
    label: 'JavaScript',
    gen: (pattern, flags, sample) => {
      const p = escSlash(pattern);
      const f = flags.replace(/v/g, 'u');
      const s = escSingle(sample);
      return [
        `const pattern = /${p}/${f};`,
        `const str = '${s}';`,
        '',
        '// 是否匹配',
        'console.log(pattern.test(str));',
        '',
        '// 全局匹配所有结果',
        'console.log(str.match(pattern));',
        '',
        '// 逐个遍历（带捕获组，需要 g 标志）',
        'for (const m of str.matchAll(pattern)) {',
        '  console.log(m.index, m[0], m.groups);',
        '}',
      ].join('\n');
    },
  },
  {
    id: 'python',
    label: 'Python',
    gen: (pattern, flags, sample) => {
      const flagList: string[] = [];
      if (has(flags, 'i')) {
        flagList.push('re.IGNORECASE');
      }
      if (has(flags, 'm')) {
        flagList.push('re.MULTILINE');
      }
      if (has(flags, 's')) {
        flagList.push('re.DOTALL');
      }
      const flagStr = flagList.length > 0 ? `, ${flagList.join(' | ')}` : '';
      const s = escSingle(sample);
      return [
        'import re',
        '',
        `pattern = re.compile(r'${pattern}'${flagStr})`,
        `text = '${s}'`,
        '',
        '# 找第一个匹配',
        'match = pattern.search(text)',
        'print(match)',
        '',
        '# 找所有匹配',
        'print(pattern.findall(text))',
        '',
        '# 替换',
        "print(pattern.sub('替换文本', text))",
      ].join('\n');
    },
  },
  {
    id: 'java',
    label: 'Java',
    gen: (pattern, flags, sample) => {
      const p = escDouble(pattern);
      const s = escDouble(sample);
      const flagList: string[] = [];
      if (has(flags, 'i')) {
        flagList.push('Pattern.CASE_INSENSITIVE');
      }
      if (has(flags, 'm')) {
        flagList.push('Pattern.MULTILINE');
      }
      if (has(flags, 's')) {
        flagList.push('Pattern.DOTALL');
      }
      if (has(flags, 'u') || has(flags, 'v')) {
        flagList.push('Pattern.UNICODE_CASE');
      }
      const flagStr = flagList.length > 0 ? `, ${flagList.join(' | ')}` : '';
      return [
        'import java.util.regex.Matcher;',
        'import java.util.regex.Pattern;',
        '',
        'public class RegexDemo {',
        '    public static void main(String[] args) {',
        `        String text = "${s}";`,
        `        Pattern pattern = Pattern.compile("${p}"${flagStr});`,
        '',
        '        Matcher matcher = pattern.matcher(text);',
        '        while (matcher.find()) {',
        '            System.out.println("匹配: " + matcher.group()',
        '                + "  位置: " + matcher.start() + "-" + matcher.end());',
        '        }',
        '',
        '        // 是否整串匹配',
        '        System.out.println(pattern.matcher(text).matches());',
        '    }',
        '}',
      ].join('\n');
    },
  },
  {
    id: 'php',
    label: 'PHP',
    gen: (pattern, flags, sample) => {
      const p = escSlash(pattern);
      // PHP 没有 g / y，全局靠 preg_match_all；u 只在有 u/v 时加
      let f = '';
      if (has(flags, 'i')) {
        f += 'i';
      }
      if (has(flags, 'm')) {
        f += 'm';
      }
      if (has(flags, 's')) {
        f += 's';
      }
      if (has(flags, 'u') || has(flags, 'v')) {
        f += 'u';
      }
      const s = escSingle(sample);
      return [
        '<?php',
        `$str = '${s}';`,
        '',
        '// 匹配一次',
        `$isMatched = preg_match('/${p}/${f}', $str, $matches);`,
        'var_dump($isMatched, $matches);',
        '',
        '// 匹配全部',
        `preg_match_all('/${p}/${f}', $str, $allMatches);`,
        'var_dump($allMatches);',
        '',
        '// 替换',
        `$replaced = preg_replace('/${p}/${f}', '替换文本', $str);`,
        'var_dump($replaced);',
      ].join('\n');
    },
  },
  {
    id: 'go',
    label: 'Go',
    gen: (pattern, flags, sample) => {
      // Go 的 regexp 是 RE2：不支持反向引用和环视，标志位靠 (?ims) 内联前缀
      let prefix = '';
      if (has(flags, 'i')) {
        prefix += 'i';
      }
      if (has(flags, 'm')) {
        prefix += 'm';
      }
      if (has(flags, 's')) {
        prefix += 's';
      }
      const inline = prefix.length > 0 ? `(?${prefix})` : '';
      const s = escDouble(sample);
      return [
        'package main',
        '',
        'import (',
        '\t"fmt"',
        '\t"regexp"',
        ')',
        '',
        'func main() {',
        `\ttext := "${s}"`,
        '',
        `\tpattern := regexp.MustCompile("${escDouble(inline + pattern)}")`,
        '',
        '\t// 找第一个匹配',
        '\tfmt.Println(pattern.FindString(text))',
        '',
        '\t// 找所有匹配（第二个参数为 -1 表示不限数量）',
        '\tfmt.Println(pattern.FindAllString(text, -1))',
        '',
        '\t// 是否匹配',
        '\tfmt.Println(pattern.MatchString(text))',
        '',
        '\t// 替换',
        '\trepl := pattern.ReplaceAllString(text, "替换文本")',
        '\tfmt.Println(repl)',
        '}',
      ].join('\n');
    },
  },
  {
    id: 'ruby',
    label: 'Ruby',
    gen: (pattern, flags, sample) => {
      const p = escSlash(pattern);
      // Ruby 的 m 是「. 匹配换行」（对应 JS 的 s），另有 x/o/u/e，没有 g
      let f = '';
      if (has(flags, 'i')) {
        f += 'i';
      }
      if (has(flags, 's')) {
        f += 'm';
      }
      if (has(flags, 'u') || has(flags, 'v')) {
        f += 'u';
      }
      const s = escSingle(sample);
      return [
        `str = '${s}'`,
        `pattern = /${p}/${f}`,
        '',
        '# 是否匹配',
        'puts str.match?(pattern)',
        '',
        '# 第一个匹配（含捕获组）',
        'puts str.match(pattern)&.captures.inspect',
        '',
        '# 扫描全部',
        'str.scan(pattern) { |m| puts m.inspect }',
        '',
        '# 替换',
        "puts str.gsub(pattern, '替换文本')",
      ].join('\n');
    },
  },
];
