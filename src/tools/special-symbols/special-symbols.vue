<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useCopy } from '@/composable/copy';
import { SYMBOL_CATEGORIES } from './special-symbols.data';

const { t } = useI18n();
const { copy } = useCopy();

const activeKey = ref(SYMBOL_CATEGORIES[0].key);

function copySymbol(symbol: string) {
  copy(symbol);
}
</script>

<template>
  <c-card :title="t('tools.special-symbols.title')" max-w-900px>
    <n-tabs v-model:value="activeKey" type="line" animated>
      <n-tab-pane v-for="cat in SYMBOL_CATEGORIES" :key="cat.key" :name="cat.key"
        :tab="t(`tools.special-symbols.texts.cat-${cat.key}`)">
        <div grid grid-cols-6 sm:grid-cols-10 gap-1 mt-2>
          <button
            v-for="symbol in cat.symbols"
            :key="`${cat.key}-${symbol}`"
            type="button"
            cursor-pointer
            text-18px
            leading-10
            rounded-4px
            border-1
            border-transparent
            hover:border-(primary)
            hover:bg-(primary-op-1)
            transition-all
            @click="copySymbol(symbol)"
          >
            {{ symbol }}
          </button>
        </div>
      </n-tab-pane>
    </n-tabs>

    <n-alert type="info" :bordered="false" mt-3>
      {{ t('tools.special-symbols.texts.hint-click') }}
    </n-alert>
  </c-card>
</template>
