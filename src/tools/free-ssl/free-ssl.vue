<script setup lang="ts">
import { ref, shallowRef, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  FreeSslClient,
  type Environment,
  type CertKeyType,
  type ChallengeType,
  type ChallengeInfo,
  type OrderResult,
} from './free-ssl.service';

const { t } = useI18n();

const env = ref<Environment>('staging');
const certKeyType = ref<CertKeyType>('rsa-2048');
const challengeType = ref<ChallengeType>('dns-01');
const email = ref('');
const domainsText = ref('');

const step = ref(0); // 0 配置 / 1 验证 / 2 签发中 / 3 完成
const working = ref(false);
const errorMsg = ref('');
const logLines = ref<string[]>([]);
const challenges = ref<ChallengeInfo[]>([]);
const certPem = ref('');
const certPrivateKeyPem = ref('');
const csrPem = ref('');

const client = shallowRef<FreeSslClient | null>(null);

const envOptions = computed(() => [
  { label: t('tools.free-ssl.texts.opt-staging'), value: 'staging' },
  { label: t('tools.free-ssl.texts.opt-production'), value: 'production' },
]);
const keyOptions = computed(() => [
  { label: t('tools.free-ssl.texts.opt-rsa-2048'), value: 'rsa-2048' },
  { label: t('tools.free-ssl.texts.opt-rsa-4096'), value: 'rsa-4096' },
]);
const challengeOptions = computed(() => [
  { label: t('tools.free-ssl.texts.opt-dns-01'), value: 'dns-01' },
  { label: t('tools.free-ssl.texts.opt-http-01'), value: 'http-01' },
]);

const exampleData = {
  env: 'staging' as Environment,
  certKeyType: 'rsa-2048' as CertKeyType,
  challengeType: 'dns-01' as ChallengeType,
  email: 'test@example.com',
  domains: 'example.com\n*.example.com',
};

function loadExample() {
  env.value = exampleData.env;
  certKeyType.value = exampleData.certKeyType;
  challengeType.value = exampleData.challengeType;
  email.value = exampleData.email;
  domainsText.value = exampleData.domains;
}

function normalizeDomains(): string[] {
  return domainsText.value
    .split(/\r?\n/)
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

function validate(domains: string[]): string | null {
  if (domains.length === 0) {
    return t('tools.free-ssl.texts.error-no-domain');
  }
  const re = /^(\*\.)?([a-z0-9-]+\.)+[a-z]{2,}$/;
  for (const d of domains) {
    if (!re.test(d)) {
      return `${t('tools.free-ssl.texts.error-bad-domain')}：${d}`;
    }
  }
  if (challengeType.value === 'http-01' && domains.some((d) => d.startsWith('*.'))) {
    return t('tools.free-ssl.texts.error-wildcard-http');
  }
  return null;
}

function log(msg: string) {
  logLines.value.push(msg);
}

async function start() {
  const domains = normalizeDomains();
  const err = validate(domains);
  if (err) {
    errorMsg.value = err;
    return;
  }
  errorMsg.value = '';
  working.value = true;
  logLines.value = [];
  try {
    const c = new FreeSslClient(env.value);
    client.value = c;
    log(t('tools.free-ssl.texts.log-init'));
    await c.init();
    log(t('tools.free-ssl.texts.log-account'));
    const result: OrderResult = await c.createOrder({
      domains,
      contactEmail: email.value || undefined,
      certKeyType: certKeyType.value,
      challengeType: challengeType.value,
    });
    challenges.value = result.challenges;
    certPrivateKeyPem.value = c.certPrivateKeyPem;
    csrPem.value = c.csrPem;
    step.value = 1;
    log(t('tools.free-ssl.texts.log-order'));
  } catch (e) {
    errorMsg.value = (e as Error).message;
  } finally {
    working.value = false;
  }
}

async function verify() {
  if (!client.value) {
    return;
  }
  errorMsg.value = '';
  working.value = true;
  try {
    log(t('tools.free-ssl.texts.log-verify-start'));
    await client.value.verify();
    log(t('tools.free-ssl.texts.log-verify-ok'));
    step.value = 2;
    log(t('tools.free-ssl.texts.log-issue'));
    const cert = await client.value.finalize();
    certPem.value = cert;
    step.value = 3;
    log(t('tools.free-ssl.texts.log-done'));
  } catch (e) {
    errorMsg.value = (e as Error).message;
  } finally {
    working.value = false;
  }
}

function reset() {
  client.value = null;
  step.value = 0;
  challenges.value = [];
  certPem.value = '';
  certPrivateKeyPem.value = '';
  csrPem.value = '';
  logLines.value = [];
  errorMsg.value = '';
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <c-card :title="t('tools.free-ssl.texts.title-free-ssl')" max-w-900px>
    <n-alert v-if="env === 'staging'" type="warning" :title="t('tools.free-ssl.texts.warning-staging')" mb-3 />
    <n-alert type="info" :title="t('tools.free-ssl.texts.warning-rate-limit')" mb-3 />
    <n-alert type="info" :title="t('tools.free-ssl.texts.warning-private-key')" mb-3 />

    <n-steps :current="step + 1" size="small" mb-4>
      <n-step :title="t('tools.free-ssl.texts.step-config')" />
      <n-step :title="t('tools.free-ssl.texts.step-verify')" />
      <n-step :title="t('tools.free-ssl.texts.step-issue')" />
    </n-steps>

    <!-- 步骤 0：填写信息 -->
    <div v-if="step === 0">
      <c-select :label="t('tools.free-ssl.texts.label-env')" v-model:value="env" mb-2 :options="envOptions" />
      <c-select
        :label="t('tools.free-ssl.texts.label-key-type')"
        v-model:value="certKeyType"
        mb-2
        :options="keyOptions"
      />
      <c-select
        :label="t('tools.free-ssl.texts.label-challenge')"
        v-model:value="challengeType"
        mb-2
        :options="challengeOptions"
      />
      <div mb-1 text-14px>{{ t('tools.free-ssl.texts.label-email') }}</div>
      <n-input v-model:value="email" :placeholder="t('tools.free-ssl.texts.placeholder-email')" mb-2 />
      <div mb-1 text-14px>{{ t('tools.free-ssl.texts.label-domains') }}</div>
      <n-input
        v-model:value="domainsText"
        type="textarea"
        :placeholder="t('tools.free-ssl.texts.placeholder-domains')"
        :rows="4"
        mb-2
      />
      <n-space>
        <n-button type="primary" :loading="working" @click="start">
          {{ t('tools.free-ssl.texts.btn-start') }}
        </n-button>
        <ToolExampleButton @click="loadExample" />
      </n-space>
    </div>

    <!-- 步骤 1：配置域名验证 -->
    <div v-else-if="step === 1">
      <n-alert type="info" :title="t('tools.free-ssl.texts.title-challenges')" mb-3 />
      <c-card v-for="ch in challenges" :key="ch.domain" :title="ch.domain" mb-2>
        <template v-if="ch.type === 'dns-01'">
          <p>{{ t('tools.free-ssl.texts.dns-instruction', { domain: ch.domain }) }}</p>
          <input-copyable
            :label="t('tools.free-ssl.texts.label-record-name')"
            :value="ch.dnsRecordName"
            label-position="left"
            mb-1
          />
          <textarea-copyable
            :value="ch.dnsRecordValue"
            :label="t('tools.free-ssl.texts.label-record-value')"
            :download-file-name="`${ch.domain}.txt`"
          />
        </template>
        <template v-else>
          <p>{{ t('tools.free-ssl.texts.http-instruction', { domain: ch.domain }) }}</p>
          <input-copyable
            :label="t('tools.free-ssl.texts.label-http-url')"
            :value="ch.httpUrl"
            label-position="left"
            mb-1
          />
          <textarea-copyable
            :value="ch.httpContent"
            :label="t('tools.free-ssl.texts.label-http-content')"
            :download-file-name="`${ch.token}.txt`"
          />
        </template>
      </c-card>
      <n-button type="primary" :loading="working" @click="verify">
        {{ t('tools.free-ssl.texts.btn-verify') }}
      </n-button>
    </div>

    <!-- 步骤 2：签发中 -->
    <div v-else-if="step === 2">
      <n-spin :show="working">
        <p>{{ t('tools.free-ssl.texts.status-working') }}</p>
      </n-spin>
    </div>

    <!-- 步骤 3：完成，下载 -->
    <div v-else-if="step === 3">
      <n-alert type="success" :title="t('tools.free-ssl.texts.title-result')" mb-3 />
      <textarea-copyable
        :value="certPrivateKeyPem"
        :label="t('tools.free-ssl.texts.label-private-key')"
        language="txt"
        :download-file-name="'private-key.pem'"
        mb-2
      />
      <textarea-copyable
        :value="csrPem"
        :label="t('tools.free-ssl.texts.label-csr')"
        language="txt"
        :download-file-name="'csr.pem'"
        mb-2
      />
      <textarea-copyable
        :value="certPem"
        :label="t('tools.free-ssl.texts.label-cert')"
        language="txt"
        :download-file-name="'fullchain.pem'"
        mb-2
      />
      <n-alert type="warning" :title="t('tools.free-ssl.texts.warning-renew')" mb-3 />
      <n-button @click="reset">{{ t('tools.free-ssl.texts.btn-reset') }}</n-button>
    </div>

    <n-alert v-if="errorMsg" type="error" :title="t('tools.free-ssl.texts.error-title')" mt-3>
      {{ errorMsg }}
    </n-alert>

    <c-card v-if="logLines.length" :title="t('tools.free-ssl.texts.log-title')" mt-3>
      <pre class="ssl-log">{{ logLines.join('\n') }}</pre>
    </c-card>
  </c-card>
</template>

<style lang="less" scoped>
.ssl-log {
  margin: 0;
  max-height: 220px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 12px;
  line-height: 1.5;
  background: var(--bg-body, #f5f5f5);
  padding: 8px 10px;
  border-radius: 4px;
}
</style>
