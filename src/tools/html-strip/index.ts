import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.html-strip.title'),
  path: '/html-strip',
  description: t('tools.html-strip.description'),
  keywords: ['html', 'strip', 'clean', 'remove', 'style', 'class', 'attribute', 'plain-text', 'tag'],
  component: () => import('./html-strip.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/ClearFormatting')),
  createdAt: new Date('2026-10-12'),
  category: 'Web',
  tags: ['html', 'clean', 'convert', 'web'],
});
