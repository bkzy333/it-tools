<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import ToolExampleButton from '@/components/ToolExampleButton.vue';
import { computeSimilarity } from './text-similarity.service';

const { t } = useI18n();

const textA = ref('');
const textB = ref('');

const result = computed(() => computeSimilarity(textA.value, textB.value));

const coveragePercent = computed(() => `${(result.value.coverage * 100).toFixed(1)}%`);
const jaccardPercent = computed(() => `${(result.value.jaccard * 100).toFixed(1)}%`);

function clearAll() {
  textA.value = '';
  textB.value = '';
}

const exampleData = {
  a: '在线工具箱是一个完全在浏览器里运行的工具集合，所有计算都在本地完成，数据不会上传到服务器。',
  b: '在线工具箱是一个完全在浏览器里运行的工具集合，所有计算都在本地完成，非常安全。',
};

function loadExample() {
  textA.value = exampleData.a;
  textB.value = exampleData.b;
}
</script>

<template>
  <c-card :title="t('tools.text-similarity.title')" max-w-800px>
    <div flex items-center justify-between gap-2 mb-2>
      <span />
      <ToolExampleButton @click="loadExample" />
    </div>

    <n-form-item :label="t('tools.text-similarity.texts.label-text-a')" label-placement="left" mb-1>
      <n-input
        v-model:value="textA"
        type="textarea"
        :rows="6"
        :placeholder="t('tools.text-similarity.texts.placeholder-text-a')"
      />
    </n-form-item>

    <n-form-item :label="t('tools.text-similarity.texts.label-text-b')" label-placement="left" mb-1>
      <n-input
        v-model:value="textB"
        type="textarea"
        :rows="6"
        :placeholder="t('tools.text-similarity.texts.placeholder-text-b')"
      />
    </n-form-item>

    <div flex flex-wrap gap-4 mb-2>
      <n-statistic :label="t('tools.text-similarity.texts.label-coverage')" :value="coveragePercent" />
      <n-statistic :label="t('tools.text-similarity.texts.label-jaccard')" :value="jaccardPercent" />
      <n-statistic :label="t('tools.text-similarity.texts.label-matched')" :value="result.matched" />
    </div>

    <n-alert v-if="textB" type="info" :bordered="false" mb-2>
      {{ t('tools.text-similarity.texts.hint-privacy') }}
    </n-alert>

    <c-card :title="t('tools.text-similarity.texts.title-highlight')" size="small" mt-3>
      <div
        v-if="textB"
        text-14px leading-7
        style="white-space: pre-wrap; word-break: break-word"
        v-html="result.highlighted"
      />
      <p v-else op-50>
        {{ t('tools.text-similarity.texts.placeholder-highlight') }}
      </p>
      <div flex items-center gap-2 mt-3>
        <c-button @click="clearAll">{{ t('tools.text-similarity.texts.action-clear') }}</c-button>
      </div>
    </c-card>
  </c-card>
</template>

<style scoped>
:deep(mark) {
  background-color: #fde68a;
  color: inherit;
  padding: 0 1px;
  border-radius: 2px;
}
</style>
