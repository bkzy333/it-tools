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
  return ALL_CONTENT[path];
}

export function hasToolContent(path: string): boolean {
  return Object.prototype.hasOwnProperty.call(ALL_CONTENT, path);
}

export const allToolContent = ALL_CONTENT;

export const toolContentCount = Object.keys(ALL_CONTENT).length;
