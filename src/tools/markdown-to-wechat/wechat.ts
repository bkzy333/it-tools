/**
 * 公众号排版主题。
 *
 * 关键点：微信公众号的编辑器会把 <style> 标签和 class 全部剥掉，
 * 只保留元素上的内联 style。所以主题不能用"CSS 类"的思路组织，
 * 必须写成"选择器 → 内联样式表"，渲染完再逐条刷到 DOM 元素上。
 *
 * 每条规则都写成 [选择器, 样式对象] 而不是一整段 CSS 字符串，
 * 是为了能一条条 querySelectorAll 命中后 setProperty，避开 CSS 优先级问题。
 */

export interface ThemeRule {
  selector: string;
  styles: Record<string, string>;
}

export interface WechatTheme {
  key: string;
  name: string;
  rules: ThemeRule[];
}

function baseRules(accent: string, textColor: string, muted: string, codeBg: string): ThemeRule[] {
  return [
    {
      selector: 'p',
      styles: {
        margin: '0 0 18px',
        'font-size': '15px',
        'line-height': '1.75',
        color: textColor,
        'letter-spacing': '0.05em',
        'word-break': 'break-word',
      },
    },
    {
      selector: 'h1',
      styles: {
        margin: '28px 0 16px',
        'font-size': '20px',
        'font-weight': '700',
        color: accent,
        'line-height': '1.4',
        'text-align': 'center',
      },
    },
    {
      selector: 'h2',
      styles: {
        margin: '26px 0 14px',
        'font-size': '18px',
        'font-weight': '700',
        color: accent,
        'line-height': '1.4',
        'padding-left': '10px',
        'border-left': `4px solid ${accent}`,
      },
    },
    {
      selector: 'h3',
      styles: {
        margin: '22px 0 12px',
        'font-size': '16px',
        'font-weight': '700',
        color: accent,
        'line-height': '1.5',
      },
    },
    {
      selector: 'h4',
      styles: {
        margin: '18px 0 10px',
        'font-size': '15px',
        'font-weight': '700',
        color: textColor,
        'line-height': '1.5',
      },
    },
    {
      selector: 'blockquote',
      styles: {
        margin: '0 0 18px',
        padding: '10px 14px',
        'border-left': `3px solid ${accent}`,
        'background-color': '#f7f8fa',
        color: muted,
        'font-size': '14px',
        'line-height': '1.7',
      },
    },
    {
      selector: 'blockquote p',
      styles: { margin: '0' },
    },
    {
      selector: 'pre',
      styles: {
        margin: '0 0 18px',
        padding: '14px 16px',
        'background-color': codeBg,
        color: '#e6e6e6',
        'border-radius': '6px',
        'font-size': '13px',
        'line-height': '1.6',
        overflow: 'auto',
        '-webkit-overflow-scrolling': 'touch',
      },
    },
    {
      selector: 'pre code',
      styles: {
        background: 'transparent',
        padding: '0',
        color: 'inherit',
        'font-family': 'Menlo, Consolas, "Courier New", monospace',
      },
    },
    {
      selector: ':not(pre) > code',
      styles: {
        padding: '2px 5px',
        margin: '0 2px',
        'background-color': '#f2f3f5',
        color: accent,
        'border-radius': '3px',
        'font-size': '13px',
        'font-family': 'Menlo, Consolas, "Courier New", monospace',
      },
    },
    {
      selector: 'ul, ol',
      styles: {
        margin: '0 0 18px',
        'padding-left': '22px',
        'font-size': '15px',
        'line-height': '1.75',
        color: textColor,
      },
    },
    {
      selector: 'li',
      styles: { margin: '0 0 6px' },
    },
    {
      selector: 'a',
      styles: {
        color: accent,
        'text-decoration': 'none',
        'border-bottom': `1px solid ${accent}`,
        'word-break': 'break-all',
      },
    },
    {
      selector: 'strong',
      styles: { 'font-weight': '700', color: accent },
    },
    {
      selector: 'em',
      styles: { 'font-style': 'italic', color: muted },
    },
    {
      selector: 'img',
      styles: { 'max-width': '100%', height: 'auto', 'border-radius': '4px', display: 'block', margin: '0 auto 18px' },
    },
    {
      selector: 'hr',
      styles: { margin: '26px 0', border: 'none', 'border-top': `1px dashed ${accent}`, opacity: '0.4' },
    },
    {
      selector: 'table',
      styles: {
        width: '100%',
        margin: '0 0 18px',
        'border-collapse': 'collapse',
        'font-size': '13px',
      },
    },
    {
      selector: 'th',
      styles: {
        padding: '8px 10px',
        'background-color': '#f7f8fa',
        'border': '1px solid #e6e8eb',
        'font-weight': '600',
        'text-align': 'left',
      },
    },
    {
      selector: 'td',
      styles: {
        padding: '8px 10px',
        'border': '1px solid #e6e8eb',
        'word-break': 'break-word',
      },
    },
  ];
}

export const THEMES: WechatTheme[] = [
  { key: 'ink', name: '简约墨黑', rules: baseRules('#2b2b2b', '#3f3f3f', '#6b6b6b', '#2b2b2b') },
  { key: 'blue', name: '科技蓝', rules: baseRules('#1e6fd9', '#3f3f3f', '#6b6b6b', '#1f2430') },
  { key: 'orange', name: '活力橙', rules: baseRules('#ff7a45', '#3f3f3f', '#8a8a8a', '#2f2a26') },
];

/**
 * 把主题规则刷到 DOM 上。
 * 用 setProperty 而不是直接赋值 style.cssText，是因为 cssText 会覆盖掉
 * highlight.js 已经写在代码 span 上的颜色。
 */
export function applyTheme(container: HTMLElement, theme: WechatTheme) {
  for (const rule of theme.rules) {
    const nodes = container.querySelectorAll(rule.selector);
    for (const node of Array.from(nodes)) {
      if (!(node instanceof HTMLElement)) {
        continue;
      }
      for (const [property, value] of Object.entries(rule.styles)) {
        node.style.setProperty(property, value);
      }
    }
  }
}

/**
 * 复制富文本。
 * 优先走 ClipboardItem 写 text/html，浏览器不支持时退回 execCommand——
 * 后者虽然已经废弃，但它保留富文本格式的能力目前没有替代品，
 * 这也是所有公众号排版工具仍在用它的原因。
 */
export async function copyRichText(node: HTMLElement): Promise<boolean> {
  const html = node.innerHTML;
  const text = node.innerText;

  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ]);
      return true;
    }
  }
  catch {
    // 落到下面的 execCommand 兜底
  }

  try {
    const selection = window.getSelection();
    if (!selection) {
      return false;
    }
    const range = document.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
    const ok = document.execCommand('copy');
    selection.removeAllRanges();
    return ok;
  }
  catch {
    return false;
  }
}
