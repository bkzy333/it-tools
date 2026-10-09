import { defineAsyncComponent } from 'vue';
import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.free-ssl.title'),
  path: '/free-ssl',
  description: t('tools.free-ssl.description'),
  keywords: [
    'ssl',
    'tls',
    'https',
    'certificate',
    'letsencrypt',
    '证书',
    '通配符',
    'wildcard',
    '免费',
    'acme',
  ],
  component: () => import('./free-ssl.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/Certificate')),
  createdAt: new Date('2026-10-09'),
  category: 'Network',
  npmPackages: ['node-forge', 'jose'],
  externAccessDescription: t('tools.free-ssl.externalAccess'),
});
