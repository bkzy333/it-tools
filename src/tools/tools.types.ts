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
