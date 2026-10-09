import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.text-numbering.title'),
  path: '/text-numbering',
  description: t('tools.text-numbering.description'),
  keywords: ['text', 'number', 'numbering', 'line', '序号', '编号'],
  component: () => import('./text-numbering.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/ListDetails')),
  createdAt: new Date('2026-10-09'),
  category: 'Text',
});
