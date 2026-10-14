import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.pdf-organize.title'),
  path: '/pdf-organize',
  description: t('tools.pdf-organize.description'),
  keywords: ['pdf', 'organize', 'split', 'rotate', 'reorder', 'delete'],
  component: () => import('./pdf-organize.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/FileText')),
  createdAt: new Date('2026-10-14'),
  category: 'PDF',
  tags: ['pdf'],
});
