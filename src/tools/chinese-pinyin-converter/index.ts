import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.chinese-pinyin-converter.title'),
  path: '/chinese-pinyin-converter',
  description: t('tools.chinese-pinyin-converter.description'),
  keywords: [
    '汉字转拼音',
    '拼音转换',
    '中文转拼音',
    '拼音生成器',
    '带声调拼音',
    '拼音首字母',
    '多音字',
    '在线拼音',
    'chinese pinyin',
  ],
  component: () => import('./chinese-pinyin-converter.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/Language')),
  createdAt: new Date('2026-10-03'),
  category: 'Text',
});
