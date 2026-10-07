<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import ToolExampleButton from '@/components/ToolExampleButton.vue';
import { useCopy } from '@/composable/copy';
import {
  EXTRACT_UI_OPTIONS,
  extractFromText,
  totalMatches,
  type ExtractGroup,
  type ExtractType,
} from './text-extract.service';

const { t } = useI18n();
const { copy } = useCopy();

/* ------------------------------------------------------------------ 输入状态 */
const input = ref('');
/** 默认勾常用的几类，全勾会让首屏就糊满结果 */
const selected = ref<ExtractType[]>(['phone', 'email', 'url', 'ip', 'date', 'time', 'money']);
const dedupe = ref(true);
const customPattern = ref('');

/**
 * 示例用一段真实的中文业务文本：中英混排 + 日期/IP/金额/证件号全齐，
 * 一次点开就能看出每类提取各自命中多少，比单类型的小例子有说服力。
 */
const exampleData = {
  input: `订单反馈（2026-10-07 14:05:00）
客户 13812345678 来电，邮箱 zhang.san+order@example.com。
账单金额 ¥128.50，尾款 $45.9 待付。
物流节点：上海 192.168.1.100 → 广州 8.8.8.8，运单号 SF1234567890。
收件人 11010119900307123X，邮编 518000，共 3 件。
备注：www.example.com 已同步更新，客服 9:30 上班。`,
};

function loadExample() {
  input.value = exampleData.input;
}

/* ------------------------------------------------------------------ 选项 */
const options = computed(() =>
  EXTRACT_UI_OPTIONS.map((option) => ({
    label: t(`tools.text-extract.texts.type-${option.i18nKey}`),
    value: option.key,
  })),
);

const i18nKeyByType = new Map(EXTRACT_UI_OPTIONS.map((o) => [o.key, o.i18nKey]));

function labelOf(key: ExtractType): string {
  return t(`tools.text-extract.texts.type-${i18nKeyByType.get(key) ?? key}`);
}

/** 自定义正则由用户输入，非法时给出提示但不要阻断整个页面 */
const customInvalid = computed(() => {
  if (!selected.value.includes('custom')) return '';
  try {
    new RegExp(customPattern.value);
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
});

/* ------------------------------------------------------------------ 计算结果 */
const groups = computed<ExtractGroup[]>(() =>
  extractFromText(
    input.value,
    { types: selected.value, dedupe: dedupe.value },
    customPattern.value,
  ),
);

const total = computed(() => totalMatches(groups.value));

const hasResult = computed(() => total.value > 0);

function resultText(group: ExtractGroup): string {
  return group.matches.join('\n');
}

function downloadGroup(group: ExtractGroup) {
  const blob = new Blob([resultText(group)], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = document.documentElement.lang.startsWith('zh')
    ? `文本提取-${labelOf(group.key)}.txt`
    : `text-extract-${group.key}.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadAll() {
  const blob = new Blob([groups.value.map(resultText).join('\n\n')], {
    type: 'text/plain;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = document.documentElement.lang.startsWith('zh') ? '文本提取结果.txt' : 'text-extract.txt';
  anchor.click();
  URL.revokeObjectURL(url);
}

function clearAll() {
  input.value = '';
  customPattern.value = '';
}
</script>

<template>
  <c-card :title="t('tools.text-extract.title')" max-w-800px>
    <div flex items-center justify-between gap-2 mb-2>
      <span />
      <ToolExampleButton @click="loadExample" />
    </div>

    <!-- 输入区 -->
    <c-input-text
      v-model:value="input"
      multiline
      :placeholder="t('tools.text-extract.texts.placeholder-input')"
      :rows="10"
    />

    <!-- 提取类型 -->
    <div mt-3>
      <div mb-2 font-medium>{{ t('tools.text-extract.texts.label-types') }}</div>
      <n-checkbox-group v-model:value="selected">
        <n-checkbox v-for="option in options" :key="option.value" :value="option.value" :label="option.label" />
      </n-checkbox-group>
    </div>

    <!-- 自定义正则：只在选中时出现 -->
    <template v-if="selected.includes('custom')">
      <div mt-3>
        <c-input-text
          v-model:value="customPattern"
          :placeholder="t('tools.text-extract.texts.placeholder-custom-pattern')"
        />
        <div v-if="customInvalid" mt-1 text-red-500 text-sm>
          {{ t('tools.text-extract.texts.message-invalid-regex') }}：{{ customInvalid }}
        </div>
      </div>
    </template>

    <div mt-3>
      <n-checkbox v-model:checked="dedupe">
        {{ t('tools.text-extract.texts.tag-dedupe') }}
      </n-checkbox>
    </div>

    <!-- 结果区 -->
    <template v-if="groups.length">
      <n-divider />

      <div flex items-center justify-between gap-2 mb-2>
        <span font-medium>{{ t('tools.text-extract.texts.title-result') }}（{{ total }}）</span>
        <div flex gap-2>
          <c-button size="small" :disabled="!hasResult" @click="copy(groups.map(resultText).join('\n\n'))">
            {{ t('tools.text-extract.texts.action-copy-all') }}
          </c-button>
          <c-button size="small" :disabled="!hasResult" @click="downloadAll">
            {{ t('tools.text-extract.texts.action-download') }}
          </c-button>
          <c-button size="small" @click="clearAll">{{ t('tools.text-extract.texts.action-clear') }}</c-button>
        </div>
      </div>

      <c-card
        v-for="group in groups"
        :key="group.key"
        size="small"
        :title="`${labelOf(group.key)}（${group.matches.length}）`"
        mb-2
      >
        <n-input
          v-if="group.matches.length"
          :value="resultText(group)"
          type="textarea"
          readonly
          :autosize="{ minRows: 2, maxRows: 12 }"
        />
        <div v-else text-sm op-60>{{ t('tools.text-extract.texts.message-no-match') }}</div>

        <div flex justify-end mt-2>
          <c-button size="small" @click="copy(resultText(group))">
            {{ t('tools.text-extract.texts.action-copy') }}
          </c-button>
          <c-button size="small" @click="downloadGroup(group)">
            {{ t('tools.text-extract.texts.action-download') }}
          </c-button>
        </div>
      </c-card>
    </template>
  </c-card>
</template>
