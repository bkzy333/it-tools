import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.retirement-age-calculator.title'),
  path: '/retirement-age-calculator',
  description: t('tools.retirement-age-calculator.description'),
  keywords: [
    '退休年龄',
    '延迟退休',
    '法定退休年龄',
    '退休年龄计算器',
    '渐进式延迟退休',
    '退休时间',
    '退休年月',
    '弹性退休',
    '退休年龄对照表',
    '社保缴费年限',
    '养老金',
    'retirement age',
    'china retirement age',
  ],
  component: () => import('./retirement-age-calculator.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/CalendarStats')),
  createdAt: new Date('2026-10-04'),
  category: 'Datetime',
});
