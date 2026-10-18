// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  DEVICE_PRESETS,
  EDITOR_SELECTED_ATTR,
  EDITOR_STYLE_ID,
  clampZoom,
  clearInlineStyles,
  decodeHtmlFile,
  describeElement,
  detectDeclaredCharset,
  elementPath,
  fitScaleFor,
  logicalHeightFor,
  looksLikeFullDocument,
  nextZoomStep,
  normalizeFontWeight,
  normalizeTextAlign,
  parsePixelValue,
  readElementStyles,
  serializeFrame,
  toHexColor,
} from './html-editor.service';

/**
 * 造字节用的三个小工具。
 *
 * 为什么不写 `Buffer.from(text, 'gb18030')`：Node 的 Buffer 压根不支持 gb18030，
 * 它会静默走到 catch 分支，测试变成「拿空数组去解码」—— 看着是绿的，其实什么都没测。
 * 所以 GBK 的字节直接写真实值。
 */
const utf8 = (text: string) => new Uint8Array(new TextEncoder().encode(text));
const asciiBytes = (text: string) => Array.from(text, char => char.charCodeAt(0));
/** '测试' 的 GBK 编码 */
const GBK_CE_SHI = [0xB2, 0xE2, 0xCA, 0xD4];

describe('decodeHtmlFile', () => {
  it('无 BOM 的 UTF-8 文件按 UTF-8 解出', () => {
    const source = '<p>中文内容</p>';
    const result = decodeHtmlFile(utf8(source));

    expect(result.text).toBe(source);
    expect(result.encoding).toBe('utf-8');
    expect(result.hadBom).toBe(false);
  });

  it('UTF-8 BOM 会被剥掉，不残留在源码里', () => {
    const source = '<p>带 BOM</p>';
    const withBom = new Uint8Array([0xEF, 0xBB, 0xBF, ...utf8(source)]);
    const result = decodeHtmlFile(withBom);

    expect(result.text).toBe(source);
    expect(result.text.charCodeAt(0)).not.toBe(0xFEFF);
    expect(result.hadBom).toBe(true);
  });

  it('GBK 中文文件不会变成乱码', () => {
    const bytes = new Uint8Array([...asciiBytes('<p>'), ...GBK_CE_SHI, ...asciiBytes('</p>')]);
    const result = decodeHtmlFile(bytes);

    expect(result.text).toBe('<p>测试</p>');
    expect(result.encoding).toBe('gb18030');
  });

  it('文件声明的 GB2312 也能救回来（映射到 GB18030 超集）', () => {
    const bytes = new Uint8Array([
      ...asciiBytes('<meta charset="gb2312"><p>'),
      ...GBK_CE_SHI,
      ...asciiBytes('</p>'),
    ]);
    const result = decodeHtmlFile(bytes);

    expect(result.text).toBe('<meta charset="gb2312"><p>测试</p>');
    expect(result.encoding).toBe('gb18030');
  });

  it('「能按 UTF-8 严格解出」优先级高于文件里的 charset 声明', () => {
    const source = '<meta charset="gb2312"><p>其实是 utf8</p>';
    const result = decodeHtmlFile(utf8(source));

    expect(result.text).toBe(source);
    expect(result.encoding).toBe('utf-8');
  });

  it('空文件不炸', () => {
    const result = decodeHtmlFile(new Uint8Array([]));

    expect(result.text).toBe('');
    expect(result.encoding).toBe('utf-8');
  });
});

describe('detectDeclaredCharset', () => {
  it('识别带引号与不带引号的写法', () => {
    expect(detectDeclaredCharset(utf8('<meta charset="GBK">'))).toBe('gb18030');
    expect(detectDeclaredCharset(utf8("<meta http-equiv='Content-Type' content='text/html; charset=utf-8'>"))).toBe('utf-8');
  });

  it('没有声明时返回 null', () => {
    expect(detectDeclaredCharset(utf8('<p>无声明</p>'))).toBeNull();
  });
});

describe('looksLikeFullDocument', () => {
  it('有 doctype 或 html 标签算完整文档', () => {
    expect(looksLikeFullDocument('<!DOCTYPE html><html><body>x</body></html>')).toBe(true);
    expect(looksLikeFullDocument('<!doctype html>')).toBe(true);
    expect(looksLikeFullDocument('<html lang="zh">')).toBe(true);
  });

  it('片段不算完整文档', () => {
    expect(looksLikeFullDocument('<div class="card">hello</div>')).toBe(false);
    expect(looksLikeFullDocument('<h1>标题</h1><p>正文</p>')).toBe(false);
  });
});

describe('DEVICE_PRESETS', () => {
  it('三档都是真实视口宽度：桌面 1280、平板 768、手机 375', () => {
    expect(DEVICE_PRESETS.map(preset => [preset.key, preset.width])).toEqual([
      ['desktop', 1280],
      ['tablet', 768],
      ['mobile', 375],
    ]);
  });

  it('档位宽度单调递减（否则「桌面」会比「平板」还窄，档位名就是谎话）', () => {
    const widths = DEVICE_PRESETS.map(preset => preset.width);

    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]).toBeLessThan(widths[i - 1]);
    }
  });
});

describe('serializeFrame', () => {
  function buildFrame(html: string): Document {
    document.open();
    document.write(html);
    document.close();

    return document;
  }

  it('片段源码只回 body 内容，不凭空加上 html/body', () => {
    const doc = buildFrame('<div class="card">hello</div>');
    const result = serializeFrame(doc, { asDocument: false });

    expect(result).toBe('<div class="card">hello</div>');
    expect(result).not.toContain('<body>');
  });

  it('完整文档回整份文档并补回 doctype', () => {
    const doc = buildFrame('<!DOCTYPE html><html><head><title>t</title></head><body><p>x</p></body></html>');
    const result = serializeFrame(doc, { asDocument: true });

    expect(result.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(result).toContain('<p>x</p>');
  });

  it('注入的编辑样式与 contenteditable 不会被写进用户源码，且随后还原', () => {
    const doc = buildFrame('<p>x</p>');
    const style = doc.createElement('style');
    style.id = EDITOR_STYLE_ID;
    style.textContent = 'body{}';
    doc.head.appendChild(style);
    doc.body.setAttribute('contenteditable', 'true');

    const result = serializeFrame(doc, { asDocument: false });

    expect(result).toBe('<p>x</p>');
    expect(result).not.toContain(EDITOR_STYLE_ID);
    expect(result).not.toContain('contenteditable');

    // 用户还在编辑，编辑态与样式必须还原回去
    expect(doc.getElementById(EDITOR_STYLE_ID)).not.toBeNull();
    expect(doc.body.getAttribute('contenteditable')).toBe('true');
  });

  it('选中元素的描边属性不会被写进用户源码，且随后还原', () => {
    const doc = buildFrame('<div class="card"><h1>标题</h1></div>');
    const heading = doc.querySelector('h1')!;
    heading.setAttribute(EDITOR_SELECTED_ATTR, 'true');

    const result = serializeFrame(doc, { asDocument: false });

    expect(result).not.toContain(EDITOR_SELECTED_ATTR);
    expect(result).toBe('<div class="card"><h1>标题</h1></div>');

    // 用户还选着这个元素，描边得还给他
    expect(heading.getAttribute(EDITOR_SELECTED_ATTR)).toBe('true');
  });
});

describe('toHexColor', () => {
  it('把 getComputedStyle 给的 rgb()/rgba() 转成 hex', () => {
    expect(toHexColor('rgb(31, 41, 51)')).toBe('#1f2933');
    expect(toHexColor('rgba(24, 160, 88, 1)')).toBe('#18a058');
    expect(toHexColor('rgba(24, 160, 88, 0.5)')).toBe('#18a058');
    expect(toHexColor('rgb(0 0 0)')).toBe('#000000');
  });

  it('本来已是 hex 的直接归一（统一小写、三位补六位）', () => {
    expect(toHexColor('#1F2933')).toBe('#1f2933');
    expect(toHexColor('#18a')).toBe('#1188aa');
  });

  it('完全透明与解析不出的返回 null —— 面板据此显示「未设置」，而不是编一个颜色', () => {
    expect(toHexColor('rgba(0, 0, 0, 0)')).toBeNull();
    expect(toHexColor('color(srgb 1 0 0)')).toBeNull();
    expect(toHexColor('')).toBeNull();
  });
});

describe('parsePixelValue', () => {
  it('像素值取整，非像素值一律 0', () => {
    expect(parsePixelValue('32px')).toBe(32);
    expect(parsePixelValue('0px')).toBe(0);
    expect(parsePixelValue('24.6px')).toBe(25);
    expect(parsePixelValue('auto')).toBe(0);
    expect(parsePixelValue('1.5em')).toBe(0);
    expect(parsePixelValue('')).toBe(0);
  });
});

describe('normalizeTextAlign', () => {
  it('start/end 归一到具体方向（标准模式下 computed 给的就是 start/end）', () => {
    expect(normalizeTextAlign('start')).toBe('left');
    expect(normalizeTextAlign('end')).toBe('right');
    expect(normalizeTextAlign('center')).toBe('center');
  });

  it('识别不了的（justify）原样返回，免得把文档里的原值改掉', () => {
    expect(normalizeTextAlign('justify')).toBe('justify');
  });
});

describe('normalizeFontWeight', () => {
  it('归一到常规 / 粗体两档，下拉框不会匹配不到值而显示空白', () => {
    expect(normalizeFontWeight('400')).toBe('400');
    expect(normalizeFontWeight('500')).toBe('400');
    expect(normalizeFontWeight('600')).toBe('700');
    expect(normalizeFontWeight('700')).toBe('700');
    expect(normalizeFontWeight('bold')).toBe('400');
  });
});

describe('elementPath / describeElement', () => {
  it('路径从 body 到自身，含每一级', () => {
    document.body.innerHTML = '<div class="card"><h1>标题</h1></div>';
    const path = elementPath(document.querySelector('h1')!);

    expect(path.map(describeElement)).toEqual(['body', 'div.card', 'h1']);
  });

  it('容器自身的路径只有自己', () => {
    document.body.innerHTML = '<p>x</p>';

    expect(elementPath(document.body).map(describeElement)).toEqual(['body']);
  });

  it('显示名带第一个 class，同级兄弟才分得清', () => {
    document.body.innerHTML = '<div class="card big">x</div>';

    expect(describeElement(document.querySelector('div')!)).toBe('div.card');
  });
});

describe('clearInlineStyles', () => {
  it('元素与子节点的内联样式一起清掉，其它属性不动', () => {
    document.body.innerHTML = '<div style="color: red" id="a"><p style="font-size: 20px" data-x="1">x</p></div>';
    const root = document.querySelector('#a')!;

    clearInlineStyles(root);

    expect(root.hasAttribute('style')).toBe(false);
    expect(document.querySelector('p')!.hasAttribute('style')).toBe(false);
    expect(document.querySelector('p')!.getAttribute('data-x')).toBe('1');
  });
});

describe('readElementStyles', () => {
  it('读的是生效值：内联样式覆盖默认值后能读到新值', () => {
    document.body.innerHTML = '<h1 style="font-size: 32px; color: rgb(31, 41, 51); text-align: center">x</h1>';
    const values = readElementStyles(window, document.querySelector('h1')!);

    expect(values.fontSize).toBe(32);
    expect(values.color).toBe('#1f2933');
    expect(values.textAlign).toBe('center');
  });

  it('未设内联样式时也能给出四向盒模型数值（不会缺字段）', () => {
    document.body.innerHTML = '<p>x</p>';
    const values = readElementStyles(window, document.querySelector('p')!);

    expect(Object.keys(values.padding).sort()).toEqual(['bottom', 'left', 'right', 'top']);
    expect(Object.keys(values.margin).sort()).toEqual(['bottom', 'left', 'right', 'top']);
    expect(values.padding.top).toBe(0);
  });
});


describe('预览缩放', () => {
  it('适应宽度：面板比档位窄按比例缩，比档位宽不放大', () => {
    expect(fitScaleFor(400, 1280)).toBeCloseTo(0.3125);
    // 375 的手机档在 800px 面板里不往外扩，否则「手机宽度」就成了假话
    expect(fitScaleFor(800, 375)).toBe(1);
    expect(fitScaleFor(0, 1280)).toBe(1);
  });

  it('逻辑视口高度按适应比例反算，并钳在上下限里', () => {
    expect(logicalHeightFor(640, 0.5, 420, 2400)).toBe(1280);
    expect(logicalHeightFor(640, 1, 420, 2400)).toBe(640);
    expect(logicalHeightFor(640, 0.1, 420, 2400)).toBe(2400);
    expect(logicalHeightFor(200, 1, 420, 2400)).toBe(420);
    // 比例异常（0 / 负数）兜回 1，别算出 Infinity 高度把 iframe 撑爆
    expect(logicalHeightFor(640, 0, 420, 2400)).toBe(640);
  });

  it('不在档位表里的比例（适应宽度给的 0.39）也能走到相邻档位', () => {
    expect(nextZoomStep(0.39, 1)).toBe(0.5);
    expect(nextZoomStep(0.39, -1)).toBe(0.33);
    expect(nextZoomStep(1, 1)).toBe(1.25);
    expect(nextZoomStep(1, -1)).toBe(0.9);
  });

  it('档位走到头停在边界，不返回 undefined', () => {
    expect(nextZoomStep(3, 1)).toBe(3);
    expect(nextZoomStep(0.1, -1)).toBe(0.1);
    expect(nextZoomStep(2.9, 1)).toBe(3);
    expect(nextZoomStep(0.11, -1)).toBe(0.1);
  });

  it('比例夹在 10%~300%，非法值兜回 100%', () => {
    expect(clampZoom(0.01)).toBe(0.1);
    expect(clampZoom(99)).toBe(3);
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(clampZoom(0)).toBe(1);
  });

  it('放大只放大画面：iframe 视口高度不跟着缩小，能看到的内容不会变少', () => {
    const fit = fitScaleFor(500, 1280);
    const logical = logicalHeightFor(640, fit, 420, 2400);

    expect(logical).toBe(Math.round(640 / fit));
    // 早先的写法是「显示高度恒定」，放大 200% 后视口会只剩 320px —— 这里必须比编辑区高
    expect(logical).toBeGreaterThan(640);
  });
});
