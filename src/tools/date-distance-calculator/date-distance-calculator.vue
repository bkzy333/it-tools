<script setup lang="ts">
/**
 * 日期距离计算器 —— 三 Tab 工具卡（日期相差 / 日期推算 / 倒计时）。
 *
 * 视觉参照 gjupai.com/tools/date_distance_calculator 的工具卡本体：
 * 白卡 + 蓝主色、三 Tab 带下划线、结果区一行大字天数、下面两三个统计色块、
 * 再往下是起止日期（或目标日期）的信息框。原站那层产品壳（左侧 295 个工具入口、
 * 商城 / 内容中心导航、AI 助手浮窗、商品推荐、百度站长推送）一概不搬。
 *
 * 所有数字都来自 date-distance-calculator.service.ts 的纯函数，
 * 这里不做二次计算 —— 静态 HTML 与运行时一旦算出两个样，就是 cloaking（AdSense 封号级）。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { NSelect } from 'naive-ui';
import ToolExampleButton from '@/components/ToolExampleButton.vue';
import { useCopy } from '@/composable/copy';
import { todayIso } from '../china-holidays/holidays.data';
import {
  calcDate,
  countdownTo,
  dateInfo,
  diffDate,
  presetEvents,
  type CalcMode,
  type CalcOptions,
  type OffsetDirection,
  type OffsetUnit,
} from './date-distance-calculator.service';

/* ---------------------------------------------------------------- Tab 壳 */

type TabKey = 'diff' | 'calc' | 'countdown';
const tabs: { key: TabKey; label: string }[] = [
  { key: 'diff', label: '日期相差' },
  { key: 'calc', label: '日期推算' },
  { key: 'countdown', label: '倒计时' },
];
const tab = ref<TabKey>('diff');

/* ---------------------------------------------------------------- Tab 1：日期相差 */

const from = ref('2026-01-01');
const to = ref('2026-12-31');
const includeEndDay = ref(false);
const excludeHolidays = ref(false);

const diff = computed(() =>
  diffDate(from.value, to.value, {
    includeEndDay: includeEndDay.value,
    excludeHolidays: excludeHolidays.value,
  })
);
const infoFrom = computed(() => dateInfo(from.value));
const infoTo = computed(() => dateInfo(to.value));

const weeksText = (w: { count: number; restDays: number }) => `${w.count} 周零 ${w.restDays} 天`;
const monthsText = (m: { count: number; restDays: number }) =>
  `${m.count} 个月零 ${m.restDays} 天`;
const yearsText = (y: { count: number; months: number; restDays: number }) =>
  `${y.count} 年 ${y.months} 个月零 ${y.restDays} 天`;

const today = () => todayIso();
function fillToday() {
  from.value = today();
  to.value = today();
}
function swap() {
  const t = from.value;
  from.value = to.value;
  to.value = t;
}

/* ---------------------------------------------------------------- Tab 2：日期推算 */

const base = ref(today());
const offsetValue = ref(30);
const mode = ref<CalcMode>('natural');
const direction = ref<OffsetDirection>('forward');
const unit = ref<OffsetUnit>('day');
const calcExcludeHolidays = ref(false);

const unitOptions: { label: string; value: OffsetUnit }[] = [
  { label: '天', value: 'day' },
  { label: '周', value: 'week' },
  { label: '月', value: 'month' },
  { label: '年', value: 'year' },
];

const calcOffsets: { label: string; value: number; unit: OffsetUnit }[] = [
  { label: '+30 天', value: 30, unit: 'day' },
  { label: '+90 天', value: 90, unit: 'day' },
  { label: '+半年', value: 180, unit: 'day' },
  { label: '+1 年', value: 1, unit: 'year' },
];

function applyOffset(seed: { value: number; unit: OffsetUnit }) {
  offsetValue.value = seed.value;
  unit.value = seed.unit;
}

const calc = computed(() => {
  const options: CalcOptions = {
    value: offsetValue.value,
    unit: unit.value,
    direction: direction.value,
    mode: mode.value,
    excludeHolidays: calcExcludeHolidays.value,
  };
  return calcDate(base.value, options);
});

/* ---------------------------------------------------------------- Tab 3：倒计时 */

const target = ref('2026-12-31');
const eventName = ref('');
const now = ref(new Date());
let timer: number | undefined;

onMounted(() => {
  timer = window.setInterval(() => (now.value = new Date()), 1000);
});
onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer);
});

const countdown = computed(() => countdownTo(target.value, now.value));
const presets = computed(() => presetEvents(now.value));
function applyPreset(date: string) {
  target.value = date;
  eventName.value = '';
}

/* ---------------------------------------------------------------- 复制 / 分享 / 重置 */

const { copy } = useCopy();

function diffSummary(): string {
  const d = diff.value;
  if (!d) return '';
  const lines = [
    `日期相差：${from.value} 至 ${to.value}`,
    `相差天数：${d.days} 天`,
    `按周换算：${weeksText(d.weeks)}`,
    `按月换算：约 ${monthsText(d.months)}`,
    `按年换算：约 ${yearsText(d.years)}`,
    `时分秒：${d.hours} 小时 / ${d.minutes} 分钟 / ${d.seconds} 秒`,
    `工作日：${d.workdays} 天`,
    `周末：${d.weekends} 天`,
  ];
  if (excludeHolidays.value) lines.push(`法定节假日：${d.holidays} 天`);
  return lines.join('\n');
}

function calcSummary(): string {
  const c = calc.value;
  if (!c) return '';
  return [
    `日期推算：${base.value} ${direction.value === 'forward' ? '后推' : '前推'} ${offsetValue.value} ${unitOptions.find((u) => u.value === unit.value)?.label}`,
    `目标日期：${c.date}`,
    `星期：${c.info.weekdayCn}`,
    c.info.lunar ? `农历：${c.info.lunar}` : '',
    c.info.ganzhi ? `干支：${c.info.ganzhi}` : '',
    `与基准实际相差：${Math.abs(c.naturalDiff)} 个自然日`,
  ]
    .filter(Boolean)
    .join('\n');
}

function countdownSummary(): string {
  const c = countdown.value;
  if (!c) return '';
  const head = c.isToday
    ? `${c.target} 就是今天`
    : c.past
      ? `${c.target} 已经过去 ${c.days} 天`
      : `距离 ${c.target} 还有 ${c.days} 天`;
  return [
    head,
    `${c.weeks.count} 周零 ${c.weeks.restDays} 天`,
    `${c.hours} 小时 ${c.minutes} 分 ${c.seconds} 秒`,
  ].join('\n');
}

function summary(): string {
  if (tab.value === 'diff') return diffSummary();
  if (tab.value === 'calc') return calcSummary();
  return countdownSummary();
}

async function copyResult() {
  await copy(summary(), { notificationMessage: '结果已复制到剪贴板' });
}

function shareLink(): string {
  const params = new URLSearchParams();
  if (tab.value === 'diff') {
    params.set('tab', 'diff');
    params.set('from', from.value);
    params.set('to', to.value);
    if (includeEndDay.value) params.set('end', '1');
    if (excludeHolidays.value) params.set('hol', '1');
  } else if (tab.value === 'calc') {
    params.set('tab', 'calc');
    params.set('base', base.value);
    params.set('n', String(offsetValue.value));
    params.set('unit', unit.value);
    params.set('dir', direction.value);
    params.set('mode', mode.value);
  } else {
    params.set('tab', 'cd');
    params.set('target', target.value);
  }
  const qs = params.toString();
  return qs ? `${location.origin}${location.pathname}?${qs}` : location.href;
}

async function copyShareLink() {
  await copy(shareLink(), { notificationMessage: '分享链接已复制' });
}

function resetAll() {
  from.value = '2026-01-01';
  to.value = '2026-12-31';
  includeEndDay.value = false;
  excludeHolidays.value = false;
  base.value = today();
  offsetValue.value = 30;
  mode.value = 'natural';
  direction.value = 'forward';
  unit.value = 'day';
  calcExcludeHolidays.value = false;
  target.value = '2026-12-31';
  eventName.value = '';
}

/* ---------------------------------------------------------------- 一键示例 */

const exampleData = {
  tab: 'diff' as TabKey,
  from: '2026-01-01',
  to: '2026-12-31',
};
function loadExample() {
  tab.value = exampleData.tab;
  from.value = exampleData.from;
  to.value = exampleData.to;
  includeEndDay.value = false;
  excludeHolidays.value = false;
}

/* ---------------------------------------------------------------- 分享链接回灌 */

watch(
  () => location.search,
  (search) => {
    const p = new URLSearchParams(search);
    if (!p.has('tab') && !p.has('from')) return;
    if (p.get('tab') === 'diff' || !p.has('tab')) {
      tab.value = 'diff';
      if (p.has('from')) from.value = p.get('from')!;
      if (p.has('to')) to.value = p.get('to')!;
      includeEndDay.value = p.get('end') === '1';
      excludeHolidays.value = p.get('hol') === '1';
    } else if (p.get('tab') === 'calc') {
      tab.value = 'calc';
      if (p.has('base')) base.value = p.get('base')!;
      if (p.has('n')) offsetValue.value = Number(p.get('n'));
      if (p.has('unit')) unit.value = p.get('unit') as OffsetUnit;
      if (p.has('dir')) direction.value = p.get('dir') as OffsetDirection;
      if (p.has('mode')) mode.value = p.get('mode') as CalcMode;
    } else if (p.get('tab') === 'cd') {
      tab.value = 'countdown';
      if (p.has('target')) target.value = p.get('target')!;
    }
  },
  { immediate: true }
);
</script>

<template>
  <div class="ddc">
    <!-- Tab 栏 -->
    <div class="ddc-tabs" role="tablist">
      <button
        v-for="tb in tabs"
        :key="tb.key"
        class="ddc-tab"
        :class="{ 'is-active': tab === tb.key }"
        type="button"
        role="tab"
        :aria-selected="tab === tb.key"
        @click="tab = tb.key"
      >
        {{ tb.label }}
      </button>
    </div>

    <!-- ================= Tab 1：日期相差 ================= -->
    <div v-if="tab === 'diff'" class="ddc-panel">
      <div class="ddc-row2">
        <label class="ddc-field">
          <span class="ddc-field-label">开始日期</span>
          <input v-model="from" class="ddc-input" type="date" />
        </label>
        <label class="ddc-field">
          <span class="ddc-field-label">结束日期</span>
          <input v-model="to" class="ddc-input" type="date" />
        </label>
      </div>

      <div class="ddc-options">
        <label class="ddc-check">
          <input v-model="includeEndDay" type="checkbox" />
          <span>包含结束日期</span>
        </label>
        <label class="ddc-check">
          <input v-model="excludeHolidays" type="checkbox" />
          <span>排除法定节假日</span>
        </label>
        <button type="button" class="ddc-chip" @click="fillToday">今天</button>
        <button type="button" class="ddc-chip" @click="swap">⇄ 交换</button>
      </div>

      <div class="ddc-actions">
        <ToolExampleButton @click="loadExample" />
        <button type="button" class="ddc-btn primary" @click="copyResult">复制结果</button>
        <button type="button" class="ddc-btn" @click="copyShareLink">分享链接</button>
        <button type="button" class="ddc-btn" @click="resetAll">清空重置</button>
      </div>

      <p v-if="!diff" class="ddc-hint">结束日期不能早于开始日期</p>

      <template v-else>
        <div class="ddc-result">
          <div class="ddc-hero">
            <span class="ddc-hero-label">相差天数</span>
            <span class="ddc-hero-value">{{ diff.days }}<em>天</em></span>
          </div>
          <div class="ddc-lines">
            <div class="ddc-line"><span>按周换算</span><span>{{ weeksText(diff.weeks) }}</span></div>
            <div class="ddc-line">
              <span>按月换算</span><span>约 {{ monthsText(diff.months) }}</span>
            </div>
            <div class="ddc-line">
              <span>按年换算</span><span>约 {{ yearsText(diff.years) }}</span>
            </div>
            <div class="ddc-line">
              <span>时分秒</span>
              <span>{{ diff.hours }} 小时 / {{ diff.minutes }} 分钟 / {{ diff.seconds }} 秒</span>
            </div>
          </div>
        </div>

        <div class="ddc-stats">
          <div class="ddc-stat">
            <span class="ddc-stat-value">{{ diff.workdays }}</span>
            <span class="ddc-stat-label">工作日（天）</span>
          </div>
          <div class="ddc-stat">
            <span class="ddc-stat-value">{{ diff.weekends }}</span>
            <span class="ddc-stat-label">周末（天）</span>
          </div>
          <div v-if="excludeHolidays" class="ddc-stat">
            <span class="ddc-stat-value">{{ diff.holidays }}</span>
            <span class="ddc-stat-label">法定节假日（天）</span>
          </div>
        </div>

        <p v-if="excludeHolidays" class="ddc-note">
          已按法定节假日口径统计：调休上班日计入工作日，法定节假日单独列出
        </p>
        <p v-else-if="!diff.holidaysCovered" class="ddc-note">
          该区间没有法定节假日数据，已回退为仅按周末统计
        </p>

        <div class="ddc-infos">
          <div class="ddc-info">
            <div class="ddc-info-head">开始日期 {{ infoFrom.date }}</div>
            <dl>
              <div><dt>星期</dt><dd>{{ infoFrom.weekdayCn }}</dd></div>
              <div v-if="infoFrom.lunar"><dt>农历</dt><dd>{{ infoFrom.lunar }}</dd></div>
              <div v-if="infoFrom.zodiac"><dt>生肖</dt><dd>{{ infoFrom.zodiac }}</dd></div>
              <div><dt>星座</dt><dd>{{ infoFrom.constellation }}</dd></div>
              <div><dt>闰平</dt><dd class="ddc-toggle">{{ infoFrom.leapCn }}</dd></div>
              <div><dt>当年周数</dt><dd>{{ infoFrom.isoWeekCn }}</dd></div>
              <div v-if="infoFrom.ganzhi"><dt>干支</dt><dd>{{ infoFrom.ganzhi }}</dd></div>
            </dl>
          </div>
          <div class="ddc-info">
            <div class="ddc-info-head">结束日期 {{ infoTo.date }}</div>
            <dl>
              <div><dt>星期</dt><dd>{{ infoTo.weekdayCn }}</dd></div>
              <div v-if="infoTo.lunar"><dt>农历</dt><dd>{{ infoTo.lunar }}</dd></div>
              <div v-if="infoTo.zodiac"><dt>生肖</dt><dd>{{ infoTo.zodiac }}</dd></div>
              <div><dt>星座</dt><dd>{{ infoTo.constellation }}</dd></div>
              <div><dt>闰平</dt><dd class="ddc-toggle">{{ infoTo.leapCn }}</dd></div>
              <div><dt>当年周数</dt><dd>{{ infoTo.isoWeekCn }}</dd></div>
              <div v-if="infoTo.ganzhi"><dt>干支</dt><dd>{{ infoTo.ganzhi }}</dd></div>
            </dl>
          </div>
        </div>
      </template>
    </div>

    <!-- ================= Tab 2：日期推算 ================= -->
    <div v-else-if="tab === 'calc'" class="ddc-panel">
      <div class="ddc-row2">
        <label class="ddc-field">
          <span class="ddc-field-label">基准日期</span>
          <input v-model="base" class="ddc-input" type="date" />
        </label>
        <label class="ddc-field">
          <span class="ddc-field-label">偏移数值</span>
          <input v-model.number="offsetValue" class="ddc-input" type="number" min="0" />
        </label>
      </div>

      <div class="ddc-grid3">
        <div class="ddc-field">
          <span class="ddc-field-label">推算模式</span>
          <div class="ddc-seg">
            <button
              type="button"
              class="ddc-seg-item"
              :class="{ 'is-active': mode === 'natural' }"
              @click="mode = 'natural'"
            >
              自然日
            </button>
            <button
              type="button"
              class="ddc-seg-item"
              :class="{ 'is-active': mode === 'workday' }"
              @click="mode = 'workday'"
            >
              工作日
            </button>
          </div>
        </div>
        <div class="ddc-field">
          <span class="ddc-field-label">偏移方向</span>
          <div class="ddc-seg">
            <button
              type="button"
              class="ddc-seg-item"
              :class="{ 'is-active': direction === 'forward' }"
              @click="direction = 'forward'"
            >
              向前
            </button>
            <button
              type="button"
              class="ddc-seg-item"
              :class="{ 'is-active': direction === 'backward' }"
              @click="direction = 'backward'"
            >
              向后
            </button>
          </div>
        </div>
        <div class="ddc-field">
          <span class="ddc-field-label">偏移单位</span>
          <n-select v-model:value="unit" :options="unitOptions" />
        </div>
      </div>

      <div class="ddc-options">
        <label class="ddc-check">
          <input v-model="calcExcludeHolidays" type="checkbox" />
          <span>排除法定节假日</span>
        </label>
        <button
          v-for="o in calcOffsets"
          :key="o.label"
          type="button"
          class="ddc-chip"
          @click="applyOffset(o)"
        >
          {{ o.label }}
        </button>
      </div>

      <div class="ddc-actions">
        <button type="button" class="ddc-btn primary" @click="copyResult">复制结果</button>
        <button type="button" class="ddc-btn" @click="copyShareLink">分享链接</button>
        <button type="button" class="ddc-btn" @click="resetAll">清空重置</button>
      </div>

      <div v-if="calc" class="ddc-result">
        <div class="ddc-hero">
          <span class="ddc-hero-label">目标日期</span>
          <span class="ddc-hero-value">{{ calc.date }}</span>
        </div>
        <div class="ddc-lines">
          <div class="ddc-line"><span>星期</span><span>{{ calc.info.weekdayCn }}</span></div>
          <div v-if="calc.info.lunar" class="ddc-line">
            <span>农历</span><span>{{ calc.info.lunar }}</span>
          </div>
          <div v-if="calc.info.ganzhi" class="ddc-line">
            <span>干支</span><span>{{ calc.info.ganzhi }}</span>
          </div>
          <div class="ddc-line">
            <span>与基准实际相差</span>
            <span>{{ Math.abs(calc.naturalDiff) }} 个自然日</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ================= Tab 3：倒计时 ================= -->
    <div v-else class="ddc-panel">
      <div class="ddc-row2">
        <label class="ddc-field">
          <span class="ddc-field-label">目标日期</span>
          <input v-model="target" class="ddc-input" type="date" />
        </label>
        <label class="ddc-field">
          <span class="ddc-field-label">事件名称（选填，最多 20 字）</span>
          <input v-model="eventName" class="ddc-input" type="text" maxlength="20" placeholder="如：春节、高考、结婚纪念日" />
        </label>
      </div>

      <div class="ddc-options">
        <button v-for="p in presets" :key="p.key" type="button" class="ddc-chip" @click="applyPreset(p.date)">
          {{ p.label }}
        </button>
      </div>

      <div class="ddc-actions">
        <button type="button" class="ddc-btn primary" @click="copyResult">复制结果</button>
        <button type="button" class="ddc-btn" @click="copyShareLink">分享链接</button>
        <button type="button" class="ddc-btn" @click="resetAll">清空重置</button>
      </div>

      <div v-if="countdown" class="ddc-result">
        <p class="ddc-cd-title">
          <template v-if="countdown.isToday">【{{ countdown.target }}】就是今天 🎉</template>
          <template v-else-if="countdown.past">
            【{{ countdown.target }}】已经过去 {{ countdown.days }} 天
          </template>
          <template v-else>距离【{{ countdown.target }}】还有</template>
        </p>
        <div class="ddc-hero">
          <span class="ddc-hero-value">{{ countdown.days }}<em>天</em></span>
          <span class="ddc-hero-sub">
            {{ countdown.weeks.count }} 周零 {{ countdown.weeks.restDays }} 天
          </span>
        </div>
        <div class="ddc-clock">
          <div class="ddc-stat">
            <span class="ddc-stat-value">{{ String(countdown.hours).padStart(2, '0') }}</span>
            <span class="ddc-stat-label">时</span>
          </div>
          <div class="ddc-stat">
            <span class="ddc-stat-value">{{ String(countdown.minutes).padStart(2, '0') }}</span>
            <span class="ddc-stat-label">分</span>
          </div>
          <div class="ddc-stat">
            <span class="ddc-stat-value">{{ String(countdown.seconds).padStart(2, '0') }}</span>
            <span class="ddc-stat-label">秒</span>
          </div>
        </div>

        <div class="ddc-infos">
          <div class="ddc-info">
            <div class="ddc-info-head">目标日期 {{ countdown.info.date }}</div>
            <dl>
              <div><dt>星期</dt><dd>{{ countdown.info.weekdayCn }}</dd></div>
              <div v-if="countdown.info.lunar"><dt>农历</dt><dd>{{ countdown.info.lunar }}</dd></div>
              <div v-if="countdown.info.zodiac"><dt>生肖</dt><dd>{{ countdown.info.zodiac }}</dd></div>
              <div><dt>星座</dt><dd>{{ countdown.info.constellation }}</dd></div>
              <div><dt>闰平</dt><dd class="ddc-toggle">{{ countdown.info.leapCn }}</dd></div>
              <div><dt>当年周数</dt><dd>{{ countdown.info.isoWeekCn }}</dd></div>
              <div v-if="countdown.info.ganzhi"><dt>干支</dt><dd>{{ countdown.info.ganzhi }}</dd></div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
.ddc {
  --ddc-accent: #3b82f6;
  --ddc-ink: #1f2937;
  --ddc-muted: #6b7280;
  --ddc-line: var(--n-border-color, #e5e7eb);
  --ddc-surface: var(--n-color-card, #ffffff);

  background: var(--ddc-surface);
  border: 1px solid var(--ddc-line);
  border-radius: 14px;
  padding: 18px 20px 22px;
  box-shadow: 0 1px 2px rgb(15 23 42 / 6%);
  color: var(--ddc-ink);
}

/* ---------------------------------------------------------------- Tab */

.ddc-tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  margin-bottom: 16px;
  background: var(--n-color-table-header, #f1f5f9);
  border-radius: 10px;
}

.ddc-tab {
  flex: 1;
  padding: 9px 12px;
  font-size: 14px;
  color: var(--ddc-muted);
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  position: relative;

  &.is-active {
    color: var(--ddc-accent);
    font-weight: 600;
    background: var(--ddc-surface);
    box-shadow: 0 1px 2px rgb(15 23 42 / 8%);

    &::after {
      content: '';
      position: absolute;
      left: 50%;
      bottom: 2px;
      width: 32px;
      height: 3px;
      transform: translateX(-50%);
      background: var(--ddc-accent);
      border-radius: 2px;
    }
  }
}

/* ---------------------------------------------------------------- 表单 */

.ddc-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ddc-row2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.ddc-grid3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}

.ddc-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.ddc-field-label {
  font-size: 13px;
  color: var(--ddc-muted);
}

.ddc-input {
  width: 100%;
  padding: 9px 12px;
  font-size: 14px;
  color: var(--ddc-ink);
  background: var(--ddc-surface);
  border: 1px solid var(--ddc-line);
  border-radius: 8px;

  &:focus {
    outline: none;
    border-color: var(--ddc-accent);
  }
}

.ddc-options {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
}

.ddc-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  cursor: pointer;
}

.ddc-chip {
  padding: 5px 12px;
  font-size: 13px;
  color: var(--ddc-muted);
  background: var(--n-color-table-header, #f1f5f9);
  border: none;
  border-radius: 999px;
  cursor: pointer;

  &:hover {
    color: var(--ddc-accent);
  }
}

.ddc-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.ddc-btn {
  padding: 8px 18px;
  font-size: 14px;
  color: var(--ddc-ink);
  background: var(--ddc-surface);
  border: 1px solid var(--ddc-line);
  border-radius: 8px;
  cursor: pointer;

  &.primary {
    color: #fff;
    background: var(--ddc-accent);
    border-color: var(--ddc-accent);
  }

  &:hover {
    border-color: var(--ddc-accent);
  }
}

/* ---------------------------------------------------------------- 结果区 */

.ddc-result {
  display: flex;
  flex-wrap: wrap;
  gap: 18px 28px;
  align-items: center;
  padding: 16px 18px;
  background: rgb(59 130 246 / 5%);
  border-radius: 10px;
}

.ddc-hero {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ddc-hero-label {
  font-size: 13px;
  color: var(--ddc-muted);
}

.ddc-hero-value {
  font-size: 36px;
  font-weight: 700;
  line-height: 1.1;
  color: #2563eb;

  em {
    margin-left: 4px;
    font-size: 16px;
    font-style: normal;
    font-weight: 600;
  }
}

.ddc-hero-sub {
  font-size: 13px;
  color: var(--ddc-muted);
}

.ddc-lines {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-width: 220px;
}

.ddc-line {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  font-size: 13px;

  span:first-child {
    color: var(--ddc-muted);
  }
}

.ddc-cd-title {
  width: 100%;
  margin: 0;
  font-size: 14px;
  color: var(--ddc-muted);
}

.ddc-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 10px;
}

.ddc-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 12px 8px;
  background: var(--ddc-surface);
  border: 1px solid var(--ddc-line);
  border-top: 3px solid var(--ddc-accent);
  border-radius: 8px;
}

.ddc-clock {
  display: grid;
  grid-template-columns: repeat(3, minmax(80px, 1fr));
  gap: 10px;
}

.ddc-stat-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--ddc-accent);
}

.ddc-stat-label {
  font-size: 12px;
  color: var(--ddc-muted);
}

.ddc-note {
  margin: 0;
  font-size: 12px;
  color: var(--ddc-muted);
}

.ddc-hint {
  margin: 0;
  font-size: 13px;
  color: var(--ddc-muted);
}

/* ---------------------------------------------------------------- 信息框 */

.ddc-infos {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 10px;
}

.ddc-info {
  padding: 12px 14px;
  background: var(--n-color-table-trigger-hover, #f8fafc);
  border: 1px solid var(--ddc-line);
  border-radius: 8px;

  dl {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin: 0;
  }

  dl > div {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    font-size: 13px;
  }

  dt {
    color: var(--ddc-muted);
  }

  dd {
    margin: 0;
    text-align: right;
  }
}

.ddc-info-head {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ddc-ink);
}

.ddc-toggle {
  color: var(--ddc-accent);
}

/* ---------------------------------------------------------------- 分段控件 */

.ddc-seg {
  display: inline-flex;
  padding: 3px;
  background: var(--n-color-table-header, #f1f5f9);
  border-radius: 8px;
}

.ddc-seg-item {
  padding: 6px 16px;
  font-size: 13px;
  color: var(--ddc-muted);
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;

  &.is-active {
    color: #fff;
    font-weight: 600;
    background: var(--ddc-accent);
  }
}

/* ---------------------------------------------------------------- 窄屏 */

@media (max-width: 640px) {
  .ddc {
    padding: 14px;
  }

  .ddc-row2,
  .ddc-grid3 {
    grid-template-columns: 1fr;
  }

  .ddc-hero-value {
    font-size: 28px;
  }
}
</style>
