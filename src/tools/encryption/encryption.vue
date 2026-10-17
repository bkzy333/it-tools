<script setup lang="ts">
/**
 * AES / 对称加密页。
 *
 * 两条并存的链路，这一点是刻意的：
 *
 * 1. **AES（可配置）** —— 新增。位数（128/192/256）、模式（CBC/ECB/CTR/OFB/CFB）、
 *    填充（PKCS#7/Zero/ISO10126/Ansix923/不填充）、IV、输入输出字符集、`[HEX]:` 密钥，
 *    都是显式选项。走 aes-configurable.ts 的字节链路。
 *
 * 2. **原有 19 个算法** —— 保持原样。它们的实现把「随机 nonce 前置到密文」烘进了算法名里，
 *    硬改成显式 IV 会让历史密文全部失效，所以只是把它们收进同一个下拉的「历史算法」区，
 *    并额外支持 `[HEX]:` 密钥前缀（纯增量，不改变任何既有行为）。
 */
import type { Charset } from '../crypto-utils/charset';
import type { PaddingMode } from '../crypto-utils/padding';
import type { AesKeyBits, AesMode } from './aes-configurable';
import type { KeyEncoding } from './encryption.service';
import { computed, ref } from 'vue';
import { computedCatch } from '@/composable/computed/catchedComputed';
import { decodeBytes, encodeText } from '../crypto-utils/charset';
import { describeKeyInput, parseKeyInput, splitHexPrefix } from '../crypto-utils/key-input';
import {
  AES_KEY_BITS,
  AES_MODES,
  aesDecrypt,
  aesEncrypt,
  AES_BLOCK_SIZE,
  isAesStreamMode,
} from './aes-configurable';
import { algos } from './encryption.service';

const { t } = useI18n();

/** 下拉里代表「AES（可配置）」的哨兵值 */
const CONFIGURABLE = '__aes-configurable__';

const algo = ref<string>(CONFIGURABLE);
const isConfigurable = computed(() => algo.value === CONFIGURABLE);

// ——— 共享参数 ———
const bits = ref<AesKeyBits>(256);
const mode = ref<AesMode>('cbc');
const padding = ref<PaddingMode>('pkcs7');
const keyInput = ref('my secret key 16');
const keyCharset = ref<Charset>('utf8');
const ivInput = ref('[HEX]:000102030405060708090a0b0c0d0e0f');
const ivCharset = ref<Charset>('utf8');
const inCharset = ref<Charset>('utf8');
const outCharset = ref<Charset>('base64');

const streamMode = computed(() => isAesStreamMode(mode.value));
const needsIv = computed(() => isConfigurable.value && mode.value !== 'ecb');

const config = computed(() => ({
  mode: mode.value,
  bits: bits.value,
  padding: padding.value,
  key: keyInput.value,
  keyCharset: keyCharset.value,
  iv: ivInput.value,
  ivCharset: ivCharset.value,
}));

// ——— 下拉选项 ———
const algoOptions = computed(() => [
  { label: t('tools.encryption.texts.algo-aes-configurable'), value: CONFIGURABLE },
  ...Object.keys(algos).map(name => ({ label: name, value: name })),
]);

const bitOptions = AES_KEY_BITS.map(value => ({ label: `${value} bit`, value }));
const modeOptions = AES_MODES.map(value => ({ label: value.toUpperCase(), value }));
const paddingOptions = computed(() => [
  { label: t('tools.encryption.texts.padding-pkcs7'), value: 'pkcs7' },
  { label: t('tools.encryption.texts.padding-zero'), value: 'zero' },
  { label: t('tools.encryption.texts.padding-iso10126'), value: 'iso10126' },
  { label: t('tools.encryption.texts.padding-ansix923'), value: 'ansix923' },
  { label: t('tools.encryption.texts.padding-none'), value: 'none' },
]);

const fullCharsetOptions = computed(() => [
  { label: t('tools.encryption.texts.charset-utf8'), value: 'utf8' },
  { label: t('tools.encryption.texts.charset-gbk'), value: 'gbk' },
  { label: t('tools.encryption.texts.charset-utf16le'), value: 'utf16le' },
  { label: t('tools.encryption.texts.charset-base64'), value: 'base64' },
  { label: t('tools.encryption.texts.charset-hex'), value: 'hex' },
]);

const textCharsetOptions = computed(() => fullCharsetOptions.value.slice(0, 3));
const binaryCharsetOptions = computed(() => fullCharsetOptions.value.slice(3));

/** 历史算法只认 UTF-8 与 Hex 两种密钥编码 */
const legacyKeyCharsetOptions = computed(() => [
  { label: t('tools.encryption.texts.charset-utf8'), value: 'utf8' },
  { label: t('tools.encryption.texts.charset-hex'), value: 'hex' },
]);

const keyCharsetOptions = computed(() => (isConfigurable.value ? fullCharsetOptions.value : legacyKeyCharsetOptions.value));

// ——— 密钥提示 ———
const keyHint = computed(() => {
  try {
    if (isConfigurable.value) {
      return describeKeyInput(parseKeyInput(keyInput.value, keyCharset.value, bits.value / 8));
    }
    const { usedHexPrefix, body } = splitHexPrefix(keyInput.value);

    return usedHexPrefix
      ? t('tools.encryption.texts.hint-legacy-hex-key', { bytes: Math.floor(body.replace(/\s/g, '').length / 2) })
      : t('tools.encryption.texts.hint-legacy-text-key');
  }
  catch (error) {
    return (error as Error).message;
  }
});

const ivHint = computed(() => {
  if (!needsIv.value) {
    return '';
  }
  try {
    return describeKeyInput(parseKeyInput(ivInput.value, ivCharset.value, AES_BLOCK_SIZE));
  }
  catch (error) {
    return (error as Error).message;
  }
});

/** 当前选中的历史算法。algo 是 string 是为了让下拉能包含哨兵值，这里收窄回 keyof typeof algos */
function legacyAlgo(): (typeof algos)[keyof typeof algos] {
  return (algos as Record<string, (typeof algos)[keyof typeof algos]>)[algo.value];
}

// ——— 历史算法的密钥归一（[HEX]: 前缀 → hex 编码）———
function legacyArgs(): { key: string; encoding: KeyEncoding } {
  const { body, usedHexPrefix } = splitHexPrefix(keyInput.value);

  return usedHexPrefix
    ? { key: body.trim(), encoding: 'Hex' }
    : { key: keyInput.value, encoding: keyCharset.value === 'hex' ? 'Hex' : 'Text' };
}

// ——— 加密 / 解密 ———
const plaintext = ref('Lorem ipsum dolor sit amet');
const ciphertext = ref('');

const [cipherOutput, cipherError] = computedCatch(
  () => {
    if (!plaintext.value) {
      return '';
    }
    if (isConfigurable.value) {
      return decodeBytes(aesEncrypt(encodeText(plaintext.value, inCharset.value), config.value), outCharset.value);
    }
    const { key, encoding } = legacyArgs();

    return legacyAlgo().encrypt(plaintext.value, key, encoding);
  },
  { defaultValue: '', defaultErrorMessage: t('tools.encryption.defaultErrorMessage') },
);

const [plainOutput, plainError] = computedCatch(
  () => {
    if (!ciphertext.value) {
      return '';
    }
    if (isConfigurable.value) {
      return decodeBytes(aesDecrypt(encodeText(ciphertext.value, outCharset.value), config.value), inCharset.value);
    }
    const { key, encoding } = legacyArgs();

    return legacyAlgo().decrypt(ciphertext.value, key, encoding);
  },
  { defaultValue: '', defaultErrorMessage: t('tools.encryption.defaultErrorMessage') },
);

function useCipherAsDecryptInput() {
  ciphertext.value = cipherOutput.value ?? '';
}

function loadExample() {
  algo.value = CONFIGURABLE;
  bits.value = 256;
  mode.value = 'cbc';
  padding.value = 'pkcs7';
  keyInput.value = 'my secret key 16';
  keyCharset.value = 'utf8';
  ivInput.value = '[HEX]:000102030405060708090a0b0c0d0e0f';
  ivCharset.value = 'utf8';
  inCharset.value = 'utf8';
  outCharset.value = 'base64';
  plaintext.value = 'Lorem ipsum dolor sit amet';
  ciphertext.value = '';
}
</script>

<template>
  <div class="encryption-tool">
    <div flex justify-end mb-2>
      <ToolExampleButton @click="loadExample" />
    </div>

    <!-- 参数 -->
    <c-card :title="t('tools.encryption.texts.title-params')">
      <div class="config-grid">
        <c-select v-model:value="algo" :label="t('tools.encryption.texts.label-encryption-algorithm')" :options="algoOptions" />
        <c-select
          v-if="isConfigurable"
          v-model:value="bits"
          :label="t('tools.encryption.texts.label-key-bits')"
          :options="bitOptions"
        />
        <c-select v-if="isConfigurable" v-model:value="mode" :label="t('tools.encryption.texts.label-aes-mode')" :options="modeOptions" />
        <c-select
          v-if="isConfigurable && !streamMode"
          v-model:value="padding"
          :label="t('tools.encryption.texts.label-padding-mode')"
          :options="paddingOptions"
        />
      </div>

      <div class="config-grid" mt-3>
        <div>
          <c-input-text
            v-model:value="keyInput"
            :label="t('tools.encryption.texts.label-your-secret-key')"
            :placeholder="t('tools.encryption.texts.placeholder-key')"
            monospace
            clearable
          />
          <div class="hint" mt-1>{{ keyHint }}</div>
        </div>
        <c-select v-model:value="keyCharset" :label="t('tools.encryption.texts.label-key-encoding')" :options="keyCharsetOptions" />
      </div>

      <div v-if="needsIv" class="config-grid" mt-3>
        <div>
          <c-input-text
            v-model:value="ivInput"
            :label="t('tools.encryption.texts.label-iv')"
            :placeholder="t('tools.encryption.texts.placeholder-iv')"
            monospace
            clearable
          />
          <div class="hint" mt-1>{{ ivHint }}</div>
        </div>
        <c-select v-model:value="ivCharset" :label="t('tools.encryption.texts.label-iv-encoding')" :options="fullCharsetOptions" />
      </div>

      <div v-if="isConfigurable" class="config-grid" mt-3>
        <c-select v-model:value="inCharset" :label="t('tools.encryption.texts.label-input-charset')" :options="fullCharsetOptions" />
        <c-select v-model:value="outCharset" :label="t('tools.encryption.texts.label-output-charset')" :options="binaryCharsetOptions" />
      </div>

      <div v-if="isConfigurable && streamMode" class="hint" mt-3>
        {{ t('tools.encryption.texts.hint-stream-mode', { mode: mode.toUpperCase() }) }}
      </div>
      <div v-else-if="isConfigurable" class="hint" mt-3>
        {{ t('tools.encryption.texts.hint-aes-key', { bytes: bits / 8 }) }}
      </div>
      <div v-else class="hint mt-3">{{ t('tools.encryption.texts.hint-legacy-algo') }}</div>
      <div class="hint" mt-1>{{ t('tools.encryption.texts.hint-hex-prefix') }}</div>
    </c-card>

    <!-- 加密 -->
    <c-card :title="t('tools.encryption.title-encrypt')" mt-3>
      <c-input-text
        v-model:value="plaintext"
        :label="t('tools.encryption.texts.label-your-text')"
        :placeholder="t('tools.encryption.texts.placeholder-the-string-to-cypher')"
        multiline
        :rows="4"
        :max-rows="12"
        autosize
        monospace
        clearable
      />
      <c-alert v-if="cipherError" type="error" mt-3 :title="t('tools.encryption.texts.title-error-while-cyphering')">
        {{ cipherError }}
      </c-alert>
      <template v-else>
        <c-input-text
          :label="t('tools.encryption.texts.label-your-text-encrypted')"
          :value="cipherOutput ?? ''"
          multiline
          :rows="3"
          autosize
          monospace
          readonly
          mt-3
        />
        <div flex justify-end gap-2 mt-2>
          <c-button v-if="cipherOutput" size="small" @click="useCipherAsDecryptInput">
            {{ t('tools.encryption.texts.btn-use-as-input') }}
          </c-button>
          <CopyExportBar v-if="cipherOutput" :text="cipherOutput ?? ''" filename="encrypted" />
        </div>
      </template>
    </c-card>

    <!-- 解密 -->
    <c-card :title="t('tools.encryption.title-decrypt')" mt-3>
      <c-input-text
        v-model:value="ciphertext"
        :label="t('tools.encryption.texts.label-your-encrypted-text')"
        :placeholder="t('tools.encryption.texts.placeholder-ciphertext')"
        multiline
        :rows="4"
        :max-rows="12"
        autosize
        monospace
        clearable
      />
      <c-alert v-if="plainError" type="error" mt-3 :title="t('tools.encryption.texts.title-error-while-decrypting')">
        {{ plainError }}
      </c-alert>
      <template v-else>
        <c-input-text
          :label="t('tools.encryption.texts.label-your-decrypted-text')"
          :value="plainOutput ?? ''"
          multiline
          :rows="3"
          autosize
          readonly
          mt-3
        />
        <div flex justify-end mt-2>
          <CopyExportBar v-if="plainOutput" :text="plainOutput ?? ''" filename="decrypted" />
        </div>
      </template>
    </c-card>
  </div>
</template>

<style scoped lang="less">
.encryption-tool {
  .config-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
  }

  .hint {
    font-size: 13px;
    color: var(--n-text-color-disabled, #999);
  }
}
</style>
