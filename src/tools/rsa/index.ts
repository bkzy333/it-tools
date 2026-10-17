import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.rsa.title'),
  path: '/rsa',
  description: t('tools.rsa.description'),
  keywords: [
    'rsa',
    'rsa加密',
    'rsa解密',
    'rsa在线',
    'rsa密钥生成',
    'rsa签名',
    'rsa验签',
    '非对称加密',
    '公钥加密',
    '私钥解密',
    '密钥对',
    'pem',
    'pkcs1',
    'pkcs8',
    'oaep',
    'jwt 签名',
    'asymmetric',
  ],
  component: () => import('./rsa.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/Key')),
  createdAt: new Date('2026-10-17'),
  category: 'Crypto',
  tags: ['crypto'],
});
