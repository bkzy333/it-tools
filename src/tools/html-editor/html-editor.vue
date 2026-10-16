<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Base64 } from 'js-base64';
import { useDebounceFn } from '@vueuse/core';
import { useMessage } from 'naive-ui';
import ToolExampleButton from '@/components/ToolExampleButton.vue';
import CodeBlockCopyable from '@/components/CodeBlockCopyable.vue';
import { useCopy } from '@/composable/copy';
import { useDownloadFileFromBase64 } from '@/composable/downloadBase64';
import { appBaseUrl } from '@/utils/base-url';
import {
  DEVICE_PRESETS,
  EDITOR_HINT_CSS,
  EDITOR_STYLE_ID,
  decodeHtmlFile,
  looksLikeFullDocument,
  serializeFrame,
} from './html-editor.service';

const { t } = useI18n();
const message = useMessage();

// 打开即有值：自包含的 HTML（样式 + 脚本都在里面），而且带交互，用户一看就知道能干什么。
const exampleData = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>我的第一个页面</title>
  <style>
    body { margin: 0; padding: 24px; background: #f6f7f9; color: #1f2933; font-family: system-ui, sans-serif; }
    .card { max-width: 420px; margin: 0 auto; padding: 24px; background: #fff; border-radius: 12px; box-shadow: 0 6px 20px rgba(0, 0, 0, .08); }
    h1 { margin: 0 0 12px; font-size: 20px; }
    p { line-height: 1.7; }
    #count { color: #18a058; font-weight: 700; }
    button { padding: 10px 16px; border: 0; border-radius: 8px; background: #18a058; color: #fff; font-size: 15px; cursor: pointer; }
    button:active { transform: translateY(1px); }
  </style>
</head>
<body>
  <div class="card">
    <h1>你好，HTML 编辑器</h1>
    <p>左边改代码，右边立刻看到效果。切到「编辑模式」还能直接点页面里的文字修改。</p>
    <p>你点了 <span id="count">0</span> 次按钮。</p>
    <button onclick="const el = document.getElementById('count'); el.textContent = Number(el.textContent) + 1">点我一下</button>
  </div>
</body>
</html>`;

const STORAGE_KEY = 'html-editor:source';
const PREVIEW_READY_MESSAGE = 'gjxtools-preview-ready';

function readStoredSource(): string | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

// 用自建的防抖持久化而不是 useStorage：HTML 文档动辄几百 KB，
// useStorage 每敲一个字就同步写一次 localStorage，大文件会卡。
const htmlSource = ref(readStoredSource() ?? exampleData);
const mode = ref<'source' | 'visual'>('source');
const deviceKey = ref<'desktop' | 'tablet' | 'mobile'>('desktop');

const persistSource = (value: string) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // 配额满 / 无痕模式，丢草稿可以接受，不能因此阻断编辑
  }
};
const persistSourceDebounced = useDebounceFn(persistSource, 600);

// ——— 预览 ———
// 壳页由自建路由提供（线上是 Pages Function，本地由 vite 插件补上），
// 它带一份独立的宽松 CSP，预览里才能加载外链 CSS / JS。理由见 functions/_preview-shell.ts。
const previewPath = `${appBaseUrl}html-preview`;
const frame = ref<HTMLIFrameElement | null>(null);

let frameReady = false;
let frameWritten = false;
/** 写进预览的那份源码是不是完整文档 —— 编辑模式同步回源码时按它决定给整份还是只给片段 */
let writtenAsDocument = true;
/** 编辑模式里用户改过、还没同步回源码 */
let frameDirty = false;
let popupWindow: Window | null = null;

const wiredDocuments = new WeakSet<Document>();
const writtenWindows = new WeakSet<Window>();

function writeIntoWindow(target: Window, html: string) {
  writtenWindows.add(target);

  try {
    target.document.open();
    target.document.write(html);
    target.document.close();
  } catch (error) {
    console.error('[html-editor] 写入预览失败', error);
  }
}

function enableVisualEditing() {
  const doc = frame.value?.contentDocument;

  if (!doc?.body) {
    return;
  }

  if (!doc.getElementById(EDITOR_STYLE_ID)) {
    const style = doc.createElement('style');
    style.id = EDITOR_STYLE_ID;
    style.textContent = EDITOR_HINT_CSS;
    doc.head?.appendChild(style);
  }

  doc.body.setAttribute('contenteditable', 'true');
  wireDocument(doc);
}

function disableVisualEditing() {
  const doc = frame.value?.contentDocument;

  doc?.body?.removeAttribute('contenteditable');
  doc?.getElementById(EDITOR_STYLE_ID)?.remove();
}

/** 把编辑模式下用户改的内容落回源码。读的是实时 DOM，所以随时调用都拿到最新值。 */
function syncFromFrameNow() {
  const doc = frame.value?.contentDocument;

  if (!doc || !frameDirty) {
    return;
  }

  frameDirty = false;
  htmlSource.value = serializeFrame(doc, { asDocument: writtenAsDocument });
}
const syncFromFrameDebounced = useDebounceFn(syncFromFrameNow, 250);

function renderPreview() {
  const doc = frame.value?.contentDocument;

  if (!frameReady || !doc) {
    return;
  }

  writtenAsDocument = looksLikeFullDocument(htmlSource.value);
  frameWritten = true;
  writeIntoWindow(frame.value!.contentWindow!, htmlSource.value);

  if (mode.value === 'visual') {
    enableVisualEditing();
  }
}
const renderPreviewDebounced = useDebounceFn(() => {
  // 编辑模式下源码是被预览「带」着更新的，此时再回写预览会把光标冲掉
  if (mode.value === 'source') {
    renderPreview();
  }
}, 400);

watch(htmlSource, (value) => {
  persistSourceDebounced(value);
  renderPreviewDebounced();
});

watch(mode, (value) => {
  if (value === 'visual') {
    renderPreview();
    enableVisualEditing();

    return;
  }

  syncFromFrameNow();
  disableVisualEditing();
});

function onFrameLoad() {
  // 兜底：正常情况下壳页会用 postMessage 报到，这里防的是消息通道被拦掉的情况
  const doc = frame.value?.contentDocument;

  if (frameReady || frameWritten || !doc) {
    return;
  }

  if (doc.title === 'HTML 预览' || doc.querySelector('body')?.childElementCount === 0) {
    frameReady = true;
    renderPreview();
  }
}

function onWindowMessage(event: MessageEvent) {
  if (event.origin !== window.location.origin || event.data?.type !== PREVIEW_READY_MESSAGE) {
    return;
  }

  const source = event.source as Window | null;

  if (!source) {
    return;
  }

  if (frame.value && source === frame.value.contentWindow) {
    frameReady = true;
    renderPreview();

    return;
  }

  if (popupWindow && source === popupWindow && !writtenWindows.has(popupWindow)) {
    writeIntoWindow(popupWindow, htmlSource.value);
  }
}

function onFrameInput() {
  frameDirty = true;
  syncFromFrameDebounced();
}

/**
 * 编辑模式下拦截导航。
 * 不拦的话点一下预览里的链接，预览就跳走了，用户正在编辑的内容也跟着没了。
 * 想看链接效果切回源码模式 —— 那边的预览是可交互的。
 */
function onFrameClick(event: MouseEvent) {
  const anchor = (event.target as Element | null)?.closest?.('a[href]');

  if (anchor) {
    event.preventDefault();
  }
}

function onFrameSubmit(event: Event) {
  event.preventDefault();
}

function wireDocument(doc: Document) {
  if (wiredDocuments.has(doc)) {
    return;
  }

  wiredDocuments.add(doc);
  doc.addEventListener('input', onFrameInput);
  doc.addEventListener('click', onFrameClick, true);
  doc.addEventListener('submit', onFrameSubmit, true);
}

// ——— 工具栏动作 ———
const { copy, isJustCopied } = useCopy({
  source: computed(() => htmlSource.value),
  text: t('tools.html-editor.texts.toast-copied'),
});
const copyLabel = computed(() =>
  isJustCopied.value ? t('tools.html-editor.texts.toast-copied') : t('tools.html-editor.texts.button-copy-source'),
);

const { download } = useDownloadFileFromBase64({
  source: computed(() => Base64.encode(htmlSource.value)),
  filename: 'index.html',
  extension: 'html',
});

function openInNewTab() {
  const popup = window.open(previewPath, '_blank');

  if (!popup) {
    message.warning(t('tools.html-editor.texts.error-popup-blocked'));

    return;
  }

  popupWindow = popup;

  // 壳页就绪后会 postMessage 回来再写入；这里兜一手，防止消息通道异常时开出一个空白标签
  window.setTimeout(() => {
    if (!writtenWindows.has(popup)) {
      writeIntoWindow(popup, htmlSource.value);
    }
  }, 1500);
}

function loadExample() {
  htmlSource.value = exampleData;
  renderPreview();
}

function clearSource() {
  htmlSource.value = '';
  frameDirty = false;
  renderPreview();
  message.success(t('tools.html-editor.texts.toast-cleared'));
}

async function onFileUploaded(file: File) {
  try {
    const decoded = decodeHtmlFile(await file.arrayBuffer());
    htmlSource.value = decoded.text;
    frameDirty = false;
    renderPreview();
    message.success(t('tools.html-editor.texts.toast-uploaded', { name: file.name }));

    if (decoded.encoding !== 'utf-8') {
      message.info(t('tools.html-editor.texts.toast-decoded', { encoding: decoded.encoding }));
    }
  } catch (error) {
    console.error('[html-editor] 读取文件失败', error);
    message.error(t('tools.html-editor.texts.error-upload-failed'));
  }
}

// ——— 预览尺寸 ———
// 三档都是真实视口宽度（1280 / 768 / 375），但预览面板只有约 570px：
// 放不下时**整档等比缩小**去适配面板，而不是把档位宽度改小（那样档位名就成了谎话），
// 也不加横向滚动条（那样「桌面效果」只能看到左边一小条）。
// 缩放用 transform，所以外层 holder 要把缩放后的实际尺寸显式撑出来，否则面板高度会虚高。
const scrollEl = ref<HTMLElement | null>(null);
const paneWidth = ref(0);
let paneObserver: ResizeObserver | undefined;

const currentPreset = computed(() => DEVICE_PRESETS.find(item => item.key === deviceKey.value) ?? DEVICE_PRESETS[0]);
/** 预览 frame 的逻辑高度。窄面板下给矮一点，避免手机档上下留一大片空白。 */
const frameHeight = computed(() => (paneWidth.value > 0 && paneWidth.value < 640 ? 420 : 600));
const previewScale = computed(() => {
  const { width } = currentPreset.value;

  if (!paneWidth.value || width <= paneWidth.value) {
    return 1;
  }

  return paneWidth.value / width;
});
const holderStyle = computed(() => ({
  width: `${Math.round(currentPreset.value.width * previewScale.value)}px`,
  height: `${Math.round(frameHeight.value * previewScale.value)}px`,
}));
const stageStyle = computed(() => ({
  width: `${currentPreset.value.width}px`,
  height: `${frameHeight.value}px`,
  transform: `translateX(-50%) scale(${previewScale.value})`,
}));
const deviceWidthHint = computed(() => {
  const { width } = currentPreset.value;

  return previewScale.value < 1 ? `${width} px · ${Math.round(previewScale.value * 100)}%` : `${width} px`;
});

onMounted(() => {
  window.addEventListener('message', onWindowMessage);
  window.addEventListener('beforeunload', syncFromFrameNow);

  if (scrollEl.value) {
    paneObserver = new ResizeObserver((entries) => {
      // clientWidth 已经排除滚动条，是缩放要适配的那个宽度
      paneWidth.value = Math.round(entries[0].contentRect.width);
    });
    paneObserver.observe(scrollEl.value);
    paneWidth.value = scrollEl.value.clientWidth;
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('message', onWindowMessage);
  window.removeEventListener('beforeunload', syncFromFrameNow);
  paneObserver?.disconnect();
  syncFromFrameNow();
  persistSource(htmlSource.value);
  popupWindow = null;
});
</script>

<template>
  <div>
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <n-radio-group v-model:value="mode" size="small">
        <n-radio-button value="source" data-test-id="mode-source">
          {{ t('tools.html-editor.texts.mode-source') }}
        </n-radio-button>
        <n-radio-button value="visual" data-test-id="mode-visual">
          {{ t('tools.html-editor.texts.mode-visual') }}
        </n-radio-button>
      </n-radio-group>

      <n-radio-group v-model:value="deviceKey" size="small">
        <n-radio-button value="desktop">{{ t('tools.html-editor.texts.device-desktop') }}</n-radio-button>
        <n-radio-button value="tablet">{{ t('tools.html-editor.texts.device-tablet') }}</n-radio-button>
        <n-radio-button value="mobile">{{ t('tools.html-editor.texts.device-mobile') }}</n-radio-button>
      </n-radio-group>

      <div class="min-w-8 flex-1" />

      <c-file-upload accept=".html,.htm,text/html" class="upload-compact" @file-upload="onFileUploaded">
        <span class="text-xs">{{ t('tools.html-editor.texts.drop-file') }}</span>
      </c-file-upload>

      <ToolExampleButton @click="loadExample" />

      <n-button size="small" data-test-id="copy-source" @click="copy()">
        {{ copyLabel }}
      </n-button>
      <n-button size="small" @click="download()">
        {{ t('tools.html-editor.texts.button-download') }}
      </n-button>
      <n-button size="small" @click="openInNewTab()">
        {{ t('tools.html-editor.texts.button-open-new-tab') }}
      </n-button>
      <n-button size="small" @click="clearSource()">
        {{ t('tools.html-editor.texts.button-clear') }}
      </n-button>
    </div>

    <div class="grid gap-4" :class="mode === 'source' ? 'lg:grid-cols-2' : 'grid-cols-1'">
      <!-- 用 v-show 而不是 v-if：切换模式时不能把编辑器卸载掉，否则撤销历史和滚动位置全丢 -->
      <div v-show="mode === 'source'">
        <div class="mb-1 text-xs op-60">{{ t('tools.html-editor.texts.label-source-code') }}</div>
        <CodeBlockCopyable
          v-model:value="htmlSource"
          language="html"
          editable
          copy-placement="none"
          max-height="600px"
          data-test-id="html-source"
        />
      </div>

      <div>
        <div class="mb-1 flex items-baseline justify-between gap-2 text-xs op-60">
          <span>{{ t('tools.html-editor.texts.label-preview') }}</span>
          <span>{{ deviceWidthHint }}</span>
        </div>

        <p v-if="mode === 'visual'" class="mb-2 text-xs op-70">
          {{ t('tools.html-editor.texts.hint-visual-mode') }}
        </p>

        <div ref="scrollEl" class="preview-scroll">
          <div class="preview-holder" :style="holderStyle">
            <div class="preview-stage" :style="stageStyle">
              <iframe
                ref="frame"
                class="preview-frame"
                :src="previewPath"
                sandbox="allow-same-origin allow-scripts allow-forms allow-modals allow-popups allow-downloads"
                :title="t('tools.html-editor.texts.label-preview')"
                data-test-id="preview-frame"
                @load="onFrameLoad"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 上传框在工具栏里要收成一个小方块，不占一整行 */
.upload-compact {
  flex-direction: row;
  padding: 4px 10px;
  border-width: 1px;
}

.preview-scroll {
  overflow: hidden;
}

/* 缩放后占位的实际尺寸由 JS 撑出来（transform 不影响布局盒，不能靠它压高度） */
.preview-holder {
  position: relative;
  margin: 0 auto;
}

/* 逻辑尺寸 = 档位宽度 × 逻辑高度；缩放在这里，以顶边中点为原点，配合 translateX(-50%) 居中 */
.preview-stage {
  position: absolute;
  top: 0;
  left: 50%;
  transform-origin: top center;
}

.preview-frame {
  display: block;
  width: 100%;
  height: 100%;
  background: #fff;
  border: 1px solid var(--n-border-color);
  border-radius: 6px;
}
</style>
