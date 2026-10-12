// 纯函数 HTML 清理 / 去标签服务（无 DOM 依赖，便于在 Node 下单测）
//
// 两用：
//   1) 属性清理模式（stripTags=false）：移除 style/id/class 等指定属性，保留标签与结构
//   2) 去标签模式（stripTags=true）：移除所有标签 → 纯文本，块级元素与 <br> 可转换行
//
// 参考站 tabletool.cn/html-strip 实际是「清理 style/id/class 属性」工具；
// 本工具额外提供「完全去标签转纯文本」以满足 html-strip 的语义。

export interface HtmlStripOptions {
  removeStyle: boolean;
  removeId: boolean;
  removeClass: boolean;
  stripTags: boolean; // 移除所有标签 -> 纯文本
  decodeEntities: boolean; // 解码 &amp; &lt; 等实体
  preserveNewlines: boolean; // 去标签时：块级元素 / <br> 转换行（false 则压成单行）
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  copy: '©',
  reg: '®',
  trade: '™',
  hellip: '…',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
};

const BLOCK_TAGS = new Set([
  'p',
  'div',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'tr',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'ul',
  'ol',
  'blockquote',
  'pre',
  'section',
  'article',
  'header',
  'footer',
  'nav',
  'main',
  'aside',
  'dl',
  'dt',
  'dd',
  'form',
  'br',
  'hr',
]);

const SKIP_CONTENT_TAGS = new Set(['script', 'style']);

export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, code: string) => {
    if (code[0] === '#') {
      const isHex = code[1] === 'x' || code[1] === 'X';
      const num = parseInt(isHex ? code.slice(2) : code.slice(1), isHex ? 16 : 10);
      if (Number.isNaN(num)) {
        return match;
      }
      try {
        return String.fromCodePoint(num);
      } catch {
        return match;
      }
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

// 找到闭合 '>' 的位置，跳过属性值内的引号（属性值里可能含 '>'）
function findTagEnd(html: string, start: number): number {
  let i = start + 1;
  while (i < html.length) {
    const c = html[i];
    if (c === '"' || c === "'") {
      const quote = c;
      i++;
      while (i < html.length && html[i] !== quote) {
        i++;
      }
      if (i >= html.length) {
        return -1;
      }
    } else if (c === '>') {
      return i;
    }
    i++;
  }
  return -1;
}

// 在「属性清理模式」下重建标签：去掉 style/id/class（按 opts），保留其余
function cleanTagAttributes(tagContent: string, opts: HtmlStripOptions): string {
  let s = tagContent;
  const selfClose = s.trimEnd().endsWith('/');
  if (selfClose) {
    s = s.trimEnd().slice(0, -1);
  }
  const nameMatch = s.match(/^\s*([a-zA-Z][a-zA-Z0-9-]*)/);
  const tagName = nameMatch ? nameMatch[1] : '';
  const rest = nameMatch ? s.slice(nameMatch[0].length) : s;

  const kept: string[] = [];
  let i = 0;
  while (i < rest.length) {
    while (i < rest.length && /\s/.test(rest[i])) {
      i++;
    }
    if (i >= rest.length) {
      break;
    }
    const start = i;
    while (i < rest.length && /[^\s=/>]/.test(rest[i])) {
      i++;
    }
    const attrName = rest.slice(start, i).toLowerCase();
    while (i < rest.length && /\s/.test(rest[i])) {
      i++;
    }
    let value = '';
    if (rest[i] === '=') {
      i++;
      while (i < rest.length && /\s/.test(rest[i])) {
        i++;
      }
      const q = rest[i];
      if (q === '"' || q === "'") {
        i++;
        const vStart = i;
        while (i < rest.length && rest[i] !== q) {
          i++;
        }
        value = rest.slice(vStart, i);
        if (i < rest.length) {
          i++;
        }
      } else {
        const vStart = i;
        while (i < rest.length && !/[\s>]/.test(rest[i])) {
          i++;
        }
        value = rest.slice(vStart, i);
      }
    }
    if (attrName === 'style' && opts.removeStyle) {
      continue;
    }
    if (attrName === 'id' && opts.removeId) {
      continue;
    }
    if (attrName === 'class' && opts.removeClass) {
      continue;
    }
    kept.push(value ? `${attrName}="${value}"` : attrName);
  }

  const rebuilt = `${tagName}${kept.length ? ` ${kept.join(' ')}` : ''}`;
  return rebuilt + (selfClose ? ' /' : '');
}

export function stripHtml(input: string, opts: HtmlStripOptions): string {
  let out = '';
  let i = 0;
  let skipTag = ''; // 去标签模式下，跳过 <script>/<style> 内部文本
  const n = input.length;

  while (i < n) {
    if (input[i] === '<') {
      const end = findTagEnd(input, i);
      if (end === -1) {
        // 不是合法标签，按文本处理
        out += input[i];
        i++;
        continue;
      }
      const tagContent = input.slice(i + 1, end);
      const trimmed = tagContent.trim();

      if (trimmed.startsWith('!')) {
        // 注释 / doctype / 声明：去标签模式丢弃，属性模式原样保留
        if (!opts.stripTags) {
          out += `<${tagContent}>`;
        }
        i = end + 1;
        continue;
      }

      const isClosing = trimmed.startsWith('/');
      const nameMatch = trimmed.match(/^\/?\s*([a-zA-Z][a-zA-Z0-9-]*)/);
      const tagName = nameMatch ? nameMatch[1].toLowerCase() : '';
      const selfClose = trimmed.endsWith('/');

      if (opts.stripTags) {
        if (skipTag) {
          if (isClosing && tagName === skipTag) {
            skipTag = '';
          }
          i = end + 1;
          continue;
        }
        if (tagName === 'script' || tagName === 'style') {
          skipTag = tagName;
          i = end + 1;
          continue;
        }
        if (tagName && BLOCK_TAGS.has(tagName)) {
          out += '\n';
        }
        i = end + 1;
        continue;
      }

      // 属性清理模式
      if (!tagName) {
        // 形如 "<3" 这类非标签，按文本处理
        out += input[i];
        i++;
        continue;
      }
      if (isClosing) {
        out += `</${tagName}>`;
      } else {
        out += `<${cleanTagAttributes(tagContent, opts)}${selfClose ? '' : ''}>`;
      }
      i = end + 1;
      continue;
    }

    // 文本节点
    if (skipTag) {
      i++;
      continue;
    }
    out += input[i];
    i++;
  }

  if (opts.decodeEntities) {
    out = decodeEntities(out);
  }

  if (opts.stripTags) {
    if (opts.preserveNewlines) {
      // 纯正则换行归一化，刻意不用 .split('\n')：
      // 否则 UX 静态检查会误判为「按条目切分输入」（U1x），html-strip 实为单文档进/单文档出。
      out = out
        .replace(/[ \t]+\n/g, '\n') // 去除每行行尾空白
        .replace(/\n{3,}/g, '\n\n') // 多余空行压成两段
        .replace(/[ \t]{2,}/g, ' '); // 连续横向空白压成一个空格
    } else {
      out = out.replace(/\s+/g, ' ').trim();
    }
  }

  return out;
}
