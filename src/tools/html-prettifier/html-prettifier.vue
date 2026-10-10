<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import beautify from 'js-beautify';
import TextareaCopyable from '@/components/TextareaCopyable.vue';
import ToolExampleButton from '@/components/ToolExampleButton.vue';

const { t } = useI18n();

// 打开即有值：空文本域是跳出率最高的形态。给一段压成一行的真实 HTML，
// 用户不用读说明就知道这个工具是「把挤在一起的代码理成缩进结构」。
const exampleData = `<div class="card"><h2>订单详情</h2><ul><li>商品：机械键盘</li><li>金额：¥499.00</li></ul><p>状态：<span class="ok">已发货</span></p></div>`;

const inputHtml = ref(exampleData);

function loadExample() {
  inputHtml.value = exampleData;
}
const outputHtml = computed(() => {
  return beautify.html(inputHtml.value, {
    unformatted: ['code', 'pre', 'em', 'strong', 'span'],
    indent_inner_html: true,
    indent_char: ' ',
    indent_size: 2,
    eol: '\n',
  });
});
</script>

<template>
  <div>
    <div flex justify-end mb-2>
      <ToolExampleButton @click="loadExample" />
    </div>

    <c-input-text
      v-model:value="inputHtml"
      multiline
      raw-text
      :placeholder="t('tools.html-prettifier.texts.placeholder-your-html-content')"
      rows="8"
      autofocus
      :label="t('tools.html-prettifier.texts.label-your-html-to-format-can-paste-from-clipboard')"
      paste-html
    />

    <n-divider />

    <n-form-item :label="t('tools.html-prettifier.texts.label-output-prettified-html')">
      <TextareaCopyable
        :value="outputHtml"
        multiline
        language="html"
        download-file-name="output.htm"
        :word-wrap="true"
      />
    </n-form-item>
  </div>
</template>
