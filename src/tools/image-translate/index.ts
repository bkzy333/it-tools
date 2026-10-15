import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.image-translate.title'),
  path: '/image-translate',
  description: t('tools.image-translate.description'),
  // 搜索走 FlexSearch 的前缀分词：只有整词「图片翻译」搜「翻译」是命中不了的，
  // 必须把用户真会输入的单字词（翻译 / 文字识别 / 中英互译）单独列出来。
  keywords: ['image', 'translate', '翻译', '图片翻译', '图片识别', '文字识别', '中英互译', 'ocr'],
  externAccessDescription: t('tools.image-translate.externalAccess'),
  component: () => import('./image-translate.vue'),
  // icon 必须用 defineAsyncComponent：同步 import 会把 1500 个图标打进首屏包
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/Photo')),
  createdAt: new Date('2026-10-10'),
  category: 'Images',
  tags: ['images'],
});
