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

/**
 * 预览缩放档位。
 *
 * 默认是「适应宽度」（面板多宽就缩到多宽，会算出 39% 这种零碎比例），用户再点 +/− 时
 * 走这些整数档位而不是 1% 一档的微量步进：缩小是「看整体版式」，放大是「看清某个元素」，
 * 50% / 100% / 200% 这类数更好预期，也方便口头描述给同事。
 */
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 3;
export const ZOOM_STEPS = [0.1, 0.15, 0.2, 0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.25, 1.5, 2, 2.5, 3];

/** 夹到 [ZOOM_MIN, ZOOM_MAX]。NaN / 0 / 负数一律兜回 1，别把 iframe 缩成看不见。 */
export function clampZoom(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) {
    return 1;
  }

  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale));
}

/**
 * 当前比例的上一档 / 下一档。
 *
 * 当前值不一定在档位表里（「适应宽度」给的可能是 0.39），所以按「比它大一点 / 小一点」
 * 找最近的档位；已经在表头表尾就停在端点，不返回 undefined 让调用方判空。
 */
export function nextZoomStep(current: number, direction: 1 | -1): number {
  const safe = clampZoom(current);
  const epsilon = 0.001;

  if (direction > 0) {
    return ZOOM_STEPS.find(step => step > safe + epsilon) ?? ZOOM_MAX;
  }

  return [...ZOOM_STEPS].reverse().find(step => step < safe - epsilon) ?? ZOOM_MIN;
}

/**
 * 面板放不下档位宽度时等比缩小到刚好铺满，放得下就是 1。
 * 上限刻意是 1 而不是「铺满面板」：375px 的手机档被放大到 800px 就不再是手机宽度了。
 */
export function fitScaleFor(paneWidth: number, presetWidth: number): number {
  if (!paneWidth || !presetWidth || presetWidth <= paneWidth) {
    return 1;
  }

  return paneWidth / presetWidth;
}

/**
 * iframe 的逻辑视口高度（CSS 像素）。
 *
 * 只按「适应宽度」的比例反算，**不跟用户的缩放走**：早先的公式是「显示高度恒等于编辑区高度」，
 * 一旦用户手动放大，这个公式会让 iframe 视口反而变矮（放大 2 倍 → 视口只剩 800px 高），
 * 看到的内容比不放大时还少。现在逻辑高度锁死在适应宽度那一刻的值，放大只是把同一块视口
 * 铺到更大的屏幕上、由滚动条去看局部。
 */
export function logicalHeightFor(workHeight: number, fitScale: number, min: number, max: number): number {
  const scale = fitScale > 0 ? fitScale : 1;

  return Math.min(max, Math.max(min, Math.round(workHeight / scale)));
}

/** 编辑模式注入到预览文档里的样式元素 id —— 序列化回源码前必须摘掉，否则会被写进用户的代码。 */
export const EDITOR_STYLE_ID = 'gjx-html-editor-edit-style';

/**
 * 样式面板选中的元素上挂的属性名。
 *
 * 用「属性 + 注入 CSS 描边」而不是直接改元素的 `el.style.outline`：
 * 后者会污染用户元素的内联样式，且截屏/序列化的时机稍有偏差就会把描边写进源码。
 * 属性同样要剥离，但剥离点只有一个（serializeFrame），漏不掉。
 */
export const EDITOR_SELECTED_ATTR = 'data-gjx-selected';

/**
 * 编辑模式下给预览文档加的样式：提示「这块能改」、标出「当前选中」。
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
[${EDITOR_SELECTED_ATTR}='true'] {
  outline: 2px solid rgba(24, 160, 88, 1) !important;
  outline-offset: 1px;
}
`;

/** 盒模型的四个方向，顺序即面板里的展示顺序。 */
export const BOX_SIDES = ['top', 'right', 'bottom', 'left'] as const;
export type BoxSide = (typeof BOX_SIDES)[number];
export type BoxSides = Record<BoxSide, number>;

/** 样式面板里可编辑的字段 —— 与参考站（htmleditor.cc）一致：七个常用属性，不含圆角/边框/行高。 */
export interface ElementStyleValues {
  backgroundColor: string;
  color: string;
  fontSize: number;
  fontWeight: string;
  textAlign: string;
  padding: BoxSides;
  margin: BoxSides;
}

export const FONT_SIZE_MIN = 8;
export const FONT_SIZE_MAX = 160;
export const BOX_VALUE_MAX = 1000;

/**
 * `rgb(31, 41, 51)` / `rgba(24, 160, 88, 1)` / `#1F2933` → `#1f2933`。
 *
 * 面板里的颜色框只认 `#rrggbb`，而 `getComputedStyle` 一律给 `rgb()` 字符串，必须转换。
 * 解不了（含完全透明、`color-mix()` 之类）返回 null —— 调用方据此显示「未设置」，
 * 而不是编一个看似合理的颜色骗用户。
 */
export function toHexColor(value: string): string | null {
  const text = value.trim().toLowerCase();

  if (/^#[0-9a-f]{6}$/.test(text)) {
    return text;
  }

  if (/^#[0-9a-f]{3}$/.test(text)) {
    return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`;
  }

  const match = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(text);

  if (!match) {
    return null;
  }

  const alpha = match[4] === undefined ? 1 : Number.parseFloat(match[4]) / (match[4].endsWith('%') ? 100 : 1);

  if (alpha === 0) {
    return null;
  }

  return `#${[match[1], match[2], match[3]]
    .map((channel) => Math.max(0, Math.min(255, Math.round(Number.parseFloat(channel)))).toString(16).padStart(2, '0'))
    .join('')}`;
}

/** `32px` → 32；`1.5em` / `auto` / 空 → 0。面板只处理像素，非像素值按 0 显示（改一下就变成像素了）。 */
export function parsePixelValue(value: string): number {
  const match = /^(-?[\d.]+)px$/.exec(value.trim());

  return match ? Math.round(Number.parseFloat(match[1])) : 0;
}

/**
 * `getComputedStyle().textAlign` 在标准模式下会给 `start` / `end`，面板的下拉只认具体方向。
 * 归一到具体方向；识别不了的（`justify` 等）原样返回，免得把用户文档里的原值改掉。
 */
export function normalizeTextAlign(value: string): string {
  const text = value.trim().toLowerCase();

  if (text === 'start') {
    return 'left';
  }

  if (text === 'end') {
    return 'right';
  }

  return text;
}

/**
 * 面板的字体粗细只给两档（与参考站一致）。`getComputedStyle` 会给 400/500/600/700，
 * 归一到最近的一档 —— 不归一的话下拉框匹配不到值会显示成空白，看着像坏了。
 */
export function normalizeFontWeight(value: string): string {
  const weight = Number.parseInt(value, 10);

  if (Number.isNaN(weight)) {
    return '400';
  }

  return weight >= 600 ? '700' : '400';
}

/** 面包屑里那一级的显示名：标签名 + 第一个 class（`div.card`），够用来分辨同级兄弟。 */
export function describeElement(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const firstClass = typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '';

  return firstClass ? `${tag}.${firstClass}` : tag;
}

/**
 * 从 `body` 到自身的层级路径，用于面包屑。
 *
 * 为什么需要：桌面档在窄面板里会整体等比缩小（见过 44%），小元素点不准。
 * 有路径就能从父级直接跳到想要的那一层，不用靠鼠标精度。
 */
export function elementPath(el: Element): Element[] {
  const path: Element[] = [];
  let current: Element | null = el;

  while (current && current.tagName.toLowerCase() !== 'html') {
    path.unshift(current);
    current = current.parentElement;
  }

  return path;
}

/**
 * 摘掉元素及其所有子节点的内联样式。
 *
 * 范围含子节点是刻意的：用户点的是「这块」，想恢复的是「这一块的原样」，
 * 只清当前节点的话，他改过的子节点样式会留下，看起来像没重置干净。
 * 调用方负责先弹确认框。
 */
export function clearInlineStyles(el: Element): void {
  el.removeAttribute('style');

  for (const child of Array.from(el.querySelectorAll('[style]'))) {
    child.removeAttribute('style');
  }
}

/** 读元素当前**生效**的样式值填面板（而不是只读内联样式）—— 空框会让用户以为自己没设过。 */
export function readElementStyles(win: Window, el: Element): ElementStyleValues {
  const computed = win.getComputedStyle(el);
  const sides = (prefix: 'padding' | 'margin'): BoxSides =>
    BOX_SIDES.reduce<BoxSides>(
      (result, side) => {
        result[side] = parsePixelValue(computed[`${prefix}${side[0].toUpperCase()}${side.slice(1)}` as 'paddingTop']);

        return result;
      },
      { top: 0, right: 0, bottom: 0, left: 0 },
    );

  return {
    backgroundColor: toHexColor(computed.backgroundColor) ?? '',
    color: toHexColor(computed.color) ?? '',
    fontSize: parsePixelValue(computed.fontSize),
    fontWeight: normalizeFontWeight(computed.fontWeight),
    textAlign: normalizeTextAlign(computed.textAlign),
    padding: sides('padding'),
    margin: sides('margin'),
  };
}

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
 * 注入物必须全部摘掉，否则「用户的源码」里会多出一段我们的 CSS 和几个 `data-gjx-selected`。
 * 摘掉之后再放回去 —— 用户还在继续编辑，悬停/选中高亮得留着。
 */
export function serializeFrame(doc: Document, { asDocument }: { asDocument: boolean }): string {
  const injected = doc.getElementById(EDITOR_STYLE_ID);
  injected?.remove();

  const { body } = doc;
  const restoreEditable = body?.getAttribute('contenteditable') ?? null;
  body?.removeAttribute('contenteditable');

  // 选中的元素上挂着描边属性，同样不能出现在源码里
  const selected = Array.from(doc.querySelectorAll(`[${EDITOR_SELECTED_ATTR}]`));
  for (const el of selected) {
    el.removeAttribute(EDITOR_SELECTED_ATTR);
  }

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
    for (const el of selected) {
      el.setAttribute(EDITOR_SELECTED_ATTR, 'true');
    }
    if (injected) {
      doc.head?.appendChild(injected);
    }
  }
}
