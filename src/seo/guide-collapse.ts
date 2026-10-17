import { normalizeRoutePath } from './route-path';

/**
 * 哪些工具页的说明区默认折叠「怎么用 / 小提示 / 相关工具 / 同类工具」。
 *
 * 起因：说明区最长能到 1500px+，把工具本体推到很下面。折叠后把长参考内容
 * （步骤、提示、内链）让到首屏之后，屏幕留给真正要用的东西。
 *
 * ⚠️ 这份名单被**运行时**（`src/components/ToolUsageGuide.vue`）和**静态预渲染**
 * （`build/seo-prerender.ts`）同时读取。只改一边 = 爬虫读到展开版、用户看到折叠版，
 * 等于给两边看不同版面，踩 cloaking 红线（AdSense 封号级）。要加就两边一起加 ——
 * 两边都只读这里，所以只要往下面这个 Set 里加路径即可，两份渲染代码不用动。
 *
 * 折叠只影响展示：正文仍在 DOM 里，爬虫照样能读到，不是「隐藏内容」。
 */
const COLLAPSED_GUIDE_PATHS = new Set<string>(['/html-editor']);

export function shouldCollapseGuide(routePath: string): boolean {
  return COLLAPSED_GUIDE_PATHS.has(normalizeRoutePath(routePath));
}
