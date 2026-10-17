<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Base64 } from 'js-base64';
import { useDebounceFn } from '@vueuse/core';
import { useMessage, useThemeVars } from 'naive-ui';
import ToolExampleButton from '@/components/ToolExampleButton.vue';
import CodeBlockCopyable from '@/components/CodeBlockCopyable.vue';
import { useCopy } from '@/composable/copy';
import { useDownloadFileFromBase64 } from '@/composable/downloadBase64';
import { appBaseUrl } from '@/utils/base-url';
import {
  BOX_VALUE_MAX,
  DEVICE_PRESETS,
  EDITOR_HINT_CSS,
  EDITOR_SELECTED_ATTR,
  EDITOR_STYLE_ID,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  clearInlineStyles,
  decodeHtmlFile,
  describeElement,
  elementPath,
  looksLikeFullDocument,
  readElementStyles,
  serializeFrame,
} from './html-editor.service';
import type { BoxSide, ElementStyleValues } from './html-editor.service';

const { t } = useI18n();
const message = useMessage();
// 面板的边框/底色/强调色都跟主题走：`--n-border-color` 只在 naive 组件内部局部定义，
// 在工具页自己的元素上引用它会解析成 undefined，整条 border 声明变成非法声明而**不渲染**。
const themeVars = useThemeVars();

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

  // document.open() 会**清掉该文档上所有事件监听**（规范如此，不是浏览器怪癖）。
  // 所以写新文档前必须把「已接线」标记撤掉：否则第二次进编辑模式时监听器已经没了、
  // 而 WeakSet 还以为接过线，点击选中与键入全部静默失效。
  // 实测表现极具误导性：第一次进编辑模式一切正常，来回切一次就点不动、也输不进字。
  wiredDocuments.delete(target.document);

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
  clearSelection();
}

// ——— 样式面板（编辑模式）———
// 选中的元素用模块级变量持有，**不进 Vue 响应式系统**：DOM 节点被 reactive() 包成 Proxy 之后，
// 拿它做 DOM 操作时身份会变（contains 判不出来、setAttribute 落到代理上），排查成本极高。
// 需要驱动界面的只有「有没有选中 / 路径文字 / 字段值」这几项，单独用 ref 存。
let selectedEl: Element | null = null;
let pathElements: Element[] = [];
const hasSelection = ref(false);
const selectedTag = ref('');
const selectedPath = ref<string[]>([]);
const boxOpen = ref(false);

const emptySides = () => ({ top: 0, right: 0, bottom: 0, left: 0 });
const BOX_GROUPS = ['padding', 'margin'] as const;
const styleValues = ref<ElementStyleValues>({
  backgroundColor: '',
  color: '',
  fontSize: 16,
  fontWeight: '400',
  textAlign: 'left',
  padding: emptySides(),
  margin: emptySides(),
});

/** 四向数值框的标签。写死静态 key，不用 `style-side-${side}` 拼（动态键过不了 i18n 静态扫描）。 */
const boxSideLabels = computed<{ side: BoxSide; label: string }[]>(() => [
  { side: 'top', label: t('tools.html-editor.texts.style-side-top') },
  { side: 'right', label: t('tools.html-editor.texts.style-side-right') },
  { side: 'bottom', label: t('tools.html-editor.texts.style-side-bottom') },
  { side: 'left', label: t('tools.html-editor.texts.style-side-left') },
]);

function refreshStyleValues() {
  const win = frame.value?.contentWindow;

  if (win && selectedEl) {
    styleValues.value = readElementStyles(win, selectedEl);
  }
}

function clearSelection() {
  selectedEl?.removeAttribute(EDITOR_SELECTED_ATTR);
  selectedEl = null;
  pathElements = [];
  selectedPath.value = [];
  selectedTag.value = '';
  hasSelection.value = false;
}

/** 选中一个元素：描边高亮 + 把它当前生效的样式读进面板。 */
function selectElement(el: Element) {
  if (!frame.value?.contentDocument?.body?.contains(el)) {
    return;
  }

  selectedEl?.removeAttribute(EDITOR_SELECTED_ATTR);
  selectedEl = el;
  el.setAttribute(EDITOR_SELECTED_ATTR, 'true');

  pathElements = elementPath(el);
  selectedPath.value = pathElements.map(describeElement);
  selectedTag.value = describeElement(el);
  hasSelection.value = true;
  refreshStyleValues();
}

/** 面包屑跳级：桌面档在窄面板里会整体缩小（见过 44%），小元素点不准，靠路径直接跳。 */
function selectPathIndex(index: number) {
  const el = pathElements[index];

  if (el) {
    selectElement(el);
  }
}

/**
 * 拿选中元素当「能写 style 的元素」用。
 *
 * **不能用 `instanceof HTMLElement`**：选中的元素属于预览 iframe 的文档，是那个 realm 的
 * HTMLElement 实例，而父窗口里的 `HTMLElement` 是另一个构造函数 —— 跨 realm 判 instanceof
 * 恒为 false，于是整条写样式的路被静默拦掉（不报错、界面照样正常，只是改了没反应）。
 * 只判有没有 `style`：HTML 元素与 SVG 元素都有，够用且跨 realm 成立。
 */
function asStylable(el: Element | null): HTMLElement | null {
  return el && 'style' in el ? (el as HTMLElement) : null;
}

/**
 * 写一条内联样式到选中元素上。
 *
 * 值合法不合法交给浏览器判，但**必须先删旧值再设新值**：CSSOM 会静默丢弃非法声明，
 * 若旧值还留着，`getPropertyValue` 返回的是旧值 —— 分不清「新值生效」与「新值被丢掉」，
 * 于是非法输入既不报错也不提示，用户以为改成功了。
 * 清空输入框 = 把这声明从内联样式里删掉（回到文档原本的样子）。
 */
function applyStyle(property: string, value: string) {
  const element = asStylable(selectedEl);

  if (!element) {
    return;
  }

  const previous = element.style.getPropertyValue(property);
  element.style.removeProperty(property);
  element.style.setProperty(property, value);

  if (value.trim() !== '' && !element.style.getPropertyValue(property)) {
    if (previous) {
      element.style.setProperty(property, previous);
    }

    message.warning(t('tools.html-editor.texts.error-invalid-style'));
    refreshStyleValues();

    return;
  }

  refreshStyleValues();
  frameDirty = true;
  syncFromFrameNow();
}

const applyFontSize = (size: number) => applyStyle('font-size', `${size}px`);
const applyBoxSide = (group: 'padding' | 'margin', side: BoxSide, value: number) =>
  applyStyle(`${group}-${side}`, `${Math.max(0, Math.round(value || 0))}px`);

/** 拖滑块时只改 DOM（实时看效果），松手（change）才回写源码 —— 否则每移动 1px 就刷一次源码框。 */
function previewFontSize(size: number) {
  const element = asStylable(selectedEl);

  if (!element) {
    return;
  }

  element.style.setProperty('font-size', `${size}px`);
  styleValues.value.fontSize = size;
}

function resetSelectedStyles() {
  if (!selectedEl) {
    return;
  }

  clearInlineStyles(selectedEl);
  refreshStyleValues();
  frameDirty = true;
  syncFromFrameNow();
  message.success(t('tools.html-editor.texts.toast-styles-reset'));
}

function removeSelectedElement() {
  const element = selectedEl;

  if (!element) {
    return;
  }

  // 先清选中（连带摘掉描边属性）再删节点，避免把编辑器的痕迹留在残留 DOM 上
  clearSelection();
  element.remove();
  frameDirty = true;
  syncFromFrameNow();
  message.success(t('tools.html-editor.texts.toast-element-removed'));
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
  // 整份文档被换掉了，之前选中的元素已经不在这个文档里
  clearSelection();
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
  const target = event.target as Element | null;

  if (!target) {
    return;
  }

  if (target.closest?.('a[href]')) {
    event.preventDefault();
  }

  // 点到页面留白时 target 是 <html>，按 body 算 —— 否则用户改不了整页背景
  const doc = frame.value?.contentDocument;
  const picked = doc && target === doc.documentElement ? doc.body : target;

  if (picked) {
    selectElement(picked);
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
// 三档都是真实视口宽度（1280 / 768 / 375），预览面板放不下时**整档等比缩小**去适配面板，
// 而不是把档位宽度改小（那样档位名就成了谎话），也不加横向滚动条（那样「桌面效果」
// 只能看到左边一小条）。缩放用 transform，外层 holder 要把缩放后的实际尺寸显式撑出来。
//
// ⚠️ 缩放的**纵向**绝不能跟着一起缩。早先 frameHeight 写死 420 逻辑 px，桌面档再乘
// 44% 的缩放，显示出来只剩 186px 高 —— 预览变成一张邮票，下面全是大片空白。
// 现在倒过来算：**显示高度恒等于编辑区高度**，逻辑高度 = 显示高度 ÷ 缩放，
// 于是桌面档的预览视口是 1280×1600 而不是 1280×420，一屏能看到接近整页。
const MIN_WORK_HEIGHT = 480;
const MAX_WORK_HEIGHT = 900;
/** 编辑区底部留一点余量，别贴着视口下沿。 */
const WORK_BOTTOM_GAP = 16;
/** 网格内「HTML 源码 / 实时预览」那一行标签的高度，要从可用高度里扣掉。 */
const WORK_LABEL_ROW = 24;
/** 量不到编辑区位置时的兜底偏移（面包屑 + 头部 + 工具栏 + 标签行的实测值）。 */
const FALLBACK_WORK_TOP = 360;
const MIN_LOGICAL_HEIGHT = 420;
const MAX_LOGICAL_HEIGHT = 2400;

const gridEl = ref<HTMLElement | null>(null);
const workHeight = ref(MIN_WORK_HEIGHT);

const scrollEl = ref<HTMLElement | null>(null);
const paneWidth = ref(0);
let paneObserver: ResizeObserver | undefined;

/**
 * 页面滚动发生在 `.n-layout.content` 的原生滚动容器里而不是 window，
 * 算编辑区顶部偏移时必须把它的 scrollTop 加回来，否则滚动过之后会越算越矮。
 */
function pageScrollTop(): number {
  const scroller = document.querySelector<HTMLElement>('.n-layout.content .n-layout-scroll-container');

  return Math.max(window.scrollY, scroller?.scrollTop ?? 0);
}

/** 编辑区高度跟着视口走：首屏除了头部和工具栏，剩下的都给编辑区。 */
function updateWorkHeight() {
  const rect = gridEl.value?.getBoundingClientRect();
  const top = rect ? Math.round(rect.top + pageScrollTop()) : FALLBACK_WORK_TOP;
  const available = window.innerHeight - top - WORK_LABEL_ROW - WORK_BOTTOM_GAP;

  workHeight.value = Math.min(MAX_WORK_HEIGHT, Math.max(MIN_WORK_HEIGHT, Math.round(available)));
}

const currentPreset = computed(() => DEVICE_PRESETS.find(item => item.key === deviceKey.value) ?? DEVICE_PRESETS[0]);
const previewScale = computed(() => {
  const { width } = currentPreset.value;

  if (!paneWidth.value || width <= paneWidth.value) {
    return 1;
  }

  return paneWidth.value / width;
});
/** 逻辑高度按缩放反算，让预览「显示高度」恒等于编辑区高度（缩放只负责宽度适配）。 */
const frameHeight = computed(() => {
  const scale = previewScale.value || 1;

  return Math.min(MAX_LOGICAL_HEIGHT, Math.max(MIN_LOGICAL_HEIGHT, Math.round(workHeight.value / scale)));
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
  // 带上逻辑视口高度：缩放反算之后「1280 px」不再等于屏幕上看到的宽度，两个数字都写清楚
  const size = `${width} × ${frameHeight.value} px`;

  return previewScale.value < 1 ? `${size} · ${Math.round(previewScale.value * 100)}%` : size;
});

// 编辑模式的两栏布局（预览 + 样式面板）比源码模式多一行提示，网格顶部一样，
// 但预览列的实际可用高度会矮一点，进/出编辑模式时重算一次，别让预览戳出首屏。
watch(mode, () => nextTick(updateWorkHeight));

onMounted(() => {
  window.addEventListener('message', onWindowMessage);
  window.addEventListener('beforeunload', syncFromFrameNow);
  window.addEventListener('resize', updateWorkHeight);
  updateWorkHeight();
  // 首帧字体和工具栏换行还没定下来，量到的顶部偏移会偏；下一帧再量一次纠正
  requestAnimationFrame(updateWorkHeight);

  if (scrollEl.value) {
    paneObserver = new ResizeObserver((entries) => {
      // clientWidth 已经排除滚动条，是缩放要适配的那个宽度。
      // 值没变就别写：holder 高度是跟着 previewScale 算出来的，无脑写回容易自激。
      const next = Math.round(entries[0].contentRect.width);

      if (next !== paneWidth.value) {
        paneWidth.value = next;
      }
    });
    paneObserver.observe(scrollEl.value);
    paneWidth.value = scrollEl.value.clientWidth;
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('message', onWindowMessage);
  window.removeEventListener('beforeunload', syncFromFrameNow);
  window.removeEventListener('resize', updateWorkHeight);
  paneObserver?.disconnect();
  syncFromFrameNow();
  persistSource(htmlSource.value);
  popupWindow = null;
});
</script>

<template>
  <div class="html-editor-root">
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

    <div ref="gridEl" class="grid gap-4" :class="mode === 'source' ? 'lg:grid-cols-2' : 'mode-visual-grid'">
      <!-- 用 v-show 而不是 v-if：切换模式时不能把编辑器卸载掉，否则撤销历史和滚动位置全丢 -->
      <div v-show="mode === 'source'">
        <div class="mb-1 text-xs op-60">{{ t('tools.html-editor.texts.label-source-code') }}</div>
        <CodeBlockCopyable
          v-model:value="htmlSource"
          language="html"
          editable
          copy-placement="none"
          :max-height="`${workHeight}px`"
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

      <aside v-if="mode === 'visual'" class="style-panel" :style="{ maxHeight: `${workHeight}px` }">
        <template v-if="hasSelection">
          <div class="style-panel-head">
            <code class="style-tag" data-test-id="style-selected-tag">{{ selectedTag }}</code>
            <div class="flex shrink-0 items-center gap-1">
              <n-popconfirm @positive-click="resetSelectedStyles">
                <template #trigger>
                  <n-button size="tiny" quaternary data-test-id="style-reset">
                    {{ t('tools.html-editor.texts.button-reset-styles') }}
                  </n-button>
                </template>
                {{ t('tools.html-editor.texts.confirm-reset-styles') }}
              </n-popconfirm>

              <n-popconfirm @positive-click="removeSelectedElement">
                <template #trigger>
                  <n-button size="tiny" quaternary type="error" data-test-id="style-remove">
                    {{ t('tools.html-editor.texts.button-remove-element') }}
                  </n-button>
                </template>
                {{ t('tools.html-editor.texts.confirm-remove-element') }}
              </n-popconfirm>
            </div>
          </div>

          <div class="style-path" data-test-id="style-path">
            <template v-for="(label, index) in selectedPath" :key="`${index}-${label}`">
              <span v-if="index > 0" class="style-path-sep">›</span>
              <button
                type="button"
                class="style-path-item"
                :class="{ 'is-current': index === selectedPath.length - 1 }"
                @click="selectPathIndex(index)"
              >
                {{ label }}
              </button>
            </template>
          </div>

          <div class="style-fields">
            <label class="style-row">
              <span class="style-label">{{ t('tools.html-editor.texts.style-background-color') }}</span>
              <span class="style-control">
                <input
                  class="style-swatch"
                  type="color"
                  :value="styleValues.backgroundColor || '#ffffff'"
                  @change="applyStyle('background-color', ($event.target as HTMLInputElement).value)"
                >
                <input
                  class="style-text"
                  type="text"
                  data-test-id="style-background-color"
                  :placeholder="t('tools.html-editor.texts.style-value-unset')"
                  :value="styleValues.backgroundColor"
                  @change="applyStyle('background-color', ($event.target as HTMLInputElement).value)"
                >
              </span>
            </label>

            <label class="style-row">
              <span class="style-label">{{ t('tools.html-editor.texts.style-color') }}</span>
              <span class="style-control">
                <input
                  class="style-swatch"
                  type="color"
                  :value="styleValues.color || '#000000'"
                  @change="applyStyle('color', ($event.target as HTMLInputElement).value)"
                >
                <input
                  class="style-text"
                  type="text"
                  data-test-id="style-color"
                  :placeholder="t('tools.html-editor.texts.style-value-unset')"
                  :value="styleValues.color"
                  @change="applyStyle('color', ($event.target as HTMLInputElement).value)"
                >
              </span>
            </label>

            <label class="style-row">
              <span class="style-label">{{ t('tools.html-editor.texts.style-font-size') }}</span>
              <span class="style-control">
                <input
                  class="style-range"
                  type="range"
                  data-test-id="style-font-size"
                  :min="FONT_SIZE_MIN"
                  :max="FONT_SIZE_MAX"
                  :value="styleValues.fontSize"
                  @input="previewFontSize(Number(($event.target as HTMLInputElement).value))"
                  @change="applyFontSize(Number(($event.target as HTMLInputElement).value))"
                >
                <span class="style-unit">{{ styleValues.fontSize }} px</span>
              </span>
            </label>

            <label class="style-row">
              <span class="style-label">{{ t('tools.html-editor.texts.style-font-weight') }}</span>
              <span class="style-control">
                <select
                  class="style-select"
                  data-test-id="style-font-weight"
                  :value="styleValues.fontWeight"
                  @change="applyStyle('font-weight', ($event.target as HTMLSelectElement).value)"
                >
                  <option value="400">{{ t('tools.html-editor.texts.style-weight-normal') }}</option>
                  <option value="700">{{ t('tools.html-editor.texts.style-weight-bold') }}</option>
                </select>
              </span>
            </label>

            <label class="style-row">
              <span class="style-label">{{ t('tools.html-editor.texts.style-text-align') }}</span>
              <span class="style-control">
                <select
                  class="style-select"
                  data-test-id="style-text-align"
                  :value="styleValues.textAlign"
                  @change="applyStyle('text-align', ($event.target as HTMLSelectElement).value)"
                >
                  <option value="left">{{ t('tools.html-editor.texts.style-align-left') }}</option>
                  <option value="center">{{ t('tools.html-editor.texts.style-align-center') }}</option>
                  <option value="right">{{ t('tools.html-editor.texts.style-align-right') }}</option>
                  <option value="justify">{{ t('tools.html-editor.texts.style-align-justify') }}</option>
                </select>
              </span>
            </label>

            <button type="button" class="style-group-toggle" data-test-id="style-box-toggle" @click="boxOpen = !boxOpen">
              <span class="style-caret">{{ boxOpen ? '▾' : '▸' }}</span>
              {{ t('tools.html-editor.texts.style-box-group') }}
            </button>

            <div v-show="boxOpen" class="style-box-groups">
              <div v-for="group in BOX_GROUPS" :key="group">
                <div class="style-box-title">
                  {{ group === 'padding' ? t('tools.html-editor.texts.style-padding') : t('tools.html-editor.texts.style-margin') }}
                </div>
                <div class="style-box-sides">
                  <label v-for="field in boxSideLabels" :key="`${group}-${field.side}`" class="style-box-side">
                    <span>{{ field.label }}</span>
                    <input
                      type="number"
                      min="0"
                      :max="BOX_VALUE_MAX"
                      :data-test-id="`style-${group}-${field.side}`"
                      :value="styleValues[group][field.side]"
                      @change="applyBoxSide(group, field.side, Number(($event.target as HTMLInputElement).value))"
                    >
                  </label>
                </div>
              </div>
            </div>
          </div>
        </template>

        <p v-else class="style-empty" data-test-id="style-empty">
          {{ t('tools.html-editor.texts.style-empty-hint') }}
        </p>
      </aside>
    </div>
  </div>
</template>

<style scoped>
/* 宽屏下突破工具页的 1200px 容器：编辑区每宽一点，桌面档预览的缩放比就高一档
   （1920 屏列宽 592 → 792，缩放 46% → 62%）。flex-basis 天然是「不超过可用宽度」，
   窄屏不会溢出，所以不需要媒体查询。
   类名重复一次是为了压过父级的 `.tool-content > :deep(*) { flex: 0 1 1200px }` ——
   那条规则和单类选择器特异性相同，靠样式注入顺序分胜负太不稳。 */
.html-editor-root.html-editor-root {
  flex: 0 1 min(1600px, 100%);
}

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
  border: 1px solid v-bind('themeVars.borderColor');
  border-radius: 6px;
}

/* ——— 编辑模式的样式面板 ——— */
/* 视觉模式下面板与预览并排：预览仍是主体，面板只占固定一列；窄屏自动堆到预览下方 */
.mode-visual-grid {
  display: grid;
  gap: 1rem;
}

@media (min-width: 1024px) {
  .mode-visual-grid {
    grid-template-columns: minmax(0, 1fr) 288px;
  }
}

.style-panel {
  align-self: start;
  max-height: 620px;
  overflow-y: auto;
  padding: 10px;
  border: 1px solid v-bind('themeVars.borderColor');
  border-radius: 6px;
  font-size: 12px;
}

.style-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 1px solid v-bind('themeVars.borderColor');
}

.style-tag {
  overflow: hidden;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 面包屑：档位缩放后小元素点不准，靠它从父级直接跳到想改的那一层 */
.style-path {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  margin-bottom: 10px;
}

.style-path-sep {
  opacity: 0.45;
}

.style-path-item {
  padding: 1px 3px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font-size: 11px;
  opacity: 0.7;
  cursor: pointer;
}

.style-path-item:hover,
.style-path-item.is-current {
  background: rgba(24, 160, 88, 0.14);
  opacity: 1;
}

.style-fields {
  display: grid;
  gap: 8px;
}

.style-row {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  align-items: center;
  gap: 6px;
}

.style-label {
  font-size: 11px;
  opacity: 0.72;
}

.style-control {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
}

.style-swatch {
  flex: none;
  width: 28px;
  height: 24px;
  padding: 0;
  border: 1px solid v-bind('themeVars.borderColor');
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
}

.style-text,
.style-select,
.style-box-side input {
  min-width: 0;
  height: 24px;
  padding: 0 6px;
  border: 1px solid v-bind('themeVars.borderColor');
  border-radius: 4px;
  background: v-bind('themeVars.cardColor');
  color: inherit;
  font-size: 11px;
}

.style-text,
.style-select {
  flex: 1;
}

.style-range {
  flex: 1;
  min-width: 0;
  accent-color: v-bind('themeVars.primaryColor');
}

.style-unit {
  flex: none;
  font-size: 11px;
  opacity: 0.6;
}

.style-group-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
  padding-top: 8px;
  border: 0;
  border-top: 1px solid v-bind('themeVars.borderColor');
  background: transparent;
  color: inherit;
  font-size: 11px;
  opacity: 0.72;
  cursor: pointer;
}

.style-box-groups {
  display: grid;
  gap: 10px;
}

.style-box-title {
  margin-bottom: 4px;
  font-size: 11px;
  opacity: 0.6;
}

.style-box-sides {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 4px;
}

.style-box-side {
  display: grid;
  gap: 2px;
  font-size: 11px;
  opacity: 0.72;
}

.style-box-side input {
  width: 100%;
  padding: 0 4px;
  text-align: center;
}

.style-empty {
  font-size: 12px;
  line-height: 1.7;
  opacity: 0.65;
}
</style>
