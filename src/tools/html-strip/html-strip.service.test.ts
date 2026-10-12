import { describe, expect, it } from 'vitest';
import { decodeEntities, stripHtml, type HtmlStripOptions } from './html-strip.service';

const base: HtmlStripOptions = {
  removeStyle: false,
  removeId: false,
  removeClass: false,
  stripTags: false,
  decodeEntities: false,
  preserveNewlines: true,
};

describe('decodeEntities', () => {
  it('解码命名实体与数字实体', () => {
    expect(decodeEntities('a &amp; b &lt;c&gt; &quot;x&quot; &apos;y&apos;')).toBe('a & b <c> "x" \'y\'');
    expect(decodeEntities('&#65; &#x41;')).toBe('A A');
    expect(decodeEntities('&#169;')).toBe('©');
  });
  it('无法识别的实体原样保留', () => {
    expect(decodeEntities('&zzz; &amp')).toBe('&zzz; &amp');
  });
});

describe('属性清理模式 (stripTags=false)', () => {
  it('仅移除 style 属性', () => {
    const out = stripHtml('<div class="x" id="y" style="color:red">t</div>', { ...base, removeStyle: true });
    expect(out).toContain('<div class="x" id="y">');
    expect(out).not.toContain('style=');
  });

  it('同时移除 style/id/class', () => {
    const out = stripHtml('<div class="x" id="y" style="color:red"><p class="t">Hello <b>World</b></p><a href="u" class="l">link</a></div>', {
      ...base,
      removeStyle: true,
      removeId: true,
      removeClass: true,
    });
    expect(out).not.toContain('class=');
    expect(out).not.toContain('id=');
    expect(out).not.toContain('style=');
    expect(out).toContain('<div>');
    expect(out).toContain('<p>');
    expect(out).toContain('<a href="u">');
    expect(out).toContain('<b>World</b>');
  });

  it('保留注释与 doctype', () => {
    const out = stripHtml('<!-- 注释 --><!DOCTYPE html><p class="x">t</p>', { ...base, removeClass: true });
    expect(out).toContain('<!-- 注释 -->');
    expect(out).toContain('<!DOCTYPE html>');
    expect(out).toContain('<p>t</p>');
  });

  it('自闭合标签保留其余属性', () => {
    const out = stripHtml('<img src="a.png" class="c" id="i" style="s" />', {
      ...base,
      removeStyle: true,
      removeId: true,
      removeClass: true,
    });
    expect(out).toBe('<img src="a.png" />');
  });

  it('布尔属性保留', () => {
    const out = stripHtml('<input disabled class="c">', { ...base, removeClass: true });
    expect(out).toBe('<input disabled>');
  });

  it('属性值含 > 不被误判', () => {
    const out = stripHtml('<div title="a > b" class="x">t</div>', { ...base, removeClass: true });
    expect(out).toBe('<div title="a > b">t</div>');
  });
});

describe('去标签模式 (stripTags=true)', () => {
  it('输出纯文本，无标签', () => {
    const out = stripHtml('<div class="c"><h1 id="h">Title</h1><p>Body <b>bold</b> text</p></div>', {
      ...base,
      stripTags: true,
    });
    expect(out).not.toContain('<');
    expect(out).toContain('Title');
    expect(out).toContain('Body bold text');
  });

  it('preserveNewlines=false 压成单行', () => {
    const out = stripHtml('<div><h1>Title</h1><p>Body text</p></div>', {
      ...base,
      stripTags: true,
      preserveNewlines: false,
    });
    expect(out).toBe('Title Body text');
  });

  it('解码实体', () => {
    const out = stripHtml('<p>a &amp; b &lt;c</p>', { ...base, stripTags: true, decodeEntities: true });
    expect(out).toContain('a & b <c');
  });

  it('丢弃 <script>/<style> 内部内容', () => {
    const out = stripHtml('<div>before<script>var x=1;</script>middle<style>.a{color:red}</style>after</div>', {
      ...base,
      stripTags: true,
    });
    expect(out).not.toContain('var x');
    expect(out).not.toContain('color:red');
    expect(out).toContain('before');
    expect(out).toContain('middle');
    expect(out).toContain('after');
  });

  it('丢弃注释与 doctype', () => {
    const out = stripHtml('<!-- c --><!DOCTYPE html><p>x</p>', { ...base, stripTags: true });
    expect(out).not.toContain('<!--');
    expect(out).not.toContain('DOCTYPE');
    expect(out).toContain('x');
  });
});
