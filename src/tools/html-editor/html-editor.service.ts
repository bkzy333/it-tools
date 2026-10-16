// HTML 在线编辑器的纯逻辑：文件编码嗅探、源码与渲染结果的互转、预览尺寸档位。
// 不碰 DOM 的部分都在这里，方便单测；碰 DOM 的只有 serializeFrame 一个（用 jsdom 测）。

/**
 * 预览尺寸档位。
 *
 * 三档都是**真实视口宽度**，不是「占面板多少」。预览面板本身很窄（应用内容区约 1140px，
 * 左码右预览各半 → 约 570px），所以 768 / 1280 一定放不下 —— 放不下的部分由预览区
 * **整体等比缩放**来适配（见 .vue 里的 scale），而不是把档位宽度偷偷改小。
 * 早先 desktop 用的是「跟随容器 100%」，结果是窄屏上点「平板」比点「桌面」还宽，
 * 档位名与实际宽度对不上，等于在骗用户。
 */
export interface DevicePreset {
  key: 'desktop' | 'tablet' | 'mobile';
  /** 以此宽度渲染预览，模拟对应设备的视口 */
  width: number;
}

export const DEVICE_PRESETS: DevicePreset[] = [
  { key: 'desktop', width: 1280 },
  { key: 'tablet', width: 768 },
  { key: 'mobile', width: 375 },
];

/** 编辑模式注入到预览文档里的样式元素 id —— 序列化回源码前必须摘掉，否则会被写进用户的代码。 */
export const EDITOR_STYLE_ID = 'gjx-html-editor-edit-style';

/**
 * 编辑模式下给预览文档加的样式：提示「这块能改」。
 * 只是视觉辅助，不改变用户内容的布局。
 */
export const EDITOR_HINT_CSS = `
[contenteditable='true'] *:hover {
  outline: 1px dashed rgba(24, 160, 88, 0.85);
  outline-offset: 1px;
}
[contenteditable='true'] *:focus {
  outline: 1px solid rgba(24, 160, 88, 1);
  outline-offset: 1px;
}
`;

/** 浏览器认的编码名和文件里写的可能不一样，统一成 TextDecoder 认识的标准标签。 */
const CHARSET_ALIASES: Record<string, string> = {
  utf8: 'utf-8',
  'utf-8': 'utf-8',
  gbk: 'gb18030',
  gb2312: 'gb18030',
  'gb_2312-80': 'gb18030',
  gb18030: 'gb18030',
  'x-gbk': 'gb18030',
  big5: 'big5',
  'big5-hkscs': 'big5',
  'utf-16': 'utf-16le',
  utf16: 'utf-16le',
  'utf-16le': 'utf-16le',
  'utf-16be': 'utf-16be',
  'iso-8859-1': 'windows-1252',
  latin1: 'windows-1252',
};

export interface DecodedHtmlFile {
  /** 解码后的源码（已去掉 BOM） */
  text: string;
  /** 实际使用的编码名，用于提示用户 */
  encoding: string;
  /** 文件是否带 BOM */
  hadBom: boolean;
}

function toBytes(input: ArrayBuffer | Uint8Array): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

function normalizeCharset(charset: string): string {
  const label = charset.trim().toLowerCase();

  return CHARSET_ALIASES[label] ?? label;
}

function decode(bytes: Uint8Array, encoding: string, fatal: boolean): string | null {
  try {
    return new TextDecoder(encoding, { fatal }).decode(bytes);
  } catch {
    // 该编码名浏览器/Node 不认，或者 fatal 模式下解不动
    return null;
  }
}

/**
 * 从文件头部找 `charset=xxx` 声明。
 *
 * 只看字节的 ASCII 部分是有意为之：不管文件是 GBK 还是 UTF-8，`<meta charset=...>` 这段
 * 永远是 ASCII，用 latin1 解出来就能安全地做正则，不会因为编码猜错而漏掉声明。
 */
export function detectDeclaredCharset(headBytes: Uint8Array): string | null {
  const head = Array.from(headBytes, byte => String.fromCharCode(byte)).join('');
  const match = /<meta[^>]*charset\s*=\s*["']?\s*([\w-]+)/i.exec(head) ?? /charset\s*=\s*["']?\s*([\w-]+)/i.exec(head);

  return match ? normalizeCharset(match[1]) : null;
}

/**
 * 把上传的 HTML 文件解成字符串。
 *
 * 顺序（每一步都有真实理由）：
 *   1. BOM —— 最可靠，有就直接用；
 *   2. 严格 UTF-8 —— 能无损解出来就一定是 UTF-8；
 *   3. 文件自己声明的 charset —— 中文 HTML 里 GB2312/GBK 很常见，声明通常是对的；
 *   4. GB18030 兜底 —— 它是 GBK/GB2312 的超集，国内老编辑器存出来的文件多数能救回来；
 *   5. 最后才认命用 UTF-8 有损解码（丢字总比报错强）。
 */
export function decodeHtmlFile(input: ArrayBuffer | Uint8Array): DecodedHtmlFile {
  const bytes = toBytes(input);

  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return { text: decode(bytes.subarray(3), 'utf-8', false) ?? '', encoding: 'utf-8', hadBom: true };
  }

  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return { text: decode(bytes.subarray(2), 'utf-16le', false) ?? '', encoding: 'utf-16le', hadBom: true };
  }

  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
    return { text: decode(bytes.subarray(2), 'utf-16be', false) ?? '', encoding: 'utf-16be', hadBom: true };
  }

  const strictUtf8 = decode(bytes, 'utf-8', true);

  if (strictUtf8 !== null) {
    return { text: strictUtf8, encoding: 'utf-8', hadBom: false };
  }

  const declared = detectDeclaredCharset(bytes.subarray(0, 2048));

  if (declared && declared !== 'utf-8') {
    const byDeclaration = decode(bytes, declared, false);

    if (byDeclaration !== null) {
      return { text: byDeclaration, encoding: declared, hadBom: false };
    }
  }

  const gb18030 = decode(bytes, 'gb18030', false);

  if (gb18030 !== null) {
    return { text: gb18030, encoding: 'gb18030', hadBom: false };
  }

  return { text: decode(bytes, 'utf-8', false) ?? '', encoding: 'utf-8', hadBom: false };
}

/**
 * 源码是不是一份完整文档（有 doctype 或 `<html>`）。
 *
 * 决定编辑模式同步回源码时给整份文档还是只给 body 里的内容：
 * 用户粘的是片段，同步回来就给片段 —— 否则改一个字的功夫，源码里凭空多出
 * `<html><head><body>`，等于把用户的代码重写了一遍。
 */
export function looksLikeFullDocument(source: string): boolean {
  return /<!doctype/i.test(source) || /<html[\s>]/i.test(source);
}

/**
 * 把预览文档序列化回源码。编辑模式靠它把用户改的内容写回源码框。
 *
 * 注入的样式元素必须摘掉，否则「用户的源码」里会多出一段我们的 CSS。
 * 摘掉之后再放回去 —— 用户还在继续编辑，那点悬停高亮得留着。
 */
export function serializeFrame(doc: Document, { asDocument }: { asDocument: boolean }): string {
  const injected = doc.getElementById(EDITOR_STYLE_ID);
  injected?.remove();

  const { body } = doc;
  const restoreEditable = body?.getAttribute('contenteditable') ?? null;
  body?.removeAttribute('contenteditable');

  try {
    if (!asDocument) {
      return (body?.innerHTML ?? '').trim();
    }

    const doctype = doc.doctype ? `<!DOCTYPE ${doc.doctype.name}>\n` : '';

    return `${doctype}${doc.documentElement.outerHTML}`;
  } finally {
    if (body && restoreEditable !== null) {
      body.setAttribute('contenteditable', restoreEditable);
    }
    if (injected) {
      doc.head?.appendChild(injected);
    }
  }
}
