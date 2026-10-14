import {
  defineConfig,
  presetAttributify,
  presetTypography,
  presetWind3,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss';

import { presetScrollbar } from 'unocss-preset-scrollbar';

export default defineConfig({
  presets: [presetWind3(), presetAttributify({
    // 同时忽略 size 的 v-bind 变体（:size / v-bind:size）：
    // presetAttributify 的 extractor 在剥掉 ":" 前缀「之前」就做 ignoreAttributes 检查，
    // 只写 "size" 拦不住 ":size=\"16\""，会生成 [size~="16"]{width:4rem} 全局规则，
    // 把 tabler 图标运行时渲染的 <svg size="16"> 放大到 64px。
    ignoreAttributes: ['size', ':size', 'v-bind:size'],
  }), presetTypography(), presetScrollbar()],
  transformers: [transformerDirectives(), transformerVariantGroup()],
  theme: {
    colors: {
      primary: '#1ea54c',

    },
  },
  shortcuts: {
    // Inlined expansion of the preset's `scrollbar` shortcut, minus `scrollbar-width-auto`
    // and `scrollbar-color-[...]`: preset-scrollbar 4.0.0 only registers rules for those
    // two when `compatible: true`, so they trigger "unmatched utility" build warnings, and
    // enabling compatible mode would make browsers ignore the ::-webkit-scrollbar styling.
    'pretty-scrollbar': 'overflow-auto scrollbar-custom-property scrollbar-track:scrollbar-background-color-[var(--scrollbar-track)] scrollbar-thumb:scrollbar-background-color-[var(--scrollbar-thumb)] scrollbar:scrollbar-width-[var(--scrollbar-width)] scrollbar:scrollbar-height-[var(--scrollbar-height)] scrollbar-rounded scrollbar-thumb-color-gray-300 scrollbar-track-color-gray-100 dark:scrollbar-thumb-color-#424242 dark:scrollbar-track-color-#686868',
    'divider': 'h-1px bg-current op-10',
    'bg-surface': 'bg-#ffffff dark:bg-#232323',
    'bg-background': 'bg-#f1f5f9 dark:bg-#1c1c1c',
  },
});
