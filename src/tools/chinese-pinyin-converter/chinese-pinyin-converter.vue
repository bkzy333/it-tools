<script setup lang="ts">
/**
 * 汉字转拼音。
 *
 * 字典首次转换时才加载，加载状态直接显示在按钮上——
 * 267KB 在弱网下要等一两秒，如果不给反馈用户会以为工具坏了。
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { appBaseUrl } from '@/utils/base-url';
import { joinPinyin, loadPinyinDict, tokenize, type PinyinItem, type PinyinStyle } from './pinyin';

const { t } = useI18n();

const input = ref('');
const style = ref<PinyinStyle>('tone');
const separator = ref(' ');
const dictState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
const dict = ref<Record<string, string>>({});
const items = ref<PinyinItem[]>([]);

const styleOptions = [
  { label: t('tools.chinese-pinyin-converter.texts.style-tone'), value: 'tone' },
  { label: t('tools.chinese-pinyin-converter.texts.style-number'), value: 'number' },
  { label: t('tools.chinese-pinyin-converter.texts.style-plain'), value: 'plain' },
  { label: t('tools.chinese-pinyin-converter.texts.style-initial'), value: 'initial' },
];

const separatorOptions = [
  { label: t('tools.chinese-pinyin-converter.texts.sep-space'), value: ' ' },
  { label: t('tools.chinese-pinyin-converter.texts.sep-none'), value: '' },
  { label: t('tools.chinese-pinyin-converter.texts.sep-dash'), value: '-' },
];

const exampleData = {
  input: '中国人民银行推出数字人民币',
  style: 'tone' as PinyinStyle,
};

/** 示例特意选了"中国人民银行"——"行"是多音字，能顺带把多音字的说明带出来 */
function loadExample() {
  input.value = exampleData.input;
  style.value = exampleData.style;
  convert();
}

async function convert() {
  if (!input.value.trim()) {
    items.value = [];
    return;
  }
  if (dictState.value !== 'ready') {
    dictState.value = 'loading';
    try {
      // appBaseUrl 是普通字符串（不是 ref），这里不能取 .value
      dict.value = await loadPinyinDict(appBaseUrl);
      dictState.value = 'ready';
    }
    catch {
      dictState.value = 'error';
      return;
    }
  }
  items.value = tokenize(input.value, dict.value);
}

const output = computed(() => joinPinyin(items.value, style.value, separator.value));

const polyphones = computed(() => items.value.filter((item) => item.polyphone));
const hasResult = computed(() => items.value.length > 0);
</script>

<template>
  <div class="pinyin-converter">
    <div flex justify-end mb-2>
      <ToolExampleButton @click="loadExample" />
    </div>

    <c-card :title="t('tools.chinese-pinyin-converter.texts.title-input')" mb-3>
      <n-input
        v-model:value="input"
        type="textarea"
        :rows="5"
        :placeholder="t('tools.chinese-pinyin-converter.texts.placeholder-input')"
        mb-2
      />
      <n-space>
        <c-select
          v-model:value="style"
          :label="t('tools.chinese-pinyin-converter.texts.label-style')"
          label-position="left"
          :options="styleOptions"
        />
        <c-select
          v-model:value="separator"
          :label="t('tools.chinese-pinyin-converter.texts.label-separator')"
          label-position="left"
          :options="separatorOptions"
        />
        <c-button :loading="dictState === 'loading'" @click="convert">
          {{ t('tools.chinese-pinyin-converter.texts.btn-convert') }}
        </c-button>
      </n-space>
      <div v-if="dictState === 'error'" class="hint hint-error" mt-2>
        {{ t('tools.chinese-pinyin-converter.texts.hint-error') }}
      </div>
    </c-card>

    <c-card v-if="hasResult" :title="t('tools.chinese-pinyin-converter.texts.title-output')" mb-3>
      <input-copyable :value="output" />
    </c-card>

    <c-card v-if="hasResult" :title="t('tools.chinese-pinyin-converter.texts.title-detail')">
      <div class="char-grid">
        <div v-for="(item, index) in items" :key="index" class="char-cell">
          <div class="char">{{ item.char }}</div>
          <div class="char-pinyin">{{ item.raw || '-' }}</div>
        </div>
      </div>
      <div v-if="polyphones.length > 0" class="hint" mt-2>
        {{ t('tools.chinese-pinyin-converter.texts.hint-polyphone') }}
      </div>
    </c-card>
  </div>
</template>

<style scoped lang="less">
.pinyin-converter {
  .hint {
    font-size: 13px;
    color: var(--n-text-color-disabled, #999);
  }

  .hint-error {
    color: #d03050;
  }

  .char-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
    gap: 8px;
  }

  .char-cell {
    padding: 6px 4px;
    border: 1px solid rgb(0 0 0 / 8%);
    border-radius: 6px;
    text-align: center;
  }

  .char {
    font-size: 18px;
  }

  .char-pinyin {
    margin-top: 2px;
    font-size: 12px;
    color: #888;
  }
}
</style>
