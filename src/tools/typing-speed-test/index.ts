import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.typing-speed-test.title'),
  path: '/typing-speed-test',
  description: t('tools.typing-speed-test.description'),
  keywords: [
    'typing',
    'typing speed test',
    'wpm',
    'cpm',
    '打字速度测试',
    '打字测试',
    '在线打字',
    '打字练习',
    '打字测速',
    '准确率',
  ],
  component: () => import('./typing-speed-test.vue'),
  // icon 必须用 defineAsyncComponent：同步 import 会把 1500 个图标打进首屏包
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/Keyboard')),
  createdAt: new Date('2026-10-07'),
  category: 'Text',
});
