/**
 * 教程页的运行时加载器。
 *
 * 每篇教程是 src/seo/guides/*.md，构建期用它生成静态 HTML（SEO），运行时按需加载
 * 渲染给真人看。用 import.meta.glob 而不是整体 import，是为了让每篇教程单独成一个
 * 懒加载 chunk —— 12 篇文章不至于撑大首屏包。
 */

import { parseFrontmatter, toGuideFrontmatter, type GuideFrontmatter } from './frontmatter';

const RAW_MODULES = import.meta.glob('./guides/*.md', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>;

const slugOf = (filePath: string) => filePath.replace(/^.*\//, '').replace(/\.md$/, '');

/** 全站教程 slug 列表（按字母序），首页和面包屑要用 */
export const GUIDE_SLUGS: string[] = Object.keys(RAW_MODULES).map(slugOf).sort();

export interface LoadedGuide {
  slug: string;
  front: GuideFrontmatter;
  html: string;
}

type MarkdownItInstance = { render(md: string): string };
type MarkdownItCtor = new (options?: Record<string, unknown>) => MarkdownItInstance;

let markdownItPromise: Promise<{ default: MarkdownItCtor }> | null = null;

function getMarkdownIt(): Promise<{ default: MarkdownItCtor }> {
  if (!markdownItPromise) {
    // markdown-it 只在这篇教程真正被打开时才下载
    markdownItPromise = import('markdown-it') as unknown as Promise<{ default: MarkdownItCtor }>;
  }
  return markdownItPromise;
}

/** 按 slug 加载一篇教程，找不到返回 null（交给路由的 NotFound） */
export async function loadGuide(slug: string): Promise<LoadedGuide | null> {
  const entry = Object.entries(RAW_MODULES).find(([filePath]) => slugOf(filePath) === slug);
  if (!entry) {
    return null;
  }
  const [, loader] = entry;
  const raw = await loader();
  const { data, body } = parseFrontmatter(raw);
  const { default: MarkdownIt } = await getMarkdownIt();
  // 参数必须和 build/seo-prerender.ts 里的一致，否则静态 HTML 和运行时渲染出的标签不一样
  const md = new MarkdownIt({ html: true, linkify: true, typographer: false });
  return { slug, front: toGuideFrontmatter(data, slug), html: md.render(body) };
}

/** 只取 frontmatter，不渲染正文 —— 列表页用，省掉 markdown-it 的下载 */
export async function loadGuideMeta(slug: string): Promise<GuideFrontmatter | null> {
  const entry = Object.entries(RAW_MODULES).find(([filePath]) => slugOf(filePath) === slug);
  if (!entry) {
    return null;
  }
  const raw = await entry[1]();
  const { data } = parseFrontmatter(raw);
  return toGuideFrontmatter(data, slug);
}
