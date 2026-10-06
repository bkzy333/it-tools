/**
 * 分类页的运行时数据。
 *
 * 这份映射必须和构建期生成静态 HTML 用的那份（scripts/extract-tools-meta.mjs 里的
 * CATEGORY_ZH / CATEGORY_SEO_NAME）保持一致 —— 两边不一致的话，搜索引擎抓到的静态
 * 标题和用户实际看到的标题会打架，属于 cloaking，AdSense 会扣分。
 * 改分类文案时记得两边一起改。
 *
 * 这里只放 27 条类目文案，不放 476 条工具清单：工具列表直接复用前端已经加载好的
 * toolStore.tools，避免把 270KB 的 tools-meta.json 打进客户端包。
 */

export interface CategoryMeta {
  /** 中文分类名，用于面包屑和正文 */
  zh: string;
  /** 面向搜索的页面标题，比分类名更长尾一些 */
  seo: string;
  /** URL 片段：/category/<slug> */
  slug: string;
}

// key 是 src/tools/<目录>/index.ts 里的 category 字段值，不是 slug
// 注意：这里只放**当前真实存在**的分类。上次瘦身后 Cheatsheets / Docker / Maths /
// Physics / TOML / Default 已下线，2026-10-06 又下线了 Gaming / Forensic / Weather。
// 留着死条目会让 /category/<slug> 生成空分类页（站点地图里出现 0 工具的页面）。
export const CATEGORIES: Record<string, CategoryMeta> = {
  Barcodes: { zh: '条形码与二维码', seo: '条形码与二维码在线生成', slug: 'barcodes' },
  Converters: { zh: '单位换算', seo: '单位换算在线计算', slug: 'converters' },
  Crypto: { zh: '加密与解密', seo: '加密解密与哈希在线工具', slug: 'crypto' },
  Data: { zh: '数据处理', seo: '数据格式转换工具', slug: 'data' },
  Datetime: { zh: '日期与时间', seo: '日期时间在线计算', slug: 'datetime' },
  Development: { zh: '开发工具', seo: '开发者在线工具', slug: 'development' },
  Finance: { zh: '金融计算', seo: '金融与贷款在线计算', slug: 'finance' },
  Generators: { zh: '随机生成', seo: '随机数与标识生成器', slug: 'generators' },
  Images: { zh: '图片处理', seo: '图片在线处理工具', slug: 'images' },
  JSON: { zh: 'JSON 工具', seo: 'JSON 在线格式化与转换', slug: 'json' },
  Markdown: { zh: 'Markdown', seo: 'Markdown 在线工具', slug: 'markdown' },
  Measurement: { zh: '测量工具', seo: '度量衡单位换算', slug: 'measurement' },
  Network: { zh: '网络工具', seo: '网络与 IP 在线工具', slug: 'network' },
  PDF: { zh: 'PDF 工具', seo: 'PDF 在线处理工具', slug: 'pdf' },
  Text: { zh: '文本处理', seo: '文本处理在线工具', slug: 'text' },
  Web: { zh: '网页工具', seo: '网页与 URL 在线工具', slug: 'web' },
  XML: { zh: 'XML 工具', seo: 'XML 在线格式化与转换', slug: 'xml' },
  YAML: { zh: 'YAML', seo: 'YAML 在线格式化与转换', slug: 'yaml' },
};

/** 分类名 → URL 片段，和构建期 categorySlug() 的算法一致 */
export function categorySlug(category: string): string {
  return category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

const BY_SLUG: Record<string, { category: string; meta: CategoryMeta }> = Object.entries(CATEGORIES).reduce(
  (acc, [category, meta]) => {
    acc[meta.slug] = { category, meta };
    return acc;
  },
  {} as Record<string, { category: string; meta: CategoryMeta }>,
);

/** URL 片段 → 分类，找不到返回 undefined（交给路由的 NotFound 处理） */
export function findCategory(slug: string): { category: string; meta: CategoryMeta } | undefined {
  return BY_SLUG[slug];
}

/** 侧栏和首页分类导航用：按 URL 片段排序后的全部分类 */
export function allCategories(): { category: string; meta: CategoryMeta }[] {
  return Object.entries(CATEGORIES)
    .map(([category, meta]) => ({ category, meta }))
    .sort((a, b) => a.meta.slug.localeCompare(b.meta.slug));
}

/** 兜底：某个分类在表里缺失时，退化成把分类名直接小写化 */
export function categoryMeta(category: string): CategoryMeta {
  return CATEGORIES[category] ?? { zh: category, seo: category, slug: categorySlug(category) };
}
