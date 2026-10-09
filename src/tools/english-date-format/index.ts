import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.english-date-format.title'),
  path: '/english-date-format',
  description: t('tools.english-date-format.description'),
  keywords: [
    '英文日期',
    '英文日期格式',
    '美式日期',
    '英式日期',
    '日期格式转换',
    'english date format',
    'american date',
    'british date',
    '日期英文',
  ],
  component: () => import('./english-date-format.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/Calendar')),
  createdAt: new Date('2026-10-09'),
  category: 'Datetime',
});
