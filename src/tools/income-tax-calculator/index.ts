import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.income-tax-calculator.title'),
  path: '/income-tax-calculator',
  description: t('tools.income-tax-calculator.description'),
  keywords: [
    '个税',
    '个人所得税',
    '个税计算器',
    '税率',
    '汇算清缴',
    '专项附加扣除',
    '到手工资',
    '税后工资',
    '年终奖',
    '五险一金',
    'income tax',
    'tax calculator',
  ],
  component: () => import('./income-tax-calculator.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/ReceiptTax')),
  createdAt: new Date('2026-10-03'),
  category: 'Finance',
});
