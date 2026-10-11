import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.excel-merge-workbooks.title'),
  path: '/excel-merge-workbooks',
  description: t('tools.excel-merge-workbooks.description'),
  keywords: ['excel', 'merge', 'workbook', '汇总', '多工作簿'],
  component: () => import('./excel-merge-workbooks.vue'),
  // icon 必须用 defineAsyncComponent：同步 import 会把图标打进首屏包
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/FileImport')),
  createdAt: new Date('2026-10-11'),
  category: 'Data',
  tags: ['data', 'excel', 'excel-native'],
});
