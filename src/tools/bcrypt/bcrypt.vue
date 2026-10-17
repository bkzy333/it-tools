<script setup lang="ts">
/**
 * bcrypt 生成 / 校验。
 *
 * 两个刻意的设计：
 * - **必须点按钮才算**：cost 10 一次就是几十毫秒，cost 14 到一秒级，绑在输入事件上会把
 *   输入框卡住（每敲一个字跑一次 bcrypt）。所以用显式「生成 / 校验」。
 * - **超 72 字节要报警**：bcrypt 只取前 72 字节，中文 24 字就到顶；不提示的话用户会以为
 *   长密码更安全，实际上后面那截根本没参与计算。
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  COST_DEFAULT,
  COST_MAX,
  COST_MIN,
  MAX_PASSWORD_BYTES,
  estimateDurationMs,
  getCost,
  getVersion,
  hashPassword,
  isBcryptHash,
  normalizeCost,
  passwordByteLength,
  verifyPassword,
  willBeTruncated,
} from './bcrypt.service';

const { t } = useI18n();

type Tab = 'hash' | 'verify';
type VerifyState = 'idle' | 'ok' | 'fail' | 'bad-hash';

const tab = ref<Tab>('hash');

// ——— 生成 ———
const password = ref('correct horse battery staple');
const cost = ref(COST_DEFAULT);
const hashResult = ref('');
const hashError = ref('');
const hashCost = computed(() => normalizeCost(cost.value));
const estimatedMs = computed(() => estimateDurationMs(hashCost.value));
const byteLength = computed(() => passwordByteLength(password.value));
const truncated = computed(() => willBeTruncated(password.value));

function generate() {
  hashError.value = '';
  hashResult.value = '';
  try {
    hashResult.value = hashPassword(password.value, hashCost.value);
  }
  catch (error) {
    hashError.value = (error as Error).message;
  }
}

// ——— 校验 ———
const candidate = ref('');
const storedHash = ref('');
const verifyState = ref<VerifyState>('idle');
const hashCostInStored = computed(() => getCost(storedHash.value));
const hashVersionInStored = computed(() => getVersion(storedHash.value));

function verify() {
  if (!isBcryptHash(storedHash.value)) {
    verifyState.value = 'bad-hash';

    return;
  }
  verifyState.value = verifyPassword(candidate.value, storedHash.value) ? 'ok' : 'fail';
}

const exampleData = {
  password: 'correct horse battery staple',
  candidate: 'correct horse battery staple',
  storedHash: '',
};

/** 示例里现算一个哈希，避免写死一个可能被当成"真实密码"的常量 */
function loadExample() {
  tab.value = 'hash';
  password.value = exampleData.password;
  cost.value = 10;
  generate();
}

const resultText = computed(() => hashResult.value);
</script>

<template>
  <div class="bcrypt-tool">
    <div flex justify-end mb-2>
      <ToolExampleButton @click="loadExample" />
    </div>

    <n-tabs v-model:value="tab" type="line">
      <!-- 生成 -->
      <n-tab-pane name="hash" :tab="t('tools.bcrypt.texts.tab-hash')">
        <c-card :title="t('tools.bcrypt.texts.title-hash')" mt-3>
          <c-input-text
            v-model:value="password"
            :label="t('tools.bcrypt.texts.label-password')"
            :placeholder="t('tools.bcrypt.texts.placeholder-password')"
            multiline
            :rows="2"
            :max-rows="6"
            autosize
            monospace
            clearable
          />
          <div class="hint" mt-1>
            {{ t('tools.bcrypt.texts.hint-byte-length', { bytes: byteLength, max: MAX_PASSWORD_BYTES }) }}
          </div>
          <div v-if="truncated" class="hint hint-warn" mt-1>
            {{ t('tools.bcrypt.texts.hint-truncated', { max: MAX_PASSWORD_BYTES }) }}
          </div>

          <div flex flex-wrap items-center gap-3 mt-3>
            <span text-sm op-70>{{ t('tools.bcrypt.texts.label-cost') }}</span>
            <n-slider v-model:value="cost" :min="COST_MIN" :max="COST_MAX" :step="1" style="width: 240px" />
            <span class="cost-value">{{ hashCost }}</span>
          </div>
          <div class="hint" mt-1>
            {{ t('tools.bcrypt.texts.hint-cost', { ms: estimatedMs }) }}
          </div>

          <div flex justify-end mt-3>
            <c-button @click="generate">
              {{ t('tools.bcrypt.texts.btn-generate') }}
            </c-button>
          </div>

          <c-alert v-if="hashError" type="error" mt-3 :title="t('tools.bcrypt.texts.title-error')">
            {{ hashError }}
          </c-alert>
        </c-card>

        <c-card v-if="hashResult" :title="t('tools.bcrypt.texts.title-hash-result')" mt-3>
          <input-copyable :value="hashResult" mb-2 />
          <div class="hint">
            {{ t('tools.bcrypt.texts.hint-random-salt', { cost: getCost(hashResult) ?? '', version: getVersion(hashResult) ?? '' }) }}
          </div>
          <div flex justify-end mt-2>
            <CopyExportBar :text="resultText" filename="bcrypt-hash" :rows="[['password', 'bcrypt hash'], [password, hashResult]]" />
          </div>
        </c-card>
      </n-tab-pane>

      <!-- 校验 -->
      <n-tab-pane name="verify" :tab="t('tools.bcrypt.texts.tab-verify')">
        <c-card :title="t('tools.bcrypt.texts.title-verify')" mt-3>
          <c-input-text
            v-model:value="storedHash"
            :label="t('tools.bcrypt.texts.label-stored-hash')"
            :placeholder="t('tools.bcrypt.texts.placeholder-stored-hash')"
            monospace
            clearable
          />
          <div v-if="hashCostInStored !== null" class="hint" mt-1>
            {{ t('tools.bcrypt.texts.hint-hash-meta', { version: hashVersionInStored, cost: hashCostInStored }) }}
          </div>

          <c-input-text
            v-model:value="candidate"
            :label="t('tools.bcrypt.texts.label-candidate')"
            :placeholder="t('tools.bcrypt.texts.placeholder-candidate')"
            multiline
            :rows="2"
            :max-rows="6"
            autosize
            monospace
            clearable
            mt-3
          />

          <div flex justify-end mt-3>
            <c-button :disabled="!storedHash" @click="verify">
              {{ t('tools.bcrypt.texts.btn-verify') }}
            </c-button>
          </div>

          <div v-if="verifyState !== 'idle'" class="verdict" :class="verifyState === 'ok' ? 'verdict-ok' : 'verdict-bad'" mt-3>
            <template v-if="verifyState === 'ok'">{{ t('tools.bcrypt.texts.verify-ok') }}</template>
            <template v-else-if="verifyState === 'fail'">{{ t('tools.bcrypt.texts.verify-fail') }}</template>
            <template v-else>{{ t('tools.bcrypt.texts.verify-bad-hash') }}</template>
          </div>
        </c-card>
      </n-tab-pane>
    </n-tabs>

    <c-card :title="t('tools.bcrypt.texts.title-about')" mt-3>
      <div class="hint">
        {{ t('tools.bcrypt.texts.hint-about') }}
      </div>
    </c-card>
  </div>
</template>

<style scoped lang="less">
.bcrypt-tool {
  .hint {
    font-size: 13px;
    color: var(--n-text-color-disabled, #999);
  }

  .hint-warn {
    color: #d03050;
  }

  .cost-value {
    font-family: ui-monospace, Consolas, monospace;
    font-weight: 600;
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
