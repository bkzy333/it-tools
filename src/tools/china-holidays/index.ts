import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.china-holidays.title'),
  path: '/china-holidays',
  description: t('tools.china-holidays.description'),
  keywords: [
    '放假安排',
    '2026年放假安排',
    '法定节假日',
    '节假日安排',
    '放假调休',
    '调休上班',
    '春节放假',
    '国庆放假',
    '高速免费',
    '国务院办公厅通知',
    'holidays',
    'china public holidays',
  ],
  component: () => import('./china-holidays.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/CalendarEvent')),
  createdAt: new Date('2026-10-04'),
  category: 'Datetime',
});
