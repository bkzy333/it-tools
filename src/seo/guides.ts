/**
 * 教程页的运行时加载器。
 *
 * 每篇教程是 src/seo/guides/*.md，构建期用它生成静态 HTML（SEO），运行时按需加载
 * 渲染给真人看。用 import.meta.glob 而不是整体 import，是为了让每篇教程单独成一个
 * 懒加载 chunk —— 12 篇文章不至于撑大首屏包。
 */

import { parseFrontmatter, toGuideFrontmatter, type GuideFrontmatter } from './frontmatter';
import { renderGuideMarkdown, type GuideTocItem } from './guide-render';

// loadAllGuideMeta / loadGuideMeta 的返回值都用到了这个类型，转出去给调用方（教程列表页）用。
export type { GuideFrontmatter };

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
  toc: GuideTocItem[];
}

const findEntry = (slug: string) => Object.entries(RAW_MODULES).find(([filePath]) => slugOf(filePath) === slug);

/** 按 slug 加载一篇教程，找不到返回 null（交给路由的 NotFound） */
export async function loadGuide(slug: string): Promise<LoadedGuide | null> {
  const entry = findEntry(slug);
  if (!entry) {
    return null;
  }
  const raw = await entry[1]();
  const { data, body } = parseFrontmatter(raw);
  // 渲染走 src/seo/guide-render.ts：构建期生成静态 HTML 用的是同一个函数，
  // 所以标记、锚点 id、目录条目两边逐字一致，不会有 cloaking 风险
  const { html, toc } = await renderGuideMarkdown(body);
  return { slug, front: toGuideFrontmatter(data, slug), html, toc };
}

/** 只取 frontmatter，不渲染正文 —— 列表页用，省掉 markdown-it 的下载 */
export async function loadGuideMeta(slug: string): Promise<GuideFrontmatter | null> {
  const entry = findEntry(slug);
  if (!entry) {
    return null;
  }
  const raw = await entry[1]();
  const { data } = parseFrontmatter(raw);
  return toGuideFrontmatter(data, slug);
}

/**
 * 教程列表页用：一次性拉取全部文章的 frontmatter。
 *
 * 每篇 md 都是独立懒加载 chunk，12 篇并行发请求量很小，而且只有列表页进来才发。
 * 不放在首屏是因为首页用 src/seo/guide-index.ts 那份轻量索引就够了。
 */
export async function loadAllGuideMeta(): Promise<GuideFrontmatter[]> {
  const metas = await Promise.all(
    Object.entries(RAW_MODULES).map(async ([filePath, loader]) => {
      const { data } = parseFrontmatter(await loader());
      return toGuideFrontmatter(data, slugOf(filePath));
    }),
  );

  return metas.sort((a, b) => a.slug.localeCompare(b.slug));
}
