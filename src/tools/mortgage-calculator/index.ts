import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.mortgage-calculator.title'),
  path: '/mortgage-calculator',
  description: t('tools.mortgage-calculator.description'),
  keywords: [
    '房贷',
    '房贷计算器',
    '月供',
    '等额本息',
    '等额本金',
    '提前还贷',
    '贷款计算器',
    '商业贷款',
    '公积金贷款',
    '组合贷',
    'mortgage',
  ],
  component: () => import('./mortgage-calculator.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/BuildingBank')),
  createdAt: new Date('2026-10-03'),
  category: 'Finance',
});
