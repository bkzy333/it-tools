import { get } from '@vueuse/core';
import { merge } from 'es-toolkit/compat';
import type { Plugin } from 'vue';
import { watch } from 'vue';
import { createI18n } from 'vue-i18n';

const FALLBACK_LOCALE = 'en';
// 默认语言改为中文（仍可用构建环境变量 VITE_LANGUAGE 覆盖）
const DEFAULT_APP_LOCALE = 'zh';
// 记住用户手动切换的语言（上游原版没有持久化，刷新会丢失）
const LOCALE_STORAGE_KEY = 'it-tools-locale';

// The fallback locale (and its tool-level files) is bundled eagerly so the app always has
// complete messages at startup; every other locale is compiled into its own lazy chunk and
// only fetched the first time it becomes the active locale.
const eagerToolMessages = import.meta.glob('../tools/*/locales/en.yml', { eager: true, import: 'default' });

// 默认语言的 base 语言包**也必须 eager**，原因不是性能而是正确性：
// src/tools/index.ts 用 `import.meta.glob('./*/index.ts', { eager: true })` 让所有工具模块
// 在应用启动的**同步阶段**求值，而每个 index.ts 顶层就调用 `t('tools.xxx.title')` 拼
// name/description。那一刻如果只有 en 语言包（zh 还躺在异步 chunk 里），这些名字会被
// **永久冻结成英文**，再经 src/router.ts 写进 route.meta.name，工具页 h1 和
// ToolUsageGuide 的标题就一直是英文 —— 而 build/seo-prerender.ts 产出的静态 HTML 是中文，
// 爬虫和用户看到的内容不一致，正是 AdSense cloaking 的判定形态。
//
// 代价可忽略：zh.yml 本来就几乎每个访客都要下载，eager 只是把它从"异步 chunk 拉取"
// 换成"内联进主包"，不是净增，还顺带消掉了首屏的英文闪烁。
// 注意：这里写死了 en + zh。如果哪天把 VITE_LANGUAGE 改成别的语言，必须把该语言的
// base 语言包也加进这个 glob，否则又会退回"工具名英文"的状态。
const eagerBaseMessages = import.meta.glob(['../../locales/en.yml', '../../locales/zh.yml'], {
  eager: true,
  import: 'default',
});
const lazyBaseMessages = import.meta.glob(['../../locales/*.yml', '!../../locales/en.yml', '!../../locales/zh.yml'], {
  import: 'default',
});
const lazyToolMessages = import.meta.glob(['../tools/*/locales/*.yml', '!../tools/*/locales/en.yml'], {
  import: 'default',
});

function localeOfPath(path: string): string {
  return path.replace(/^.*\/([^/]+)\.yml$/, '$1');
}

const EAGER_LOCALES = Object.keys(eagerBaseMessages).map(localeOfPath);

// Cast: es-toolkit's merge infers a deeply recursive mapped type from the full message
// tree, which makes vue-i18n's generics exceed TS's instantiation depth.
const enMessages = merge({}, eagerBaseMessages['../../locales/en.yml'], ...Object.values(eagerToolMessages)) as Record<
  string,
  unknown
>;

const allLocales = [
  ...new Set([FALLBACK_LOCALE, ...EAGER_LOCALES, ...Object.keys(lazyBaseMessages).map(localeOfPath)]),
].sort();

// 优先级：用户上次选择的语言 > 构建环境变量 VITE_LANGUAGE > 默认中文
function getInitialLocale(): string {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored && allLocales.includes(stored)) {
      return stored;
    }
  }

  const configured = String(import.meta.env.VITE_LANGUAGE || DEFAULT_APP_LOCALE);
  return allLocales.includes(configured) ? configured : FALLBACK_LOCALE;
}

const DEFAULT_LOCALE = getInitialLocale();

// VITE_AVAILABLE_LOCALES filters which locales the app offers; unlisted locale chunks are
// still emitted at build time but never fetched.
export const appLocales = (() => {
  const available = String(import.meta.env.VITE_AVAILABLE_LOCALES || '*');
  if (available === '*' || available === 'all') {
    return allLocales;
  }
  const wantedLocales = available.split(',').map((locale) => locale.trim());
  return allLocales.filter((locale) => wantedLocales.includes(locale) || locale === FALLBACK_LOCALE);
})();

// 启动时就把"回退语言 + 当前默认语言"的完整语言包装进 messages，工具模块随后同步求值时
// 才能拿到正确的翻译（见文件上方 eagerBaseMessages 的说明）。
const initialMessages: Record<string, any> = { [FALLBACK_LOCALE]: enMessages };

for (const locale of EAGER_LOCALES) {
  // en 已经在 initialMessages 里了，只需要再补上"当前默认语言"那一份
  if (locale === FALLBACK_LOCALE || locale !== DEFAULT_LOCALE) {
    continue;
  }

  initialMessages[locale] = merge(
    {},
    eagerBaseMessages[`../../locales/${locale}.yml`],
    ...Object.entries(eagerToolMessages)
      .filter(([path]) => localeOfPath(path) === locale)
      .map(([, messages]) => messages),
  );
}

const i18n = createI18n({
  legacy: false,
  locale: DEFAULT_LOCALE,
  fallbackLocale: FALLBACK_LOCALE,
  fallbackWarn: false,
  missingWarn: false,
  // Cast: without the unplugin-vue-i18n type shim (absent in tsconfig.vitest.json)
  // vue-i18n's generics reject runtime-shaped message records.
  messages: initialMessages,
});

// 已经进主包的语言不再需要异步加载，否则会白跑一次网络请求再覆盖同样的内容
const loadedLocales = new Set(Object.keys(initialMessages));

/** 把某个语言的消息挂进 i18n 实例。工具级文件目前一个都没有，但保持和 base 一样可叠加 */
function applyMessages(locale: string, ...parts: unknown[]) {
  i18n.global.setLocaleMessage(locale, merge({}, ...parts) as Record<string, unknown>);
  loadedLocales.add(locale);
}

export async function loadLocaleMessages(locale: string) {
  if (loadedLocales.has(locale)) {
    return;
  }

  const toolOverrides = Object.entries(eagerToolMessages)
    .filter(([path]) => localeOfPath(path) === locale)
    .map(([, messages]) => messages);

  // 已经随主包进来的语言（en 和启动时的默认语言）只是"还没挂到当前 locale 上"，
  // 直接用内存里那份，别去 lazyBaseMessages 里找一个必然不存在的 loader
  const eagerBase = eagerBaseMessages[`../../locales/${locale}.yml`];
  if (eagerBase) {
    applyMessages(locale, eagerBase, ...toolOverrides);
    return;
  }

  const loaders = [
    lazyBaseMessages[`../../locales/${locale}.yml`],
    ...Object.entries(lazyToolMessages)
      .filter(([path]) => localeOfPath(path) === locale)
      .map(([, loader]) => loader),
  ].filter(Boolean);

  if (loaders.length === 0) {
    return;
  }

  const messageParts = await Promise.all(loaders.map((loader) => loader()));
  applyMessages(locale, ...messageParts);
}

export const i18nPlugin: Plugin = {
  install: (app) => {
    app.use(i18n);
    // Messages arrive after the switch; vue-i18n falls back to English until
    // setLocaleMessage triggers a reactive re-render. Watching through the getter
    // avoids depending on vue-i18n's locale ref generics.
    watch(
      () => getCurrentLocale(),
      (locale) => {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(LOCALE_STORAGE_KEY, locale);
        }
        return loadLocaleMessages(locale);
      },
      { immediate: true },
    );
  },
};

export function getCurrentLocale(): string {
  return get(i18n.global.locale);
}

export const translate = i18n.global.t as typeof i18n.global.t;
