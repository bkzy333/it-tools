<script setup lang="ts">
/**
 * 实时汇率换算器。
 *
 * 行为规格来自参考站 https://www.bauniv.cn/currency-converter/ 的生产源码
 * （该站是单文件静态页，非 Next.js，逻辑全在 <script> 里），并在其基础上增强：
 *   - 多数据源容灾：open.er-api.com → fawazahmed0(jsDelivr) → frankfurter.dev，任意一个成功即用；
 *   - 支持「一源换多币」（例如 1 元人民币分别兑日元 / 美元 / 欧元）；
 *   - 国家↔货币参考卡补充中英文对照（国家名、货币名、流通范围均给中文小字标注）。
 *
 * 换算逻辑收敛在 currency.service.ts，静态 HTML 与运行时同源，避免 cloaking（AdSense 封号级）。
 * 视觉壳（渐变背景、卡片）不搬，样式沿用本站 naive-ui 主题。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { code, countries, country } from 'currency-codes-ts';
import ToolExampleButton from '@/components/ToolExampleButton.vue';
import { useQueryParam } from '@/composable/queryParams';
import {
  COMMON_CURRENCIES,
  CURRENCY_FLAGS,
  CURRENCY_NAMES_ZH,
  FALLBACK_RATES,
  POPULAR_CURRENCIES,
  TABLE_CURRENCIES,
  convert,
  fetchLiveRates,
  type RatesSnapshot,
} from './currency.service';

const { t } = useI18n();

/* ---------------------------------------------------------------- 货币名称 */

/** 货币中文名（缺失退回英文） */
function currencyName(codeValue: string): string {
  const c = code(codeValue);
  const cn = CURRENCY_NAMES_ZH[codeValue.toUpperCase()];
  const en = c?.currency ?? codeValue;
  return cn ? `${cn}（${en}）` : en;
}

/** 货币中文名（纯中文，缺失退回英文），用于输出列表 */
function currencyZh(codeValue: string): string {
  return CURRENCY_NAMES_ZH[codeValue.toUpperCase()] ?? code(codeValue)?.currency ?? codeValue;
}

/* ---------------------------------------------------------------- 国家中文名 */

/** 国家/地区中文名（覆盖常见国家，缺失退回英文）。香港/澳门/台湾按中国地区标注。 */
const COUNTRY_NAMES_ZH: Record<string, string> = {
  // —— 主流货币发行国/地区（来自 currency-codes-ts 精确字符串）——
  'American Samoa': '美属萨摩亚',
  Andorra: '安道尔',
  Australia: '澳大利亚',
  Austria: '奥地利',
  Belgium: '比利时',
  Bhutan: '不丹',
  'Bonaire, Sint Eustatius and Saba': '博奈尔、圣尤斯特歇斯和萨巴',
  Brazil: '巴西',
  'British Indian Ocean Territory (The)': '英属印度洋领地',
  Canada: '加拿大',
  China: '中国',
  'Christmas Island': '圣诞岛',
  'Cocos (Keeling) Islands (The)': '科科斯（基林）群岛',
  Croatia: '克罗地亚',
  Cyprus: '塞浦路斯',
  Ecuador: '厄瓜多尔',
  'El Salvador': '萨尔瓦多',
  Estonia: '爱沙尼亚',
  'European Union': '欧洲联盟',
  Finland: '芬兰',
  France: '法国',
  'French Guiana': '法属圭亚那',
  'French Southern Territories (The)': '法属南方领地',
  Germany: '德国',
  Greece: '希腊',
  Guadeloupe: '瓜德罗普',
  Guam: '关岛',
  Guernsey: '根西岛',
  Haiti: '海地',
  'Heard Island and Mcdonald Islands': '赫德岛和麦克唐纳群岛',
  'Holy See (The)': '梵蒂冈',
  'Hong Kong': '中国香港',
  India: '印度',
  Ireland: '爱尔兰',
  'Isle of Man': '马恩岛',
  Italy: '意大利',
  Japan: '日本',
  Jersey: '泽西岛',
  Kiribati: '基里巴斯',
  'Korea (The Republic Of)': '韩国',
  Latvia: '拉脱维亚',
  Liechtenstein: '列支敦士登',
  Lithuania: '立陶宛',
  Luxembourg: '卢森堡',
  Malta: '马耳他',
  'Marshall Islands (The)': '马绍尔群岛',
  Martinique: '马提尼克',
  Mayotte: '马约特',
  Mexico: '墨西哥',
  'Micronesia (Federated States Of)': '密克罗尼西亚',
  Monaco: '摩纳哥',
  Montenegro: '黑山',
  Nauru: '瑙鲁',
  'Netherlands (The)': '荷兰',
  'Norfolk Island': '诺福克岛',
  'Northern Mariana Islands (The)': '北马里亚纳群岛',
  Palau: '帕劳',
  Panama: '巴拿马',
  Portugal: '葡萄牙',
  'Puerto Rico': '波多黎各',
  'Russian Federation (The)': '俄罗斯',
  'Réunion': '留尼汪',
  'Saint Barthélemy': '圣巴泰勒米',
  'Saint Martin (French Part)': '圣马丁（法属）',
  'Saint Pierre and Miquelon': '圣皮埃尔和密克隆',
  'San Marino': '圣马力诺',
  Singapore: '新加坡',
  Slovakia: '斯洛伐克',
  Slovenia: '斯洛文尼亚',
  Spain: '西班牙',
  Sweden: '瑞典',
  Switzerland: '瑞士',
  'Timor-Leste': '东帝汶',
  'Turks and Caicos Islands (The)': '特克斯和凯科斯群岛',
  Tuvalu: '图瓦卢',
  'United Kingdom of Great Britain and Northern Ireland (The)': '英国',
  'United States Minor Outlying Islands (The)': '美国本土外小岛屿',
  'United States of America (The)': '美国',
  'Virgin Islands (British)': '英属维尔京群岛',
  'Virgin Islands (u.s.)': '美属维尔京群岛',
  'Åland Islands': '奥兰群岛',
  // —— 常见国家/地区补充（用于下拉框中英文对照）——
  Afghanistan: '阿富汗',
  Algeria: '阿尔及利亚',
  Angola: '安哥拉',
  Argentina: '阿根廷',
  Armenia: '亚美尼亚',
  Bahrain: '巴林',
  Bangladesh: '孟加拉国',
  Belarus: '白俄罗斯',
  Bolivia: '玻利维亚',
  Cambodia: '柬埔寨',
  Cameroon: '喀麦隆',
  Chile: '智利',
  Colombia: '哥伦比亚',
  'Costa Rica': '哥斯达黎加',
  Cuba: '古巴',
  Czechia: '捷克',
  'Czech Republic': '捷克',
  Denmark: '丹麦',
  'Dominican Republic': '多米尼加',
  Egypt: '埃及',
  Ethiopia: '埃塞俄比亚',
  Fiji: '斐济',
  Georgia: '格鲁吉亚',
  Ghana: '加纳',
  Guatemala: '危地马拉',
  Honduras: '洪都拉斯',
  Hungary: '匈牙利',
  Iceland: '冰岛',
  Indonesia: '印度尼西亚',
  Iran: '伊朗',
  Iraq: '伊拉克',
  Israel: '以色列',
  Jamaica: '牙买加',
  Jordan: '约旦',
  Kazakhstan: '哈萨克斯坦',
  Kenya: '肯尼亚',
  Kuwait: '科威特',
  Laos: '老挝',
  Lebanon: '黎巴嫩',
  Libya: '利比亚',
  Macao: '中国澳门',
  Madagascar: '马达加斯加',
  Malawi: '马拉维',
  Malaysia: '马来西亚',
  Mali: '马里',
  Mauritius: '毛里求斯',
  Mongolia: '蒙古',
  Morocco: '摩洛哥',
  Mozambique: '莫桑比克',
  Myanmar: '缅甸',
  Nepal: '尼泊尔',
  'New Zealand': '新西兰',
  Nicaragua: '尼加拉瓜',
  Nigeria: '尼日利亚',
  'North Macedonia': '北马其顿',
  Norway: '挪威',
  Oman: '阿曼',
  Pakistan: '巴基斯坦',
  Paraguay: '巴拉圭',
  Peru: '秘鲁',
  Philippines: '菲律宾',
  Poland: '波兰',
  Qatar: '卡塔尔',
  Romania: '罗马尼亚',
  Rwanda: '卢旺达',
  'Saudi Arabia': '沙特阿拉伯',
  Senegal: '塞内加尔',
  Serbia: '塞尔维亚',
  Somalia: '索马里',
  'South Africa': '南非',
  'Sri Lanka': '斯里兰卡',
  Sudan: '苏丹',
  Syria: '叙利亚',
  Taiwan: '中国台湾',
  Tajikistan: '塔吉克斯坦',
  Tanzania: '坦桑尼亚',
  Thailand: '泰国',
  Tunisia: '突尼斯',
  Turkey: '土耳其',
  Turkmenistan: '土库曼斯坦',
  Uganda: '乌干达',
  Ukraine: '乌克兰',
  'United Arab Emirates': '阿拉伯联合酋长国',
  Uruguay: '乌拉圭',
  Uzbekistan: '乌兹别克斯坦',
  Venezuela: '委内瑞拉',
  Vietnam: '越南',
  Yemen: '也门',
  Zimbabwe: '津巴布韦',
};

/** 国家名中英文对照（缺失退回英文） */
function countryZhLabel(name: string): string {
  const zh = COUNTRY_NAMES_ZH[name];
  return zh ? `${zh}（${name}）` : name;
}

/** 下拉框国家项：英文名（可搜索）+ 小字标注其流通货币 */
function countryOptionLabel(name: string): string {
  const cur = country(name);
  const curZh = (cur ?? []).map((c) => currencyName(c.code)).join('、');
  const main = COUNTRY_NAMES_ZH[name] ? `${COUNTRY_NAMES_ZH[name]}（${name}）` : name;
  return curZh ? `${main} · ${curZh}` : main;
}

/* ---------------------------------------------------------------- 输入状态 */

// 约定：每个工具都要有 exampleData + 「一键示例」按钮，空输入框是跳出率最高的形态。
const exampleData = {
  amount: 100,
  from: 'CNY',
  to: ['USD', 'JPY', 'EUR'],
};

const amount = useQueryParam<number>({ tool: 'currency-conv', name: 'amount', defaultValue: 100 });
const fromCurrency = useQueryParam<string>({ tool: 'currency-conv', name: 'from', defaultValue: 'CNY' });
// 目标货币支持多选：1 个源币可同时换算成多个目标币。
const toCurrencies = ref<string[]>(['USD']);

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
    // 全部数据源失败：走备用汇率表
    rates.value = FALLBACK_RATES;
    snapshot.value = null;
    hasError.value = true;
  }
  loading.value = false;
}

onMounted(() => {
  loadRates();
  // 每 30 分钟自动刷新一次
  autoRefreshTimer = setInterval(loadRates, 30 * 60 * 1000);
});
onBeforeUnmount(() => {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
  }
});

/* ---------------------------------------------------------------- 计算结果 */

function formatAmount(value: number): string {
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 4 });
}

/** 每个目标币的换算结果 */
const results = computed(() =>
  toCurrencies.value.map((to) => {
    const value = convert(amount.value, fromCurrency.value, to, rates.value);
    return {
      to,
      flag: flagFor(to),
      name: currencyName(to),
      text: value === null ? 'N/A' : formatAmount(value),
      ok: value !== null,
    };
  }),
);

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

/** 相对 USD 的汇率表 */
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
  if (toCurrencies.value.length === 0) {
    return;
  }
  const oldFrom = fromCurrency.value;
  fromCurrency.value = toCurrencies.value[0];
  // 旧「源币」并入目标币（去重），保持多选语义
  toCurrencies.value = Array.from(new Set([oldFrom, ...toCurrencies.value.slice(1)]));
}

function loadExample() {
  amount.value = exampleData.amount;
  fromCurrency.value = exampleData.from;
  toCurrencies.value = [...exampleData.to];
}

function togglePopular(c: string) {
  const idx = toCurrencies.value.indexOf(c);
  if (idx >= 0) {
    // 至少保留一个目标币
    if (toCurrencies.value.length > 1) {
      toCurrencies.value = toCurrencies.value.filter((x) => x !== c);
    }
  } else {
    toCurrencies.value = [...toCurrencies.value, c];
  }
}

function flagFor(codeValue: string) {
  return CURRENCY_FLAGS[codeValue.toUpperCase()] ?? '🌍';
}

/* ---------------------------------------------------------------- 国家↔货币参考卡 */

const countryToCurrenciesInput = ref('France');
const allCountries = countries();
const countryOptions = computed(() => allCountries.map((name) => ({ value: name, label: countryOptionLabel(name) })));
const countryToCurrenciesOutput = computed(() => country(countryToCurrenciesInput.value));

const currencyToCountriesInput = ref('eur');
const currencyToCountriesOutput = computed(() => code(currencyToCountriesInput.value));
</script>

<template>
  <div>
    <c-card :title="t('tools.currency-converter.texts.title-currency-converter')" mb-2>
      <!-- 状态栏：最后更新 / 数据源 / 加载中 / 错误提示 -->
      <div mb-3 flex flex-wrap items-center gap-3 text-sm>
        <span v-if="loading" text-muted>{{ t('tools.currency-converter.texts.loading') }}</span>
        <template v-else>
          <span text-muted>🕒 {{ t('tools.currency-converter.texts.last-updated') }} {{ lastUpdatedText }}</span>
          <span v-if="snapshot" text-muted>· {{ t('tools.currency-converter.texts.label-source') }}: {{ snapshot.source }}</span>
        </template>
        <n-alert v-if="hasError" type="warning" :show-icon="false" :bordered="false" flex-1>
          {{ t('tools.currency-converter.texts.fetch-error') }}
        </n-alert>
      </div>

      <!-- 换算主体：金额 + 源币 + 目标币（多选） -->
      <div flex flex-col gap-2 sm:flex-row sm:items-end>
        <n-form-item :label="t('tools.currency-converter.texts.label-amount')" label-placement="top" flex-1 mb-0>
          <n-input-number-i18n v-model:value="amount" :min="0" w-full />
        </n-form-item>

        <c-select
          v-model:value="fromCurrency"
          :label="t('tools.currency-converter.texts.label-from')"
          label-position="top"
          searchable
          :options="COMMON_CURRENCIES.map((c) => ({ value: c, label: `${flagFor(c)} ${currencyName(c)}` }))"
          flex-1
        />

        <n-button secondary circle mb-1 :title="t('tools.currency-converter.texts.swap')" @click="swapCurrencies">
          ⇄
        </n-button>

        <n-form-item :label="t('tools.currency-converter.texts.label-to-multiple')" label-placement="top" flex-1 mb-0>
          <n-select
            v-model:value="toCurrencies"
            multiple
            :max-tag-count="3"
            filterable
            :placeholder="t('tools.currency-converter.texts.placeholder-please-select-a-currency')"
            :options="COMMON_CURRENCIES.map((c) => ({ value: c, label: `${flagFor(c)} ${currencyName(c)}` }))"
          />
        </n-form-item>
      </div>

      <!-- 结果（一源换多币） -->
      <n-form-item :label="t('tools.currency-converter.texts.label-result')" label-placement="top" mt-3 mb-0>
        <div v-if="toCurrencies.length" flex flex-col gap-1>
          <div text-xs text-muted>
            {{ formatAmount(amount) }} {{ currencyName(fromCurrency) }} ({{ fromCurrency }}) ≈
          </div>
          <div
            v-for="r in results"
            :key="r.to"
            flex items-center justify-between rounded bg-neutral-200:10 px-3 py-2 dark:bg-neutral-700:20
          >
            <span flex items-center gap-2>
              <span text-lg>{{ r.flag }}</span>
              <span>{{ r.name }}</span>
            </span>
            <span text-lg font-bold :class="r.ok ? '' : 'text-red'">{{ r.text }}</span>
          </div>
        </div>
        <div v-else text-muted>
          {{ t('tools.currency-converter.texts.no-target') }}
        </div>
      </n-form-item>

      <div mt-4 flex flex-wrap gap-2>
        <ToolExampleButton @click="loadExample" />
        <n-button secondary @click="loadRates">
          🔄 {{ t('tools.currency-converter.texts.refresh') }}
        </n-button>
      </div>

      <!-- 热门货币快捷按钮（点选切换目标币） -->
      <div mt-4>
        <div mb-2 text-sm font-medium>{{ t('tools.currency-converter.texts.title-popular') }}</div>
        <div flex flex-wrap gap-2>
          <n-tag
            v-for="c in POPULAR_CURRENCIES"
            :key="c"
            round
            :bordered="false"
            :type="toCurrencies.includes(c) ? 'primary' : 'default'"
            cursor-pointer
            @click="togglePopular(c)"
          >
            {{ flagFor(c) }} {{ currencyName(c) }}
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
        :options="countryOptions"
      />

      <n-divider />

      <ul>
        <li v-for="(currency, ix) in countryToCurrenciesOutput" :key="ix">
          {{ currencyZh(currency.code) }}（{{ currency.currency }}）[{{ currency.code }}/{{ currency.number }} -
          {{ currency.digits }}digits]
          <span v-if="currency.countries?.length">
            （{{ t('tools.currency-converter.texts.also-in') }}{{ currency.countries.map((n) => countryZhLabel(n)).join('、') }}）
          </span>
        </li>
      </ul>
    </c-card>

    <c-card :title="t('tools.currency-converter.texts.title-currencies-to-countries')" mb-2>
      <c-select
        v-model:value="currencyToCountriesInput"
        :label="t('tools.currency-converter.texts.label-currency')"
        label-position="left"
        searchable
        :options="COMMON_CURRENCIES.map((c) => ({ value: c.toLowerCase(), label: `${c} - ${currencyName(c)}` }))"
      />

      <n-divider />

      <n-p v-if="currencyToCountriesOutput">
        {{ currencyZh(currencyToCountriesOutput.code) }}（{{ currencyToCountriesOutput.currency }}）[{{
          currencyToCountriesOutput.code
        }}/{{ currencyToCountriesOutput.number }} - {{ currencyToCountriesOutput.digits }}digits]
      </n-p>

      <ul v-if="currencyToCountriesOutput">
        <li v-for="(countryName, ix) in currencyToCountriesOutput.countries" :key="ix">
          {{ countryZhLabel(countryName) }}
        </li>
      </ul>
    </c-card>
  </div>
</template>
