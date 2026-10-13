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
  { inputLabel: '输入', outputLabel: '输出' },
);

const { copy } = useCopy();

function copyOne(text: string) {
  copy(text, { notificationMessage: '已复制' });
}

/** 全部结果纯文本：错误行保留占位，避免行号错位 */
const allText = computed(() => props.rows.map((r) => r.output).join('\n'));

/** 导出 Excel 用：表头 + A 列输入 / B 列输出 */
const exportRows = computed<string[][]>(() => [
  [props.inputLabel, props.outputLabel],
  ...props.rows.map((r) => [r.input, r.output]),
]);
</script>

<template>
  <div flex flex-col gap-3>
    <table v-if="rows.length > 0" w-full border-collapse>
      <thead>
        <tr>
          <th text-left p-2 border border-gray-300 dark:border-gray-600>{{ inputLabel }}</th>
          <th text-left p-2 border border-gray-300 dark:border-gray-600>{{ outputLabel }}</th>
          <th w-20 p-2 border border-gray-300 dark:border-gray-600></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, idx) in rows" :key="idx">
          <td p-2 border border-gray-300 dark:border-gray-600 font-mono>{{ row.input }}</td>
          <td p-2 border border-gray-300 dark:border-gray-600>
            <span v-if="row.error" text-red-500>{{ row.output || '无法解析' }}</span>
            <span v-else>{{ row.output }}</span>
          </td>
          <td p-2 border border-gray-300 dark:border-gray-600 text-center>
            <c-button v-if="!row.error" size="small" secondary @click="copyOne(row.output)">
              复制
            </c-button>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-else text-sm op-60>请输入待转换内容，结果会按行对应显示在这里。</div>

    <div v-if="rows.length > 0" flex justify-end>
      <CopyExportBar :text="allText" :filename="filename" :rows="exportRows" />
    </div>
  </div>
</template>
