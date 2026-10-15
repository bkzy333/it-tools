<script setup lang="ts">
/**
 * 文本翻译 —— 单条 + 批量双模式（腾讯云 TMT，服务端代理）。
 *
 * 交互约定（2026-10 用户明确要求）：
 * - 只在点「翻译」按钮时请求，绝不随输入自动翻译（既浪费额度，也会翻到半截内容）。
 *   改输入或改语言都不会清空上一次结果 —— 用户往往要对照新旧内容再决定，清掉反而碍事。
 * - 不做「结果来自缓存」之类的内部提示：省了多少额度是后台的事，不该占用用户注意力。
 * - 批量模式：一行（或自定义分隔符）一条，一次请求交给后端，结果逐行对应，
 *   可直接复制回 Excel B 列，也可导出 TXT / Excel（走全站统一的 BatchResultTable）。
 *
 * 批量模式的省额度手段：
 * - 相同条目先在前端去重，只发唯一的那几条，结果再映射回原始行（Excel 里同名词很常见）。
 * - 后端对每条先查缓存，跨用户 / 跨模式（单条翻过的句子批量里也命中）复用。
 * - 未命中的条目在后端合并成 ≤2000 字符的批次，一批一次调用腾讯云。
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStorage } from '@vueuse/core';
import ToolExampleButton from '@/components/ToolExampleButton.vue';
import TextareaCopyable from '@/components/TextareaCopyable.vue';
import BatchResultTable from '@/components/BatchResultTable.vue';
import { useQueryParam } from '@/composable/queryParams';
import { splitTokens, type BatchRow, type SepMode } from '@/composable/batchSplit';
import {
  BATCH_MAX_ITEMS,
  LANG_LABELS,
  TARGETS_FOR,
  TranslateRequestError,
  translateText,
  translateTexts,
} from './text-translate.service';

const { t } = useI18n();

// 约定：每个工具都要有 exampleData + 「一键示例」按钮，空输入框是跳出率最高的形态。
// 批量示例刻意用「Excel A 列英文名词 + 短句」的真实形态，用户一眼就知道这个模式怎么用。
const exampleData = {
  text: '今天天气真好，我们一起去公园散步吧。',
  batch: 'machine learning\ninvoice\nPlease open the file\napple',
  source: 'auto',
  target: 'en',
};

const text = useQueryParam<string>({ tool: 'text-translate', name: 'text', defaultValue: '' });
// 源/目标语言持久化到浏览器 localStorage：下次打开页面默认恢复上次选择（需求 #2）。
const source = useStorage<string>('text-translate-source', exampleData.source);
const target = useStorage<string>('text-translate-target', exampleData.target);

// 批量模式与分隔符同样持久化：用户一旦选了「批量 + 自定义分隔符」，下次还得是这个设置。
const batchMode = useStorage<boolean>('text-translate-batch', false);
const sep = useStorage<SepMode>('text-translate-sep', 'newline');
const customSep = useStorage<string>('text-translate-custom-sep', '');

const loading = ref(false);
const errorMsg = ref('');
const result = ref('');
const batchRows = ref<BatchRow[]>([]);
// 本次为去重省下的条数，翻译完给一句轻提示（不是错误，只是让用户知道请求没那么多次）
const dedupedCount = ref(0);

// 目标语言下拉随源语言变化：腾讯云并非任意语种可互通，选了不支持的配对会被接口拒绝。
const sourceOptions = computed(() => Object.entries(LANG_LABELS).map(([value, label]) => ({ value, label })));
const targetOptions = computed(() =>
  (TARGETS_FOR[source.value] ?? []).map((value) => ({ value, label: LANG_LABELS[value] })),
);

/** 批量模式下实时算条数，好在按钮旁提示「共 N 条」，超上限时先给出警告而不是等点了才报错。 */
const batchTokens = computed(() =>
  batchMode.value ? splitTokens(text.value, sep.value, customSep.value) : [],
);
const batchCount = computed(() => batchTokens.value.length);
const overLimit = computed(() => batchCount.value > BATCH_MAX_ITEMS);

function onSourceChange() {
  const allowed = TARGETS_FOR[source.value] ?? [];
  if (!allowed.includes(target.value)) {
    target.value = allowed[0] ?? 'en';
  }
}

// 进入页面时用已存偏好；并做一次合法性校验（腾讯云约束：源/目标并非任意可互通）。
onSourceChange();

async function doTranslate() {
  // 重叠保护：正在翻译时忽略新触发，避免无意识的重复点击刷额度。
  if (loading.value) {
    return;
  }
  errorMsg.value = '';

  if (batchMode.value) {
    await doTranslateBatch();
    return;
  }

  const input = text.value.trim();
  if (!input) {
    errorMsg.value = t('tools.text-translate.texts.error-empty');
    result.value = '';
    return;
  }
  loading.value = true;
  try {
    // 后端返回扁平结构 { TargetText, err? }（translate.ts 已解包腾讯云 Response）。
    const data = await translateText(input, source.value, target.value);
    if (data.err) {
      errorMsg.value = data.err;
      return;
    }
    const targetText = data.TargetText ?? '';
    if (!targetText) {
      // 接口成功但无译文（极少），给出提示而非空白。
      errorMsg.value = t('tools.text-translate.texts.error-empty-result');
      return;
    }
    // 成功才覆盖：失败时留着上一次的结果，用户还能对照 / 复制，不至于白翻一次。
    result.value = targetText;
  } catch {
    errorMsg.value = t('tools.text-translate.texts.error-network');
  } finally {
    loading.value = false;
  }
}

async function doTranslateBatch() {
  const list = batchTokens.value;
  if (list.length === 0) {
    errorMsg.value = t('tools.text-translate.texts.error-empty');
    return;
  }
  if (list.length > BATCH_MAX_ITEMS) {
    errorMsg.value = t('tools.text-translate.texts.error-too-many-items', {
      n: BATCH_MAX_ITEMS,
      count: list.length,
    });
    return;
  }

  // 去重只请求唯一条目：Excel 一列里同名词/同句很常见，去掉重复能直接省掉对应字符与调用。
  const unique = [...new Set(list)];

  loading.value = true;
  try {
    const data = await translateTexts(unique, source.value, target.value);
    if (data.err) {
      errorMsg.value = data.err;
      return;
    }
    const bySource = new Map<string, BatchRow>();
    unique.forEach((token, i) => {
      const item = data.results?.[i];
      if (!item || item.err || !item.TargetText) {
        // 单条失败只让那一行标红，其余行照常出结果
        bySource.set(token, {
          input: token,
          output: item?.err || t('tools.text-translate.texts.error-empty-result'),
          error: true,
        });
        return;
      }
      bySource.set(token, { input: token, output: item.TargetText, error: false });
    });
    // 映射回原始行序：去重后行数变少，这里按原顺序展开，方便逐行贴回 Excel。
    batchRows.value = list.map((token) => bySource.get(token) as BatchRow);
    dedupedCount.value = list.length - unique.length;
  } catch (e) {
    errorMsg.value
      = e instanceof TranslateRequestError && e.message
        ? e.message
        : t('tools.text-translate.texts.error-network');
  } finally {
    loading.value = false;
  }
}

function loadExample() {
  if (batchMode.value) {
    // 批量示例走「英文 → 中文」：这才是从 Excel A 列复制过来时最常见的方向。
    text.value = exampleData.batch;
    sep.value = 'newline';
    customSep.value = '';
    source.value = 'en';
    target.value = 'zh';
    return;
  }
  text.value = exampleData.text;
  source.value = exampleData.source;
  target.value = exampleData.target;
}

// 交换源/目标语言（自动检测模式下源语言不明确，禁止交换）。
function swap() {
  if (source.value === 'auto') {
    return;
  }
  const oldSource = source.value;
  source.value = target.value;
  target.value = oldSource;
  onSourceChange();
}
</script>

<template>
  <c-card :title="t('tools.text-translate.texts.title-text-translate')" max-w-800px>
    <div flex flex-col gap-3>
      <n-form-item
        :label="batchMode
          ? t('tools.text-translate.texts.label-input-batch')
          : t('tools.text-translate.texts.label-input')"
        label-placement="top"
        mb-0
      >
        <n-input
          v-model:value="text"
          type="textarea"
          :placeholder="batchMode
            ? t('tools.text-translate.texts.placeholder-input-batch')
            : t('tools.text-translate.texts.placeholder-input')"
          :autosize="{ minRows: 4, maxRows: 12 }"
        />
      </n-form-item>

      <!-- 批量模式：一行一条，逐行对应出结果 -->
      <div flex flex-col gap-2>
        <n-checkbox v-model:checked="batchMode">
          {{ t('tools.text-translate.texts.opt-batch-mode') }}
        </n-checkbox>

        <template v-if="batchMode">
          <p m-0 text-xs op-60>{{ t('tools.text-translate.texts.hint-batch-mode', { n: BATCH_MAX_ITEMS }) }}</p>

          <div flex flex-wrap items-center gap-3>
            <span text-sm op-70>{{ t('tools.text-translate.texts.label-separator') }}</span>
            <n-radio-group v-model:value="sep" size="small">
              <n-radio value="newline">{{ t('tools.text-translate.texts.sep-newline') }}</n-radio>
              <n-radio value="comma">{{ t('tools.text-translate.texts.sep-comma') }}</n-radio>
              <n-radio value="pause">{{ t('tools.text-translate.texts.sep-pause') }}</n-radio>
              <n-radio value="custom">{{ t('tools.text-translate.texts.sep-custom') }}</n-radio>
            </n-radio-group>
            <n-input
              v-if="sep === 'custom'"
              v-model:value="customSep"
              size="small"
              :placeholder="t('tools.text-translate.texts.placeholder-custom-separator')"
              style="width: 220px"
            />
          </div>

          <p m-0 text-xs op-60>{{ t('tools.text-translate.texts.note-separator') }}</p>
        </template>
      </div>

      <div flex flex-col gap-2 sm:flex-row sm:items-end>
        <n-form-item :label="t('tools.text-translate.texts.label-from')" label-placement="top" flex-1 mb-0>
          <n-select v-model:value="source" :options="sourceOptions" @update:value="onSourceChange" />
        </n-form-item>

        <n-button
          secondary
          circle
          mb-1
          :disabled="source === 'auto'"
          :title="t('tools.text-translate.texts.swap')"
          @click="swap"
        >
          ⇄
        </n-button>

        <n-form-item :label="t('tools.text-translate.texts.label-to')" label-placement="top" flex-1 mb-0>
          <n-select v-model:value="target" :options="targetOptions" />
        </n-form-item>
      </div>

      <div flex flex-wrap items-center gap-2>
        <n-button type="primary" :loading="loading" :disabled="loading" @click="doTranslate">
          {{ t('tools.text-translate.texts.button-translate') }}
        </n-button>
        <ToolExampleButton @click="loadExample" />
        <span v-if="batchMode && batchCount > 0" text-sm :class="overLimit ? 'text-red-500' : 'text-muted'">
          {{ overLimit
            ? t('tools.text-translate.texts.error-too-many-items', { n: BATCH_MAX_ITEMS, count: batchCount })
            : t('tools.text-translate.texts.status-batch-count', { n: batchCount }) }}
        </span>
        <span v-if="loading" text-sm text-muted>{{ t('tools.text-translate.texts.status-translating') }}</span>
      </div>

      <n-alert v-if="errorMsg" type="error" :show-icon="true">{{ errorMsg }}</n-alert>

      <!-- 批量结果：逐行对应 + 逐行复制 + 复制全部 + 导出 TXT / Excel -->
      <template v-if="batchMode">
        <p v-if="dedupedCount > 0 && batchRows.length > 0" m-0 text-xs op-60>
          {{ t('tools.text-translate.texts.note-dedup', { n: dedupedCount }) }}
        </p>
        <BatchResultTable
          :rows="batchRows"
          filename="translation"
          :input-label="t('tools.text-translate.texts.col-input')"
          :output-label="t('tools.text-translate.texts.col-output')"
        />
      </template>

      <n-form-item
        v-else-if="result"
        :label="t('tools.text-translate.texts.label-output')"
        label-placement="top"
        mb-0
      >
        <TextareaCopyable :value="result" word-wrap />
      </n-form-item>
    </div>
  </c-card>
</template>
