import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createHead } from '@vueuse/head';
import { LoadingPlugin } from 'vue-loading-overlay';

import { installAbortSignalPolyfill } from 'abort-signal-polyfill';

import shadow from 'vue-shadow-dom';
import { plausible } from './plugins/plausible.plugin';
import { appBaseUrl } from '@/utils/base-url';
import '@/utils/json5-bigint';
import '@/utils/json5-bignum';

import Vue3Katex from 'vue3-katex';
import 'katex/dist/katex.min.css';

import 'virtual:uno.css';

import { naive } from './plugins/naive.plugin';

import App from './App.vue';
import router from './router';
import { i18nPlugin } from './plugins/i18n.plugin';
import { toolsSettings } from './tools-settings';

window.addEventListener('vite:preloadError', (event: Event) => {
  console.error('Vite preload error, forcing page reload:', event);
  event.preventDefault(); // Prevent the original error from being thrown again
  // Deferred: Firefox also fires this event for preloads cancelled by a user
  // navigation, and an immediate reload would race (and abort) that navigation.
  // If the page is really navigating away, its timers die with it and no reload
  // happens; on a genuine chunk-load failure the reload still runs.
  setTimeout(() => window.location.reload(), 100);
});

installAbortSignalPolyfill();

// Not `registerSW()` from virtual:pwa-register. With a relative build base it hands
// workbox-window a relative `./sw.js`, and while the browser resolves that against our
// `<base href>` correctly, workbox-window's own bookkeeping resolves it against
// `location.href` instead (urlsMatch() in workbox-window). On a route one level deeper
// than the app root the two disagree, workbox mistakes its own worker for an external one
// and reloads the page under the user. Every route is a single segment today, so nothing
// is broken right now; registering by absolute URL just takes the trap away.
//
// What that costs us is the update handling `registerType: 'autoUpdate'` would have wired
// up, so it is reimplemented below.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // The worker calls skipWaiting()/clientsClaim() (see vite.config.ts), so a newly deployed
  // one takes over this page while it is still showing the previous build. Reload when that
  // happens -- otherwise the tab keeps running the old bundle until it navigates, and any
  // lazily imported chunk it reaches for has already been swept from the cache. A first
  // install claims the page too, and must not reload: only a *replacement* means the page
  // and its worker have diverged.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloading) {
      reloading = true;
      window.location.reload();
    }
  });

  const registerServiceWorker = () => {
    navigator.serviceWorker
      .register(`${appBaseUrl}sw.js`, { scope: appBaseUrl })
      .catch((error) => console.error('Service worker registration failed:', error));
  };

  // Registering competes with the page's own loading, so it waits for `load` -- but this
  // module sits behind top-level awaits (the config fetches in tools-settings.ts and
  // tools/index.ts), so `load` has usually fired long before we get here and waiting for
  // it again would mean never registering at all.
  if (document.readyState === 'complete') {
    registerServiceWorker();
  } else {
    window.addEventListener('load', registerServiceWorker, { once: true });
  }
}

const app = createApp(App);

app.config.globalProperties.$itToolsSettings = toolsSettings;

app.use(LoadingPlugin);
app.use(createPinia());
app.use(createHead());
app.use(i18nPlugin);
app.use(router);
app.use(naive);
app.use(plausible);
app.use(shadow);
app.use(Vue3Katex);

app.mount('#app');

// naive-ui 的 <n-card title="..."> 把标题渲染成 <div role="heading">，但**不带 aria-level**。
// role="heading" 没有 aria-level 时，axe 的 aria-required-attr 会直接判违规（「关于」页一页 14 处）。
// 这在语义上也是真缺陷：屏幕阅读器只知道"这是个标题"，不知道它是几级。
// 卡片标题在页面结构里就是二级标题（页面 H1 已存在），这里统一补上。
// 只监听 childList 不监听 attributes，所以补 aria-level 不会把观察者自己再触发一次。
function patchHeadingLevels() {
  const apply = () => {
    for (const el of document.querySelectorAll<HTMLElement>('[role="heading"]:not([aria-level])')) {
      el.setAttribute('aria-level', '2');
    }
  };

  apply();
  new MutationObserver(apply).observe(document.body, { childList: true, subtree: true });
}

// naive-ui 的图标组件渲染成 <i role="img">，但不给 alt/aria-label。
// 这些图标在界面上永远是装饰性的：旁边一定有文字，或者父级 button/a 上已经有
// aria-label（首页一页 78 处违规就是这么来的）。声明 role="img" 却不给替代文本，
// 比直接 aria-hidden 更糟 —— 屏幕阅读器会读出一个"空的图片"。这里统一标记为装饰。
// 只处理既无 aria-label 也无 alt 的，避免误伤真的有意义图形的图标。
function markDecorativeIcons() {
  const apply = () => {
    for (const el of document.querySelectorAll<HTMLElement>('[role="img"]')) {
      if (!el.getAttribute('aria-label') && !el.getAttribute('alt') && !el.textContent.trim()) {
        el.setAttribute('aria-hidden', 'true');
      }
    }
  };

  apply();
  new MutationObserver(apply).observe(document.body, { childList: true, subtree: true });
}

patchHeadingLevels();
markDecorativeIcons();
