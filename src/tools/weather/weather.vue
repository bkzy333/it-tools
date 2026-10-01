<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useQueryParam } from '@/composable/queryParams';

const { t } = useI18n();

interface GeoResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
  timezone?: string;
}

// Open-Meteo 返回的是 WMO 标准天气代码，需要自己映射成中文
const WMO_CODES: Record<number, string> = {
  0: '晴',
  1: '大部晴朗',
  2: '局部多云',
  3: '阴',
  45: '雾',
  48: '雾凇',
  51: '毛毛雨',
  53: '毛毛雨',
  55: '密集毛毛雨',
  56: '冻毛毛雨',
  57: '密集冻毛毛雨',
  61: '小雨',
  63: '中雨',
  65: '大雨',
  66: '冻雨',
  67: '强冻雨',
  71: '小雪',
  73: '中雪',
  75: '大雪',
  77: '雪粒',
  80: '阵雨',
  81: '中等阵雨',
  82: '强阵雨',
  85: '阵雪',
  86: '强阵雪',
  95: '雷阵雨',
  96: '雷阵雨伴冰雹',
  99: '强雷阵雨伴冰雹',
};

const WMO_EMOJI: Record<number, string> = {
  0: '☀️',
  1: '🌤️',
  2: '⛅',
  3: '☁️',
  45: '🌫️',
  48: '🌫️',
  51: '🌦️',
  53: '🌦️',
  55: '🌦️',
  56: '🌧️',
  57: '🌧️',
  61: '🌧️',
  63: '🌧️',
  65: '🌧️',
  66: '🌨️',
  67: '🌨️',
  71: '❄️',
  73: '❄️',
  75: '❄️',
  77: '❄️',
  80: '🌦️',
  81: '🌧️',
  82: '⛈️',
  85: '❄️',
  86: '❄️',
  95: '⛈️',
  96: '⛈️',
  99: '⛈️',
};

function weatherLabel(code?: number): string {
  if (code === undefined || code === null) {
    return '-';
  }
  return WMO_CODES[code] ?? `${t('tools.weather.texts.unknown')} (${code})`;
}

function weatherEmoji(code?: number): string {
  if (code === undefined || code === null) {
    return '❓';
  }
  return WMO_EMOJI[code] ?? '🌡️';
}

// 记住上一次查询的地点，刷新页面不丢失
const savedLat = useQueryParam({ tool: 'weather', name: 'lat', defaultValue: '' });
const savedLon = useQueryParam({ tool: 'weather', name: 'lon', defaultValue: '' });
const savedName = useQueryParam({ tool: 'weather', name: 'place', defaultValue: '' });

const query = ref('');
const suggestions = ref<GeoResult[]>([]);
const place = ref<GeoResult | null>(null);
const searching = ref(false);
const searchError = ref('');
const hasSearched = ref(false);
const loadingWeather = ref(false);
const weatherError = ref('');
const forecast = ref<any>(null);

watchDebounced(
  query,
  () => {
    const keyword = query.value.trim();
    if (keyword.length > 0) {
      searchCity();
    }
  },
  { debounce: 600 },
);

async function searchCity() {
  const keyword = query.value.trim();
  if (keyword.length === 0) {
    return;
  }

  searching.value = true;
  searchError.value = '';
  hasSearched.value = true;

  try {
    const response = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(keyword)}&count=8&language=zh&format=json`,
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    suggestions.value = data.results ?? [];
  } catch (e: any) {
    suggestions.value = [];
    searchError.value = e?.message ?? String(e);
  } finally {
    searching.value = false;
  }
}

async function loadWeather(target: GeoResult) {
  place.value = target;
  savedLat.value = String(target.latitude);
  savedLon.value = String(target.longitude);
  savedName.value = target.name;

  loadingWeather.value = true;
  weatherError.value = '';
  forecast.value = null;

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${target.latitude}&longitude=${target.longitude}` +
      '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset' +
      '&timezone=auto&forecast_days=7';

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    forecast.value = await response.json();
  } catch (e: any) {
    weatherError.value = e?.message ?? String(e);
  } finally {
    loadingWeather.value = false;
  }
}

const placeLabel = computed(() => {
  if (!place.value) {
    return '';
  }
  const parts = [place.value.name, place.value.admin1, place.value.country].filter(Boolean);
  return Array.from(new Set(parts)).join(' · ');
});

const current = computed(() => forecast.value?.current ?? null);

const dailyRows = computed(() => {
  const daily = forecast.value?.daily;
  if (!daily?.time) {
    return [];
  }

  return daily.time.map((date: string, index: number) => ({
    date,
    weekdayLabel: weekdayLabel(date, index),
    code: daily.weather_code?.[index],
    max: daily.temperature_2m_max?.[index],
    min: daily.temperature_2m_min?.[index],
    pop: daily.precipitation_probability_max?.[index],
    sunrise: daily.sunrise?.[index]?.slice(11, 16),
    sunset: daily.sunset?.[index]?.slice(11, 16),
  }));
});

// 日期字符串按本地时区解析成星期，避免 UTC 解析导致的差一天
function weekdayLabel(dateStr: string, index: number): string {
  if (index === 0) {
    return t('tools.weather.texts.today');
  }
  if (index === 1) {
    return t('tools.weather.texts.tomorrow');
  }
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const names = [
    t('tools.weather.texts.sunday'),
    t('tools.weather.texts.monday'),
    t('tools.weather.texts.tuesday'),
    t('tools.weather.texts.wednesday'),
    t('tools.weather.texts.thursday'),
    t('tools.weather.texts.friday'),
    t('tools.weather.texts.saturday'),
  ];
  return names[date.getDay()];
}

onMounted(() => {
  if (savedLat.value && savedLon.value) {
    loadWeather({
      id: 0,
      name: savedName.value || savedLat.value,
      latitude: Number(savedLat.value),
      longitude: Number(savedLon.value),
    });
  }
});
</script>

<template>
  <div>
    <div flex items-center gap-2>
      <c-input-text
        v-model:value="query"
        :placeholder="t('tools.weather.texts.placeholder-city')"
        :label="t('tools.weather.texts.label-city')"
        label-position="left"
        label-width="70px"
      />
    </div>

    <div v-if="searching" mt-2 opacity-70>
      {{ t('tools.weather.texts.searching') }}
    </div>

    <n-alert v-if="searchError" type="error" mt-2 :title="t('tools.weather.texts.something-wrong')">
      {{ searchError }}
    </n-alert>

    <div v-if="hasSearched && !searching && suggestions.length === 0 && !searchError" mt-2 opacity-70>
      {{ t('tools.weather.texts.no-result') }}
    </div>

    <div v-if="suggestions.length > 0" class="suggestions" mt-2>
      <div
        v-for="item in suggestions"
        :key="item.id"
        class="suggestion-item"
        :class="{ active: place?.id === item.id }"
        @click="loadWeather(item)"
      >
        <span font-medium>{{ item.name }}</span>
        <span class="suggestion-meta">
          {{ [item.admin1, item.country].filter(Boolean).join(' · ') }}
        </span>
      </div>
    </div>

    <div v-if="place">
      <n-divider />

      <div v-if="loadingWeather" opacity-70>
        {{ t('tools.weather.texts.loading-weather') }}
      </div>

      <n-alert v-else-if="weatherError" type="error" :title="t('tools.weather.texts.something-wrong')">
        {{ weatherError }}
      </n-alert>

      <template v-else-if="current">
        <div class="place-name">{{ placeLabel }}</div>

        <div class="current-card">
          <div class="current-main">
            <div class="current-emoji">{{ weatherEmoji(current.weather_code) }}</div>
            <div>
              <div class="current-temp">{{ current.temperature_2m }}°C</div>
              <div class="current-desc">{{ weatherLabel(current.weather_code) }}</div>
            </div>
          </div>

          <div class="current-grid">
            <div>
              <div class="metric-label">{{ t('tools.weather.texts.feels-like') }}</div>
              <div class="metric-value">{{ current.apparent_temperature }}°C</div>
            </div>
            <div>
              <div class="metric-label">{{ t('tools.weather.texts.humidity') }}</div>
              <div class="metric-value">{{ current.relative_humidity_2m }}%</div>
            </div>
            <div>
              <div class="metric-label">{{ t('tools.weather.texts.wind') }}</div>
              <div class="metric-value">{{ current.wind_speed_10m }} km/h</div>
            </div>
            <div>
              <div class="metric-label">{{ t('tools.weather.texts.precipitation') }}</div>
              <div class="metric-value">{{ current.precipitation }} mm</div>
            </div>
          </div>

          <div class="updated-at">
            {{ t('tools.weather.texts.updated-at') }} {{ current.time.replace('T', ' ') }}
          </div>
        </div>

        <div v-if="dailyRows.length > 0" mt-5>
          <div class="section-title">{{ t('tools.weather.texts.forecast') }}</div>
          <div class="forecast-grid">
            <div v-for="row in dailyRows" :key="row.date" class="forecast-item">
              <div class="forecast-day">{{ row.weekdayLabel }}</div>
              <div class="forecast-date">{{ row.date.slice(5) }}</div>
              <div class="forecast-emoji">{{ weatherEmoji(row.code) }}</div>
              <div class="forecast-desc">{{ weatherLabel(row.code) }}</div>
              <div class="forecast-temp">
                <span class="max">{{ row.max }}°</span>
                <span class="min">/ {{ row.min }}°</span>
              </div>
              <div v-if="row.pop !== null && row.pop !== undefined" class="forecast-pop">
                💧 {{ row.pop }}%
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <c-card v-else-if="!loadingWeather" mt-5>
      {{ t('tools.weather.texts.hint') }}
    </c-card>
  </div>
</template>

<style lang="less" scoped>
.suggestions {
  border: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: 4px;
  overflow: hidden;
}

.suggestion-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background-color 0.15s ease;

  &:hover {
    background-color: rgba(128, 128, 128, 0.12);
  }

  &.active {
    background-color: rgba(128, 128, 128, 0.18);
  }
}

.suggestion-meta {
  font-size: 12px;
  opacity: 0.6;
}

.place-name {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 12px;
}

.current-card {
  border: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: 6px;
  padding: 20px;
}

.current-main {
  display: flex;
  align-items: center;
  gap: 16px;
}

.current-emoji {
  font-size: 52px;
  line-height: 1;
}

.current-temp {
  font-size: 40px;
  font-weight: 600;
  line-height: 1.1;
}

.current-desc {
  opacity: 0.7;
}

.current-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 12px;
  margin-top: 18px;
}

.metric-label {
  font-size: 12px;
  opacity: 0.6;
}

.metric-value {
  font-size: 16px;
  font-weight: 500;
}

.updated-at {
  margin-top: 14px;
  font-size: 12px;
  opacity: 0.5;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 12px;
}

.forecast-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(104px, 1fr));
  gap: 10px;
}

.forecast-item {
  border: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: 6px;
  padding: 12px 8px;
  text-align: center;
}

.forecast-day {
  font-weight: 500;
}

.forecast-date {
  font-size: 12px;
  opacity: 0.5;
}

.forecast-emoji {
  font-size: 26px;
  margin: 6px 0;
}

.forecast-desc {
  font-size: 12px;
  opacity: 0.7;
}

.forecast-temp {
  margin-top: 6px;

  .max {
    font-weight: 600;
  }

  .min {
    opacity: 0.6;
  }
}

.forecast-pop {
  margin-top: 4px;
  font-size: 12px;
  opacity: 0.6;
}
</style>
