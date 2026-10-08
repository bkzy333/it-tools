import { describe, expect, it } from 'vitest';
import { parseTableText, tableToObjects, tableToText, uniqueHeaderNames } from './parse-table';

describe('parseTableText', () => {
  it('默认按制表符切，丢掉空行', () => {
    const rows = parseTableText('a\tb\nc\td\n\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('行内列数不一致时补齐空串', () => {
    const rows = parseTableText('a\tb\nc');
    expect(rows).toEqual([
      ['a', 'b'],
      ['c', ''],
    ]);
  });

  it('切完会 trim 首尾空格，空文本返回空数组', () => {
    expect(parseTableText('  a \t b  ')[0]).toEqual(['a', 'b']);
    expect(parseTableText('   ')).toEqual([]);
  });

  it('换分隔符', () => {
    expect(parseTableText('a|b|c', '|')).toEqual([['a', 'b', 'c']]);
    expect(parseTableText('a, b , c', ',')).toEqual([['a', 'b', 'c']]);
  });
});

describe('tableToText', () => {
  it('制表符拼接，粘回 Excel 就是一列一列', () => {
    expect(tableToText([['a', '1'], ['b', '2']])).toBe('a\t1\nb\t2');
  });
});

describe('tableToObjects', () => {
  it('按传入的表头取列，列下标一一对应', () => {
    expect(tableToObjects([['张三', '100']], ['姓名', '金额'])).toEqual([{ 姓名: '张三', 金额: '100' }]);
    // 表头比数据长时最后一列补空串，不能把 undefined 塞进渲染层
    expect(tableToObjects([['张三']], ['姓名', '金额'])).toEqual([{ 姓名: '张三', 金额: '' }]);
  });

  it('空表或空表头返回空数组', () => {
    expect(tableToObjects([], ['a'])).toEqual([]);
    expect(tableToObjects([['a']], [])).toEqual([]);
  });
});

describe('uniqueHeaderNames', () => {
  it('同名列加序号，两表合并时不会两列长得一样', () => {
    expect(uniqueHeaderNames(['城市', '姓名', '城市', '电话'])).toEqual(['城市', '姓名', '城市·2', '电话']);
  });

  it('三列同名依次递增', () => {
    expect(uniqueHeaderNames(['城市', '城市', '城市'])).toEqual(['城市', '城市·2', '城市·3']);
  });

  it('空列名用列N 兜底且不会被判成重名', () => {
    expect(uniqueHeaderNames(['', '', '姓名'])).toEqual(['列1', '列2', '姓名']);
  });
});
