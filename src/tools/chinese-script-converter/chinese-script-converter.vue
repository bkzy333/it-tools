<script setup lang="ts">
/**
 * 汉字简体 / 繁体转换。
 *
 * 转换引擎用的是 OpenCC（opencc-js 的预生成词表，MIT AND Apache-2.0，见同目录
 * LICENSE-opencc-js.txt），不做自研的字表 —— 简繁转换看着像"一对一换字"，
 * 实际上要处理一词多形（头发 / 發财）、地区用词差异，自研必然出错。
 *
 * 两个词表分文件引入是有意的：简→繁 的词表（cn2t）1.1MB，繁→简（t2cn）只有 109KB。
 * 但两者都在本工具的懒加载 chunk 里，用户不打开这个页面就不会下载。
 *
 * 刻意不做的事：不给「台湾用词（twp）」选项。twp 会把「自行车」换成「腳踏車」这类
 * 地区用语，属于本地化而不是字形转换，混进来会让用户以为转换"改了我的词"。
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import * as CN2T from './opencc-cn2t.wrapped';
import * as T2CN from './opencc-t2cn.wrapped';

const { t } = useI18n();

const toTraditional = CN2T.Converter({ from: 'cn', to: 'tw' });
const toSimplified = T2CN.Converter({ from: 'tw', to: 'cn' });

type Direction = 'to-traditional' | 'to-simplified';

const direction = ref<Direction>('to-traditional');
const inputText = ref('');

const directionOptions = computed(() => [
  { label: t('tools.chinese-script-converter.texts.direction-to-traditional'), value: 'to-traditional' as const },
  { label: t('tools.chinese-script-converter.texts.direction-to-simplified'), value: 'to-simplified' as const },
]);

const outputText = computed(() => {
  if (!inputText.value) {
    return '';
  }
  return direction.value === 'to-traditional' ? toTraditional(inputText.value) : toSimplified(inputText.value);
});

/** 按字符数算，包含标点和空白，和「字数」在不同场景下的口径一致 */
const inputLength = computed(() => [...inputText.value].length);
const outputLength = computed(() => [...outputText.value].length);

function switchDirection(next: Direction) {
  if (direction.value === next) {
    return;
  }
  // 直接把输出倒填回输入：用户通常是"转过去看看，不行再转回来"，
  // 来回切还要重新粘贴一次很烦
  inputText.value = outputText.value;
  direction.value = next;
}

// ------------------------------------------------------------------ 示例

const exampleData = {
  'to-traditional': '汉字转换工具：软件开发、头发、发财、面条、皇后、后来',
  'to-simplified': '漢字轉換工具：軟體開發、頭髮、發財、麵條、皇后、後來',
};

function loadExample() {
  inputText.value = exampleData[direction.value];
}
</script>

<template>
  <div flex flex-col gap-3>
    <div flex justify-end>
      <ToolExampleButton @click="loadExample" />
    </div>

    <c-card :title="t('tools.chinese-script-converter.texts.title-input')">
      <div flex items-center gap-2 mb-3 flex-wrap>
        <span text-sm op-70>{{ t('tools.chinese-script-converter.texts.label-direction') }}</span>
        <c-button
          size="small"
          :type="direction === 'to-traditional' ? 'primary' : 'default'"
          @click="switchDirection('to-traditional')"
        >
          {{ t('tools.chinese-script-converter.texts.direction-to-traditional') }}
        </c-button>
        <c-button
          size="small"
          :type="direction === 'to-simplified' ? 'primary' : 'default'"
          @click="switchDirection('to-simplified')"
        >
          {{ t('tools.chinese-script-converter.texts.direction-to-simplified') }}
        </c-button>
      </div>

      <c-input-text
        v-model:value="inputText"
        :placeholder="
          direction === 'to-traditional'
            ? t('tools.chinese-script-converter.texts.placeholder-to-traditional')
            : t('tools.chinese-script-converter.texts.placeholder-to-simplified')
        "
        multiline
        rows="6"
        clearable
        mb-2
      />
    </c-card>

    <c-card :title="t('tools.chinese-script-converter.texts.title-result')">
      <textarea-copyable
        v-if="outputText"
        :value="outputText"
        :copy-message="t('tools.chinese-script-converter.texts.copied')"
        word-wrap
      />
      <div v-else op-60>{{ t('tools.chinese-script-converter.texts.hint-empty') }}</div>
    </c-card>

    <c-card :title="t('tools.chinese-script-converter.texts.title-stat')">
      <div flex gap-6>
        <div>
          <span op-60 text-sm>{{ t('tools.chinese-script-converter.texts.label-input-length') }}</span>
          <div font-bold>{{ inputLength }}</div>
        </div>
        <div>
          <span op-60 text-sm>{{ t('tools.chinese-script-converter.texts.label-output-length') }}</span>
          <div font-bold>{{ outputLength }}</div>
        </div>
      </div>
      <div mt-3 text-sm op-60>{{ t('tools.chinese-script-converter.texts.hint-length') }}</div>
    </c-card>

    <c-alert :title="t('tools.chinese-script-converter.texts.title-notice')">
      {{ t('tools.chinese-script-converter.texts.hint-notice') }}
    </c-alert>
  </div>
</template>
