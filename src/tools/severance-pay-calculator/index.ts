import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.severance-pay-calculator.title'),
  path: '/severance-pay-calculator',
  description: t('tools.severance-pay-calculator.description'),
  keywords: [
    '离职补偿金',
    '经济补偿金',
    '补偿金计算器',
    'N+1',
    '赔偿金',
    '违法解除',
    '裁员补偿',
    '劳动法',
    '劳动合同法第47条',
    '工作年限',
    '三倍封顶',
    'severance pay',
    'china labor law',
  ],
  component: () => import('./severance-pay-calculator.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/Coin')),
  createdAt: new Date('2026-10-04'),
  category: 'Finance',
});
