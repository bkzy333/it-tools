<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useStorage } from '@vueuse/core';
import { convert } from './list-converter.models';
import type { ConvertOptions } from './list-converter.types';
import type { UseValidationRule } from '@/composable/validation';

const { t } = useI18n();

const sortOrderOptions = [
  {
    label: t('tools.list-converter.texts.label-no-sort'),
    value: null,
    disabled: false,
  },
  {
    label: t('tools.list-converter.texts.label-sort-ascending'),
    value: 'asc',
  },
  {
    label: t('tools.list-converter.texts.label-sort-descending'),
    value: 'desc',
  },
  {
    label: t('tools.list-converter.texts.label-sort-asc-numeric'),
    value: 'asc-num',
  },
  {
    label: t('tools.list-converter.texts.label-sort-desc-numeric'),
    value: 'desc-num',
  },
  {
    label: t('tools.list-converter.texts.label-sort-asc-upper'),
    value: 'asc-upper',
  },
  {
    label: t('tools.list-converter.texts.label-sort-desc-upper'),
    value: 'desc-upper',
  },
  {
    label: t('tools.list-converter.texts.label-sort-asc-binary'),
    value: 'asc-bin',
  },
  {
    label: t('tools.list-converter.texts.label-sort-desc-binary'),
    value: 'desc-bin',
  },
];

const conversionConfig = useStorage<ConvertOptions>('list-converter:conversionConfig', {
  lowerCase: false,
  trimItems: true,
  removeDuplicates: false,
  keepLineBreaks: false,
  outputAsColumn: false,
  itemPrefix: '',
  itemSuffix: '',
  removeItemPrefix: '',
  removeItemSuffix: '',
  listPrefix: '',
  listSuffix: '',
  reverseList: false,
  sortList: null,
  itemsSeparator: ', ',
  splitBySeparator: '',
  filterRegex: '',
  notFilterRegex: '',
});

// 一键示例（仓库规范：工具须有 exampleData + 示例按钮）。打开即预填，便于新用户立刻看到效果。
const exampleData = '张三\n李四\n张三\n王五\napple\nApple';

const regexError = ref('');

// 这些字段都按正则编译，写错会抛异常；提前校验并给出人话提示，避免输出区静默空白。
function isSafeRegex(v: string | undefined): boolean {
  if (!v) {
    return true;
  }
  try {
    new RegExp(v);
    return true;
  } catch {
    return false;
  }
}

const regexRules: UseValidationRule<string>[] = [
  {
    validator: (v: string) => isSafeRegex(v),
    message: t('tools.list-converter.texts.error-regex-field'),
  },
];

function transformer(value: string) {
  const cfg = conversionConfig.value;
  if (
    !isSafeRegex(cfg.filterRegex)
    || !isSafeRegex(cfg.notFilterRegex)
    || !isSafeRegex(cfg.splitBySeparator)
    || !isSafeRegex(cfg.removeItemPrefix)
    || !isSafeRegex(cfg.removeItemSuffix)
  ) {
    regexError.value = t('tools.list-converter.texts.error-regex');
    return value; // 绝不静默空输出：返回原输入，顶部红条提示
  }
  regexError.value = '';
  try {
    return convert(value, cfg);
  } catch (e) {
    regexError.value = t('tools.list-converter.texts.error-regex-generic', {
      msg: (e as Error)?.message ?? String(e),
    });
    return value;
  }
}
</script>

<template>
  <div style="flex: 0 0 100%">
    <div style="margin: 0 auto; max-width: 600px">
      <c-card>
        <n-alert v-if="regexError" type="error" :show-icon="true" mb-3>{{ regexError }}</n-alert>
        <n-space>
          <div>
            <n-form-item
              :label="t('tools.list-converter.texts.label-trim-list-items')"
              label-placement="left"
              label-width="150"
              :show-feedback="false"
              mb-2
            >
              <n-switch v-model:value="conversionConfig.trimItems" />
            </n-form-item>
            <n-form-item
              :label="t('tools.list-converter.texts.label-remove-duplicates')"
              label-placement="left"
              label-width="150"
              :show-feedback="false"
              mb-2
            >
              <n-switch v-model:value="conversionConfig.removeDuplicates" data-test-id="removeDuplicates" />
            </n-form-item>
            <n-form-item
              :label="t('tools.list-converter.texts.label-convert-to-lowercase')"
              label-placement="left"
              label-width="150"
              :show-feedback="false"
              mb-2
            >
              <n-switch v-model:value="conversionConfig.lowerCase" />
            </n-form-item>
            <n-form-item
              :label="t('tools.list-converter.texts.label-keep-line-breaks')"
              label-placement="left"
              label-width="150"
              :show-feedback="false"
              mb-2
            >
              <n-switch v-model:value="conversionConfig.keepLineBreaks" :disabled="conversionConfig.outputAsColumn" />
            </n-form-item>
            <n-form-item
              :label="t('tools.list-converter.texts.label-output-as-column')"
              label-placement="left"
              label-width="150"
              :show-feedback="false"
              mb-2
            >
              <n-switch v-model:value="conversionConfig.outputAsColumn" data-test-id="outputAsColumn" />
            </n-form-item>
            <n-form-item
              :label="t('tools.list-converter.texts.label-reverse-list')"
              label-placement="left"
              label-width="150"
              :show-feedback="false"
              mb-2
            >
              <n-switch v-model:value="conversionConfig.reverseList" data-test-id="reverseList" />
            </n-form-item>
          </div>
          <div>
            <c-select
              v-model:value="conversionConfig.sortList"
              :label="t('tools.list-converter.texts.label-sort-list')"
              label-position="left"
              label-width="120px"
              label-align="right"
              mb-2
              :options="sortOrderOptions"
              w-full
              :disabled="conversionConfig.reverseList"
              data-test-id="sortList"
              :placeholder="t('tools.list-converter.texts.placeholder-sort-alphabetically')"
            />

            <c-input-text
              v-model:value="conversionConfig.itemsSeparator"
              :label="t('tools.list-converter.texts.label-items-separator')"
              label-position="left"
              label-width="120px"
              label-align="right"
              mb-2
              :disabled="conversionConfig.outputAsColumn"
              test-id="itemsSeparator"
              :placeholder="t('tools.list-converter.texts.placeholder-items-separator')"
            />

            <c-input-text
              v-model:value="conversionConfig.splitBySeparator"
              :label="t('tools.list-converter.texts.label-split-separator')"
              label-position="left"
              label-width="120px"
              label-align="right"
              mb-2
              test-id="splitBySeparator"
              :placeholder="t('tools.list-converter.texts.placeholder-separator-for-splitting')"
              :validation-rules="regexRules"            />

            <n-form-item
              :label="t('tools.list-converter.texts.label-filter-item')"
              label-placement="left"
              label-width="120"
              :show-feedback="false"
              mb-2
            >
              <c-input-text
                v-model:value="conversionConfig.filterRegex"
                :placeholder="t('tools.list-converter.texts.placeholder-remove-item-filter-regex')"
                test-id="filterRegex"
                :validation-rules="regexRules"              />
              <c-input-text
                v-model:value="conversionConfig.notFilterRegex"
                :placeholder="t('tools.list-converter.texts.placeholder-remove-item-not-filter-regex')"
                test-id="notFilterRegex"
                :validation-rules="regexRules"              />
            </n-form-item>

            <n-form-item
              :label="t('tools.list-converter.texts.label-unwrap-item')"
              label-placement="left"
              label-width="120"
              :show-feedback="false"
              mb-2
            >
              <c-input-text
                v-model:value="conversionConfig.removeItemPrefix"
                :placeholder="t('tools.list-converter.texts.placeholder-remove-item-prefix-regex')"
                test-id="removeItemPrefix"
                :validation-rules="regexRules"              />
              <c-input-text
                v-model:value="conversionConfig.removeItemSuffix"
                :placeholder="t('tools.list-converter.texts.placeholder-remove-item-suffix-regex')"
                test-id="removeItemSuffix"
                :validation-rules="regexRules"              />
            </n-form-item>

            <n-form-item
              :label="t('tools.list-converter.texts.label-wrap-item')"
              label-placement="left"
              label-width="120"
              :show-feedback="false"
              mb-2
            >
              <c-input-text
                v-model:value="conversionConfig.itemPrefix"
                :placeholder="t('tools.list-converter.texts.placeholder-item-prefix')"
                test-id="itemPrefix"
                :disabled="conversionConfig.outputAsColumn"
              />
              <c-input-text
                v-model:value="conversionConfig.itemSuffix"
                :placeholder="t('tools.list-converter.texts.placeholder-item-suffix')"
                test-id="itemSuffix"
                :disabled="conversionConfig.outputAsColumn"
              />
            </n-form-item>
            <n-form-item
              :label="t('tools.list-converter.texts.label-wrap-list')"
              label-placement="left"
              label-width="120"
              :show-feedback="false"
              mb-2
            >
              <c-input-text
                v-model:value="conversionConfig.listPrefix"
                :placeholder="t('tools.list-converter.texts.placeholder-list-prefix')"
                test-id="listPrefix"
                :disabled="conversionConfig.outputAsColumn"
              />
              <c-input-text
                v-model:value="conversionConfig.listSuffix"
                :placeholder="t('tools.list-converter.texts.placeholder-list-suffix')"
                test-id="listSuffix"
                :disabled="conversionConfig.outputAsColumn"
              />
            </n-form-item>
          </div>
        </n-space>
      </c-card>
    </div>
  </div>
  <format-transformer
    :input-label="t('tools.list-converter.texts.input-label-your-input-data')"
    :input-placeholder="t('tools.list-converter.texts.input-placeholder-paste-your-input-data-here')"
    :output-label="t('tools.list-converter.texts.output-label-your-transformed-data')"
    :transformer="transformer"
    :example-data="exampleData"
    download-file-name="output.txt"
    input-line-numbers
    :rows="25"
    :input-autosize="false"
  />
</template>
