import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.kinship-calculator.title'),
  path: '/kinship-calculator',
  description: t('tools.kinship-calculator.description'),
  keywords: [
    '亲戚',
    '称呼',
    '称谓',
    '辈分',
    '关系',
    '亲戚关系',
    '称呼计算器',
    'kinship',
    'relative',
    'family',
    'chinese kinship',
  ],
  component: () => import('./kinship-calculator.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/Users')),
  category: 'Data',
});
