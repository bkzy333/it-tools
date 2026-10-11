import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';
import { defineAsyncComponent } from 'vue';

export const tool = defineTool({
  name: t('tools.text-merge.title'),
  path: '/text-merge',
  description: t('tools.text-merge.description'),
  keywords: ['text', 'merge', 'concat', 'join', 'tsv'],
  component: () => import('./text-merge.vue'),
  // icon 必须用 defineAsyncComponent：同步 import 会把 1500 个图标打进首屏包
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/Columns')),
  createdAt: new Date('2026-10-11'),
  category: 'Text',
  tags: ['text', 'excel', 'data-cleaning'],
});
