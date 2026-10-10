<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
import { css as cssBeautify, js as jsBeautify } from 'js-beautify';
import TextareaCopyable from '@/components/TextareaCopyable.vue';
import ToolExampleButton from '@/components/ToolExampleButton.vue';
import { useStyleStore } from '@/stores/style.store';
import { withDefaultOnError } from '@/utils/defaults';

const styleStore = useStyleStore();

const languages = [
  { label: t('tools.css-js-prettify-minify.texts.label-javascript'), value: 'javascript' },
  { label: t('tools.css-js-prettify-minify.texts.label-css'), value: 'css' },
] as { label: string; value: string }[];

const selectedLanguage = ref('javascript');
const indentSize = ref('2');

// 打开即有值。两块输入场景相反：上面是「压缩过的代码 → 理顺」，
// 下面是「写好的代码 → 压成一行」，所以各给一份对口的示例。
const exampleData = {
  prettify: `function calc(a,b){if(a>b){return a-b;}else{return b-a;}}const list=[1,2,3].map(function(n){return n*2;});`,
  minify: [
    'function calc(a, b) {',
    '  if (a > b) {',
    '    return a - b;',
    '  } else {',
    '    return b - a;',
    '  }',
    '}',
    '',
    'const list = [1, 2, 3].map(function (n) {',
    '  return n * 2;',
    '});',
  ].join('\n'),
};

const prettifyInput = ref(exampleData.prettify);
const minifyInput = ref(exampleData.minify);

function loadPrettifyExample() {
  prettifyInput.value = exampleData.prettify;
}

function loadMinifyExample() {
  minifyInput.value = exampleData.minify;
}

const prettifyOutput = computed(() =>
  withDefaultOnError(() => {
    if (!prettifyInput.value) {
      return '';
    }
    const opts = { indent_size: Number.parseInt(indentSize.value, 10) || 2 };
    return selectedLanguage.value === 'css'
      ? cssBeautify(prettifyInput.value, opts)
      : jsBeautify(prettifyInput.value, opts);
  }, ''),
);

function minifyCss(input: string): string {
  return input
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/ ?([{}:;,>~+]) ?/g, '$1')
    .replaceAll(';}', '}')
    .trim();
}

function minifyJs(input: string): string {
  return input
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\s+/g, ' ')
    .replace(/ ?([{}();,=:+\-*/<>!&|?]) ?/g, '$1')
    .trim();
}

const minifyOutput = computed(() =>
  withDefaultOnError(() => {
    if (!minifyInput.value) {
      return '';
    }
    return selectedLanguage.value === 'css' ? minifyCss(minifyInput.value) : minifyJs(minifyInput.value);
  }, ''),
);
</script>

<template>
  <div style="flex: 0 0 100%">
    <div style="max-width: 600px" :class="{ 'flex-col': styleStore.isSmallScreen }" mx-auto mb-5 flex gap-2>
      <c-select
        v-model:value="selectedLanguage"
        :label="t('tools.css-js-prettify-minify.texts.label-language')"
        style="flex: 1"
        :options="languages"
      />
      <c-input-text
        v-model:value="indentSize"
        :label="t('tools.css-js-prettify-minify.texts.label-indent-size')"
        :placeholder="t('tools.css-js-prettify-minify.texts.placeholder-2')"
        style="flex: 1"
      />
    </div>
  </div>

  <c-card :title="t('tools.css-js-prettify-minify.texts.title-prettify')">
    <div flex justify-end mb-2>
      <ToolExampleButton @click="loadPrettifyExample" />
    </div>

    <n-form-item :label="t('tools.css-js-prettify-minify.texts.label-your-code')">
      <c-input-text
        v-model:value="prettifyInput"
        :placeholder="t('tools.css-js-prettify-minify.texts.placeholder-paste-your-code-to-prettify')"
        rows="10"
        multiline
        monospace
        raw-text
      />
    </n-form-item>
    <n-form-item :label="t('tools.css-js-prettify-minify.texts.label-prettified-code')">
      <TextareaCopyable :value="prettifyOutput" :language="selectedLanguage" />
    </n-form-item>
  </c-card>

  <c-card :title="t('tools.css-js-prettify-minify.texts.title-minify')" mt-5>
    <div flex justify-end mb-2>
      <ToolExampleButton @click="loadMinifyExample" />
    </div>

    <n-form-item :label="t('tools.css-js-prettify-minify.texts.label-your-code')">
      <c-input-text
        v-model:value="minifyInput"
        :placeholder="t('tools.css-js-prettify-minify.texts.placeholder-paste-your-code-to-minify')"
        rows="10"
        multiline
        monospace
        raw-text
      />
    </n-form-item>
    <n-form-item :label="t('tools.css-js-prettify-minify.texts.label-minified-code')">
      <TextareaCopyable :value="minifyOutput" :language="selectedLanguage" />
    </n-form-item>
  </c-card>
</template>
