import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.weather.title'),
  path: '/weather',
  description: t('tools.weather.description'),
  keywords: [
    'weather',
    'forecast',
    'temperature',
    'meteo',
    '天气',
    '天气预报',
    '气温',
    '城市天气',
    '空气质量',
    '温度',
  ],
  component: () => import('./weather.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/Temperature')),
  createdAt: new Date('2026-10-01'),
  category: 'Weather',
  externAccessDescription: t('tools.weather.externalAccess'),
});
