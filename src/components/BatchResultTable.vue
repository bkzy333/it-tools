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
 *   <BatchResultTable :rows="rows" :columns="['地区','生日']" filename="id-card-parser" />
 *
 * - rows：逐条结果，保持输入顺序；error 的行原位标红，其余行照常出结果
 *          （错误逐行隔离，20 条里错 1 条不能整批报废）
 * - columns：额外列的列头。给了就多渲这几列（值取 row.extra），
 *            **导出的 Excel / 「复制全部」也会带上它们**——一条输入解析出一组字段时
 *            （身份证 → 地区/生日/性别…）必须能按列对账，塞成一段拼接文本没法用。
 *            不给就是标准两列，既有工具不受影响。
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
    columns?: string[];
  }>(),
  { inputLabel: undefined, outputLabel: undefined, columns: () => [] },
);

const { copy } = useCopy();
const { t } = useI18n();

/** 列头与空态文案走 i18n 的 common 段，工具不传也能在英文站显示英文 */
const inLabel = computed(() => props.inputLabel ?? t('common.col-input'));
const outLabel = computed(() => props.outputLabel ?? t('common.col-output'));

/** 有额外列时，一行内容的完整形态：输入 / 输出 / 各额外列 */
const hasExtra = computed(() => props.columns.length > 0);

function lineOf(row: BatchRow): string[] {
  return [row.input, row.output, ...(row.extra ?? [])];
}

function copyOne(text: string) {
  copy(text, { notificationMessage: t('common.copied') });
}

/**
 * 「复制全部」的纯文本。
 * 两列表（默认）：只拼输出，一行一个结果 —— 用户要的是「一批结果」。
 * 有额外列：拼成 TSV，整张表连同输入一起带走，粘回 Excel 才是齐的。
 */
const allText = computed(() =>
  props.rows
    .map((row) => (hasExtra.value ? lineOf(row).join('\t') : row.output))
    .join('\n'),
);

/** 导出 Excel 用：表头 + 每行（有额外列时一起带上） */
const exportRows = computed<string[][]>(() => {
  const header = hasExtra.value ? [inLabel.value, outLabel.value, ...props.columns] : [inLabel.value, outLabel.value];

  return [header, ...props.rows.map(lineOf)];
});
</script>

<template>
  <div flex flex-col gap-3>
    <div v-if="rows.length > 0" overflow-x-auto>
      <table w-full border-collapse>
        <thead>
          <tr>
            <th text-left p-2 border border-gray-300 dark:border-gray-600>{{ inLabel }}</th>
            <th text-left p-2 border border-gray-300 dark:border-gray-600>{{ outLabel }}</th>
            <th
              v-for="(col, colIdx) in columns"
              :key="`col-${colIdx}`"
              text-left p-2 border border-gray-300 dark:border-gray-600 whitespace-nowrap
            >
              {{ col }}
            </th>
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
            <td
              v-for="(col, colIdx) in columns"
              :key="`cell-${colIdx}`"
              p-2 border border-gray-300 dark:border-gray-600
              :class="row.error ? 'op-60' : ''"
            >
              {{ row.extra?.[colIdx] ?? '' }}
            </td>
            <td p-2 border border-gray-300 dark:border-gray-600 text-center>
              <c-button v-if="!row.error" size="small" secondary @click="copyOne(columns.length > 0 ? lineOf(row).join('\t') : row.output)">
                {{ t('common.copy') }}
              </c-button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else text-sm op-60>{{ t('common.empty-result') }}</div>

    <div v-if="rows.length > 0" flex justify-end>
      <CopyExportBar :text="allText" :filename="filename" :rows="exportRows" />
    </div>
  </div>
</template>
