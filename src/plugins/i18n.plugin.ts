import { get } from '@vueuse/core';
import { merge } from 'es-toolkit/compat';
import type { Plugin } from 'vue';
import { watch } from 'vue';
import { createI18n } from 'vue-i18n';
import enBaseMessages from '../../locales/en.yml';

const FALLBACK_LOCALE = 'en';
// 默认语言改为中文（仍可用构建环境变量 VITE_LANGUAGE 覆盖）
const DEFAULT_APP_LOCALE = 'zh';
// 记住用户手动切换的语言（上游原版没有持久化，刷新会丢失）
const LOCALE_STORAGE_KEY = 'it-tools-locale';

// The fallback locale (and its tool-level files) is bundled eagerly so the app always has
// complete messages at startup; every other locale is compiled into its own lazy chunk and
// only fetched the first time it becomes the active locale.
const eagerToolMessages = import.meta.glob('../tools/*/locales/en.yml', { eager: true, import: 'default' });
const lazyBaseMessages = import.meta.glob(['../../locales/*.yml', '!../../locales/en.yml'], { import: 'default' });
const lazyToolMessages = import.meta.glob(['../tools/*/locales/*.yml', '!../tools/*/locales/en.yml'], {
  import: 'default',
});

function localeOfPath(path: string): string {
  return path.replace(/^.*\/([^/]+)\.yml$/, '$1');
}

// Cast: es-toolkit's merge infers a deeply recursive mapped type from the full message
// tree, which makes vue-i18n's generics exceed TS's instantiation depth.
const enMessages = merge({}, enBaseMessages, ...Object.values(eagerToolMessages)) as Record<string, unknown>;

const allLocales = [FALLBACK_LOCALE, ...Object.keys(lazyBaseMessages).map(localeOfPath)].sort();

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

const i18n = createI18n({
  legacy: false,
  locale: DEFAULT_LOCALE,
  fallbackLocale: FALLBACK_LOCALE,
  fallbackWarn: false,
  missingWarn: false,
  // Cast: without the unplugin-vue-i18n type shim (absent in tsconfig.vitest.json)
  // vue-i18n's generics reject runtime-shaped message records.
  messages: { [FALLBACK_LOCALE]: enMessages } as Record<string, any>,
});

const loadedLocales = new Set([FALLBACK_LOCALE]);

export async function loadLocaleMessages(locale: string) {
  if (loadedLocales.has(locale)) {
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
  i18n.global.setLocaleMessage(locale, merge({}, ...messageParts));
  loadedLocales.add(locale);
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
