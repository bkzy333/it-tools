import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.credit-card-installment-calculator.title'),
  path: '/credit-card-installment-calculator',
  description: t('tools.credit-card-installment-calculator.description'),
  keywords: [
    '信用卡分期',
    '分期真实利率',
    '分期利率计算器',
    '账单分期',
    '手续费率',
    '折算年化利率',
    'IRR',
    '年化利率',
    '消费分期',
    '花呗分期',
    'credit card installment',
    'irr calculator',
  ],
  component: () => import('./credit-card-installment-calculator.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/CreditCard')),
  createdAt: new Date('2026-10-04'),
  category: 'Finance',
});
