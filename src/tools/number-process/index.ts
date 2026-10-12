import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.number-process.title'),
  path: '/number-process',
  description: t('tools.number-process.description'),
  keywords: ['number', 'process', 'thousands', 'scientific', 'roman', '大写', '数字处理', '千分位', '科学计数法', '罗马数字'],
  component: () => import('./number-process.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/Calculator')),
  createdAt: new Date('2026-10-12'),
  category: 'Data',
  tags: ['data', 'number'],
});
