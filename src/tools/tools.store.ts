import { type MaybeRef, get } from '@vueuse/core';
import { defineStore } from 'pinia';
import type { Ref } from 'vue';
import * as _ from 'es-toolkit/compat';
import type { Tool, ToolCategory, ToolWithCategory } from './tools.types';
import { tools as allTools } from './index';
import { useITStorage } from '@/composable/queryParams';

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
      .map((favoriteName) => tools.value.find(({ name, path }) => name === favoriteName || path === favoriteName))
      .filter(Boolean) as ToolWithCategory[]; // cast because .filter(Boolean) does not remove undefined from type
  });

  return {
    tools,
    favoriteTools,
    toolsByCategory,
    favoriteToolsName,
    newTools: computed(() => tools.value.filter(({ isNew }) => isNew)),

    addToolToFavorites({ tool }: { tool: MaybeRef<Tool> }) {
      const toolPath = get(tool).path;
      if (toolPath) {
        favoriteToolsName.value.push(toolPath);
      }
    },

    removeToolFromFavorites({ tool }: { tool: MaybeRef<Tool> }) {
      favoriteToolsName.value = favoriteToolsName.value.filter(
        (name) => get(tool).name !== name && get(tool).path !== name,
      );
      favoriteToolsName.value = favoriteToolsName.value.filter(
        (name) => get(tool).name !== name && get(tool).path !== name,
      );
    },

    isToolFavorite({ tool }: { tool: MaybeRef<Tool> }) {
      return favoriteToolsName.value.includes(get(tool).name) || favoriteToolsName.value.includes(get(tool).path);
    },

    updateFavoriteTools(newOrder: ToolWithCategory[]) {
      favoriteToolsName.value = newOrder.map((tool) => tool.path);
    },
  };
});
