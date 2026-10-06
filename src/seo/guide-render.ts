/**
 * 教程 Markdown 的渲染实现 —— 构建期（生成静态 HTML）和运行时（Vue 渲染）共用这一份。
 *
 * 为什么必须同源：静态 HTML 给爬虫看，Vue 渲染的结果给用户看。两边只要有一点不一样
 * ——标题多个锚点 id、目录少一列、参数差一个选项——就等于给爬虫和用户看两套内容，
 * AdSense 判定 cloaking 是直接封号级别的违规。所以同一个 md、同一套 markdown-it 参数、
 * 同一套锚点生成规则，全部收在这个文件里，两边都只能调用它。
 *
 * 这里是唯一允许存在 `renderGuideMarkdown` 的地方。build/seo-prerender.ts 和
 * src/seo/guides.ts 都 import 本模块，不要再各自 new MarkdownIt。
 */

export interface GuideTocItem {
  /** 标题层级，只会是 2 或 3 */
  level: number;
  text: string;
  anchor: string;
}

export interface RenderedGuideMarkdown {
  html: string;
  toc: GuideTocItem[];
}

// markdown-it 的类型不参与打包：这里用结构类型描述实际用到的那几个成员，避免
// 为了拿类型把整个 markdown-it 类型树拖进依赖图。
interface MarkdownItToken {
  type: string;
  tag: string;
  content: string;
  children: MarkdownItToken[] | null;
  attrSet(name: string, value: string): unknown;
}

interface MarkdownItRenderer {
  rules: Record<string, RendererRule | undefined>;
}

type RendererRule = (
  tokens: MarkdownItToken[],
  idx: number,
  options: Record<string, unknown>,
  env: unknown,
  self: { renderToken(tokens: MarkdownItToken[], idx: number, options: Record<string, unknown>): string },
) => string;

interface MarkdownItLike {
  render(md: string): string;
  renderer: MarkdownItRenderer;
}

type MarkdownItCtor = new (options?: Record<string, unknown>) => MarkdownItLike;

let markdownItPromise: Promise<{ default: MarkdownItCtor }> | null = null;

/** markdown-it 只在这篇教程真正被打开（或构建器处理第一篇教程）时才加载 */
function getMarkdownIt(): Promise<{ default: MarkdownItCtor }> {
  if (!markdownItPromise) {
    markdownItPromise = import('markdown-it') as unknown as Promise<{ default: MarkdownItCtor }>;
  }
  return markdownItPromise;
}

/**
 * 生成锚点。
 *
 * 中文标题 slugify 出来的东西不可读也没意义，所以规则是：能抽出拉丁字符就用它，
 * 抽不出来（纯中文标题）就退化成 sec-N。N 用「第几个标题」而不是「第几个无拉丁字符
 * 的标题」，这样增删标题时 id 稳定，不会因为改了一个标题导致后面所有锚点错位。
 */
function toAnchorBase(text: string, headingIndex: number): string {
  const latin = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return latin.length > 2 ? latin.slice(0, 60) : `sec-${headingIndex + 1}`;
}

/** 从 heading_open 后面的 inline token 里取出纯文本（含 `code_inline` 的内容） */
function headingPlainText(tokens: MarkdownItToken[], idx: number): string {
  const inline = tokens[idx + 1];
  if (!inline?.children) {
    return '';
  }

  return inline.children
    .filter((child) => child.type === 'text' || child.type === 'code_inline')
    .map((child) => child.content)
    .join('');
}

/**
 * 渲染一篇教程的正文，同时产出目录数据。
 *
 * 会给每个标题加上稳定的 id，这样 TOC 里的锚点链接在静态 HTML 里和 Vue 渲染后
 * 指向同一个位置 —— 从搜索结果点进来能直接落到对应小节。
 */
export async function renderGuideMarkdown(body: string): Promise<RenderedGuideMarkdown> {
  const { default: MarkdownIt } = await getMarkdownIt();
  const md = new MarkdownIt({ html: true, linkify: true, typographer: false });

  const toc: GuideTocItem[] = [];
  const usedAnchors = new Set<string>();
  let headingIndex = 0;

  md.renderer.rules.heading_open = (tokens, idx, options, _env, self) => {
    const level = Number(tokens[idx].tag.slice(1));
    const text = headingPlainText(tokens, idx);

    let anchor = toAnchorBase(text, headingIndex);
    if (usedAnchors.has(anchor)) {
      let suffix = 2;
      while (usedAnchors.has(`${anchor}-${suffix}`)) {
        suffix += 1;
      }
      anchor = `${anchor}-${suffix}`;
    }
    usedAnchors.add(anchor);
    headingIndex += 1;

    // 一级标题是文章标题本身，不进目录；太深的小标题进了目录也没人点
    if (level === 2 || level === 3) {
      toc.push({ level, text, anchor });
    }

    tokens[idx].attrSet('id', anchor);

    return self.renderToken(tokens, idx, options);
  };

  // 代码块是横向可滚动区域（overflow-x:auto），没有 tabindex 的话键盘用户滚不动，
  // axe 的 scrollable-region-focusable 会判违规。这里在**最终产物**上统一补，
  // 不去覆盖 md.renderer.rules.fence —— 那样会把默认的 highlight 分支一起干掉。
  // 改的是 md.render 的输出，静态 HTML 和运行时 v-html 走同一份，不会两边不一致。
  const html = md.render(body).replace(/<pre>/g, '<pre tabindex="0">');

  return { html, toc };
}
