import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.text-translate.title'),
  path: '/text-translate',
  description: t('tools.text-translate.description'),
  keywords: ['text', 'translate', '翻译', '机器翻译'],
  externAccessDescription: t('tools.text-translate.externalAccess'),
  component: () => import('./text-translate.vue'),
  // icon 必须用 defineAsyncComponent：同步 import 会把 1500 个图标打进首屏包
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/Language')),
  createdAt: new Date('2026-10-10'),
  category: 'Text',
});
