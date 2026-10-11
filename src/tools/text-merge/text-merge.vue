<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import ToolExampleButton from '@/components/ToolExampleButton.vue';
import CopyExportBar from '@/components/CopyExportBar.vue';
import { useCopy } from '@/composable/copy';
import { mergeText, type MergeMode } from './text-merge.service';

const { t } = useI18n();
const { copy } = useCopy();

/* ------------------------------------------------------------------ 输入状态 */
const input = ref('');
const mode = ref<MergeMode>('cols');
const outputDelimiterKey = ref(',');
const outputDelimiterCustom = ref('');
const inputDelimiterKey = ref('\t');
const inputDelimiterCustom = ref('');
const skipEmpty = ref(true);

const outputDelimiter = computed(() =>
  outputDelimiterKey.value === 'custom' ? outputDelimiterCustom.value : outputDelimiterKey.value,
);
const inputDelimiter = computed(() =>
  inputDelimiterKey.value === 'custom' ? inputDelimiterCustom.value : inputDelimiterKey.value,
);

/* ------------------------------------------------------------------ 计算结果 */
const result = computed(() =>
  mergeText({
    input: input.value,
    mode: mode.value,
    outputDelimiter: outputDelimiter.value,
    inputDelimiter: inputDelimiter.value,
    skipEmpty: skipEmpty.value,
  }),
);

const canDownload = computed(() => result.value.output.length > 0);

function clearAll() {
  input.value = '';
}

function copyTsv() {
  copy(result.value.tsv, { notificationMessage: t('tools.text-merge.texts.message-copied-tsv') });
}

/* ------------------------------------------------------------------ 示例 */
const exampleData = {
  input: '苹果\t红\t5\n香蕉\t黄\t3\n葡萄\t紫\t12',
  mode: 'cols' as MergeMode,
  out: ',',
};

function loadExample() {
  input.value = exampleData.input;
  mode.value = exampleData.mode;
  outputDelimiterKey.value = exampleData.out;
  inputDelimiterKey.value = '\t';
  skipEmpty.value = true;
}

/* 分隔符下拉选项（值即实际字符） */
const outputDelimiterOptions = computed(() => [
  { label: t('tools.text-merge.texts.opt-delimiter-comma'), value: ',' },
  { label: t('tools.text-merge.texts.opt-delimiter-semicolon'), value: ';' },
  { label: t('tools.text-merge.texts.opt-delimiter-tab'), value: '\t' },
  { label: t('tools.text-merge.texts.opt-delimiter-newline'), value: '\n' },
  { label: t('tools.text-merge.texts.opt-delimiter-custom'), value: 'custom' },
]);
const inputDelimiterOptions = computed(() => [
  { label: t('tools.text-merge.texts.opt-delimiter-tab'), value: '\t' },
  { label: t('tools.text-merge.texts.opt-delimiter-comma'), value: ',' },
  { label: t('tools.text-merge.texts.opt-delimiter-space'), value: ' ' },
  { label: t('tools.text-merge.texts.opt-delimiter-custom'), value: 'custom' },
]);
</script>

<template>
  <c-card :title="t('tools.text-merge.title')" max-w-800px>
    <div flex items-center justify-between gap-2 mb-2>
      <span />
      <ToolExampleButton @click="loadExample" />
    </div>

    <n-form-item :label="t('tools.text-merge.texts.label-input')" label-placement="left" mb-1>
      <n-input
        v-model:value="input"
        type="textarea"
        :rows="8"
        :placeholder="t('tools.text-merge.texts.placeholder-input')"
      />
    </n-form-item>

    <!-- 合并模式 -->
    <n-form-item :label="t('tools.text-merge.texts.label-mode')" label-placement="left" mb-1>
      <n-radio-group v-model:value="mode">
        <n-radio value="rows">{{ t('tools.text-merge.texts.opt-mode-rows') }}</n-radio>
        <n-radio value="cols">{{ t('tools.text-merge.texts.opt-mode-cols') }}</n-radio>
      </n-radio-group>
    </n-form-item>

    <!-- 输入列分隔符（仅多列模式） -->
    <c-select
      v-if="mode === 'cols'"
      v-model:value="inputDelimiterKey"
      label-width="120px"
      label-position="left"
      mb-2
      :options="inputDelimiterOptions"
      :label="t('tools.text-merge.texts.label-input-delimiter')"
    />
    <n-input
      v-if="mode === 'cols' && inputDelimiterKey === 'custom'"
      v-model:value="inputDelimiterCustom"
      :placeholder="t('tools.text-merge.texts.placeholder-custom-delimiter')"
      mb-2
    />

    <!-- 输出分隔符 -->
    <c-select
      v-model:value="outputDelimiterKey"
      label-width="120px"
      label-position="left"
      mb-2
      :options="outputDelimiterOptions"
      :label="t('tools.text-merge.texts.label-output-delimiter')"
    />
    <n-input
      v-if="outputDelimiterKey === 'custom'"
      v-model:value="outputDelimiterCustom"
      :placeholder="t('tools.text-merge.texts.placeholder-custom-delimiter')"
      mb-2
    />

    <n-checkbox v-model:checked="skipEmpty">
      {{ t('tools.text-merge.texts.opt-skip-empty') }}
    </n-checkbox>

    <!-- 输出 -->
    <c-card :title="t('tools.text-merge.texts.title-result')" size="small" mt-2>
      <n-input :value="result.output" type="textarea" :rows="8" readonly />
      <div flex items-center gap-4 mt-2 mb-2>
        <span>{{ t('tools.text-merge.texts.label-cell-count') }}：{{ result.cellCount }}</span>
      </div>
      <div flex items-center justify-between gap-2>
        <CopyExportBar :text="result.output" filename="文本合并" :rows="result.rows" :disabled="!canDownload" />
        <c-button size="small" :disabled="!canDownload" @click="copyTsv">
          {{ t('tools.text-merge.texts.action-copy-tsv') }}
        </c-button>
        <c-button size="small" @click="clearAll">{{ t('tools.text-merge.texts.action-clear') }}</c-button>
      </div>
    </c-card>
  </c-card>
</template>
