<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import ToolExampleButton from '@/components/ToolExampleButton.vue';
import { useCopy } from '@/composable/copy';
import { joinText } from './text-join.service';

const { t } = useI18n();
const { copy } = useCopy();

/* ------------------------------------------------------------------ 输入状态 */
const input = ref('');
// 默认连接字符是「空串」——和参考站 config_text_join.splitChar 的默认值一致
const outputDelimiterKey = ref('');
const outputDelimiterCustom = ref('');
const removeFirstLastSpace = ref(true);
const removeAllSpace = ref(false);

/* ------------------------------------------------------------------ 计算结果 */
const result = computed(() =>
  joinText({
    input: input.value,
    outputDelimiterKey: outputDelimiterKey.value,
    outputDelimiterCustom: outputDelimiterCustom.value,
    removeFirstLastSpace: removeFirstLastSpace.value,
    removeAllSpace: removeAllSpace.value,
  }),
);

const canDownload = computed(() => result.value.output.length > 0);

async function copyResult() {
  await copy(result.value.output);
}

function downloadResult() {
  const blob = new Blob([result.value.output], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = document.documentElement.lang.startsWith('zh') ? '文本拼接.txt' : 'text-join.txt';
  anchor.click();
  URL.revokeObjectURL(url);
}

function clearAll() {
  input.value = '';
}

/* 约定：每个工具都要有「一键示例」按钮 —— 空输入框是跳出率最高的形态。 */
const exampleData = {
  input: 'apple\nbanana\npear\napple\norange\npear',
  delimiter: '4',
};

function loadExample() {
  input.value = exampleData.input;
  outputDelimiterKey.value = exampleData.delimiter;
  removeFirstLastSpace.value = true;
  removeAllSpace.value = false;
}
</script>

<template>
  <c-card :title="t('tools.text-join.title')" max-w-800px>
    <div flex items-center justify-between gap-2 mb-2>
      <span />
      <ToolExampleButton @click="loadExample" />
    </div>

    <n-form-item :label="t('tools.text-join.texts.label-input')" label-placement="left" mb-1>
      <n-input
        v-model:value="input"
        type="textarea"
        :rows="8"
        :placeholder="t('tools.text-join.texts.placeholder-input')"
      />
    </n-form-item>

    <c-select
      v-model:value="outputDelimiterKey"
      label-width="120px"
      label-position="left"
      mb-2
      :options="[
        { label: t('tools.text-join.texts.opt-connection-empty'), value: '' },
        { label: t('tools.text-join.texts.opt-connection-comma'), value: '4' },
        { label: t('tools.text-join.texts.opt-connection-semicolon'), value: '7' },
        { label: t('tools.text-join.texts.opt-connection-tab'), value: '2' },
        { label: t('tools.text-join.texts.opt-connection-newline'), value: '1' },
        { label: t('tools.text-join.texts.opt-connection-custom'), value: '0' },
      ]"
      :label="t('tools.text-join.texts.label-connection')"
    />
    <n-input
      v-if="outputDelimiterKey === '0'"
      v-model:value="outputDelimiterCustom"
      :placeholder="t('tools.text-join.texts.placeholder-connection')"
      mb-2
    />

    <n-checkbox v-model:checked="removeFirstLastSpace">
      {{ t('tools.text-join.texts.opt-remove-first-last-space') }}
    </n-checkbox>
    <n-checkbox v-model:checked="removeAllSpace">
      {{ t('tools.text-join.texts.opt-remove-all-space') }}
    </n-checkbox>

    <!-- 输出 -->
    <c-card :title="t('tools.text-join.texts.title-result')" size="small" mt-2>
      <n-input :value="result.output" type="textarea" :rows="10" readonly />
      <div flex items-center gap-4 mt-2 mb-2>
        <span>{{ t('tools.text-join.texts.label-line-count') }}：{{ result.lines }}</span>
      </div>
      <div flex items-center gap-2>
        <c-button type="primary" @click="copyResult">
          {{ t('tools.text-join.texts.action-copy') }}
        </c-button>
        <c-button :disabled="!canDownload" @click="downloadResult">
          {{ t('tools.text-join.texts.action-download') }}
        </c-button>
        <c-button @click="clearAll">{{ t('tools.text-join.texts.action-clear') }}</c-button>
      </div>
    </c-card>
  </c-card>
</template>
