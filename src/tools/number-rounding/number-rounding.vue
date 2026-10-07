<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import ToolExampleButton from '@/components/ToolExampleButton.vue';
import { useCopy } from '@/composable/copy';
import {
  clampDigits,
  formatValue,
  parseNumbers,
  roundTo,
  summarize,
  transformNumbers,
  type BatchOp,
  type RoundingMode,
} from './number-rounding.service';

const { t } = useI18n();
const { copy } = useCopy();

/* ------------------------------------------------------------------ 输入状态 */
const input = ref('');
const digits = ref(2);
const mode = ref<RoundingMode>('half-up');
const op = ref<BatchOp>('none');
const operand = ref(1);

/**
 * 示例故意挑了几个「一舍就暴露算法差异」的数：
 * 3.145 / 2.675 是浮点表示坑，2.5 / 3.5 是银行家舍入的分水岭，负数看方向。
 */
const exampleData = {
  input: `19.99
3.145
2.675
2.5
3.5
0.005
-12.345`,
};

function loadExample() {
  input.value = exampleData.input;
}

/* ------------------------------------------------------------------ 选项 */
const modeOptions = computed(() => [
  { value: 'half-up' as RoundingMode, label: t('tools.number-rounding.texts.mode-half-up') },
  { value: 'half-even' as RoundingMode, label: t('tools.number-rounding.texts.mode-half-even') },
  { value: 'ceil' as RoundingMode, label: t('tools.number-rounding.texts.mode-ceil') },
  { value: 'floor' as RoundingMode, label: t('tools.number-rounding.texts.mode-floor') },
  { value: 'truncate' as RoundingMode, label: t('tools.number-rounding.texts.mode-truncate') },
]);

const opOptions = computed(() => [
  { value: 'none' as BatchOp, label: t('tools.number-rounding.texts.op-none') },
  { value: 'add' as BatchOp, label: t('tools.number-rounding.texts.op-add') },
  { value: 'subtract' as BatchOp, label: t('tools.number-rounding.texts.op-subtract') },
  { value: 'multiply' as BatchOp, label: t('tools.number-rounding.texts.op-multiply') },
  { value: 'divide' as BatchOp, label: t('tools.number-rounding.texts.op-divide') },
]);

const digitsSafe = computed(() => clampDigits(Number(digits.value)));
const operandSafe = computed(() => (Number.isFinite(Number(operand.value)) ? Number(operand.value) : 0));

/* ------------------------------------------------------------------ 计算 */
const parsed = computed(() => parseNumbers(input.value));

const rows = computed(() =>
  transformNumbers(parsed.value.values, {
    digits: digitsSafe.value,
    mode: mode.value,
    op: op.value,
    operand: operandSafe.value,
  }),
);

const invalidCells = computed(() => parsed.value.cells.filter((c) => c.invalid));

const output = computed(() => rows.value.map((r) => formatValue(r.output, digitsSafe.value)).join('\n'));

const canCopy = computed(() => output.value.length > 0);

/** 统计跟着「批量运算之后」的结果走，不然勾了乘 1.1 还看到原值合计会误导 */
const stats = computed(() => {
  const values = rows.value.map((r) => r.output);
  return summarize(values);
});

const summaryText = computed(() => {
  const s = stats.value;
  if (!s.count) return '';
  const d = digitsSafe.value;
  const fmt = (v: number) => (Number.isFinite(v) ? formatValue(v, d) : '—');
  return `${t('tools.number-rounding.texts.summary-count')} ${s.count} ｜ ${t('tools.number-rounding.texts.summary-sum')} ${fmt(s.sum)} ｜ ${t('tools.number-rounding.texts.summary-avg')} ${fmt(s.avg)} ｜ ${t('tools.number-rounding.texts.summary-min')} ${fmt(s.min)} ｜ ${t('tools.number-rounding.texts.summary-max')} ${fmt(s.max)}`;
});

const divideZeroCount = computed(() => rows.value.filter((r) => r.note === 'divide-by-zero').length);

/* ------------------------------------------------------------------ 动作 */
async function copyResult() {
  await copy(output.value);
}

function downloadResult() {
  const blob = new Blob([output.value], { type: 'text/plain;charset=utf-8' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = document.documentElement.lang.startsWith('zh') ? '数值舍入结果.txt' : 'number-rounding.txt';
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

function clearAll() {
  input.value = '';
}
</script>

<template>
  <div>
    <c-card :title="t('tools.number-rounding.texts.label-input')">
      <div flex items-center justify-between gap-2 mb-2>
        <ToolExampleButton @click="loadExample" />
        <c-button size="small" @click="clearAll">{{ t('tools.number-rounding.texts.action-clear') }}</c-button>
      </div>

      <n-input
        v-model:value="input"
        type="textarea"
        :rows="10"
        :placeholder="t('tools.number-rounding.texts.placeholder-input')"
      />

      <p v-if="invalidCells.length" mt-2 text-red-500 text-sm>
        {{ t('tools.number-rounding.texts.message-invalid') }}：{{ invalidCells.map((c) => c.raw).join('、') }}
      </p>
    </c-card>

    <c-card :title="t('tools.number-rounding.texts.label-settings')" mt-4>
      <div grid grid-cols-1 sm:grid-cols-2 gap-3>
        <div>
          <div mb-1 text-sm>{{ t('tools.number-rounding.texts.label-digits') }}</div>
          <n-input-number v-model:value="digits" :min="0" :max="12" style="width: 100%" />
        </div>

        <div>
          <div mb-1 text-sm>{{ t('tools.number-rounding.texts.label-mode') }}</div>
          <c-select v-model:value="mode" :options="modeOptions" />
        </div>

        <div>
          <div mb-1 text-sm>{{ t('tools.number-rounding.texts.label-operation') }}</div>
          <c-select v-model:value="op" :options="opOptions" />
        </div>

        <div>
          <div mb-1 text-sm>{{ t('tools.number-rounding.texts.label-operand') }}</div>
          <n-input-number v-model:value="operand" step="any" style="width: 100%" />
        </div>
      </div>
    </c-card>

    <c-card :title="t('tools.number-rounding.texts.title-result')" mt-4>
      <div flex items-center justify-between gap-2 mb-2>
        <span text-sm text-gray-500>{{ summaryText }}</span>
        <div flex gap-2>
          <c-button size="small" :disabled="!canCopy" @click="copyResult">
            {{ t('tools.number-rounding.texts.action-copy') }}
          </c-button>
          <c-button size="small" :disabled="!canCopy" @click="downloadResult">
            {{ t('tools.number-rounding.texts.action-download') }}
          </c-button>
        </div>
      </div>

      <p v-if="divideZeroCount" mb-2 text-orange-500 text-sm>
        {{ t('tools.number-rounding.texts.message-divide-zero') }}：{{ divideZeroCount }}
      </p>

      <n-input :value="output" type="textarea" :rows="10" readonly
        :placeholder="t('tools.number-rounding.texts.placeholder-result')" />
    </c-card>
  </div>
</template>
