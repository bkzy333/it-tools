<script setup lang="ts">
/**
 * 金额大写转换器 —— 人民币大写 / 英文大写金额 / 数字英文互转四合一（2026-10 融合）。
 *
 * 融合来源（原三个独立工具的 slug 已 301 到本页 /rmb-numbers）：
 * - rmb-numbers（人民币大写）：单笔大字号着色 + 批量表格
 * - english-amount（英文大写金额）：SAY + 币种 + 金额 + ONLY，6 币种
 * - english-numbers（数字 ↔ 英文读数）：双向批量互转
 *
 * UX 契约（对齐全站批量层 U1~U4）：
 * - 输入切分走共享层 splitTokens（换行 / 逗号 / 顿号 / 自定义，空行静默忽略）
 * - 结果走共享层 BatchResultTable（行对行、逐行复制、复制全部、导出 TXT/Excel）
 * - 逐条 try/catch：单条失败只把那一行标红，其余行照常出结果
 * - 人民币大写 tab 保留单笔大字号着色展示（本工具招牌 UX，BatchResultTable 之外的特例分支）
 *
 * 各 tab 分隔符刻意不同：
 * - 人民币大写 / 数字转英文：四种全给（parseAmount / normalizeNumberInput 已处理千分位逗号）
 * - 英文大写金额：不给「逗号分隔」——金额的千分位逗号常见，按逗号切会把 1,234.56 切成两条
 * - 英文读数转数字：只给「换行 / 自定义」——读数自带逗号（one thousand, two hundred），
 *   提供「逗号分隔」是必然的误用
 */
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useThemeVars } from 'naive-ui';
import { rmb, rmbText } from './rmb-numbers.service';
import { amountToEnglish, CURRENCIES } from './english-amount.service';
import { englishToNumber, normalizeNumberInput, numberToEnglish } from './english-numbers.service';
import { splitTokens, type BatchRow, type SepMode } from '@/composable/batchSplit';
import { useQueryParam } from '@/composable/queryParams';
import { useCopy } from '@/composable/copy';
import BatchResultTable from '@/components/BatchResultTable.vue';
import CopyExportBar from '@/components/CopyExportBar.vue';

const { t } = useI18n();
const themeVars = useThemeVars();
const { copy } = useCopy();

type TabKey = 'rmb' | 'en-amount' | 'en-number' | 'en-to-number';

const tab = ref<TabKey>('rmb');

// 人民币大写 tab 的输入走 query param（兼容既有外链分享），其余 tab 用普通状态
const rmbInputText = useQueryParam<string>({ tool: 'rmb-conv', name: 'amounts', defaultValue: '1314.52\n23\n1000000' });
const rmbSep = ref<SepMode>('newline');
const rmbCustomSep = ref('');

interface TabState {
  text: string;
  sep: SepMode;
  custom: string;
}

const inputs = reactive<Record<Exclude<TabKey, 'rmb'>, TabState>>({
  'en-amount': { text: '', sep: 'newline', custom: '' },
  'en-number': { text: '', sep: 'newline', custom: '' },
  'en-to-number': { text: '', sep: 'newline', custom: '' },
});

// 各 tab 专属选项
const currencyCode = ref('USD');
const fullForm = ref(true);
const amountHyphenated = ref(true);
const numberHyphenated = ref(true);
const useComma = ref(true);

const currencyOptions = computed(() =>
  CURRENCIES.map((c) => ({ label: `${c.code} - ${c.name}`, value: c.code })),
);

/** 人民币大写输入解析：容忍千分位逗号与 ¥ 符号，拒绝负数与非数字 */
function parseAmount(raw: string): number | null {
  let tok = raw.trim();
  // 非逗号分隔模式下，先去掉千分位逗号
  if (rmbSep.value !== 'comma') {
    tok = tok.replace(/,/g, '');
  }
  tok = tok.replace(/[¥￥\s]/g, '');
  if (tok === '') {
    return null;
  }
  const n = Number(tok);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const rmbRows = computed<BatchRow[]>(() =>
  splitTokens(rmbInputText.value, rmbSep.value, rmbCustomSep.value).map((raw) => {
    const n = parseAmount(raw);
    if (n === null) {
      return { input: raw, output: t('tools.rmb-numbers.texts.text-invalid'), error: true };
    }
    return { input: raw, output: rmbText(n), error: false };
  }),
);

const enAmountRows = computed<BatchRow[]>(() =>
  splitTokens(inputs['en-amount'].text, inputs['en-amount'].sep, inputs['en-amount'].custom).map((raw) => {
    try {
      return {
        input: raw,
        output: amountToEnglish(raw, {
          currencyCode: currencyCode.value,
          fullForm: fullForm.value,
          hyphenated: amountHyphenated.value,
        }),
        error: false,
      };
    }
    catch (e) {
      return { input: raw, output: (e as Error).message, error: true };
    }
  }),
);

const enNumberRows = computed<BatchRow[]>(() =>
  splitTokens(inputs['en-number'].text, inputs['en-number'].sep, inputs['en-number'].custom).map((raw) => {
    try {
      return {
        input: raw,
        output: numberToEnglish(normalizeNumberInput(raw), {
          hyphenated: numberHyphenated.value,
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

const enToNumberRows = computed<BatchRow[]>(() =>
  splitTokens(inputs['en-to-number'].text, inputs['en-to-number'].sep, inputs['en-to-number'].custom).map((raw) => {
    try {
      return { input: raw, output: englishToNumber(raw), error: false };
    }
    catch (e) {
      return { input: raw, output: (e as Error).message, error: true };
    }
  }),
);

/** 单笔特例：人民币大写 tab 仅一条合法输入时切换为大字号着色展示 */
const rmbSingle = computed(() => {
  if (rmbRows.value.length !== 1 || rmbRows.value[0].error) {
    return null;
  }
  const value = parseAmount(rmbRows.value[0].input) as number;
  return { value, fragments: rmb(value), text: rmbText(value) };
});

const exampleData: Record<TabKey, string> = {
  rmb: '1314.52\n23\n1000000',
  'en-amount': '1234.56\n9876.5',
  'en-number': '1234567.89\n42\n-5\n3.14\n1,000',
  'en-to-number': 'one million, two hundred thirty-four thousand, five hundred sixty-seven\ntwenty-one\nminus five',
};

function loadExample() {
  if (tab.value === 'rmb') {
    rmbInputText.value = exampleData.rmb;
    rmbSep.value = 'newline';
    rmbCustomSep.value = '';
  }
  else {
    inputs[tab.value].text = exampleData[tab.value];
    inputs[tab.value].sep = 'newline';
    inputs[tab.value].custom = '';
  }
  if (tab.value === 'en-amount') {
    currencyCode.value = 'USD';
    fullForm.value = true;
    amountHyphenated.value = true;
  }
  if (tab.value === 'en-number') {
    numberHyphenated.value = true;
    useComma.value = true;
  }
}
</script>

<template>
  <div flex flex-col gap-3>
    <div flex justify-end>
      <ToolExampleButton @click="loadExample" />
    </div>

    <n-tabs v-model:value="tab" type="line">
      <!-- 人民币大写（默认 tab） -->
      <n-tab-pane name="rmb" :tab="t('tools.rmb-numbers.texts.tab-rmb')">
        <c-card :title="t('tools.rmb-numbers.texts.title-lower-case-amount')" mt-3>
          <n-input
            v-model:value="rmbInputText"
            type="textarea"
            :autosize="{ minRows: 4, maxRows: 16 }"
            :placeholder="t('tools.rmb-numbers.texts.placeholder-enter-the-amount-in-lowercase-example-1314-52')"
            w-full
          />

          <div flex flex-wrap items-center gap-3 mt-3>
            <span text-sm op-70>{{ t('tools.rmb-numbers.texts.label-separator') }}</span>
            <n-radio-group v-model:value="rmbSep" size="small">
              <n-radio value="newline">{{ t('tools.rmb-numbers.texts.sep-newline') }}</n-radio>
              <n-radio value="comma">{{ t('tools.rmb-numbers.texts.sep-comma') }}</n-radio>
              <n-radio value="pause">{{ t('tools.rmb-numbers.texts.sep-pause') }}</n-radio>
              <n-radio value="custom">{{ t('tools.rmb-numbers.texts.sep-custom') }}</n-radio>
            </n-radio-group>
            <n-input
              v-if="rmbSep === 'custom'"
              v-model:value="rmbCustomSep"
              size="small"
              :placeholder="t('tools.rmb-numbers.texts.placeholder-custom-separator')"
              style="width: 220px"
            />
          </div>

          <p mt-2 mb-0 text-xs op-60>{{ t('tools.rmb-numbers.texts.tip-batch') }}</p>
        </c-card>

        <c-card :title="t('tools.rmb-numbers.texts.title-amount-in-capital-letters')" mt-3 flex flex-col>
          <!-- 单笔：大字号着色展示 -->
          <div v-if="rmbSingle" flex flex-col items-center gap-4>
            <div m-0 text-center>
              <span v-for="(item, index) in rmbSingle.fragments" :key="index" :class="item.type">
                {{ item.value }}
              </span>
            </div>
            <CopyExportBar
              :text="rmbSingle.text"
              filename="rmb-numbers"
              :rows="[[rmbRows[0].input, rmbSingle.text]]"
            />
          </div>

          <!-- 批量：逐行对应表格 -->
          <BatchResultTable
            v-else
            :rows="rmbRows"
            filename="rmb-numbers"
            :input-label="t('tools.rmb-numbers.texts.col-input')"
            :output-label="t('tools.rmb-numbers.texts.col-output')"
          />
        </c-card>
      </n-tab-pane>

      <!-- 英文大写金额 -->
      <n-tab-pane name="en-amount" :tab="t('tools.rmb-numbers.texts.tab-en-amount')">
        <c-card :title="t('tools.rmb-numbers.texts.title-en-amount')" mt-3>
          <n-input
            v-model:value="inputs['en-amount'].text"
            type="textarea"
            :autosize="{ minRows: 4, maxRows: 16 }"
            :placeholder="t('tools.rmb-numbers.texts.placeholder-en-amount')"
            w-full
          />

          <div flex flex-wrap items-center gap-3 mt-3>
            <span text-sm op-70>{{ t('tools.rmb-numbers.texts.label-separator') }}</span>
            <n-radio-group v-model:value="inputs['en-amount'].sep" size="small">
              <n-radio value="newline">{{ t('tools.rmb-numbers.texts.sep-newline') }}</n-radio>
              <n-radio value="pause">{{ t('tools.rmb-numbers.texts.sep-pause') }}</n-radio>
              <n-radio value="custom">{{ t('tools.rmb-numbers.texts.sep-custom') }}</n-radio>
            </n-radio-group>
            <n-input
              v-if="inputs['en-amount'].sep === 'custom'"
              v-model:value="inputs['en-amount'].custom"
              size="small"
              :placeholder="t('tools.rmb-numbers.texts.placeholder-custom-separator')"
              style="width: 220px"
            />
          </div>

          <n-space mt-3 vertical>
            <c-select
              v-model:value="currencyCode"
              :label="t('tools.rmb-numbers.texts.label-currency')"
              label-position="left"
              :options="currencyOptions"
            />
            <n-checkbox v-model:checked="fullForm">
              {{ t('tools.rmb-numbers.texts.opt-full-form') }}
            </n-checkbox>
            <n-checkbox v-model:checked="amountHyphenated">
              {{ t('tools.rmb-numbers.texts.opt-hyphenated') }}
            </n-checkbox>
          </n-space>

          <p mt-2 mb-0 text-xs op-60>{{ t('tools.rmb-numbers.texts.note-en-amount') }}</p>
        </c-card>

        <c-card :title="t('tools.rmb-numbers.texts.title-en-amount-result')" mt-3>
          <BatchResultTable
            :rows="enAmountRows"
            filename="english-amount"
            :input-label="t('tools.rmb-numbers.texts.col-input')"
            :output-label="t('tools.rmb-numbers.texts.col-en-amount-output')"
          />
        </c-card>
      </n-tab-pane>

      <!-- 数字 → 英文读数 -->
      <n-tab-pane name="en-number" :tab="t('tools.rmb-numbers.texts.tab-en-number')">
        <c-card :title="t('tools.rmb-numbers.texts.title-number-input')" mt-3>
          <n-input
            v-model:value="inputs['en-number'].text"
            type="textarea"
            :autosize="{ minRows: 4, maxRows: 16 }"
            :placeholder="t('tools.rmb-numbers.texts.placeholder-number')"
            w-full
          />

          <div flex flex-wrap items-center gap-3 mt-3>
            <span text-sm op-70>{{ t('tools.rmb-numbers.texts.label-separator') }}</span>
            <n-radio-group v-model:value="inputs['en-number'].sep" size="small">
              <n-radio value="newline">{{ t('tools.rmb-numbers.texts.sep-newline') }}</n-radio>
              <n-radio value="comma">{{ t('tools.rmb-numbers.texts.sep-comma') }}</n-radio>
              <n-radio value="pause">{{ t('tools.rmb-numbers.texts.sep-pause') }}</n-radio>
              <n-radio value="custom">{{ t('tools.rmb-numbers.texts.sep-custom') }}</n-radio>
            </n-radio-group>
            <n-input
              v-if="inputs['en-number'].sep === 'custom'"
              v-model:value="inputs['en-number'].custom"
              size="small"
              :placeholder="t('tools.rmb-numbers.texts.placeholder-custom-separator')"
              style="width: 220px"
            />
          </div>

          <n-space mt-3>
            <n-checkbox v-model:checked="numberHyphenated">
              {{ t('tools.rmb-numbers.texts.opt-hyphenated') }}
            </n-checkbox>
            <n-checkbox v-model:checked="useComma">
              {{ t('tools.rmb-numbers.texts.opt-comma') }}
            </n-checkbox>
          </n-space>

          <p mt-2 mb-0 text-xs op-60>{{ t('tools.rmb-numbers.texts.hint-batch-number') }}</p>
        </c-card>

        <c-card :title="t('tools.rmb-numbers.texts.title-result')" mt-3>
          <BatchResultTable
            :rows="enNumberRows"
            filename="to-english"
            :input-label="t('tools.rmb-numbers.texts.col-number')"
            :output-label="t('tools.rmb-numbers.texts.col-english')"
          />
        </c-card>
      </n-tab-pane>

      <!-- 英文读数 → 数字 -->
      <n-tab-pane name="en-to-number" :tab="t('tools.rmb-numbers.texts.tab-en-to-number')">
        <c-card :title="t('tools.rmb-numbers.texts.title-english-input')" mt-3>
          <n-input
            v-model:value="inputs['en-to-number'].text"
            type="textarea"
            :autosize="{ minRows: 4, maxRows: 16 }"
            :placeholder="t('tools.rmb-numbers.texts.placeholder-english')"
            w-full
          />

          <div flex flex-wrap items-center gap-3 mt-3>
            <span text-sm op-70>{{ t('tools.rmb-numbers.texts.label-separator') }}</span>
            <n-radio-group v-model:value="inputs['en-to-number'].sep" size="small">
              <n-radio value="newline">{{ t('tools.rmb-numbers.texts.sep-newline') }}</n-radio>
              <n-radio value="custom">{{ t('tools.rmb-numbers.texts.sep-custom') }}</n-radio>
            </n-radio-group>
            <n-input
              v-if="inputs['en-to-number'].sep === 'custom'"
              v-model:value="inputs['en-to-number'].custom"
              size="small"
              :placeholder="t('tools.rmb-numbers.texts.placeholder-custom-separator')"
              style="width: 220px"
            />
          </div>

          <p mt-2 mb-0 text-xs op-60>{{ t('tools.rmb-numbers.texts.hint-batch-english') }}</p>
        </c-card>

        <c-card :title="t('tools.rmb-numbers.texts.title-result')" mt-3>
          <BatchResultTable
            :rows="enToNumberRows"
            filename="to-number"
            :input-label="t('tools.rmb-numbers.texts.col-english')"
            :output-label="t('tools.rmb-numbers.texts.col-number')"
          />
        </c-card>
      </n-tab-pane>
    </n-tabs>
  </div>
</template>

<style lang="less" scoped>
.unit {
  font-size: 1.4em;
  color: v-bind('themeVars.successColor');
}
.number {
  font-size: 2.4em;
}
.cut {
  font-size: 1.4em;
  color: v-bind('themeVars.errorColor');
}
</style>
