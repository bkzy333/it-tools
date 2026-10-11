import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.excel-cell-unmerge.title'),
  path: '/excel-cell-unmerge',
  description: t('tools.excel-cell-unmerge.description'),
  keywords: ['excel', 'unmerge', 'cells', '拆分单元格'],
  component: () => import('./excel-cell-unmerge.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/LayoutGrid')),
  createdAt: new Date('2026-10-11'),
  category: 'Data',
  tags: ['data', 'excel', 'excel-native'],
});
