<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { stringify } from 'yaml';
import JSON5 from 'json5';
import type { UseValidationRule } from '@/composable/validation';
import { isNotThrowing } from '@/utils/boolean';
import { withDefaultOnError } from '@/utils/defaults';

const { t } = useI18n();

// 示例刻意带上嵌套对象、数组、中文和几种数据类型，
// 让用户一眼看出 JSON 转 YAML 之后层级是怎么表达的。
const exampleData = [
  '{',
  '  "name": "在线工具箱",',
  '  "version": "2.1.0",',
  '  "enabled": true,',
  '  "tools": [',
  '    { "slug": "json-to-yaml", "hot": true },',
  '    { "slug": "rmb-numbers", "hot": false }',
  '  ],',
  '  "author": { "name": "chao", "site": "gjxtools.com" }',
  '}',
].join('\n');

const transformer = (value: string) => withDefaultOnError(() => stringify(JSON.parseBigNum(value)), '');

const rules: UseValidationRule<string>[] = [
  {
    validator: (value: string) => value === '' || isNotThrowing(() => stringify(JSON5.parse(value))),
    message: t('tools.json-to-yaml-converter.texts.message-provided-json-is-not-valid'),
  },
];
</script>

<template>
  <format-transformer
    :input-label="t('tools.json-to-yaml-converter.texts.input-label-your-json')"
    :input-placeholder="t('tools.json-to-yaml-converter.texts.input-placeholder-paste-your-json-here')"
    :output-label="t('tools.json-to-yaml-converter.texts.output-label-yaml-from-your-json')"
    output-language="yaml"
    :input-validation-rules="rules"
    :transformer="transformer"
    :example-data="exampleData"
    download-file-name="output.yaml"
  />
</template>
