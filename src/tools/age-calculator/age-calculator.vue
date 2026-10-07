<script setup lang="ts">
/**
 * 年龄计算器。
 *
 * 行为规格来自参考站 https://gjupai.com/tools/age_calculator 的生产 JS chunk，
 * 逐条公式见 `_recon/age-calculator/BEHAVIOR.md`，实现全在 age-calculator.service.ts。
 * 这里**不做二次计算** —— 静态 HTML 与运行时算出两个样就是 cloaking（AdSense 封号级）。
 *
 * 参考站那层产品壳（295 个工具入口、商城导航、AI 助手浮窗、商品推荐）一概不搬，
 * 只做这一个工具卡本体，样式沿用本站 naive-ui 主题变量（自动跟随深浅色）。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import ToolExampleButton from '@/components/ToolExampleButton.vue';
import { useCopy } from '@/composable/copy';
import {
  calcAgeResult,
  buildCopyText,
  DEFAULT_LIFE_EXPECTANCY,
  type AgeBreakdown,
} from './age-calculator.service';

const { t } = useI18n();
const { copy } = useCopy();

/* ---------------------------------------------------------------- 输入状态 */

// 约定：每个工具都要有 exampleData + 「一键示例」按钮，空输入框是跳出率最高的形态。
// 选 12-25 是因为它能同时演示：周岁拆解、倒计时、以及「未来生日」从今年起列。
const exampleData = {
  birthDate: '1990-12-25',
  birthTime: '08:30',
  lifeExpectancy: 80,
};

const birthDate = ref('');
const birthTime = ref('00:00');
const lifeExpectancy = ref<number>(DEFAULT_LIFE_EXPECTANCY);

/** 当前时刻，每秒刷新一次 —— 倒计时和「已生活 X 秒」要跟着走 */
const now = ref(new Date());
let timer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  timer = setInterval(() => {
    now.value = new Date();
  }, 1000);
});
onBeforeUnmount(() => {
  if (timer) {
    clearInterval(timer);
  }
});

const todayIso = computed(() => {
  const d = now.value;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
});

/* ---------------------------------------------------------------- 计算结果 */

const result = computed(() =>
  calcAgeResult(birthDate.value, birthTime.value, now.value, lifeExpectancy.value),
);

/** 出生日期晚于当前时间 */
const isFutureBirth = computed(() => {
  if (!birthDate.value) {
    return false;
  }
  const parsed = new Date(`${birthDate.value}T${birthTime.value || '00:00'}`);
  return !Number.isNaN(parsed.getTime()) && parsed > now.value;
});

const hasResult = computed(() => Boolean(result.value.age) && !isFutureBirth.value);

const fmt = (n: number) => n.toLocaleString('zh-CN');

const copyText = computed(() => {
  const r = result.value;
  if (!hasResult.value || !r.age) {
    return '';
  }
  return buildCopyText({
    birthDate: birthDate.value,
    birthTime: birthTime.value,
    age: r.age as AgeBreakdown,
    nominalAge: r.nominalAge,
    constellation: r.constellation,
    zodiac: r.zodiac,
    nextBirthday: r.nextBirthday,
  });
});

function copyResult() {
  if (copyText.value) {
    copy(copyText.value);
  }
}

function loadExample() {
  birthDate.value = exampleData.birthDate;
  birthTime.value = exampleData.birthTime;
  lifeExpectancy.value = exampleData.lifeExpectancy;
}

function resetAll() {
  birthDate.value = '';
  birthTime.value = '00:00';
  lifeExpectancy.value = DEFAULT_LIFE_EXPECTANCY;
}
</script>

<template>
  <c-card :title="t('tools.age-calculator.title')" max-w-800px>
    <div class="ag">
      <!-- ============================== 输入区 ============================== -->
      <div class="ag-row3">
        <label class="ag-field">
          <span class="ag-field-label">{{ t('tools.age-calculator.texts.label-birth-date') }}</span>
          <input v-model="birthDate" class="ag-input" type="date" :max="todayIso" />
        </label>

        <label class="ag-field">
          <span class="ag-field-label">{{ t('tools.age-calculator.texts.label-birth-time') }}</span>
          <input v-model="birthTime" class="ag-input" type="time" />
        </label>

        <label class="ag-field">
          <span class="ag-field-label">{{ t('tools.age-calculator.texts.label-life-expectancy') }}</span>
          <span class="ag-suffix-wrap">
            <input v-model.number="lifeExpectancy" class="ag-input" type="number" min="1" max="150" />
            <span class="ag-suffix">{{ t('tools.age-calculator.texts.unit-year') }}</span>
          </span>
        </label>
      </div>

      <div class="ag-actions">
        <ToolExampleButton @click="loadExample" />
        <button type="button" class="ag-btn primary" :disabled="!hasResult" @click="copyResult">
          {{ t('tools.age-calculator.texts.btn-copy') }}
        </button>
        <button type="button" class="ag-btn" @click="resetAll">{{ t('tools.age-calculator.texts.btn-reset') }}</button>
      </div>

      <!-- ============================== 提示 / 报错 ============================== -->
      <p v-if="isFutureBirth" class="ag-error">{{ t('tools.age-calculator.texts.err-future') }}</p>
      <p v-else-if="!hasResult" class="ag-hint">{{ t('tools.age-calculator.texts.hint-empty') }}</p>

      <!-- ============================== 结果区 ============================== -->
      <template v-else>
        <!-- 周岁大字 -->
        <div class="ag-hero">
          <span class="ag-hero-label">{{ t('tools.age-calculator.texts.label-age') }}</span>
          <span class="ag-hero-value">
            {{ result.age!.years }}<em>{{ t('tools.age-calculator.texts.unit-year') }}</em>
            {{ result.age!.months }}<em>{{ t('tools.age-calculator.texts.unit-month') }}</em>
            {{ result.age!.days }}<em>{{ t('tools.age-calculator.texts.unit-day') }}</em>
          </span>
        </div>

        <!-- 虚岁 / 星座 / 生肖 -->
        <div class="ag-tags">
          <span class="ag-tag">
            <span class="ag-tag-k">{{ t('tools.age-calculator.texts.label-nominal-age') }}</span>
            <span class="ag-tag-v">{{ result.nominalAge }} {{ t('tools.age-calculator.texts.unit-year') }}</span>
          </span>
          <span class="ag-tag">
            <span class="ag-tag-k">{{ t('tools.age-calculator.texts.label-constellation') }}</span>
            <span class="ag-tag-v">{{ result.constellation }}</span>
          </span>
          <span class="ag-tag">
            <span class="ag-tag-k">{{ t('tools.age-calculator.texts.label-zodiac') }}</span>
            <span class="ag-tag-v">{{ result.zodiac }}</span>
          </span>
        </div>

        <!-- 已生活 -->
        <p class="ag-line-muted">
          {{ t('tools.age-calculator.texts.label-lived') }}
          <b>{{ fmt(result.age!.totalDays) }}</b> {{ t('tools.age-calculator.texts.unit-day') }}
          <b>{{ result.age!.totalHours % 24 }}</b> {{ t('tools.age-calculator.texts.unit-hour') }}
          <b>{{ result.age!.totalMinutes % 60 }}</b> {{ t('tools.age-calculator.texts.unit-minute') }}
          <b>{{ result.age!.totalSeconds % 60 }}</b> {{ t('tools.age-calculator.texts.unit-second') }}
        </p>

        <!-- 下一个生日倒计时 -->
        <div v-if="result.nextBirthday" class="ag-panel">
          <div class="ag-panel-head">
            <span>{{ t('tools.age-calculator.texts.label-next-birthday') }}</span>
            <span class="ag-panel-date">{{ result.nextBirthday.date }}</span>
          </div>
          <div class="ag-countdown">
            <span class="ag-cd"><b>{{ result.nextBirthday.days }}</b>{{ t('tools.age-calculator.texts.unit-day') }}</span>
            <span class="ag-cd"><b>{{ result.nextBirthday.hours }}</b>{{ t('tools.age-calculator.texts.unit-hour') }}</span>
            <span class="ag-cd"><b>{{ result.nextBirthday.minutes }}</b>{{ t('tools.age-calculator.texts.unit-minute') }}</span>
            <span class="ag-cd"><b>{{ result.nextBirthday.seconds }}</b>{{ t('tools.age-calculator.texts.unit-second') }}</span>
          </div>
        </div>

        <!-- 生命进度 -->
        <div v-if="result.extras" class="ag-panel">
          <div class="ag-panel-head">
            <span>{{ t('tools.age-calculator.texts.label-life-progress') }}</span>
            <span class="ag-accent">{{ result.extras.lifeProgress.toFixed(2) }}%</span>
          </div>
          <div class="ag-bar">
            <div class="ag-bar-fill" :style="{ width: `${result.extras.lifeProgress}%` }" />
          </div>
          <p class="ag-line-muted">
            {{ t('tools.age-calculator.texts.life-progress-note', { years: lifeExpectancy, days: fmt(result.age!.totalDays), weeks: fmt(result.extras.totalWeeks) }) }}
          </p>
        </div>

        <!-- 四宫格 -->
        <div v-if="result.extras" class="ag-grid4">
          <div class="ag-cell">
            <span class="ag-cell-k">{{ t('tools.age-calculator.texts.label-birth-weekday') }}</span>
            <span class="ag-cell-v">{{ result.extras.birthWeekday }}</span>
          </div>
          <div class="ag-cell">
            <span class="ag-cell-k">{{ t('tools.age-calculator.texts.label-next-birthday-weekday') }}</span>
            <span class="ag-cell-v">{{ result.extras.nextBirthdayWeekday }}</span>
          </div>
          <div class="ag-cell">
            <span class="ag-cell-k">{{ t('tools.age-calculator.texts.label-birthstone') }}</span>
            <span class="ag-cell-v">{{ result.extras.birthstone }}</span>
          </div>
          <div class="ag-cell">
            <span class="ag-cell-k">{{ t('tools.age-calculator.texts.label-generation') }}</span>
            <span class="ag-cell-v">{{ result.extras.generation }}</span>
          </div>
        </div>

        <div class="ag-grid2">
          <!-- 趣味数据 -->
          <div v-if="result.extras" class="ag-panel">
            <h3 class="ag-panel-title">{{ t('tools.age-calculator.texts.title-fun') }}</h3>
            <ul class="ag-list">
              <li><span>{{ t('tools.age-calculator.texts.label-heartbeats') }}</span><span>{{ fmt(result.extras.heartbeats) }} {{ t('tools.age-calculator.texts.unit-times') }}</span></li>
              <li><span>{{ t('tools.age-calculator.texts.label-breaths') }}</span><span>{{ fmt(result.extras.breaths) }} {{ t('tools.age-calculator.texts.unit-times') }}</span></li>
              <li><span>{{ t('tools.age-calculator.texts.label-sleep') }}</span><span>{{ fmt(result.extras.sleepHours) }} {{ t('tools.age-calculator.texts.unit-hour') }}</span></li>
              <li><span>{{ t('tools.age-calculator.texts.label-half-birthday') }}</span><span>{{ result.extras.halfBirthday }}</span></li>
            </ul>
          </div>

          <!-- 时间换算 -->
          <div v-if="result.age" class="ag-panel">
            <h3 class="ag-panel-title">{{ t('tools.age-calculator.texts.title-conversion') }}</h3>
            <ul class="ag-list">
              <li><span>{{ t('tools.age-calculator.texts.label-total-years') }}</span><span>{{ result.age.years }} {{ t('tools.age-calculator.texts.unit-year') }}</span></li>
              <li><span>{{ t('tools.age-calculator.texts.label-total-months') }}</span><span>{{ fmt(12 * result.age.years + result.age.months) }} {{ t('tools.age-calculator.texts.unit-month') }}</span></li>
              <li><span>{{ t('tools.age-calculator.texts.label-total-weeks') }}</span><span>{{ fmt(result.extras!.totalWeeks) }} {{ t('tools.age-calculator.texts.unit-week') }}</span></li>
              <li><span>{{ t('tools.age-calculator.texts.label-total-seconds') }}</span><span>{{ fmt(result.age.totalSeconds) }} {{ t('tools.age-calculator.texts.unit-second') }}</span></li>
            </ul>
          </div>

          <!-- 未来生日 -->
          <div class="ag-panel">
            <h3 class="ag-panel-title">{{ t('tools.age-calculator.texts.title-future-birthdays') }}</h3>
            <ul v-if="result.futureBirthdays.length" class="ag-list">
              <li v-for="fb in result.futureBirthdays" :key="fb.year">
                <span>{{ fb.date }}</span>
                <span>{{ t('tools.age-calculator.texts.turning', { age: fb.ageTurning }) }}</span>
              </li>
            </ul>
            <p v-else class="ag-line-muted">{{ t('tools.age-calculator.texts.milestones-done') }}</p>
          </div>

          <!-- 重要年龄节点 -->
          <div class="ag-panel">
            <h3 class="ag-panel-title">{{ t('tools.age-calculator.texts.title-milestones') }}</h3>
            <ul v-if="result.milestones.length" class="ag-list">
              <li v-for="ms in result.milestones" :key="ms.age">
                <span>{{ t('tools.age-calculator.texts.milestone-age', { age: ms.age }) }}</span>
                <span>{{ ms.date }}</span>
              </li>
            </ul>
            <p v-else class="ag-line-muted">{{ t('tools.age-calculator.texts.milestones-done') }}</p>
          </div>
        </div>
      </template>
    </div>
  </c-card>
</template>

<style scoped lang="less">
.ag {
  --ag-accent: #3b82f6;
  --ag-ink: #1f2937;
  --ag-muted: #6b7280;
  --ag-line: var(--n-border-color, #e5e7eb);
  --ag-surface: var(--n-color-card, #fff);
  --ag-soft: var(--n-color-table-header, #f1f5f9);

  color: var(--ag-ink);
}

/* ---------------------------------------------------------------- 输入 */

.ag-row3 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}

.ag-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ag-field-label {
  font-size: 13px;
  color: var(--ag-muted);
}

.ag-suffix-wrap {
  position: relative;
  display: flex;
  align-items: center;

  .ag-input {
    padding-right: 34px;
  }
}

.ag-suffix {
  position: absolute;
  right: 12px;
  font-size: 13px;
  color: var(--ag-muted);
  pointer-events: none;
}

.ag-input {
  width: 100%;
  padding: 9px 12px;
  font-size: 14px;
  color: var(--ag-ink);
  background: var(--ag-surface);
  border: 1px solid var(--ag-line);
  border-radius: 8px;

  &:focus {
    outline: none;
    border-color: var(--ag-accent);
  }
}

/* ---------------------------------------------------------------- 按钮 */

.ag-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}

.ag-btn {
  padding: 8px 18px;
  font-size: 14px;
  color: var(--ag-ink);
  background: var(--ag-surface);
  border: 1px solid var(--ag-line);
  border-radius: 8px;
  cursor: pointer;

  &.primary {
    color: #fff;
    background: var(--ag-accent);
    border-color: var(--ag-accent);
  }

  &:hover {
    border-color: var(--ag-accent);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

/* ---------------------------------------------------------------- 提示 */

.ag-hint {
  padding: 20px;
  font-size: 14px;
  color: var(--ag-muted);
  text-align: center;
  background: var(--ag-soft);
  border-radius: 10px;
}

.ag-error {
  padding: 10px 14px;
  font-size: 14px;
  color: #b91c1c;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
}

/* ---------------------------------------------------------------- 周岁大字 */

.ag-hero {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px 18px;
  margin-bottom: 14px;
  background: linear-gradient(135deg, rgb(59 130 246 / 8%), rgb(99 102 241 / 8%));
  border: 1px solid rgb(59 130 246 / 18%);
  border-radius: 12px;
}

.ag-hero-label {
  font-size: 13px;
  color: var(--ag-muted);
}

.ag-hero-value {
  font-size: 26px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--ag-accent);

  em {
    font-size: 14px;
    font-style: normal;
    font-weight: 500;
    color: var(--ag-muted);
    margin-right: 6px;
  }
}

/* ---------------------------------------------------------------- 标签组 */

.ag-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.ag-tag {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  padding: 7px 12px;
  font-size: 13px;
  background: var(--ag-soft);
  border-radius: 999px;
}

.ag-tag-k {
  color: var(--ag-muted);
}

.ag-tag-v {
  font-weight: 600;
}

.ag-line-muted {
  margin: 0 0 14px;
  font-size: 13px;
  color: var(--ag-muted);

  b {
    font-weight: 600;
    color: var(--ag-ink);
  }
}

/* ---------------------------------------------------------------- 面板 */

.ag-panel {
  padding: 14px 16px;
  margin-bottom: 12px;
  background: var(--ag-surface);
  border: 1px solid var(--ag-line);
  border-radius: 10px;
}

.ag-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  font-size: 14px;
  font-weight: 600;
}

.ag-panel-date {
  font-weight: 400;
  color: var(--ag-muted);
}

.ag-accent {
  color: var(--ag-accent);
}

.ag-panel-title {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 700;
}

.ag-list {
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 0;
    font-size: 13px;
    color: var(--ag-muted);

    span:last-child {
      font-weight: 600;
      color: var(--ag-ink);
    }
  }
}

/* ---------------------------------------------------------------- 倒计时 */

.ag-countdown {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ag-cd {
  flex: 1;
  min-width: 62px;
  padding: 8px 4px;
  font-size: 12px;
  color: var(--ag-muted);
  text-align: center;
  background: var(--ag-soft);
  border-radius: 8px;

  b {
    display: block;
    font-size: 18px;
    color: var(--ag-accent);
  }
}

/* ---------------------------------------------------------------- 进度条 */

.ag-bar {
  height: 10px;
  overflow: hidden;
  background: var(--ag-soft);
  border-radius: 999px;
}

.ag-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #6366f1);
  border-radius: 999px;
  transition: width 0.5s;
}

/* ---------------------------------------------------------------- 宫格 */

.ag-grid4 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}

.ag-cell {
  padding: 12px 8px;
  text-align: center;
  background: var(--ag-surface);
  border: 1px solid var(--ag-line);
  border-radius: 10px;
}

.ag-cell-k {
  display: block;
  font-size: 12px;
  color: var(--ag-muted);
}

.ag-cell-v {
  display: block;
  margin-top: 4px;
  font-size: 16px;
  font-weight: 700;
}

.ag-grid2 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}
</style>
