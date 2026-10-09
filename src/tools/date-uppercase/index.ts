import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.date-uppercase.title'),
  path: '/date-uppercase',
  description: t('tools.date-uppercase.description'),
  keywords: [
    '日期大写',
    '支票日期',
    '票据日期',
    '会计日期大写',
    '出票日期',
    '大写日期',
    '日期转大写',
    'date uppercase',
    'chinese date uppercase',
  ],
  component: () => import('./date-uppercase.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/CalendarTime')),
  createdAt: new Date('2026-10-09'),
  category: 'Datetime',
});
