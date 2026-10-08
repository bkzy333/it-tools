import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.random-picker.title'),
  path: '/random-picker',
  description: t('tools.random-picker.description'),
  keywords: ['random', 'pick', 'lottery', 'shuffle', 'weighted', 'split'],
  redirectFrom: ['/random-numbers-generator'],
  component: () => import('./random-picker.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/ArrowsShuffle')),
  createdAt: new Date('2025-08-23'),
  category: 'Generators',
});
