<script setup lang="ts">
/**
 * 全角半角转换。
 * 实时转换，不点按钮——这个工具的典型用法是粘进来、复制走，多一次点击就是多余的摩擦。
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { convertWidth, countWidth, type ConvertMode } from './width';

const { t } = useI18n();

const input = ref('');
const mode = ref<ConvertMode>('to-half');
const keepPunctuation = ref(true);

const exampleData = {
  input: '订单编号：Ａ２０２４０９１８００３７\n客户姓名：李小明\n联系电话：１３８－００００－１２３４\n金额：￥１２，８００．００　（含税）',
  mode: 'to-half' as ConvertMode,
};

/**
 * 示例是一段从 PDF 或网页里拷出来的订单信息：
 * 全角数字、全角字母、全角破折号、全角空格混在一起——这正是用户实际会遇到的脏数据，
 * 用"ＡＢＣ"这种纯字母例子根本看不出工具的价值。
 */
function loadExample() {
  input.value = exampleData.input;
  mode.value = exampleData.mode;
}

const modeOptions = [
  { label: t('tools.fullwidth-halfwidth-converter.texts.mode-to-half'), value: 'to-half' },
  { label: t('tools.fullwidth-halfwidth-converter.texts.mode-to-full'), value: 'to-full' },
];

const output = computed(() => convertWidth(input.value, mode.value, { keepPunctuation: keepPunctuation.value }));
const stats = computed(() => countWidth(input.value));

const copyState = ref<'idle' | 'ok' | 'fail'>('idle');

async function copyOutput() {
  try {
    await navigator.clipboard.writeText(output.value);
    copyState.value = 'ok';
  }
  catch {
    copyState.value = 'fail';
  }
  setTimeout(() => {
    copyState.value = 'idle';
  }, 2000);
}
</script>

<template>
  <div class="width-converter">
    <div flex justify-end mb-2>
      <ToolExampleButton @click="loadExample" />
    </div>

    <c-card :title="t('tools.fullwidth-halfwidth-converter.texts.title-input')" mb-3>
      <n-input
        v-model:value="input"
        type="textarea"
        :rows="8"
        :placeholder="t('tools.fullwidth-halfwidth-converter.texts.placeholder-input')"
        mb-2
      />
      <c-select
        v-model:value="mode"
        :label="t('tools.fullwidth-halfwidth-converter.texts.label-mode')"
        label-position="left"
        :options="modeOptions"
      />
      <div flex items-center gap-2 mt-2>
        <span>{{ t('tools.fullwidth-halfwidth-converter.texts.label-keep-punct') }}</span>
        <n-switch v-model:value="keepPunctuation" />
        <span class="hint">{{ t('tools.fullwidth-halfwidth-converter.texts.hint-keep-punct') }}</span>
      </div>
      <div v-if="input" class="hint" mt-2>
        {{ t('tools.fullwidth-halfwidth-converter.texts.hint-stats') }}：{{ stats.total }}
        {{ t('tools.fullwidth-halfwidth-converter.texts.unit-char') }}，
        {{ t('tools.fullwidth-halfwidth-converter.texts.label-full') }} {{ stats.fullWidth }}，
        {{ t('tools.fullwidth-halfwidth-converter.texts.label-half') }} {{ stats.halfWidth }}，
        {{ t('tools.fullwidth-halfwidth-converter.texts.label-neutral') }} {{ stats.neutral }}
      </div>
    </c-card>

    <c-card :title="t('tools.fullwidth-halfwidth-converter.texts.title-output')">
      <n-input :value="output" type="textarea" :rows="8" readonly mb-2 />
      <c-button :disabled="!output" @click="copyOutput">
        {{ t('tools.fullwidth-halfwidth-converter.texts.btn-copy') }}
      </c-button>
      <span v-if="copyState === 'ok'" class="state-ok" ml-2>
        {{ t('tools.fullwidth-halfwidth-converter.texts.state-copied') }}
      </span>
      <span v-else-if="copyState === 'fail'" class="state-bad" ml-2>
        {{ t('tools.fullwidth-halfwidth-converter.texts.state-failed') }}
      </span>
      <div class="hint" mt-2>
        {{ t('tools.fullwidth-halfwidth-converter.texts.hint-note') }}
      </div>
    </c-card>
  </div>
</template>

<style scoped lang="less">
.width-converter {
  .hint {
    font-size: 13px;
    color: var(--n-text-color-disabled, #999);
  }
}
</style>
