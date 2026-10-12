import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.table-converter.title'),
  path: '/table-converter',
  description: t('tools.table-converter.description'),
  keywords: ['table', 'csv', 'excel', 'json', 'markdown', 'convert', 'transpose', 'grid'],
  component: () => import('./table-converter.vue'),
  // icon 必须用 defineAsyncComponent：同步 import 会把图标打进首屏包
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/Table')),
  createdAt: new Date('2026-10-12'),
  category: 'Data',
  tags: ['data', 'excel', 'data-cleaning', 'table'],
});
