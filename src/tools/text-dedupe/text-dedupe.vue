<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import ToolExampleButton from '@/components/ToolExampleButton.vue';
import { useCopy } from '@/composable/copy';
import {
  CUSTOM_DELIMITER_KEY,
  DELIMITER_OPTIONS,
} from '@/utils/text-delimiters';
import { runTextDedupe, toStatisticsCsv, type DedupeTab } from './text-dedupe.service';

const { t } = useI18n();
const { copy } = useCopy();

/* ------------------------------------------------------------------ 输入状态 */
const activeTab = ref<DedupeTab>('dedupe');
const input = ref('');
const inputDelimiterKey = ref('1');
const inputDelimiterCustom = ref('');
const removeFirstLastSpace = ref(true);
const removeEmptyLine = ref(true);

// 去重 Tab
const orderBy = ref<'none' | 'asc' | 'desc'>('none');
const removeRepeat = ref(true);
const showLineNumber = ref(false);

// 统计 Tab
const countOrderBy = ref<'none' | 'count-desc' | 'count-asc'>('none');

const delimiterOptions = computed(() =>
  DELIMITER_OPTIONS.map((option) => ({
    label: t(`tools.text-dedupe.texts.${option.i18nKey}`),
    value: option.key,
  })),
);

/* ------------------------------------------------------------------ 计算结果 */
const result = computed(() => {
  const base = {
    input: input.value,
    inputDelimiterKey: inputDelimiterKey.value,
    inputDelimiterCustom: inputDelimiterCustom.value,
    removeFirstLastSpace: removeFirstLastSpace.value,
    removeEmptyLine: removeEmptyLine.value,
  };

  return activeTab.value === 'dedupe'
    ? runTextDedupe({
      ...base,
      tab: 'dedupe',
      orderBy: orderBy.value,
      removeRepeat: removeRepeat.value,
      showLineNumber: showLineNumber.value,
    })
    : runTextDedupe({ ...base, tab: 'count', orderBy: countOrderBy.value });
});

const stats = computed(() => [
  { label: t('tools.text-dedupe.texts.label-total-lines'), value: result.value.stats.total },
  { label: t('tools.text-dedupe.texts.label-duplicate-lines'), value: result.value.stats.duplicate },
  { label: t('tools.text-dedupe.texts.label-empty-lines'), value: result.value.stats.empty },
]);

const canDownload = computed(() => result.value.output.length > 0);

async function copyResult() {
  await copy(result.value.output);
}

function downloadResult() {
  // 统计 Tab 导出 CSV，去重 Tab 导出纯文本 —— 对齐参考站 duplicateCount 的 CSV 行为
  const isCsv = activeTab.value === 'count';
  const text = isCsv ? toStatisticsCsv(result.value.items) : result.value.output;
  const fileName = isCsv
    ? document.documentElement.lang.startsWith('zh')
      ? '重复行统计.csv'
      : 'duplicated-lines-count.csv'
    : document.documentElement.lang.startsWith('zh')
      ? '文本去重排序.txt'
      : 'duplicate-remove.txt';

  const blob = new Blob([text], { type: isCsv ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function clearAll() {
  input.value = '';
}

/* 约定：每个工具都要有「一键示例」按钮 —— 空输入框是跳出率最高的形态。 */
const exampleData = {
  dedupe: 'apple\n banana\npear\napple\norange\npear',
  count: 'apple, banana,pear,apple,orange,pear',
};

function loadExample() {
  if (activeTab.value === 'dedupe') {
    input.value = exampleData.dedupe;
    inputDelimiterKey.value = '1';
    orderBy.value = 'none';
    removeRepeat.value = true;
    showLineNumber.value = false;
  } else {
    input.value = exampleData.count;
    inputDelimiterKey.value = '4';
    countOrderBy.value = 'count-desc';
  }
  removeFirstLastSpace.value = true;
  removeEmptyLine.value = true;
}
</script>

<template>
  <c-card :title="t('tools.text-dedupe.title')" max-w-800px>
    <div flex items-center justify-between gap-2 mb-2>
      <span />
      <ToolExampleButton @click="loadExample" />
    </div>

    <n-tabs v-model:value="activeTab" type="line" animated>
      <!-- 去重排序 -->
      <n-tab-pane name="dedupe" :tab="t('tools.text-dedupe.texts.tab-dedupe')">
        <n-form-item :label="t('tools.text-dedupe.texts.label-input')" label-placement="left" mb-1>
          <n-input
            v-model:value="input"
            type="textarea"
            :rows="8"
            :placeholder="t('tools.text-dedupe.texts.placeholder-input')"
          />
        </n-form-item>

        <c-select
          v-model:value="inputDelimiterKey"
          :options="delimiterOptions"
          :label="t('tools.text-dedupe.texts.label-input-delimiter')"
          label-width="120px"
          label-position="left"
          mb-2
        />
        <n-input
          v-if="inputDelimiterKey === CUSTOM_DELIMITER_KEY"
          v-model:value="inputDelimiterCustom"
          :placeholder="t('tools.text-dedupe.texts.placeholder-input-delimiter')"
          mb-2
        />

        <c-select
          v-model:value="orderBy"
          label-width="120px"
          label-position="left"
          mb-2
          :options="[
            { label: t('tools.text-dedupe.texts.opt-order-none'), value: 'none' },
            { label: t('tools.text-dedupe.texts.opt-order-asc'), value: 'asc' },
            { label: t('tools.text-dedupe.texts.opt-order-desc'), value: 'desc' },
          ]"
          :label="t('tools.text-dedupe.texts.label-order-by')"
        />

        <n-checkbox v-model:checked="removeRepeat">
          {{ t('tools.text-dedupe.texts.opt-remove-repeat') }}
        </n-checkbox>
        <n-checkbox v-model:checked="removeFirstLastSpace">
          {{ t('tools.text-dedupe.texts.opt-remove-first-last-space') }}
        </n-checkbox>
        <n-checkbox v-model:checked="removeEmptyLine">
          {{ t('tools.text-dedupe.texts.opt-remove-empty-line') }}
        </n-checkbox>
        <n-checkbox v-model:checked="showLineNumber">
          {{ t('tools.text-dedupe.texts.opt-show-line-number') }}
        </n-checkbox>

        <c-card :title="t('tools.text-dedupe.texts.title-result')" size="small" mt-2>
          <n-input :value="result.output" type="textarea" :rows="10" readonly />
          <div flex flex-wrap items-center gap-4 mt-2 mb-2>
            <span v-for="item in stats" :key="item.label">
              {{ item.label }}：{{ item.value }}
            </span>
          </div>
          <div flex items-center gap-2>
            <c-button type="primary" @click="copyResult">
              {{ t('tools.text-dedupe.texts.action-copy') }}
            </c-button>
            <c-button :disabled="!canDownload" @click="downloadResult">
              {{ t('tools.text-dedupe.texts.action-download') }}
            </c-button>
            <c-button @click="clearAll">{{ t('tools.text-dedupe.texts.action-clear') }}</c-button>
          </div>
        </c-card>
      </n-tab-pane>

      <!-- 行重复统计 -->
      <n-tab-pane name="count" :tab="t('tools.text-dedupe.texts.tab-count')">
        <n-form-item :label="t('tools.text-dedupe.texts.label-input')" label-placement="left" mb-1>
          <n-input
            v-model:value="input"
            type="textarea"
            :rows="8"
            :placeholder="t('tools.text-dedupe.texts.placeholder-input')"
          />
        </n-form-item>

        <c-select
          v-model:value="inputDelimiterKey"
          :options="delimiterOptions"
          :label="t('tools.text-dedupe.texts.label-input-delimiter')"
          label-width="120px"
          label-position="left"
          mb-2
        />
        <n-input
          v-if="inputDelimiterKey === CUSTOM_DELIMITER_KEY"
          v-model:value="inputDelimiterCustom"
          :placeholder="t('tools.text-dedupe.texts.placeholder-input-delimiter')"
          mb-2
        />

        <c-select
          v-model:value="countOrderBy"
          label-width="120px"
          label-position="left"
          mb-2
          :options="[
            { label: t('tools.text-dedupe.texts.opt-count-order-none'), value: 'none' },
            { label: t('tools.text-dedupe.texts.opt-count-order-desc'), value: 'count-desc' },
            { label: t('tools.text-dedupe.texts.opt-count-order-asc'), value: 'count-asc' },
          ]"
          :label="t('tools.text-dedupe.texts.label-count-order-by')"
        />

        <n-checkbox v-model:checked="removeFirstLastSpace">
          {{ t('tools.text-dedupe.texts.opt-remove-first-last-space') }}
        </n-checkbox>
        <n-checkbox v-model:checked="removeEmptyLine">
          {{ t('tools.text-dedupe.texts.opt-remove-empty-line') }}
        </n-checkbox>

        <c-card :title="t('tools.text-dedupe.texts.title-result')" size="small" mt-2>
          <n-input :value="result.output" type="textarea" :rows="10" readonly />
          <div flex flex-wrap items-center gap-4 mt-2 mb-2>
            <span v-for="item in stats" :key="item.label">
              {{ item.label }}：{{ item.value }}
            </span>
          </div>
          <div flex items-center gap-2>
            <c-button type="primary" @click="copyResult">
              {{ t('tools.text-dedupe.texts.action-copy') }}
            </c-button>
            <c-button :disabled="!canDownload" @click="downloadResult">
              {{ t('tools.text-dedupe.texts.action-download-csv') }}
            </c-button>
            <c-button @click="clearAll">{{ t('tools.text-dedupe.texts.action-clear') }}</c-button>
          </div>
        </c-card>
      </n-tab-pane>
    </n-tabs>
  </c-card>
</template>
