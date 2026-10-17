import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.rent-calculator.title'),
  path: '/rent-calculator',
  description: t('tools.rent-calculator.description'),
  keywords: [
    'rent',
    'rent calculator',
    'utilities',
    '房租计算器',
    '房租水电费计算',
    '水电费计算器',
    '房租水电计算器',
    '电费计算',
    '水费计算',
    '房租记账',
    '收租记账',
    '租房成本计算',
    '房租水电费明细',
    '房东记账工具',
  ],
  component: () => import('./rent-calculator.vue'),
  // icon 必须用 defineAsyncComponent：同步 import 会把 1500 个图标打进首屏包
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/BuildingSkyscraper')),
  createdAt: new Date('2026-10-17'),
  category: 'Life',
});
