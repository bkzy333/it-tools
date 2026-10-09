<script setup lang="ts">
/**
 * BMI 计算器。
 *
 * 行为规格来自两个参考站的生产行为（运行时 dump）：
 * - BMI 四种标准阈值：https://cn.onlinebmicalculator.com/（服务端计算，POST 逐点探测）
 * - BMR/TDEE/理想体重/仪表盘/滑块交互：https://www.ggbom.cn/tools/bmi（inline JS，SOURCE 级）
 * 逐条公式见 `_recon-bmi/`、`_recon-ggbom/` 与 bmi-calculator.service.ts。
 * 这里**不做二次计算** —— 静态 HTML 与运行时算出两个样就是 cloaking（AdSense 封号级）。
 *
 * 参考站的产品壳（语言切换、导航、广告、统计脚本）一概不搬，只做工具卡本体。
 * 融合后的能力：性别 + 年龄/身高/体重（滑块 + 数字框双联动，数字框支持滚轮微调）
 * + 活动强度 + 四种 BMI 标准 + BMI 仪表盘 + 理想体重 + BMR/TDEE + 三档饮食建议 + 历史记录。
 */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import ToolExampleButton from '@/components/ToolExampleButton.vue';
import { useCopy } from '@/composable/copy';
import {
  calcBmi,
  classifyBmi,
  healthyWeightRange,
  calcBmr,
  calcTdee,
  calcDietAdvice,
  calcIdealWeightRange,
  calcGaugePercent,
  loadHistory,
  saveHistory,
  deleteHistory,
  clearHistory,
  STANDARDS,
  ACTIVITY_LEVELS,
  type UnitSystem,
  type BmiStandard,
  type BmiHistoryEntry,
  type BmiCategoryDef,
  type Gender,
} from './bmi-calculator.service';

const { t } = useI18n();
const { copy } = useCopy();

/* ---------------------------------------------------------------- 输入状态 */

// 示例选 65kg/170cm/25岁 男，能跑出中国标准「正常」+ BMR/TDEE 的典型结果。
const exampleData = {
  gender: 'male' as Gender,
  age: 25,
  height: 170,
  weight: 65,
  activity: 1.2,
  unit: 'metric' as UnitSystem,
  standard: 'chinese' as BmiStandard,
};

const unit = ref<UnitSystem>('metric');
const standard = ref<BmiStandard>('chinese');
const gender = ref<Gender>('male');
const age = ref<number>(25);
const height = ref<number>(170);
const weight = ref<number>(65);
const activity = ref<number>(1.2);
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

const activityOptions = computed(() =>
  ACTIVITY_LEVELS.map((a) => ({ label: a.label, value: a.value })),
);

/** 滑块范围：随单位制切换（公制 cm/kg，英制 in/lb） */
const heightRange = computed(() => (unit.value === 'metric' ? { min: 100, max: 220 } : { min: 39, max: 87 }));
const weightRange = computed(() => (unit.value === 'metric' ? { min: 30, max: 150 } : { min: 66, max: 331 }));

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

/** 理想体重区间（固定中国标准 18.5~23.9，代谢分析语境） */
const idealRange = computed(() => {
  if (unit.value !== 'metric') {
    return null;
  }
  return calcIdealWeightRange(height.value);
});

/** 仪表盘指针位置 0~100（%） */
const gaugePercent = computed(() => (bmi.value === null ? 0 : calcGaugePercent(bmi.value)));

/** 仪表盘分段颜色：偏瘦蓝/正常绿/过重橙/肥胖红（参考站配色） */
const gaugeColor = computed(() => {
  const b = bmi.value ?? 0;
  if (b < 18.5) return '#3b82f6';
  if (b < 24.0) return '#10b981';
  if (b < 28.0) return '#f59e0b';
  return '#ef4444';
});

/** 代谢分析（BMR/TDEE/饮食建议）：统一用公制 kg/cm 计算 */
const metricWeightKg = computed(() => (unit.value === 'metric' ? weight.value : weight.value * 0.45359237));
const metricHeightCm = computed(() => (unit.value === 'metric' ? height.value : height.value * 2.54));

const bmr = computed(() => calcBmr(metricWeightKg.value, metricHeightCm.value, age.value, gender.value));
const tdee = computed(() => (bmr.value === null ? null : calcTdee(bmr.value, activity.value)));
const diet = computed(() => (bmr.value !== null && tdee.value !== null ? calcDietAdvice(bmr.value, tdee.value) : null));

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
  if (bmi.value === null || !category.value) {
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
  gender.value = exampleData.gender;
  age.value = exampleData.age;
  height.value = exampleData.height;
  weight.value = exampleData.weight;
  activity.value = exampleData.activity;
  unit.value = exampleData.unit;
  standard.value = exampleData.standard;
}

function copyResult() {
  if (bmi.value === null || !category.value) {
    return;
  }
  const lines = [
    `${t('tools.bmi-calculator.texts.label-bmi')} ${bmi.value}（${category.value.label}）`,
  ];
  if (idealRange.value) {
    lines.push(`${t('tools.bmi-calculator.texts.label-ideal-weight')} ${idealRange.value.minKg} ~ ${idealRange.value.maxKg} kg`);
  }
  if (bmr.value !== null) {
    lines.push(`${t('tools.bmi-calculator.texts.label-bmr')} ${bmr.value} kcal/天`);
  }
  if (tdee.value !== null) {
    lines.push(`${t('tools.bmi-calculator.texts.label-tdee')} ${tdee.value} kcal/天`);
  }
  if (diet.value) {
    lines.push(`${t('tools.bmi-calculator.texts.diet-lose')} ${diet.value.lose} kcal`);
    lines.push(`${t('tools.bmi-calculator.texts.diet-maintain')} ${diet.value.maintain} kcal`);
    lines.push(`${t('tools.bmi-calculator.texts.diet-gain')} ${diet.value.gain} kcal`);
  }
  copy(lines.join('\n'));
}
</script>

<template>
  <c-card :title="t('tools.bmi-calculator.title')" max-w-800px>
    <div class="bmi">
      <!-- ============================== 输入区 ============================== -->
      <div class="bmi-section">
        <div class="bmi-section-title">{{ t('tools.bmi-calculator.texts.title-input') }}</div>

        <!-- 性别 -->
        <div class="bmi-field">
          <span class="bmi-label">{{ t('tools.bmi-calculator.texts.label-gender') }}</span>
          <div class="bmi-gender">
            <button type="button" class="bmi-gender-btn" :class="{ active: gender === 'male' }" @click="gender = 'male'">
              {{ t('tools.bmi-calculator.texts.gender-male') }}
            </button>
            <button type="button" class="bmi-gender-btn" :class="{ active: gender === 'female' }" @click="gender = 'female'">
              {{ t('tools.bmi-calculator.texts.gender-female') }}
            </button>
          </div>
        </div>

        <!-- 年龄：滑块 + 数字框双联动，数字框支持滚轮微调 -->
        <div class="bmi-field">
          <span class="bmi-label">{{ t('tools.bmi-calculator.texts.label-age') }}</span>
          <div class="bmi-slider-row">
            <input v-model.number="age" class="bmi-range" type="range" min="10" max="80" />
            <input v-model.number="age" class="bmi-input bmi-num" type="number" min="10" max="80" />
            <span class="bmi-suffix-static">{{ t('tools.bmi-calculator.texts.unit-year') }}</span>
          </div>
        </div>

        <!-- 身高 -->
        <div class="bmi-field">
          <span class="bmi-label">{{ t('tools.bmi-calculator.texts.label-height') }}</span>
          <div class="bmi-slider-row">
            <input v-model.number="height" class="bmi-range" type="range" :min="heightRange.min" :max="heightRange.max" />
            <input v-model.number="height" class="bmi-input bmi-num" type="number" :min="heightRange.min" :max="heightRange.max" />
            <span class="bmi-suffix-static">{{ heightUnit }}</span>
          </div>
        </div>

        <!-- 体重 -->
        <div class="bmi-field">
          <span class="bmi-label">{{ t('tools.bmi-calculator.texts.label-weight') }}</span>
          <div class="bmi-slider-row">
            <input v-model.number="weight" class="bmi-range" type="range" :min="weightRange.min" :max="weightRange.max" />
            <input v-model.number="weight" class="bmi-input bmi-num" type="number" :min="weightRange.min" :max="weightRange.max" />
            <span class="bmi-suffix-static">{{ weightUnit }}</span>
          </div>
        </div>

        <!-- 活动强度 -->
        <div class="bmi-field">
          <span class="bmi-label">{{ t('tools.bmi-calculator.texts.label-activity') }}</span>
          <select v-model.number="activity" class="bmi-input bmi-select">
            <option v-for="o in activityOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </div>

        <!-- 单位制 + 标准 -->
        <div class="bmi-grid2">
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
          <button type="button" class="bmi-btn primary" @click="copyResult">{{ t('tools.bmi-calculator.texts.btn-copy') }}</button>
        </div>
      </div>

      <!-- ============================== BMI 仪表盘 ============================== -->
      <div v-if="bmi !== null && category" class="bmi-section">
        <div class="bmi-section-title">{{ t('tools.bmi-calculator.texts.title-bmi') }}</div>
        <div class="bmi-score">
          <span class="bmi-score-val">{{ bmi }}</span>
          <span class="bmi-badge" :style="{ background: gaugeColor }">{{ category.label }}</span>
        </div>
        <div class="bmi-gauge">
          <div class="bmi-gauge-track">
            <div class="bmi-seg seg-under" />
            <div class="bmi-seg seg-normal" />
            <div class="bmi-seg seg-over" />
            <div class="bmi-seg seg-obese" />
            <div class="bmi-needle" :style="{ left: `${gaugePercent}%`, background: gaugeColor }" />
          </div>
          <div class="bmi-gauge-labels">
            <span>18.5</span>
            <span>24.0</span>
            <span>28.0</span>
          </div>
        </div>
        <div v-if="idealRange" class="bmi-line">
          <span class="bmi-line-k">{{ t('tools.bmi-calculator.texts.label-ideal-weight') }}</span>
          <span class="bmi-line-v">{{ idealRange.minKg }} ~ {{ idealRange.maxKg }} kg</span>
        </div>
        <div v-if="healthyRange" class="bmi-line">
          <span class="bmi-line-k">{{ t('tools.bmi-calculator.texts.label-healthy-range') }}（{{ standardOptions.find((o) => o.value === standard)?.label }}）</span>
          <span class="bmi-line-v">{{ healthyRange.minKg }} ~ {{ healthyRange.maxKg }} kg</span>
        </div>
      </div>

      <!-- ============================== 代谢分析 ============================== -->
      <div v-if="bmr !== null && tdee !== null" class="bmi-section">
        <div class="bmi-section-title">{{ t('tools.bmi-calculator.texts.title-metabolism') }}</div>
        <div class="bmi-cards2">
          <div class="bmi-metro-card">
            <div class="bmi-metro-k">{{ t('tools.bmi-calculator.texts.label-bmr') }}</div>
            <div class="bmi-metro-v">{{ bmr }}<em> kcal/天</em></div>
            <div class="bmi-metro-d">{{ t('tools.bmi-calculator.texts.bmr-desc') }}</div>
          </div>
          <div class="bmi-metro-card">
            <div class="bmi-metro-k">{{ t('tools.bmi-calculator.texts.label-tdee') }}</div>
            <div class="bmi-metro-v">{{ tdee }}<em> kcal/天</em></div>
            <div class="bmi-metro-d">{{ t('tools.bmi-calculator.texts.tdee-desc') }}</div>
          </div>
        </div>

        <div v-if="diet" class="bmi-diet">
          <div class="bmi-diet-card diet-lose">
            <div class="bmi-diet-k">🔥 {{ t('tools.bmi-calculator.texts.diet-lose') }}</div>
            <div class="bmi-diet-v">{{ diet.lose }}<em> kcal</em></div>
            <div class="bmi-diet-d">{{ t('tools.bmi-calculator.texts.diet-lose-desc') }}</div>
          </div>
          <div class="bmi-diet-card diet-maintain">
            <div class="bmi-diet-k">⚖️ {{ t('tools.bmi-calculator.texts.diet-maintain') }}</div>
            <div class="bmi-diet-v">{{ diet.maintain }}<em> kcal</em></div>
            <div class="bmi-diet-d">{{ t('tools.bmi-calculator.texts.diet-maintain-desc') }}</div>
          </div>
          <div class="bmi-diet-card diet-gain">
            <div class="bmi-diet-k">💪 {{ t('tools.bmi-calculator.texts.diet-gain') }}</div>
            <div class="bmi-diet-v">{{ diet.gain }}<em> kcal</em></div>
            <div class="bmi-diet-d">{{ t('tools.bmi-calculator.texts.diet-gain-desc') }}</div>
          </div>
        </div>

        <div class="bmi-actions">
          <label v-if="autoSave" class="bmi-save">
            <input v-model="autoSave" type="checkbox" />
            <span>{{ t('tools.bmi-calculator.texts.label-autosave') }}</span>
          </label>
          <button type="button" class="bmi-btn small" @click="addHistory">{{ t('tools.bmi-calculator.texts.btn-save') }}</button>
        </div>
      </div>

      <!-- ============================== 标准对照表 ============================== -->
      <div class="bmi-section">
        <div class="bmi-section-title">{{ t('tools.bmi-calculator.texts.title-standard-table') }}（{{ standardOptions.find((o) => o.value === standard)?.label }}）</div>
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
      <div class="bmi-section">
        <div class="bmi-history-head">
          <span class="bmi-section-title">{{ t('tools.bmi-calculator.texts.title-history') }}</span>
          <button v-if="history.length" type="button" class="bmi-btn small" @click="resetHistory">{{ t('tools.bmi-calculator.texts.btn-clear') }}</button>
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
  --bmi-ok: #10b981;
  --bmi-warn: #ef4444;
  --bmi-ink: #1f2937;
  --bmi-muted: #6b7280;
  --bmi-line: var(--n-border-color, #e5e7eb);
  --bmi-surface: var(--n-color-card, #fff);
  --bmi-soft: var(--n-color-table-header, #f1f5f9);

  color: var(--bmi-ink);
}

.bmi-section {
  margin-bottom: 20px;

  &:last-child {
    margin-bottom: 0;
  }
}

.bmi-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 15px;
  font-weight: 700;

  &::before {
    content: '';
    width: 3px;
    height: 15px;
    border-radius: 1px;
    background: var(--bmi-accent);
  }
}

/* ---------------------------------------------------------------- 输入 */
.bmi-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}

.bmi-label {
  font-size: 13px;
  color: var(--bmi-muted);
}

.bmi-gender {
  display: flex;
  gap: 8px;
}

.bmi-gender-btn {
  flex: 1;
  padding: 9px 12px;
  font-size: 14px;
  color: var(--bmi-ink);
  background: var(--bmi-surface);
  border: 1px solid var(--bmi-line);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;

  &.active {
    color: #fff;
    background: var(--bmi-accent);
    border-color: var(--bmi-accent);
  }

  &:hover:not(.active) {
    border-color: var(--bmi-accent);
  }
}

.bmi-slider-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.bmi-range {
  flex: 1;
  accent-color: var(--bmi-accent);
}

.bmi-num {
  width: 80px;
  text-align: center;
  font-family: inherit;
  font-size: 0.875rem;
}

.bmi-suffix-static {
  min-width: 20px;
  font-size: 13px;
  color: var(--bmi-muted);
}

.bmi-grid2 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;

  .bmi-field {
    margin-bottom: 0;
  }
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
  margin-top: 14px;
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

/* ---------------------------------------------------------------- BMI 仪表盘 */
.bmi-score {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.bmi-score-val {
  font-size: 48px;
  font-weight: 800;
  line-height: 1;
  color: var(--bmi-accent);
}

.bmi-badge {
  padding: 5px 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
}

.bmi-gauge {
  margin-bottom: 12px;
}

.bmi-gauge-track {
  position: relative;
  display: flex;
  height: 12px;
  overflow: visible;
  border-radius: 6px;
  margin-bottom: 8px;
}

.bmi-seg {
  height: 100%;
}

.seg-under {
  width: 17.5%;
  background: #3b82f6;
  border-radius: 6px 0 0 6px;
}

.seg-normal {
  width: 27.5%;
  background: #10b981;
}

.seg-over {
  width: 20%;
  background: #f59e0b;
}

.seg-obese {
  width: 35%;
  background: #ef4444;
  border-radius: 0 6px 6px 0;
}

.bmi-needle {
  position: absolute;
  top: -6px;
  width: 4px;
  height: 24px;
  border: 2px solid var(--bmi-surface);
  border-radius: 2px;
  box-shadow: 0 2px 4px rgb(0 0 0 / 30%);
  transform: translateX(-50%);
  transition: left 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.bmi-gauge-labels {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--bmi-muted);
}

/* ---------------------------------------------------------------- 通用行 */
.bmi-line {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 5px 0;

  .bmi-line-k {
    font-size: 13px;
    color: var(--bmi-muted);
  }

  .bmi-line-v {
    font-size: 16px;
    font-weight: 700;
  }
}

/* ---------------------------------------------------------------- 代谢卡 */
.bmi-cards2 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.bmi-metro-card {
  padding: 14px 16px;
  background: var(--bmi-surface);
  border: 1px solid var(--bmi-line);
  border-radius: 10px;
}

.bmi-metro-k {
  font-size: 13px;
  color: var(--bmi-muted);
}

.bmi-metro-v {
  margin: 4px 0;
  font-size: 28px;
  font-weight: 800;
  color: var(--bmi-accent);

  em {
    font-size: 13px;
    font-style: normal;
    font-weight: 500;
    color: var(--bmi-muted);
  }
}

.bmi-metro-d {
  font-size: 12px;
  color: var(--bmi-muted);
  line-height: 1.5;
}

/* ---------------------------------------------------------------- 饮食建议 */
.bmi-diet {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}

.bmi-diet-card {
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid;
}

.diet-lose {
  background: rgb(239 68 68 / 5%);
  border-color: rgb(239 68 68 / 25%);
}

.diet-maintain {
  background: rgb(16 185 129 / 5%);
  border-color: rgb(16 185 129 / 25%);
}

.diet-gain {
  background: rgb(59 130 246 / 5%);
  border-color: rgb(59 130 246 / 25%);
}

.bmi-diet-k {
  font-size: 14px;
  font-weight: 700;
}

.bmi-diet-v {
  margin: 6px 0;
  font-size: 24px;
  font-weight: 800;

  em {
    font-size: 13px;
    font-style: normal;
    font-weight: 500;
    color: var(--bmi-muted);
  }
}

.diet-lose .bmi-diet-v {
  color: #ef4444;
}

.diet-maintain .bmi-diet-v {
  color: #10b981;
}

.diet-gain .bmi-diet-v {
  color: #3b82f6;
}

.bmi-diet-d {
  font-size: 12px;
  color: var(--bmi-muted);
  line-height: 1.5;
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
.bmi-history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;

  .bmi-section-title {
    margin-bottom: 0;
  }
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
