import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.table-lookup.title'),
  path: '/table-lookup',
  description: t('tools.table-lookup.description'),
  keywords: ['vlookup', 'lookup', 'table', 'match', 'merge', 'lookup table'],
  component: () => import('./table-lookup.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/Table')),
  createdAt: new Date('2025-08-23'),
  category: 'Data',
});
