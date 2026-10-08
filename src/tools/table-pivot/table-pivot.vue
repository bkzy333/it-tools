<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ToolExampleButton from '@/components/ToolExampleButton.vue';
import { useCopy } from '@/composable/copy';
import { aggregate, unpivot, type AggSpec, type AggType } from './table-pivot.service';
import { parseTableText, tableToObjects, tableToText } from '../table-utils/parse-table';

const { t } = useI18n();
const { copy } = useCopy();

const activeTab = ref<'aggregate' | 'unpivot'>('aggregate');

/* ------------------------------------------------------------------ 输入 */
const delimiter = ref('\t');
const customDelimiter = ref('|');
const useHeaderRow = ref(true);

const exampleSource = '区域\t销售\t金额\t日期\n华东\t张三\t120\t2024-01\n华东\t李四\t80\t2024-01\n华南\t张三\t95\t2024-02\n华东\t张三\t100\t2024-03';
const exampleWide = '姓名\t1月\t2月\t3月\n张三\t90\t85\t88\n李四\t76\t92\t80';

const sourceText = ref(exampleSource);
const wideText = ref(exampleWide);

const groupColumns = ref([0]);
const specs = ref<AggSpec[]>([{ col: 2, agg: 'sum' }]);

const idColumns = ref([0]);
const valueColumns = ref([1, 2]);

const exampleData = {
  sourceText: exampleSource,
  wideText: exampleWide,
};

function loadExample() {
  sourceText.value = exampleData.sourceText;
  wideText.value = exampleData.wideText;
}

/* ------------------------------------------------------------------ 解析 */
function currentDelimiter() {
  return delimiter.value === 'custom' ? customDelimiter.value : (delimiter.value as string);
}

const sourceRows = computed(() => parseTableText(sourceText.value, currentDelimiter()));
const wideRows = computed(() => parseTableText(wideText.value, currentDelimiter()));

function columnCount(rows: readonly (readonly string[])[]) {
  if (rows.length === 0) return 0;
  return rows.reduce((m, r) => Math.max(m, r.length), 0);
}

function columnOptions(rows: readonly (readonly string[])[]) {
  const head = rows[0] ?? [];
  const n = columnCount(rows);
  return Array.from({ length: n }, (_, i) => ({
    value: i,
    label: `${String(head[i] ?? `列${i + 1}`)}（第 ${i + 1} 列）`,
  }));
}

const sourceColumnOptions = computed(() => columnOptions(sourceRows.value));
const wideColumnOptions = computed(() => columnOptions(wideRows.value));

// ⚠️ 聚合方式的文案必须写成字面量 t()，别用 t(`...agg-${key}`) 拼键，
// 否则 check-i18n-keys 认不出来，线上就永久留英文。
const aggOptions = computed(() => [
  { value: 'sum' as AggType, label: t('tools.table-pivot.texts.agg-sum') },
  { value: 'avg' as AggType, label: t('tools.table-pivot.texts.agg-avg') },
  { value: 'min' as AggType, label: t('tools.table-pivot.texts.agg-min') },
  { value: 'max' as AggType, label: t('tools.table-pivot.texts.agg-max') },
  { value: 'count' as AggType, label: t('tools.table-pivot.texts.agg-count') },
  { value: 'distinct' as AggType, label: t('tools.table-pivot.texts.agg-distinct') },
  { value: 'median' as AggType, label: t('tools.table-pivot.texts.agg-median') },
]);

const delimiterOptions = computed(() => [
  { value: '\t', label: t('tools.table-pivot.texts.opt-delimiter-tab') },
  { value: ',', label: t('tools.table-pivot.texts.opt-delimiter-comma') },
  { value: ';', label: t('tools.table-pivot.texts.opt-delimiter-semicolon') },
  { value: '|', label: t('tools.table-pivot.texts.opt-delimiter-pipe') },
  { value: 'custom', label: t('tools.table-pivot.texts.opt-delimiter-custom') },
]);

/* ------------------------------------------------------------------ 分组汇总 */
const aggResult = computed(() =>
  aggregate(sourceRows.value, groupColumns.value, specs.value, useHeaderRow.value),
);

/**
 * 汇总表头是 service 用英文记号拼的（金额·sum），c-table 又给表头加了 uppercase，
 * 直接显示出来就是「金额·SUM」——英文混在中文表头里很跳，这里换成本地化短名。
 * ⚠️ 每个分支都写死 t('...') 字面量，别用 t(`...agg-${k}`) 拼键，否则漏检 i18n。
 */
function aggName(agg: string): string {
  if (agg === 'sum') return t('tools.table-pivot.texts.agg-sum');
  if (agg === 'avg') return t('tools.table-pivot.texts.agg-avg');
  if (agg === 'min') return t('tools.table-pivot.texts.agg-min');
  if (agg === 'max') return t('tools.table-pivot.texts.agg-max');
  if (agg === 'count') return t('tools.table-pivot.texts.agg-count');
  if (agg === 'distinct') return t('tools.table-pivot.texts.agg-distinct');
  return t('tools.table-pivot.texts.agg-median');
}

const aggHeader = computed(() =>
  aggResult.value.header.map((h) => h.replace(/·(sum|avg|min|max|count|distinct|median)$/, (_, k: string) => '·' + aggName(k))),
);

const aggLines = computed(() => (aggResult.value.rows.length === 0 ? [] : [aggHeader.value, ...aggResult.value.rows]));

const aggText = computed(() => (aggLines.value.length === 0 ? '' : tableToText(aggLines.value, currentDelimiter())));

const aggObjects = computed(() => tableToObjects(aggLines.value, aggHeader.value));

const aggSummary = computed(() => {
  const r = aggResult.value;
  if (r.rows.length === 0) return '';
  return `${t('tools.table-pivot.texts.summary-rows')}：${r.dataRows}`;
});

function addSpec() {
  const used = new Set(specs.value.map((s) => s.col));
  const next = sourceColumnOptions.value.find((o) => !used.has(o.value));
  if (!next) return;
  specs.value.push({ col: next.value, agg: 'sum' });
}

function removeSpec(index: number) {
  specs.value.splice(index, 1);
}

/* ------------------------------------------------------------------ 宽表转长表 */
const unpivotResult = computed(() => unpivot(wideRows.value, idColumns.value, valueColumns.value, useHeaderRow.value));

const unpivotText = computed(() =>
  unpivotResult.value.rows.length === 0 ? '' : tableToText([unpivotResult.value.header, ...unpivotResult.value.rows], currentDelimiter()),
);

const unpivotObjects = computed(() =>
  unpivotResult.value.rows.length === 0
    ? []
    : tableToObjects([unpivotResult.value.header, ...unpivotResult.value.rows], unpivotResult.value.header),
);

/* ------------------------------------------------------------------ 动作 */
async function copyResult(text: string) {
  await copy(text);
}

function downloadResult(text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = 'table-pivot.txt';
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

function clearAll() {
  sourceText.value = '';
  wideText.value = '';
  specs.value = [];
}

/** 列号越界（改了分隔符或删了列）时夹回来，别让聚合读到空列 */
watch(sourceColumnOptions, (options) => {
  const max = Math.max(0, options.length - 1);
  groupColumns.value = groupColumns.value.filter((c) => c <= max).map((c) => Math.min(c, max));
  specs.value = specs.value
    .filter((s) => s.col <= max)
    .map((s) => ({ col: Math.min(s.col, max), agg: s.agg }));
});

watch(wideColumnOptions, (options) => {
  const max = Math.max(0, options.length - 1);
  idColumns.value = idColumns.value.filter((c) => c <= max).map((c) => Math.min(c, max));
  valueColumns.value = valueColumns.value.filter((c) => c <= max).map((c) => Math.min(c, max));
});
</script>

<template>
  <div>
    <n-tabs v-model:value="activeTab" type="line" animated>
      <!-- ------------------------------------------------ 分组汇总 -->
      <n-tab-pane name="aggregate" :tab="t('tools.table-pivot.texts.tab-aggregate')">
        <c-card :title="t('tools.table-pivot.texts.label-source')">
          <div flex items-center justify-between gap-2 mb-2>
            <ToolExampleButton @click="loadExample" />
            <c-button size="small" @click="clearAll">{{ t('tools.table-pivot.texts.action-clear') }}</c-button>
          </div>

          <div grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3>
            <div>
              <div mb-1 text-sm>{{ t('tools.table-pivot.texts.label-delimiter') }}</div>
              <c-select v-model:value="delimiter" :options="delimiterOptions" />
            </div>
            <div v-if="delimiter === 'custom'">
              <div mb-1 text-sm>{{ t('tools.table-pivot.texts.label-custom-delimiter') }}</div>
              <c-input-text v-model:value="customDelimiter" :placeholder="t('tools.table-pivot.texts.placeholder-custom-delimiter')" />
            </div>
          </div>

          <n-input
            v-model:value="sourceText"
            type="textarea"
            :rows="8"
            :placeholder="t('tools.table-pivot.texts.placeholder-source')"
          />

          <div mt-3 flex flex-wrap items-center gap-x-6 gap-y-2>
            <n-checkbox v-model:checked="useHeaderRow">{{ t('tools.table-pivot.texts.label-header-row') }}</n-checkbox>
          </div>
        </c-card>

        <c-card :title="t('tools.table-pivot.texts.label-group-columns')" mt-4>
          <n-checkbox-group v-model:value="groupColumns">
            <n-checkbox
              v-for="opt in sourceColumnOptions"
              :key="opt.value"
              :value="opt.value"
              :label="opt.label"
            />
          </n-checkbox-group>
          <p mt-2 text-xs opacity-70>{{ t('tools.table-pivot.texts.hint-group') }}</p>
        </c-card>

        <c-card :title="t('tools.table-pivot.texts.label-value-columns')" mt-4>
          <div v-for="(spec, index) in specs" :key="index" grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3>
            <div>
              <div mb-1 text-sm>{{ t('tools.table-pivot.texts.label-value-columns') }}</div>
              <c-select v-model:value="specs[index].col" :options="sourceColumnOptions" />
            </div>
            <div>
              <div mb-1 text-sm>{{ t('tools.table-pivot.texts.label-agg') }}</div>
              <c-select v-model:value="specs[index].agg" :options="aggOptions" />
            </div>
            <div flex items-end>
              <c-button size="small" @click="removeSpec(index)">{{ t('tools.table-pivot.texts.action-remove') }}</c-button>
            </div>
          </div>

          <div v-if="specs.length === 0" text-sm opacity-70>{{ t('tools.table-pivot.texts.message-no-result') }}</div>

          <c-button size="small" :disabled="sourceColumnOptions.length === 0" @click="addSpec">
            + {{ t('tools.table-pivot.texts.action-add-agg') }}
          </c-button>

          <div mt-3 flex gap-2>
            <c-button size="small" :disabled="!aggText" @click="copyResult(aggText)">
              {{ t('tools.table-pivot.texts.action-copy') }}
            </c-button>
            <c-button size="small" :disabled="!aggText" @click="downloadResult(aggText)">
              {{ t('tools.table-pivot.texts.action-download') }}
            </c-button>
          </div>
        </c-card>

        <c-card :title="t('tools.table-pivot.texts.title-result')" mt-4>
          <div flex items-center justify-between gap-2 mb-2>
            <span text-sm text-gray-500>{{ aggSummary }}</span>
          </div>

          <c-table
            v-if="aggObjects.length"
            :data="aggObjects"
            :headers="aggHeader"
            :description="t('tools.table-pivot.texts.title-result')"
          />
          <p v-else text-sm opacity-70>{{ t('tools.table-pivot.texts.message-no-result') }}</p>
        </c-card>
      </n-tab-pane>

      <!-- ------------------------------------------------ 宽表转长表 -->
      <n-tab-pane name="unpivot" :tab="t('tools.table-pivot.texts.tab-unpivot')">
        <c-card :title="t('tools.table-pivot.texts.label-source')">
          <div flex items-center justify-between gap-2 mb-2>
            <ToolExampleButton @click="loadExample" />
            <c-button size="small" @click="clearAll">{{ t('tools.table-pivot.texts.action-clear') }}</c-button>
          </div>

          <n-input
            v-model:value="wideText"
            type="textarea"
            :rows="7"
            :placeholder="t('tools.table-pivot.texts.placeholder-source')"
          />

          <div mt-3 flex flex-wrap items-center gap-x-6 gap-y-2>
            <n-checkbox v-model:checked="useHeaderRow">{{ t('tools.table-pivot.texts.label-header-row') }}</n-checkbox>
          </div>
        </c-card>

        <c-card :title="t('tools.table-pivot.texts.label-unpivot-id-columns')" mt-4>
          <n-checkbox-group v-model:value="idColumns">
            <n-checkbox
              v-for="opt in wideColumnOptions"
              :key="opt.value"
              :value="opt.value"
              :label="opt.label"
            />
          </n-checkbox-group>
        </c-card>

        <c-card :title="t('tools.table-pivot.texts.label-unpivot-value-columns')" mt-4>
          <n-checkbox-group v-model:value="valueColumns">
            <n-checkbox
              v-for="opt in wideColumnOptions"
              :key="'v' + opt.value"
              :value="opt.value"
              :label="opt.label"
            />
          </n-checkbox-group>

          <div mt-3 flex gap-2>
            <c-button size="small" :disabled="!unpivotText" @click="copyResult(unpivotText)">
              {{ t('tools.table-pivot.texts.action-copy') }}
            </c-button>
            <c-button size="small" :disabled="!unpivotText" @click="downloadResult(unpivotText)">
              {{ t('tools.table-pivot.texts.action-download') }}
            </c-button>
          </div>
        </c-card>

        <c-card :title="t('tools.table-pivot.texts.title-unpivot-result')" mt-4>
          <c-table
            v-if="unpivotObjects.length"
            :data="unpivotObjects"
            :headers="unpivotResult.header"
            :description="t('tools.table-pivot.texts.title-unpivot-result')"
          />
          <p v-else text-sm opacity-70>{{ t('tools.table-pivot.texts.message-no-result') }}</p>
        </c-card>
      </n-tab-pane>
    </n-tabs>
  </div>
</template>
