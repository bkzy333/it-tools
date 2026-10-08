<script setup lang="ts">
import { computed, ref } from 'vue';
import { createToken } from '../token-generator/token-generator.service';
import { pickUnique, pickWeighted, shuffle, splitEvenly } from './random-picker.service';
import { useCopy } from '@/composable/copy';
import { useQueryParamOrStorage } from '@/composable/queryParams';
import { computedRefreshable } from '@/composable/computedRefreshable';
import ToolExampleButton from '@/components/ToolExampleButton.vue';
import type { WeightedItem } from './random-picker.service';

const { t } = useI18n();

/** 四种玩法 */
const activeTab = ref<'token' | 'lottery' | 'weighted' | 'split'>('token');

/* ------------------------------------------------------------------ 一键示例 */
const exampleData = {
  length: 32,
  count: 5,
  candidates: '张三\n李四\n王五\n赵六\n孙七',
  weightedInput: '张三,5\n李四,3\n王五,1',
  splitInput: '房东,2\n二房东,1\n租户,1',
  splitAmount: 10000,
};

function loadExample() {
  length.value = exampleData.length;
  count.value = exampleData.count;
  candidates.value = exampleData.candidates;
  weightedInput.value = exampleData.weightedInput;
  splitInput.value = exampleData.splitInput;
  splitAmount.value = exampleData.splitAmount;
}

/* ------------------------------------------------------------------ 1. 随机令牌 */
const count = useQueryParamOrStorage({ name: 'count', storageName: 'rnd-pick:count', defaultValue: 1 });
const length = useQueryParamOrStorage({ name: 'length', storageName: 'rnd-pick:length', defaultValue: 64 });
const toUpper = useQueryParamOrStorage<boolean>({
  name: 'uppercase',
  storageName: 'rnd-pick:uppercase',
  defaultValue: false,
});
const deniedChars = useQueryParamOrStorage<string>({
  name: 'deny',
  storageName: 'rnd-pick:deny',
  defaultValue: '',
});
const numberMode = useQueryParamOrStorage<'hexa' | 'dec'>({
  name: 'mode',
  storageName: 'rnd-pick:mode',
  defaultValue: 'hexa',
});

function transformCase(s: string) {
  return toUpper.value ? s.toUpperCase() : s.toLowerCase();
}

function makeTokens() {
  return transformCase(
    Array.from({ length: Math.max(1, count.value) }, () =>
      createToken({
        length: Math.max(1, length.value),
        withUppercase: false,
        withLowercase: false,
        withNumbers: numberMode.value === 'dec',
        withHexaNumbers: numberMode.value === 'hexa',
        withSymbols: false,
        deniedChars: deniedChars.value,
      }),
    ).join('\n'),
  );
}

const [tokens, refreshTokens] = computedRefreshable(makeTokens);
const { copy: copyTokens } = useCopy({ source: tokens, text: t('tools.random-picker.copied') });

/* ------------------------------------------------------------------ 2. 抽签与打乱 */
const candidates = ref('张三\n李四\n王五\n赵六\n孙七');
const lotteryMode = ref<'pick' | 'shuffle'>('pick');
const pickCount = ref(2);

function makeLottery() {
  const list = candidates.value
    .split(/[\n,，、;；]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 0) return '';
  return lotteryMode.value === 'shuffle'
    ? shuffle(list).join('\n')
    : pickUnique(list, pickCount.value).join('\n');
}
const [lotteryResult, reroll] = computedRefreshable(makeLottery);
const { copy: copyLottery } = useCopy({ source: lotteryResult, text: t('tools.random-picker.copied') });

const candidateList = computed(() =>
  candidates.value
    .split(/[\n,，、;；]+/)
    .map((s) => s.trim())
    .filter(Boolean),
);
const pickHint = computed(() => {
  if (candidateList.value.length === 0) return t('tools.random-picker.texts.message-candidates-empty');
  if (lotteryMode.value !== 'pick') return '';
  const n = candidateList.value.length;
  if (pickCount.value > n) return t('tools.random-picker.texts.message-not-enough', { n: n, m: pickCount.value });
  return '';
});

/* ------------------------------------------------------------------ 3. 加权抽样 */
const weightedInput = ref('张三,5\n李四,3\n王五,1');
const weightedCount = ref(3);
const weightedUnique = ref(true);

function parseWeightedLines(text: string) {
  const items: WeightedItem<string>[] = [];
  const bad: string[] = [];
  text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((line, i) => {
      const parts = line.split(/[\s,，:：\t]+/).filter(Boolean);
      // 至少两段才认为写了权重；「张三」这种单行按权重 1 处理
      const name = parts.length >= 2 ? parts[0] : line;
      const weightRaw = parts.length >= 2 ? parts[parts.length - 1] : '1';
      const weight = Number.parseFloat(weightRaw);
      if (!name || !Number.isFinite(weight)) {
        bad.push(`${i + 1}`);
        return;
      }
      items.push({ value: name, weight });
    });
  return { items, bad };
}

const weightedParsed = computed(() => parseWeightedLines(weightedInput.value));
const weightedHint = computed(() => {
  if (weightedParsed.value.items.length === 0) return t('tools.random-picker.texts.message-weighted-empty');
  if (weightedParsed.value.bad.length > 0) {
    return `${t('tools.random-picker.texts.message-weighted-bad')}：${weightedParsed.value.bad.join('、')}`;
  }
  return '';
});

function makeWeighted() {
  const parsed = parseWeightedLines(weightedInput.value);
  if (parsed.items.length === 0) return '';
  return pickWeighted(parsed.items, weightedCount.value, weightedUnique.value).join('\n');
}
const [weightedResult, rerollWeighted] = computedRefreshable(makeWeighted);
const { copy: copyWeighted } = useCopy({ source: weightedResult, text: t('tools.random-picker.copied') });

/* ------------------------------------------------------------------ 4. 按权重分摊 */
const splitInput = ref('房东,2\n二房东,1\n租户,1');
const splitAmount = ref(10000);
const splitDecimals = ref(2);

const splitParsed = computed(() => parseWeightedLines(splitInput.value));
const splitHint = computed(() => {
  if (splitParsed.value.items.length === 0) return t('tools.random-picker.texts.message-split-empty');
  if (splitParsed.value.bad.length > 0) {
    return `${t('tools.random-picker.texts.message-split-bad')}：${splitParsed.value.bad.join('、')}`;
  }
  return '';
});

const splitResult = computed(() => {
  const parsed = parseWeightedLines(splitInput.value);
  if (parsed.items.length === 0) return '';
  const parts = splitEvenly(
    parsed.items.map((it) => it.weight),
    splitAmount.value,
    splitDecimals.value,
  );
  const scale = 10 ** Math.max(0, Math.min(6, Math.floor(splitDecimals.value)));
  const sum = parts.reduce((s, v) => s + Math.round(v * scale), 0);
  const target = Math.round(splitAmount.value * scale);
  return [`${t('tools.random-picker.texts.label-split-result')}`, ...parts.map((v, i) => `${parsed.items[i].value}\t${v.toFixed(splitDecimals.value)}`)].join('\n')
    + `\n${t('tools.random-picker.texts.label-split-sum')}：${(sum / scale).toFixed(splitDecimals.value)} / ${(target / scale).toFixed(splitDecimals.value)}`
    + (sum === target ? ` · ${t('tools.random-picker.texts.message-split-balanced')}` : '');
});
const { copy: copySplit } = useCopy({ source: splitResult, text: t('tools.random-picker.copied') });
</script>

<template>
  <c-card>
    <n-tabs v-model:value="activeTab" type="line" animated>
      <!-- ------------------------------------------------ 随机令牌 -->
      <n-tab-pane name="token" :tab="t('tools.random-picker.tab-token')">
        <div flex items-center justify-between gap-2>
          <ToolExampleButton @click="loadExample" />
        </div>
        <p text-sm opacity-70 mb-3>{{ t('tools.random-picker.tab-token-desc') }}</p>
        <n-form label-placement="left" label-width="150">
          <n-space justify="center">
            <n-form-item label-placement="left">
              <n-radio-group v-model:value="numberMode">
                <n-radio value="hexa">{{ t('tools.random-picker.texts.tag-hexadecimal') }}</n-radio>
                <n-radio value="dec">{{ t('tools.random-picker.texts.tag-decimal') }}</n-radio>
              </n-radio-group>
            </n-form-item>
            <n-form-item :label="t('tools.random-picker.texts.label-toupper')">
              <n-switch v-model:value="toUpper" />
            </n-form-item>
          </n-space>
        </n-form>

        <n-form-item :label="t('tools.random-picker.texts.label-denied-characters')" label-placement="top">
          <c-input-text
            v-model:value="deniedChars"
            :placeholder="t('tools.random-picker.texts.placeholder-put-characters-to-deny-from-number')"
          />
        </n-form-item>

        <n-form-item :label="`${t('tools.random-picker.length')} (${length})`" label-placement="left">
          <n-slider v-model:value="length" :step="1" :min="1" :max="512" mr-2 />
          <n-input-number-i18n v-model:value="length" :min="1" :max="512" size="small" />
        </n-form-item>

        <n-form-item :label="t('tools.random-picker.texts.label-number-of-number-to-generate')" label-placement="left">
          <n-slider v-model:value="count" :step="1" :min="1" mr-2 />
          <n-input-number-i18n v-model:value="count" :min="1" size="small" />
        </n-form-item>

        <c-input-text
          v-model:value="tokens"
          multiline
          :placeholder="t('tools.random-picker.numberPlaceholder')"
          readonly
          rows="3"
          autosize
          word-wrap
        />

        <div mt-5 flex justify-center gap-3>
          <c-button @click="copyTokens()">{{ t('tools.random-picker.button.copy') }}</c-button>
          <c-button @click="refreshTokens">{{ t('tools.random-picker.button.refresh') }}</c-button>
        </div>
      </n-tab-pane>

      <!-- ------------------------------------------------ 抽签与打乱 -->
      <n-tab-pane name="lottery" :tab="t('tools.random-picker.tab-lottery')">
        <div flex items-center justify-between gap-2>
          <ToolExampleButton @click="loadExample" />
        </div>
        <p text-sm opacity-70 mb-3>{{ t('tools.random-picker.tab-lottery-desc') }}</p>

        <n-form-item :label="t('tools.random-picker.texts.label-candidates')" label-placement="top">
          <n-input
            v-model:value="candidates"
            type="textarea"
            :rows="6"
            :placeholder="t('tools.random-picker.texts.placeholder-candidates')"
          />
        </n-form-item>

        <n-form-item :label="t('tools.random-picker.texts.label-lottery-mode')" label-placement="left">
          <n-radio-group v-model:value="lotteryMode">
            <n-radio value="pick">{{ t('tools.random-picker.texts.mode-pick') }}</n-radio>
            <n-radio value="shuffle">{{ t('tools.random-picker.texts.mode-shuffle') }}</n-radio>
          </n-radio-group>
        </n-form-item>

        <n-form-item v-if="lotteryMode === 'pick'" :label="t('tools.random-picker.texts.label-pick-count')" label-placement="left">
          <n-input-number v-model:value="pickCount" :min="1" size="small" />
        </n-form-item>

        <n-text v-if="pickHint" depth="3" text-sm>{{ pickHint }}</n-text>

        <c-input-text
          v-model:value="lotteryResult"
          multiline
          :placeholder="t('tools.random-picker.numberPlaceholder')"
          readonly
          rows="4"
          autosize
          word-wrap
        />

        <div mt-5 flex justify-center gap-3>
          <c-button @click="copyLottery()">{{ t('tools.random-picker.button.copy') }}</c-button>
          <c-button @click="reroll">{{ t('tools.random-picker.button.refresh') }}</c-button>
        </div>
      </n-tab-pane>

      <!-- ------------------------------------------------ 加权抽样 -->
      <n-tab-pane name="weighted" :tab="t('tools.random-picker.tab-weighted')">
        <div flex items-center justify-between gap-2>
          <ToolExampleButton @click="loadExample" />
        </div>
        <p text-sm opacity-70 mb-3>{{ t('tools.random-picker.tab-weighted-desc') }}</p>

        <n-form-item :label="t('tools.random-picker.texts.label-weighted-items')" label-placement="top">
          <n-input
            v-model:value="weightedInput"
            type="textarea"
            :rows="6"
            :placeholder="t('tools.random-picker.texts.placeholder-weighted-items')"
          />
        </n-form-item>

        <n-form-item :label="t('tools.random-picker.texts.label-weighted-count')" label-placement="left">
          <n-input-number v-model:value="weightedCount" :min="1" size="small" />
        </n-form-item>

        <n-form-item :label="t('tools.random-picker.texts.label-weighted-unique')" label-placement="left">
          <n-switch v-model:value="weightedUnique" />
        </n-form-item>

        <n-text v-if="weightedHint" depth="3" text-sm>{{ weightedHint }}</n-text>

        <c-input-text
          v-model:value="weightedResult"
          multiline
          :placeholder="t('tools.random-picker.numberPlaceholder')"
          readonly
          rows="4"
          autosize
          word-wrap
        />

        <div mt-5 flex justify-center gap-3>
          <c-button @click="copyWeighted()">{{ t('tools.random-picker.button.copy') }}</c-button>
          <c-button @click="rerollWeighted">{{ t('tools.random-picker.button.refresh') }}</c-button>
        </div>
      </n-tab-pane>

      <!-- ------------------------------------------------ 按权重分摊 -->
      <n-tab-pane name="split" :tab="t('tools.random-picker.tab-split')">
        <div flex items-center justify-between gap-2>
          <ToolExampleButton @click="loadExample" />
        </div>
        <p text-sm opacity-70 mb-3>{{ t('tools.random-picker.tab-split-desc') }}</p>

        <n-form-item :label="t('tools.random-picker.texts.label-split-items')" label-placement="top">
          <n-input
            v-model:value="splitInput"
            type="textarea"
            :rows="5"
            :placeholder="t('tools.random-picker.texts.placeholder-split-items')"
          />
        </n-form-item>

        <n-form-item :label="t('tools.random-picker.texts.label-amount')" label-placement="left">
          <n-input-number v-model:value="splitAmount" :min="0" step="any" size="small" />
        </n-form-item>

        <n-form-item :label="t('tools.random-picker.texts.label-decimals')" label-placement="left">
          <n-input-number v-model:value="splitDecimals" :min="0" :max="6" size="small" />
        </n-form-item>

        <n-text v-if="splitHint" depth="3" text-sm>{{ splitHint }}</n-text>

        <c-input-text
          v-model:value="splitResult"
          multiline
          :placeholder="t('tools.random-picker.numberPlaceholder')"
          readonly
          rows="6"
          autosize
          word-wrap
        />

        <div mt-5 flex justify-center gap-3>
          <c-button @click="copySplit()">{{ t('tools.random-picker.button.copy') }}</c-button>
        </div>
      </n-tab-pane>
    </n-tabs>
  </c-card>
</template>

<style scoped lang="less">
::v-deep(.c-input-text textarea) {
  font-family: var(--font-family-mono, monospace);
}
</style>
