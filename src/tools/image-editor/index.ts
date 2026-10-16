import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.image-editor.title'),
  path: '/image-editor',
  description: t('tools.image-editor.description'),
  // 搜索走 FlexSearch 的前缀分词：整词「图片编辑」命中不了用户输入的「修图」「改图」，
  // 必须把用户真会输入的短词单独列出来。
  keywords: [
    'image',
    'editor',
    'photo',
    'paint',
    'draw',
    'layers',
    'filters',
    'ps',
    '图片编辑',
    '图片编辑器',
    '在线ps',
    '在线PS',
    '在线修图',
    '修图',
    '图片处理',
    '改图',
    '绘图',
    '画图',
    '图层',
    '滤镜',
    '照片编辑',
  ],
  component: () => import('./image-editor.vue'),
  // 图标必须 defineAsyncComponent：同步 import 会把整个图标库打进首屏包。
  // Palette 与 color-converter 同款（全站共用），不新增图标依赖。
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/Palette')),
  createdAt: new Date('2026-10-16'),
  category: 'Images',
  tags: ['images'],
});
