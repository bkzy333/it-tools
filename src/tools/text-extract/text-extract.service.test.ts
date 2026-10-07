import { expect, describe, it } from 'vitest';
import {
  EXTRACT_OPTIONS,
  extractFromText,
  totalMatches,
  type ExtractGroup,
  type ExtractType,
} from './text-extract.service';

const PATTERN_BY_KEY = new Map(EXTRACT_OPTIONS.map((o) => [o.key, o.pattern]));

function matchesOf(key: ExtractType, text: string, dedupe = false, custom = ''): string[] {
  const group = extractFromText(text, { types: [key], dedupe }, custom)[0];
  return group ? group.matches : [];
}

/** 按下表断言某个类型能从文本里捞到什么（顺序敏感，因为它就是出现顺序）。 */
function expectMatches(
  key: ExtractType,
  text: string,
  expected: string[],
  custom = '',
): void {
  expect(matchesOf(key, text, false, custom)).toEqual(expected);
}

describe('内置提取规则', () => {
  it('phone 只捞独立的 11 位手机号，不会从身份证里切出 11 位', () => {
    // 这条是探针实测出来的坑：不加 \b 时 11010119900307123X 里的 19900307123 会被当成手机号
    expectMatches('phone', '联系 13812345678 找我', ['13812345678']);
    expect(matchesOf('phone', '11010119900307123X')).toEqual([]);
  });

  it('email 支持加号和多级子域名，取到完整地址', () => {
    expectMatches('email', '邮箱 zhang.san+tag@sub.example.com 和 abc@test.cn', [
      'zhang.san+tag@sub.example.com',
      'abc@test.cn',
    ]);
  });

  it('url 不吃尾部中文标点', () => {
    // 坑 2：字符类里没排「。」时输出 www.b.cn。
    expectMatches('url', '看 www.b.cn。和 https://a.com/x?y=1。', [
      'www.b.cn',
      'https://a.com/x?y=1',
    ]);
  });

  it('ip 只认四段各 0-255 的 IPv4', () => {
    expectMatches('ip', '机器 192.168.1.100 和 8.8.8.8，而 999.1.1.1 不该命中', [
      '192.168.1.100',
      '8.8.8.8',
    ]);
  });

  it('date 覆盖横杠/斜杠/中文三种写法', () => {
    expectMatches('date', '2026-10-07、2025/1/5、2024年3月8日', [
      '2026-10-07',
      '2025/1/5',
      '2024年3月8日',
    ]);
  });

  it('time 支持时分与时分秒', () => {
    expectMatches('time', '09:30 开会，14:05:00 结束', ['09:30', '14:05:00']);
  });

  it('money 认人民币与美元符号', () => {
    expectMatches('money', '¥128.50、￥99、$45.9', ['¥128.50', '￥99', '$45.9']);
  });

  it('idCard 认 18 位（末位可 X）', () => {
    expectMatches('idCard', '11010119900307123X', ['11010119900307123X']);
  });

  it('zip 认 6 位数字', () => {
    expectMatches('zip', '邮编 518000', ['518000']);
  });

  it('number 只捞独立数值，不把日期时间和 IP 拆成碎片', () => {
    // 坑 3：写 -?\d+(\.\d+)? 时这段会吐出 31 片（2026 / -10 / -07 / 192.168 / 8.8 …）
    expect(matchesOf('number', '2026-10-07 192.168.1.100 09:30')).toEqual([]);
    expectMatches('number', '数值 3、-12、0.75', ['3', '-12', '0.75']);
  });

  it('word 认英文单词并保留撇号', () => {
    expectMatches('word', "hello, world's and ABC", ['hello', "world's", 'and', 'ABC']);
  });

  it('cjk 连续汉字成串', () => {
    expectMatches('cjk', '张三和李四吃饭', ['张三和李四吃饭']);
  });
});

describe('extractFromText', () => {
  it('空类型列表返回空数组', () => {
    expect(extractFromText('13812345678', { types: [], dedupe: false })).toEqual([]);
    expect(extractFromText('', { types: [], dedupe: false })).toEqual([]);
  });

  it('空文本返回「选中类型」的空分组（不是空数组）——界面要渲染「命中 0 条」', () => {
    expect(extractFromText('', { types: ['phone'], dedupe: false })).toEqual([
      { key: 'phone', matches: [] },
    ]);
  });

  it('按传入顺序返回各类型分组，命中为空也保留分组', () => {
    const groups: ExtractGroup[] = extractFromText('13812345678', {
      types: ['email', 'phone'],
      dedupe: false,
    });
    expect(groups.map((g) => g.key)).toEqual(['email', 'phone']);
    expect(groups[0].matches).toEqual([]);
    expect(groups[1].matches).toEqual(['13812345678']);
  });

  it('dedupe=true 去重但保留首次出现顺序', () => {
    const text = 'a@b.cn 和 c@d.cn 都发过，a@b.cn 又来一次';
    const deduped = extractFromText(text, { types: ['email'], dedupe: true })[0];
    expect(deduped.matches).toEqual(['a@b.cn', 'c@d.cn']);
    const raw = extractFromText(text, { types: ['email'], dedupe: false })[0];
    expect(raw.matches).toEqual(['a@b.cn', 'c@d.cn', 'a@b.cn']);
  });

  it('自定义正则可用，并且非法正则被安全跳过而不是抛错', () => {
    expect(matchesOf('custom', '号码 138 和 159', false, '138')).toEqual(['138']);
    expect(() => matchesOf('custom', '任何文本', false, '([')).not.toThrow();
    expect(matchesOf('custom', '任何文本', false, '([')).toEqual([]);
  });

  it('自定义正则遇到空匹配不会死循环', () => {
    // 'a*' 能匹配空串，循环里必须手动推进 lastIndex，否则 while 永远出不来
    expect(matchesOf('custom', 'bbb', false, 'a*').length).toBeGreaterThan(0);
  });

  it('默认参数（不传 custom）时 custom 类型不产出任何东西', () => {
    expect(extractFromText('随便一段文本', { types: ['custom'], dedupe: false })).toEqual([]);
  });
});

describe('totalMatches', () => {
  it('把各类型命中数加起来', () => {
    const groups = extractFromText('13812345678 和 a@b.cn', {
      types: ['phone', 'email'],
      dedupe: false,
    });
    expect(totalMatches(groups)).toBe(2);
  });

  it('空输入为 0', () => {
    expect(totalMatches([])).toBe(0);
  });
});
