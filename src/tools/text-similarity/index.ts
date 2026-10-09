import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.text-similarity.title'),
  path: '/text-similarity',
  description: t('tools.text-similarity.description'),
  keywords: ['text', 'similarity', 'duplicate', '查重', '重复率', 'similar'],
  component: () => import('./text-similarity.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/ReportSearch')),
  createdAt: new Date('2026-10-09'),
  category: 'Text',
});
