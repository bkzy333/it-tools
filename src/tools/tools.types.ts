import type { Component } from 'vue';

export interface Tool {
  name: string;
  path: string;
  description: string;
  keywords: string[];
  component: () => Promise<Component>;
  icon: Component;
  redirectFrom?: string[];
  isNew: boolean;
  createdAt?: Date;
  npmPackages?: string[];
  externAccessDescription?: string;
  footer?: string;
  category: string;
  externalHTMLContent?: string;
  // 多维标签（Faceted Classification）：工具是实体，分类只是观察视角。
  // 打 'excel' 的工具会出现在 /excel 专区聚合页，但不改变其主分类（category）。
  // 纯加法字段，旧工具不写也不会报错；提取脚本与预渲染都按「可选」处理。
  tags?: string[];
}

export interface ExternalTool {
  name: string;
  path: string;
  description?: string;
  keywords?: string[];
  icon?: Component;
  redirectFrom?: string[];
  isNew: boolean;
  createdAt?: Date;
  category: string;
  markdownContent?: string;
  href?: string;
}

export interface ToolCategory {
  name: string;
  components: Tool[];
}

export interface ToolsFilter {
  excludeCategoryFilterRegex?: string;
  includeCategoryFilterRegex?: string;
  excludeToolsFilterRegex?: string;
  includeToolsFilterRegex?: string;
}

/**
 * category 是「当前语言下的分类名」（侧栏分组、面包屑用），
 * rawCategory 是 index.ts 里的原始英文值（查分类 slug 用）。
 *
 * 两者必须分开：CATEGORIES 表以英文为 key，拿中文名去查会查不到，
 * 退化出来的 slug 会把中文全替换成 `-`，拼出 /category/- 这种死链。
 */
export type ToolWithCategory = Tool & { category: string; rawCategory?: string };
