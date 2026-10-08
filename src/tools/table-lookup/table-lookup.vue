<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ToolExampleButton from '@/components/ToolExampleButton.vue';
import { useCopy } from '@/composable/copy';
import { lookup, mergeTables, type MatchMode } from './table-lookup.service';
import { parseTableText, tableToObjects, tableToText, uniqueHeaderNames } from '../table-utils/parse-table';

const { t } = useI18n();
const { copy } = useCopy();

const activeTab = ref<'lookup' | 'merge'>('lookup');

/* ------------------------------------------------------------------ 输入 */
const delimiter = ref('\t');
const customDelimiter = ref('|');
const useHeaderRow = ref(true);

const exampleSource = '学号\t姓名\t部门\t城市\t金额\n1001\t张三\t销售\t上海\t120\n1002\t李四\t财务\t北京\t100\n1003\t王五\t销售\t深圳\t200\n1004\t赵六\t财务\t上海\t150\n1001\t张三\t销售\t上海\t300';

const sourceText = ref(exampleSource);
const keysText = ref('1001\n1002\n9999');

const keyColumn = ref(0);
const conditionColumn = ref(-1);
const resultColumns = ref([1, 2]);
const matchMode = ref<MatchMode>('exact');
const dedupe = ref(false);

const leftText = ref(exampleSource);
const rightText = ref('学号\t城市\t电话\n1001\t上海\t13800000001\n1002\t北京\t13900000002\n1003\t深圳\t13900000003');
const leftKeyColumn = ref(0);
const rightKeyColumn = ref(0);
const rightColumns = ref([1, 2]);

const exampleData = {
  sourceText: exampleSource,
  keysText: '1001\n1002\n9999',
  leftText: exampleSource,
  rightText: '学号\t城市\t电话\n1001\t上海\t13800000001\n1002\t北京\t13900000002\n1003\t深圳\t13900000003',
};

function loadExample() {
  sourceText.value = exampleData.sourceText;
  keysText.value = exampleData.keysText;
  leftText.value = exampleData.leftText;
  rightText.value = exampleData.rightText;
}

/* ------------------------------------------------------------------ 解析 */
function currentDelimiter() {
  return delimiter.value === 'custom' ? customDelimiter.value : (delimiter.value as string);
}

const sourceRows = computed(() => parseTableText(sourceText.value, currentDelimiter()));
const leftRows = computed(() => parseTableText(leftText.value, currentDelimiter()));
const rightRows = computed(() => parseTableText(rightText.value, currentDelimiter()));

/** 表头行：没有表头时给 列N 兜底 */
function columnNames(rows: readonly (readonly string[])[], count: number): string[] {
  const head = rows[0] ?? [];
  return Array.from({ length: count }, (_, i) => String(head[i] ?? `列${i + 1}`));
}

function columnCount(rows: readonly (readonly string[])[], fallback: number) {
  if (rows.length === 0) return fallback;
  return rows.reduce((m, r) => Math.max(m, r.length), 0);
}

const sourceColumnOptions = computed(() => {
  const n = columnCount(sourceRows.value, 0);
  return columnNames(sourceRows.value, n).map((name, i) => ({
    value: i,
    label: `第 ${i + 1} 列${name ? ` · ${name}` : ''}`,
  }));
});

const rightColumnOptions = computed(() => {
  const n = columnCount(rightRows.value, 0);
  return columnNames(rightRows.value, n).map((name, i) => ({
    value: i,
    label: `第 ${i + 1} 列${name ? ` · ${name}` : ''}`,
  }));
});

const resultColumnOptions = computed(() =>
  sourceColumnOptions.value.map((o) => ({ ...o, label: o.label.replace(/^第 \d+ 列 · /, '').trim() || o.label })),
);

const modeOptions = computed(() => [
  { value: 'exact' as MatchMode, label: t('tools.table-lookup.texts.mode-exact') },
  { value: 'contains' as MatchMode, label: t('tools.table-lookup.texts.mode-contains') },
  { value: 'startsWith' as MatchMode, label: t('tools.table-lookup.texts.mode-starts-with') },
]);

const conditionOptions = computed(() => [
  { value: -1, label: t('tools.table-lookup.texts.opt-condition-none') },
  ...sourceColumnOptions.value,
]);

const delimiterOptions = computed(() => [
  { value: '\t', label: t('tools.table-lookup.texts.opt-delimiter-tab') },
  { value: ',', label: t('tools.table-lookup.texts.opt-delimiter-comma') },
  { value: ';', label: t('tools.table-lookup.texts.opt-delimiter-semicolon') },
  { value: '|', label: t('tools.table-lookup.texts.opt-delimiter-pipe') },
  { value: 'custom', label: t('tools.table-lookup.texts.opt-delimiter-custom') },
]);

/* ------------------------------------------------------------------ 查找 */
const lookupResult = computed(() => {
  const rows = sourceRows.value;
  const cols = sourceColumnOptions.value.length;
  if (rows.length === 0 || cols === 0) return { header: [] as string[], rows: [] as string[][], notFound: 0 };

  const keys = keysText.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => line.split(currentDelimiter() || '\t'));

  const res = lookup({
    source: rows,
    keys,
    keyCols: conditionColumn.value >= 0 ? [keyColumn.value, conditionColumn.value] : [keyColumn.value],
    resultCols: resultColumns.value,
    mode: matchMode.value,
    headerRow: useHeaderRow.value,
    dedupe: dedupe.value,
  });

  const names = columnNames(rows, cols);
  return {
    header: res.rows.length > 0 ? resultColumns.value.map((c) => names[c] ?? `列${c + 1}`) : [],
    rows: res.rows.map((r) => r.values),
    notFound: res.notFound,
  };
});

const lookupText = computed(() =>
  lookupResult.value.rows.length === 0 ? '' : tableToText(lookupResult.value.rows, currentDelimiter()),
);

const lookupHeader = computed(() => uniqueHeaderNames(lookupResult.value.header));

const lookupObjects = computed(() =>
  lookupResult.value.rows.map((values, i) => {
    const obj: Record<string, string> = { __row: String(i + 1) };
    lookupHeader.value.forEach((name, j) => {
      obj[name] = values[j] ?? '';
    });
    return obj;
  }),
);

const lookupHint = computed(() => {
  const total = keysText.value.split(/\r?\n/).filter((l) => l.trim() !== '').length;
  if (lookupResult.value.rows.length === 0 && total > 0) return t('tools.table-lookup.texts.message-no-result');
  if (lookupResult.value.notFound > 0) {
    return `${t('tools.table-lookup.texts.summary-not-found')}：${lookupResult.value.notFound}`;
  }
  return '';
});

/* ------------------------------------------------------------------ 合并 */
const mergeResult = computed(() => {
  const left = leftRows.value;
  const right = rightRows.value;
  if (left.length === 0 || right.length === 0) {
    return { header: [] as string[], rows: [] as string[][], unmatched: 0 };
  }
  return mergeTables({
    left,
    leftKey: leftKeyColumn.value,
    right,
    rightKey: rightKeyColumn.value,
    rightCols: rightColumns.value,
    headerRow: useHeaderRow.value,
    rightHeader: right[0],
  });
});

// 合并左右表时同名列很常见（两边都有「城市」），不去重的话 c-table 两列长一样
const mergeHeader = computed(() => uniqueHeaderNames(mergeResult.value.header));

const mergeObjects = computed(() => tableToObjects(mergeResult.value.rows, mergeHeader.value));

const mergeText = computed(() =>
  mergeResult.value.rows.length === 0 ? '' : tableToText(mergeResult.value.rows, currentDelimiter()),
);

const mergeHint = computed(() => {
  const leftTotal = useHeaderRow.value ? Math.max(0, leftRows.value.length - 1) : leftRows.value.length;
  if (mergeResult.value.unmatched > 0) {
    return `${t('tools.table-lookup.texts.summary-unmatched')}：${mergeResult.value.unmatched} / ${leftTotal}`;
  }
  return '';
});

/* ------------------------------------------------------------------ 动作 */
async function copyResult(text: string) {
  await copy(text);
}

function downloadResult(text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = 'table-lookup.txt';
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

function clearAll() {
  sourceText.value = '';
  keysText.value = '';
  leftText.value = '';
  rightText.value = '';
}

/** 列号可能因为改分隔符/删行变得越界，自动夹回来，别让界面读到 undefined 列 */
watch([sourceColumnOptions, rightColumnOptions], () => {
  const maxSource = Math.max(0, sourceColumnOptions.value.length - 1);
  const maxRight = Math.max(0, rightColumnOptions.value.length - 1);
  keyColumn.value = Math.min(keyColumn.value, maxSource);
  conditionColumn.value = Math.min(conditionColumn.value, maxSource);
  leftKeyColumn.value = Math.min(leftKeyColumn.value, maxSource);
  rightKeyColumn.value = Math.min(rightKeyColumn.value, maxRight);
  resultColumns.value = resultColumns.value
    .filter((c) => c <= maxSource)
    .map((c) => Math.min(c, maxSource));
  rightColumns.value = rightColumns.value.filter((c) => c <= maxRight).map((c) => Math.min(c, maxRight));
});
</script>

<template>
  <div>
    <n-tabs v-model:value="activeTab" type="line" animated>
      <!-- ------------------------------------------------ 按关键字查找 -->
      <n-tab-pane name="lookup" :tab="t('tools.table-lookup.texts.tab-lookup')">

        <c-card :title="t('tools.table-lookup.texts.label-source')">
          <div flex items-center justify-between gap-2 mb-2>
            <ToolExampleButton @click="loadExample" />
            <c-button size="small" @click="clearAll">{{ t('tools.table-lookup.texts.action-clear') }}</c-button>
          </div>

          <div grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3>
            <div>
              <div mb-1 text-sm>{{ t('tools.table-lookup.texts.label-delimiter') }}</div>
              <c-select v-model:value="delimiter" :options="delimiterOptions" />
            </div>
            <div v-if="delimiter === 'custom'">
              <div mb-1 text-sm>{{ t('tools.table-lookup.texts.label-custom-delimiter') }}</div>
              <c-input-text v-model:value="customDelimiter" :placeholder="t('tools.table-lookup.texts.placeholder-custom-delimiter')" />
            </div>
          </div>

          <n-input
            v-model:value="sourceText"
            type="textarea"
            :rows="8"
            :placeholder="t('tools.table-lookup.texts.placeholder-source')"
          />

          <div mt-3 flex flex-wrap items-center gap-x-6 gap-y-2>
            <n-checkbox v-model:checked="useHeaderRow">{{ t('tools.table-lookup.texts.label-header-row') }}</n-checkbox>
          </div>
        </c-card>

        <c-card :title="t('tools.table-lookup.texts.label-keys')" mt-4>
          <div grid grid-cols-1 sm:grid-cols-2 gap-3>
            <div>
              <div mb-1 text-sm>{{ t('tools.table-lookup.texts.label-key-column') }}</div>
              <c-select v-model:value="keyColumn" :options="sourceColumnOptions" />
            </div>
            <div>
              <div mb-1 text-sm>{{ t('tools.table-lookup.texts.label-condition-column') }}</div>
              <c-select v-model:value="conditionColumn" :options="conditionOptions" />
            </div>
          </div>
          <p mb-3 text-xs opacity-70>{{ t('tools.table-lookup.texts.hint-condition') }}</p>

          <n-input
            v-model:value="keysText"
            type="textarea"
            :rows="5"
            :placeholder="t('tools.table-lookup.texts.placeholder-keys')"
          />
        </c-card>

        <c-card :title="t('tools.table-lookup.texts.label-result-columns')" mt-4>
          <div flex flex-wrap gap-x-6 gap-y-2>
            <n-checkbox-group v-model:value="resultColumns">
              <n-checkbox
                v-for="opt in resultColumnOptions"
                :key="opt.value"
                :value="opt.value"
                :label="opt.label"
              />
            </n-checkbox-group>
          </div>

          <div mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3>
            <div>
              <div mb-1 text-sm>{{ t('tools.table-lookup.texts.label-match-mode') }}</div>
              <c-select v-model:value="matchMode" :options="modeOptions" />
            </div>
            <div flex items-center pt-6>
              <n-checkbox v-model:checked="dedupe">{{ t('tools.table-lookup.texts.label-dedupe') }}</n-checkbox>
            </div>
          </div>
        </c-card>

        <c-card :title="t('tools.table-lookup.texts.title-result')" mt-4>
          <div flex items-center justify-between gap-2 mb-2>
            <span text-sm text-gray-500>{{ lookupHint }}</span>
            <div flex gap-2>
              <c-button size="small" :disabled="!lookupText" @click="copyResult(lookupText)">
                {{ t('tools.table-lookup.texts.action-copy') }}
              </c-button>
              <c-button size="small" :disabled="!lookupText" @click="downloadResult(lookupText)">
                {{ t('tools.table-lookup.texts.action-download') }}
              </c-button>
            </div>
          </div>

          <c-table
            v-if="lookupObjects.length"
            :data="lookupObjects"
            :headers="lookupHeader"
            :description="t('tools.table-lookup.texts.title-result')"
          />
          <p v-else text-sm opacity-70>{{ t('tools.table-lookup.texts.message-no-result') }}</p>
        </c-card>
      </n-tab-pane>

      <n-tab-pane name="merge" :tab="t('tools.table-lookup.texts.tab-merge')">

        <c-card :title="t('tools.table-lookup.texts.label-left-table')">
          <div flex items-center justify-between gap-2 mb-2>
            <ToolExampleButton @click="loadExample" />
            <span />
          </div>
          <div grid grid-cols-1 sm:grid-cols-2 gap-3>
            <div>
              <div mb-1 text-sm>{{ t('tools.table-lookup.texts.label-left-key-column') }}</div>
              <c-select v-model:value="leftKeyColumn" :options="sourceColumnOptions" />
            </div>
          </div>
          <n-input
            v-model:value="leftText"
            type="textarea"
            :rows="8"
            :placeholder="t('tools.table-lookup.texts.placeholder-left-table')"
            mt-3
          />
        </c-card>

        <c-card :title="t('tools.table-lookup.texts.label-right-table')" mt-4>
          <div grid grid-cols-1 sm:grid-cols-2 gap-3>
            <div>
              <div mb-1 text-sm>{{ t('tools.table-lookup.texts.label-right-key-column') }}</div>
              <c-select v-model:value="rightKeyColumn" :options="rightColumnOptions" />
            </div>
          </div>

          <div mt-3 mb-1 text-sm>{{ t('tools.table-lookup.texts.label-right-columns') }}</div>
          <div flex flex-wrap gap-x-6 gap-y-2>
            <n-checkbox-group v-model:value="rightColumns">
              <n-checkbox
                v-for="opt in rightColumnOptions"
                :key="opt.value"
                :value="opt.value"
                :label="opt.label"
              />
            </n-checkbox-group>
          </div>

          <n-input
            v-model:value="rightText"
            type="textarea"
            :rows="6"
            :placeholder="t('tools.table-lookup.texts.placeholder-right-table')"
            mt-3
          />
        </c-card>

        <c-card :title="t('tools.table-lookup.texts.title-merge-result')" mt-4>
          <div flex items-center justify-between gap-2 mb-2>
            <span text-sm text-gray-500>{{ mergeHint }}</span>
            <div flex gap-2>
              <c-button size="small" :disabled="!mergeText" @click="copyResult(mergeText)">
                {{ t('tools.table-lookup.texts.action-copy') }}
              </c-button>
              <c-button size="small" :disabled="!mergeText" @click="downloadResult(mergeText)">
                {{ t('tools.table-lookup.texts.action-download') }}
              </c-button>
            </div>
          </div>

          <c-table
            v-if="mergeResult.rows.length"
            :data="mergeObjects"
            :headers="mergeHeader"
            :description="t('tools.table-lookup.texts.title-merge-result')"
          />
          <p v-else text-sm opacity-70>{{ t('tools.table-lookup.texts.message-no-result') }}</p>
        </c-card>
      </n-tab-pane>
    </n-tabs>
  </div>
</template>
