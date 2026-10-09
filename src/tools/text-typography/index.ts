import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.text-typography.title'),
  path: '/text-typography',
  description: t('tools.text-typography.description'),
  keywords: ['text', 'typography', '排版', '中英文混排', '空格', '标点'],
  component: () => import('./text-typography.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/LettersCase')),
  createdAt: new Date('2026-10-09'),
  category: 'Text',
});
