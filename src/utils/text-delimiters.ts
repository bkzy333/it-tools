/**
 * 文本工具共用的「分隔符」定义。
 *
 * 来源：参考站 toolhelper.cn 的 `delimiterArr`（定义于 /js/page/layout.min.js），
 * 其 Key 规则是 `0 = 自定义`（此时取文本框内容），1..8 = 预设分隔符。
 * split / join / dedupe / count 四个工具共用这一份，避免各处各写一份而分叉。
 *
 * 注意 Key 的顺序 (=="4" 是半角逗号，不是 5) 会影响「记住上次选择」的默认落点，
 * 也影响示例按钮里 setValue 的结果，别重排。
 */

export const CUSTOM_DELIMITER_KEY = '0';

export interface DelimiterOption {
  /** 选项值，同时也是被持久化的 key */
  key: string;
  /** 参考站的下拉文案（含示意符号），只用于对齐观感 */
  value: string;
  /** 本站 i18n 文案键，各工具在 texts: 下各自建一份同名 key */
  i18nKey: string;
  /** 实际使用的分隔符字符串；key === CUSTOM_DELIMITER_KEY 时为空（走自定义框） */
  delimiter: string;
}

export const DELIMITER_OPTIONS: DelimiterOption[] = [
  { key: '1', value: '换行符[↵]', delimiter: '\n', i18nKey: 'opt-delimiter-newline' },
  { key: '2', value: '制表符[⇥]', delimiter: '\t', i18nKey: 'opt-delimiter-tab' },
  { key: '3', value: '空格[ ]', delimiter: ' ', i18nKey: 'opt-delimiter-space' },
  { key: '4', value: '逗号[,]', delimiter: ',', i18nKey: 'opt-delimiter-comma' },
  { key: '5', value: '逗号[，]', delimiter: '，', i18nKey: 'opt-delimiter-comma-full' },
  { key: '6', value: '斜杠[/]', delimiter: '/', i18nKey: 'opt-delimiter-slash' },
  { key: '7', value: '分号[;]', delimiter: ';', i18nKey: 'opt-delimiter-semicolon' },
  { key: '8', value: '分号[；]', delimiter: '；', i18nKey: 'opt-delimiter-semicolon-full' },
  { key: CUSTOM_DELIMITER_KEY, value: '自定义', delimiter: '', i18nKey: 'opt-delimiter-custom' },
];

/**
 * 把「下拉选中值 + 自定义框内容」解析成真正的分隔符字符串。
 * 等价于参考站的 `getInputDelimiter()` / `getOutputDelimiter()`。
 */
export function resolveDelimiter(selectedKey: string, custom = ''): string {
  if (selectedKey === CUSTOM_DELIMITER_KEY) {
    return custom;
  }
  return DELIMITER_OPTIONS.find((option) => option.key === selectedKey)?.delimiter ?? '';
}

/** 参考站 `ys.isNullOrEmpty` 的口径：null / undefined / 空串。 */
export function isNullOrEmpty(value: string | null | undefined): boolean {
  return value === null || value === undefined || value === '';
}

/**
 * 参考站 `textArraySort(arr, orderBy)` 的移植：
 * '1' 不排序，'2' 升序，'3' 降序，其余原样返回。
 *
 * ⚠ 参考站这里用的是 `a.localeCompare(b)` —— **不传 locale**，所以排序结果跟随宿主语言。
 * 本机（Windows + zh）会走 ICU zh collation：汉字整体排在拉丁字母前面，不是按拼音插在字母中间。
 * 为了和参考站行为一致，这里同样不传 locale；因此**单测只能用纯 ASCII 断言**，
 * 一旦断言里出现汉字就会变成"本地过、CI 红"。要改确定性排序请显式传 locale，
 * 但那会偏离参考站，别顺手改。
 */
export function textArraySort<T extends string>(arr: T[], orderBy: string): T[] {
  const sorted = [...arr];
  switch (orderBy) {
    case '2':
      sorted.sort((a, b) => a.localeCompare(b));
      break;
    case '3':
      sorted.sort((a, b) => b.localeCompare(a));
      break;
    default:
      break;
  }
  return sorted;
}

/**
 * 参考站 `ys.trimAllSpace`：把**所有**空白字符（不只是头尾）全删掉。
 * 注意它和 `String.prototype.replaceAll(' ', '')` 不是一回事——制表符、全角空格也会被删。
 */
export function trimAllSpace(value: string): string {
  return value.replace(/\s*/g, '');
}
