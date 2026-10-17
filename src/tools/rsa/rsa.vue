<script setup lang="ts">
/**
 * RSA 加解密 / 签名验签页。
 *
 * 页面结构按「一次任务」而不是「一个函数」组织：密钥对 → 加解密 → 签名验签。
 * 密钥在三个 tab 之间共享，因为它本来就是同一次任务里的同一把钥匙；让用户在
 * 每个 tab 各填一遍只会制造「加密用 A 钥匙、解密填了 B 钥匙」的事故。
 *
 * 两个必须在 UI 上说清的事：
 * - **RSA 加密有长度上限**（2048 位 PKCS#1 只有 245 字节），所以输入框下面实时显示
 *   「已用 X / 最多 Y 字节」，超了直接标红，而不是等他点完再报错
 * - **签名和加密是两回事**：签名用私钥、验签用公钥，且消息先哈希所以长度不限；
 *   把这两件事混在一个卡片里会让人以为「签名也要私钥才能验」
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { computedCatch } from '@/composable/computed/catchedComputed';
import { base64ToBytes, bytesToBase64, bytesToHex, decodeBytes, encodeText, hexToBytes, type Charset } from '../crypto-utils/charset';
import type { RsaHash, RsaKeyPairPem, RsaKeySize, RsaPadding } from './rsa.service';
import {
  generateRsaKeyPair,
  describePrivateKey,
  describePublicKey,
  encryptRsa,
  decryptRsa,
  maxPlaintextBytes,
  parsePrivateKey,
  parsePublicKey,
  signRsa,
  verifyRsa,
} from './rsa.service';

const { t } = useI18n();

type Tab = 'keys' | 'cipher' | 'sign';

const tab = ref<Tab>('keys');

// ——— 密钥 ———
const keys = ref<RsaKeyPairPem>({ publicKeyPem: '', privateKeyPem: '', privateKeyPkcs8Pem: '', bits: 0 });
const keySize = ref<RsaKeySize>(2048);
const keySizeOptions: { label: string; value: RsaKeySize }[] = [
  { label: '1024 bit', value: 1024 },
  { label: '2048 bit', value: 2048 },
  { label: '4096 bit', value: 4096 },
];
const generating = ref(false);
const generateMs = ref(0);

/** 公钥解析状态（用户可能手改了 PEM，所以要跟着输入实时变） */
const publicKeyInfo = computed(() => {
  // 空框不是「错误」，是还没填 —— 报红会让人以为页面坏了
  if (!keys.value.publicKeyPem.trim()) {
    return { bits: 0, error: '', empty: true };
  }
  try {
    return { bits: describePublicKey(parsePublicKey(keys.value.publicKeyPem)).bits, error: '', empty: false };
  }
  catch (error) {
    return { bits: 0, error: (error as Error).message, empty: false };
  }
});

const privateKeyInfo = computed(() => {
  if (!keys.value.privateKeyPem.trim()) {
    return { bits: 0, error: '', empty: true };
  }
  try {
    return { bits: describePrivateKey(parsePrivateKey(keys.value.privateKeyPem)).bits, error: '', empty: false };
  }
  catch (error) {
    return { bits: 0, error: (error as Error).message, empty: false };
  }
});

const hasUsableKeyPair = computed(() => publicKeyInfo.value.bits > 0 && privateKeyInfo.value.bits > 0);

async function generateKeys() {
  generating.value = true;
  // 先让 loading 画出来再跑同步生成（4096 位要半秒多，不这么做界面会像卡死）
  await new Promise(resolve => setTimeout(resolve, 30));
  const startedAt = performance.now();
  try {
    keys.value = generateRsaKeyPair(keySize.value);
    generateMs.value = Math.round(performance.now() - startedAt);
  }
  finally {
    generating.value = false;
  }
}

/** 私钥在两处可能被改成别的格式，导出 PKCS#8 时用最新的那份重新包一次 */
const pkcs8Available = computed(() => hasUsableKeyPair.value);
const showPkcs8 = ref(false);

// ——— 加解密 ———
const padding = ref<RsaPadding>('pkcs1');
const oaepHash = ref<RsaHash>('sha256');
const plaintext = ref('');
const ciphertext = ref('');
const cipherFormat = ref<Charset>('base64');

const cipherFormatOptions = computed(() => [
  { label: t('tools.rsa.texts.charset-base64'), value: 'base64' },
  { label: t('tools.rsa.texts.charset-hex'), value: 'hex' },
]);

const paddingOptions = computed(() => [
  { label: t('tools.rsa.texts.padding-pkcs1'), value: 'pkcs1' },
  { label: t('tools.rsa.texts.padding-oaep'), value: 'oaep' },
]);

const hashOptions = computed(() => [
  { label: 'SHA-256', value: 'sha256' },
  { label: 'SHA-1', value: 'sha1' },
  { label: 'SHA-512', value: 'sha512' },
]);

/** 当前参数下明文能有多长。密钥还没解析出来时按选中的位数估算 */
const plaintextLimit = computed(() =>
  maxPlaintextBytes(publicKeyInfo.value.bits || keySize.value, padding.value, oaepHash.value),
);

const plaintextBytes = computed(() => new TextEncoder().encode(plaintext.value).length);
const overLimit = computed(() => plaintextBytes.value > plaintextLimit.value);

const [encryptedOutput, encryptError] = computedCatch(
  () => {
    if (!plaintext.value) {
      return '';
    }
    const bytes = encryptRsa(new TextEncoder().encode(plaintext.value), keys.value.publicKeyPem, {
      padding: padding.value,
      hash: oaepHash.value,
    });

    return cipherFormat.value === 'hex' ? bytesToHex(bytes) : bytesToBase64(bytes);
  },
  { defaultValue: '' },
);

const [decryptedOutput, decryptError] = computedCatch(
  () => {
    if (!ciphertext.value) {
      return '';
    }
    const bytes = cipherFormat.value === 'hex' ? hexToBytes(ciphertext.value) : base64ToBytes(ciphertext.value);

    return decodeBytes(decryptRsa(bytes, keys.value.privateKeyPem, { padding: padding.value, hash: oaepHash.value }), 'utf8');
  },
  { defaultValue: '' },
);

function useCipherAsDecryptInput() {
  ciphertext.value = encryptedOutput.value ?? '';
  tab.value = 'cipher';
}

// ——— 签名验签 ———
const signMessage = ref('');
const signHash = ref<RsaHash>('sha256');
const signature = ref('');
const verifyMessage = ref('');
const verifySignature = ref('');
const verifyResult = ref<'ok' | 'fail' | ''>('');
const verifyError = ref('');

const [signatureOutput, signError] = computedCatch(
  () => {
    if (!signMessage.value) {
      return '';
    }
    const bytes = signRsa(new TextEncoder().encode(signMessage.value), keys.value.privateKeyPem, signHash.value);

    return cipherFormat.value === 'hex' ? bytesToHex(bytes) : bytesToBase64(bytes);
  },
  { defaultValue: '' },
);

function doVerify() {
  verifyResult.value = '';
  verifyError.value = '';
  try {
    const bytes = cipherFormat.value === 'hex' ? hexToBytes(verifySignature.value) : base64ToBytes(verifySignature.value);
    const ok = verifyRsa(new TextEncoder().encode(verifyMessage.value), bytes, keys.value.publicKeyPem, signHash.value);

    verifyResult.value = ok ? 'ok' : 'fail';
  }
  catch (error) {
    verifyResult.value = 'fail';
    verifyError.value = (error as Error).message;
  }
}

/** 签名结果一键带到验签区 */
function useSignatureForVerify() {
  verifyMessage.value = signMessage.value;
  verifySignature.value = signatureOutput.value ?? '';
  verifyResult.value = '';
  verifyError.value = '';
}

// ——— 示例 ———
async function loadExample() {
  keySize.value = 2048;
  await generateKeys();
  padding.value = 'pkcs1';
  cipherFormat.value = 'base64';
  plaintext.value = '用 RSA 公钥加密这句话';
  signMessage.value = '要签名的消息内容';
  signHash.value = 'sha256';
  verifyMessage.value = '';
  verifySignature.value = '';
  verifyResult.value = '';
  ciphertext.value = '';
  tab.value = 'keys';
}
</script>

<template>
  <div class="rsa-tool">
    <div flex justify-end mb-2>
      <ToolExampleButton @click="loadExample" />
    </div>

    <n-tabs v-model:value="tab" type="line">
      <!-- ——— 密钥对 ——— -->
      <n-tab-pane name="keys" :tab="t('tools.rsa.texts.tab-keys')">
        <c-card :title="t('tools.rsa.texts.title-keys')" mt-3>
          <div flex flex-wrap items-end gap-3>
            <div style="width: 220px">
              <c-select v-model:value="keySize" :label="t('tools.rsa.texts.label-key-size')" :options="keySizeOptions" />
            </div>
            <c-button type="primary" :disabled="generating" @click="generateKeys">
              {{ generating ? t('tools.rsa.texts.btn-generating') : t('tools.rsa.texts.btn-generate') }}
            </c-button>
            <span v-if="generateMs > 0" class="hint">{{ t('tools.rsa.texts.hint-generate-ms', { ms: generateMs }) }}</span>
          </div>
          <div class="hint" mt-2>{{ t('tools.rsa.texts.hint-key-size') }}</div>

          <div mt-4>
            <c-input-text
              v-model:value="keys.publicKeyPem"
              :label="t('tools.rsa.texts.label-public-key')"
              :placeholder="t('tools.rsa.texts.placeholder-public-key')"
              multiline
              :rows="6"
              :max-rows="14"
              autosize
              monospace
              clearable
            />
            <div v-if="publicKeyInfo.error" class="hint hint-warn" mt-1>{{ publicKeyInfo.error }}</div>
            <div v-else-if="publicKeyInfo.bits > 0" class="hint hint-ok" mt-1>
              {{ t('tools.rsa.texts.hint-public-ok', { bits: publicKeyInfo.bits }) }}
            </div>
            <div v-else class="hint" mt-1>{{ t('tools.rsa.texts.hint-empty-key') }}</div>
          </div>

          <div mt-4>
            <c-input-text
              v-model:value="keys.privateKeyPem"
              :label="t('tools.rsa.texts.label-private-key')"
              :placeholder="t('tools.rsa.texts.placeholder-private-key')"
              multiline
              :rows="8"
              :max-rows="18"
              autosize
              monospace
              clearable
            />
            <div v-if="privateKeyInfo.error" class="hint hint-warn" mt-1>{{ privateKeyInfo.error }}</div>
            <div v-else-if="privateKeyInfo.bits > 0" class="hint hint-ok" mt-1>
              {{ t('tools.rsa.texts.hint-private-ok', { bits: privateKeyInfo.bits }) }}
            </div>
            <div v-if="pkcs8Available" flex items-center gap-2 mt-1>
              <n-checkbox v-model:checked="showPkcs8">{{ t('tools.rsa.texts.opt-show-pkcs8') }}</n-checkbox>
            </div>
            <c-input-text
              v-if="showPkcs8 && pkcs8Available"
              :value="keys.privateKeyPkcs8Pem"
              multiline
              :rows="8"
              :max-rows="18"
              autosize
              monospace
              readonly
              mt-1
            />
          </div>

          <div class="hint" mt-3>{{ t('tools.rsa.texts.hint-private-warning') }}</div>
        </c-card>
      </n-tab-pane>

      <!-- ——— 加解密 ——— -->
      <n-tab-pane name="cipher" :tab="t('tools.rsa.texts.tab-cipher')">
        <c-card :title="t('tools.rsa.texts.title-config')" mt-3>
          <div class="config-grid">
            <c-select v-model:value="padding" :label="t('tools.rsa.texts.label-padding')" :options="paddingOptions" />
            <c-select v-if="padding === 'oaep'" v-model:value="oaepHash" :label="t('tools.rsa.texts.label-oaep-hash')" :options="hashOptions" />
            <c-select v-model:value="cipherFormat" :label="t('tools.rsa.texts.label-cipher-format')" :options="cipherFormatOptions" />
          </div>
          <div class="hint" mt-2>{{ t('tools.rsa.texts.hint-padding') }}</div>
        </c-card>

        <c-card :title="t('tools.rsa.texts.title-encrypt')" mt-3>
          <c-input-text
            v-model:value="plaintext"
            :label="t('tools.rsa.texts.label-plaintext')"
            :placeholder="t('tools.rsa.texts.placeholder-plaintext')"
            multiline
            :rows="4"
            :max-rows="12"
            autosize
            clearable
          />
          <div class="hint" :class="{ 'hint-warn': overLimit }" mt-1>
            {{ t('tools.rsa.texts.hint-limit', { used: plaintextBytes, max: plaintextLimit }) }}
          </div>
          <c-alert v-if="encryptError" type="error" mt-3 :title="t('tools.rsa.texts.title-error')">
            {{ encryptError }}
          </c-alert>
          <template v-else>
            <c-input-text
              :label="t('tools.rsa.texts.label-ciphertext')"
              :value="encryptedOutput ?? ''"
              multiline
              :rows="4"
              autosize
              monospace
              readonly
              mt-3
            />
            <div flex justify-end gap-2 mt-2>
              <c-button v-if="encryptedOutput" size="small" @click="useCipherAsDecryptInput">
                {{ t('tools.rsa.texts.btn-use-as-input') }}
              </c-button>
              <CopyExportBar v-if="encryptedOutput" :text="encryptedOutput" filename="rsa-cipher" />
            </div>
          </template>
        </c-card>

        <c-card :title="t('tools.rsa.texts.title-decrypt')" mt-3>
          <c-input-text
            v-model:value="ciphertext"
            :label="t('tools.rsa.texts.label-ciphertext-in')"
            :placeholder="t('tools.rsa.texts.placeholder-ciphertext')"
            multiline
            :rows="4"
            :max-rows="12"
            autosize
            monospace
            clearable
          />
          <c-alert v-if="decryptError" type="error" mt-3 :title="t('tools.rsa.texts.title-error')">
            {{ decryptError }}
          </c-alert>
          <template v-else>
            <c-input-text
              :label="t('tools.rsa.texts.label-plaintext-out')"
              :value="decryptedOutput ?? ''"
              multiline
              :rows="4"
              autosize
              readonly
              mt-3
            />
            <div flex justify-end mt-2>
              <CopyExportBar v-if="decryptedOutput" :text="decryptedOutput" filename="rsa-plain" />
            </div>
          </template>
        </c-card>
      </n-tab-pane>

      <!-- ——— 签名验签 ——— -->
      <n-tab-pane name="sign" :tab="t('tools.rsa.texts.tab-sign')">
        <c-card :title="t('tools.rsa.texts.title-sign')" mt-3>
          <c-input-text
            v-model:value="signMessage"
            :label="t('tools.rsa.texts.label-sign-message')"
            :placeholder="t('tools.rsa.texts.placeholder-sign-message')"
            multiline
            :rows="4"
            :max-rows="12"
            autosize
            clearable
          />
          <div class="config-grid" mt-3>
            <c-select v-model:value="signHash" :label="t('tools.rsa.texts.label-sign-hash')" :options="hashOptions" />
            <c-select v-model:value="cipherFormat" :label="t('tools.rsa.texts.label-sign-format')" :options="cipherFormatOptions" />
          </div>
          <div class="hint" mt-2>{{ t('tools.rsa.texts.hint-sign') }}</div>
          <c-alert v-if="signError" type="error" mt-3 :title="t('tools.rsa.texts.title-error')">
            {{ signError }}
          </c-alert>
          <template v-else>
            <c-input-text
              :label="t('tools.rsa.texts.label-signature')"
              :value="signatureOutput ?? ''"
              multiline
              :rows="4"
              autosize
              monospace
              readonly
              mt-3
            />
            <div flex justify-end gap-2 mt-2>
              <c-button v-if="signatureOutput" size="small" @click="useSignatureForVerify">
                {{ t('tools.rsa.texts.btn-to-verify') }}
              </c-button>
              <CopyExportBar v-if="signatureOutput" :text="signatureOutput" filename="rsa-signature" />
            </div>
          </template>
        </c-card>

        <c-card :title="t('tools.rsa.texts.title-verify')" mt-3>
          <c-input-text
            v-model:value="verifyMessage"
            :label="t('tools.rsa.texts.label-verify-message')"
            :placeholder="t('tools.rsa.texts.placeholder-sign-message')"
            multiline
            :rows="3"
            :max-rows="10"
            autosize
            clearable
          />
          <c-input-text
            v-model:value="verifySignature"
            :label="t('tools.rsa.texts.label-verify-signature')"
            :placeholder="t('tools.rsa.texts.placeholder-signature')"
            multiline
            :rows="3"
            :max-rows="10"
            autosize
            monospace
            clearable
            mt-3
          />
          <div flex justify-end mt-3>
            <c-button :disabled="!verifyMessage || !verifySignature" @click="doVerify">
              {{ t('tools.rsa.texts.btn-verify') }}
            </c-button>
          </div>
          <c-alert v-if="verifyError" type="error" mt-3 :title="t('tools.rsa.texts.title-error')">
            {{ verifyError }}
          </c-alert>
          <div
            v-if="verifyResult"
            class="verdict"
            :class="verifyResult === 'ok' ? 'verdict-ok' : 'verdict-bad'"
            mt-3
          >
            {{ verifyResult === 'ok' ? t('tools.rsa.texts.verify-ok') : t('tools.rsa.texts.verify-fail') }}
          </div>
        </c-card>
      </n-tab-pane>
    </n-tabs>

    <c-card :title="t('tools.rsa.texts.title-about')" mt-3>
      <div class="hint">{{ t('tools.rsa.texts.hint-about') }}</div>
    </c-card>
  </div>
</template>

<style scoped lang="less">
.rsa-tool {
  .config-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
  }

  .hint {
    font-size: 13px;
    color: var(--n-text-color-disabled, #999);
  }

  .hint-warn {
    color: #d03050;
  }

  .hint-ok {
    color: #18a058;
  }

  .verdict {
    padding: 8px 12px;
    border-radius: 6px;
    font-weight: 500;
  }

  .verdict-ok {
    background-color: rgb(24 160 88 / 12%);
    color: #18a058;
  }

  .verdict-bad {
    background-color: rgb(208 48 80 / 12%);
    color: #d03050;
  }
}
</style>
