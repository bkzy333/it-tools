import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.yaml-prettify.title'),
  path: '/yaml-prettify',
  description: t('tools.yaml-prettify.description'),
  keywords: ['yaml', 'viewer', 'prettify', 'format', 'lint', 'validator', 'schema'],
  component: () => import('./yaml-viewer.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/AlignJustified')),
  createdAt: new Date('2024-01-31'),
  npmPackages: ['yaml'],
  // 页面一挂载就会拉 schemastore.org 的模式目录，勾选某个 schema 后再拉对应的模式文件。
  // 不写这个字段时 extract-tools-meta.mjs 会记成 isExternalAccess: false，
  // 静态页于是宣称「所有计算都在浏览器本地完成，数据不会上传」，和实际行为矛盾。
  externAccessDescription: t('tools.yaml-prettify.externalAccess'),
  category: 'YAML',
});
