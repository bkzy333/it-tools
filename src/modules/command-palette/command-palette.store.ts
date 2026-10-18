import { defineStore } from 'pinia';
import * as _ from 'es-toolkit/compat';
import type { PaletteOption } from './command-palette.types';
import { useToolStore } from '@/tools/tools.store';
import { useStyleStore } from '@/stores/style.store';

import SunIcon from '~icons/mdi/white-balance-sunny';
import DiceIcon from '~icons/mdi/dice-5';
import InfoIcon from '~icons/mdi/information-outline';
import { useFlexSearch } from '@/composable/flexSearch';

import { translate as t } from '@/plugins/i18n.plugin';

const maxSearchResultsPerCategory = import.meta.env.VITE_MAX_SEARCH_RESULT || 25;

export const useCommandPaletteStore = (locale: string) =>
  defineStore(`command-palette-${locale}`, () => {
    const toolStore = useToolStore();
    const styleStore = useStyleStore();
    const router = useRouter();
    const searchPrompt = ref('');

    const toolsOptions = toolStore.tools.map((tool) => ({
      ...tool,
      to: tool.path,
      toolCategory: tool.category,
      category: t('tools.command-palette.store.texts.tools'),
    }));

    const searchOptions: PaletteOption[] = [
      ...toolsOptions,
      {
        name: t('tools.command-palette.store.texts.random-tool'),
        description: t('tools.command-palette.store.texts.get-a-random-tool-from-the-list'),
        action: () => {
          const { path } = _.sample(toolStore.tools)!;
          // router.push 返回 Promise，跳转失败（重复路由等）时若不处理会产生未处理 rejection
          void router.push(path);
        },
        icon: DiceIcon,
        category: t('tools.command-palette.store.texts.tools-0'),
        keywords: ['random', 'tool', 'pick', 'choose', 'select'],
        closeOnSelect: true,
      },
      {
        name: t('tools.command-palette.store.texts.toggle-dark-mode'),
        description: t('tools.command-palette.store.texts.toggle-dark-mode-on-or-off'),
        action: () => styleStore.toggleDark(),
        icon: SunIcon,
        category: t('tools.command-palette.store.texts.actions'),
        keywords: ['dark', 'theme', 'toggle', 'mode', 'light', 'system'],
      },
      {
        name: t('home.nav.about'),
        description: t('tools.command-palette.store.texts.about-this-site'),
        to: '/about',
        category: t('tools.command-palette.store.texts.pages'),
        keywords: ['about', 'learn', 'more', 'info', 'information'],
        icon: InfoIcon,
      },
    ];

    const { searchResult } = useFlexSearch({
      search: searchPrompt,
      data: searchOptions,
      options: {
        keys: [{ name: 'name', weight: 2 }, 'description', 'keywords', 'category'],
      },
    });

    const filteredSearchResult = computed(() =>
      _.mapValues(
        _.groupBy(searchResult.value, (option) => option.category),
        (categoryOptions) => categoryOptions.slice(0, maxSearchResultsPerCategory),
      ),
    );

    return {
      filteredSearchResult,
      searchPrompt,
    };
  })();
