import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.text-dedupe.title'),
  path: '/text-dedupe',
  description: t('tools.text-dedupe.description'),
  keywords: ['text', 'dedupe'],
  component: () => import('./text-dedupe.vue'),
  // icon 必须用 defineAsyncComponent：同步 import 会把 1500 个图标打进首屏包
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/ListCheck')),
  createdAt: new Date('2026-10-07'),
  category: 'Text',
});
