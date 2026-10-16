/**
 * 首页标题与导语的唯一来源。
 *
 * 构建期（build/seo-prerender.ts 写进静态 HTML 的 <h1> / <title> / .seo-lead）
 * 和运行时（Home.page.vue 渲染给用户的那一份）必须都 import 这里。
 *
 * 原因：静态 HTML 是给爬虫看的，Vue 渲染出来是给用户看的。两边只要说不一样的话，
 * 就是 AdSense 判定里的 cloaking（账号级风险）。之前首页的 <h1> 只存在于静态 HTML，
 * Vue 挂载后整块被替换掉，用户那边一个 H1 都没有，正是这个坑。
 */

/** 首页 H1，同时也是 <title> 与 og:title 的值 */
export const HOME_TITLE = '在线工具箱 - 免费实用的在线工具合集';

const LEAD_TAIL =
  '文本处理、JSON 格式化、加密解密、单位换算、图片处理、PDF 工具、日期计算、网络工具等，' +
  '打开即用，无需注册。';

/**
 * 首页导语。构建期（seo-prerender.ts）和运行时（Home.page.vue）传入的都是全量工具数，
 * 两边必须一致 —— 曾经构建期按 tier !== 'L3' 统计、运行时按 store 全量统计，
 * 差一个数就是静态运行两套话（cloaking）。L3 工具只是不进 sitemap，站点上真实存在。
 */
export function homeLead(toolCount: number): string {
  return `收录 ${toolCount} 个免费在线工具：${LEAD_TAIL}`;
}

/** meta description：和 <h1> 同源，只是更短（静态 HTML 里用的就是这一份） */
export function homeDescription(toolCount: number): string {
  return `收录 ${toolCount} 个免费在线工具：文本、JSON、加密解密、单位换算、图片、PDF、日期计算、网络工具等，打开即用，无需注册。`;
}

/**
 * 关于页 meta description。构建期（seo-prerender.ts）和运行时（About.vue）必须共用：
 * 之前两边各写各的，一个写「加密解密」一个写「加密」，工具数各算各的，
 * 爬虫和用户看到两套话 —— head 里的内容不一致同样是 cloaking。
 */
export function aboutDescription(siteName: string, toolCount: number): string {
  return `${siteName}是一个完全免费的在线工具合集，收录 ${toolCount} 个实用工具，涵盖 PDF、图片、文本、单位换算、加密解密、日期计算、网络工具等，打开即用，无需注册。`;
}
