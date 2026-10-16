import { translate as t } from '@/plugins/i18n.plugin';
import { defineTool } from '../tool';

export const tool = defineTool({
  name: t('tools.dns-query.title'),
  path: '/dns-query',
  description: t('tools.dns-query.description'),
  keywords: [
    'dns',
    'query',
    'lookup',
    'resolve',
    'domain',
    'A',
    'AAAA',
    'CNAME',
    'MX',
    'TXT',
    'NS',
    'SOA',
    'network',
    'devops',
    'rdap',
  ],
  component: () => import('./dns-query.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/World')),
  createdAt: new Date('2026-07-11'),
  category: 'Network',
  tags: ['network'],
  externAccessDescription: t('tools.dns-query.externalAccess'),
});
