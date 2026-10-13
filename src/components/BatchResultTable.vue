<script setup lang="ts">
/**
 * 批量结果表 —— 「一行输入对应一行输出」场景的统一结果区。
 *
 * 解决的是之前各工具自说自话的乱象：有的多条输进去只合并出一个大 textarea（看不出
 * 哪条对应哪条），有的干脆没有复制/导出。现在统一成：
 *   A 列输入 / B 列输出 / 右侧逐行复制 / 底部 CopyExportBar（复制全部 + 导出 TXT/Excel）。
 *
 * 用法：
 *   <BatchResultTable :rows="rows" filename="number-rounding" />
 *
 * - rows：逐条结果，保持输入顺序；error 的行原位标红，其余行照常出结果
 *          （错误逐行隔离，20 条里错 1 条不能整批报废）
 * - filename：导出文件名（不含扩展名）
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useCopy } from '@/composable/copy';
import type { BatchRow } from '@/composable/batchSplit';
import CopyExportBar from './CopyExportBar.vue';

const props = withDefaults(
  defineProps<{
    rows: BatchRow[];
    filename: string;
    inputLabel?: string;
    outputLabel?: string;
  }>(),
  { inputLabel: undefined, outputLabel: undefined },
);

const { copy } = useCopy();
const { t } = useI18n();

/** 列头与空态文案走 i18n 的 common 段，工具不传也能在英文站显示英文 */
const inLabel = computed(() => props.inputLabel ?? t('common.col-input'));
const outLabel = computed(() => props.outputLabel ?? t('common.col-output'));

function copyOne(text: string) {
  copy(text, { notificationMessage: t('common.copied') });
}

/** 全部结果纯文本：错误行保留占位，避免行号错位 */
const allText = computed(() => props.rows.map((r) => r.output).join('\n'));

/** 导出 Excel 用：表头 + A 列输入 / B 列输出 */
const exportRows = computed<string[][]>(() => [
  [inLabel.value, outLabel.value],
  ...props.rows.map((r) => [r.input, r.output]),
]);
</script>

<template>
  <div flex flex-col gap-3>
    <table v-if="rows.length > 0" w-full border-collapse>
      <thead>
        <tr>
          <th text-left p-2 border border-gray-300 dark:border-gray-600>{{ inLabel }}</th>
          <th text-left p-2 border border-gray-300 dark:border-gray-600>{{ outLabel }}</th>
          <th w-20 p-2 border border-gray-300 dark:border-gray-600></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, idx) in rows" :key="idx">
          <td p-2 border border-gray-300 dark:border-gray-600 font-mono>{{ row.input }}</td>
          <td p-2 border border-gray-300 dark:border-gray-600>
            <span v-if="row.error" text-red-500>{{ row.output || t('common.unparsable') }}</span>
            <span v-else>{{ row.output }}</span>
          </td>
          <td p-2 border border-gray-300 dark:border-gray-600 text-center>
            <c-button v-if="!row.error" size="small" secondary @click="copyOne(row.output)">
              {{ t('common.copy') }}
            </c-button>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-else text-sm op-60>{{ t('common.empty-result') }}</div>

    <div v-if="rows.length > 0" flex justify-end>
      <CopyExportBar :text="allText" :filename="filename" :rows="exportRows" />
    </div>
  </div>
</template>
