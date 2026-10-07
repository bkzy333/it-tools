<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import ToolExampleButton from '@/components/ToolExampleButton.vue';
import { useCopy } from '@/composable/copy';
import {
  CUSTOM_DELIMITER_KEY,
  DELIMITER_OPTIONS,
} from '@/utils/text-delimiters';
import { splitText, type SplitOrder } from './text-split.service';

const { t } = useI18n();
const { copy } = useCopy();

/* ------------------------------------------------------------------ 输入状态 */
const input = ref('');
const inputDelimiterKey = ref('1');
const inputDelimiterCustom = ref('');
const outputDelimiterKey = ref('1');
const outputDelimiterCustom = ref('');
const orderBy = ref<SplitOrder>('none');
const removeFirstLastSpace = ref(true);
const showLineNumber = ref(false);

const delimiterOptions = computed(() =>
  DELIMITER_OPTIONS.map((option) => ({
    label: t(`tools.text-split.texts.${option.i18nKey}`),
    value: option.key,
  })),
);

const orderOptions = computed(() => [
  { label: t('tools.text-split.texts.opt-order-none'), value: 'none' as SplitOrder },
  { label: t('tools.text-split.texts.opt-order-asc'), value: 'asc' as SplitOrder },
  { label: t('tools.text-split.texts.opt-order-desc'), value: 'desc' as SplitOrder },
]);

/* ------------------------------------------------------------------ 计算结果 */
const result = computed(() =>
  splitText({
    input: input.value,
    inputDelimiterKey: inputDelimiterKey.value,
    inputDelimiterCustom: inputDelimiterCustom.value,
    outputDelimiterKey: outputDelimiterKey.value,
    outputDelimiterCustom: outputDelimiterCustom.value,
    orderBy: orderBy.value,
    removeFirstLastSpace: removeFirstLastSpace.value,
    showLineNumber: showLineNumber.value,
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
  anchor.download = document.documentElement.lang.startsWith('zh') ? '文本分割.txt' : 'text-split.txt';
  anchor.click();
  URL.revokeObjectURL(url);
}

function clearAll() {
  input.value = '';
}

const exampleData = {
  input: 'apple--- banana---pear---apple---orange---pear',
  delimiter: '---',
};

function loadExample() {
  input.value = exampleData.input;
  inputDelimiterKey.value = CUSTOM_DELIMITER_KEY;
  inputDelimiterCustom.value = exampleData.delimiter;
  outputDelimiterKey.value = '1';
  orderBy.value = 'none';
  removeFirstLastSpace.value = true;
  showLineNumber.value = false;
}
</script>

<template>
  <c-card :title="t('tools.text-split.title')" max-w-800px>
    <div flex items-center justify-between gap-2 mb-2>
      <span />
      <ToolExampleButton @click="loadExample" />
    </div>

    <n-form-item :label="t('tools.text-split.texts.label-input')" label-placement="left" mb-1>
      <n-input
        v-model:value="input"
        type="textarea"
        :rows="8"
        :placeholder="t('tools.text-split.texts.placeholder-input')"
      />
    </n-form-item>

    <!-- 输入分隔符 -->
    <c-select
      v-model:value="inputDelimiterKey"
      :options="delimiterOptions"
      :label="t('tools.text-split.texts.label-input-delimiter')"
      label-width="120px"
      label-position="left"
      mb-2
    />
    <n-input
      v-if="inputDelimiterKey === CUSTOM_DELIMITER_KEY"
      v-model:value="inputDelimiterCustom"
      :placeholder="t('tools.text-split.texts.placeholder-input-delimiter')"
      mb-2
    />

    <!-- 结果分隔符 -->
    <c-select
      v-model:value="outputDelimiterKey"
      :options="delimiterOptions"
      :label="t('tools.text-split.texts.label-output-delimiter')"
      label-width="120px"
      label-position="left"
      mb-2
    />
    <n-input
      v-if="outputDelimiterKey === CUSTOM_DELIMITER_KEY"
      v-model:value="outputDelimiterCustom"
      :placeholder="t('tools.text-split.texts.placeholder-output-delimiter')"
      mb-2
    />

    <!-- 排序 / 清理 -->
    <c-select
      v-model:value="orderBy"
      :options="orderOptions"
      :label="t('tools.text-split.texts.label-order-by')"
      label-width="120px"
      label-position="left"
      mb-2
    />
    <n-checkbox v-model:checked="removeFirstLastSpace">
      {{ t('tools.text-split.texts.opt-remove-first-last-space') }}
    </n-checkbox>
    <n-checkbox v-model:checked="showLineNumber">
      {{ t('tools.text-split.texts.opt-show-line-number') }}
    </n-checkbox>

    <!-- 输出 -->
    <c-card :title="t('tools.text-split.texts.title-result')" size="small" mt-2>
      <n-input :value="result.output" type="textarea" :rows="10" readonly />
      <div flex flex-wrap items-center gap-4 mt-2 mb-2>
        <span>{{ t('tools.text-split.texts.label-part-count') }}：{{ result.parts }}</span>
        <span v-if="result.unchanged">
          {{ t('tools.text-split.texts.hint-unchanged') }}
        </span>
      </div>
      <div flex items-center gap-2>
        <c-button type="primary" @click="copyResult">
          {{ t('tools.text-split.texts.action-copy') }}
        </c-button>
        <c-button :disabled="!canDownload" @click="downloadResult">
          {{ t('tools.text-split.texts.action-download') }}
        </c-button>
        <c-button @click="clearAll">{{ t('tools.text-split.texts.action-clear') }}</c-button>
      </div>
    </c-card>
  </c-card>
</template>
