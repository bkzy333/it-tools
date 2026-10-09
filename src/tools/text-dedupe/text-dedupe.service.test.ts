import { describe, expect, it } from 'vitest';
import {
  addOrUpdateCount,
  runTextDedupe,
  toStatisticsCsv,
  type CountModeOptions,
  type DedupeModeOptions,
  type TextDedupeOptions,
} from './text-dedupe.service';

const dedupeBase = {
  input: 'apple\n banana\npear\napple\norange\npear',
  inputDelimiterKey: '1', // 换行符
  inputDelimiterCustom: '',
  removeFirstLastSpace: true,
  removeEmptyLine: true,
};

// spread 顺序有两处讲究（踩过坑，别随手重排）：
//   1. 默认值必须写在 patch 前面，否则 patch 里的 orderBy 会被默认值盖掉，
//      测试就变成「按出现次数排序」静默失效 —— 但单测是绿的，这种假绿最坑。
//   2. tab 必须写在最后：patch 含可选的 tab，放前面的话结果类型里的 tab 会
//      被撑成 'dedupe' | 'count' 联合，过不了 TextDedupeOptions 的静态检查。
function dedupe(patch: Partial<DedupeModeOptions> = {}): DedupeModeOptions {
  return {
    ...dedupeBase,
    orderBy: 'none',
    removeRepeat: true,
    showLineNumber: false,
    outputDelimiterKey: '1',
    outputDelimiterCustom: '',
    quoteItems: false,
    ...patch,
    tab: 'dedupe',
  };
}

// patch 的类型必须是 count 这一档自己的字段（Partial<Omit<CountModeOptions,'tab'>>），
// 不能图省事写 Partial<TextDedupeOptions>：那会让 orderBy 被撑成
// DedupeOrder | DuplicateCountOrder，末了 tab:'count' 收窄不了它，
// 报 Type '"desc"' is not assignable to type 'DuplicateCountOrder'。
function count(patch: Partial<Omit<CountModeOptions, 'tab'>> = {}): TextDedupeOptions {
  return { ...dedupeBase, orderBy: 'none', ...patch, tab: 'count' };
}

describe('去重排序 Tab', () => {
  it('去重 + 去首尾空格 + 去空行', () => {
    const r = runTextDedupe(dedupe());
    // ' banana' 被 trim 成 'banana' 后才算重复，按首次出现顺序留下 apple/banana/pear/orange
    expect(r.output).toBe('apple\nbanana\npear\norange');
    expect(r.stats.total).toBe(6);
    expect(r.stats.empty).toBe(0);
  });

  it('统计：总行数 / 重复行数 / 空行数', () => {
    const r = runTextDedupe(dedupe({ input: 'a\na\nb\n\n \nc' }));
    expect(r.stats.total).toBe(6);
    expect(r.stats.empty).toBe(2); // 空行 + 纯空白行
    expect(r.stats.duplicate).toBe(1);
  });

  it('去掉重复行时保留首次出现的位置', () => {
    const r = runTextDedupe(dedupe({ input: 'c\nb\nc\na\nb' }));
    expect(r.output).toBe('c\nb\na');
  });

  it('排序 + 行号（只用 ASCII 断言，localeCompare 不传 locale）', () => {
    const r = runTextDedupe(dedupe({ input: 'c\na\nb\nc', orderBy: 'asc', showLineNumber: true }));
    expect(r.output).toBe('1：a\n2：b\n3：c');
  });

  it('参考站原行为：去重关闭时重复行会留在结果里，别顺手「修」', () => {
    const r = runTextDedupe(dedupe({ input: 'a\nb\na', removeRepeat: false }));
    expect(r.output).toBe('a\nb\na');
  });

  it('输出分隔符：逗号连接', () => {
    const r = runTextDedupe(dedupe({ input: 'a\nb\na\nc', outputDelimiterKey: '4' }));
    expect(r.output).toBe('a,b,c');
  });

  it('引号包裹：生成数组字符串', () => {
    const r = runTextDedupe(
      dedupe({ input: 'aa\nbb\ncc\ndd', outputDelimiterKey: '4', quoteItems: true }),
    );
    expect(r.output).toBe("'aa','bb','cc','dd'");
  });
});

describe('行重复统计 Tab', () => {
  it('输出「文本    出现次数：N 次」', () => {
    const r = runTextDedupe(count({ input: 'apple, banana,pear,apple,orange,pear', inputDelimiterKey: '4' }));
    expect(r.output).toBe(
      'apple    出现次数：2 次\nbanana    出现次数：1 次\npear    出现次数：2 次\norange    出现次数：1 次',
    );
  });

  it('按出现次数降序 / 升序', () => {
    const desc = runTextDedupe(count({ input: 'a\nb\na\nb\nb\nc', orderBy: 'count-desc' }));
    expect(desc.items.map((i) => i.key)).toEqual(['b', 'a', 'c']);

    const asc = runTextDedupe(count({ input: 'a\nb\na\nb\nb\nc', orderBy: 'count-asc' }));
    expect(asc.items.map((i) => i.key)).toEqual(['c', 'a', 'b']);
  });

  it('统计口径与去重 Tab 一致：重复 = 总行数 − 不同行数 − 空行数', () => {
    const r = runTextDedupe(count({ input: 'a\na\nb\n\nc', inputDelimiterKey: '1' }));
    expect(r.stats.total).toBe(5);
    expect(r.stats.empty).toBe(1); // 空行
    expect(r.stats.duplicate).toBe(1); // 总 5 − 不同 3 − 空 1
    // 计数表里含一条 key 为 '' 的空行记录，所以是 4 项
    expect(r.items.map((i) => [i.key, i.count])).toEqual([['a', 2], ['b', 1], ['', 1], ['c', 1]]);
  });

  it('CSV 导出：表头「文本,出现次数」+ key,count', () => {
    const r = runTextDedupe(count({ input: 'a\na\nb', inputDelimiterKey: '1' }));
    expect(toStatisticsCsv(r.items)).toBe('文本,出现次数\na,2\nb,1');
  });
});

describe('addOrUpdateCount', () => {
  it('新键返回 true、已键返回 false（参考站 addOrUpdateArr 的返回值语义）', () => {
    const items: { key: string; count: number }[] = [];
    expect(addOrUpdateCount(items, 'a')).toBe(true);
    expect(addOrUpdateCount(items, 'a')).toBe(false);
    expect(items).toEqual([{ key: 'a', count: 2 }]);
  });
});

describe('边界', () => {
  it('输入为空返回空统计，不抛错', () => {
    const r = runTextDedupe(dedupe({ input: '' }));
    expect(r.output).toBe('');
    expect(r.stats).toEqual({ total: 0, duplicate: 0, empty: 0 });
    expect(r.items).toEqual([]);
  });

  it('自定义分隔符生效（Key 0 时取自定义框内容）', () => {
    const r = runTextDedupe(dedupe({ input: 'a---b---a', inputDelimiterKey: '0', inputDelimiterCustom: '---' }));
    expect(r.output).toBe('a\nb');
  });
});
