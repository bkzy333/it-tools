import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.sequence-generator.title'),
  path: '/sequence-generator',
  description: t('tools.sequence-generator.description'),
  keywords: ['sequence', 'generator'],
  component: () => import('./sequence-generator.vue'),
  // icon 必须用 defineAsyncComponent：同步 import 会把 1500 个图标打进首屏包
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/ListNumbers')),
  createdAt: new Date('2026-10-09'),
  category: 'Generators',
});
