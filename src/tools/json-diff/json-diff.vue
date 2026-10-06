<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import JSON5 from 'json5';

import DiffsViewer from './diff-viewer/diff-viewer.vue';
import { withDefaultOnError } from '@/utils/defaults';
import { isNotThrowing } from '@/utils/boolean';

const { t } = useI18n();

const rawLeftJson = ref('');
const rawRightJson = ref('');

/**
 * 「一键示例」的数据。
 *
 * 左右两份要"像而不一样"：字段改名、新增字段、删除字段、改值这四种差异一次给全，
 * diff 视图里各种颜色的含义才看得出来。两份结构完全没关系时，工具只会显示整块替换，
 * 用户学不到东西。
 */
const exampleData = {
  left: `{
  "id": 1001,
  "name": "在线工具箱",
  "plan": "free",
  "visits": 1280,
  "removed_soon": true
}`,
  right: `{
  "id": 1001,
  "title": "在线工具箱",
  "plan": "pro",
  "visits": 4317,
  "owner": "chao"
}`,
};

function loadExample() {
  rawLeftJson.value = exampleData.left;
  rawRightJson.value = exampleData.right;
}

const leftJson = computed(() => withDefaultOnError(() => JSON.parseBigNum(rawLeftJson.value), undefined));
const rightJson = computed(() => withDefaultOnError(() => JSON.parseBigNum(rawRightJson.value), undefined));

const jsonValidationRules = [
  {
    validator: (value: string) => value === '' || isNotThrowing(() => JSON5.parse(value)),
    message: t('tools.json-diff.texts.message-invalid-json-format'),
  },
];
</script>

<template>
  <!-- 同时填左右两份，差异立刻显示在下方 -->
  <div flex justify-end mb-3>
    <ToolExampleButton @click="loadExample" />
  </div>

  <c-input-text
    v-model:value="rawLeftJson"
    :validation-rules="jsonValidationRules"
    :label="t('tools.json-diff.texts.label-your-first-json')"
    :placeholder="t('tools.json-diff.texts.placeholder-paste-your-first-json-here')"
    rows="20"
    multiline
    test-id="leftJson"
    raw-text
    monospace
  />

  <c-input-text
    v-model:value="rawRightJson"
    :validation-rules="jsonValidationRules"
    :label="t('tools.json-diff.texts.label-your-json-to-compare')"
    :placeholder="t('tools.json-diff.texts.placeholder-paste-your-json-to-compare-here')"
    rows="20"
    multiline
    test-id="rightJson"
    raw-text
    monospace
  />

  <DiffsViewer :left-json="leftJson" :right-json="rightJson" />
</template>
