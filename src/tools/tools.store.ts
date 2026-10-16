import { type MaybeRef, get } from '@vueuse/core';
import { defineStore } from 'pinia';
import type { Ref } from 'vue';
import * as _ from 'es-toolkit/compat';
import type { Tool, ToolCategory, ToolWithCategory } from './tools.types';
import { tools as allTools } from './index';
import { useITStorage } from '@/composable/queryParams';
import { normalizeRoutePath } from '@/seo/route-path';

import { translate as t } from '@/plugins/i18n.plugin';

// 侧栏分类排序：面向大众的分类靠前，开发/数据格式类（JSON、YAML、XML、Markdown）挪到最后。
// 列表里没写到的分类按原顺序排在末尾。
// 注意：这里必须只保留真实存在的分类（随工具增删同步），否则排序表会留下死条目。
const CATEGORY_PRIORITY = [
  'favorite-tools',
  'converters',
  'images',
  'pdf',
  'text',
  'datetime',
  'life',
  'finance',
  'measurement',
  'barcodes',
  'generators',
  'web',
  'network',
  'crypto',
  'data',
  'development',
  'json',
  'yaml',
  'xml',
  'markdown',
];

export const useToolStore = defineStore('tools', () => {
  const favoriteToolsName = useITStorage('favoriteToolsName', []) as Ref<string[]>;

  const tools = computed<ToolWithCategory[]>(() =>
    allTools.map((tool) => {
      const toolI18nKey = tool.path.replace(/\//g, '');
      // 原始英文分类名（index.ts 里的值）。CATEGORIES 表以它为 key，
      // 所以必须保留一份未经翻译的值，否则中文名下查不到 slug。
      const rawCategory = tool.category || 'Development';
      const category = t(`tools.categories.${rawCategory.toLowerCase()}`, rawCategory);

      return {
        ...tool,
        path: tool.path,
        name: t(`tools.${toolI18nKey}.title`, tool.name),
        description: t(`tools.${toolI18nKey}.description`, tool.description),
        category,
        rawCategory,
      };
    }),
  );

  const toolsByCategory = computed<ToolCategory[]>(() => {
    const orderedTools = _.orderBy(tools.value, ['category', 'name'], ['asc', 'asc']);

    // 分组键是「当前语言下的分类名」，所以优先级表也要按当前语言翻译一遍再比对，
    // 这样切到英文时排序规则依然生效。
    const priorityByName: Record<string, number> = {};
    CATEGORY_PRIORITY.forEach((key, index) => {
      priorityByName[t(`tools.categories.${key}`, key)] = index;
    });

    return Object.entries(_.groupBy(orderedTools, (tool) => tool.category))
      .sort(([nameA], [nameB]) => {
        const priorityA = priorityByName[nameA] ?? CATEGORY_PRIORITY.length;
        const priorityB = priorityByName[nameB] ?? CATEGORY_PRIORITY.length;
        return priorityA - priorityB;
      })
      .map(([name, components]) => ({ name, components }));
  });

  const favoriteTools = computed(() => {
    return favoriteToolsName.value
      .map((favoriteName) => {
        // 历史数据里可能存着带尾斜杠的 path（/age-calculator/）：工具页跳转过来的
        // route.path 是带斜杠的，直接存进去侧栏按 path 反查不到，收藏就丢了。
        // 读取时规范化一次，老数据也能重新匹配上。
        const key = normalizeRoutePath(favoriteName);
        return tools.value.find(({ name, path }) => name === favoriteName || path === key);
      })
      .filter(Boolean) as ToolWithCategory[]; // cast because .filter(Boolean) does not remove undefined from type
  });

  return {
    tools,
    favoriteTools,
    toolsByCategory,
    favoriteToolsName,
    newTools: computed(() => tools.value.filter(({ isNew }) => isNew)),

    addToolToFavorites({ tool }: { tool: MaybeRef<Tool> }) {
      // 存规范化后的 path：带尾斜杠的键在侧栏列表里匹配不到任何工具
      const toolPath = normalizeRoutePath(get(tool).path);
      if (toolPath && !favoriteToolsName.value.includes(toolPath)) {
        favoriteToolsName.value.push(toolPath);
      }
    },

    removeToolFromFavorites({ tool }: { tool: MaybeRef<Tool> }) {
      const toolPath = normalizeRoutePath(get(tool).path);
      favoriteToolsName.value = favoriteToolsName.value.filter(
        (name) => get(tool).name !== name && normalizeRoutePath(name) !== toolPath,
      );
    },

    isToolFavorite({ tool }: { tool: MaybeRef<Tool> }) {
      const toolPath = normalizeRoutePath(get(tool).path);
      return (
        favoriteToolsName.value.includes(get(tool).name) ||
        favoriteToolsName.value.some((name) => normalizeRoutePath(name) === toolPath)
      );
    },

    updateFavoriteTools(newOrder: ToolWithCategory[]) {
      favoriteToolsName.value = newOrder.map((tool) => normalizeRoutePath(tool.path));
    },
  };
});
