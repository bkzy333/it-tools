/**
 * 路由路径规范化。
 *
 * 站内 URL 统一带尾斜杠（`/xml-formatter/`），但三份数据源的 key 不带：
 *   - `src/seo/content/*`（L1 深耕正文）
 *   - `src/tools/tool-usage.ts`（L2/L3 兜底说明）
 *   - `src/seo/related-tools.ts`（相关工具映射表）
 *
 * 而 Vue 运行时拿到的 `route.path` 会原样保留尾斜杠。不规范化就会出现
 * 「构建期查得到 → 静态 HTML 有正文；运行时查不到 → 只剩兜底文案」，
 * 等于给爬虫和用户看两套内容（cloaking，AdSense 封号级）。
 *
 * 所有按 path 查这三张表的地方都必须先过一遍这个函数。
 */
export function normalizeRoutePath(path: string): string {
  const p = (path ?? '').trim();
  return p.length > 1 ? p.replace(/\/+$/, '') : p;
}
