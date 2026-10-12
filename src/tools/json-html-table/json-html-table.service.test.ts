import { describe, it, expect } from 'vitest';
import { jsonToHtml, htmlToJson, htmlToJsonString } from './json-html-table.service';

const basic = [
  { name: '张三', age: 25, city: '北京' },
  { name: '李四', age: 30, city: '上海' },
];

describe('jsonToHtml', () => {
  it('对象数组 → 带 thead/tbody 的缩进 HTML（对齐参考站）', () => {
    expect(jsonToHtml({ data: basic, pretty: true })).toBe(
      [
        '<table>',
        '    <thead>',
        '        <tr>',
        '            <th>name</th>',
        '            <th>age</th>',
        '            <th>city</th>',
        '        </tr>',
        '    </thead>',
        '    <tbody>',
        '        <tr>',
        '            <td>张三</td>',
        '            <td>25</td>',
        '            <td>北京</td>',
        '        </tr>',
        '        <tr>',
        '            <td>李四</td>',
        '            <td>30</td>',
        '            <td>上海</td>',
        '        </tr>',
        '    </tbody>',
        '</table>',
      ].join('\n'),
    );
  });

  it('单个对象 → 单行表格', () => {
    expect(jsonToHtml({ data: { a: 1, b: 'x' }, pretty: false })).toBe(
      '<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td>x</td></tr></tbody></table>',
    );
  });

  it('嵌套对象/数组 → JSON 字符串存入单元格（引号转义为 &quot;，防 XSS）', () => {
    const out = jsonToHtml({ data: [{ addr: { city: 'BJ' }, tags: ['a', 'b'] }], pretty: false });
    expect(out).toContain('<td>{&quot;city&quot;:&quot;BJ&quot;}</td>');
    expect(out).toContain('<td>[&quot;a&quot;,&quot;b&quot;]</td>');
  });

  it('null/undefined → 空单元格', () => {
    const out = jsonToHtml({ data: [{ a: null, b: undefined }], pretty: false });
    expect(out).toContain('<td></td>');
  });

  it('HTML 特殊字符转义（防 XSS）', () => {
    const out = jsonToHtml({ data: [{ a: '<b>&"\'</b>' }], pretty: false });
    expect(out).toContain('<td>&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;</td>');
  });

  it('紧凑模式无多余空白', () => {
    const out = jsonToHtml({ data: basic, pretty: false });
    expect(out).not.toContain('\n');
    expect(out.startsWith('<table>')).toBe(true);
  });

  it('空输入 → 空 table 骨架', () => {
    expect(jsonToHtml({ data: [], pretty: false })).toBe(
      '<table><thead><tr></tr></thead><tbody></tbody></table>',
    );
  });

  it('多对象键并集作为表头', () => {
    const out = jsonToHtml({
      data: [{ a: 1 }, { b: 2 }, { a: 3, c: 4 }],
      pretty: false,
    });
    expect(out).toContain('<th>a</th>');
    expect(out).toContain('<th>b</th>');
    expect(out).toContain('<th>c</th>');
  });
});

describe('htmlToJson', () => {
  it('带 thead 的表格 → 对象数组，数字智能识别为 number', () => {
    const html =
      '<table><thead><tr><th>name</th><th>age</th></tr></thead><tbody><tr><td>张三</td><td>25</td></tr></tbody></table>';
    expect(htmlToJson({ html })).toEqual([{ name: '张三', age: 25 }]);
  });

  it('首行全 <th>（无 thead）→ 首行作表头', () => {
    const html = '<table><tr><th>k</th><th>v</th></tr><tr><td>a</td><td>1</td></tr></table>';
    expect(htmlToJson({ html })).toEqual([{ k: 'a', v: 1 }]);
  });

  it('无表头（首行全 <td>）→ 自动列名 column_1…', () => {
    const html = '<table><tr><td>a</td><td>b</td></tr><tr><td>1</td><td>2</td></tr></table>';
    expect(htmlToJson({ html })).toEqual([
      { column_1: 'a', column_2: 'b' },
      { column_1: 1, column_2: 2 },
    ]);
  });

  it('detectTypes=false → 全部当作字符串', () => {
    const html = '<table><tr><th>n</th></tr><tr><td>25</td></tr></table>';
    expect(htmlToJson({ html, detectTypes: false })).toEqual([{ n: '25' }]);
  });

  it('空单元格 → 空字符串', () => {
    const html = '<table><tr><th>a</th><th>b</th></tr><tr><td>x</td><td></td></tr></table>';
    expect(htmlToJson({ html })).toEqual([{ a: 'x', b: '' }]);
  });

  it('未找到 <table> → 空数组', () => {
    expect(htmlToJson({ html: '<div>no table</div>' })).toEqual([]);
  });

  it('解码实体，与 jsonToHtml 往返一致', () => {
    const src = [{ x: 'a<b>&c', y: 7 }];
    const html = jsonToHtml({ data: src, pretty: false });
    expect(htmlToJson({ html })).toEqual(src);
  });

  it('嵌套对象经 JSON 字符串往返', () => {
    const src = [{ obj: { city: 'BJ' }, list: [1, 2] }];
    const html = jsonToHtml({ data: src, pretty: false });
    const back = htmlToJson({ html });
    expect(back[0].obj).toBe('{"city":"BJ"}');
    expect(back[0].list).toBe('[1,2]');
  });
});

describe('htmlToJsonString', () => {
  it('pretty=true → 2 空格缩进 JSON', () => {
    const html = '<table><tr><th>a</th></tr><tr><td>1</td></tr></table>';
    expect(htmlToJsonString({ html, pretty: true })).toBe('[\n  {\n    "a": 1\n  }\n]');
  });

  it('pretty=false → 紧凑 JSON', () => {
    const html = '<table><tr><th>a</th></tr><tr><td>1</td></tr></table>';
    expect(htmlToJsonString({ html, pretty: false })).toBe('[{"a":1}]');
  });
});
