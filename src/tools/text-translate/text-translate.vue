<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ToolExampleButton from '@/components/ToolExampleButton.vue';
import TextareaCopyable from '@/components/TextareaCopyable.vue';
import { useQueryParam } from '@/composable/queryParams';
import { LANG_LABELS, TARGETS_FOR, translateText } from './text-translate.service';

const { t } = useI18n();

// 约定：每个工具都要有 exampleData + 「一键示例」按钮，空输入框是跳出率最高的形态。
const exampleData = {
  text: '今天天气真好，我们一起去公园散步吧。',
  source: 'auto',
  target: 'en',
};

const text = useQueryParam<string>({ tool: 'text-translate', name: 'text', defaultValue: '' });
const source = ref<string>(exampleData.source);
const target = ref<string>(exampleData.target);

const loading = ref(false);
const errorMsg = ref('');
const result = ref('');
const hitCache = ref(false);

// 目标语言下拉随源语言变化：腾讯云并非任意语种可互通，选了不支持的配对会被接口拒绝。
const sourceOptions = computed(() => Object.entries(LANG_LABELS).map(([value, label]) => ({ value, label })));
const targetOptions = computed(() =>
  (TARGETS_FOR[source.value] ?? []).map((value) => ({ value, label: LANG_LABELS[value] })),
);

function onSourceChange() {
  const allowed = TARGETS_FOR[source.value] ?? [];
  if (!allowed.includes(target.value)) {
    target.value = allowed[0] ?? 'en';
  }
}

async function doTranslate() {
  // 防抖 / 重叠保护：正在翻译时忽略新触发，避免无意识的重复点击刷额度。
  if (loading.value) {
    return;
  }
  const input = text.value.trim();
  if (!input) {
    errorMsg.value = t('tools.text-translate.texts.error-empty');
    result.value = '';
    hitCache.value = false;
    return;
  }
  loading.value = true;
  errorMsg.value = '';
  hitCache.value = false;
  try {
    const data = await translateText(input, source.value, target.value);
    if (data.err) {
      errorMsg.value = data.err;
      result.value = '';
      return;
    }
    const resp = data.Response ?? {};
    if (resp.Error) {
      errorMsg.value = `${resp.Error.Code}：${resp.Error.Message}`;
      result.value = '';
    } else {
      result.value = resp.TargetText ?? '';
      hitCache.value = Boolean(data.hitCache);
    }
  } catch {
    errorMsg.value = t('tools.text-translate.texts.error-network');
  } finally {
    loading.value = false;
  }
}

// 500ms 防抖自动翻译：粘贴 / 输入停顿即触发，但绝不即时；配合缓存把重复请求压到最低。
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleTranslate() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    if (text.value.trim() && !loading.value) {
      void doTranslate();
    }
  }, 500);
}
watch([text, source, target], () => {
  if (text.value.trim()) {
    scheduleTranslate();
  } else {
    result.value = '';
    errorMsg.value = '';
    hitCache.value = false;
  }
});

function loadExample() {
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
      <n-form-item :label="t('tools.text-translate.texts.label-input')" label-placement="top" mb-0>
        <n-input
          v-model:value="text"
          type="textarea"
          :placeholder="t('tools.text-translate.texts.placeholder-input')"
          :autosize="{ minRows: 4, maxRows: 12 }"
        />
      </n-form-item>

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

      <div flex flex-wrap gap-2>
        <n-button type="primary" :loading="loading" :disabled="loading" @click="doTranslate">
          {{ t('tools.text-translate.texts.button-translate') }}
        </n-button>
        <ToolExampleButton @click="loadExample" />
        <span v-if="loading" text-sm text-muted>{{ t('tools.text-translate.texts.status-translating') }}</span>
      </div>

      <n-alert v-if="errorMsg" type="error" :show-icon="true">{{ errorMsg }}</n-alert>
      <n-alert v-if="hitCache && result" type="success" :show-icon="true">
        {{ t('tools.text-translate.texts.cached-hint') }}
      </n-alert>

      <n-form-item v-if="result" :label="t('tools.text-translate.texts.label-output')" label-placement="top" mb-0>
        <TextareaCopyable :value="result" word-wrap />
      </n-form-item>
    </div>
  </c-card>
</template>
