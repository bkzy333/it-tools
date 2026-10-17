import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.file-hash.title'),
  path: '/file-hash',
  description: t('tools.file-hash.description'),
  keywords: [
    'file',
    'hash',
    'checksum',
    'md5',
    'sha1',
    'sha256',
    'sha384',
    'sha512',
    'sha3',
    'blake2b',
    '校验',
    '校验和',
    '文件校验',
    '文件哈希',
    '哈希计算',
    'md5校验',
    'sha256校验',
    '文件指纹',
    '完整性',
  ],
  component: () => import('./file-hash.vue'),
  // icon 必须用 defineAsyncComponent：同步 import 会把 1500 个图标打进首屏包
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/Fingerprint')),
  createdAt: new Date('2026-10-17'),
  category: 'Crypto',
  npmPackages: ['hash-wasm'],
});
