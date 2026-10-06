// relationship.js 是原库发行文件（无类型声明），这里补一份最小类型，
// 只声明本项目实际用到的那几个字段，不试图描述库的全部能力。
export interface RelationshipOptions {
  /** 关系链（正向）或称谓（反向），例如「爸爸的妈妈」/「舅舅」 */
  text: string;
  /** 关系链的终点，正向查询时一般留空 */
  target?: string;
  /** 「我」的性别：-1 不限（默认）/ 1 男 / 0 女 */
  sex?: -1 | 0 | 1;
  /** 输出形式：default 称谓 / chain 关系链 / pair 互称 */
  type?: 'default' | 'chain' | 'pair';
  /** true 时由称谓反查关系链 */
  reverse?: boolean;
  mode?: string;
  optimal?: boolean;
}

declare function relationship(options: RelationshipOptions): string[];

export default relationship;
