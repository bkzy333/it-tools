export type SortOrder =
  | 'asc'
  | 'desc'
  | 'asc-num'
  | 'desc-num'
  | 'asc-bin'
  | 'desc-bin'
  | 'asc-upper'
  | 'desc-upper'
  | null
  | undefined;

export interface ByOrderOptions {
  order: SortOrder;
  /**
   * 传给 localeCompare 的 locale。
   *
   * 不传时 localeCompare 跟随宿主/浏览器语言：同一份代码在 en 机器和 zh 机器上
   * 对中文、带音标字符（á）的排序结果并不一致，调用方拿到的是环境相关的顺序。
   * 需要稳定顺序（例如单测、导出文件）时必须显式传值；
   * 不传则保持「跟随用户语言」的原行为，线上工具（list-converter）沿用不变。
   */
  locale?: string;
}

export function byOrder({ order, locale }: ByOrderOptions) {
  if (order === 'asc-bin' || order === 'desc-bin') {
    return (a: string, b: string) => {
      const compare = a > b ? 1 : a < b ? -1 : 0; // NOSONAR
      return order === 'asc-bin' ? compare : -compare;
    };
  }
  if (order === 'asc-num' || order === 'desc-num') {
    return (a: string, b: string) => {
      const compare = a.localeCompare(b, locale, {
        numeric: true,
      });
      return order === 'asc-num' ? compare : -compare;
    };
  }
  if (order === 'asc-upper' || order === 'desc-upper') {
    return (a: string, b: string) => {
      const compare = a.localeCompare(b, locale, {
        caseFirst: 'upper',
      });
      return order === 'asc-upper' ? compare : -compare;
    };
  }

  return (a: string, b: string) => {
    return order === 'asc' ? a.localeCompare(b, locale) : b.localeCompare(a, locale);
  };
}
