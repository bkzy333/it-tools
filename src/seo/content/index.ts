// L1 深度页的正文按分类拆成四个文件，避免一个上千行的巨文件。
// 这里只做汇总，运行时和构建期都从这里取数。
//
// 为什么是静态 import 而不是 import.meta.glob 懒加载：
// 这四个文件加起来约 13 万字（gzip 后 ~120KB），而它们只被工具页用到，
// 工具页本身已经是懒加载 chunk，所以跟着一起进来就够了。真要拆成按分类
// 的独立 chunk，得额外维护一份 path -> chunk 的映射表，复杂度不值当。

import textJson from './text-json';
import cryptoConvertersNetwork from './crypto-converters-network';
import mediaDatetimeGenerators from './media-datetime-generators';
import webDevOthers from './web-dev-others';
import dataTools from './data-tools';
import { normalizeRoutePath } from '../route-path';
import type { ToolContent } from './types';

export type { ToolContent, ToolContentFaq, ToolContentExample } from './types';

const ALL_CONTENT: Record<string, ToolContent> = {
  ...textJson,
  ...cryptoConvertersNetwork,
  ...mediaDatetimeGenerators,
  ...webDevOthers,
  ...dataTools,
};

export function getToolContent(path: string): ToolContent | undefined {
  return ALL_CONTENT[normalizeRoutePath(path)];
}

export function hasToolContent(path: string): boolean {
  return Object.prototype.hasOwnProperty.call(ALL_CONTENT, normalizeRoutePath(path));
}

export const allToolContent = ALL_CONTENT;

export const toolContentCount = Object.keys(ALL_CONTENT).length;

/**
 * 工具页 meta description 的唯一算法。
 *
 * 构建期（build/seo-prerender.ts 写进静态 HTML 的 <meta name="description">）和
 * 运行时（src/layouts/tool.layout.vue 挂载后替换的那一份）都必须调这个函数：
 * 之前两边各写各的 —— 静态用 content.intro 截断，运行时用 locales 里的短描述，
 * 90 个 L1 页的 meta description 静态运行两套话（head 里的内容不一致也是 cloaking）。
 *
 * @param path 工具访问路径（带不带尾斜杠都行，内部会规范化）
 * @param fallback 没有深耕正文时的描述（L2/L3 用工具自身的 description）
 */
export function toolMetaDescription(path: string, fallback: string): string {
  const intro = ALL_CONTENT[normalizeRoutePath(path)]?.intro;
  return intro ? `${intro.slice(0, 110)}…` : fallback;
}
