// 构建期数据入口：build/seo-prerender.ts 会把这个文件单独打一份 ESM 再 import，
// 这样它既能拿到 TS 里的内容数据，又不必给运行时包多加任何东西。
//
// 运行时（Vue）走各自的 import，不经过这个文件 —— 但读的是同样的数据源，
// 保证用户看到的页面和爬虫拿到的静态 HTML 是同一套文案。

export { allToolContent, getToolContent, toolContentCount } from './content/index';
export { TRUST_PAGES, getTrustPage, SITE_NAME, SITE_DOMAIN, SITE_URL, CONTACT_EMAIL } from './trust-pages';
export type { ToolContent, ToolContentFaq, ToolContentExample } from './content/types';
