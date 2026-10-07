import { describe, expect, it } from 'vitest';
import { type SortOrder, byOrder } from './array';

// byOrder 的 localeCompare 允许按 locale 排序。这里所有断言都显式传 locale：
// 不传时跟随宿主/浏览器语言，同一份代码在 en 机器和 zh 机器上对中文、带音标字符的
// 排序结果不一样（曾经导致这台机器的单测挂掉），传固定 locale 才能跨环境复现。
// asc-bin / desc-bin 走的是码点比较，与 locale 无关，可以不传。
function makeSort(locale?: string) {
  return (array: string[], order: SortOrder) => array.sort(byOrder({ order, locale }));
}

describe('array utils', () => {
  describe('byOrder', () => {
    it('should sort correctly with an explicit locale', () => {
      const sortBy = makeSort('en');
      const strings = ['a', 'A', 'b', 'B', 'á', '1', '2', '10', '一', '阿'];

      expect(sortBy(strings, null)).to.eql(strings);
      expect(sortBy(strings, undefined)).to.eql(strings);
      expect(sortBy(strings, 'asc')).to.eql(['1', '10', '2', 'a', 'A', 'á', 'b', 'B', '一', '阿']);
      expect(sortBy(strings, 'asc-num')).to.eql(['1', '2', '10', 'a', 'A', 'á', 'b', 'B', '一', '阿']);
      expect(sortBy(strings, 'asc-bin')).to.eql(['1', '10', '2', 'A', 'B', 'a', 'b', 'á', '一', '阿']);
      expect(sortBy(strings, 'asc-upper')).to.eql(['1', '10', '2', 'A', 'a', 'á', 'B', 'b', '一', '阿']);
      expect(sortBy(strings, 'desc')).to.eql(['阿', '一', 'B', 'b', 'á', 'A', 'a', '2', '10', '1']);
      expect(sortBy(strings, 'desc-num')).to.eql(['阿', '一', 'B', 'b', 'á', 'A', 'a', '10', '2', '1']);
      expect(sortBy(strings, 'desc-bin')).to.eql(['阿', '一', 'á', 'b', 'a', 'B', 'A', '2', '10', '1']);
      expect(sortBy(strings, 'desc-upper')).to.eql(['阿', '一', 'b', 'B', 'á', 'a', 'A', '2', '10', '1']);
    });

    it('should sort chinese by pinyin under the zh locale', () => {
      const sortBy = makeSort('zh');
      const strings = ['一', '阿', 'b', 'B', 'a', 'A'];

      // ICU 的 zh collation 把汉字整体排在拉丁字母之前（阿、一 都在 a 前面），
      // 不是按拼音插进字母中间。这里锁的是这个实测行为，别照拼音直觉去改。
      expect(sortBy(strings, 'asc')).to.eql(['阿', '一', 'a', 'A', 'b', 'B']);
      expect(sortBy(strings, 'asc-num')).to.eql(['阿', '一', 'a', 'A', 'b', 'B']);
      expect(sortBy(strings, 'desc')).to.eql(['B', 'b', 'A', 'a', '一', '阿']);
    });

    it('should fall back to the host locale when none is given', () => {
      const sortBy = makeSort();
      // 只断言纯 ASCII：这部分顺序与 locale 无关，跟着宿主语言跑也成立。
      const strings = ['b', 'A', '10', 'a'];

      expect(sortBy(strings, 'asc')).to.eql(['10', 'a', 'A', 'b']);
      expect(sortBy(strings, 'desc')).to.eql(['b', 'A', 'a', '10']);
    });
  });
});
