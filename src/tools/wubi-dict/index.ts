import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.wubi-dict.title'),
  path: '/wubi-dict',
  description: t('tools.wubi-dict.description'),
  keywords: [
    '五笔',
    '五笔编码',
    '五笔查询',
    '五笔字型',
    '五笔86',
    '五笔98',
    '五笔反查',
    '汉字五笔',
    'wubi',
    '五笔码',
    '五笔字根',
  ],
  component: () => import('./wubi-dict.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/Keyboard')),
  createdAt: new Date('2026-10-09'),
  category: 'Text',
});
