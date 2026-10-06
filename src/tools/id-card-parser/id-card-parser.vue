<script setup lang="ts">
/**
 * 身份证号校验与解析。
 *
 * 边界要划清楚：这里只能回答"这串号码的校验位算不算得对、按编码规则能读出什么"，
 * 回答不了"这个人是谁"。所以页面顶部就写明了这一点，
 * 校验通过也只是"格式合法"，文案上不能暗示"号码真实存在"。
 *
 * 另一个刻意的设计：输入全程不离开浏览器。这类工具用户最怕的就是号码被上传，
 * 把它做成卖点而不是藏着不说。
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { parseIdCard } from './id-card';

const { t } = useI18n();

const input = ref('');

const exampleData = {
  input: '440304199003078212',
};

/**
 * 示例用的是一个校验位算得通的虚构号码（广东深圳福田 / 1990-03-07 / 男）。
 * 刻意不用网上流传的那些真实号码——这个工具的定位是校验算法，不是拿真人号做演示。
 */
function loadExample() {
  input.value = exampleData.input;
}

const result = computed(() => parseIdCard(input.value));

const hasInput = computed(() => input.value.trim().length > 0);

const rows = computed(() => {
  const info = result.value;
  if (!hasInput.value || info.reason === '请输入身份证号') {
    return [];
  }
  if (!info.normalized) {
    return [];
  }
  return [
    { label: t('tools.id-card-parser.texts.label-region'), value: info.region },
    { label: t('tools.id-card-parser.texts.label-birthday'), value: info.birthday },
    { label: t('tools.id-card-parser.texts.label-gender'), value: info.gender },
    { label: t('tools.id-card-parser.texts.label-age'), value: info.age === null ? '' : `${info.age} 周岁` },
    { label: t('tools.id-card-parser.texts.label-zodiac'), value: info.zodiac },
    { label: t('tools.id-card-parser.texts.label-constellation'), value: info.constellation },
  ];
});
</script>

<template>
  <div class="id-card-parser">
    <div flex justify-end mb-2>
      <ToolExampleButton @click="loadExample" />
    </div>

    <c-card :title="t('tools.id-card-parser.texts.title-input')" mb-3>
      <c-input-text
        v-model:value="input"
        :placeholder="t('tools.id-card-parser.texts.placeholder-id')"
        clearable
        mb-2
      />
      <div class="hint">
        {{ t('tools.id-card-parser.texts.hint-privacy') }}
      </div>
    </c-card>

    <c-card v-if="hasInput" :title="t('tools.id-card-parser.texts.title-result')" mb-3>
      <div v-if="!result.normalized" class="verdict verdict-bad">
        {{ result.reason }}
      </div>
      <template v-else>
        <div :class="result.valid ? 'verdict verdict-ok' : 'verdict verdict-bad'">
          <span v-if="result.valid">{{ t('tools.id-card-parser.texts.verdict-valid') }}</span>
          <span v-else>{{ result.reason }}</span>
        </div>
        <div v-if="result.wasOldFormat" class="hint" mb-2>
          {{ t('tools.id-card-parser.texts.hint-upgraded') }} {{ result.normalized }}
        </div>

        <input-copyable
          v-for="row in rows"
          :key="row.label"
          :label="row.label"
          label-position="left"
          label-width="120px"
          :value="row.value"
          mb-1
        />
      </template>
    </c-card>

    <c-card :title="t('tools.id-card-parser.texts.title-about')">
      <div class="hint">
        {{ t('tools.id-card-parser.texts.hint-disclaimer') }}
      </div>
    </c-card>
  </div>
</template>

<style scoped lang="less">
.id-card-parser {
  .hint {
    font-size: 13px;
    color: var(--n-text-color-disabled, #999);
  }

  .verdict {
    padding: 8px 12px;
    margin-bottom: 12px;
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
