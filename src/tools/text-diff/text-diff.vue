<script setup lang="ts">
import type * as monaco from 'monaco-editor';
import type { DiffSummary } from './text-diff.service';
import ToolExampleButton from '@/components/ToolExampleButton.vue';
import { useCopy } from '@/composable/copy';
import { useI18n } from 'vue-i18n';

import { summarizeLineChanges } from './text-diff.service';

const { t } = useI18n();
const { copy } = useCopy();

/* ------------------------------------------------------------------ 输入状态 */
/**
 * 改造前这个组件只有两个开关，c-diff-editor 拿的是它自己的默认文本
 *（'original text' / 'modified text'）—— 等于一个空壳。
 * 参考站 Compare 之所以「展示更好」，核心是：左右两个可编辑区 + 行号 + 完整展开 +
 * 不折叠相同段落 + 交换/清空。Monaco 这边把对应的开关都补上。
 */
const original = ref('');
const modified = ref('');

const options = reactive({
  sideBySide: true,
  wordWrap: false,
  ignoreTrailingWhitespaces: false,
  lineNumbers: true,
  overviewRuler: true,
  /**
   * 折叠未改动区域。
   * 参考站是 collapseIdentical:false（永远完整展开），Monaco 默认是 true，
   * 所以这里默认关掉，观感跟参考站一致；想快速扫差异时再打开。
   */
  hideUnchangedRegions: false,
});

const viewModeOptions = computed(() => [
  { label: t('tools.text-diff.texts.opt-view-side-by-side'), value: true },
  { label: t('tools.text-diff.texts.opt-view-inline'), value: false },
]);

/* ------------------------------------------------------------------ 差异统计 */
let diffEditor: monaco.editor.IStandaloneDiffEditor | null = null;
let diffListener: monaco.IDisposable | null = null;
const summary = ref<DiffSummary>({ added: 0, removed: 0, modified: 0, unchanged: 0, changed: 0 });

function refreshSummary() {
  if (!diffEditor) {
    return;
  }
  const originalModel = diffEditor.getOriginalEditor().getModel();
  // 未变行数按「原侧」反推：被删掉和被改写的行都不会留下原文
  const originalLineCount = originalModel?.getLineCount() ?? 0;
  summary.value = summarizeLineChanges(diffEditor.getLineChanges(), originalLineCount);
}

function handleDiffEditorReady(editor: monaco.editor.IStandaloneDiffEditor) {
  // 组件会重建实例（主题/尺寸变化不会，但保险起见先摘掉旧监听）
  diffListener?.dispose();
  diffEditor = editor;
  diffListener = editor.onDidUpdateDiff(refreshSummary);
  refreshSummary();
}

onBeforeUnmount(() => diffListener?.dispose());

const diffOptions = computed<monaco.editor.IDiffEditorOptions>(() => ({
  wordWrap: options.wordWrap ? 'on' : 'off',
  ignoreTrimWhitespace: options.ignoreTrailingWhitespaces,
  renderSideBySide: options.sideBySide,
  lineNumbers: options.lineNumbers ? 'on' : 'off',
  renderOverviewRuler: options.overviewRuler,
  hideUnchangedRegions: { enabled: options.hideUnchangedRegions },
  originalEditable: true,
  scrollBeyondLastLine: false,
  minimap: { enabled: false },
}));

/* ------------------------------------------------------------------ 操作 */
function swapSides() {
  const left = original.value;
  original.value = modified.value;
  modified.value = left;
}

function clearAll() {
  original.value = '';
  modified.value = '';
}

const canDownload = computed(() => modified.value.length > 0);

async function copyModified() {
  await copy(modified.value);
}

function downloadModified() {
  const blob = new Blob([modified.value], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = document.documentElement.lang.startsWith('zh') ? '改后文本.txt' : 'modified.txt';
  anchor.click();
  URL.revokeObjectURL(url);
}

const stats = computed(() => [
  { label: t('tools.text-diff.texts.stat-added'), value: summary.value.added },
  { label: t('tools.text-diff.texts.stat-removed'), value: summary.value.removed },
  { label: t('tools.text-diff.texts.stat-modified'), value: summary.value.modified },
  { label: t('tools.text-diff.texts.stat-unchanged'), value: summary.value.unchanged },
]);

/* 约定：每个工具都要有「一键示例」按钮 —— 空输入框是跳出率最高的形态。 */
const exampleData = {
  // 这组样例刻意同时覆盖三种差异形态，否则「新增/删除/修改」三个统计里
  // 会有一两个永远是 0，看着像坏了：
  //   修改   —— listen 80 变成 listen 443 ssl（两侧等长、原地改写）；
  //   删除   —— 左边 3 行 TODO 注释整体被删（原侧 3 行、改侧 0 行）；
  //   新增   —— 右边 add_header 那行是左没有的（改侧 1 行、原侧 0 行）。
  // 三个区块刻意做成不等长且不相邻，逼 monaco 走 insertion / deletion 分支，
  // 而不是统统折成等长的「替换」。
  original: [
    'server {',
    '  listen 80;',
    '  server_name example.com;',
    '  root /var/www/html;',
    '  index index.html;',
    '  # TODO(2023): 这段还用不用？',
    '  # 先注释掉看看',
    '  # 不影响现有逻辑',
    '  error_page 404 /404.html;',
    '}',
  ].join('\n'),
  modified: [
    'server {',
    '  listen 443 ssl;',
    '  server_name example.com;',
    '  root /var/www/html;',
    '  index index.html;',
    '  add_header X-Frame-Options SAMEORIGIN;',
    '  error_page 404 /404.html;',
    '}',
  ].join('\n'),
};

function loadExample() {
  original.value = exampleData.original;
  modified.value = exampleData.modified;
  options.sideBySide = true;
  options.wordWrap = false;
  options.hideUnchangedRegions = false;
}
</script>

<template>
  <c-card :title="t('tools.text-diff.title')">
    <div flex flex-wrap items-center justify-between gap-2 mb-2>
      <n-space align="center">
        <c-button size="small" @click="swapSides">
          {{ t('tools.text-diff.texts.action-swap') }}
        </c-button>
        <c-button size="small" @click="clearAll">
          {{ t('tools.text-diff.texts.action-clear') }}
        </c-button>
      </n-space>
      <ToolExampleButton @click="loadExample" />
    </div>

    <div grid grid-cols-1 md:grid-cols-2 gap-3 mb-2>
      <n-form-item
        :label="t('tools.text-diff.texts.title-input-original')"
        label-placement="left"
        :label-style="{ width: '72px' }"
        mb-0
      >
        <n-input
          v-model:value="original"
          type="textarea"
          :rows="8"
          :placeholder="t('tools.text-diff.texts.placeholder-input-original')"
        />
      </n-form-item>
      <n-form-item
        :label="t('tools.text-diff.texts.title-input-modified')"
        label-placement="left"
        :label-style="{ width: '72px' }"
        mb-0
      >
        <n-input
          v-model:value="modified"
          type="textarea"
          :rows="8"
          :placeholder="t('tools.text-diff.texts.placeholder-input-modified')"
        />
      </n-form-item>
    </div>

    <c-card :title="t('tools.text-diff.texts.title-diff-summary')" size="small" mb-2>
      <div flex flex-wrap gap-4 mb-2>
        <span v-for="item in stats" :key="item.label">
          {{ item.label }}：<b>{{ item.value }}</b>
        </span>
      </div>
      <n-space align="center" wrap>
        <c-select
          v-model:value="options.sideBySide"
          :options="viewModeOptions"
          :label="t('tools.text-diff.texts.label-view-mode')"
          label-width="90px"
          label-position="left"
          w="150px"
        />
        <n-checkbox v-model:checked="options.lineNumbers">
          {{ t('tools.text-diff.texts.tag-line-numbers') }}
        </n-checkbox>
        <n-checkbox v-model:checked="options.overviewRuler">
          {{ t('tools.text-diff.texts.tag-overview-ruler') }}
        </n-checkbox>
        <n-checkbox v-model:checked="options.wordWrap">
          {{ t('tools.text-diff.texts.tag-word-wrap') }}
        </n-checkbox>
        <n-checkbox v-model:checked="options.ignoreTrailingWhitespaces">
          {{ t('tools.text-diff.texts.tag-ignore-whitespaces') }}
        </n-checkbox>
        <!-- naive 的 tooltip 必须显式给 #trigger：只往 default 里塞 checkbox 会报
             slot[trigger] is empty + slot[default] should have exactly one child -->
        <n-tooltip>
          <template #trigger>
            <n-checkbox v-model:checked="options.hideUnchangedRegions">
              {{ t('tools.text-diff.texts.tag-hide-unchanged') }}
            </n-checkbox>
          </template>
          {{ t('tools.text-diff.texts.hint-hide-unchanged') }}
        </n-tooltip>
      </n-space>
    </c-card>

    <c-card :title="t('tools.text-diff.texts.title-diff-editor')" size="small" important:flex-1 important:pa-0>
      <c-diff-editor
        :options="diffOptions"
        :original="original"
        :modified="modified"
        language="txt"
        height="60vh"
        @update:original="original = $event"
        @update:modified="modified = $event"
        @ready="handleDiffEditorReady"
      />
    </c-card>

    <c-card :title="t('tools.text-diff.texts.title-result')" size="small" mt-2>
      <div flex items-center gap-2>
        <c-button type="primary" :disabled="!canDownload" @click="copyModified">
          {{ t('tools.text-diff.texts.action-copy-modified') }}
        </c-button>
        <c-button :disabled="!canDownload" @click="downloadModified">
          {{ t('tools.text-diff.texts.action-download-modified') }}
        </c-button>
      </div>
    </c-card>
  </c-card>
</template>
