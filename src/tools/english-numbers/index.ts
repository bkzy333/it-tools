import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.english-numbers.title'),
  path: '/english-numbers',
  description: t('tools.english-numbers.description'),
  keywords: [
    '数字转英文',
    '英文转数字',
    '数字英文',
    '英文读数',
    '英文数字转换',
    'number to words',
    'english numbers',
    '阿拉伯数字英文',
    '金额英文',
  ],
  component: () => import('./english-numbers.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/Number9')),
  createdAt: new Date('2026-10-09'),
  category: 'Text',
});
