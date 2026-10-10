<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMessage } from 'naive-ui';
import { applySteps, type DateStepUnit } from './date-duration-calculator.service';
import ToolExampleButton from '@/components/ToolExampleButton.vue';
import { useCopy } from '@/composable/copy';

const { t, locale } = useI18n();
const message = useMessage();

const now = Date.now();
const inputReferenceDate = ref(now);

interface Step {
  op: 'add' | 'sub';
  amount: number | null;
  unit: DateStepUnit;
}

const steps = ref<Step[]>([{ op: 'add', amount: 10, unit: 'd' }]);

function addStep(partial?: Partial<Step>) {
  steps.value.push({ op: partial?.op ?? 'add', amount: partial?.amount ?? 1, unit: partial?.unit ?? 'd' });
}

function removeStep(index: number) {
  if (steps.value.length <= 1) {
    message.warning(t('tools.date-duration-calculator.texts.msg-at-least-one'));
    return;
  }
  steps.value.splice(index, 1);
}

function appendQuick(amount: number, unit: DateStepUnit) {
  addStep({ op: 'add', amount, unit });
}

const result = computed(() => {
  if (!inputReferenceDate.value) {
    return null;
  }
  const clean = steps.value
    .filter((s) => s.amount !== null && s.amount !== undefined && !Number.isNaN(Number(s.amount)))
    .map((s) => ({ op: s.op, amount: Number(s.amount) as number, unit: s.unit }));
  if (clean.length === 0) {
    return null;
  }
  return applySteps(new Date(inputReferenceDate.value), clean);
});

function unitLabel(u: DateStepUnit): string {
  switch (u) {
    case 'y':
      return t('tools.date-duration-calculator.texts.unit-year');
    case 'M':
      return t('tools.date-duration-calculator.texts.unit-month');
    case 'w':
      return t('tools.date-duration-calculator.texts.unit-week');
    case 'd':
      return t('tools.date-duration-calculator.texts.unit-day');
    case 'h':
      return t('tools.date-duration-calculator.texts.unit-hour');
    case 'm':
      return t('tools.date-duration-calculator.texts.unit-minute');
    case 's':
      return t('tools.date-duration-calculator.texts.unit-second');
  }
}

const opOptions = computed(() => [
  { label: t('tools.date-duration-calculator.texts.op-after'), value: 'add' as const },
  { label: t('tools.date-duration-calculator.texts.op-before'), value: 'sub' as const },
]);

const unitOptions = computed<{ label: string; value: DateStepUnit }[]>(() => [
  { label: unitLabel('y'), value: 'y' },
  { label: unitLabel('M'), value: 'M' },
  { label: unitLabel('w'), value: 'w' },
  { label: unitLabel('d'), value: 'd' },
  { label: unitLabel('h'), value: 'h' },
  { label: unitLabel('m'), value: 'm' },
  { label: unitLabel('s'), value: 's' },
]);

const quickOptions = computed(() => [
  { amount: 1, unit: 'd' as DateStepUnit },
  { amount: 7, unit: 'd' as DateStepUnit },
  { amount: 1, unit: 'M' as DateStepUnit },
  { amount: 1, unit: 'y' as DateStepUnit },
  { amount: 1, unit: 'h' as DateStepUnit },
  { amount: 30, unit: 'm' as DateStepUnit },
]);

function stepOpText(step: { op: 'add' | 'sub'; amount: number; unit: DateStepUnit }): string {
  const dir =
    step.op === 'sub'
      ? t('tools.date-duration-calculator.texts.op-before')
      : t('tools.date-duration-calculator.texts.op-after');
  return `${dir} ${step.amount} ${unitLabel(step.unit)}`;
}

function fmtDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const y = d.getFullYear();
  const mo = p(d.getMonth() + 1);
  const day = p(d.getDate());
  const h = p(d.getHours());
  const mi = p(d.getMinutes());
  const s = p(d.getSeconds());
  if (locale.value === 'zh') {
    return `${y}年${mo}月${day}日 ${h}:${mi}:${s}`;
  }
  return `${y}-${mo}-${day} ${h}:${mi}:${s}`;
}

function fmtLocalISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const WEEKDAYS = computed(() =>
  locale.value === 'zh'
    ? ['日', '一', '二', '三', '四', '五', '六']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
);

/**
 * 示例演示"链式多步"：以当前时间为起点，往后 10 天 → 往前 1 年 → 往后 10 小时。
 * 用步骤数组而非文本，符合新 UI 的数据结构。
 */
const exampleData: { steps: Step[] } = {
  steps: [
    { op: 'add', amount: 10, unit: 'd' },
    { op: 'sub', amount: 1, unit: 'y' },
    { op: 'add', amount: 10, unit: 'h' },
  ],
};

function loadExample() {
  steps.value = exampleData.steps.map((s) => ({ ...s }));
}

const VALID_UNITS: DateStepUnit[] = ['y', 'M', 'w', 'd', 'h', 'm', 's'];

// 从分享链接恢复状态（仅浏览器端执行）
onMounted(() => {
  const params = new URLSearchParams(window.location.search);
  const from = params.get('from');
  const stepsParam = params.get('steps');

  if (from) {
    const t0 = new Date(from).getTime();
    if (!Number.isNaN(t0)) {
      inputReferenceDate.value = t0;
    }
  }

  if (stepsParam) {
    try {
      const arr = JSON.parse(stepsParam);
      if (Array.isArray(arr)) {
        const parsed = arr
          .filter((x): x is unknown[] => Array.isArray(x) && x.length >= 3)
          .map((x) => ({
            op: x[0] === 'sub' ? ('sub' as const) : ('add' as const),
            amount: Number(x[1]) || 0,
            unit: (VALID_UNITS.includes(x[2] as DateStepUnit) ? x[2] : 'd') as DateStepUnit,
          }));
        if (parsed.length > 0) {
          steps.value = parsed;
        }
      }
    } catch {
      message.warning(t('tools.date-duration-calculator.texts.err-bad-link'));
    }
  }
});

// 分享链接：把当前起点日期与全部步骤编码进 URL
const shareUrl = computed(() => {
  const clean = steps.value
    .filter((s) => s.amount !== null && !Number.isNaN(Number(s.amount)))
    .map((s) => [s.op, String(Number(s.amount)), s.unit] as [string, string, string]);
  const params = new URLSearchParams();
  if (inputReferenceDate.value) {
    params.set('from', fmtLocalISO(new Date(inputReferenceDate.value)));
  }
  params.set('steps', JSON.stringify(clean));
  const { origin, pathname } = window.location;
  return `${origin}${pathname}?${params.toString()}`;
});

const { copy: copyShare } = useCopy();
function copyShareLink() {
  copyShare(shareUrl.value, {
    notificationMessage: t('tools.date-duration-calculator.texts.share-copied'),
  });
}

const { copy: copyResult } = useCopy();
function copyTimestamp() {
  if (!result.value) {
    return;
  }
  copyResult(result.value.date.toISOString(), {
    notificationMessage: t('tools.date-duration-calculator.texts.result-copied'),
  });
}
</script>

<template>
  <div>
    <div flex justify-end mb-2>
      <ToolExampleButton @click="loadExample" />
    </div>

    <c-card :title="t('tools.date-duration-calculator.texts.title-date-duration-calculator')" mb-2>
      <n-form-item
        :label="t('tools.date-duration-calculator.texts.label-reference-date')"
        label-placement="left"
        mb-2
      >
        <n-date-picker v-model:value="inputReferenceDate" type="datetime" />
      </n-form-item>

      <div flex items-center justify-between mb-2>
        <span font-medium>{{ t('tools.date-duration-calculator.texts.label-steps') }}</span>
        <c-button secondary size="small" @click="addStep()">
          {{ t('tools.date-duration-calculator.texts.btn-add-step') }}
        </c-button>
      </div>

      <div v-for="(step, i) in steps" :key="i" flex items-center gap-2 mb-2>
        <span w-6 text-center text-sm text-neutral-400>{{ i + 1 }}</span>
        <n-select v-model:value="step.op" :options="opOptions" style="width: 92px" />
        <n-input-number v-model:value="step.amount" :min="0" :step="1" style="width: 112px" />
        <n-select v-model:value="step.unit" :options="unitOptions" style="width: 84px" />
        <c-button secondary size="small" @click="removeStep(i)">
          {{ t('tools.date-duration-calculator.texts.btn-remove-step') }}
        </c-button>
      </div>

      <div flex flex-wrap gap-2 mt-1 mb-2>
        <c-button
          v-for="opt in quickOptions"
          :key="`${opt.amount}-${opt.unit}`"
          secondary
          size="small"
          @click="appendQuick(opt.amount, opt.unit)"
        >
          +{{ opt.amount }} {{ unitLabel(opt.unit) }}
        </c-button>
      </div>

      <n-p depth="3" mt-1>{{ t('tools.date-duration-calculator.texts.help-calendar') }}</n-p>

      <n-divider />

      <template v-if="result">
        <input-copyable
          :label="t('tools.date-duration-calculator.texts.label-result-date')"
          label-position="left"
          label-width="150px"
          :value="fmtDate(result.date)"
          mb-1
        />
        <input-copyable
          :label="t('tools.date-duration-calculator.texts.label-result-iso-date')"
          label-position="left"
          label-width="150px"
          :value="result.date.toISOString()"
          mb-1
        />
        <div flex items-center gap-2 mb-2>
          <c-button secondary size="small" @click="copyTimestamp">
            {{ t('tools.date-duration-calculator.texts.btn-copy-result') }}
          </c-button>
        </div>
        <n-p>
          {{
            t('tools.date-duration-calculator.texts.result-summary', {
              wd: WEEKDAYS[result.weekdayIndex],
              n: result.steps.length,
            })
          }}
        </n-p>

        <n-h3 mt-3 mb-1>{{ t('tools.date-duration-calculator.texts.trace-title') }}</n-h3>
        <n-table :bordered="false" :single-line="false" size="small">
          <thead>
            <tr>
              <th>{{ t('tools.date-duration-calculator.texts.col-step') }}</th>
              <th>{{ t('tools.date-duration-calculator.texts.col-op') }}</th>
              <th>{{ t('tools.date-duration-calculator.texts.col-result') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="st in result.steps" :key="st.index">
              <td>{{ t('tools.date-duration-calculator.texts.step-n', { n: st.index }) }}</td>
              <td>{{ stepOpText(st) }}</td>
              <td>{{ fmtDate(st.date) }}</td>
            </tr>
          </tbody>
        </n-table>

        <n-divider />
        <n-p depth="3">{{ t('tools.date-duration-calculator.texts.share-hint') }}</n-p>
        <div flex items-center gap-2>
          <c-button secondary @click="copyShareLink">
            {{ t('tools.date-duration-calculator.texts.btn-share') }}
          </c-button>
        </div>
      </template>
    </c-card>
  </div>
</template>
