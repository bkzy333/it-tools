import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.age-calculator.title'),
  path: '/age-calculator',
  description: t('tools.age-calculator.description'),
  keywords: [
    'age',
    'age calculator',
    'birthday',
    'countdown',
    'zodiac',
    'constellation',
    '年龄',
    '年龄计算器',
    '周岁',
    '虚岁',
    '生日倒计时',
    '星座',
    '生肖',
    '生命进度',
  ],
  component: () => import('./age-calculator.vue'),
  // icon 必须用 defineAsyncComponent：同步 import 会把 1500 个图标打进首屏包
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/Hourglass')),
  createdAt: new Date('2026-10-07'),
  category: 'Datetime',
});
