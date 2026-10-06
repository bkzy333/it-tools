import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.chinese-script-converter.title'),
  path: '/chinese-script-converter',
  description: t('tools.chinese-script-converter.description'),
  keywords: [
    '简体转繁体',
    '繁体转简体',
    '简繁转换',
    '汉字转换',
    '繁体字转换',
    '繁体字',
    '简体字',
    '中文转换',
    'opencc',
    'traditional chinese',
    'simplified chinese',
  ],
  component: () => import('./chinese-script-converter.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/Language')),
  createdAt: new Date('2026-10-04'),
  category: 'Text',
});
