import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.json-markdown-table.title'),
  path: '/json-markdown-table',
  description: t('tools.json-markdown-table.description'),
  keywords: ['json', 'markdown', 'table', 'md', 'convert', '转换'],
  component: () => import('./json-markdown-table.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/Columns')),
  createdAt: new Date('2026-10-12'),
  category: 'JSON',
  tags: ['json', 'markdown', 'table', 'convert'],
});
