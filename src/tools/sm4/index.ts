import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.sm4.title'),
  path: '/sm4',
  description: t('tools.sm4.description'),
  keywords: [
    'sm4',
    'sm4加密',
    'sm4解密',
    'sm4在线',
    '国密',
    '国密算法',
    '国密 sm4',
    '国密加密',
    '商用密码',
    'sm4 cbc',
    'sm4 ecb',
    'gmssl',
    'gb/t 32907',
    'symmetric',
  ],
  component: () => import('./sm4.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/LockSquare')),
  createdAt: new Date('2026-10-17'),
  category: 'Crypto',
  tags: ['crypto'],
});
