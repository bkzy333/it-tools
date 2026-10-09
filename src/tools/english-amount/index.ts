import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.english-amount.title'),
  path: '/english-amount',
  description: t('tools.english-amount.description'),
  keywords: [
    '英文金额大写',
    '美元大写',
    '金额英文',
    '英文数字大写',
    '金额大写英文',
    'SAY ONLY',
    'english amount',
    'amount in words',
    '美元金额大写',
    '票据英文金额',
  ],
  component: () => import('./english-amount.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/CurrencyDollar')),
  createdAt: new Date('2026-10-09'),
  category: 'Data',
});
