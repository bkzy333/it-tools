<script setup lang="ts">
/**
 * SM2 加解密 / 签名验签页。
 *
 * 与 /rsa 同样的骨架（密钥 → 加解密 → 签名验签三个 tab，密钥共享），差异来自 SM2 本身：
 * - 密钥就是十六进制串（公钥 130 位 04 开头、私钥 64 位），没有 PEM 这一层
 * - **密文有两种排列**（C1C3C2 国密标准 / C1C2C3 旧实现），长度一模一样、选错只解出乱码，
 *   所以这一项必须显式摆出来并解释清楚
 * - **签名会绑定 userId**（默认 1234567812345678），两端不一致就验不过 —— 这跟 RSA 完全不同
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { computedCatch } from '@/composable/computed/catchedComputed';
import { base64ToBytes, bytesToBase64, bytesToHex, decodeBytes, encodeText, hexToBytes, type Charset } from '../crypto-utils/charset';
import type { Sm2CipherMode, Sm2KeyPairHex } from './sm2.service';
import {
  decryptSm2,
  encryptSm2,
  generateSm2KeyPair,
  normalizeSm2PrivateKey,
  normalizeSm2PublicKey,
  publicKeyFromPrivate,
  signSm2,
  SM2_DEFAULT_USER_ID,
  verifySm2,
} from './sm2.service';

const { t } = useI18n();

type Tab = 'keys' | 'cipher' | 'sign';

const tab = ref<Tab>('keys');

// ——— 密钥 ———
const keys = ref<Sm2KeyPairHex>({ privateKey: '', publicKey: '' });
const generating = ref(false);
const generateMs = ref(0);

const publicKeyInfo = computed(() => {
  if (!keys.value.publicKey.trim()) {
    return { normalized: '', error: '', empty: true };
  }
  try {
    return { normalized: normalizeSm2PublicKey(keys.value.publicKey), error: '', empty: false };
  }
  catch (error) {
    return { normalized: '', error: (error as Error).message, empty: false };
  }
});

const privateKeyInfo = computed(() => {
  if (!keys.value.privateKey.trim()) {
    return { normalized: '', error: '', empty: true };
  }
  try {
    return { normalized: normalizeSm2PrivateKey(keys.value.privateKey), error: '', empty: false };
  }
  catch (error) {
    return { normalized: '', error: (error as Error).message, empty: false };
  }
});

/** 公私钥不配对时给出提示 —— 这类错误在联调里最难自己发现 */
const pairMatches = computed(() => {
  if (!privateKeyInfo.value.normalized || !publicKeyInfo.value.normalized) {
    return null;
  }
  try {
    return publicKeyFromPrivate(privateKeyInfo.value.normalized) === publicKeyInfo.value.normalized;
  }
  catch {
    return null;
  }
});

async function generateKeys() {
  generating.value = true;
  await new Promise(resolve => setTimeout(resolve, 30));
  const startedAt = performance.now();
  try {
    keys.value = generateSm2KeyPair();
    generateMs.value = Math.round(performance.now() - startedAt);
  }
  finally {
    generating.value = false;
  }
}

/** 只给了私钥时，点一下就能补出公钥 */
function derivePublicFromPrivate() {
  try {
    keys.value.publicKey = publicKeyFromPrivate(keys.value.privateKey);
  }
  catch {
    // 私钥非法时错误已经显示在私钥框下面，这里不需要额外动作
  }
}

// ——— 加解密 ———
const cipherMode = ref<Sm2CipherMode>('c1c3c2');
const textCharset = ref<Charset>('utf8');
const cipherFormat = ref<Charset>('hex');
const plaintext = ref('');
const ciphertext = ref('');

const cipherModeOptions = computed(() => [
  { label: t('tools.sm2.texts.cipher-mode-c1c3c2'), value: 'c1c3c2' },
  { label: t('tools.sm2.texts.cipher-mode-c1c2c3'), value: 'c1c2c3' },
]);

const textCharsetOptions = computed(() => [
  { label: t('tools.sm2.texts.charset-utf8'), value: 'utf8' },
  { label: t('tools.sm2.texts.charset-gbk'), value: 'gbk' },
  { label: t('tools.sm2.texts.charset-utf16le'), value: 'utf16le' },
]);

const cipherFormatOptions = computed(() => [
  { label: t('tools.sm2.texts.charset-hex'), value: 'hex' },
  { label: t('tools.sm2.texts.charset-base64'), value: 'base64' },
]);

const [encryptedOutput, encryptError] = computedCatch(
  () => {
    if (!plaintext.value) {
      return '';
    }
    const bytes = encryptSm2(
      encodeText(plaintext.value, textCharset.value),
      publicKeyInfo.value.normalized || keys.value.publicKey,
      cipherMode.value,
    );

    return cipherFormat.value === 'base64' ? bytesToBase64(bytes) : bytesToHex(bytes);
  },
  { defaultValue: '' },
);

const [decryptedOutput, decryptError] = computedCatch(
  () => {
    if (!ciphertext.value) {
      return '';
    }
    const bytes = cipherFormat.value === 'base64' ? base64ToBytes(ciphertext.value) : hexToBytes(ciphertext.value);

    return decodeBytes(decryptSm2(bytes, keys.value.privateKey, cipherMode.value), textCharset.value);
  },
  { defaultValue: '' },
);

function useCipherAsDecryptInput() {
  ciphertext.value = encryptedOutput.value ?? '';
  tab.value = 'cipher';
}

// ——— 签名验签 ———
const signMessage = ref('');
const userId = ref(SM2_DEFAULT_USER_ID);
const signFormat = ref<'raw' | 'der'>('raw');
const signature = ref('');
const verifyMessage = ref('');
const verifySignature = ref('');
const verifyResult = ref<'ok' | 'fail' | ''>('');
const verifyError = ref('');

const signFormatOptions = computed(() => [
  { label: t('tools.sm2.texts.sign-format-raw'), value: 'raw' },
  { label: t('tools.sm2.texts.sign-format-der'), value: 'der' },
]);

const [signatureOutput, signError] = computedCatch(
  () => {
    if (!signMessage.value) {
      return '';
    }
    const bytes = signSm2(new TextEncoder().encode(signMessage.value), keys.value.privateKey, {
      userId: userId.value,
      der: signFormat.value === 'der',
    });

    return cipherFormat.value === 'base64' ? bytesToBase64(bytes) : bytesToHex(bytes);
  },
  { defaultValue: '' },
);

function doVerify() {
  verifyResult.value = '';
  verifyError.value = '';
  try {
    const bytes = cipherFormat.value === 'base64' ? base64ToBytes(verifySignature.value) : hexToBytes(verifySignature.value);
    const ok = verifySm2(new TextEncoder().encode(verifyMessage.value), bytes, keys.value.publicKey, {
      userId: userId.value,
      der: signFormat.value === 'der',
    });

    verifyResult.value = ok ? 'ok' : 'fail';
  }
  catch (error) {
    verifyResult.value = 'fail';
    verifyError.value = (error as Error).message;
  }
}

function useSignatureForVerify() {
  verifyMessage.value = signMessage.value;
  verifySignature.value = signatureOutput.value ?? '';
  verifyResult.value = '';
  verifyError.value = '';
}

async function loadExample() {
  await generateKeys();
  cipherMode.value = 'c1c3c2';
  textCharset.value = 'utf8';
  cipherFormat.value = 'hex';
  plaintext.value = '国密 SM2 加密测试';
  signMessage.value = '要签名的消息内容';
  userId.value = SM2_DEFAULT_USER_ID;
  signFormat.value = 'raw';
  ciphertext.value = '';
  verifyMessage.value = '';
  verifySignature.value = '';
  verifyResult.value = '';
  tab.value = 'keys';
}
</script>

<template>
  <div class="sm2-tool">
    <div flex justify-end mb-2>
      <ToolExampleButton @click="loadExample" />
    </div>

    <n-tabs v-model:value="tab" type="line">
      <!-- ——— 密钥对 ——— -->
      <n-tab-pane name="keys" :tab="t('tools.sm2.texts.tab-keys')">
        <c-card :title="t('tools.sm2.texts.title-keys')" mt-3>
          <div flex flex-wrap items-end gap-3>
            <c-button type="primary" :disabled="generating" @click="generateKeys">
              {{ generating ? t('tools.sm2.texts.btn-generating') : t('tools.sm2.texts.btn-generate') }}
            </c-button>
            <span v-if="generateMs > 0" class="hint">{{ t('tools.sm2.texts.hint-generate-ms', { ms: generateMs }) }}</span>
          </div>
          <div class="hint" mt-2>{{ t('tools.sm2.texts.hint-key-format') }}</div>

          <div mt-4>
            <c-input-text
              v-model:value="keys.publicKey"
              :label="t('tools.sm2.texts.label-public-key')"
              :placeholder="t('tools.sm2.texts.placeholder-public-key')"
              multiline
              :rows="3"
              :max-rows="8"
              autosize
              monospace
              clearable
            />
            <div v-if="publicKeyInfo.error" class="hint hint-warn" mt-1>{{ publicKeyInfo.error }}</div>
            <div v-else-if="publicKeyInfo.normalized" class="hint hint-ok" mt-1>
              {{ t('tools.sm2.texts.hint-public-ok', { len: publicKeyInfo.normalized.length }) }}
            </div>
            <div v-else class="hint" mt-1>{{ t('tools.sm2.texts.hint-empty-key') }}</div>
          </div>

          <div mt-4>
            <c-input-text
              v-model:value="keys.privateKey"
              :label="t('tools.sm2.texts.label-private-key')"
              :placeholder="t('tools.sm2.texts.placeholder-private-key')"
              monospace
              clearable
            />
            <div v-if="privateKeyInfo.error" class="hint hint-warn" mt-1>{{ privateKeyInfo.error }}</div>
            <div v-else-if="privateKeyInfo.normalized" class="hint hint-ok" mt-1>
              {{ t('tools.sm2.texts.hint-private-ok') }}
            </div>
            <div v-else class="hint" mt-1>{{ t('tools.sm2.texts.hint-empty-key') }}</div>
            <div flex justify-end mt-2>
              <c-button size="small" :disabled="!privateKeyInfo.normalized" @click="derivePublicFromPrivate">
                {{ t('tools.sm2.texts.btn-derive-public') }}
              </c-button>
            </div>
          </div>

          <div v-if="pairMatches === false" class="verdict verdict-bad" mt-2>
            {{ t('tools.sm2.texts.warn-pair-mismatch') }}
          </div>
          <div v-else-if="pairMatches === true" class="hint hint-ok" mt-2>
            {{ t('tools.sm2.texts.hint-pair-ok') }}
          </div>

          <div class="hint" mt-3>{{ t('tools.sm2.texts.hint-private-warning') }}</div>
        </c-card>
      </n-tab-pane>

      <!-- ——— 加解密 ——— -->
      <n-tab-pane name="cipher" :tab="t('tools.sm2.texts.tab-cipher')">
        <c-card :title="t('tools.sm2.texts.title-config')" mt-3>
          <div class="config-grid">
            <c-select v-model:value="cipherMode" :label="t('tools.sm2.texts.label-cipher-mode')" :options="cipherModeOptions" />
            <c-select v-model:value="textCharset" :label="t('tools.sm2.texts.label-text-charset')" :options="textCharsetOptions" />
            <c-select v-model:value="cipherFormat" :label="t('tools.sm2.texts.label-cipher-charset')" :options="cipherFormatOptions" />
          </div>
          <div class="hint" mt-2>{{ t('tools.sm2.texts.hint-cipher-mode') }}</div>
        </c-card>

        <c-card :title="t('tools.sm2.texts.title-encrypt')" mt-3>
          <c-input-text
            v-model:value="plaintext"
            :label="t('tools.sm2.texts.label-plaintext')"
            :placeholder="t('tools.sm2.texts.placeholder-plaintext')"
            multiline
            :rows="4"
            :max-rows="12"
            autosize
            clearable
          />
          <c-alert v-if="encryptError" type="error" mt-3 :title="t('tools.sm2.texts.title-error')">
            {{ encryptError }}
          </c-alert>
          <template v-else>
            <c-input-text
              :label="t('tools.sm2.texts.label-ciphertext')"
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
                {{ t('tools.sm2.texts.btn-use-as-input') }}
              </c-button>
              <CopyExportBar v-if="encryptedOutput" :text="encryptedOutput" filename="sm2-cipher" />
            </div>
          </template>
        </c-card>

        <c-card :title="t('tools.sm2.texts.title-decrypt')" mt-3>
          <c-input-text
            v-model:value="ciphertext"
            :label="t('tools.sm2.texts.label-ciphertext-in')"
            :placeholder="t('tools.sm2.texts.placeholder-ciphertext')"
            multiline
            :rows="4"
            :max-rows="12"
            autosize
            monospace
            clearable
          />
          <c-alert v-if="decryptError" type="error" mt-3 :title="t('tools.sm2.texts.title-error')">
            {{ decryptError }}
          </c-alert>
          <template v-else>
            <c-input-text
              :label="t('tools.sm2.texts.label-plaintext-out')"
              :value="decryptedOutput ?? ''"
              multiline
              :rows="4"
              autosize
              readonly
              mt-3
            />
            <div flex justify-end mt-2>
              <CopyExportBar v-if="decryptedOutput" :text="decryptedOutput" filename="sm2-plain" />
            </div>
          </template>
        </c-card>
      </n-tab-pane>

      <!-- ——— 签名验签 ——— -->
      <n-tab-pane name="sign" :tab="t('tools.sm2.texts.tab-sign')">
        <c-card :title="t('tools.sm2.texts.title-sign')" mt-3>
          <c-input-text
            v-model:value="signMessage"
            :label="t('tools.sm2.texts.label-sign-message')"
            :placeholder="t('tools.sm2.texts.placeholder-sign-message')"
            multiline
            :rows="4"
            :max-rows="12"
            autosize
            clearable
          />
          <div class="config-grid" mt-3>
            <c-input-text v-model:value="userId" :label="t('tools.sm2.texts.label-user-id')" monospace clearable />
            <c-select v-model:value="signFormat" :label="t('tools.sm2.texts.label-sign-format')" :options="signFormatOptions" />
          </div>
          <div class="hint" mt-2>{{ t('tools.sm2.texts.hint-user-id') }}</div>
          <c-alert v-if="signError" type="error" mt-3 :title="t('tools.sm2.texts.title-error')">
            {{ signError }}
          </c-alert>
          <template v-else>
            <c-input-text
              :label="t('tools.sm2.texts.label-signature')"
              :value="signatureOutput ?? ''"
              multiline
              :rows="3"
              autosize
              monospace
              readonly
              mt-3
            />
            <div flex justify-end gap-2 mt-2>
              <c-button v-if="signatureOutput" size="small" @click="useSignatureForVerify">
                {{ t('tools.sm2.texts.btn-to-verify') }}
              </c-button>
              <CopyExportBar v-if="signatureOutput" :text="signatureOutput" filename="sm2-signature" />
            </div>
          </template>
        </c-card>

        <c-card :title="t('tools.sm2.texts.title-verify')" mt-3>
          <c-input-text
            v-model:value="verifyMessage"
            :label="t('tools.sm2.texts.label-verify-message')"
            :placeholder="t('tools.sm2.texts.placeholder-sign-message')"
            multiline
            :rows="3"
            :max-rows="10"
            autosize
            clearable
          />
          <c-input-text
            v-model:value="verifySignature"
            :label="t('tools.sm2.texts.label-verify-signature')"
            :placeholder="t('tools.sm2.texts.placeholder-signature')"
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
              {{ t('tools.sm2.texts.btn-verify') }}
            </c-button>
          </div>
          <c-alert v-if="verifyError" type="error" mt-3 :title="t('tools.sm2.texts.title-error')">
            {{ verifyError }}
          </c-alert>
          <div v-if="verifyResult" class="verdict" :class="verifyResult === 'ok' ? 'verdict-ok' : 'verdict-bad'" mt-3>
            {{ verifyResult === 'ok' ? t('tools.sm2.texts.verify-ok') : t('tools.sm2.texts.verify-fail') }}
          </div>
        </c-card>
      </n-tab-pane>
    </n-tabs>

    <c-card :title="t('tools.sm2.texts.title-about')" mt-3>
      <div class="hint">{{ t('tools.sm2.texts.hint-about') }}</div>
    </c-card>
  </div>
</template>

<style scoped lang="less">
.sm2-tool {
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
