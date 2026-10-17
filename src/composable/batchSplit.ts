/**
 * 批量切分的统一实现 —— 全站「待转换内容怎么切成一条条」的唯一出口。
 *
 * 为什么集中在这里：之前 rmb-numbers 自己写了一套 splitTokens，其余工具各有各的
 * split(/\r?\n/)，写法散落且容易踩两个坑：① 自定义分隔符不转义，用户输入 `.` 或 `|`
 * 直接炸；② 不 trim、不丢空行，批量输 20 条里夹几个空行就多出几行空结果。
 *
 * 约定（对齐 UX 契约 U1/U5，黄金范例 rmb-numbers）：
 * - 默认按换行分隔；同时支持逗号、顿号、用户自定义符号
 * - 自定义分隔符必须 escapeRegex，否则正则元字符会让整批解析失败
 * - 空行静默忽略，不算一条结果
 * - 逐条 trim，容忍从 Excel / 微信复制过来的前后空白
 */

export type SepMode = 'newline' | 'comma' | 'pause' | 'custom';

/**
 * 批量结果表的一行。类型放在这里（而不是组件的 <script setup> 里），
 * 因为 SFC 的 script setup 不允许 export，工具侧拿不到类型。
 */
export interface BatchRow {
  /** 原始输入条目 */
  input: string;
  /** 转换结果；error 为 true 时表示本条失败，原位标红但不跳过 */
  output: string;
  error?: boolean;
  /**
   * 额外列的单元格（可选）：与 BatchResultTable 的 `columns` 标签一一对应。
   *
   * 用于「一条输入解析出一组字段」的场景（身份证 → 地区/生日/性别/年龄/生肖/星座）：
   * 只塞成 output 一段拼接文本的话，用户没法按列对账、也没法把某一列单独拿去用。
   * 不传就还是标准的两列（A 列输入 / B 列输出），既有工具行为完全不变。
   * 失败行也要给满长度（缺失位置填空字符串），否则各行列会错位。
   */
  extra?: string[];
}


/** 转义正则元字符：自定义分隔符必须过这一步，否则 `.` `|` `(` 会让 new RegExp 抛错。 */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 按分隔符把整段文本切成条目。
 * @param text 用户粘贴的整段内容
 * @param mode 分隔模式
 * @param customSep mode 为 'custom' 时的自定义分隔符；为空则退回按换行切
 */
export function splitTokens(text: string, mode: SepMode, customSep = ''): string[] {
  let parts: string[];

  if (mode === 'newline') {
    parts = text.split(/\r?\n/);
  } else if (mode === 'comma') {
    parts = text.split(',');
  } else if (mode === 'pause') {
    parts = text.split('、');
  } else {
    const custom = customSep.trim();
    parts = custom ? text.split(new RegExp(escapeRegex(custom))) : text.split(/\r?\n/);
  }

  // trim 后丢空行：不要把空行算成一行结果
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}
