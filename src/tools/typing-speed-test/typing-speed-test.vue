<script setup lang="ts">
/**
 * 打字速度测试 —— 工具卡本体。
 *
 * 视觉与交互规格来自参考站 gjupai.com/tools/typing_speed 的真实前端 chunk
 * （2026-10-07 抓取反编译）：选项区 → 四宫格实时指标 → 等级 → 进度条 →
 * 逐字高亮的样本文本 → 输入框 → 底部计数 → 最近成绩 → 结算弹窗。
 * 原站那层产品壳（295 个工具入口、商城导航、AI 助手浮窗、百度站长推送）一概不搬，
 * UI 用本站自己的卡片样式重写。
 *
 * 所有数字都来自 typing-speed-test.service.ts 的纯函数，这里不做二次计算 ——
 * 静态 HTML 与运行时一旦算出两个样就是 cloaking（AdSense 封号级）。
 *
 * 界面文案按本站最新工具（日期距离计算器）的做法直接写中文：只有 title / description
 * 进 locales/*.yml，避免继续扩大 en.yml 的缺失键缺口。
 */
import { computed, onBeforeUnmount, ref } from 'vue';
import ToolExampleButton from '@/components/ToolExampleButton.vue';
import {
  bestAccuracy,
  bestWpm,
  buildTargetText,
  collectErrorKeys,
  countCorrect,
  getLevel,
  isCompletedEarly,
  MAX_RECORDS,
  metricsFromCounts,
  pickSample,
  progressPercent,
  pushRecord,
  resolveDurationSeconds,
  VISIBLE_RECORDS,
  type DurationMode,
  type Lang,
  type TextMode,
  type TypingRecord,
} from './typing-speed-test.service';

/* ---------------------------------------------------------------- 选项状态 */

const STORAGE_KEY = 'typing-speed-test:records:v1';

const textMode = ref<TextMode>('random');
const lang = ref<Lang>('zh');
const durationMode = ref<DurationMode>(1);
const customSeconds = ref(60);
const includePunctuation = ref(true);
const includeUppercase = ref(true);
const customText = ref('');

/* ---------------------------------------------------------------- 一轮测试的运行时状态 */

const sample = ref(pickSample('zh'));
/** textarea 里的实时文本（含输入法组合期的拼音，仅用于回显，不参与判定） */
const typed = ref('');
/**
 * 已结算文本：组合期结束后才更新，是高亮与指标的唯一依据。
 *
 * ⚠ 这是本站**故意**偏离参考站的一处。参考站直接在 onChange 里拿 textarea 的值
 * 逐位比对，中文输入法组合期的拼音字母会被当成打错的字，准确率会瞬间掉到一两成、
 * 易错键里塞满拼音字母 —— 中文模式基本没法用。这里改成只在 compositionend 之后结算。
 */
const settled = ref('');
const status = ref<'idle' | 'running' | 'finished'>('idle');
const elapsed = ref(0);
const correct = ref(0);
const backspaces = ref(0);
const totalKeys = ref(0);
const errorKeys = ref<Record<string, number>>({});
const isComposing = ref(false);
const pasteHint = ref(false);
const inputEl = ref<HTMLTextAreaElement | null>(null);

let timer: ReturnType<typeof setInterval> | null = null;
let startedAt = 0;
let hintTimer: ReturnType<typeof setTimeout> | null = null;

/* ---------------------------------------------------------------- 派生值 */

/** 目标文本：随机模式按选项清洗语料，自定义模式直接用用户输入 */
const target = computed(() =>
  buildTargetText({
    mode: textMode.value,
    sample: sample.value,
    customText: customText.value,
    lang: lang.value,
    includePunctuation: includePunctuation.value,
    includeUppercase: includeUppercase.value,
  }),
);

/** 本轮时长（秒） */
const duration = computed(() => resolveDurationSeconds(durationMode.value, customSeconds.value));

/** 实时指标：按已结算的长度算，避免组合期的拼音污染准确率 */
const metrics = computed(() => metricsFromCounts(correct.value, settled.value.length, elapsed.value));

const level = computed(() => getLevel(metrics.value.wpm, lang.value));

const progress = computed(() =>
  progressPercent(elapsed.value, duration.value, settled.value.length, target.value.length),
);

const topErrors = computed(() =>
  Object.entries(errorKeys.value)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5),
);

const durationText = computed(() =>
  durationMode.value === 'custom' ? `${duration.value} 秒` : `${durationMode.value} 分钟`,
);

/* ---------------------------------------------------------------- 历史成绩 */

const records = ref<TypingRecord[]>(loadRecords());

function loadRecords(): TypingRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECORDS) : [];
  } catch {
    return [];
  }
}

function saveRecords() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records.value));
  } catch {
    // 隐私模式下 localStorage 会抛异常，历史成绩丢了不影响本轮测试
  }
}

const bestWpmValue = computed(() => bestWpm(records.value));
const bestAccuracyValue = computed(() => bestAccuracy(records.value));

function clearRecords() {
  records.value = [];
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 同上
  }
}

function formatRecordDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ---------------------------------------------------------------- 计时与结算 */

function stopTimer() {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

function startTimer() {
  stopTimer();
  startedAt = Date.now();
  timer = setInterval(() => {
    elapsed.value = Math.floor((Date.now() - startedAt) / 1000);
    if (elapsed.value >= duration.value) {
      finish();
    }
  }, 500);
}

/** 结算：停表、落一条历史成绩、弹出结算卡 */
function finish() {
  stopTimer();
  status.value = 'finished';
  const m = metricsFromCounts(correct.value, settled.value.length, elapsed.value);
  records.value = pushRecord(records.value, {
    date: new Date().toISOString(),
    lang: lang.value,
    wpm: m.wpm,
    cpm: m.cpm,
    accuracy: m.accuracy,
    duration: elapsed.value,
  });
  saveRecords();
}

/* ---------------------------------------------------------------- 输入处理 */

function mergeErrorKeys(incoming: Record<string, number>) {
  const entries = Object.entries(incoming);
  if (entries.length === 0) return;
  const next = { ...errorKeys.value };
  for (const [k, n] of entries) {
    next[k] = (next[k] ?? 0) + n;
  }
  errorKeys.value = next;
}

/**
 * 一次「结算」：把当前文本逐位比对，更新正确数、易错键，并判断是否提前打完。
 * 只在非输入法组合期调用 —— 组合期的拼音不是用户输入的结果，不能算进去。
 */
function settle(force = false) {
  const value = typed.value;
  if (!force && isComposing.value) return;

  // 超过目标长度的整次输入直接截断：不允许打出比样本文本更多的内容
  const clipped = value.length > target.value.length;
  if (clipped) {
    typed.value = value.slice(0, target.value.length);
  }

  if (status.value === 'idle') {
    status.value = 'running';
    startTimer();
  }

  settled.value = typed.value;
  correct.value = countCorrect(target.value, settled.value);
  mergeErrorKeys(collectErrorKeys(target.value, settled.value, lang.value));

  // 打完且全对 → 提前结算，不必等时间走完
  if (isCompletedEarly(target.value, settled.value, correct.value)) {
    finish();
  }
}

function onInput(event: Event) {
  const el = event.target as HTMLTextAreaElement;
  if (status.value === 'finished') {
    // 结束后输入框禁用并回退到已结算内容
    el.value = settled.value;
    return;
  }
  typed.value = el.value;
  settle();
  // 被截断时把 DOM 里的值同步回去，否则 textarea 会比状态多出一个字符
  if (el.value !== typed.value) {
    el.value = typed.value;
  }
}

function onCompositionStart() {
  isComposing.value = true;
}

function onCompositionEnd(event: CompositionEvent) {
  isComposing.value = false;
  // 组合期浏览器给的是 key='Process'，keydown 计数漏掉了这批按键，
  // 这里把上屏的字数补进「总按键」，中文模式才统计得准
  totalKeys.value += (event.data ?? '').length;
  if (status.value === 'finished') return;
  typed.value = (event.target as HTMLTextAreaElement).value;
  settle(true);
}

/**
 * 计数用的 keydown。
 * ⚠ 英文模式下这个计数是准的；中文输入法组合期浏览器给的是 key='Process'，
 *   所以中文的按键数靠 onCompositionEnd 补，见那里的注释。
 */
function onKeyDown(event: KeyboardEvent) {
  if (status.value === 'finished') {
    event.preventDefault();
    return;
  }
  if (event.key === 'Backspace') {
    backspaces.value += 1;
  }
  if (event.key.length === 1) {
    totalKeys.value += 1;
  }
}

/** 打字测试禁止粘贴，否则成绩没有意义 */
function onPaste(event: ClipboardEvent) {
  event.preventDefault();
  pasteHint.value = true;
  if (hintTimer !== null) clearTimeout(hintTimer);
  hintTimer = setTimeout(() => {
    pasteHint.value = false;
  }, 2500);
}

/* ---------------------------------------------------------------- 重开 / 换一段 */

/** 重开一轮。focus=false 用于「正在编辑自定义文本」的场景，避免抢走焦点 */
function restart(focus = true) {
  stopTimer();
  if (textMode.value === 'random') {
    sample.value = pickSample(lang.value);
  }
  typed.value = '';
  settled.value = '';
  correct.value = 0;
  status.value = 'idle';
  elapsed.value = 0;
  backspaces.value = 0;
  totalKeys.value = 0;
  errorKeys.value = {};
  isComposing.value = false;
  if (focus) {
    inputEl.value?.focus();
  }
}

function onCustomTextInput() {
  restart(false);
}

function setTextMode(mode: TextMode) {
  textMode.value = mode;
  restart();
}

function setLang(next: Lang) {
  lang.value = next;
  restart();
}

function setDurationMode(mode: DurationMode) {
  durationMode.value = mode;
  restart();
}

function togglePunctuation(value: boolean) {
  includePunctuation.value = value;
  restart();
}

function toggleUppercase(value: boolean) {
  includeUppercase.value = value;
  restart();
}

function onTogglePunctuation(event: Event) {
  togglePunctuation((event.target as HTMLInputElement).checked);
}

function onToggleUppercase(event: Event) {
  toggleUppercase((event.target as HTMLInputElement).checked);
}

onBeforeUnmount(() => {
  stopTimer();
  if (hintTimer !== null) clearTimeout(hintTimer);
});

/* ---------------------------------------------------------------- 一键示例 */

const exampleData = {
  textMode: 'custom' as TextMode,
  customText: 'The quick brown fox jumps over the lazy dog.',
  durationMode: 'custom' as DurationMode,
  customSeconds: 30,
  lang: 'en' as Lang,
};

function loadExample() {
  stopTimer();
  textMode.value = exampleData.textMode;
  customText.value = exampleData.customText;
  durationMode.value = exampleData.durationMode;
  customSeconds.value = exampleData.customSeconds;
  lang.value = exampleData.lang;
  typed.value = '';
  settled.value = '';
  correct.value = 0;
  status.value = 'idle';
  elapsed.value = 0;
  backspaces.value = 0;
  totalKeys.value = 0;
  errorKeys.value = {};
  inputEl.value?.focus();
}

/* ---------------------------------------------------------------- 文本高亮 */

const textOptions = [
  { key: 'random' as TextMode, label: '随机文本' },
  { key: 'custom' as TextMode, label: '自定义文本' },
];
const langOptions = [
  { key: 'zh' as Lang, label: '中文' },
  { key: 'en' as Lang, label: '英文' },
];
const durationOptions: { key: DurationMode; label: string }[] = [
  { key: 1, label: '1 分钟' },
  { key: 3, label: '3 分钟' },
  { key: 5, label: '5 分钟' },
  { key: 'custom', label: '自定义' },
];

/** 逐字状态：已结算部分按对错染色，光标位是蓝色下划线，之后是灰色 */
function charClass(index: number): string {
  if (index < settled.value.length) {
    return settled.value[index] === target.value[index] ? 'tst-ch ok' : 'tst-ch bad';
  }
  if (index === settled.value.length) {
    return 'tst-ch cursor';
  }
  return 'tst-ch';
}
</script>

<template>
  <div class="tst">
    <!-- 选项区 -->
    <div class="tst-bar">
      <div class="tst-seg" role="group" aria-label="文本来源">
        <button
          v-for="o in textOptions"
          :key="o.key"
          type="button"
          class="tst-seg-btn"
          :class="{ 'is-active': textMode === o.key }"
          @click="setTextMode(o.key)"
        >
          {{ o.label }}
        </button>
      </div>

      <div v-if="textMode === 'random'" class="tst-seg" role="group" aria-label="语言">
        <button
          v-for="o in langOptions"
          :key="o.key"
          type="button"
          class="tst-seg-btn"
          :class="{ 'is-active': lang === o.key }"
          @click="setLang(o.key)"
        >
          {{ o.label }}
        </button>
      </div>

      <div class="tst-seg" role="group" aria-label="测试时长">
        <button
          v-for="o in durationOptions"
          :key="String(o.key)"
          type="button"
          class="tst-seg-btn"
          :class="{ 'is-active': durationMode === o.key }"
          @click="setDurationMode(o.key)"
        >
          {{ o.label }}
        </button>
      </div>

      <label v-if="durationMode === 'custom'" class="tst-inline">
        <input
          v-model.number="customSeconds"
          class="tst-num"
          type="number"
          min="10"
          max="1800"
          aria-label="自定义时长（秒）"
        />
        <span>秒</span>
      </label>

      <button type="button" class="tst-btn primary" @click="restart()">换一段 / 重来</button>
    </div>

    <div v-if="textMode === 'random'" class="tst-opts">
      <label class="tst-check">
        <input type="checkbox" :checked="includePunctuation" @change="onTogglePunctuation" />
        <span>包含标点</span>
      </label>
      <label v-if="lang === 'en'" class="tst-check">
        <input type="checkbox" :checked="includeUppercase" @change="onToggleUppercase" />
        <span>包含大写</span>
      </label>
    </div>

    <label v-if="textMode === 'custom'" class="tst-field">
      <span class="tst-field-label">自定义练习文本（最长 1000 字）</span>
      <textarea
        v-model="customText"
        class="tst-custom"
        rows="3"
        placeholder="在这里输入你想练习的文本…"
        @input="onCustomTextInput"
      />
    </label>

    <!-- 实时指标 -->
    <div class="tst-stats">
      <div class="tst-stat blue">
        <span class="tst-stat-label">已用时间</span>
        <span class="tst-stat-value">{{ elapsed }}s / {{ duration }}s</span>
      </div>
      <div class="tst-stat green">
        <span class="tst-stat-label">WPM</span>
        <span class="tst-stat-value">{{ metrics.wpm }}</span>
      </div>
      <div class="tst-stat purple">
        <span class="tst-stat-label">CPM</span>
        <span class="tst-stat-value">{{ metrics.cpm }}</span>
      </div>
      <div class="tst-stat orange">
        <span class="tst-stat-label">准确率</span>
        <span class="tst-stat-value">{{ metrics.accuracy }}%</span>
      </div>
    </div>

    <div class="tst-level">
      <span class="tst-level-label">等级：</span>
      <span class="tst-level-value" :class="`tst-lv-${level.tone}`">{{ level.label }}</span>
      <span v-if="bestWpmValue > 0" class="tst-best">历史最佳 WPM：{{ bestWpmValue }}</span>
      <span v-if="bestAccuracyValue > 0" class="tst-best">最佳准确率：{{ bestAccuracyValue }}%</span>
    </div>

    <div class="tst-progress" role="progressbar" :aria-valuenow="Math.round(progress)" aria-valuemin="0" aria-valuemax="100">
      <div class="tst-progress-bar" :style="{ width: `${progress}%` }" />
    </div>

    <!-- 样本文本（逐字高亮） -->
    <div class="tst-target">
      <template v-if="target">
        <span v-for="(ch, i) in target.split('')" :key="i" :class="charClass(i)">{{ ch }}</span>
      </template>
      <span v-else class="tst-empty">请输入自定义文本</span>
    </div>

    <!-- 输入区 -->
    <textarea
      ref="inputEl"
      class="tst-input"
      rows="3"
      :value="typed"
      :disabled="status === 'finished'"
      :placeholder="status === 'finished' ? '测试已结束' : '点击此处开始输入…'"
      aria-label="打字输入区"
      @input="onInput"
      @keydown="onKeyDown"
      @paste="onPaste"
      @compositionstart="onCompositionStart"
      @compositionend="onCompositionEnd"
    />

    <p v-if="pasteHint" class="tst-hint warn">打字测试中请勿粘贴文本，请手动输入。</p>

    <div class="tst-foot">
      <span>错误数：{{ metrics.errors }} &nbsp;|&nbsp; 退格：{{ backspaces }} &nbsp;|&nbsp; 总按键：{{ totalKeys }}</span>
      <span>当前模式：{{ lang === 'zh' ? '中文' : '英文' }} / {{ durationText }}</span>
    </div>

    <!-- 最近成绩 -->
    <div v-if="records.length > 0" class="tst-history">
      <div class="tst-history-head">
        <h3 class="tst-history-title">最近成绩</h3>
        <button type="button" class="tst-link danger" @click="clearRecords">清空历史</button>
      </div>
      <ul class="tst-history-list">
        <li v-for="(r, i) in records.slice(0, VISIBLE_RECORDS)" :key="`${r.date}-${i}`" class="tst-history-row">
          <span>{{ formatRecordDate(r.date) }} {{ r.lang === 'zh' ? '中文' : '英文' }}</span>
          <span>WPM {{ r.wpm }} · CPM {{ r.cpm }} · 准确率 {{ r.accuracy }}% · {{ r.duration }}s</span>
        </li>
      </ul>
    </div>

    <div class="tst-actions">
      <ToolExampleButton @click="loadExample" />
    </div>

    <!-- 结算弹窗 -->
    <div v-if="status === 'finished'" class="tst-mask">
      <div class="tst-modal" role="dialog" aria-modal="true" aria-label="测试完成">
        <h3 class="tst-modal-title">🎉 测试完成</h3>

        <div class="tst-modal-level">
          <span class="tst-level-label">等级：</span>
          <span class="tst-modal-level-value" :class="`tst-lv-${level.tone}`">{{ level.label }}</span>
        </div>

        <div class="tst-modal-grid">
          <div class="tst-stat blue">
            <span class="tst-stat-label">WPM</span>
            <span class="tst-stat-value lg">{{ metrics.wpm }}</span>
          </div>
          <div class="tst-stat purple">
            <span class="tst-stat-label">CPM</span>
            <span class="tst-stat-value lg">{{ metrics.cpm }}</span>
          </div>
          <div class="tst-stat green">
            <span class="tst-stat-label">准确率</span>
            <span class="tst-stat-value lg">{{ metrics.accuracy }}%</span>
          </div>
          <div class="tst-stat red">
            <span class="tst-stat-label">错误数</span>
            <span class="tst-stat-value lg">{{ metrics.errors }}</span>
          </div>
        </div>

        <div v-if="topErrors.length > 0" class="tst-errors">
          <div class="tst-errors-title">易错键 Top {{ topErrors.length }}</div>
          <div class="tst-errors-list">
            <span v-for="[k, n] in topErrors" :key="k" class="tst-chip">{{ k }}: {{ n }}</span>
          </div>
        </div>

        <p class="tst-modal-foot">用时 {{ elapsed }} 秒，退格 {{ backspaces }} 次</p>

        <button type="button" class="tst-btn primary block" @click="restart()">再测一次</button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
.tst {
  --tst-accent: #3b82f6;
  --tst-ink: #1f2937;
  --tst-muted: #6b7280;
  --tst-line: var(--n-border-color, #e5e7eb);
  --tst-surface: var(--n-color-card, #ffffff);
  --tst-soft: #f3f4f6;

  background: var(--tst-surface);
  border: 1px solid var(--tst-line);
  border-radius: 14px;
  padding: 18px 20px 22px;
  box-shadow: 0 1px 2px rgb(15 23 42 / 6%);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ---------------- 选项区 ---------------- */

.tst-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.tst-seg {
  display: flex;
  gap: 2px;
  padding: 3px;
  background: var(--tst-soft);
  border-radius: 10px;
}

.tst-seg-btn {
  padding: 5px 12px;
  font-size: 13px;
  color: var(--tst-muted);
  background: transparent;
  border: 0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    color: var(--tst-ink);
  }

  &.is-active {
    background: var(--tst-surface);
    color: var(--tst-accent);
    box-shadow: 0 1px 2px rgb(15 23 42 / 10%);
    font-weight: 600;
  }
}

.tst-inline {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  color: var(--tst-muted);
}

.tst-num {
  width: 72px;
  padding: 5px 8px;
  font-size: 13px;
  text-align: center;
  color: var(--tst-ink);
  background: var(--tst-surface);
  border: 1px solid var(--tst-line);
  border-radius: 8px;
}

.tst-btn {
  padding: 6px 14px;
  font-size: 13px;
  color: var(--tst-ink);
  background: var(--tst-surface);
  border: 1px solid var(--tst-line);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: var(--tst-accent);
    color: var(--tst-accent);
  }

  &.primary {
    margin-left: auto;
    color: #fff;
    background: var(--tst-accent);
    border-color: var(--tst-accent);

    &:hover {
      background: #2563eb;
      color: #fff;
    }
  }

  &.block {
    width: 100%;
    margin-left: 0;
    padding: 9px 14px;
  }
}

.tst-opts {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 13px;
}

.tst-check {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--tst-ink);
  cursor: pointer;
}

/* ---------------- 自定义文本 ---------------- */

.tst-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tst-field-label {
  font-size: 13px;
  color: var(--tst-muted);
}

.tst-custom,
.tst-input {
  width: 100%;
  padding: 9px 12px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--tst-ink);
  background: var(--tst-surface);
  border: 1px solid var(--tst-line);
  border-radius: 10px;
  resize: vertical;
  outline: none;

  &:focus {
    border-color: var(--tst-accent);
    box-shadow: 0 0 0 3px rgb(59 130 246 / 18%);
  }

  &:disabled {
    background: var(--tst-soft);
    cursor: not-allowed;
  }
}

/* ---------------- 实时指标 ---------------- */

.tst-stats,
.tst-modal-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;

  @media (width <= 560px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.tst-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 10px 6px;
  border-radius: 10px;
  background: var(--tst-soft);

  &.blue {
    background: #eff6ff;
  }

  &.green {
    background: #f0fdf4;
  }

  &.purple {
    background: #faf5ff;
  }

  &.orange {
    background: #fff7ed;
  }

  &.red {
    background: #fef2f2;
  }
}

.tst-stat-label {
  font-size: 12px;
  color: var(--tst-muted);
}

.tst-stat-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--tst-ink);

  &.lg {
    font-size: 24px;
  }
}

.tst-level {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  font-size: 14px;
}

.tst-level-label {
  font-weight: 600;
  color: var(--tst-ink);
}

.tst-level-value {
  font-weight: 700;
}

/* 等级配色。语义类而不是 unocss 原子类：原子类的提取器扫不到动态拼接的类名 */
.tst-lv-gray {
  color: #4b5563;
}

.tst-lv-blue {
  color: #2563eb;
}

.tst-lv-purple {
  color: #9333ea;
}

.tst-lv-orange {
  color: #ea580c;
}

.tst-lv-red {
  color: #dc2626;
}

.tst-best {
  margin-left: 8px;
  font-size: 13px;
  color: var(--tst-muted);
}

/* ---------------- 进度条 ---------------- */

.tst-progress {
  height: 8px;
  overflow: hidden;
  background: var(--tst-soft);
  border-radius: 999px;
}

.tst-progress-bar {
  height: 100%;
  background: var(--tst-accent);
  border-radius: 999px;
  transition: width 0.3s;
}

/* ---------------- 样本文本 ---------------- */

.tst-target {
  min-height: 96px;
  padding: 12px 14px;
  font-size: 18px;
  line-height: 2;
  letter-spacing: 0.02em;
  word-break: break-all;
  background: var(--tst-soft);
  border: 1px solid var(--tst-line);
  border-radius: 10px;
}

.tst-ch {
  padding: 0 1px;
  color: var(--tst-ink);
  border-radius: 2px;

  &.ok {
    color: #15803d;
    background: #dcfce7;
  }

  &.bad {
    color: #b91c1c;
    background: #fee2e2;
  }

  &.cursor {
    color: var(--tst-accent);
    text-decoration: underline;
    text-decoration-thickness: 2px;
  }
}

.tst-empty {
  font-size: 14px;
  color: #9ca3af;
}

/* ---------------- 底部计数 ---------------- */

.tst-foot {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 4px 16px;
  font-size: 13px;
  color: var(--tst-muted);
}

.tst-hint {
  font-size: 13px;

  &.warn {
    color: #b45309;
  }
}

/* ---------------- 最近成绩 ---------------- */

.tst-history {
  padding: 12px 14px;
  border: 1px solid var(--tst-line);
  border-radius: 10px;
}

.tst-history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.tst-history-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--tst-ink);
}

.tst-link {
  font-size: 12px;
  color: var(--tst-muted);
  background: none;
  border: 0;
  cursor: pointer;

  &:hover {
    color: #dc2626;
  }

  &.danger {
    color: #dc2626;
  }
}

.tst-history-list {
  max-height: 160px;
  padding: 0;
  margin: 0;
  overflow-y: auto;
  list-style: none;
}

.tst-history-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 0;
  font-size: 12px;
  color: var(--tst-muted);
  border-bottom: 1px solid var(--tst-line);

  &:last-child {
    border-bottom: 0;
  }
}

.tst-actions {
  display: flex;
  justify-content: flex-end;
}

/* ---------------- 结算弹窗 ---------------- */

.tst-mask {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgb(0 0 0 / 50%);
}

.tst-modal {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  max-width: 460px;
  padding: 22px;
  background: var(--tst-surface);
  border-radius: 16px;
  box-shadow: 0 20px 40px rgb(15 23 42 / 25%);
}

.tst-modal-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--tst-ink);
  text-align: center;
}

.tst-modal-level {
  text-align: center;
}

.tst-modal-level-value {
  font-size: 20px;
  font-weight: 700;
}

.tst-errors-title {
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--tst-ink);
}

.tst-errors-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tst-chip {
  padding: 3px 8px;
  font-size: 12px;
  color: var(--tst-ink);
  background: var(--tst-soft);
  border-radius: 6px;
}

.tst-modal-foot {
  margin: 0;
  font-size: 13px;
  color: var(--tst-muted);
  text-align: center;
}
</style>
