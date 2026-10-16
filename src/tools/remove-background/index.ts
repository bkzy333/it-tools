import { translate as t } from '@/plugins/i18n.plugin';
import { defineTool } from '../tool';

export const tool = defineTool({
  name: t('tools.remove-background.title'),
  path: '/remove-background',
  description: t('tools.remove-background.description'),
  keywords: ['remove', 'background', 'image', 'rmbg', 'modnet', '抠图', '去背景', '移除背景', '背景透明', '透明背景', '换底色', '证件照', '白底图'],
  component: () => import('./remove-background.vue'),
  icon: defineAsyncComponent(() => import('@vicons/tabler/es/PictureInPictureOff')),
  createdAt: new Date('2026-03-15'),
  category: 'Images',
  tags: ['images'],
  externAccessDescription: t('tools.remove-background.externalAccess'),
});
