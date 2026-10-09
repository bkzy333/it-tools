<script setup lang="ts">
/**
 * 实时汇率换算器。
 *
 * 行为规格来自参考站 https://www.bauniv.cn/currency-converter/ 的生产源码
 * （该站是单文件静态页，非 Next.js，逻辑全在 <script> 里）：
 *   - 数据源 GET https://api.fxratesapi.com/latest（免 key、CORS 放开）
 *   - 换算口径：usd = amount / rates[from]；result = usd * rates[to]；toFixed(4)
 *   - 接口失败走内置备用汇率表；提供「刷新汇率」按钮 + 每 30 分钟自动刷新
 *   - 相对 USD 的汇率表 + 「最后更新」相对时间
 *
 * 这里不做二次计算：换算逻辑收敛在 currency.service.ts，静态 HTML 与运行时
 * 两个样就是 cloaking（AdSense 封号级）。参考站的视觉壳（渐变背景、卡片）不搬，
 * 样式沿用本站 naive-ui 主题。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { code, countries, country } from 'currency-codes-ts';
import ToolExampleButton from '@/components/ToolExampleButton.vue';
import { useQueryParam } from '@/composable/queryParams';
import {
  CURRENCY_FLAGS,
  FALLBACK_RATES,
  POPULAR_CURRENCIES,
  TABLE_CURRENCIES,
  convert,
  fetchLiveRates,
  type RatesSnapshot,
} from './currency.service';

const { t } = useI18n();

/* ---------------------------------------------------------------- 货币清单 */

// 汇率接口返回的是大写 ISO key，这里列出可兑换的币种清单。
// 名称从 currency-codes-ts 兜底取英文名，主流币种额外给中文名（见 CURRENCY_NAMES）。
const CURRENCY_NAMES: Record<string, string> = {
  USD: '美元',
  EUR: '欧元',
  GBP: '英镑',
  JPY: '日元',
  CNY: '人民币',
  KRW: '韩元',
  HKD: '港币',
  CAD: '加元',
  AUD: '澳元',
  CHF: '瑞郎',
  SGD: '新币',
  INR: '印度卢比',
  RUB: '卢布',
  BRL: '巴西雷亚尔',
  MXN: '墨西哥比索',
  SEK: '瑞典克朗',
};

function currencyName(codeValue: string): string {
  const c = code(codeValue);
  const cn = CURRENCY_NAMES[codeValue.toUpperCase()];
  const en = c?.currency ?? codeValue;
  return cn ? `${cn}（${en}）` : en;
}

/* ---------------------------------------------------------------- 输入状态 */

// 约定：每个工具都要有 exampleData + 「一键示例」按钮，空输入框是跳出率最高的形态。
const exampleData = {
  amount: 100,
  from: 'CNY',
  to: 'USD',
};

const amount = useQueryParam<number>({ tool: 'currency-conv', name: 'amount', defaultValue: 100 });
const fromCurrency = useQueryParam<string>({ tool: 'currency-conv', name: 'from', defaultValue: 'CNY' });
const toCurrency = useQueryParam<string>({ tool: 'currency-conv', name: 'to', defaultValue: 'USD' });

/* ---------------------------------------------------------------- 汇率状态 */

const rates = ref<Record<string, number>>(FALLBACK_RATES);
const snapshot = ref<RatesSnapshot | null>(null);
const loading = ref(false);
const hasError = ref(false);

let autoRefreshTimer: ReturnType<typeof setInterval> | undefined;

/** 加载汇率（刷新按钮 + 首次加载 + 定时器共用） */
async function loadRates() {
  loading.value = true;
  hasError.value = false;
  const snap = await fetchLiveRates();
  if (snap) {
    rates.value = snap.rates;
    snapshot.value = snap;
  } else {
    // 接口失败：走备用汇率表（与参考站 useFallbackRates 一致）
    rates.value = FALLBACK_RATES;
    snapshot.value = null;
    hasError.value = true;
  }
  loading.value = false;
}

onMounted(() => {
  loadRates();
  // 参考站每 30 分钟自动刷新一次
  autoRefreshTimer = setInterval(loadRates, 30 * 60 * 1000);
});
onBeforeUnmount(() => {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
  }
});

/* ---------------------------------------------------------------- 计算结果 */

const result = computed<number | null>(() => convert(amount.value, fromCurrency.value, toCurrency.value, rates.value));

const resultText = computed(() => {
  if (result.value === null) {
    return 'N/A';
  }
  return result.value.toLocaleString('zh-CN', { maximumFractionDigits: 4 });
});

/** 相对更新时间（「刚刚 / N 分钟前 / N 小时前」） */
const lastUpdatedText = computed(() => {
  if (!snapshot.value?.date) {
    return t('tools.currency-converter.texts.updated-fallback');
  }
  const updated = new Date(`${snapshot.value.date}T00:00:00`);
  const diffMinutes = Math.floor((Date.now() - updated.getTime()) / (1000 * 60));
  if (diffMinutes < 1) {
    return t('tools.currency-converter.texts.updated-now');
  }
  if (diffMinutes < 60) {
    return t('tools.currency-converter.texts.updated-minutes', { n: diffMinutes });
  }
  return t('tools.currency-converter.texts.updated-hours', { n: Math.floor(diffMinutes / 60) });
});

/** 相对 USD 的汇率表（参考站 SOURCE 的固定 11 币种顺序） */
const tableRows = computed(() =>
  TABLE_CURRENCIES.map((c) => ({
    code: c,
    flag: CURRENCY_FLAGS[c] ?? '🌍',
    name: currencyName(c),
    rate: rates.value[c] != null ? Number(rates.value[c].toFixed(4)) : null,
  })),
);

/* ---------------------------------------------------------------- 交互 */

function swapCurrencies() {
  const tmp = fromCurrency.value;
  fromCurrency.value = toCurrency.value;
  toCurrency.value = tmp;
}

function loadExample() {
  amount.value = exampleData.amount;
  fromCurrency.value = exampleData.from;
  toCurrency.value = exampleData.to;
}

function flagFor(codeValue: string) {
  return CURRENCY_FLAGS[codeValue.toUpperCase()] ?? '🌍';
}

/* ---------------------------------------------------------------- 国家↔货币参考卡 */

const countryToCurrenciesInput = ref('France');
const allCountries = countries();
const countryToCurrenciesOutput = computed(() => country(countryToCurrenciesInput.value));

const currencyToCountriesInput = ref('eur');
const currencyToCountriesOutput = computed(() => code(currencyToCountriesInput.value));
</script>

<template>
  <div>
    <c-card :title="t('tools.currency-converter.texts.title-currency-converter')" mb-2>
      <!-- 状态栏：最后更新 / 加载中 / 错误提示 -->
      <div mb-3 flex flex-wrap items-center gap-3 text-sm>
        <span v-if="loading" text-muted>{{ t('tools.currency-converter.texts.loading') }}</span>
        <span v-else text-muted>🕒 {{ t('tools.currency-converter.texts.last-updated') }} {{ lastUpdatedText }}</span>
        <n-alert v-if="hasError" type="warning" :show-icon="false" :bordered="false" flex-1>
          {{ t('tools.currency-converter.texts.fetch-error') }}
        </n-alert>
      </div>

      <!-- 换算主体：金额 + 从/到货币 -->
      <div flex flex-col gap-2 sm:flex-row sm:items-end>
        <n-form-item :label="t('tools.currency-converter.texts.label-amount')" label-placement="top" flex-1 mb-0>
          <n-input-number-i18n v-model:value="amount" :min="0" w-full />
        </n-form-item>

        <c-select
          v-model:value="fromCurrency"
          :label="t('tools.currency-converter.texts.label-from')"
          label-position="top"
          searchable
          :options="TABLE_CURRENCIES.map((c) => ({ value: c, label: `${flagFor(c)} ${c} - ${currencyName(c)}` }))"
          flex-1
        />

        <n-button secondary circle mb-1 :title="t('tools.currency-converter.texts.swap')" @click="swapCurrencies">
          ⇄
        </n-button>

        <c-select
          v-model:value="toCurrency"
          :label="t('tools.currency-converter.texts.label-to')"
          label-position="top"
          searchable
          :options="TABLE_CURRENCIES.map((c) => ({ value: c, label: `${flagFor(c)} ${c} - ${currencyName(c)}` }))"
          flex-1
        />
      </div>

      <!-- 结果 -->
      <n-form-item :label="t('tools.currency-converter.texts.label-result')" label-placement="top" mt-3 mb-0>
        <div text-xl font-bold>
          {{ flagFor(toCurrency) }} {{ resultText }}
        </div>
      </n-form-item>

      <div mt-4 flex flex-wrap gap-2>
        <ToolExampleButton @click="loadExample" />
        <n-button secondary @click="loadRates">
          🔄 {{ t('tools.currency-converter.texts.refresh') }}
        </n-button>
      </div>

      <!-- 热门货币快捷按钮 -->
      <div mt-4>
        <div mb-2 text-sm font-medium>{{ t('tools.currency-converter.texts.title-popular') }}</div>
        <div flex flex-wrap gap-2>
          <n-tag
            v-for="c in POPULAR_CURRENCIES"
            :key="c"
            round
            :bordered="false"
            :type="toCurrency === c || fromCurrency === c ? 'primary' : 'default'"
            cursor-pointer
            @click="toCurrency = c"
          >
            {{ CURRENCY_FLAGS[c] ?? '🌍' }} {{ c }}
          </n-tag>
        </div>
      </div>
    </c-card>

    <!-- 实时汇率表（相对 USD） -->
    <c-card :title="t('tools.currency-converter.texts.title-rates-table')" mb-2>
      <n-data-table
        :columns="[
          { title: t('tools.currency-converter.texts.col-currency'), key: 'currency' },
          { title: t('tools.currency-converter.texts.col-code'), key: 'code' },
          { title: t('tools.currency-converter.texts.col-rate'), key: 'rate' },
        ]"
        :data="tableRows.map((r) => ({ currency: `${r.flag} ${r.name}`, code: r.code, rate: r.rate == null ? 'N/A' : String(r.rate) }))"
        :bordered="false"
        size="small"
      />
    </c-card>

    <c-card :title="t('tools.currency-converter.texts.title-country-to-currencies')" mb-2>
      <c-select
        v-model:value="countryToCurrenciesInput"
        :label="t('tools.currency-converter.texts.label-country')"
        label-position="left"
        searchable
        :options="allCountries"
      />

      <n-divider />

      <ul>
        <li v-for="(currency, ix) in countryToCurrenciesOutput" :key="ix">
          {{ currency.currency }} [{{ currency.code }}/{{ currency.number }} - {{ currency.digits }}digits] (also in:
          {{ currency.countries?.join(', ') }})
        </li>
      </ul>
    </c-card>

    <c-card :title="t('tools.currency-converter.texts.title-currencies-to-countries')" mb-2>
      <c-select
        v-model:value="currencyToCountriesInput"
        :label="t('tools.currency-converter.texts.label-currency')"
        label-position="left"
        searchable
        :options="TABLE_CURRENCIES.map((c) => ({ value: c.toLowerCase(), label: `${c} - ${currencyName(c)}` }))"
      />

      <n-divider />

      <n-p v-if="currencyToCountriesOutput">
        {{ currencyToCountriesOutput.currency }} [{{ currencyToCountriesOutput.code }}/{{
          currencyToCountriesOutput.number
        }}
        - {{ currencyToCountriesOutput.digits }}digits]
      </n-p>

      <ul v-if="currencyToCountriesOutput">
        <li v-for="(countryName, ix) in currencyToCountriesOutput.countries" :key="ix">
          {{ countryName }}
        </li>
      </ul>
    </c-card>
  </div>
</template>
