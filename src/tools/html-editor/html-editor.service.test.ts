// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  DEVICE_PRESETS,
  EDITOR_STYLE_ID,
  decodeHtmlFile,
  detectDeclaredCharset,
  looksLikeFullDocument,
  serializeFrame,
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
});
