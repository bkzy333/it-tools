import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.bcrypt.title'),
  path: '/bcrypt',
  description: t('tools.bcrypt.description'),
  keywords: [
    'bcrypt',
    'bcrypt在线',
    'bcrypt生成',
    'bcrypt校验',
    '密码哈希',
    '密码加密',
    '加盐哈希',
    '盐值',
    'cost',
    'password hash',
    'password',
    'hash',
    'salt',
  ],
  component: () => import('./bcrypt.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/ShieldLock')),
  createdAt: new Date('2026-10-17'),
  category: 'Crypto',
  tags: ['crypto'],
});
