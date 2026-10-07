import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';
import { defineAsyncComponent } from 'vue';

export const tool = defineTool({
  name: t('tools.number-rounding.title'),
  path: '/number-rounding',
  description: t('tools.number-rounding.description'),
  keywords: ['number', 'round', 'rounding', '舍入', '四舍五入', '取整'],
  component: () => import('./number-rounding.vue'),
  // 图标必须用 defineAsyncComponent：同步 import 会把 1500 个图标打进首屏包
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/Calculator')),
  createdAt: new Date('2026-10-07'),
  category: 'Data',
});
