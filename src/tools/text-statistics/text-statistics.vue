<script setup lang="ts">
import { useI18n } from 'vue-i18n';
// 时长格式化原本由 eta-calculator 工具提供，该工具已下线，实现内联到本目录。
import { formatMsDuration } from './duration-format.service';
import { getStringSizeInBytes, textStatistics } from './text-statistics.service';
import { formatBytes } from '@/utils/convert';

const { t } = useI18n();

const text = ref('');
const stats = computed(() => textStatistics(text.value));

/**
 * 示例用一段真实的中英混排内容：
 * 中文没有空格，字符数、字数、字节数三者的差距才是这个工具真正要展示的信息，
 * 用 "hello world" 这种纯英文例子根本看不出 UTF-8 下一个汉字占 3 个字节这件事。
 */
const exampleData = {
  text: '在线工具箱是一个完全在浏览器里运行的工具集合，所有计算都在本地完成，数据不会上传到服务器。\nIt works offline, and it is free.\n\n第一段用来看中文的字数统计，第二段用来看英文的单词计数。',
};

function loadExample() {
  text.value = exampleData.text;
}
</script>

<template>
  <div flex justify-end mb-2>
    <ToolExampleButton @click="loadExample" />
  </div>

  <c-card>
    <c-input-text
      v-model:value="text"
      multiline
      :placeholder="t('tools.text-statistics.texts.placeholder-your-text')"
      rows="5"
    />

    <n-space mt-3>
      <n-statistic :label="t('tools.text-statistics.texts.label-character-count')" :value="stats.chars" />
      <n-statistic :label="t('tools.text-statistics.texts.label-word-count')" :value="stats.words" />
      <n-statistic :label="t('tools.text-statistics.texts.label-sentences-count')" :value="stats.sentences" />
      <n-statistic :label="t('tools.text-statistics.texts.label-line-count')" :value="stats.lines" />
      <n-statistic
        :label="t('tools.text-statistics.texts.label-byte-size')"
        :value="formatBytes(getStringSizeInBytes(text))"
      />
    </n-space>

    <n-divider />

    <n-space mt-3>
      <n-statistic :label="t('tools.text-statistics.texts.label-unique-word-count')" :value="stats.words_uniques" />
      <n-statistic
        :label="t('tools.text-statistics.texts.label-unique-word-count-case-insensitive')"
        :value="stats.words_uniques_ci"
      />
      <n-statistic
        :label="t('tools.text-statistics.texts.label-read-time')"
        :value="formatMsDuration(stats.read_time * 1000)"
      />
    </n-space>

    <n-divider />

    <n-space>
      <n-statistic :label="t('tools.text-statistics.texts.label-chars-no-spaces')" :value="stats.chars_no_spaces" />
      <n-statistic :label="t('tools.text-statistics.texts.label-uppercase-chars')" :value="stats.chars_upper" />
      <n-statistic :label="t('tools.text-statistics.texts.label-lowercase-chars')" :value="stats.chars_lower" />
      <n-statistic :label="t('tools.text-statistics.texts.label-digit-chars')" :value="stats.chars_digits" />
      <n-statistic :label="t('tools.text-statistics.texts.label-punctuations')" :value="stats.chars_puncts" />
      <n-statistic :label="t('tools.text-statistics.texts.label-spaces-chars')" :value="stats.chars_spaces" />
      <n-statistic :label="t('tools.text-statistics.texts.label-word-count-no-punct')" :value="stats.words_no_puncs" />
    </n-space>
  </c-card>
</template>
