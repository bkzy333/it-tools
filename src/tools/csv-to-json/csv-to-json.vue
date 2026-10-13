<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { convertCsvToArray } from './csv-to-json.service';
import FormatTransformer from '@/components/FormatTransformer.vue';
import type { UseValidationRule } from '@/composable/validation';
import { withDefaultOnError } from '@/utils/defaults';

const { t } = useI18n();

const typedValues = ref(false);

/**
 * 打开即有示例（UX 契约 U6：空输入框是跳出率最高的形态）。
 * 故意带表头 + 中文 + 数字，让用户一眼看出「CSV 转 JSON」长什么样，直接点转换就能看结果。
 */
const exampleData = `name,age,city
张三,28,北京
李四,32,上海
王五,25,广州`;

function transformer(value: string) {
  return withDefaultOnError(() => {
    if (value === '') {
      return '';
    }
    return JSON.stringify(convertCsvToArray(value, typedValues.value), null, 2);
  }, '');
}

const rules: UseValidationRule<string>[] = [
  {
    validator: (v: string) =>
      v === '' || ((v.includes(',') || v.includes(';') || v.includes('\t') || v.includes('|')) && v.includes('\n')),
    message: t('tools.csv-to-json.texts.message-provided-csv-is-not-valid'),
  },
];
</script>

<template>
  <n-form-item :label="t('tools.csv-to-json.texts.label-typed-values')" label-placement="left">
    <n-checkbox v-model:checked="typedValues" />
  </n-form-item>
  <FormatTransformer
    :input-label="t('tools.csv-to-json.texts.input-label-your-raw-csv')"
    :input-placeholder="t('tools.csv-to-json.texts.input-placeholder-paste-your-raw-csv-here')"
    :output-label="t('tools.csv-to-json.texts.output-label-json-version-of-your-csv')"
    :input-validation-rules="rules"
    :transformer="transformer"
    :example-data="exampleData"
  />
</template>
