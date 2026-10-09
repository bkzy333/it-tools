<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import ToolExampleButton from '@/components/ToolExampleButton.vue';
import { useCopy } from '@/composable/copy';
import { transformTable, type TableShapeOp } from './table-transpose.service';

const { t } = useI18n();
const { copy } = useCopy();

/* -------------------------------------------------------------- 状态 */
const input = ref('');
const op = ref<TableShapeOp>('transpose');
// '' 表示自动识别（service 里 falsy 即触发 detectDelimiter）
const delimiter = ref('');
const chunkCols = ref(3);
const mergeSep = ref(',');

/**
 * 示例给了一张 2 行 4 列的宽表，默认做转置，一眼能看出行列互换的效果；
 * 切换「按列数分页」也能立刻看到被切成两块。
 */
const exampleData = {
  input: '姓名\t语文\t数学\t英语\n张三\t88\t92\t79',
  op: 'transpose' as TableShapeOp,
  delimiter: '' as string,
  chunkCols: 2,
  mergeSep: ',',
};

function loadExample() {
  input.value = exampleData.input;
  op.value = exampleData.op;
  delimiter.value = exampleData.delimiter;
  chunkCols.value = exampleData.chunkCols;
  mergeSep.value = exampleData.mergeSep;
}

/* -------------------------------------------------------------- 选项 */
const opOptions = computed(() => [
  { value: 'transpose' as TableShapeOp, label: t('tools.table-transpose.texts.opt-op-transpose') },
  { value: 'chunk' as TableShapeOp, label: t('tools.table-transpose.texts.opt-op-chunk') },
  { value: 'flatten' as TableShapeOp, label: t('tools.table-transpose.texts.opt-op-flatten') },
  { value: 'merge' as TableShapeOp, label: t('tools.table-transpose.texts.opt-op-merge') },
]);

const delimiterOptions = computed(() => [
  { value: '', label: t('tools.table-transpose.texts.opt-delim-auto') },
  { value: '\t', label: t('tools.table-transpose.texts.opt-delim-tab') },
  { value: ',', label: t('tools.table-transpose.texts.opt-delim-comma') },
  { value: ';', label: t('tools.table-transpose.texts.opt-delim-semicolon') },
  { value: ' ', label: t('tools.table-transpose.texts.opt-delim-space') },
]);

const needChunk = computed(() => op.value === 'chunk');
const needMerge = computed(() => op.value === 'merge');

/* -------------------------------------------------------------- 计算 */
const output = computed(() =>
  transformTable(input.value, {
    op: op.value,
    delimiter: delimiter.value,
    chunkCols: Number(chunkCols.value) || 1,
    mergeSep: mergeSep.value,
  }),
);

const canCopy = computed(() => output.value.length > 0);

function copyResult() {
  copy(output.value);
}

function downloadResult() {
  const blob = new Blob([output.value], { type: 'text/plain;charset=utf-8' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = document.documentElement.lang.startsWith('zh') ? '表格转换.txt' : 'table-transform.txt';
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

function clearAll() {
  input.value = '';
}
</script>

<template>
  <div>
    <c-card :title="t('tools.table-transpose.texts.label-input')">
      <div flex items-center justify-between gap-2 mb-2>
        <ToolExampleButton @click="loadExample" />
        <c-button size="small" @click="clearAll">{{ t('tools.table-transpose.texts.action-clear') }}</c-button>
      </div>

      <n-input
        v-model:value="input"
        type="textarea"
        :rows="8"
        :placeholder="t('tools.table-transpose.texts.placeholder-input')"
      />

      <div grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3>
        <div>
          <div mb-1 text-sm>{{ t('tools.table-transpose.texts.label-op') }}</div>
          <c-select v-model:value="op" :options="opOptions" />
        </div>
        <div>
          <div mb-1 text-sm>{{ t('tools.table-transpose.texts.label-delimiter') }}</div>
          <c-select v-model:value="delimiter" :options="delimiterOptions" />
        </div>
        <div v-if="needChunk">
          <div mb-1 text-sm>{{ t('tools.table-transpose.texts.label-chunk-cols') }}</div>
          <n-input-number v-model:value="chunkCols" :min="1" :max="50" style="width: 100%" />
        </div>
        <div v-if="needMerge">
          <div mb-1 text-sm>{{ t('tools.table-transpose.texts.label-merge-sep') }}</div>
          <n-input v-model:value="mergeSep" :placeholder="t('tools.table-transpose.texts.placeholder-merge-sep')" />
        </div>
      </div>
    </c-card>

    <c-card :title="t('tools.table-transpose.texts.title-result')" mt-4>
      <div flex items-center justify-end gap-2 mb-2>
        <c-button size="small" :disabled="!canCopy" @click="copyResult">
          {{ t('tools.table-transpose.texts.action-copy') }}
        </c-button>
        <c-button size="small" :disabled="!canCopy" @click="downloadResult">
          {{ t('tools.table-transpose.texts.action-download') }}
        </c-button>
      </div>

      <n-input :value="output" type="textarea" :rows="10" readonly
        :placeholder="t('tools.table-transpose.texts.placeholder-result')" />
    </c-card>
  </div>
</template>
