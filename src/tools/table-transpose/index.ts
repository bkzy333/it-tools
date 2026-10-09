import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.table-transpose.title'),
  path: '/table-transpose',
  description: t('tools.table-transpose.description'),
  keywords: ['table', 'transpose'],
  component: () => import('./table-transpose.vue'),
  // icon 必须用 defineAsyncComponent：同步 import 会把 1500 个图标打进首屏包
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/Table')),
  createdAt: new Date('2026-10-09'),
  category: 'Data',
});
