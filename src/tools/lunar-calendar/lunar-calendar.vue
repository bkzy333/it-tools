<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { lunarToSolar, solarToLunar, type SolarToLunarResult } from './lunar-calendar.service';

const { t } = useI18n();

const tab = ref<'solar-to-lunar' | 'lunar-to-solar'>('solar-to-lunar');

// 公历 → 农历
const solarDate = ref<number>(new Date('2020-10-23').getTime());
const solarResult = computed<SolarToLunarResult | null>(() => {
  if (!solarDate.value) {
    return null;
  }
  const d = new Date(solarDate.value);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return solarToLunar(date);
});

// 农历 → 公历
const lunarYear = ref(2020);
const lunarMonth = ref(9);
const lunarDay = ref(7);
const lunarIsLeap = ref(false);
const lunarError = ref('');
const lunarResult = computed(() => {
  lunarError.value = '';
  if (!lunarYear.value || !lunarMonth.value || !lunarDay.value) {
    return null;
  }
  const r = lunarToSolar(lunarYear.value, lunarMonth.value, lunarDay.value, lunarIsLeap.value);
  if (!r) {
    lunarError.value = t('tools.lunar-calendar.texts.hint-lunar-not-found');
    return null;
  }
  return r;
});

const exampleData = {
  solar: '2020-10-23',
  lunarYear: 2020,
  lunarMonth: 9,
  lunarDay: 7,
};

function loadExample() {
  solarDate.value = new Date(exampleData.solar).getTime();
  lunarYear.value = exampleData.lunarYear;
  lunarMonth.value = exampleData.lunarMonth;
  lunarDay.value = exampleData.lunarDay;
  lunarIsLeap.value = false;
}
</script>

<template>
  <div flex flex-col gap-3>
    <div flex justify-end>
      <ToolExampleButton @click="loadExample" />
    </div>

    <n-tabs v-model:value="tab" type="line">
      <n-tab-pane name="solar-to-lunar" :tab="t('tools.lunar-calendar.texts.tab-solar-to-lunar')">
        <c-card :title="t('tools.lunar-calendar.texts.title-input-solar')" mt-3>
          <n-date-picker v-model:value="solarDate" type="date" clearable />
        </c-card>

        <c-card v-if="solarResult" :title="t('tools.lunar-calendar.texts.title-result')" mt-3>
          <div text-2xl font-bold mb-3>{{ solarResult.lunarFull }}</div>
          <n-space vertical>
            <div flex gap-4>
              <span op-60>{{ t('tools.lunar-calendar.texts.label-lunar-date') }}</span>
              <span font-bold>{{ solarResult.lunarDateCn }}</span>
            </div>
            <div flex gap-4>
              <span op-60>{{ t('tools.lunar-calendar.texts.label-ganzhi') }}</span>
              <span>{{ solarResult.ganzhiYear }} {{ solarResult.ganzhiMonth }} {{ solarResult.ganzhiDay }}</span>
            </div>
            <div flex gap-4>
              <span op-60>{{ t('tools.lunar-calendar.texts.label-zodiac') }}</span>
              <span>{{ solarResult.zodiac }}</span>
            </div>
            <div flex gap-4>
              <span op-60>{{ t('tools.lunar-calendar.texts.label-constellation') }}</span>
              <span>{{ solarResult.constellation }}</span>
            </div>
          </n-space>
        </c-card>
      </n-tab-pane>

      <n-tab-pane name="lunar-to-solar" :tab="t('tools.lunar-calendar.texts.tab-lunar-to-solar')">
        <c-card :title="t('tools.lunar-calendar.texts.title-input-lunar')" mt-3>
          <n-space mb-3>
            <n-input-number v-model:value="lunarYear" :min="1900" :max="2100" :placeholder="t('tools.lunar-calendar.texts.label-year')" />
            <n-input-number v-model:value="lunarMonth" :min="1" :max="12" :placeholder="t('tools.lunar-calendar.texts.label-month')" />
            <n-input-number v-model:value="lunarDay" :min="1" :max="30" :placeholder="t('tools.lunar-calendar.texts.label-day')" />
            <n-checkbox v-model:checked="lunarIsLeap">{{ t('tools.lunar-calendar.texts.opt-leap') }}</n-checkbox>
          </n-space>
        </c-card>

        <c-card v-if="lunarResult || lunarError" :title="t('tools.lunar-calendar.texts.title-result')" mt-3>
          <div v-if="lunarResult" text-2xl font-bold>{{ lunarResult }}</div>
          <div v-if="lunarError" text-red-500>{{ lunarError }}</div>
        </c-card>
      </n-tab-pane>
    </n-tabs>
  </div>
</template>
