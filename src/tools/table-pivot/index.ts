import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.table-pivot.title'),
  path: '/table-pivot',
  description: t('tools.table-pivot.description'),
  keywords: ['pivot', 'group by', 'aggregate', 'melt', 'summary', '数据透视'],
  component: () => import('./table-pivot.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/Table')),
  createdAt: new Date('2025-08-23'),
  category: 'Data',
});
