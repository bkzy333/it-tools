import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.text-extract.title'),
  path: '/text-extract',
  description: t('tools.text-extract.description'),
  keywords: ['text', 'extract'],
  component: () => import('./text-extract.vue'),
  // icon 必须用 defineAsyncComponent：同步 import 会把 1500 个图标打进首屏包
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/ClipboardList')),
  createdAt: new Date('2026-10-07'),
  category: 'Text',
});
