<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

interface IpInfo {
  ip: string;
  type: string;
  country: string;
  countryCode: string;
  region: string;
  city: string;
  timezone: string;
  isp: string;
  org: string;
  asn: string;
  source: string;
}

// 上游原本用 api4.ipify.org / api6.ipify.org，实测这两个域名在国内不可达，
// 页面直接抛 "Failed to fetch"。这里改成多源回退：优先拿带归属地的整包数据，
// 拿不到就退而求其次只要 IP，保证至少能显示公网地址。
const IP_SOURCES: Array<{ name: string; fetch: () => Promise<IpInfo> }> = [
  {
    name: 'ipwho.is',
    fetch: async () => {
      const response = await fetch('https://ipwho.is/');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      if (!data?.success || !data.ip) {
        throw new Error(data?.message || 'no ip returned');
      }
      return {
        ip: data.ip,
        type: data.type ?? '',
        country: data.country ?? '',
        countryCode: data.country_code ?? '',
        region: data.region ?? '',
        city: data.city ?? '',
        timezone: data.timezone?.id ?? '',
        isp: data.connection?.isp ?? '',
        org: data.connection?.org ?? '',
        asn: data.connection?.asn ? `AS${data.connection.asn}` : '',
        source: 'ipwho.is',
      };
    },
  },
  {
    name: 'ipify',
    fetch: async () => ({
      ...emptyInfo((await (await fetch('https://api64.ipify.org?format=json')).json()).ip ?? ''),
      source: 'ipify',
    }),
  },
  {
    name: 'ip.sb',
    fetch: async () => ({
      ...emptyInfo((await (await fetch('https://api.ip.sb/ip')).text()).trim()),
      source: 'ip.sb',
    }),
  },
  {
    name: 'cloudflare',
    fetch: async () => {
      const text = await (await fetch('https://www.cloudflare.com/cdn-cgi/trace')).text();
      const ip = /^ip=(.+)$/m.exec(text)?.[1]?.trim() ?? '';
      if (!ip) {
        throw new Error('no ip in trace');
      }
      return { ...emptyInfo(ip), source: 'cloudflare' };
    },
  },
];

// 这几个域名只有 AAAA 记录，能连通就说明访客的网络支持 IPv6
const IPV6_SOURCES = ['https://api6.ipify.org?format=json', 'https://ipv6.ip.sb/api/ip'];

function emptyInfo(ip: string): IpInfo {
  return {
    ip,
    type: '',
    country: '',
    countryCode: '',
    region: '',
    city: '',
    timezone: '',
    isp: '',
    org: '',
    asn: '',
    source: '',
  };
}

const info = ref<IpInfo | null>(null);
const loading = ref(false);
const errorMessage = ref('');
const ipv6 = ref<{ ip: string } | null>(null);
const ipv6Checked = ref(false);

async function loadIpInfo() {
  loading.value = true;
  errorMessage.value = '';
  info.value = null;

  for (const source of IP_SOURCES) {
    try {
      info.value = await source.fetch();
      break;
    } catch {
      // 换下一个源
    }
  }

  if (!info.value) {
    errorMessage.value = t('tools.my-ip.texts.all-sources-failed');
  }

  loading.value = false;
}

// IPv6 探测失败是常态（很多网络根本没有 IPv6），这里给出的是"不支持"的结论而不是报错
async function checkIpv6() {
  ipv6Checked.value = false;
  ipv6.value = null;

  for (const url of IPV6_SOURCES) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        continue;
      }
      const text = (await response.text()).trim();
      const parsed = text.startsWith('{') ? (JSON.parse(text).ip ?? '') : text;
      if (parsed && parsed.includes(':')) {
        ipv6.value = { ip: parsed };
        break;
      }
    } catch {
      // 不支持 IPv6 时这里必然超时或失败
    }
  }

  ipv6Checked.value = true;
}

const ipv6Text = computed(() => {
  if (!ipv6Checked.value) {
    return t('tools.my-ip.texts.checking');
  }
  return ipv6.value ? ipv6.value.ip : t('tools.my-ip.texts.ipv6-not-detected');
});

const rows = computed(() => {
  const data = info.value;
  if (!data) {
    return [];
  }
  return [
    { label: t('tools.my-ip.texts.label-type'), value: data.type },
    { label: t('tools.my-ip.texts.label-country'), value: data.country ? `${data.country} (${data.countryCode})` : '' },
    { label: t('tools.my-ip.texts.label-region'), value: data.region },
    { label: t('tools.my-ip.texts.label-city'), value: data.city },
    { label: t('tools.my-ip.texts.label-timezone'), value: data.timezone },
    { label: t('tools.my-ip.texts.label-isp'), value: data.isp },
    { label: t('tools.my-ip.texts.label-org'), value: data.org },
    { label: t('tools.my-ip.texts.label-asn'), value: data.asn },
  ].filter((row) => row.value);
});

onMounted(() => {
  loadIpInfo();
  checkIpv6();
});
</script>

<template>
  <div>
    <c-card :title="t('tools.my-ip.texts.title-your-ip-address')">
      <div v-if="loading" opacity-70>
        {{ t('tools.my-ip.texts.loading') }}
      </div>

      <n-alert v-else-if="errorMessage" type="error" :title="t('tools.my-ip.texts.error')">
        {{ errorMessage }}
      </n-alert>

      <div v-else-if="info">
        <input-copyable
          :value="info.ip"
          label-position="left"
          label-width="100px"
          label-align="right"
          readonly
          :label="t('tools.my-ip.texts.label-ip')"
        />

        <n-divider />

        <input-copyable
          v-for="row in rows"
          :key="row.label"
          :value="row.value"
          label-position="left"
          label-width="100px"
          label-align="right"
          readonly
          :label="row.label"
        />

        <input-copyable
          :value="ipv6Text"
          label-position="left"
          label-width="100px"
          label-align="right"
          readonly
          :label="t('tools.my-ip.texts.label-ipv6-support')"
        />

        <div class="source-hint">
          {{ t('tools.my-ip.texts.source') }}{{ info.source }}
        </div>
      </div>

      <div flex justify-center gap-3 mt-4>
        <c-button :loading="loading" @click="loadIpInfo">
          {{ t('tools.my-ip.texts.tag-refresh') }}
        </c-button>
      </div>
    </c-card>
  </div>
</template>

<style lang="less" scoped>
.source-hint {
  margin-top: 10px;
  font-size: 12px;
  opacity: 0.5;
}
</style>
