import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.batch-timestamp.title'),
  path: '/batch-timestamp',
  description: t('tools.batch-timestamp.description'),
  keywords: [
    '批量时间戳',
    '时间戳批量转换',
    '时间戳转时间',
    '时间转时间戳',
    'unix时间戳',
    '批量转换',
    '时间戳导出',
    'batch timestamp',
    'unix timestamp batch',
  ],
  component: () => import('./batch-timestamp.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/History')),
  createdAt: new Date('2026-10-09'),
  category: 'Datetime',
});
