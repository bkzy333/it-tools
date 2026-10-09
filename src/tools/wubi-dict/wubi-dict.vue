<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { queryWubiText, type WubiVersion } from './wubi-dict.service';

const { t } = useI18n();

const input = ref('');
const version = ref<WubiVersion>('86');

const results = computed(() => queryWubiText(input.value, version.value));
const foundCount = computed(() => results.value.filter((r) => r.found).length);
const missingCount = computed(() => results.value.filter((r) => !r.found).length);

const exampleData = { input: '中华人民共和国', version: '86' as WubiVersion };

function loadExample() {
  input.value = exampleData.input;
  version.value = exampleData.version;
}
</script>

<template>
  <div flex flex-col gap-3>
    <div flex justify-end>
      <ToolExampleButton @click="loadExample" />
    </div>

    <c-card :title="t('tools.wubi-dict.texts.title-input')">
      <c-input-text
        v-model:value="input"
        :placeholder="t('tools.wubi-dict.texts.placeholder-input')"
        multiline
        rows="3"
        clearable
      />
      <n-space mt-3>
        <n-radio-group v-model:value="version">
          <n-radio-button value="86">86</n-radio-button>
          <n-radio-button value="98">98</n-radio-button>
        </n-radio-group>
      </n-space>
    </c-card>

    <c-card v-if="results.length" :title="t('tools.wubi-dict.texts.title-result')">
      <div flex items-center justify-between mb-3>
        <span op-60 text-sm>
          {{ t('tools.wubi-dict.texts.label-found') }} {{ foundCount }}
          <template v-if="missingCount"> / {{ t('tools.wubi-dict.texts.label-missing') }} {{ missingCount }}</template>
        </span>
      </div>

      <div class="wubi-grid">
        <div v-for="(r, i) in results" :key="i" class="wubi-cell" :class="{ missing: !r.found }">
          <div class="char">{{ r.char }}</div>
          <div class="code">{{ r.found ? r.code : '—' }}</div>
        </div>
      </div>

      <div v-if="missingCount" mt-3 op-60 text-sm>
        {{ t('tools.wubi-dict.texts.hint-missing') }}
      </div>
    </c-card>
  </div>
</template>

<style scoped lang="less">
.wubi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
  gap: 8px;
}

.wubi-cell {
  padding: 8px 4px;
  border: 1px solid rgb(0 0 0 / 8%);
  border-radius: 6px;
  text-align: center;

  &.missing {
    opacity: 0.5;
  }
}

.char {
  font-size: 18px;
}

.code {
  margin-top: 2px;
  font-size: 12px;
  color: #888;
  font-family: monospace;
}
</style>
