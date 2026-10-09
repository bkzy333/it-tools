<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { amountToEnglish, CURRENCIES } from './english-amount.service';

const { t } = useI18n();

const amount = ref('1234.56');
const currencyCode = ref('USD');
const fullForm = ref(true);
const hyphenated = ref(true);
const error = ref('');

const currencyOptions = computed(() =>
  CURRENCIES.map((c) => ({ label: `${c.code} - ${c.name}`, value: c.code })),
);

const output = computed(() => {
  if (!amount.value.trim()) {
    error.value = '';
    return '';
  }
  try {
    error.value = '';
    return amountToEnglish(amount.value.trim(), {
      currencyCode: currencyCode.value,
      fullForm: fullForm.value,
      hyphenated: hyphenated.value,
    });
  } catch (e) {
    error.value = (e as Error).message;
    return '';
  }
});

const exampleData = { amount: '1234.56', currency: 'USD' };

function loadExample() {
  amount.value = exampleData.amount;
  currencyCode.value = exampleData.currency;
  fullForm.value = true;
  hyphenated.value = true;
}
</script>

<template>
  <div flex flex-col gap-3>
    <div flex justify-end>
      <ToolExampleButton @click="loadExample" />
    </div>

    <c-card :title="t('tools.english-amount.texts.title-input')">
      <c-input-text
        v-model:value="amount"
        :placeholder="t('tools.english-amount.texts.placeholder-amount')"
        clearable
      />
      <n-space mt-3 vertical>
        <c-select
          v-model:value="currencyCode"
          :label="t('tools.english-amount.texts.label-currency')"
          label-position="left"
          :options="currencyOptions"
        />
        <n-checkbox v-model:checked="fullForm">
          {{ t('tools.english-amount.texts.opt-full-form') }}
        </n-checkbox>
        <n-checkbox v-model:checked="hyphenated">
          {{ t('tools.english-amount.texts.opt-hyphenated') }}
        </n-checkbox>
      </n-space>
      <div v-if="error" mt-2 text-red-500>{{ error }}</div>
    </c-card>

    <c-card :title="t('tools.english-amount.texts.title-result')">
      <input-copyable v-if="output" :value="output" />
      <div v-else op-60>{{ t('tools.english-amount.texts.hint-empty') }}</div>
    </c-card>
  </div>
</template>
