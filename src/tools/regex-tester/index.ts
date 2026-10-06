import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.regex-tester.title'),
  path: '/regex-tester',
  description: t('tools.regex-tester.description'),
  keywords: ['正则表达式', '正则测试', '正则校验', 'regex', 'regex tester', '正则在线测试', '正则替换'],
  component: () => import('./regex-tester.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/Language')),
  createdAt: new Date('2024-09-20'),
  category: 'Text',
});
