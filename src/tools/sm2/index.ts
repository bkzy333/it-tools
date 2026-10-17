import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.sm2.title'),
  path: '/sm2',
  description: t('tools.sm2.description'),
  keywords: [
    'sm2',
    'sm2加密',
    'sm2解密',
    'sm2签名',
    'sm2验签',
    'sm2在线',
    '国密',
    '国密算法',
    '国密 sm2',
    '国密签名',
    '商用密码',
    'c1c3c2',
    'c1c2c3',
    'sm2p256v1',
    'gm/t 0003',
    'elliptic curve',
  ],
  component: () => import('./sm2.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/ShieldLock')),
  createdAt: new Date('2026-10-17'),
  category: 'Crypto',
  tags: ['crypto'],
});
