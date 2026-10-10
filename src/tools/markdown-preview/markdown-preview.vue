<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
import { useStorage } from '@vueuse/core';
import { renderMarkdown } from './markdown-preview.service';
import ToolExampleButton from '@/components/ToolExampleButton.vue';

// 打开即有值：内容是持久化的，所以只有首次访问（本地没存过）才落示例，
// 用户改过之后不会被示例覆盖回去。
const exampleData = [
  '# 使用说明',
  '',
  '左边写 Markdown，右边实时预览。',
  '',
  '## 支持的语法',
  '',
  '- **粗体** 与 *斜体*',
  '- 有序 / 无序列表',
  '- [链接](https://gjxtools.com)',
  '- 代码块与表格',
  '',
  '```js',
  'const hello = "世界";',
  '```',
  '',
  '> 直接改上面的内容，改动会自动保存在本机。',
].join('\n');

const inputMarkdown = useStorage('markdown-preview:input', exampleData);
const previewHtml = computed(() => renderMarkdown(inputMarkdown.value));

function loadExample() {
  inputMarkdown.value = exampleData;
}
</script>

<template>
  <div class="markdown-preview-tool">
    <div flex justify-end mb-2>
      <ToolExampleButton @click="loadExample" />
    </div>

    <c-input-text
      v-model:value="inputMarkdown"
      :placeholder="t('tools.markdown-preview.texts.placeholder-your-markdown-content')"
      rows="8"
      :label="t('tools.markdown-preview.texts.label-your-markdown-to-preview')"
      autocomplete="off"
      autocorrect="off"
      autocapitalize="off"
      spellcheck="false"
      raw-text
      autofocus
      multiline
      monospace
      test-id="markdown-input"
    />

    <n-divider />

    <n-form-item :label="t('tools.markdown-preview.texts.label-rendered-preview')">
      <c-card>
        <div class="markdown-preview" data-test-id="markdown-preview" v-html="previewHtml" />
      </c-card>
    </n-form-item>
  </div>
</template>

<style lang="less" scoped>
.markdown-preview-tool {
  flex: 0 0 100%;
}

.markdown-preview {
  overflow: auto;
  width: 100%;
  min-height: 200px;
  max-height: 600px;
  box-sizing: border-box;
  scrollbar-width: none;
  -ms-overflow-style: none;

  &::-webkit-scrollbar {
    display: none;
  }

  :deep(h1) {
    font-size: 1.5em;
  }
  :deep(h2) {
    font-size: 1.3em;
  }
  :deep(h3) {
    font-size: 1.1em;
  }
  :deep(h1),
  :deep(h2),
  :deep(h3) {
    margin: 0.5em 0;
    line-height: 1.3;
  }
  :deep(p),
  :deep(ul),
  :deep(ol) {
    margin: 0.5em 0;
    line-height: 1.6;
  }
  :deep(ul),
  :deep(ol) {
    padding-left: 1.5em;
  }
  :deep(code) {
    background: var(--n-color-modal);
    padding: 0.2em 0.4em;
    border-radius: 4px;
    font-size: 0.9em;
  }
  :deep(pre) {
    background: var(--n-color-modal);
    padding: 12px;
    border-radius: 6px;
    overflow-x: auto;
    margin: 0.5em 0;
  }
  :deep(pre code) {
    background: none;
    padding: 0;
    font-size: 0.9em;
  }
  :deep(a) {
    color: var(--n-color-primary);
    text-decoration: none;
  }
  :deep(a:hover) {
    text-decoration: underline;
  }
}
</style>
