import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.lunar-calendar.title'),
  path: '/lunar-calendar',
  description: t('tools.lunar-calendar.description'),
  keywords: [
    '农历',
    '阴历',
    '农历转换',
    '公历转农历',
    '农历转公历',
    '干支',
    '生肖',
    '星座',
    '农历生日',
    '万年历',
    'lunar calendar',
    'chinese calendar',
    '农历查询',
  ],
  component: () => import('./lunar-calendar.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/CalendarStats')),
  createdAt: new Date('2026-10-09'),
  category: 'Datetime',
});
