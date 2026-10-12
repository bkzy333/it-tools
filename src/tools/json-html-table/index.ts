import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';
import { defineAsyncComponent } from 'vue';

export const tool = defineTool({
  name: t('tools.json-html-table.title'),
  path: '/json-html-table',
  description: t('tools.json-html-table.description'),
  keywords: ['json', 'html', 'table', 'convert', '转换'],
  component: () => import('./json-html-table.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/Table')),
  createdAt: new Date('2026-10-12'),
  category: 'JSON',
  tags: ['json', 'html', 'table', 'convert'],
});
