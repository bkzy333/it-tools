<script setup lang="ts">
/**
 * SM4 加解密页。
 *
 * 布局上有一条刻意的取舍：**加密与解密共用同一份参数**（模式 / 填充 / 密钥 / IV / 字符集）。
 * 真实的坑几乎都是「加密用了一套参数、解密换了另一套」，把参数放两份只会制造这种机会。
 * 所以参数卡片在上、加解密是下面两个 tab，切 tab 不改任何参数。
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { computedCatch } from '@/composable/computed/catchedComputed';
import type { Charset } from '../crypto-utils/charset';
import { decodeBytes, encodeText } from '../crypto-utils/charset';
import { describeKeyInput, parseKeyInput } from '../crypto-utils/key-input';
import { decryptSm4, describeSm4Key, encryptSm4, SM4_BLOCK_SIZE, type Sm4Mode, type Sm4Padding } from './sm4.service';

const { t } = useI18n();

type Tab = 'encrypt' | 'decrypt';

const tab = ref<Tab>('encrypt');

// ——— 共用参数 ———
const mode = ref<Sm4Mode>('cbc');
const padding = ref<Sm4Padding>('pkcs7');
const key = ref('[HEX]:0123456789abcdeffedcba9876543210');
const keyCharset = ref<Charset>('utf8');
const iv = ref('[HEX]:000102030405060708090a0b0c0d0e0f');
const ivCharset = ref<Charset>('utf8');
const textCharset = ref<Charset>('utf8');
const cipherCharset = ref<Charset>('base64');

const charsetOptions = computed(() => [
  { label: t('tools.sm4.texts.charset-utf8'), value: 'utf8' },
  { label: t('tools.sm4.texts.charset-gbk'), value: 'gbk' },
  { label: t('tools.sm4.texts.charset-utf16le'), value: 'utf16le' },
  { label: t('tools.sm4.texts.charset-base64'), value: 'base64' },
  { label: t('tools.sm4.texts.charset-hex'), value: 'hex' },
]);

const cipherCharsetOptions = computed(() =>
  charsetOptions.value.filter(option => option.value === 'base64' || option.value === 'hex'),
);

const modeOptions = computed(() => [
  { label: t('tools.sm4.texts.mode-cbc'), value: 'cbc' },
  { label: t('tools.sm4.texts.mode-ecb'), value: 'ecb' },
]);

const paddingOptions = computed(() => [
  { label: t('tools.sm4.texts.padding-pkcs7'), value: 'pkcs7' },
  { label: t('tools.sm4.texts.padding-none'), value: 'none' },
]);

const isCbc = computed(() => mode.value === 'cbc');

/** 服务层要的配置对象；两个 tab 共用 */
const config = computed(() => ({
  mode: mode.value,
  padding: padding.value,
  key: key.value,
  keyCharset: keyCharset.value,
  iv: iv.value,
  ivCharset: ivCharset.value,
}));

/** 密钥框下方的实时说明：识别成字节了没有、补了几个 0x00 */
const keyHint = computed(() => {
  try {
    return describeKeyInput(describeSm4Key(config.value));
  }
  catch (error) {
    return (error as Error).message;
  }
});

const ivHint = computed(() => {
  if (!isCbc.value) {
    return '';
  }
  try {
    return describeKeyInput(parseKeyInput(iv.value, ivCharset.value, SM4_BLOCK_SIZE));
  }
  catch (error) {
    return (error as Error).message;
  }
});

// ——— 加密 ———
const plaintext = ref('国密 SM4 加密测试：你好，世界');
const [cipherOutput, cipherError] = computedCatch(
  () => decodeBytes(encryptSm4(encodeText(plaintext.value, textCharset.value), config.value), cipherCharset.value),
  { defaultValue: '' },
);

// ——— 解密 ———
const ciphertext = ref('');
const [plainOutput, plainError] = computedCatch(
  () => decodeBytes(decryptSm4(encodeText(ciphertext.value, cipherCharset.value), config.value), textCharset.value),
  { defaultValue: '' },
);

/** 加密结果一键带到解密框，省得手抄 */
function useCipherAsInput() {
  ciphertext.value = cipherOutput.value ?? '';
  tab.value = 'decrypt';
}

const exampleData = {
  plaintext: '国密 SM4 加密测试：你好，世界',
  ciphertext: '',
};

function loadExample() {
  plaintext.value = exampleData.plaintext;
  mode.value = 'cbc';
  padding.value = 'pkcs7';
  key.value = '[HEX]:0123456789abcdeffedcba9876543210';
  iv.value = '[HEX]:000102030405060708090a0b0c0d0e0f';
  textCharset.value = 'utf8';
  cipherCharset.value = 'base64';
  tab.value = 'encrypt';
}
</script>

<template>
  <div class="sm4-tool">
    <div flex justify-end mb-2>
      <ToolExampleButton @click="loadExample" />
    </div>

    <!-- 共用参数 -->
    <c-card :title="t('tools.sm4.texts.title-config')">
      <div class="config-grid">
        <c-select v-model:value="mode" :label="t('tools.sm4.texts.label-mode')" :options="modeOptions" />
        <c-select v-model:value="padding" :label="t('tools.sm4.texts.label-padding')" :options="paddingOptions" />
        <c-select v-model:value="textCharset" :label="t('tools.sm4.texts.label-text-charset')" :options="charsetOptions" />
        <c-select
          v-model:value="cipherCharset"
          :label="t('tools.sm4.texts.label-cipher-charset')"
          :options="cipherCharsetOptions"
        />
      </div>

      <div class="config-grid" mt-3>
        <div>
          <c-input-text
            v-model:value="key"
            :label="t('tools.sm4.texts.label-key')"
            :placeholder="t('tools.sm4.texts.placeholder-key')"
            monospace
            clearable
          />
          <div class="hint" mt-1>{{ keyHint }}</div>
        </div>
        <c-select v-model:value="keyCharset" :label="t('tools.sm4.texts.label-key-charset')" :options="charsetOptions" />
      </div>

      <div v-if="isCbc" class="config-grid" mt-3>
        <div>
          <c-input-text
            v-model:value="iv"
            :label="t('tools.sm4.texts.label-iv')"
            :placeholder="t('tools.sm4.texts.placeholder-iv')"
            monospace
            clearable
          />
          <div class="hint" mt-1>{{ ivHint }}</div>
        </div>
        <c-select v-model:value="ivCharset" :label="t('tools.sm4.texts.label-iv-charset')" :options="charsetOptions" />
      </div>

      <div class="hint" mt-3>{{ t('tools.sm4.texts.hint-hex-prefix') }}</div>
      <div v-if="padding === 'none'" class="hint hint-warn" mt-1>
        {{ t('tools.sm4.texts.hint-padding-none', { block: SM4_BLOCK_SIZE }) }}
      </div>
    </c-card>

    <n-tabs v-model:value="tab" type="line" mt-3>
      <n-tab-pane name="encrypt" :tab="t('tools.sm4.texts.tab-encrypt')">
        <c-card :title="t('tools.sm4.texts.title-encrypt')">
          <c-input-text
            v-model:value="plaintext"
            :label="t('tools.sm4.texts.label-plaintext')"
            :placeholder="t('tools.sm4.texts.placeholder-plaintext')"
            multiline
            :rows="4"
            :max-rows="12"
            autosize
            monospace
            clearable
          />
          <c-alert v-if="cipherError" type="error" mt-3 :title="t('tools.sm4.texts.title-error')">
            {{ cipherError }}
          </c-alert>
          <template v-else>
            <c-input-text
              :label="t('tools.sm4.texts.label-output')"
              :value="cipherOutput ?? ''"
              multiline
              :rows="3"
              autosize
              monospace
              readonly
              mt-3
            />
            <div flex justify-end gap-2 mt-2>
              <c-button v-if="cipherOutput" size="small" @click="useCipherAsInput">
                {{ t('tools.sm4.texts.btn-use-as-input') }}
              </c-button>
              <CopyExportBar v-if="cipherOutput" :text="cipherOutput" filename="sm4-cipher" />
            </div>
          </template>
        </c-card>
      </n-tab-pane>

      <n-tab-pane name="decrypt" :tab="t('tools.sm4.texts.tab-decrypt')">
        <c-card :title="t('tools.sm4.texts.title-decrypt')">
          <c-input-text
            v-model:value="ciphertext"
            :label="t('tools.sm4.texts.label-ciphertext')"
            :placeholder="t('tools.sm4.texts.placeholder-ciphertext')"
            multiline
            :rows="4"
            :max-rows="12"
            autosize
            monospace
            clearable
          />
          <c-alert v-if="plainError" type="error" mt-3 :title="t('tools.sm4.texts.title-error')">
            {{ plainError }}
          </c-alert>
          <template v-else>
            <c-input-text
              :label="t('tools.sm4.texts.label-output')"
              :value="plainOutput ?? ''"
              multiline
              :rows="4"
              autosize
              readonly
              mt-3
            />
            <div flex justify-end mt-2>
              <CopyExportBar v-if="plainOutput" :text="plainOutput" filename="sm4-plain" />
            </div>
          </template>
        </c-card>
      </n-tab-pane>
    </n-tabs>

    <c-card :title="t('tools.sm4.texts.title-about')" mt-3>
      <div class="hint">{{ t('tools.sm4.texts.hint-about') }}</div>
      <div class="hint" mt-1>{{ t('tools.sm4.texts.hint-charset-binary') }}</div>
    </c-card>
  </div>
</template>

<style scoped lang="less">
.sm4-tool {
  .config-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 12px;
  }

  .hint {
    font-size: 13px;
    color: var(--n-text-color-disabled, #999);
  }

  .hint-warn {
    color: #d03050;
  }
}
</style>
