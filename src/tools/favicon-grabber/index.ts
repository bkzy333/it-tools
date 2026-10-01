import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.favicon-grabber.title'),
  path: '/favicon-grabber',
  description: t('tools.favicon-grabber.description'),
  keywords: [
    'favicon',
    'icon',
    'logo',
    'website icon',
    '网站图标',
    'favicon下载',
    '网站logo',
    'ico',
  ],
  component: () => import('./favicon-grabber.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/WorldDownload')),
  createdAt: new Date('2026-10-01'),
  category: 'Web',
  externAccessDescription: t('tools.favicon-grabber.externalAccess'),
});
