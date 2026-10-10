import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.image-translate.title'),
  path: '/image-translate',
  description: t('tools.image-translate.description'),
  keywords: ['image', 'translate', '图片翻译', 'ocr'],
  externAccessDescription: t('tools.image-translate.externalAccess'),
  component: () => import('./image-translate.vue'),
  // icon 必须用 defineAsyncComponent：同步 import 会把 1500 个图标打进首屏包
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/Photo')),
  createdAt: new Date('2026-10-10'),
  category: 'Images',
});
