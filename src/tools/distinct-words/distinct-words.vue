<script lang="ts" setup>
import { useI18n } from 'vue-i18n';

import { computed, ref } from 'vue';
import { countBy, orderBy } from 'es-toolkit/compat';

const { t } = useI18n();

const inputText = ref('');

// 原版只按空格切词，对中文（词之间没有空格）完全无效：整段话会被当成一个「词」。
// 这里加了分词方式，默认自动识别；中文走浏览器自带的 Intl.Segmenter 做中文分词。
const segmentMode = ref<'auto' | 'space' | 'char' | 'word'>('auto');

const modeOptions = [
  { label: '自动（中文自动分词）', value: 'auto' },
  { label: '按空格（适合英文）', value: 'space' },
  { label: '按单字（一个字算一个词）', value: 'char' },
  { label: '中文分词（浏览器智能分词）', value: 'word' },
];

const canSegment = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function';
const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/;

function splitWords(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return [];
  }

  let mode = segmentMode.value;
  if (mode === 'auto') {
    mode = CJK_RE.test(trimmed) ? (canSegment ? 'word' : 'char') : 'space';
  }

  if (mode === 'space') {
    return trimmed.split(/\s+/).filter(Boolean);
  }

  const noSpace = trimmed.replace(/\s+/g, '');
  if (mode === 'char') {
    return Array.from(noSpace);
  }

  // 浏览器原生分词器，中文按词切分
  const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
  return [...segmenter.segment(noSpace)]
    .filter((item) => item.isWordLike)
    .map((item) => item.segment)
    .filter(Boolean);
}

const sortedWordCounts = computed(() => {
  // 先去掉标点，再按选中的方式分词，最后统计出现次数
  const cleanedText = inputText.value.replace(/\p{P}+\s|\s\p{P}+|\p{P}+$|^\p{P}+|\s+/gu, ' ').trim();
  const wordCountObj = countBy(splitWords(cleanedText));

  return orderBy(Object.entries(wordCountObj), ([, count]) => count, 'desc');
});
</script>

<template>
  <div>
    <c-input-text
      v-model:value="inputText"
      multiline
      rows="10"
      :label="t('tools.distinct-words.texts.label-text')"
      :placeholder="t('tools.distinct-words.texts.placeholder-enter-text')"
      mb-1
    />

    <div mb-3 flex items-center gap-2>
      <span text-14px op-70>分词方式</span>
      <n-select v-model:value="segmentMode" :options="modeOptions" style="max-width: 260px" />
    </div>

    <c-card :title="t('tools.distinct-words.texts.title-distinct-words')">
      <n-table>
        <thead>
          <tr>
            <th>{{ t('tools.distinct-words.texts.tag-word') }}</th>
            <th>{{ t('tools.distinct-words.texts.tag-count') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="[word, count] in sortedWordCounts" :key="word">
            <td>{{ word }}</td>
            <td>{{ count }}</td>
          </tr>
        </tbody>
      </n-table>
    </c-card>
  </div>
</template>
