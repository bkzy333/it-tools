import { defineTool } from '../tool';
import { translate as t } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: t('tools.special-symbols.title'),
  path: '/special-symbols',
  description: t('tools.special-symbols.description'),
  keywords: ['symbol', 'special', '符号', '特殊符号', 'emoji', 'character'],
  component: () => import('./special-symbols.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/MathSymbols')),
  createdAt: new Date('2026-10-09'),
  category: 'Text',
});
