<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import ToolExampleButton from '@/components/ToolExampleButton.vue';
import { useCopy } from '@/composable/copy';
import {
  clampDigits,
  decimalToFraction,
  formatValue,
  fractionToDecimal,
  normalizeTextNumber,
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

/* ------------------------------------------------------------------ A3 折入：数字格式转换卡 */
type FmtMode = 'dec2frac' | 'frac2dec' | 'textnum';
const fmtMode = ref<FmtMode>('dec2frac');
const fmtDecimal = ref(0.75);
const fmtNum = ref(3);
const fmtDen = ref(4);
const fmtText = ref('007\n1,234.5\n00098.200');
const fmtDecimals = ref(0);

const fmtModeOptions = computed(() => [
  { value: 'dec2frac' as FmtMode, label: t('tools.number-rounding.texts.opt-fmt-dec2frac') },
  { value: 'frac2dec' as FmtMode, label: t('tools.number-rounding.texts.opt-fmt-frac2dec') },
  { value: 'textnum' as FmtMode, label: t('tools.number-rounding.texts.opt-fmt-textnum') },
]);

const dec2fracOut = computed(() => {
  const r = decimalToFraction(Number(fmtDecimal.value));
  return r ? r.display : '—';
});

const frac2decOut = computed(() => {
  const r = fractionToDecimal(Number(fmtNum.value) || 0, Number(fmtDen.value) || 0);
  return r === null || !Number.isFinite(r) ? '—' : String(r);
});

const textnumOut = computed(() =>
  fmtText.value
    .split(/\r?\n/)
    .map((line) => normalizeTextNumber(line, Number(fmtDecimals.value) || 0))
    .join('\n'),
);

const canCopyFmt = computed(() => textnumOut.value.length > 0 || fmtMode.value !== 'textnum');

function copyFmt() {
  const text = fmtMode.value === 'dec2frac' ? dec2fracOut.value : fmtMode.value === 'frac2dec' ? frac2decOut.value : textnumOut.value;
  copy(text);
}

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

    <c-card :title="t('tools.number-rounding.texts.title-format')" mt-4>
      <div mb-3>
        <div mb-1 text-sm>{{ t('tools.number-rounding.texts.label-format-mode') }}</div>
        <c-select v-model:value="fmtMode" :options="fmtModeOptions" />
      </div>

      <div v-if="fmtMode === 'dec2frac'" flex items-center gap-3>
        <div flex-1>
          <div mb-1 text-sm>{{ t('tools.number-rounding.texts.label-decimal') }}</div>
          <n-input-number v-model:value="fmtDecimal" step="any" style="width: 100%" />
        </div>
        <div flex-1>
          <div mb-1 text-sm>{{ t('tools.number-rounding.texts.fmt-result-dec2frac') }}</div>
          <n-input :value="dec2fracOut" readonly />
        </div>
        <c-button size="small" @click="copyFmt">{{ t('tools.number-rounding.texts.action-copy') }}</c-button>
      </div>

      <div v-else-if="fmtMode === 'frac2dec'" flex items-center gap-3>
        <div flex-1>
          <div mb-1 text-sm>{{ t('tools.number-rounding.texts.label-numerator') }}</div>
          <n-input-number v-model:value="fmtNum" style="width: 100%" />
        </div>
        <div flex-1>
          <div mb-1 text-sm>{{ t('tools.number-rounding.texts.label-denominator') }}</div>
          <n-input-number v-model:value="fmtDen" style="width: 100%" />
        </div>
        <div flex-1>
          <div mb-1 text-sm>{{ t('tools.number-rounding.texts.fmt-result-frac2dec') }}</div>
          <n-input :value="frac2decOut" readonly />
        </div>
        <c-button size="small" @click="copyFmt">{{ t('tools.number-rounding.texts.action-copy') }}</c-button>
      </div>

      <div v-else>
        <div mb-1 text-sm>{{ t('tools.number-rounding.texts.label-textnum-input') }}</div>
        <n-input
          v-model:value="fmtText"
          type="textarea"
          :rows="6"
          :placeholder="t('tools.number-rounding.texts.placeholder-textnum')"
        />
        <div flex items-center gap-3 mt-3>
          <div flex-1>
            <div mb-1 text-sm>{{ t('tools.number-rounding.texts.label-decimals') }}</div>
            <n-input-number v-model:value="fmtDecimals" :min="0" :max="10" style="width: 100%" />
          </div>
          <c-button size="small" @click="copyFmt">{{ t('tools.number-rounding.texts.action-copy') }}</c-button>
        </div>
        <div mb-1 text-sm mt-3>{{ t('tools.number-rounding.texts.fmt-result-textnum') }}</div>
        <n-input :value="textnumOut" type="textarea" :rows="6" readonly
          :placeholder="t('tools.number-rounding.texts.placeholder-result')" />
      </div>
    </c-card>
  </div>
</template>
