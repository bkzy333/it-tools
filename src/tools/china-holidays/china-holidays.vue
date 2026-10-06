<script setup lang="ts">
/**
 * 中国法定节假日放假安排。
 *
 * 只做一件事：把国务院办公厅通知里的放假调休日期摊开成一张表，并把「调休上班日」
 * 和「高速免费范围」这两个最容易记错的信息单独拎出来。
 * 数据在 holidays.data.ts，年份切换是数据驱动的 —— 以后加了 2027，
 * 选择器自动出现，这里一行都不用改。
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import {
  daysUntil,
  formatRange,
  HOLIDAY_PLANS,
  nextHoliday,
  statusOf,
  todayIso,
  weekdayOf,
  type HolidayPlan,
} from './holidays.data';

const { t } = useI18n();

const year = ref(HOLIDAY_PLANS[HOLIDAY_PLANS.length - 1].year);

const plans = computed(() => [...HOLIDAY_PLANS].sort((a, b) => b.year - a.year));
const yearOptions = computed(() => plans.value.map((p) => ({ label: `${p.year}`, value: p.year })));
const plan = computed<HolidayPlan>(() => HOLIDAY_PLANS.find((p) => p.year === year.value) ?? HOLIDAY_PLANS[0]);

const totalDays = computed(() => plan.value.segments.reduce((sum, s) => sum + s.days, 0));
const today = computed(() => todayIso());
const upcoming = computed(() => nextHoliday(plan.value, today.value));
const upcomingCountdown = computed(() => {
  const segment = upcoming.value;
  return segment ? daysUntil(segment.start, today.value) : null;
});
const isCurrentYear = computed(() => year.value === new Date().getFullYear());

function statusLabel(start: string, end: string): string {
  const status = statusOf({ name: '', start, end, days: 0, freeToll: false }, today.value);
  return t(`tools.china-holidays.texts.status-${status}`);
}

// 示例按钮：把年份切到最新公布的那一年，并高亮（对用户来说没什么可"填"的，
// 但保持和全站一致的交互习惯，点了至少能确认当前看的是最新数据）
function loadExample() {
  year.value = HOLIDAY_PLANS[HOLIDAY_PLANS.length - 1].year;
}
</script>

<template>
  <div flex flex-col gap-3>
    <div flex justify-end>
      <ToolExampleButton @click="loadExample" />
    </div>

    <c-card :title="t('tools.china-holidays.texts.title-plan')">
      <div flex items-center gap-2 mb-3 flex-wrap>
        <span text-sm op-70>{{ t('tools.china-holidays.texts.label-year') }}</span>
        <n-select v-model:value="year" w-140px :options="yearOptions" />
        <span v-if="plan" text-sm op-60>{{ plan.source }}（{{ plan.publishedAt }}）</span>
      </div>

      <div mb-3>
        <span text-sm op-70>{{ t('tools.china-holidays.texts.label-total') }}</span>
        <span font-bold text-lg mx-1>{{ totalDays }}</span>
        <span>{{ t('tools.china-holidays.texts.unit-days') }}</span>
      </div>

      <c-alert v-if="isCurrentYear && upcoming" :title="t('tools.china-holidays.texts.title-next')">
        <template v-if="upcomingCountdown && upcomingCountdown > 0">
          {{ t('tools.china-holidays.texts.hint-next-before') }}{{ upcoming.name
          }}{{ t('tools.china-holidays.texts.hint-next-middle') }}{{ upcomingCountdown
          }}{{ t('tools.china-holidays.texts.hint-next-after') }}
        </template>
        <template v-else>
          {{ t('tools.china-holidays.texts.hint-ongoing-before') }}{{ upcoming.name
          }}{{ t('tools.china-holidays.texts.hint-ongoing-after') }}
        </template>
      </c-alert>
    </c-card>

    <c-card :title="t('tools.china-holidays.texts.title-segments')">
      <div flex flex-col gap-2>
        <div
          v-for="segment in plan.segments"
          :key="segment.name"
          flex items-center gap-3 flex-wrap border="~ gray-200 dark:gray-700"
          rounded
          px-3
          py-2
        >
          <span font-bold w-70px shrink-0>{{ segment.name }}</span>
          <span w-150px shrink-0>{{ formatRange(segment) }}</span>
          <span op-70 text-sm w-60px shrink-0>{{ weekdayOf(segment.start) }}</span>
          <span text-sm w-70px shrink-0>{{ segment.days }}{{ t('tools.china-holidays.texts.unit-days') }}</span>
          <span
            v-if="segment.freeToll"
            text-xs px-2 py-0.5 rounded-full
            bg-green-100
            dark:bg-green-900
            :title="t('tools.china-holidays.texts.tag-free-toll')"
          >
            {{ t('tools.china-holidays.texts.tag-free-toll') }}
          </span>
          <span v-if="isCurrentYear" text-xs op-60 ml-auto>{{ statusLabel(segment.start, segment.end) }}</span>
        </div>
      </div>
    </c-card>

    <c-card :title="t('tools.china-holidays.texts.title-makeup')">
      <div v-if="plan.makeupWorkdays.length" flex flex-wrap gap-2>
        <span
          v-for="day in plan.makeupWorkdays"
          :key="day"
          text-sm
          px-2
          py-0.5
          rounded
          border="~ orange-300 dark:orange-700"
        >
          {{ day.slice(5).replace('-', '月') }}{{ t('tools.china-holidays.texts.unit-day') }} {{ weekdayOf(day) }}
        </span>
      </div>
      <div v-else op-60 text-sm>{{ t('tools.china-holidays.texts.hint-no-makeup') }}</div>
      <div mt-3 text-sm op-60>
        {{ t('tools.china-holidays.texts.hint-makeup') }}
      </div>
    </c-card>

    <c-alert :title="t('tools.china-holidays.texts.title-notice')">
      {{ t('tools.china-holidays.texts.hint-notice') }}
    </c-alert>
  </div>
</template>
