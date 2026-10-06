import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.markdown-to-wechat.title'),
  path: '/markdown-to-wechat',
  description: t('tools.markdown-to-wechat.description'),
  keywords: [
    'Markdown',
    '公众号排版',
    '微信公众号',
    'Markdown转公众号',
    '排版工具',
    '富文本',
    '微信编辑器',
    'md转微信',
    'markdown to wechat',
  ],
  component: () => import('./markdown-to-wechat.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/Markdown')),
  createdAt: new Date('2026-10-03'),
  category: 'Markdown',
  npmPackages: ['markdown-it', 'highlight.js', 'dompurify'],
});
