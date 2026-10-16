<script lang="ts" setup>
import DeviceDesktop from '~icons/tabler/device-desktop';
import World from '~icons/tabler/world';

import { useRoute } from 'vue-router';
import { useHead } from '@vueuse/head';
import type { HeadObject } from '@vueuse/head';

// Async: keeps markdown-it (~50 KB gzip with its dependency tree) out of the
// startup bundle; it loads with the first tool page instead.
const VueMarkdown = defineAsyncComponent(() => import('vue-markdown-render'));

import { useThemeVars } from 'naive-ui';
import { watch } from 'vue';
import { useTheme } from '../ui/c-link/c-link.theme';
import FavoriteButton from '@/components/FavoriteButton.vue';
import { recordToolVisit, reportToolVisit } from '@/composable/toolUsage';
import { useToolStore } from '@/tools/tools.store';
import { toolMetaDescription } from '@/seo/content';
import { categorySlug } from '@/seo/categories';
import { normalizeRoutePath } from '@/seo/route-path';
import type { Tool } from '@/tools/tools.types';

const route = useRoute();
const toolStore = useToolStore();
const { t } = useI18n();

// 站内 URL 带尾斜杠（/age-calculator/），而工具表 / i18n key 都不带。
// 这里统一剥一次：之前 i18nKey 用 route.path.trim().replace('/', '') 只替掉了第一个斜杠，
// 剩下的尾斜杠让 tools.age-calculator/.title 这种键全部查空、静默走 meta 兜底；
// FavoriteButton 拿到带斜杠的 path 当存储键，侧栏收藏列表按 path 反查不到，收藏直接丢。
const routePath = computed(() => normalizeRoutePath(route.path));

// 打开工具页：本机计数（「你常用的工具」）+ 上报服务端（全站「热门工具」）
watch(
  () => route.path,
  (path) => {
    recordToolVisit(path);
    reportToolVisit(path);
  },
  { immediate: true },
);

const i18nKey = computed<string>(() => routePath.value.replace(/\//g, ''));
const toolTitle = computed<string>(() => t(`tools.${i18nKey.value}.title`, String(route.meta.name)));
const toolDescription = computed<string>(() => t(`tools.${i18nKey.value}.description`, String(route.meta.description)));
const currentTool = computed(() => toolStore.tools.find((tool) => tool.path === routePath.value));
const categoryZh = computed<string>(() => currentTool.value?.category ?? '');
const categoryHref = computed<string>(() => {
  const raw = currentTool.value?.rawCategory ?? '';
  return raw ? `/category/${categorySlug(raw)}` : '';
});

// meta description 必须和静态 HTML 同源：L1 深耕页用正文 intro 截断，L2/L3 用工具自身描述。
// 之前运行时只写 route.meta.description（ locales 短句），静态用 intro 截断，90 个 L1 页两套话。
const metaDescription = computed<string>(() => toolMetaDescription(routePath.value, toolDescription.value));

const head = computed<HeadObject>(() => ({
  title: `${route.meta.name} - 在线工具箱`,
  meta: [
    {
      itemprop: 'name',
      content: `${route.meta.name} - 在线工具箱`,
    },
    {
      property: 'og:title',
      content: `${route.meta.name} - 在线工具箱`,
    },
    {
      property: 'twitter:title',
      content: `${route.meta.name} - 在线工具箱`,
    },
    {
      name: 'description',
      content: metaDescription.value,
    },
    {
      itemprop: 'description',
      content: metaDescription.value,
    },
    {
      property: 'og:description',
      content: metaDescription.value,
    },
    {
      property: 'twitter:description',
      content: metaDescription.value,
    },
    {
      name: 'keywords',
      content: ((route.meta.keywords ?? []) as string[]).join(','),
    },
  ],
}));
useHead(head);

const toolFooter = computed<string>(() => {
  const createLink = (linkText: string, url: string) => {
    return `[${linkText.replace('[', '\\[').replace(']', '\\]')}](${url.replace('(', '%28').replace(')', '%29')})`;
  };
  let footer = t(`tools.${i18nKey.value}.footer`, String(route.meta.footer));
  if (footer === 'undefined') {
    footer = '';
  }
  const npmPackages = ((route.meta.npmPackages as string[]) || []).map((packageName) =>
    createLink(packageName, packageName.includes('://') ? packageName : `https://www.npmjs.com/package/${packageName}`),
  );
  return (
    (npmPackages.length > 0 ? `${t('tools.tool.layout.text.made-with-npmpackages', [npmPackages.join(', ')])}\n` : '') +
    footer
  ).trim();
});
const themeVars = useThemeVars();

const linkTheme = useTheme();
</script>

<template>
  <div class="tool-layout">
    <!-- 面包屑：静态 HTML 的 #seo-static 里有一份一模一样的（首页 / 分类 / 工具名），
         运行时补上，避免爬虫和用户看到的两页内容不一致（cloaking）。 -->
    <nav v-if="categoryZh" class="seo-crumbs" aria-label="面包屑">
      <router-link to="/">首页</router-link>
      <span class="sep">/</span>
      <router-link :to="categoryHref">{{ categoryZh }}</router-link>
      <span class="sep">/</span>
      <span>{{ toolTitle }}</span>
    </nav>

    <div class="tool-header">
      <div flex flex-nowrap items-center justify-between>
        <n-h1>
          {{ toolTitle }}
          <n-tooltip placement="right" trigger="click" content-class="tool-privacy-info">
            <template #trigger>
              <World v-if="route.meta.externAccessDescription" class="tool-privacy-icon" />
              <DeviceDesktop v-else class="tool-privacy-icon" />
            </template>
            <VueMarkdown
              v-if="route.meta.externAccessDescription"
              :source="route.meta.externAccessDescription as string"
              :options="{ linkify: true }"
            />
            <template v-else>
              {{ $t('tools.tool.layout.text.runs-entirely-in-your-browser-no-external-requests') }}
            </template>
          </n-tooltip>
        </n-h1>

        <div flex items-center>
          <FavoriteButton :tool="{ name: route.meta.name, path: routePath } as Tool" />
          <tool-feedback-button />
        </div>
      </div>

      <div class="separator" />

      <div class="description">
        {{ toolDescription }}
      </div>
    </div>
  </div>

  <div class="tool-content">
    <Suspense>
      <slot />
    </Suspense>
  </div>

  <div class="tool-footer">
    <VueMarkdown :source="toolFooter" />
  </div>

  <!-- 使用说明 + 相关工具内链（利于 SEO 与用户留存） -->
  <tool-usage-guide />

  <!-- 谷歌广告位：工具页底部（接入前 ADS_ENABLED=false，不渲染任何内容） -->
  <ads-placeholder variant="tool-bottom" />
</template>

<style lang="less">
.tool-privacy-info {
  p {
    margin: 0;
  }
  a {
    color: inherit !important;
    font-style: italic;
  }
}
</style>

<style lang="less" scoped>
.tool-privacy-icon {
  display: inline-block;
  height: 0.6em;
}
.tool-content {
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 16px;
  overflow-x: auto;

  > :deep(*) {
    flex: 0 1 1200px;
    min-width: 0;
  }
}

.tool-layout {
  max-width: 1200px;
  margin: 0 auto;
  box-sizing: border-box;

  .seo-crumbs {
    font-size: 13px;
    margin: 24px 0 14px;
    opacity: 0.7;

    a {
      color: inherit;
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }
    }

    .sep {
      margin: 0 6px;
    }
  }

  .tool-header {
    padding: 40px 0;
    width: 100%;

    .n-h1 {
      opacity: 0.9;
      font-size: 40px;
      font-weight: 400;
      margin: 0;
      line-height: 1;
    }

    .separator {
      width: '100%';
      height: 2px;
      background: rgb(161, 161, 161);
      opacity: 0.2;

      margin: 10px 0;
    }

    .description {
      margin: 0;

      opacity: 0.7;
    }
  }
}
.tool-footer {
  opacity: 0.7;
  font-size: 12px;
  text-align: center;

  ::v-deep(a) {
    color: v-bind('themeVars.textColor1');
    font-style: italic;
  }
}
::v-deep(.external-tool) a {
  line-height: inherit;
  font-family: inherit;
  font-size: inherit;
  border: none;
  cursor: pointer;
  text-decoration: none;
  font-weight: 400;
  color: v-bind('linkTheme.default.textColor');
  border-radius: 4px;
  transition: color cubic-bezier(0.4, 0, 0.2, 1) 0.3s;

  outline-offset: 1px;

  &:hover {
    color: v-bind('linkTheme.default.hover.textColor');
  }

  &:active {
    color: v-bind('linkTheme.default.textColor');
  }

  &:focus {
    color: v-bind('linkTheme.default.outline.color');
  }
}
</style>
