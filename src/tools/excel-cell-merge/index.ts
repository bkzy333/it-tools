import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.excel-cell-merge.title'),
  path: '/excel-cell-merge',
  description: t('tools.excel-cell-merge.description'),
  keywords: ['excel', 'merge', 'cells', '合并单元格'],
  component: () => import('./excel-cell-merge.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/GridDots')),
  createdAt: new Date('2026-10-11'),
  category: 'Data',
  tags: ['data', 'excel', 'excel-native'],
});
