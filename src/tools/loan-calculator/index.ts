import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.loan-calculator.title'),
  path: '/loan-calculator',
  description: t('tools.loan-calculator.description'),
  keywords: [
    '贷款计算器',
    '车贷计算器',
    '消费贷',
    '等额本息',
    '等额本金',
    '先息后本',
    '还款计划表',
    '月供',
    '贷款利息',
    'loan calculator',
  ],
  component: () => import('./loan-calculator.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/Cash')),
  createdAt: new Date('2026-10-03'),
  category: 'Finance',
});
