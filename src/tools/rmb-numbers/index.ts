import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.rmb-numbers.title'),
  path: '/rmb-numbers',
  description: t('tools.rmb-numbers.description'),
  keywords: [
    'rmb',
    'renminbi',
    'cny',
    '人民币大写',
    '大写金额',
    '金额大写',
    '人民币大写转换器',
    '美元大写',
    '金额英文',
    'SAY ONLY',
    'english amount',
    'amount in words',
    '票据英文金额',
    '数字转英文',
    '英文转数字',
    'number to words',
    'english numbers',
    '英文读数',
  ],
  component: () => import('./rmb-numbers.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/CurrencyYen')),
  createdAt: new Date('2024-04-29'),
  category: 'Data',
  tags: ['data', 'excel'],
});
