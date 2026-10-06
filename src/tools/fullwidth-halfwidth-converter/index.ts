import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.fullwidth-halfwidth-converter.title'),
  path: '/fullwidth-halfwidth-converter',
  description: t('tools.fullwidth-halfwidth-converter.description'),
  keywords: [
    '全角半角',
    '全角半角转换',
    '半角转全角',
    '全角转半角',
    '全角字符',
    '字符转换',
    '文本清洗',
    'fullwidth',
    'halfwidth',
  ],
  component: () => import('./fullwidth-halfwidth-converter.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/SwitchHorizontal')),
  createdAt: new Date('2026-10-03'),
  category: 'Text',
});
