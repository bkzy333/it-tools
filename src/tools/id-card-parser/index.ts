import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.id-card-parser.title'),
  path: '/id-card-parser',
  description: t('tools.id-card-parser.description'),
  keywords: [
    '身份证',
    '身份证号',
    '身份证查询',
    '身份证校验',
    '身份证归属地',
    '身份证号解析',
    '行政区划代码',
    '校验位',
    'id card',
    'id number',
  ],
  component: () => import('./id-card-parser.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/Id')),
  createdAt: new Date('2026-10-03'),
  category: 'Data',
});
