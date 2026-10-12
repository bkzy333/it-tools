<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import {
  camelCase,
  capitalCase,
  constantCase,
  dotCase,
  kebabCase,
  noCase,
  pascalCase,
  pathCase,
  sentenceCase,
  snakeCase,
  trainCase,
} from 'change-case';
import { spongeCase } from 'sponge-case';
import { swapCase } from 'swap-case';
import { titleCase } from 'title-case';

import InputCopyable from '../../components/InputCopyable.vue';
import CopyExportBar from '@/components/CopyExportBar.vue';
import { useQueryParam, useQueryParamOrStorage } from '@/composable/queryParams';
import { useValidation } from '@/composable/validation';
import { getSupportedLanguages, toLanguageTitleCase } from './case-converter.service.ts';

const { t } = useI18n();

const cleaningRegex = useQueryParamOrStorage({
  name: 'clean',
  storageName: 'case-conv:cl',
  defaultValue: '[^\\w\\d\\s]',
});
const cleaningRegexValidation = useValidation({
  source: cleaningRegex,
  rules: [
    {
      message: t('tools.case-converter.texts.message-invalid-cleaning-regex-0'),
      validator: (value) => new RegExp(value),
      getErrorMessage: (value) => {
        const _ = new RegExp(value);
        return '';
      },
    },
  ],
});

const input = useQueryParam({ tool: 'case-conv', name: 'text', defaultValue: 'lorem ipsum dolor sit amet' });
const language = useQueryParam({ tool: 'case-conv', name: 'lang', defaultValue: 'eng' });
// 批量分隔符：默认换行（每行一条），也可自定义（逗号 / 分号 / 空格 / Tab / 自定义字符）
const delimiterMode = ref<string>('\n');
const customDelimiter = ref<string>(',');
const CUSTOM_DELIMITER = '__custom__';
const effectiveDelimiter = computed(() =>
  delimiterMode.value === CUSTOM_DELIMITER ? customDelimiter.value : delimiterMode.value,
);
const delimiterOptions = computed(() => [
  { label: t('tools.case-converter.texts.delimiter-newline'), value: '\n' },
  { label: t('tools.case-converter.texts.delimiter-comma'), value: ',' },
  { label: t('tools.case-converter.texts.delimiter-semicolon'), value: ';' },
  { label: t('tools.case-converter.texts.delimiter-space'), value: ' ' },
  { label: t('tools.case-converter.texts.delimiter-tab'), value: '\t' },
  { label: t('tools.case-converter.texts.delimiter-custom'), value: CUSTOM_DELIMITER },
]);

const inputCleaned = computed(() => {
  const cleaned = cleaningRegexValidation.isValid
    ? input.value.replace(new RegExp(cleaningRegex.value, 'g'), '')
    : input.value;
  const d = effectiveDelimiter.value;
  return (d === '\n' ? cleaned.split(/\r?\n/) : cleaned.split(d)).map((s) => s.trim());
});

// 逐行容错转换：单行转换异常时回退为原串，不影响其他行（U5 容错解析）
function safeTransform(fn: (s: string) => string, s: string): string {
  try {
    return fn(s);
  } catch {
    return s;
  }
}

const formats = computed(() => [
  {
    label: t('tools.case-converter.texts.label-lang-title-case'),
    value: inputCleaned.value.map((s) => safeTransform((x) => toLanguageTitleCase(x, language.value), s)),
  },
  {
    label: t('tools.case-converter.texts.label-lowercase'),
    value: inputCleaned.value.map((s) => safeTransform((x) => x.toLocaleLowerCase(), s)),
  },
  {
    label: t('tools.case-converter.texts.label-uppercase'),
    value: inputCleaned.value.map((s) => safeTransform((x) => x.toLocaleUpperCase(), s)),
  },
  {
    label: t('tools.case-converter.texts.label-camelcase'),
    value: inputCleaned.value.map((s) => safeTransform(camelCase, s)),
  },
  {
    label: t('tools.case-converter.texts.label-titlecase'),
    value: inputCleaned.value.map((s) => safeTransform(titleCase, s)),
  },
  {
    label: t('tools.case-converter.texts.label-capitalcase'),
    value: inputCleaned.value.map((s) => safeTransform(capitalCase, s)),
  },
  {
    label: t('tools.case-converter.texts.label-constantcase'),
    value: inputCleaned.value.map((s) => safeTransform(constantCase, s)),
  },
  {
    label: t('tools.case-converter.texts.label-dotcase'),
    value: inputCleaned.value.map((s) => safeTransform(dotCase, s)),
  },
  {
    label: t('tools.case-converter.texts.label-kebab-paramcase'),
    value: inputCleaned.value.map((s) => safeTransform(kebabCase, s)),
  },
  {
    label: t('tools.case-converter.texts.label-nocase'),
    value: inputCleaned.value.map((s) => safeTransform(noCase, s)),
  },
  {
    label: t('tools.case-converter.texts.label-train-headercase'),
    value: inputCleaned.value.map((s) => safeTransform(trainCase, s)),
  },
  {
    label: t('tools.case-converter.texts.label-pascalcase'),
    value: inputCleaned.value.map((s) => safeTransform(pascalCase, s)),
  },
  {
    label: t('tools.case-converter.texts.label-pathcase'),
    value: inputCleaned.value.map((s) => safeTransform(pathCase, s)),
  },
  {
    label: t('tools.case-converter.texts.label-sentencecase'),
    value: inputCleaned.value.map((s) => safeTransform(sentenceCase, s)),
  },
  {
    label: t('tools.case-converter.texts.label-snakecase'),
    value: inputCleaned.value.map((s) => safeTransform(snakeCase, s)),
  },
  {
    label: t('tools.case-converter.texts.label-mockingcase'),
    value: inputCleaned.value.map((s) =>
      safeTransform(
        (x) =>
          x
            .split('')
            .map((char, index) => (index % 2 === 0 ? char.toUpperCase() : char.toLowerCase()))
            .join(''),
        s,
      ),
    ),
  },
  {
    label: t('tools.case-converter.texts.label-spongecase'),
    value: inputCleaned.value.map((s) => safeTransform(spongeCase, s)),
  },
  {
    label: t('tools.case-converter.texts.label-swapcase'),
    value: inputCleaned.value.map((s) => safeTransform(swapCase, s)),
  },
]);

const inputLabelAlignmentConfig = {
  labelPosition: 'left',
  labelWidth: '125px',
  labelAlign: 'right',
} as const;

// 导出列选择：用户可勾选要导出的结果列（默认全部）。仅影响「复制全部 / 导出」，不改变上方主展示。
const selectedFormatLabels = ref<string[]>(formats.value.map((f) => f.label));
const formatSelectOptions = computed(() =>
  formats.value.map((f) => ({ label: f.label, value: f.label })),
);
const activeFormats = computed(() =>
  formats.value.filter((f) => selectedFormatLabels.value.includes(f.label)),
);

// 聚合已选格式的文本（复制全部 / 导出 TXT 用），以及 A列输入 + 各格式列的二维表（导出 Excel 用）
const allResultsText = computed(() =>
  activeFormats.value.map((f) => `${f.label}：${f.value?.join('，') ?? ''}`).join('\n'),
);

const exportRows = computed(() => {
  const header = ['输入', ...activeFormats.value.map((f) => f.label)];
  const rows = inputCleaned.value.map((line, i) => [
    line,
    ...activeFormats.value.map((f) => f.value?.[i] ?? ''),
  ]);
  return [header, ...rows];
});
</script>

<template>
  <c-card>
    <c-input-text
      v-model:value="input"
      :label="t('tools.case-converter.texts.label-your-string')"
      :placeholder="t('tools.case-converter.texts.placeholder-your-string')"
      raw-text
      v-bind="inputLabelAlignmentConfig"
      multiline
      mb-1
    />

    <c-input-text
      v-model:value="cleaningRegex"
      :label="t('tools.case-converter.texts.label-cleaning-regex')"
      :placeholder="t('tools.case-converter.texts.placeholder-your-cleaning-regex')"
      raw-text
      v-bind="inputLabelAlignmentConfig"
      mb-1
    />

    <c-select
      v-model:value="language"
      :options="getSupportedLanguages()"
      :label="t('tools.case-converter.texts.label-language')"
      :placeholder="t('tools.case-converter.texts.placeholder-your-language')"
      v-bind="inputLabelAlignmentConfig"
      mb-1
    />

    <c-select
      v-model:value="delimiterMode"
      :options="delimiterOptions"
      :label="t('tools.case-converter.texts.label-delimiter')"
      v-bind="inputLabelAlignmentConfig"
      mb-1
    />
    <c-input-text
      v-if="delimiterMode === '__custom__'"
      v-model:value="customDelimiter"
      :label="t('tools.case-converter.texts.label-custom-delimiter')"
      raw-text
      v-bind="inputLabelAlignmentConfig"
      mb-1
    />

    <div my-16px divider />

    <n-p depth="3" mb-1>{{ t('tools.case-converter.texts.hint-export-columns') }}</n-p>
    <div flex items-center justify-between mb-2 gap-2 flex-wrap>
      <n-select
        v-model:value="selectedFormatLabels"
        multiple
        :options="formatSelectOptions"
        :placeholder="t('tools.case-converter.texts.label-export-columns')"
        style="width: 420px; max-width: 100%"
        :max-tag-count="'responsive'"
      />
      <CopyExportBar :text="allResultsText" filename="大小写转换" :rows="exportRows" />
    </div>

    <InputCopyable
      v-for="format in formats"
      :key="format.label"
      :value="format.value?.join('\n')"
      :label="format.label"
      v-bind="inputLabelAlignmentConfig"
      multiline
      mb-1
    />
  </c-card>
</template>
