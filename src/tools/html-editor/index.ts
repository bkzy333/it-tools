import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.html-editor.title'),
  path: '/html-editor',
  description: t('tools.html-editor.description'),
  keywords: [
    'html',
    'editor',
    'playground',
    'preview',
    'sandbox',
    '在线编辑器',
    'html编辑器',
    '在线html',
    'html代码',
    'html预览',
    '网页编辑器',
    '实时预览',
    '代码编辑',
    'html在线运行',
  ],
  component: () => import('./html-editor.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/Code')),
  createdAt: new Date('2026-10-16'),
  category: 'Web',
  tags: ['web', 'dev'],
});
