/**
 * 正则语法速查表数据。
 *
 * 单独拆一个文件而不是写进 .vue，是因为速查表有 40 多条、每条都有中英两个说明，
 * 塞进组件会让模板和逻辑都变得难读。这里只放数据，渲染交给组件。
 *
 * 说明文案没有走 locales/*.yml：40+ 条 × 2 语言 = 80 多个 key，全塞进 yml 会让
 * 语言文件变成一张没人愿意维护的大表，而这些都是跟着 pattern 走的静态说明，
 * 和 pattern 放在一起反而更好核对。组件里按当前 locale 取 zh / en 字段。
 * 因此 zh.yml / en.yml 里不放这些文案，改文案就改这一个文件。
 */

export interface CheatItem {
  pattern: string;
  zh: string;
  en: string;
}

export interface CheatCategory {
  key: string;
  titleZh: string;
  titleEn: string;
  items: CheatItem[];
}

export const CHEAT_CATEGORIES: CheatCategory[] = [
  {
    key: 'char-class',
    titleZh: '字符类',
    titleEn: 'Character classes',
    items: [
      { pattern: '.', zh: '任意字符（默认不含换行）', en: 'Any char except newline' },
      { pattern: '\\d', zh: '数字，等价于 [0-9]', en: 'A digit, same as [0-9]' },
      { pattern: '\\D', zh: '非数字', en: 'Not a digit' },
      { pattern: '\\w', zh: '字母、数字或下划线', en: 'Letter, digit or underscore' },
      { pattern: '\\W', zh: '非 \\w', en: 'Not \\w' },
      { pattern: '\\s', zh: '空白字符（空格、制表、换行）', en: 'Whitespace' },
      { pattern: '\\S', zh: '非空白字符', en: 'Not whitespace' },
      { pattern: '[abc]', zh: '字符集：a 或 b 或 c', en: 'Set: a, b or c' },
      { pattern: '[^abc]', zh: '排除字符集：不含 a、b、c', en: 'Negated set' },
      { pattern: '[a-z]', zh: '范围：a 到 z', en: 'Range: a to z' },
    ],
  },
  {
    key: 'quantifier',
    titleZh: '量词',
    titleEn: 'Quantifiers',
    items: [
      { pattern: '*', zh: '0 次或多次', en: 'Zero or more' },
      { pattern: '+', zh: '1 次或多次', en: 'One or more' },
      { pattern: '?', zh: '0 次或 1 次', en: 'Zero or one' },
      { pattern: '{n}', zh: '恰好 n 次', en: 'Exactly n times' },
      { pattern: '{n,}', zh: 'n 次或更多', en: 'n or more times' },
      { pattern: '{m,n}', zh: 'm 到 n 次', en: 'Between m and n times' },
      { pattern: '*?', zh: '非贪婪的 *', en: 'Lazy zero or more' },
      { pattern: '+?', zh: '非贪婪的 +', en: 'Lazy one or more' },
      { pattern: '{m,n}?', zh: '非贪婪的范围', en: 'Lazy range' },
    ],
  },
  {
    key: 'anchor',
    titleZh: '锚点与边界',
    titleEn: 'Anchors & boundaries',
    items: [
      { pattern: '^', zh: '字符串或行开头', en: 'Start of string or line' },
      { pattern: '$', zh: '字符串或行结尾', en: 'End of string or line' },
      { pattern: '\\b', zh: '单词边界', en: 'Word boundary' },
      { pattern: '\\B', zh: '非单词边界', en: 'Not a word boundary' },
      { pattern: '(?=…)', zh: '正向先行断言', en: 'Positive lookahead' },
      { pattern: '(?!…)', zh: '负向先行断言', en: 'Negative lookahead' },
      { pattern: '(?<=…)', zh: '正向后行断言', en: 'Positive lookbehind' },
      { pattern: '(?<!…)', zh: '负向后行断言', en: 'Negative lookbehind' },
    ],
  },
  {
    key: 'group',
    titleZh: '分组与引用',
    titleEn: 'Groups & references',
    items: [
      { pattern: '(…)', zh: '捕获分组', en: 'Capturing group' },
      { pattern: '(?:…)', zh: '非捕获分组', en: 'Non-capturing group' },
      { pattern: '(?<name>…)', zh: '命名捕获组', en: 'Named capturing group' },
      { pattern: '\\1', zh: '反向引用第 1 个分组', en: 'Backreference to group 1' },
      { pattern: '$1', zh: '替换文本里引用第 1 个分组', en: 'Group 1 in replacement' },
      { pattern: '(a|b)', zh: 'a 或 b', en: 'a or b' },
    ],
  },
  {
    key: 'flag',
    titleZh: '修饰符',
    titleEn: 'Flags',
    items: [
      { pattern: 'g', zh: '全局匹配，找出所有结果', en: 'Global, find all matches' },
      { pattern: 'i', zh: '忽略大小写', en: 'Case-insensitive' },
      { pattern: 'm', zh: '多行：^ 和 $ 逐行生效', en: 'Multiline ^ and $' },
      { pattern: 's', zh: '让 . 也能匹配换行符', en: 'Dot matches newline' },
      { pattern: 'u', zh: 'Unicode 模式', en: 'Unicode mode' },
      { pattern: 'v', zh: 'Unicode 集合模式（u 的升级）', en: 'Unicode sets mode' },
      { pattern: 'y', zh: '粘性匹配，从 lastIndex 处开始', en: 'Sticky matching' },
    ],
  },
  {
    key: 'cjk',
    titleZh: '中文与特殊',
    titleEn: 'CJK & specials',
    items: [
      { pattern: '[\\u4e00-\\u9fa5]', zh: '常用汉字', en: 'Common CJK ideograph' },
      { pattern: '\\p{Script=Han}', zh: '汉字（需配合 u 修饰符）', en: 'Han script, needs u flag' },
      { pattern: '^[\\u4e00-\\u9fa5]+$', zh: '整串都是中文', en: 'Entirely Chinese' },
      { pattern: '^\\s*$', zh: '空行或只有空白的行', en: 'Blank line' },
      { pattern: '\\r?\\n', zh: '跨平台换行', en: 'Cross-platform newline' },
      { pattern: '^\\s+|\\s+$', zh: '首尾空白，用于 trim', en: 'Leading/trailing whitespace' },
    ],
  },
];

export interface RegexPreset {
  key: string;
  labelZh: string;
  labelEn: string;
  pattern: string;
  text: string;
}

/**
 * 「常用」预设条。
 *
 * 每个预设都同时给出正则和一段配套的测试文本 —— 只填正则不填文本的话，
 * 用户点完看到的还是空结果，等于没给。text 里的 \n 会在填入时变成真换行。
 */
export const REGEX_PRESETS: RegexPreset[] = [
  {
    key: 'email',
    labelZh: '邮箱',
    labelEn: 'Email',
    pattern: '\\b[\\w.%+-]+@[\\w.-]+\\.[A-Za-z]{2,}\\b',
    text: '联系：support@gjxtools.com\n业务：biz@gjxtools.com\n不是邮箱：192.168.1.1',
  },
  {
    key: 'mobile',
    labelZh: '手机号',
    labelEn: 'Mobile',
    pattern: '1[3-9]\\d{9}',
    text: '13800138000 10086 19912345678 12345678901',
  },
  {
    key: 'date',
    labelZh: '日期',
    labelEn: 'Date',
    pattern: '\\d{4}-\\d{2}-\\d{2}',
    text: '2024-01-15 12/25/2023 2024-13-01',
  },
  {
    key: 'idcard',
    labelZh: '身份证号',
    labelEn: 'ID card',
    pattern: '(^\\d{15}$)|(^\\d{18}$)|(^\\d{17}[\\dXx]$)',
    text: '110101199003071234\n110101900307123\n11010119900307123X',
  },
  {
    key: 'ipv4',
    labelZh: 'IPv4',
    labelEn: 'IPv4',
    pattern: '\\b((25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\.){3}(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\b',
    text: '192.168.1.1 999.999.999.999 10.0.0.255',
  },
  {
    key: 'number',
    labelZh: '整数/浮点',
    labelEn: 'Number',
    pattern: '(-?\\d+)(\\.\\d+)?',
    text: '12.50 -12 1234 .99',
  },
  {
    key: 'hexcolor',
    labelZh: '十六进制色',
    labelEn: 'Hex color',
    pattern: '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$',
    text: '#fff\n#FFF000\n#gg0\n#aabbcc',
  },
  {
    key: 'image',
    labelZh: '图片文件',
    labelEn: 'Image file',
    pattern: '(\\w+)\\.(jpg|png|gif|webp)',
    text: 'photo.jpg test.txt logo.gif banner.webp',
  },
  {
    key: 'password',
    labelZh: '密码强度',
    labelEn: 'Password',
    pattern: '^(?=.*[A-Z])(?=.*\\d).{8,}$',
    text: 'Pass1word\nabc\nStrongP4ss',
  },
  {
    key: 'chinese',
    labelZh: '中文',
    labelEn: 'Chinese',
    pattern: '[\\u4e00-\\u9fa5]+',
    text: 'ABC#123中文456def',
  },
];
