<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import ToolExampleButton from '@/components/ToolExampleButton.vue';
import { useCopy } from '@/composable/copy';
import { applyTypography, DEFAULT_TYPOGRAPHY_OPTIONS, type TypographyOptions } from './text-typography.service';

const { t } = useI18n();
const { copy } = useCopy();

const input = ref('');
const options = reactive<TypographyOptions>({ ...DEFAULT_TYPOGRAPHY_OPTIONS });

const output = computed(() => applyTypography(input.value, options));
const canCopy = computed(() => output.value.length > 0);

function copyResult() {
  copy(output.value);
}

function clearAll() {
  input.value = '';
}

const exampleData = {
  input: '这是一个demo,里面有English单词和数字123,标点。。。重复了!!让我们看看排版效果如何。',
};

function loadExample() {
  input.value = exampleData.input;
  options.spaceCjkLatin = true;
  options.spaceCjkDigit = true;
  options.halfToFullPunct = true;
  options.dedupePunct = true;
}
</script>

<template>
  <c-card :title="t('tools.text-typography.title')" max-w-800px>
    <div flex items-center justify-between gap-2 mb-2>
      <span />
      <ToolExampleButton @click="loadExample" />
    </div>

    <n-form-item :label="t('tools.text-typography.texts.label-input')" label-placement="left" mb-1>
      <n-input
        v-model:value="input"
        type="textarea"
        :rows="8"
        :placeholder="t('tools.text-typography.texts.placeholder-input')"
      />
    </n-form-item>

    <c-card :title="t('tools.text-typography.texts.label-rules')" size="small" mb-2>
      <n-checkbox v-model:checked="options.spaceCjkLatin">
        {{ t('tools.text-typography.texts.opt-space-cjk-latin') }}
      </n-checkbox>
      <n-checkbox v-model:checked="options.spaceCjkDigit">
        {{ t('tools.text-typography.texts.opt-space-cjk-digit') }}
      </n-checkbox>
      <n-checkbox v-model:checked="options.halfToFullPunct">
        {{ t('tools.text-typography.texts.opt-half-to-full') }}
      </n-checkbox>
      <n-checkbox v-model:checked="options.dedupePunct">
        {{ t('tools.text-typography.texts.opt-dedupe-punct') }}
      </n-checkbox>
    </c-card>

    <c-card :title="t('tools.text-typography.texts.title-result')" size="small">
      <n-input :value="output" type="textarea" :rows="8" readonly />
      <div flex items-center gap-2 mt-2>
        <c-button type="primary" :disabled="!canCopy" @click="copyResult">
          {{ t('tools.text-typography.texts.action-copy') }}
        </c-button>
        <c-button @click="clearAll">{{ t('tools.text-typography.texts.action-clear') }}</c-button>
      </div>
    </c-card>
  </c-card>
</template>
