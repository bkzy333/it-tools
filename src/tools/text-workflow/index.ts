import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.text-workflow.title'),
  path: '/text-workflow',
  description: t('tools.text-workflow.description'),
  keywords: ['text', 'workflow', 'pipeline', '工作流', '文本处理', '批处理'],
  component: () => import('./text-workflow.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/AdjustmentsHorizontal')),
  createdAt: new Date('2026-10-09'),
  category: 'Text',
});
