<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import ToolExampleButton from '@/components/ToolExampleButton.vue';
import { useCopy } from '@/composable/copy';
import {
  applyTextFormat,
  DEFAULT_TEXT_FORMAT_OPTIONS,
  type IndentMode,
  type PrefixSuffixMode,
  type ReplacerMode,
  type ReverseMode,
  type TruncateMode,
  type InsertMode,
  type TextFormatOptions,
} from './text-format.service';

const { t } = useI18n();
const { copy } = useCopy();

/* ------------------------------------------------------------------ 输入状态 */
const input = ref('');
const options = reactive<TextFormatOptions>({ ...DEFAULT_TEXT_FORMAT_OPTIONS });

// 参考站把选项存进 localStorage（ys.saveConfig/loadConfig）；
// 本站多数工具不做持久化，这里保持同一口径：刷新即回默认，别顺手加。
// c-select 的 options 只收 string | CSelectOption，直接给 number[] 会报类型错，
// 所以显式写成 { label, value } 形式（value 保留数字，v-model 拿到的还是 number）
const presetSpaces = [1, 2, 4, 8].map((n) => ({ label: `${n}`, value: n }));

const prefixSuffixOptions = computed(() => [
  { label: t('tools.text-format.texts.opt-prefix-suffix-mode-none'), value: 'none' as PrefixSuffixMode },
  { label: t('tools.text-format.texts.opt-prefix-suffix-mode-add'), value: 'add' as PrefixSuffixMode },
  { label: t('tools.text-format.texts.opt-prefix-suffix-mode-remove'), value: 'remove' as PrefixSuffixMode },
]);

const indentModeOptions = computed(() => [
  { label: t('tools.text-format.texts.opt-indent-mode-none'), value: 'none' as IndentMode },
  { label: t('tools.text-format.texts.opt-indent-mode-add'), value: 'add' as IndentMode },
  { label: t('tools.text-format.texts.opt-indent-mode-remove'), value: 'remove' as IndentMode },
]);

const indentMethodOptions = computed(() => [
  { label: t('tools.text-format.texts.opt-indent-method-space'), value: 'space' as const },
  { label: t('tools.text-format.texts.opt-indent-method-tab'), value: 'tab' as const },
]);

const replacerModeOptions = computed(() => [
  { label: t('tools.text-format.texts.opt-replacer-mode-custom'), value: 'custom' as ReplacerMode },
  { label: t('tools.text-format.texts.opt-replacer-mode-newline'), value: 'newline' as ReplacerMode },
]);

const orderOptions = computed(() => [
  { label: t('tools.text-format.texts.opt-order-none'), value: 'none' as const },
  { label: t('tools.text-format.texts.opt-order-asc'), value: 'asc' as const },
  { label: t('tools.text-format.texts.opt-order-desc'), value: 'desc' as const },
]);

/* ------------------------------------------------------------------ A9 高级变换选项 */
const reverseOptions = computed(() => [
  { label: t('tools.text-format.texts.opt-reverse-none'), value: 'none' as ReverseMode },
  { label: t('tools.text-format.texts.opt-reverse-chars'), value: 'chars' as ReverseMode },
  { label: t('tools.text-format.texts.opt-reverse-lines'), value: 'lines' as ReverseMode },
  { label: t('tools.text-format.texts.opt-reverse-words'), value: 'words' as ReverseMode },
]);

const scriptOptions = computed(() => [
  { label: t('tools.text-format.texts.opt-script-none'), value: 'none' as const },
  { label: t('tools.text-format.texts.opt-script-sub'), value: 'sub' as const },
  { label: t('tools.text-format.texts.opt-script-super'), value: 'super' as const },
]);

const truncateOptions = computed(() => [
  { label: t('tools.text-format.texts.opt-truncate-none'), value: 'none' as TruncateMode },
  { label: t('tools.text-format.texts.opt-truncate-head'), value: 'head' as TruncateMode },
  { label: t('tools.text-format.texts.opt-truncate-tail'), value: 'tail' as TruncateMode },
  { label: t('tools.text-format.texts.opt-truncate-range'), value: 'range' as TruncateMode },
]);

const insertOptions = computed(() => [
  { label: t('tools.text-format.texts.opt-insert-none'), value: 'none' as InsertMode },
  { label: t('tools.text-format.texts.opt-insert-atpos'), value: 'atPos' as InsertMode },
  { label: t('tools.text-format.texts.opt-insert-everyn'), value: 'everyN' as InsertMode },
]);

/* ------------------------------------------------------------------ 计算结果 */
const result = computed(() => applyTextFormat(input.value, options));

const stats = computed(() => [
  { label: t('tools.text-format.texts.label-total-lines'), value: result.value.totalLines },
  { label: t('tools.text-format.texts.label-empty-lines'), value: result.value.emptyLinesRemoved },
  { label: t('tools.text-format.texts.label-duplicate-lines'), value: result.value.duplicateLinesRemoved },
]);

const canDownload = computed(() => result.value.output.length > 0);

async function copyResult() {
  await copy(result.value.output);
}

function downloadResult() {
  const blob = new Blob([result.value.output], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = document.documentElement.lang.startsWith('zh') ? '文本处理.txt' : 'text-format.txt';
  anchor.click();
  URL.revokeObjectURL(url);
}

function clearAll() {
  input.value = '';
}

/* 约定：每个工具都要有「一键示例」按钮 —— 空输入框是跳出率最高的形态。 */
const exampleData = {
  input: '  张三   \n李四\n\n王五  \n  张三\n\tenv=prod  ',
  prefix: '# ',
  replaceFrom: 'env=prod',
  replaceTo: 'env=dev',
};

function loadExample() {
  input.value = exampleData.input;
  options.removeLeftSpace = true;
  options.removeRightSpace = true;
  options.removeEmptyLine = true;
  options.prefixSuffixMode = 'add';
  options.prefix = exampleData.prefix;
  options.suffix = '';
  options.replaceUsing = true;
  options.replaceFromMode = 'custom';
  options.replaceFromText = exampleData.replaceFrom;
  options.replaceToMode = 'custom';
  options.replaceToText = exampleData.replaceTo;
}
</script>

<template>
  <c-card :title="t('tools.text-format.title')" max-w-800px>
    <div flex items-center justify-between gap-2 mb-2>
      <span />
      <ToolExampleButton @click="loadExample" />
    </div>

    <n-form-item :label="t('tools.text-format.texts.label-input')" label-placement="left" mb-1>
      <n-input
        v-model:value="input"
        type="textarea"
        :rows="8"
        :placeholder="t('tools.text-format.texts.placeholder-input')"
      />
    </n-form-item>

    <!-- 1. 去除空格 -->
    <c-card :title="t('tools.text-format.texts.label-space')" size="small" mb-2>
      <n-checkbox v-model:checked="options.removeLeftSpace">
        {{ t('tools.text-format.texts.opt-remove-left-space') }}
      </n-checkbox>
      <n-checkbox v-model:checked="options.removeRightSpace">
        {{ t('tools.text-format.texts.opt-remove-right-space') }}
      </n-checkbox>
      <n-checkbox v-model:checked="options.removeAllSpace">
        {{ t('tools.text-format.texts.opt-remove-all-space') }}
      </n-checkbox>
      <n-checkbox v-model:checked="options.removeEmptyLine">
        {{ t('tools.text-format.texts.opt-remove-empty-line') }}
      </n-checkbox>
    </c-card>

    <!-- 2. 前后缀 -->
    <c-card :title="t('tools.text-format.texts.label-prefix-suffix')" size="small" mb-2>
      <c-select
        v-model:value="options.prefixSuffixMode"
        :options="prefixSuffixOptions"
        :label="t('tools.text-format.texts.label-prefix-suffix-mode')"
        label-width="110px"
        label-position="left"
        mb-2
      />
      <n-input
        v-model:value="options.prefix"
        :placeholder="t('tools.text-format.texts.placeholder-prefix')"
        mb-2
      />
      <n-input
        v-model:value="options.suffix"
        :placeholder="t('tools.text-format.texts.placeholder-suffix')"
      />
    </c-card>

    <!-- 3. 缩进 -->
    <c-card :title="t('tools.text-format.texts.label-indent')" size="small" mb-2>
      <c-select
        v-model:value="options.indentMode"
        :options="indentModeOptions"
        :label="t('tools.text-format.texts.label-indent-mode')"
        label-width="110px"
        label-position="left"
        mb-2
      />
      <c-select
        v-model:value="options.indentMethod"
        :options="indentMethodOptions"
        :label="t('tools.text-format.texts.label-indent-method')"
        label-width="110px"
        label-position="left"
        mb-2
      />
      <c-select
        v-if="options.indentMethod === 'space'"
        v-model:value="options.indentUnitCount"
        :options="presetSpaces"
        :label="t('tools.text-format.texts.label-indent-columns')"
        label-width="110px"
        label-position="left"
      />
    </c-card>

    <!-- 4. 替换 -->
    <c-card :title="t('tools.text-format.texts.label-replace')" size="small" mb-2>
      <n-checkbox v-model:checked="options.replaceUsing">
        {{ t('tools.text-format.texts.opt-replace-using') }}
      </n-checkbox>
      <div flex items-center gap-2 mt-2>
        <span w-100px shrink-0>{{ t('tools.text-format.texts.label-replace-from') }}</span>
        <c-select
          v-model:value="options.replaceFromMode"
          :options="replacerModeOptions"
          w-110px
          shrink-0
        />
        <n-input
          v-model:value="options.replaceFromText"
          :disabled="options.replaceFromMode === 'newline'"
        />
      </div>
      <div flex items-center gap-2 mt-2>
        <span w-100px shrink-0>{{ t('tools.text-format.texts.label-replace-to') }}</span>
        <c-select
          v-model:value="options.replaceToMode"
          :options="replacerModeOptions"
          w-110px
          shrink-0
        />
        <n-input
          v-model:value="options.replaceToText"
          :disabled="options.replaceToMode === 'newline'"
        />
      </div>
    </c-card>

    <!-- 5. 排序 / 去重 / 行号 -->
    <c-card :title="t('tools.text-format.texts.label-order')" size="small" mb-2>
      <c-select
        v-model:value="options.orderBy"
        :options="orderOptions"
        :label="t('tools.text-format.texts.label-order-by')"
        label-width="110px"
        label-position="left"
        mb-2
      />
      <n-checkbox v-model:checked="options.removeRepeat">
        {{ t('tools.text-format.texts.opt-remove-repeat') }}
      </n-checkbox>
      <n-checkbox v-model:checked="options.showLineNumber">
        {{ t('tools.text-format.texts.opt-show-line-number') }}
      </n-checkbox>
    </c-card>

    <!-- 6. 高级变换（A9：倒序 / 上下标 / 截取 / 插入） -->
    <c-card :title="t('tools.text-format.texts.label-advanced')" size="small" mb-2>
      <p mb-2 text-13px op-70>
        {{ t('tools.text-format.texts.hint-advanced') }}
      </p>

      <!-- 倒序 -->
      <div flex items-center gap-2 mb-2>
        <span w-90px shrink-0>{{ t('tools.text-format.texts.label-reverse') }}</span>
        <c-select v-model:value="options.reverseMode" :options="reverseOptions" w-200px />
      </div>

      <!-- 上下标 -->
      <div flex items-center gap-2 mb-2>
        <span w-90px shrink-0>{{ t('tools.text-format.texts.label-script') }}</span>
        <c-select v-model:value="options.scriptMode" :options="scriptOptions" w-200px />
      </div>

      <!-- 截取 -->
      <div flex items-center gap-2 mb-2 flex-wrap>
        <span w-90px shrink-0>{{ t('tools.text-format.texts.label-truncate') }}</span>
        <c-select v-model:value="options.truncateMode" :options="truncateOptions" w-200px />
        <n-input-number-i18n
          v-if="options.truncateMode === 'head' || options.truncateMode === 'tail'"
          v-model:value="options.truncateN"
          :min="0"
          :show-button="false"
          w-120px
        />
        <template v-if="options.truncateMode === 'range'">
          <n-input-number-i18n v-model:value="options.truncateFrom" :min="0" :show-button="false" w-100px />
          <span op-70>~</span>
          <n-input-number-i18n v-model:value="options.truncateTo" :min="0" :show-button="false" w-100px />
        </template>
      </div>

      <!-- 插入 -->
      <div flex items-center gap-2 mb-2 flex-wrap>
        <span w-90px shrink-0>{{ t('tools.text-format.texts.label-insert') }}</span>
        <c-select v-model:value="options.insertMode" :options="insertOptions" w-200px />
        <n-input
          v-if="options.insertMode !== 'none'"
          v-model:value="options.insertText"
          :placeholder="t('tools.text-format.texts.placeholder-insert-text')"
          w-200px
        />
      </div>
      <div flex items-center gap-2 mb-1 flex-wrap>
        <span w-90px shrink-0 op-70>{{ t('tools.text-format.texts.label-insert-pos') }}</span>
        <n-input-number-i18n
          v-if="options.insertMode === 'atPos'"
          v-model:value="options.insertPosition"
          :min="0"
          :show-button="false"
          w-120px
        />
        <n-input-number-i18n
          v-if="options.insertMode === 'everyN'"
          v-model:value="options.insertInterval"
          :min="1"
          :show-button="false"
          w-120px
        />
        <span v-if="options.insertMode === 'atPos'" op-70>{{ t('tools.text-format.texts.hint-insert-atpos') }}</span>
        <span v-if="options.insertMode === 'everyN'" op-70>{{ t('tools.text-format.texts.hint-insert-everyn') }}</span>
      </div>
    </c-card>

    <!-- 输出 -->
    <c-card :title="t('tools.text-format.texts.title-result')" size="small">
      <n-input :value="result.output" type="textarea" :rows="10" readonly />
      <div flex flex-wrap gap-4 mt-2 mb-2>
        <span v-for="item in stats" :key="item.label">
          {{ item.label }}：{{ item.value }}
        </span>
      </div>
      <div flex items-center gap-2>
        <c-button type="primary" @click="copyResult">
          {{ t('tools.text-format.texts.action-copy') }}
        </c-button>
        <c-button :disabled="!canDownload" @click="downloadResult">
          {{ t('tools.text-format.texts.action-download') }}
        </c-button>
        <c-button @click="clearAll">{{ t('tools.text-format.texts.action-clear') }}</c-button>
      </div>
    </c-card>
  </c-card>
</template>
