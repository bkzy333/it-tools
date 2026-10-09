<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import ToolExampleButton from '@/components/ToolExampleButton.vue';
import { useCopy } from '@/composable/copy';
import {
  generateSequence,
  SEPARATOR_OPTIONS,
  SEQUENCE_MODES,
  type SequenceMode,
} from './sequence-generator.service';

const { t } = useI18n();
const { copy } = useCopy();

/* -------------------------------------------------------------- 状态 */
const mode = ref<SequenceMode>('number');
const start = ref(1);
const count = ref(10);
const step = ref(1);
const padWidth = ref(0);
const lowercase = ref(false);
const chineseUppercase = ref(false);
const prefix = ref('');
const suffix = ref('');
const separator = ref('\n');
const customItems = ref('红\n黄\n蓝');

/**
 * 示例挑了「带前缀 + 补零」的数字序列，最能体现本工具和记事本手打的差别：
 * NO.01 / NO.02 ... 这种逐行编号，手写又慢又容易错。
 */
const exampleData = {
  mode: 'number' as SequenceMode,
  start: 1,
  count: 5,
  step: 1,
  padWidth: 2,
  lowercase: false,
  chineseUppercase: false,
  prefix: 'NO.',
  suffix: '',
  separator: '\n',
  customItems: '红\n黄\n蓝',
};

function loadExample() {
  mode.value = exampleData.mode;
  start.value = exampleData.start;
  count.value = exampleData.count;
  step.value = exampleData.step;
  padWidth.value = exampleData.padWidth;
  lowercase.value = exampleData.lowercase;
  chineseUppercase.value = exampleData.chineseUppercase;
  prefix.value = exampleData.prefix;
  suffix.value = exampleData.suffix;
  separator.value = exampleData.separator;
  customItems.value = exampleData.customItems;
}

/* -------------------------------------------------------------- 选项 */
const modeOptions = computed(() =>
  SEQUENCE_MODES.map(({ key }) => ({
    value: key,
    label: t(`tools.sequence-generator.texts.opt-mode-${key}`),
  })),
);

const separatorOptions = computed(() =>
  SEPARATOR_OPTIONS.map(({ value, key }) => ({
    value,
    label: t(`tools.sequence-generator.texts.opt-sep-${key}`),
  })),
);

const caseOptions = computed(() => [
  { value: false, label: t('tools.sequence-generator.texts.opt-case-upper') },
  { value: true, label: t('tools.sequence-generator.texts.opt-case-lower') },
]);

const chineseStyleOptions = computed(() => [
  { value: false, label: t('tools.sequence-generator.texts.opt-chinese-lower') },
  { value: true, label: t('tools.sequence-generator.texts.opt-chinese-upper') },
]);

// 不同模式需要的控件不同，用计算属性控制显隐，避免给用不到的模式留空控件
const needStep = computed(() => ['number', 'letter', 'roman', 'chinese'].includes(mode.value));
const needPad = computed(() => mode.value === 'number');
const needCase = computed(() => mode.value === 'letter' || mode.value === 'roman');
const needChineseStyle = computed(() => mode.value === 'chinese');
const needCustom = computed(() => mode.value === 'custom');

/* -------------------------------------------------------------- 计算 */
const output = computed(() =>
  generateSequence({
    mode: mode.value,
    start: Number(start.value) || 1,
    count: Number(count.value) || 0,
    step: Number(step.value) || 1,
    padWidth: Number(padWidth.value) || 0,
    prefix: prefix.value,
    suffix: suffix.value,
    separator: separator.value,
    lowercase: lowercase.value,
    chineseUppercase: chineseUppercase.value,
    customItems: customItems.value,
  }),
);

const canCopy = computed(() => output.value.length > 0);

function copyResult() {
  copy(output.value);
}

function downloadResult() {
  const blob = new Blob([output.value], { type: 'text/plain;charset=utf-8' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = document.documentElement.lang.startsWith('zh') ? '序列.txt' : 'sequence.txt';
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

function clearAll() {
  count.value = 0;
}
</script>

<template>
  <div>
    <c-card :title="t('tools.sequence-generator.texts.label-settings')">
      <div flex items-center justify-between gap-2 mb-2>
        <ToolExampleButton @click="loadExample" />
        <c-button size="small" @click="clearAll">{{ t('tools.sequence-generator.texts.action-clear') }}</c-button>
      </div>

      <div grid grid-cols-1 sm:grid-cols-2 gap-3>
        <div>
          <div mb-1 text-sm>{{ t('tools.sequence-generator.texts.label-mode') }}</div>
          <c-select v-model:value="mode" :options="modeOptions" />
        </div>

        <div>
          <div mb-1 text-sm>{{ t('tools.sequence-generator.texts.label-count') }}</div>
          <n-input-number v-model:value="count" :min="0" :max="20000" style="width: 100%" />
        </div>

        <div>
          <div mb-1 text-sm>{{ t('tools.sequence-generator.texts.label-start') }}</div>
          <n-input-number v-model:value="start" :min="0" style="width: 100%" />
        </div>

        <div v-if="needStep">
          <div mb-1 text-sm>{{ t('tools.sequence-generator.texts.label-step') }}</div>
          <n-input-number v-model:value="step" style="width: 100%" />
        </div>

        <div v-if="needPad">
          <div mb-1 text-sm>{{ t('tools.sequence-generator.texts.label-pad') }}</div>
          <n-input-number v-model:value="padWidth" :min="0" :max="20" style="width: 100%" />
        </div>

        <div v-if="needCase">
          <div mb-1 text-sm>{{ t('tools.sequence-generator.texts.label-case') }}</div>
          <c-select v-model:value="lowercase" :options="caseOptions" />
        </div>

        <div v-if="needChineseStyle">
          <div mb-1 text-sm>{{ t('tools.sequence-generator.texts.label-chinese-style') }}</div>
          <c-select v-model:value="chineseUppercase" :options="chineseStyleOptions" />
        </div>
      </div>

      <div v-if="needCustom" mt-3>
        <div mb-1 text-sm>{{ t('tools.sequence-generator.texts.label-custom') }}</div>
        <n-input
          v-model:value="customItems"
          type="textarea"
          :rows="3"
          :placeholder="t('tools.sequence-generator.texts.placeholder-custom')"
        />
      </div>

      <div grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3>
        <div>
          <div mb-1 text-sm>{{ t('tools.sequence-generator.texts.label-prefix') }}</div>
          <n-input v-model:value="prefix" :placeholder="t('tools.sequence-generator.texts.placeholder-prefix')" />
        </div>
        <div>
          <div mb-1 text-sm>{{ t('tools.sequence-generator.texts.label-suffix') }}</div>
          <n-input v-model:value="suffix" :placeholder="t('tools.sequence-generator.texts.placeholder-suffix')" />
        </div>
        <div>
          <div mb-1 text-sm>{{ t('tools.sequence-generator.texts.label-separator') }}</div>
          <c-select v-model:value="separator" :options="separatorOptions" />
        </div>
      </div>
    </c-card>

    <c-card :title="t('tools.sequence-generator.texts.title-result')" mt-4>
      <div flex items-center justify-end gap-2 mb-2>
        <c-button size="small" :disabled="!canCopy" @click="copyResult">
          {{ t('tools.sequence-generator.texts.action-copy') }}
        </c-button>
        <c-button size="small" :disabled="!canCopy" @click="downloadResult">
          {{ t('tools.sequence-generator.texts.action-download') }}
        </c-button>
      </div>

      <n-input :value="output" type="textarea" :rows="12" readonly
        :placeholder="t('tools.sequence-generator.texts.placeholder-result')" />
    </c-card>
  </div>
</template>
