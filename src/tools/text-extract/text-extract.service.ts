// 文本提取 的纯逻辑层。放在这里而不是 .vue 里，是为了能跑 vitest 单测。

/** 可选的内置提取类型。custom 代表用户自己写的正则。 */
export type ExtractType =
  | 'phone'
  | 'email'
  | 'url'
  | 'ip'
  | 'date'
  | 'time'
  | 'money'
  | 'idCard'
  | 'zip'
  | 'number'
  | 'word'
  | 'cjk'
  | 'custom';

export interface ExtractOptionMeta {
  key: ExtractType;
  /** i18n key 后缀（如 phone），界面文案在 yml 里是 texts 下的 type-<这个后缀> */
  i18nKey: string;
  pattern: string;
}

/**
 * 内置提取规则表，顺序 = 界面展示顺序。
 *
 * 每个正则都写成「纯匹配、不做后处理」，校验（比如 IP 每段是否 ≤255）直接折进正则里，
 * 不留脏数据给上层。
 * ⚠ 别往这里塞 `\d+` 之类会连带命中身份证/银行卡/邮编的模糊数字规则，和它们会互相稀释。
 */
// ⚠ 下面几条都用「边界」把噪音挡在门外，改动前务必先跑探针脚本实测，别照着直觉改：
// 探针 2026-10-07 实测抓出的三个坑：
//   1. phone 不加 \b → 会把 18 位身份证中间那 11 位数字当成手机号捞走
//   2. url 字符类不排中文标点 → 会吃到句尾的「。」，输出 www.b.cn。
//   3. number 写 -?\d+(\.\d+)? → 把 2026-10-07 / 192.168.1.100 全拆成碎片（实测 31 项）
export const EXTRACT_OPTIONS: ExtractOptionMeta[] = [
  { key: 'phone', i18nKey: 'phone', pattern: '\\b1[3-9]\\d{9}\\b' },
  {
    key: 'email',
    i18nKey: 'email',
    pattern: '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)*\\.[A-Za-z]{2,}',
  },
  // 排掉中英文尾部标点。`?` 不能排（URL 查询串里合法），中文句号「。」才是要挡的
  { key: 'url', i18nKey: 'url', pattern: 'https?://[^\\s<>"\'，。、；：！？（）【】「」]+|www\\.[^\\s<>"\'，。、；：！？（）【】「」]+' },
  {
    key: 'ip',
    i18nKey: 'ip',
    // 精确版 IPv4：四段各自 0-255，别把 999.1.1.1 这类也捞出来
    pattern: '\\b(?:25[0-5]|2[0-4]\\d|1\\d{2}|[1-9]?\\d)(?:\\.(?:25[0-5]|2[0-4]\\d|1\\d{2}|[1-9]?\\d)){3}\\b',
  },
  { key: 'date', i18nKey: 'date', pattern: '\\d{4}[-/年.]\\d{1,2}[-/月.]\\d{1,2}日?' },
  { key: 'time', i18nKey: 'time', pattern: '\\d{1,2}:\\d{2}(?::\\d{2})?' },
  { key: 'money', i18nKey: 'money', pattern: '[¥￥$]\\s?\\d+(?:[.,]\\d+)?' },
  { key: 'idCard', i18nKey: 'id-card', pattern: '\\b\\d{17}[\\dXx]\\b' },
  { key: 'zip', i18nKey: 'zip', pattern: '\\b\\d{6}\\b' },
  // 独立数值：前后不许紧跟数字/小数点/负号/冒号，否则 2026-10-07、192.168.1.100、09:30
  // 会被拆成一堆碎片。这样写只捞「自己就是一个数」的 3 / -12 / 0.75
  { key: 'number', i18nKey: 'number', pattern: '(?<![\\d.\\-/:])-?\\d+(?:\\.\\d+)?(?![\\d.\\-/:])' },
  { key: 'word', i18nKey: 'word', pattern: "[A-Za-z][A-Za-z'-]*" },
  { key: 'cjk', i18nKey: 'cjk', pattern: '[\\u4e00-\\u9fa5]+' },
];

/**
 * 界面上的类型选项，比内置规则表多一条「自定义正则」。
 * 它的 pattern 是空串——真正的规则取自用户输入框，见 extractFromText 里的 `key === 'custom'` 分支。
 * ⚠ 只加这一条表就够：别把 custom 塞进 EXTRACT_OPTIONS，否则 extractFromText 会拿空正则去建 RegExp。
 */
export const EXTRACT_UI_OPTIONS: ExtractOptionMeta[] = [
  ...EXTRACT_OPTIONS,
  { key: 'custom', i18nKey: 'custom', pattern: '' },
];

const PATTERN_BY_KEY = new Map(EXTRACT_OPTIONS.map((o) => [o.key, o.pattern]));

export interface ExtractSettings {
  /** 要提取的类型，按传入顺序返回 */
  types: ExtractType[];
  /** true = 同一类型内去重（保留首次出现顺序）；false = 全部命中照列 */
  dedupe: boolean;
}

export interface ExtractGroup {
  key: ExtractType;
  matches: string[];
}

/**
 * 从文本里按类型提取命中项。
 *
 * 不改命中顺序（global 匹配天然按出现顺序走），只做可选去重。
 * 空文本 / 空类型一律返回空数组，不抛错——输入框是用户随手改的，别让它白屏。
 */
export function extractFromText(
  text: string,
  settings: ExtractSettings,
  customPattern = '',
): ExtractGroup[] {
  const groups: ExtractGroup[] = [];

  for (const key of settings.types) {
    const source = key === 'custom' ? customPattern : PATTERN_BY_KEY.get(key);
    if (!source) continue;
    let re: RegExp;
    try {
      // 自定义正则由用户输入，必须包 try：非法 pattern 不该让整页挂掉
      re = new RegExp(source, 'g');
    } catch {
      continue;
    }
    const raw: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      raw.push(m[0]);
      if (m[0] === '') re.lastIndex += 1; // 空匹配会死循环，必须手动前进
    }
    const matches = settings.dedupe ? [...new Set(raw)] : raw;
    groups.push({ key, matches });
  }

  return groups;
}

/** 全部命中条数（各类型之和），用于界面顶部统计。 */
export function totalMatches(groups: ExtractGroup[]): number {
  return groups.reduce((sum, g) => sum + g.matches.length, 0);
}
