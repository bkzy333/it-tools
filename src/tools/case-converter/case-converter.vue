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
import {
  applyCleaningPatterns,
  convertWithConnectors,
  getSupportedLanguages,
  toLanguageTitleCase,
} from './case-converter.service.ts';

const { t } = useI18n();

// ---------- 内容过滤（原「清理正则表达式」，改为勾选式；高级模式才露出正则输入框） ----------
interface FilterPreset {
  key: string;
  label: string;
  pattern: string;
}
const filterPresets = computed<FilterPreset[]>(() => [
  { key: 'specialChars', label: t('tools.case-converter.texts.filter-special-chars'), pattern: '[^\\w\\d\\s]' },
  {
    key: 'keepCnEn',
    label: t('tools.case-converter.texts.filter-keep-cn-en'),
    pattern: '[^\\u4e00-\\u9fff\\w\\d\\s]',
  },
  { key: 'noSpaces', label: t('tools.case-converter.texts.filter-no-spaces'), pattern: '\\s' },
  { key: 'noDigits', label: t('tools.case-converter.texts.filter-no-digits'), pattern: '\\d' },
]);
/** 勾选式过滤：默认不做任何过滤，避免静默删掉中文/标点等内容（原默认 specialChars 的 [^\w\d\s] 会删光非 ASCII） */
const selectedFilters = ref<string[]>([]);
/** 高级模式：需要精确控制时才露出自定义正则 */
const advancedMode = ref(false);
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

/** 当前生效的清理规则（正则串数组，按顺序依次清除） */
const activePatterns = computed<string[]>(() => {
  if (advancedMode.value) {
    return cleaningRegexValidation.isValid && cleaningRegex.value ? [cleaningRegex.value] : [];
  }
  return filterPresets.value.filter((f) => selectedFilters.value.includes(f.key)).map((f) => f.pattern);
});

const input = useQueryParam({ tool: 'case-conv', name: 'text', defaultValue: 'lorem ipsum dolor sit amet' });
const language = useQueryParam({ tool: 'case-conv', name: 'lang', defaultValue: 'eng' });

// ---------- 单词构成规则：这些字符视为单词的一部分，不会被拆分 ----------
const connectorChars = useQueryParam({ tool: 'case-conv', name: 'join', defaultValue: '' });
const wordRulePresets = computed(() => [
  { label: t('tools.case-converter.texts.preset-standard'), value: '' },
  { label: t('tools.case-converter.texts.preset-programming'), value: '_' },
  { label: t('tools.case-converter.texts.preset-hyphen'), value: '-' },
]);
function applyWordRulePreset(value: string) {
  connectorChars.value = value;
}

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
  const cleaned = applyCleaningPatterns(input.value, activePatterns.value);
  const d = effectiveDelimiter.value;
  return (d === '\n' ? cleaned.split(/\r?\n/) : cleaned.split(d)).map((s) => s.trim());
});

/** 单行转换：保护连接符 → 转换（异常回退原串，U5 容错） → 还原连接符 */
const convert = (fn: (s: string) => string, s: string) => convertWithConnectors(fn, s, connectorChars.value);

const formats = computed(() => [
  {
    key: 'langTitleCase',
    label: t('tools.case-converter.texts.label-lang-title-case'),
    value: inputCleaned.value.map((s) => convert((x) => toLanguageTitleCase(x, language.value), s)),
  },
  {
    key: 'lowercase',
    label: t('tools.case-converter.texts.label-lowercase'),
    value: inputCleaned.value.map((s) => convert((x) => x.toLocaleLowerCase(), s)),
  },
  {
    key: 'uppercase',
    label: t('tools.case-converter.texts.label-uppercase'),
    value: inputCleaned.value.map((s) => convert((x) => x.toLocaleUpperCase(), s)),
  },
  {
    key: 'camelcase',
    label: t('tools.case-converter.texts.label-camelcase'),
    value: inputCleaned.value.map((s) => convert(camelCase, s)),
  },
  {
    key: 'titlecase',
    label: t('tools.case-converter.texts.label-titlecase'),
    value: inputCleaned.value.map((s) => convert(titleCase, s)),
  },
  {
    key: 'capitalcase',
    label: t('tools.case-converter.texts.label-capitalcase'),
    value: inputCleaned.value.map((s) => convert(capitalCase, s)),
  },
  {
    key: 'constantcase',
    label: t('tools.case-converter.texts.label-constantcase'),
    value: inputCleaned.value.map((s) => convert(constantCase, s)),
  },
  {
    key: 'dotcase',
    label: t('tools.case-converter.texts.label-dotcase'),
    value: inputCleaned.value.map((s) => convert(dotCase, s)),
  },
  {
    key: 'kebabcase',
    label: t('tools.case-converter.texts.label-kebab-paramcase'),
    value: inputCleaned.value.map((s) => convert(kebabCase, s)),
  },
  {
    key: 'nocase',
    label: t('tools.case-converter.texts.label-nocase'),
    value: inputCleaned.value.map((s) => convert(noCase, s)),
  },
  {
    key: 'traincase',
    label: t('tools.case-converter.texts.label-train-headercase'),
    value: inputCleaned.value.map((s) => convert(trainCase, s)),
  },
  {
    key: 'pascalcase',
    label: t('tools.case-converter.texts.label-pascalcase'),
    value: inputCleaned.value.map((s) => convert(pascalCase, s)),
  },
  {
    key: 'pathcase',
    label: t('tools.case-converter.texts.label-pathcase'),
    value: inputCleaned.value.map((s) => convert(pathCase, s)),
  },
  {
    key: 'sentencecase',
    label: t('tools.case-converter.texts.label-sentencecase'),
    value: inputCleaned.value.map((s) => convert(sentenceCase, s)),
  },
  {
    key: 'snakecase',
    label: t('tools.case-converter.texts.label-snakecase'),
    value: inputCleaned.value.map((s) => convert(snakeCase, s)),
  },
  {
    key: 'mockingcase',
    label: t('tools.case-converter.texts.label-mockingcase'),
    value: inputCleaned.value.map((s) =>
      convert(
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
    key: 'spongecase',
    label: t('tools.case-converter.texts.label-spongecase'),
    value: inputCleaned.value.map((s) => convert(spongeCase, s)),
  },
  {
    key: 'swapcase',
    label: t('tools.case-converter.texts.label-swapcase'),
    value: inputCleaned.value.map((s) => convert(swapCase, s)),
  },
]);

const inputLabelAlignmentConfig = {
  labelPosition: 'left',
  labelWidth: '125px',
  labelAlign: 'right',
} as const;

// 结果类型选择：以 key 为准。
// 早期版本按 label 匹配，遇到同名标签（如两个「首字母大写」）会互相干扰，故改为 key。
// 默认只显示「首字母大写」，避免一打开就铺 19 个结果框。
const selectedFormatKeys = ref<string[]>(['capitalcase']);
const formatSelectOptions = computed(() => formats.value.map((f) => ({ label: f.label, value: f.key })));
const activeFormats = computed(() => formats.value.filter((f) => selectedFormatKeys.value.includes(f.key)));

/** 语言下拉仅用于「语言标题式」这一列：勾选了该结果类型才需要选语言，否则隐藏，避免无意义的常驻控件 */
const showLanguage = computed(() => selectedFormatKeys.value.includes('langTitleCase'));

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

    <!-- 内容过滤：勾选式，替代原来的「清理正则表达式」裸输入框 -->
    <div flex items-center mb-1 flex-wrap>
      <div style="width: 125px; text-align: right; padding-right: 12px; flex-shrink: 0">
        {{ t('tools.case-converter.texts.label-content-filter') }}
      </div>
      <n-checkbox-group v-model:value="selectedFilters">
        <n-space>
          <n-checkbox v-for="preset in filterPresets" :key="preset.key" :value="preset.key" :label="preset.label" />
        </n-space>
      </n-checkbox-group>
    </div>
    <n-p depth="3" mb-1 style="margin-left: 137px">
      {{ t('tools.case-converter.texts.hint-content-filter') }}
    </n-p>

    <n-checkbox v-model:checked="advancedMode" mb-1 style="margin-left: 137px">
      {{ t('tools.case-converter.texts.label-advanced-mode') }}
    </n-checkbox>
    <c-input-text
      v-if="advancedMode"
      v-model:value="cleaningRegex"
      :label="t('tools.case-converter.texts.label-custom-regex')"
      :placeholder="t('tools.case-converter.texts.placeholder-your-cleaning-regex')"
      raw-text
      v-bind="inputLabelAlignmentConfig"
      mb-1
    />

    <!-- 单词构成规则 -->
    <c-input-text
      v-model:value="connectorChars"
      :label="t('tools.case-converter.texts.label-word-rules')"
      raw-text
      v-bind="inputLabelAlignmentConfig"
      mb-1
    />
    <div flex gap-2 mb-1 flex-wrap style="margin-left: 137px">
      <c-button
        v-for="preset in wordRulePresets"
        :key="preset.label"
        size="small"
        secondary
        @click="applyWordRulePreset(preset.value)"
      >
        {{ preset.label }}
      </c-button>
    </div>
    <n-p depth="3" mb-1 style="margin-left: 137px">
      {{ t('tools.case-converter.texts.hint-word-rules') }}
    </n-p>

    <!-- 语言：仅用于「语言标题式」，勾选了该结果类型才显示 -->
    <template v-if="showLanguage">
      <c-select
        v-model:value="language"
        :options="getSupportedLanguages()"
        :label="t('tools.case-converter.texts.label-language')"
        :placeholder="t('tools.case-converter.texts.placeholder-your-language')"
        v-bind="inputLabelAlignmentConfig"
        mb-1
      />
      <n-p depth="3" mb-1 style="margin-left: 137px">
        {{ t('tools.case-converter.texts.hint-language') }}
      </n-p>
    </template>

    <!-- 批量分隔符 -->
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
        v-model:value="selectedFormatKeys"
        multiple
        :options="formatSelectOptions"
        :placeholder="t('tools.case-converter.texts.label-export-columns')"
        style="width: 420px; max-width: 100%"
        :max-tag-count="'responsive'"
      />
      <CopyExportBar :text="allResultsText" filename="大小写转换" :rows="exportRows" />
    </div>

    <!-- 结果与上方选择联动：只渲染勾选的类型 -->
    <InputCopyable
      v-for="format in activeFormats"
      :key="format.key"
      :value="format.value?.join('\n')"
      :label="format.label"
      v-bind="inputLabelAlignmentConfig"
      multiline
      mb-1
    />
  </c-card>
</template>
