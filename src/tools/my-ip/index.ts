import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.my-ip.title'),
  path: '/my-ip',
  description: t('tools.my-ip.description'),
  keywords: ['my', 'client', 'ip', 'ipv4', 'ipv6', 'ip地址', '公网ip', '我的ip', 'ip查询', 'ip归属地'],
  component: () => import('./my-ip.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/World')),
  createdAt: new Date('2025-01-01'),
  category: 'Network',
  externAccessDescription: t('tools.my-ip.externalAccess'),
});
