<script setup lang="ts">
/**
 * BMI 计算器。
 *
 * 行为规格来自参考站 https://cn.onlinebmicalculator.com/ 的运行时 dump，
 * 逐条阈值见 `_recon-bmi/` 与 bmi-calculator.service.ts。
 * 这里**不做二次计算** —— 静态 HTML 与运行时算出两个样就是 cloaking（AdSense 封号级）。
 *
 * 参考站那层产品壳（语言切换、多工具导航、广告、版权）一概不搬，只做工具卡本体。
 * 功能对齐参考站：两种单位制（公制 cm+kg / 英制 in+lb）、四种 BMI 标准
 * （国际/中国/日本/新加坡）、健康体重范围、BMI 历史记录（localStorage）。
 */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import ToolExampleButton from '@/components/ToolExampleButton.vue';
import { useCopy } from '@/composable/copy';
import {
  calcBmi,
  classifyBmi,
  healthyWeightRange,
  loadHistory,
  saveHistory,
  deleteHistory,
  clearHistory,
  STANDARDS,
  type UnitSystem,
  type BmiStandard,
  type BmiHistoryEntry,
  type BmiCategoryDef,
} from './bmi-calculator.service';

const { t } = useI18n();
const { copy } = useCopy();

/* ---------------------------------------------------------------- 输入状态 */

// 示例选 65kg/170cm，能跑出中国标准「正常」+ 国际标准「正常」的典型结果。
const exampleData = { weight: 65, height: 170, unit: 'metric' as UnitSystem, standard: 'chinese' as BmiStandard };

const unit = ref<UnitSystem>('metric');
const weight = ref<number | null>(null);
const height = ref<number | null>(null);
const standard = ref<BmiStandard>('chinese');
const autoSave = ref(true);

const unitOptions = computed(() => [
  { label: t('tools.bmi-calculator.texts.label-metric-kg-cm'), value: 'metric' },
  { label: t('tools.bmi-calculator.texts.label-us-lbs-in'), value: 'us' },
]);

const standardOptions = computed(() => [
  { label: t('tools.bmi-calculator.texts.std-international'), value: 'international' },
  { label: t('tools.bmi-calculator.texts.std-chinese'), value: 'chinese' },
  { label: t('tools.bmi-calculator.texts.std-japanese'), value: 'japanese' },
  { label: t('tools.bmi-calculator.texts.std-singapore'), value: 'singapore' },
]);

/** 历史记录（倒序） */
const history = ref<BmiHistoryEntry[]>([]);
onMounted(() => {
  history.value = loadHistory();
});

/* ---------------------------------------------------------------- 计算结果 */

const bmi = computed(() => calcBmi(weight.value ?? 0, height.value ?? 0, unit.value));

const category = computed<BmiCategoryDef | null>(() => {
  if (bmi.value === null) {
    return null;
  }
  return classifyBmi(bmi.value, standard.value);
});

const healthyRange = computed(() => {
  if (height.value === null) {
    return null;
  }
  return healthyWeightRange(height.value, unit.value, standard.value);
});

/** 是否所有分类中偏「重」的档（用于上色：偏瘦/正常绿，其余红） */
const isUnhealthy = computed(() => {
  if (!category.value) {
    return false;
  }
  return category.value.label !== '偏瘦' && category.value.label !== '正常';
});

/** 标准对照表的展示行（把 service 里的区间转成「18.5 ~ 23.9」这种可读文案） */
const standardTableRows = computed(() => {
  const std = STANDARDS[standard.value];
  return std.map((c) => ({
    label: c.label,
    range:
      c.min === -Infinity
        ? `<= ${c.max}`
        : c.max === Infinity
          ? `>= ${c.min}`
          : `${c.min} ~ ${c.max}`,
  }));
});

/* ---------------------------------------------------------------- 历史记录操作 */

const weightUnit = computed(() => (unit.value === 'metric' ? t('tools.bmi-calculator.texts.unit-kg') : t('tools.bmi-calculator.texts.unit-lb')));
const heightUnit = computed(() => (unit.value === 'metric' ? t('tools.bmi-calculator.texts.unit-cm') : t('tools.bmi-calculator.texts.unit-in')));

function addHistory() {
  if (bmi.value === null || !category.value || height.value === null || weight.value === null) {
    return;
  }
  const now = new Date();
  const entry: BmiHistoryEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: now.getTime(),
    date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    height: height.value,
    weight: weight.value,
    unit: unit.value,
    standard: standard.value,
    bmi: bmi.value,
    category: category.value.label,
  };
  history.value = saveHistory(entry);
}

function removeHistory(id: string) {
  history.value = deleteHistory(id);
}

function resetHistory() {
  clearHistory();
  history.value = [];
}

/* ---------------------------------------------------------------- 示例 / 复制 */

function loadExample() {
  weight.value = exampleData.weight;
  height.value = exampleData.height;
  unit.value = exampleData.unit;
  standard.value = exampleData.standard;
}

function copyResult() {
  if (bmi.value === null || !category.value) {
    return;
  }
  const lines = [
    `${t('tools.bmi-calculator.texts.label-bmi')} ${bmi.value}`,
    `${t('tools.bmi-calculator.texts.label-category')} ${category.value.label}`,
  ];
  if (healthyRange.value) {
    lines.push(
      `${t('tools.bmi-calculator.texts.label-healthy-range')} ${healthyRange.value.minKg} ~ ${healthyRange.value.maxKg} ${t('tools.bmi-calculator.texts.unit-kg')}`,
    );
  }
  copy(lines.join('\n'));
}
</script>

<template>
  <c-card :title="t('tools.bmi-calculator.title')" max-w-800px>
    <div class="bmi">
      <!-- ============================== 输入区 ============================== -->
      <div class="bmi-grid">
        <label class="bmi-field">
          <span class="bmi-label">{{ t('tools.bmi-calculator.texts.label-weight') }}</span>
          <span class="bmi-suffix-wrap">
            <input v-model.number="weight" class="bmi-input" type="number" min="1" step="0.1" :placeholder="t('tools.bmi-calculator.texts.placeholder-enter-weight')" />
            <span class="bmi-suffix">{{ weightUnit }}</span>
          </span>
        </label>

        <label class="bmi-field">
          <span class="bmi-label">{{ t('tools.bmi-calculator.texts.label-height') }}</span>
          <span class="bmi-suffix-wrap">
            <input v-model.number="height" class="bmi-input" type="number" min="1" step="0.1" :placeholder="t('tools.bmi-calculator.texts.placeholder-enter-height')" />
            <span class="bmi-suffix">{{ heightUnit }}</span>
          </span>
        </label>

        <label class="bmi-field">
          <span class="bmi-label">{{ t('tools.bmi-calculator.texts.label-select-units') }}</span>
          <select v-model="unit" class="bmi-input bmi-select">
            <option v-for="o in unitOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </label>

        <label class="bmi-field">
          <span class="bmi-label">{{ t('tools.bmi-calculator.texts.label-standard') }}</span>
          <select v-model="standard" class="bmi-input bmi-select">
            <option v-for="o in standardOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </label>
      </div>

      <div class="bmi-actions">
        <ToolExampleButton @click="loadExample" />
        <button v-if="bmi !== null" type="button" class="bmi-btn primary" @click="copyResult">
          {{ t('tools.bmi-calculator.texts.btn-copy') }}
        </button>
        <label v-if="bmi !== null" class="bmi-save">
          <input v-model="autoSave" type="checkbox" />
          <span>{{ t('tools.bmi-calculator.texts.label-autosave') }}</span>
        </label>
      </div>

      <!-- ============================== 结果区 ============================== -->
      <div v-if="bmi !== null && category" class="bmi-result" :class="isUnhealthy ? 'warn' : 'ok'">
        <div class="bmi-result-line">
          <span class="bmi-result-k">{{ t('tools.bmi-calculator.texts.label-bmi') }}</span>
          <span class="bmi-result-v">{{ bmi }}</span>
        </div>
        <div class="bmi-result-line">
          <span class="bmi-result-k">{{ t('tools.bmi-calculator.texts.label-category') }}</span>
          <span class="bmi-result-v">{{ category.label }}</span>
        </div>
        <div v-if="healthyRange" class="bmi-result-line">
          <span class="bmi-result-k">{{ t('tools.bmi-calculator.texts.label-healthy-range') }}</span>
          <span class="bmi-result-v">{{ healthyRange.minKg }} ~ {{ healthyRange.maxKg }} {{ t('tools.bmi-calculator.texts.unit-kg') }}</span>
        </div>
        <button v-if="autoSave" type="button" class="bmi-btn small" @click="addHistory">
          {{ t('tools.bmi-calculator.texts.btn-save') }}
        </button>
      </div>
      <p v-else class="bmi-hint">{{ t('tools.bmi-calculator.texts.hint-empty') }}</p>

      <!-- ============================== 标准对照表 ============================== -->
      <div class="bmi-table">
        <div class="bmi-table-title">{{ t('tools.bmi-calculator.texts.title-standard-table') }}（{{ standardOptions.find((o) => o.value === standard)?.label }}）</div>
        <table>
          <thead>
            <tr>
              <th>{{ t('tools.bmi-calculator.texts.th-category') }}</th>
              <th>{{ t('tools.bmi-calculator.texts.th-range') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in standardTableRows" :key="row.label">
              <td>{{ row.label }}</td>
              <td>{{ row.range }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- ============================== 历史记录 ============================== -->
      <div class="bmi-history">
        <div class="bmi-history-head">
          <span class="bmi-table-title">{{ t('tools.bmi-calculator.texts.title-history') }}</span>
          <button v-if="history.length" type="button" class="bmi-btn small" @click="resetHistory">
            {{ t('tools.bmi-calculator.texts.btn-clear') }}
          </button>
        </div>
        <table v-if="history.length">
          <thead>
            <tr>
              <th>#</th>
              <th>{{ t('tools.bmi-calculator.texts.th-date') }}</th>
              <th>{{ t('tools.bmi-calculator.texts.th-height') }}</th>
              <th>{{ t('tools.bmi-calculator.texts.th-weight') }}</th>
              <th>{{ t('tools.bmi-calculator.texts.th-bmi') }}</th>
              <th>{{ t('tools.bmi-calculator.texts.th-category') }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(e, i) in history" :key="e.id">
              <td>{{ history.length - i }}</td>
              <td>{{ e.date }}</td>
              <td>{{ e.height }} {{ e.unit === 'metric' ? t('tools.bmi-calculator.texts.unit-cm') : t('tools.bmi-calculator.texts.unit-in') }}</td>
              <td>{{ e.weight }} {{ e.unit === 'metric' ? t('tools.bmi-calculator.texts.unit-kg') : t('tools.bmi-calculator.texts.unit-lb') }}</td>
              <td>{{ e.bmi }}</td>
              <td>{{ e.category }}</td>
              <td><button type="button" class="bmi-del" @click="removeHistory(e.id)">{{ t('tools.bmi-calculator.texts.btn-delete') }}</button></td>
            </tr>
          </tbody>
        </table>
        <p v-else class="bmi-hint">{{ t('tools.bmi-calculator.texts.history-empty') }}</p>
      </div>
    </div>
  </c-card>
</template>

<style scoped lang="less">
.bmi {
  --bmi-accent: #3b82f6;
  --bmi-ok: #16a34a;
  --bmi-warn: #dc2626;
  --bmi-ink: #1f2937;
  --bmi-muted: #6b7280;
  --bmi-line: var(--n-border-color, #e5e7eb);
  --bmi-surface: var(--n-color-card, #fff);
  --bmi-soft: var(--n-color-table-header, #f1f5f9);

  color: var(--bmi-ink);
}

/* ---------------------------------------------------------------- 输入 */
.bmi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}

.bmi-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bmi-label {
  font-size: 13px;
  color: var(--bmi-muted);
}

.bmi-suffix-wrap {
  position: relative;
  display: flex;
  align-items: center;

  .bmi-input {
    padding-right: 40px;
  }
}

.bmi-suffix {
  position: absolute;
  right: 12px;
  font-size: 13px;
  color: var(--bmi-muted);
  pointer-events: none;
}

.bmi-input {
  width: 100%;
  padding: 9px 12px;
  font-size: 14px;
  color: var(--bmi-ink);
  background: var(--bmi-surface);
  border: 1px solid var(--bmi-line);
  border-radius: 8px;

  &:focus {
    outline: none;
    border-color: var(--bmi-accent);
  }
}

.bmi-select {
  cursor: pointer;
}

/* ---------------------------------------------------------------- 按钮 */
.bmi-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
}

.bmi-btn {
  padding: 8px 18px;
  font-size: 14px;
  color: var(--bmi-ink);
  background: var(--bmi-surface);
  border: 1px solid var(--bmi-line);
  border-radius: 8px;
  cursor: pointer;

  &.primary {
    color: #fff;
    background: var(--bmi-accent);
    border-color: var(--bmi-accent);
  }

  &.small {
    padding: 5px 12px;
    font-size: 13px;
  }

  &:hover {
    border-color: var(--bmi-accent);
  }
}

.bmi-save {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--bmi-muted);
  cursor: pointer;
}

/* ---------------------------------------------------------------- 结果 */
.bmi-result {
  padding: 14px 16px;
  margin-bottom: 14px;
  border-radius: 10px;
  border: 1px solid;

  &.ok {
    background: rgb(22 163 74 / 6%);
    border-color: rgb(22 163 74 / 30%);
  }

  &.warn {
    background: rgb(220 38 38 / 6%);
    border-color: rgb(220 38 38 / 30%);
  }
}

.bmi-result-line {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 3px 0;

  .bmi-result-k {
    flex-shrink: 0;
    font-size: 13px;
    color: var(--bmi-muted);
  }

  .bmi-result-v {
    font-size: 20px;
    font-weight: 700;
  }
}

.bmi-result .ok .bmi-result-v {
  color: var(--bmi-ok);
}

.bmi-result.warn .bmi-result-v {
  color: var(--bmi-warn);
}

/* ---------------------------------------------------------------- 提示 */
.bmi-hint {
  padding: 16px;
  font-size: 13px;
  color: var(--bmi-muted);
  text-align: center;
  background: var(--bmi-soft);
  border-radius: 10px;
}

/* ---------------------------------------------------------------- 表格 */
.bmi-table,
.bmi-history {
  margin-top: 14px;
}

.bmi-table-title {
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 700;
}

.bmi-history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;

  th,
  td {
    padding: 7px 10px;
    text-align: left;
    border-bottom: 1px solid var(--bmi-line);
  }

  th {
    color: var(--bmi-muted);
    font-weight: 600;
    background: var(--bmi-soft);
  }
}

.bmi-del {
  padding: 3px 8px;
  font-size: 12px;
  color: var(--bmi-warn);
  background: none;
  border: 1px solid var(--bmi-line);
  border-radius: 6px;
  cursor: pointer;

  &:hover {
    border-color: var(--bmi-warn);
  }
}
</style>
