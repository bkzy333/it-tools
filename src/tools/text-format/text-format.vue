<script setup lang="ts">
/**
 * 文本处理（/text-format）—— 文本家族融合后的统一入口。
 *
 * 2026-10-15 融合：原 text-format（固定流水线）/ text-dedupe / text-merge /
 * text-split / text-workflow（自由编排）五个工具合为本工具，list-converter 保留独立。
 *
 * 三层结构（防 UX 倒退的核心设计）：
 *   1. 一键预设：点 chip 即填好整条流水线，新用户零学习成本；
 *   2. 高级编排：op 自由增删排序，老用户的完整能力；
 *   3. 结果区：「文本 / 重复统计」双 Tab，后者承接原 text-dedupe 的统计 + CSV 导出。
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import ToolExampleButton from '@/components/ToolExampleButton.vue';
import CopyExportBar from '@/components/CopyExportBar.vue';
import { useCopy } from '@/composable/copy';
import { downloadCsvFile } from '@/composable/export';
import {
  buildPreset,
  countLines,
  createOp,
  formatCountItems,
  OP_PARAM_KEYS,
  PIPELINE_OP_GROUPS,
  PRESETS,
  runPipeline,
  sortCountItems,
  toStatisticsCsv,
  type PipelineOp,
  type PipelineOpType,
} from './text-pipeline.service';

const { t } = useI18n();
const { copy } = useCopy();

/* ------------------------------------------------------------------ 输入与编排状态 */
const input = ref('');
const ops = ref<PipelineOp[]>([]);
const activeTab = ref<'text' | 'count'>('text');
const countOrder = ref<'none' | 'count-desc' | 'count-asc'>('none');

function addOp(type: PipelineOpType) {
  ops.value.push(createOp(type));
}

function removeOp(index: number) {
  ops.value.splice(index, 1);
}

function moveOp(index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= ops.value.length) return;
  const [item] = ops.value.splice(index, 1);
  ops.value.splice(target, 0, item);
}

/** 一键预设：用预配序列替换当前编排（之后仍可任意增删改） */
function applyPreset(key: string) {
  ops.value = buildPreset(key);
}

/* ------------------------------------------------------------------ 计算结果 */
const output = computed(() => runPipeline({ input: input.value, ops: ops.value }));

const outputLineCount = computed(() => (output.value === '' ? 0 : output.value.split('\n').length));

const countResult = computed(() => {
  const r = countLines(output.value);
  return { ...r, items: sortCountItems(r.items, countOrder.value) };
});

const countText = computed(() => formatCountItems(countResult.value.items));

const countStats = computed(() => [
  { label: t('tools.text-format.texts.label-total'), value: countResult.value.total },
  { label: t('tools.text-format.texts.label-duplicate'), value: countResult.value.duplicate },
  { label: t('tools.text-format.texts.label-empty'), value: countResult.value.empty },
]);

function clearAll() {
  input.value = '';
  ops.value = [];
}

function copyCsv() {
  copy(toStatisticsCsv(countResult.value.items), { notificationMessage: t('tools.text-format.texts.msg-copied-csv') });
}

function downloadCsv() {
  downloadCsvFile('重复行统计.csv', countResult.value.items.map((item) => [item.key, String(item.count)]));
}

/* ------------------------------------------------------------------ 参数渲染元数据 */

interface ParamOption {
  value: string;
  label: string;
}

/**
 * 返回某参数的下拉选项；null 表示用文本输入框。
 * 集中在函数里而不是散在模板，避免模板里堆十几层 v-if。
 */
function paramOptions(type: PipelineOpType, key: string): ParamOption[] | null {
  switch (type) {
    case 'sort':
      if (key === 'mode') {
        return [
          { value: 'asc', label: t('tools.text-format.texts.opt-sort-asc') },
          { value: 'desc', label: t('tools.text-format.texts.opt-sort-desc') },
          { value: 'asc-num', label: t('tools.text-format.texts.opt-sort-asc-num') },
          { value: 'desc-num', label: t('tools.text-format.texts.opt-sort-desc-num') },
          { value: 'asc-bin', label: t('tools.text-format.texts.opt-sort-asc-bin') },
          { value: 'desc-bin', label: t('tools.text-format.texts.opt-sort-desc-bin') },
          { value: 'asc-upper', label: t('tools.text-format.texts.opt-sort-asc-upper') },
          { value: 'desc-upper', label: t('tools.text-format.texts.opt-sort-desc-upper') },
          { value: 'none', label: t('tools.text-format.texts.opt-sort-none') },
        ];
      }
      return null;
    case 'indent':
      if (key === 'mode') {
        return [
          { value: 'add', label: t('tools.text-format.texts.opt-indent-add') },
          { value: 'remove', label: t('tools.text-format.texts.opt-indent-remove') },
        ];
      }
      if (key === 'method') {
        return [
          { value: 'space', label: t('tools.text-format.texts.opt-method-space') },
          { value: 'tab', label: t('tools.text-format.texts.opt-method-tab') },
        ];
      }
      return null;
    case 'filter':
      if (key === 'invert') {
        return [
          { value: 'false', label: t('tools.text-format.texts.opt-no') },
          { value: 'true', label: t('tools.text-format.texts.opt-yes') },
        ];
      }
      return null;
    case 'merge':
      if (key === 'mode') {
        return [
          { value: 'rows', label: t('tools.text-format.texts.opt-merge-rows') },
          { value: 'cols', label: t('tools.text-format.texts.opt-merge-cols') },
        ];
      }
      if (key === 'output') {
        return [
          { value: ',', label: t('tools.text-format.texts.opt-delim-comma') },
          { value: ';', label: t('tools.text-format.texts.opt-delim-semicolon') },
          { value: '\t', label: t('tools.text-format.texts.opt-delim-tab') },
          { value: '\n', label: t('tools.text-format.texts.opt-delim-newline') },
        ];
      }
      if (key === 'input') {
        return [
          { value: '\t', label: t('tools.text-format.texts.opt-delim-tab') },
          { value: ',', label: t('tools.text-format.texts.opt-delim-comma') },
          { value: ' ', label: t('tools.text-format.texts.opt-delim-space') },
        ];
      }
      if (key === 'skipEmpty' || key === 'allSpace') {
        return [
          { value: 'true', label: t('tools.text-format.texts.opt-yes') },
          { value: 'false', label: t('tools.text-format.texts.opt-no') },
        ];
      }
      return null;
    case 'case':
      if (key === 'mode') {
        return [
          { value: 'lower', label: t('tools.text-format.texts.opt-case-lower') },
          { value: 'upper', label: t('tools.text-format.texts.opt-case-upper') },
        ];
      }
      return null;
    case 'reverse':
      if (key === 'mode') {
        return [
          { value: 'lines', label: t('tools.text-format.texts.opt-reverse-lines') },
          { value: 'chars', label: t('tools.text-format.texts.opt-reverse-chars') },
          { value: 'words', label: t('tools.text-format.texts.opt-reverse-words') },
        ];
      }
      return null;
    case 'script':
      if (key === 'mode') {
        return [
          { value: 'sub', label: t('tools.text-format.texts.opt-script-sub') },
          { value: 'super', label: t('tools.text-format.texts.opt-script-super') },
        ];
      }
      return null;
    case 'truncate':
      if (key === 'mode') {
        return [
          { value: 'head', label: t('tools.text-format.texts.opt-truncate-head') },
          { value: 'tail', label: t('tools.text-format.texts.opt-truncate-tail') },
          { value: 'range', label: t('tools.text-format.texts.opt-truncate-range') },
        ];
      }
      return null;
    case 'insert':
      if (key === 'mode') {
        return [
          { value: 'atPos', label: t('tools.text-format.texts.opt-insert-atpos') },
          { value: 'everyN', label: t('tools.text-format.texts.opt-insert-everyn') },
        ];
      }
      return null;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ 示例 */
const exampleData = {
  input: '  Apple  \nbanana\n\napple\nCherry\nbanana',
};

function loadExample() {
  input.value = exampleData.input;
  const preset = buildPreset('one-click-clean');
  // 在「一键清洗」基础上加一步小写，让示例覆盖 case op
  preset.push(createOp('case'));
  ops.value = preset;
  activeTab.value = 'text';
}
</script>

<template>
  <c-card :title="t('tools.text-format.title')" max-w-900px>
    <div flex items-center justify-between gap-2 mb-2>
      <span />
      <ToolExampleButton @click="loadExample" />
    </div>

    <!-- 输入 -->
    <n-form-item :label="t('tools.text-format.texts.label-input')" label-placement="left" mb-1>
      <n-input
        v-model:value="input"
        type="textarea"
        :rows="8"
        :placeholder="t('tools.text-format.texts.placeholder-input')"
      />
    </n-form-item>

    <!-- 第一层：一键预设 -->
    <c-card :title="t('tools.text-format.texts.label-presets')" size="small" mb-2>
      <p mb-2 text-13px op-70>{{ t('tools.text-format.texts.hint-presets') }}</p>
      <div flex flex-wrap gap-2>
        <c-button
          v-for="preset in PRESETS"
          :key="preset.key"
          size="small"
          secondary
          @click="applyPreset(preset.key)"
        >
          {{ t(`tools.text-format.texts.preset-${preset.key}`) }}
        </c-button>
      </div>
    </c-card>

    <!-- 第二层：高级编排 -->
    <c-card :title="t('tools.text-format.texts.label-advanced')" size="small" mb-2>
      <div mb-2 text-sm op-70>{{ t('tools.text-format.texts.label-add-op') }}</div>
      <div v-for="group in PIPELINE_OP_GROUPS" :key="group.label" mb-2>
        <div mb-1 text-12px op-60>{{ t(`tools.text-format.texts.${group.label}`) }}</div>
        <div flex flex-wrap gap-2>
          <c-button
            v-for="type in group.ops"
            :key="type"
            size="small"
            @click="addOp(type)"
          >
            {{ t(`tools.text-format.texts.op-${type}`) }}
          </c-button>
        </div>
      </div>

      <div mb-2 text-sm op-70>{{ t('tools.text-format.texts.label-workflow') }}</div>
      <n-empty v-if="ops.length === 0" size="small" :description="t('tools.text-format.texts.hint-no-op')" />
      <div v-else flex flex-col gap-2>
        <div
          v-for="(op, index) in ops"
          :key="op.id"
          flex
          items-start
          gap-2
          rounded-6px
          border-1
          border-solid
          border-(cool-gray-3)
          p-2
        >
          <div flex flex-col gap-1>
            <c-button size="small" quaternary :disabled="index === 0" @click="moveOp(index, -1)">↑</c-button>
            <c-button size="small" quaternary :disabled="index === ops.length - 1" @click="moveOp(index, 1)">↓</c-button>
          </div>

          <div flex-1>
            <div flex items-center justify-between mb-1>
              <span font-600>{{ t(`tools.text-format.texts.op-${op.type}`) }}</span>
              <c-button size="small" quaternary type="error" @click="removeOp(index)">×</c-button>
            </div>

            <div v-for="param in OP_PARAM_KEYS[op.type]" :key="param.key" flex items-center gap-2 mt-1>
              <span w-90px shrink-0 text-12px op-70>
                {{ t(`tools.text-format.texts.param-${param.label}`) }}
              </span>
              <c-select
                v-if="paramOptions(op.type, param.key)"
                :value="op.params[param.key]"
                :options="paramOptions(op.type, param.key)!"
                size="small"
                style="min-width: 160px"
                @update:value="(v: string) => (op.params[param.key] = v)"
              />
              <n-input
                v-else
                :value="op.params[param.key]"
                size="small"
                @update:value="(v: string) => (op.params[param.key] = v)"
              />
            </div>
          </div>
        </div>
      </div>
    </c-card>

    <!-- 第三层：结果区（文本 / 重复统计） -->
    <n-tabs v-model:value="activeTab" type="line" animated>
      <n-tab-pane name="text" :tab="t('tools.text-format.texts.tab-text')">
        <n-input :value="output" type="textarea" :rows="10" readonly :placeholder="t('tools.text-format.texts.placeholder-result')" />
        <div flex flex-wrap items-center gap-4 mt-2 mb-2>
          <span>{{ t('tools.text-format.texts.label-output-lines') }}：{{ outputLineCount }}</span>
        </div>
        <div flex items-center justify-between gap-2>
          <CopyExportBar :text="output" filename="文本处理" />
          <c-button @click="clearAll">{{ t('tools.text-format.texts.action-clear') }}</c-button>
        </div>
      </n-tab-pane>

      <n-tab-pane name="count" :tab="t('tools.text-format.texts.tab-count')">
        <c-select
          v-model:value="countOrder"
          :label="t('tools.text-format.texts.label-count-order')"
          label-width="120px"
          label-position="left"
          mb-2
          :options="[
            { label: t('tools.text-format.texts.opt-count-none'), value: 'none' },
            { label: t('tools.text-format.texts.opt-count-desc'), value: 'count-desc' },
            { label: t('tools.text-format.texts.opt-count-asc'), value: 'count-asc' },
          ]"
        />
        <n-input :value="countText" type="textarea" :rows="10" readonly :placeholder="t('tools.text-format.texts.placeholder-count')" />
        <div flex flex-wrap items-center gap-4 mt-2 mb-2>
          <span v-for="item in countStats" :key="item.label">
            {{ item.label }}：{{ item.value }}
          </span>
        </div>
        <div flex items-center gap-2>
          <c-button type="primary" :disabled="!countText" @click="copyCsv">
            {{ t('tools.text-format.texts.action-copy-csv') }}
          </c-button>
          <c-button :disabled="!countText" @click="downloadCsv">
            {{ t('tools.text-format.texts.action-download-csv') }}
          </c-button>
        </div>
      </n-tab-pane>
    </n-tabs>
  </c-card>
</template>
