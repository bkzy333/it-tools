<script setup lang="ts">
/**
 * 统一「复制 + 导出」操作条 —— 所有工具结果区右下角的标配三连。
 *
 * 解决的是之前各工具自说自话的乱象：有的只有复制、有的只有下载、有的下载还没 BOM。
 * 现在统一成：复制全部 / 导出 TXT / 导出 Excel 三个按钮，零依赖、风格一致。
 *
 * 用法：
 *   <CopyExportBar :text="allResultText" filename="pinyin" :rows="rowsForExcel" />
 *
 * - text：全部结果的纯文本（复制全部 + 导出 TXT 都用它）
 * - rows：可选，二维数组，用于导出 Excel（A 列输入 / B 列输出这类两列场景）。
 *         不传则按 text 的换行自动拆成单列。
 *
 * 关于「单个 vs 批量」：这些工具的多行输入框天然支持「一行=单条、多行=批量」，
 * 不需要额外的模式切换开关（那反而增加认知负荷）。本组件只负责把结果「带走」，
 * 单条和批量都用同一套按钮，导出格式按内容自适应。
 */
import { useI18n } from 'vue-i18n';
import { useCopy } from '@/composable/copy';
import { downloadTextFile, downloadCsvFile } from '@/composable/export';

const props = withDefaults(
  defineProps<{
    /** 全部结果的纯文本（复制全部 + 导出 TXT 的数据源） */
    text: string;
    /** 结果文件名（不含扩展名），如 'pinyin' */
    filename: string;
    /** 结构化行数据（导出 Excel 用，二维数组）。不传则按 text 换行拆成单列 */
    rows?: string[][];
    /** 无结果时禁用按钮 */
    disabled?: boolean;
  }>(),
  { rows: undefined, disabled: false },
);

const { copy } = useCopy();
const { t } = useI18n();

function copyAll() {
  copy(props.text, { notificationMessage: t('common.copied-all') });
}

function exportTxt() {
  downloadTextFile(`${props.filename}.txt`, props.text);
}

function exportExcel() {
  const rows = props.rows ?? props.text.split(/\r?\n/).map((line) => [line]);
  downloadCsvFile(`${props.filename}.csv`, rows);
}
</script>

<template>
  <div flex items-center gap-2>
    <c-button size="small" secondary :disabled="disabled || !text" @click="copyAll">
      {{ t('common.copy-all') }}
    </c-button>
    <c-button size="small" secondary :disabled="disabled || !text" @click="exportTxt">
      {{ t('common.export-txt') }}
    </c-button>
    <c-button size="small" secondary :disabled="disabled || !text" @click="exportExcel">
      {{ t('common.export-excel') }}
    </c-button>
  </div>
</template>
