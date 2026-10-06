import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.salary-calculator.title'),
  path: '/salary-calculator',
  description: t('tools.salary-calculator.description'),
  keywords: [
    '工资计算器',
    '税前工资',
    '税后工资',
    '到手工资',
    '五险一金',
    '社保计算器',
    '公积金',
    '个税',
    '薪资计算器',
    '反推税前',
    'salary',
  ],
  component: () => import('./salary-calculator.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/Wallet')),
  createdAt: new Date('2026-10-03'),
  category: 'Finance',
});
