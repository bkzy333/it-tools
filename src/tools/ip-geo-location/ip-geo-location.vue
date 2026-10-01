<script setup lang="ts">
import type { CKeyValueListItems } from '@/ui/c-key-value-list/c-key-value-list.types';
import { useQueryParam } from '@/composable/queryParams';

const ip = useQueryParam({ tool: 'ip-geo-loc', name: 'ip', defaultValue: '' });
const errorMessage = ref('');
const geoInfos = ref<CKeyValueListItems>([]);
const location = ref<{ latitude?: number; longitude?: number }>({});
const status = ref<'pending' | 'error' | 'success'>('pending');

const openStreetMapUrl = computed(() => {
  const { latitude, longitude } = location.value;
  return latitude !== undefined && longitude !== undefined
    ? `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=12/${latitude}/${longitude}`
    : undefined;
});

const flagEmoji = ref('');

async function fetchFromIpwhois(target: string) {
  const url = target ? `https://ipwho.is/${encodeURIComponent(target)}` : 'https://ipwho.is/';
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  if (!data || data.success === false) {
    throw new Error(data?.message || '查询失败');
  }

  flagEmoji.value = data.flag?.emoji ?? '';

  const rows: Array<[string, unknown]> = [
    ['IP 地址', data.ip],
    ['类型', data.type],
    ['大洲', data.continent],
    ['国家 / 地区', data.country ? `${flagEmoji.value} ${data.country} (${data.country_code})` : undefined],
    ['省 / 州', data.region],
    ['城市', data.city],
    ['邮政编码', data.postal],
    ['经纬度', data.latitude !== undefined ? `${data.latitude}, ${data.longitude}` : undefined],
    ['时区', data.timezone?.id],
    ['电话区号', data.calling_code ? `+${data.calling_code}` : undefined],
    ['货币', data.currency],
    ['ASN', data.connection?.asn ? `AS${data.connection.asn}` : undefined],
    ['运营商', data.connection?.isp],
    ['组织', data.connection?.org],
  ];

  location.value = { latitude: data.latitude, longitude: data.longitude };

  return rows.filter(([, value]) => value !== undefined && value !== null && value !== '');
}

async function onGetInfos() {
  const target = ip.value.trim();

  try {
    status.value = 'pending';
    errorMessage.value = '';
    flagEmoji.value = '';

    const rows = await fetchFromIpwhois(target);

    geoInfos.value = rows.map(([label, value]) => ({ label, value: String(value) }));
    status.value = 'success';
  } catch (e: any) {
    errorMessage.value = e?.message ?? String(e);
    status.value = 'error';
  }
}

// 打开页面就先查一下自己的 IP，省得用户还要点一次
onMounted(() => {
  if (!ip.value.trim()) {
    onGetInfos();
  }
});
</script>

<template>
  <div>
    <div flex items-center gap-2>
      <c-input-text
        v-model:value="ip"
        :placeholder="$t('tools.ip-geo-location.texts.placeholder-enter-an-ipv4-6')"
        clearable
        @keyup.enter="onGetInfos"
      />
      <c-button align-center @click="onGetInfos">
        {{ $t('tools.ip-geo-location.texts.tag-get-geo-location-infos') }}
      </c-button>
    </div>

    <div class="hint" mt-1>
      {{ $t('tools.ip-geo-location.texts.tag-empty-means-my-ip') }}
    </div>

    <n-divider />

    <c-card v-if="status === 'pending'" mt-5>
      {{ $t('tools.ip-geo-location.texts.tag-loading') }}
    </c-card>

    <c-card v-if="status === 'success' && openStreetMapUrl" mt-4>
      <c-button :href="openStreetMapUrl" target="_blank">
        {{ $t('tools.ip-geo-location.texts.tag-localize-on-open-street-map') }}
      </c-button>
    </c-card>

    <c-card v-if="status === 'success'" mt-5>
      <c-key-value-list :items="geoInfos" />
    </c-card>

    <n-alert v-if="status === 'error'" :title="$t('tools.ip-geo-location.texts.title-errors-occured')" type="error" mt-5>
      {{ errorMessage }}
    </n-alert>
  </div>
</template>

<style lang="less" scoped>
.hint {
  font-size: 12px;
  opacity: 0.6;
}
</style>
