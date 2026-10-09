<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { datesToTimestamps, timestampsToDates, toCsv, type BatchRow, type TimestampUnit } from './batch-timestamp.service';
import { useCopy } from '@/composable/copy';

const { t } = useI18n();
const { copy } = useCopy();

const mode = ref<'ts-to-date' | 'date-to-ts'>('ts-to-date');
const unit = ref<TimestampUnit>('s');
const format = ref('YYYY-MM-DD HH:mm:ss');
const input = ref('');

const unitOptions = [
  { label: t('tools.batch-timestamp.texts.unit-s'), value: 's' },
  { label: t('tools.batch-timestamp.texts.unit-ms'), value: 'ms' },
];

const formatOptions = [
  { label: 'YYYY-MM-DD HH:mm:ss', value: 'YYYY-MM-DD HH:mm:ss' },
  { label: 'YYYY-MM-DD HH:mm', value: 'YYYY-MM-DD HH:mm' },
  { label: 'YYYY/MM/DD HH:mm:ss', value: 'YYYY/MM/DD HH:mm:ss' },
  { label: 'YYYY/MM/DD HH:mm', value: 'YYYY/MM/DD HH:mm' },
];

const rows = computed<BatchRow[]>(() => {
  const lines = input.value.split(/\r\n|\r|\n/);
  if (mode.value === 'ts-to-date') {
    return timestampsToDates(lines, unit.value, format.value);
  }
  return datesToTimestamps(lines, unit.value);
});

const validCount = computed(() => rows.value.filter((r) => r.output).length);

const outputText = computed(() =>
  rows.value.map((r) => (r.output ? r.output : r.input)).join('\n'),
);

const exampleData = {
  tsToDate: '1759999999\n1760000000\n1759900000',
  dateToTs: '2026-10-09 12:00:00\n2026-10-10 08:30:00',
};

function loadExample() {
  if (mode.value === 'ts-to-date') {
    unit.value = 's';
    input.value = exampleData.tsToDate;
  } else {
    unit.value = 's';
    input.value = exampleData.dateToTs;
  }
}

function clearAll() {
  input.value = '';
}

function exportCsv() {
  const csv = toCsv(rows.value);
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'batch-timestamp.csv';
  link.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div flex flex-col gap-3>
    <div flex justify-end>
      <ToolExampleButton @click="loadExample" />
    </div>

    <c-card>
      <n-space mb-3>
        <n-radio-group v-model:value="mode">
          <n-radio-button value="ts-to-date">{{ t('tools.batch-timestamp.texts.mode-ts-to-date') }}</n-radio-button>
          <n-radio-button value="date-to-ts">{{ t('tools.batch-timestamp.texts.mode-date-to-ts') }}</n-radio-button>
        </n-radio-group>
        <c-select v-model:value="unit" :label="t('tools.batch-timestamp.texts.label-unit')" label-position="left" :options="unitOptions" />
        <c-select
          v-if="mode === 'ts-to-date'"
          v-model:value="format"
          :label="t('tools.batch-timestamp.texts.label-format')"
          label-position="left"
          :options="formatOptions"
        />
      </n-space>

      <c-input-text
        v-model:value="input"
        multiline
        rows="8"
        :placeholder="t('tools.batch-timestamp.texts.placeholder-input')"
      />
    </c-card>

    <c-card v-if="rows.length" :title="t('tools.batch-timestamp.texts.title-result')">
      <div flex items-center justify-between mb-2>
        <span op-60 text-sm>{{ t('tools.batch-timestamp.texts.label-count') }} {{ validCount }} / {{ rows.length }}</span>
        <n-space>
          <c-button size="small" @click="copy(outputText)">{{ t('tools.batch-timestamp.texts.action-copy') }}</c-button>
          <c-button size="small" @click="exportCsv">{{ t('tools.batch-timestamp.texts.action-export-csv') }}</c-button>
          <c-button size="small" @click="clearAll">{{ t('tools.batch-timestamp.texts.action-clear') }}</c-button>
        </n-space>
      </div>

      <div flex flex-col gap-1 font-mono text-sm>
        <div v-for="(r, i) in rows" :key="i" flex gap-4 py-1>
          <span op-50 w-40 truncate>{{ r.input }}</span>
          <span v-if="r.error" text-red-500>{{ t('tools.batch-timestamp.texts.hint-error') }}</span>
          <span v-else>{{ r.output }}</span>
        </div>
      </div>
    </c-card>
  </div>
</template>
