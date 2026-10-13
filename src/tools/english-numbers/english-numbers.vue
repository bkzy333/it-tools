<script setup lang="ts">
/**
 * 数字 ↔ 英文读数互转（支持批量）。
 *
 * 批量形态对齐全站共享层（UX 契约 U1~U4）：
 * - 默认按换行分隔，也支持逗号 / 顿号 / 自定义符号（splitTokens 已处理转义与空行）
 * - 结果走 BatchResultTable：一行输入对应一行输出，逐行复制 + 底部复制全部/导出 TXT/Excel
 * - 逐条 try/catch：某条转换失败只把那一行标红，其余照常出结果
 *
 * 两个 Tab 的分隔选项刻意不同：
 * - 数字侧给全四种（数字本身不含逗号，按逗号分隔是安全的）
 * - 英文侧只给「换行 / 自定义」——英文读数自带逗号（one thousand, two hundred），
 *   提供「逗号分隔」会把一条读数切成好几条，是必然的误用，所以不提供。
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import BatchResultTable from '@/components/BatchResultTable.vue';
import { splitTokens, type BatchRow, type SepMode } from '@/composable/batchSplit';
import { englishToNumber, normalizeNumberInput, numberToEnglish } from './english-numbers.service';

const { t } = useI18n();

const tab = ref<'to-english' | 'to-number'>('to-english');

const numberInput = ref('');
const hyphenated = ref(true);
const useComma = ref(true);
const numberSepMode = ref<SepMode>('newline');
const numberCustomSep = ref('');

const englishInput = ref('');
const englishSepMode = ref<'newline' | 'custom'>('newline');
const englishCustomSep = ref('');

/**
 * 逐条转换、逐条容错。以前单条时代出错整块结果就没了，批量下更糟：
 * 一条脏数据会让后面所有行错位，所以这里把错误就地渲染成一行红字，行号保持对齐。
 */
const numberRows = computed<BatchRow[]>(() =>
  splitTokens(numberInput.value, numberSepMode.value, numberCustomSep.value).map((raw) => {
    try {
      return {
        input: raw,
        output: numberToEnglish(normalizeNumberInput(raw), {
          hyphenated: hyphenated.value,
          useComma: useComma.value,
        }),
        error: false,
      };
    }
    catch (e) {
      return { input: raw, output: (e as Error).message, error: true };
    }
  }),
);

const englishRows = computed<BatchRow[]>(() =>
  splitTokens(englishInput.value, englishSepMode.value, englishCustomSep.value).map((raw) => {
    try {
      return { input: raw, output: englishToNumber(raw), error: false };
    }
    catch (e) {
      return { input: raw, output: (e as Error).message, error: true };
    }
  }),
);

const exampleData = {
  number: '1234567.89\n42\n-5\n3.14\n1,000',
  english: 'one million, two hundred thirty-four thousand, five hundred sixty-seven\ntwenty-one\nminus five',
};

function loadExample() {
  if (tab.value === 'to-english') {
    numberInput.value = exampleData.number;
    numberSepMode.value = 'newline';
    hyphenated.value = true;
    useComma.value = true;
  }
  else {
    englishInput.value = exampleData.english;
    englishSepMode.value = 'newline';
  }
}

function clearNumber() {
  numberInput.value = '';
}

function clearEnglish() {
  englishInput.value = '';
}
</script>

<template>
  <div flex flex-col gap-3>
    <div flex justify-end>
      <ToolExampleButton @click="loadExample" />
    </div>

    <n-tabs v-model:value="tab" type="line">
      <n-tab-pane name="to-english" :tab="t('tools.english-numbers.texts.tab-to-english')">
        <c-card :title="t('tools.english-numbers.texts.title-input-number')" mt-3>
          <div flex justify-end mb-2>
            <c-button size="small" secondary @click="clearNumber">
              {{ t('tools.english-numbers.texts.action-clear') }}
            </c-button>
          </div>

          <n-input
            v-model:value="numberInput"
            type="textarea"
            :rows="8"
            :placeholder="t('tools.english-numbers.texts.placeholder-number')"
          />

          <div flex flex-wrap items-center gap-3 mt-3>
            <span text-sm op-70>{{ t('tools.english-numbers.texts.label-separator') }}</span>
            <n-radio-group v-model:value="numberSepMode" size="small">
              <n-radio value="newline">{{ t('tools.english-numbers.texts.sep-newline') }}</n-radio>
              <n-radio value="comma">{{ t('tools.english-numbers.texts.sep-comma') }}</n-radio>
              <n-radio value="pause">{{ t('tools.english-numbers.texts.sep-pause') }}</n-radio>
              <n-radio value="custom">{{ t('tools.english-numbers.texts.sep-custom') }}</n-radio>
            </n-radio-group>
            <n-input
              v-if="numberSepMode === 'custom'"
              v-model:value="numberCustomSep"
              size="small"
              :placeholder="t('tools.english-numbers.texts.placeholder-custom-sep')"
              style="width: 200px"
            />
          </div>
          <p mt-2 mb-0 text-xs op-60>{{ t('tools.english-numbers.texts.hint-batch-number') }}</p>

          <n-space mt-3>
            <n-checkbox v-model:checked="hyphenated">
              {{ t('tools.english-numbers.texts.opt-hyphenated') }}
            </n-checkbox>
            <n-checkbox v-model:checked="useComma">
              {{ t('tools.english-numbers.texts.opt-comma') }}
            </n-checkbox>
          </n-space>
        </c-card>

        <c-card :title="t('tools.english-numbers.texts.title-result')" mt-3>
          <BatchResultTable
            :rows="numberRows"
            :filename="t('tools.english-numbers.texts.file-to-english')"
            :input-label="t('tools.english-numbers.texts.col-number')"
            :output-label="t('tools.english-numbers.texts.col-english')"
          />
        </c-card>
      </n-tab-pane>

      <n-tab-pane name="to-number" :tab="t('tools.english-numbers.texts.tab-to-number')">
        <c-card :title="t('tools.english-numbers.texts.title-input-english')" mt-3>
          <div flex justify-end mb-2>
            <c-button size="small" secondary @click="clearEnglish">
              {{ t('tools.english-numbers.texts.action-clear') }}
            </c-button>
          </div>

          <n-input
            v-model:value="englishInput"
            type="textarea"
            :rows="8"
            :placeholder="t('tools.english-numbers.texts.placeholder-english')"
          />

          <div flex flex-wrap items-center gap-3 mt-3>
            <span text-sm op-70>{{ t('tools.english-numbers.texts.label-separator') }}</span>
            <n-radio-group v-model:value="englishSepMode" size="small">
              <n-radio value="newline">{{ t('tools.english-numbers.texts.sep-newline') }}</n-radio>
              <n-radio value="custom">{{ t('tools.english-numbers.texts.sep-custom') }}</n-radio>
            </n-radio-group>
            <n-input
              v-if="englishSepMode === 'custom'"
              v-model:value="englishCustomSep"
              size="small"
              :placeholder="t('tools.english-numbers.texts.placeholder-custom-sep')"
              style="width: 200px"
            />
          </div>
          <p mt-2 mb-0 text-xs op-60>{{ t('tools.english-numbers.texts.hint-batch-english') }}</p>
        </c-card>

        <c-card :title="t('tools.english-numbers.texts.title-result')" mt-3>
          <BatchResultTable
            :rows="englishRows"
            :filename="t('tools.english-numbers.texts.file-to-number')"
            :input-label="t('tools.english-numbers.texts.col-english')"
            :output-label="t('tools.english-numbers.texts.col-number')"
          />
        </c-card>
      </n-tab-pane>
    </n-tabs>
  </div>
</template>
