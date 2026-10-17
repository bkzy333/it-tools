<script setup lang="ts">
/**
 * 身份证号校验与解析（支持批量）。
 *
 * 边界要划清楚：这里只能回答"这串号码的校验位算不算得对、按编码规则能读出什么"，
 * 回答不了"这个人是谁"。所以页面顶部就写明了这一点，
 * 校验通过也只是"格式合法"，文案上不能暗示"号码真实存在"。
 *
 * 另一个刻意的设计：输入全程不离开浏览器。这类工具用户最怕的就是号码被上传，
 * 把它做成卖点而不是藏着不说。**所以批量输入也没走 URL query 持久化** ——
 * 把身份证号写进地址栏会留在历史记录里，和"只在本地算"的承诺相冲突。
 *
 * 批量（对齐全站批量层 U1~U5，黄金范例 rmb-numbers）：
 * - 切分走共享层 splitTokens（换行 / 逗号 / 顿号 / 自定义，空行静默忽略）
 * - 多条时结果走共享层 BatchResultTable：A 列号码 / B 列校验结论 + 地区/生日/性别/年龄/生肖/星座
 *   六列额外字段，逐行复制、复制全部、导出 TXT/Excel
 * - 只有一条时回到详细视图（逐字段复制），删掉多余行就能回到单条 —— 两种形态随时互切
 * - 逐条独立解析：一条错只标红那一行，其余照常出结果（20 条里错 1 条不能整批报废）
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { splitTokens, type BatchRow, type SepMode } from '@/composable/batchSplit';
import BatchResultTable from '@/components/BatchResultTable.vue';
import CopyExportBar from '@/components/CopyExportBar.vue';
import { parseIdCard } from './id-card';

const { t } = useI18n();

/**
 * 示例：三条虚构号码。
 * - 第 1 条校验位正确（广东深圳 / 1990-03-07 / 男）
 * - 第 2 条校验位正确（北京市 / 1949-12-31 / 女）
 * - 第 3 条是第 1 条改了一个尾位，**校验位算不对**，用来看「错误只影响那一行」
 * 刻意不用网上流传的真实号码——这个工具的定位是校验算法，不是拿真人号做演示。
 */
const exampleData = {
  input: ['440304199003078212', '11010519491231002X', '440304199003078213'].join('\n'),
};

const inputText = ref(exampleData.input);
const sep = ref<SepMode>('newline');
const customSep = ref('');

function loadExample() {
  inputText.value = exampleData.input;
  sep.value = 'newline';
  customSep.value = '';
}

/** 按分隔符切成一条条，空行静默忽略 */
const tokens = computed(() => splitTokens(inputText.value, sep.value, customSep.value));

/** 只有一条时走详细视图（逐字段复制）；多条走批量表格 */
const singleInfo = computed(() => (tokens.value.length === 1 ? parseIdCard(tokens.value[0]) : null));

const singleRows = computed(() => {
  const info = singleInfo.value;
  if (!info || !info.normalized) {
    return [];
  }
  return [
    { label: t('tools.id-card-parser.texts.label-region'), value: info.region },
    { label: t('tools.id-card-parser.texts.label-birthday'), value: info.birthday },
    { label: t('tools.id-card-parser.texts.label-gender'), value: info.gender },
    { label: t('tools.id-card-parser.texts.label-age'), value: info.age === null ? '' : `${info.age} ${t('tools.id-card-parser.texts.unit-age-suffix')}` },
    { label: t('tools.id-card-parser.texts.label-zodiac'), value: info.zodiac },
    { label: t('tools.id-card-parser.texts.label-constellation'), value: info.constellation },
  ];
});

/** 批量表格的额外列（顺序与 row.extra 一一对应） */
const extraColumns = computed(() => [
  t('tools.id-card-parser.texts.label-region'),
  t('tools.id-card-parser.texts.label-birthday'),
  t('tools.id-card-parser.texts.label-gender'),
  t('tools.id-card-parser.texts.label-age'),
  t('tools.id-card-parser.texts.label-zodiac'),
  t('tools.id-card-parser.texts.label-constellation'),
]);

/** 导出用的表头：单条导出与批量表格共用同一套列定义，两边对得上 */
const exportHeaders = computed(() => [
  t('tools.id-card-parser.texts.col-id'),
  t('tools.id-card-parser.texts.col-verified'),
  ...extraColumns.value,
]);

/** 单条视图的一行：粘回 Excel 就是一行八列（与批量导出的行同构） */
const singleLine = computed(() => {
  const info = singleInfo.value;
  if (!info || !info.normalized) {
    return [];
  }
  return [
    info.normalized,
    info.valid ? t('tools.id-card-parser.texts.verdict-pass') : info.reason,
    info.region,
    info.birthday,
    info.gender,
    info.age === null ? '' : `${info.age} ${t('tools.id-card-parser.texts.unit-age-suffix')}`,
    info.zodiac,
    info.constellation,
  ];
});

/**
 * 批量结果：逐条独立解析。
 * 失败行也给满 6 个额外单元格（空格子）—— 否则整表列会错位。
 * 注意「校验位不对」的号码其实还能解析出地区/生日，所以那几列照样填值，
 * 只是 B 列标红说明它没通过校验。
 */
const batchRows = computed<BatchRow[]>(() =>
  tokens.value.map((raw) => {
    const info = parseIdCard(raw);
    const passed = Boolean(info.normalized) && info.valid;
    return {
      input: raw,
      output: passed ? t('tools.id-card-parser.texts.verdict-pass') : info.reason,
      error: !passed,
      extra: [
        info.region,
        info.birthday,
        info.gender,
        info.age === null ? '' : String(info.age),
        info.zodiac,
        info.constellation,
      ],
    };
  }),
);
</script>

<template>
  <div class="id-card-parser">
    <div flex justify-end mb-2>
      <ToolExampleButton @click="loadExample" />
    </div>

    <c-card :title="t('tools.id-card-parser.texts.title-input')" mb-3>
      <c-input-text
        v-model:value="inputText"
        :placeholder="t('tools.id-card-parser.texts.placeholder-id')"
        multiline
        :rows="3"
        :max-rows="12"
        autosize
        monospace
        clearable
      />

      <div flex flex-wrap items-center gap-3 mt-3>
        <span text-sm op-70>{{ t('tools.id-card-parser.texts.label-separator') }}</span>
        <n-radio-group v-model:value="sep" size="small">
          <n-radio value="newline">{{ t('tools.id-card-parser.texts.sep-newline') }}</n-radio>
          <n-radio value="comma">{{ t('tools.id-card-parser.texts.sep-comma') }}</n-radio>
          <n-radio value="pause">{{ t('tools.id-card-parser.texts.sep-pause') }}</n-radio>
          <n-radio value="custom">{{ t('tools.id-card-parser.texts.sep-custom') }}</n-radio>
        </n-radio-group>
        <n-input
          v-if="sep === 'custom'"
          v-model:value="customSep"
          size="small"
          :placeholder="t('tools.id-card-parser.texts.placeholder-custom-separator')"
          style="width: 220px"
        />
      </div>

      <p class="hint" mt-2 mb-0>
        {{ t('tools.id-card-parser.texts.hint-batch') }}
      </p>
      <div class="hint" mt-1>
        {{ t('tools.id-card-parser.texts.hint-privacy') }}
      </div>
    </c-card>

    <c-card v-if="tokens.length > 0" :title="t('tools.id-card-parser.texts.title-result')" mb-3>
      <!-- 单条：详细视图，每个字段单独可复制 -->
      <template v-if="singleInfo">
        <div v-if="!singleInfo.normalized" class="verdict verdict-bad">
          {{ singleInfo.reason }}
        </div>
        <template v-else>
          <div :class="singleInfo.valid ? 'verdict verdict-ok' : 'verdict verdict-bad'">
            <span v-if="singleInfo.valid">{{ t('tools.id-card-parser.texts.verdict-valid') }}</span>
            <span v-else>{{ singleInfo.reason }}</span>
          </div>
          <div v-if="singleInfo.wasOldFormat" class="hint" mb-2>
            {{ t('tools.id-card-parser.texts.hint-upgraded') }} {{ singleInfo.normalized }}
          </div>

          <input-copyable
            v-for="row in singleRows"
            :key="row.label"
            :label="row.label"
            label-position="left"
            label-width="120px"
            :value="row.value"
            mb-1
          />

          <!-- 单条也要能一次性带走：一行八列，与批量导出的行同构 -->
          <div v-if="singleLine.length > 0" flex justify-end mt-2>
            <CopyExportBar
              :text="singleLine.join('\t')"
              filename="id-card-parser"
              :rows="[exportHeaders, singleLine]"
            />
          </div>
        </template>
      </template>

      <!-- 多条：行对行批量表格 -->
      <BatchResultTable
        v-else
        :rows="batchRows"
        filename="id-card-parser"
        :columns="extraColumns"
        :input-label="t('tools.id-card-parser.texts.col-id')"
        :output-label="t('tools.id-card-parser.texts.col-verified')"
      />
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
