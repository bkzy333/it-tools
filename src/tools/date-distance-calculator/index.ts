import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.date-distance-calculator.title'),
  path: '/date-distance-calculator',
  description: t('tools.date-distance-calculator.description'),
  keywords: [
    'date',
    'distance',
    'days',
    'difference',
    'workday',
    'countdown',
    'lunar',
    '干支',
    '农历',
    '倒计时',
    '日期',
  ],
  component: () => import('./date-distance-calculator.vue'),
  // 这个版本的 @vicons/tabler 里没有 CalendarDifference，用仓库已在用的 CalendarEvent
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/CalendarEvent')),
  createdAt: new Date('2026-10-06'),
  category: 'Datetime',
});
