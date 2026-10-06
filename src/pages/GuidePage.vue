<script lang="ts" setup>
/**
 * 教程文章页 /guide/<slug>。
 *
 * 和 CategoryPage 同理：构建期已经为每篇文章生成了静态 HTML，前端必须有一个渲染同样
 * 内容的路由，否则 Vue 挂载后静态正文会被 NotFound 顶掉，形成 cloaking。
 * 正文、标题锚点、目录、上一篇/下一篇全部来自 src/seo/guide-render.ts 和 md 原文，
 * 和构建期逐字同源 —— 不要在这里另写一套文案。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useHead } from '@vueuse/head';
import { useThemeVars } from 'naive-ui';
import { useToolStore } from '@/tools/tools.store';
import { loadGuide, type LoadedGuide } from '@/seo/guides';
import { GUIDE_INDEX } from '@/seo/guide-index';
import type { GuideTocItem } from '@/seo/guide-render';

const route = useRoute();
const toolStore = useToolStore();
const themeVars = useThemeVars();

const SITE_NAME = '在线工具箱';

const guide = ref<LoadedGuide | null>(null);
const loading = ref(true);
const activeAnchor = ref('');

async function load(slug: string) {
  loading.value = true;
  guide.value = await loadGuide(slug);
  loading.value = false;
  await nextTick();
  observeHeadings();
}

load(String(route.params.slug ?? ''));

// 站内从一篇教程跳到另一篇时，路由参数变了但组件不重建
watch(
  () => route.params.slug,
  (slug) => load(String(slug ?? '')),
);

const title = computed(() => (guide.value ? `${guide.value.front.title} - ${SITE_NAME}` : SITE_NAME));
const description = computed(() => guide.value?.front.description ?? '');

useHead({
  title,
  meta: [
    { name: 'description', content: description } as never,
    { property: 'og:title', content: title } as never,
    { property: 'og:description', content: description } as never,
  ],
});

/** 相关工具要显示中文标题，path（/jwt-parser）→ name */
const relatedTools = computed(() =>
  (guide.value?.front.relatedTools ?? []).map((path) => ({
    path,
    name: toolStore.tools.find((tool) => tool.path === path)?.name ?? path,
  })),
);

// 上一篇 / 下一篇。顺序必须和构建期（build/seo-prerender.ts 里遍历 GUIDE_INDEX）
// 保持一致，否则静态页和这里的链接会互相打架。
const neighbors = computed(() => {
  const slug = guide.value?.slug ?? '';
  const index = GUIDE_INDEX.findIndex((entry) => entry.slug === slug);
  if (index === -1) {
    return { prev: null, next: null };
  }
  return {
    prev: index > 0 ? GUIDE_INDEX[index - 1] : null,
    next: index < GUIDE_INDEX.length - 1 ? GUIDE_INDEX[index + 1] : null,
  };
});

const toc = computed<GuideTocItem[]>(() => guide.value?.toc ?? []);

// ------------------------------------------------------------------ 目录高亮
// 滚动时把当前读到的小标题在右侧目录里标出来。纯视觉辅助，失败也不影响阅读。
let observer: IntersectionObserver | null = null;

function clearObserver() {
  observer?.disconnect();
  observer = null;
}

function observeHeadings() {
  clearObserver();

  const headings = Array.from(document.querySelectorAll<HTMLElement>('.seo-article h2[id], .seo-article h3[id]'));
  if (headings.length === 0) {
    activeAnchor.value = '';
    return;
  }

  activeAnchor.value = headings[0].id;

  observer = new IntersectionObserver(
    (entries) => {
      // 取所有正在进入视口且位置最靠上的那个标题
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible.length > 0) {
        activeAnchor.value = visible[0].target.id;
      }
    },
    // 顶部留出 navbar 的高度，正文顶部贴着导航时也认得出当前小节
    { rootMargin: '-80px 0px -70% 0px', threshold: 0 },
  );

  for (const heading of headings) {
    observer.observe(heading);
  }
}

onBeforeUnmount(clearObserver);

function scrollToAnchor(anchor: string) {
  const target = document.getElementById(anchor);
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
</script>

<template>
  <div class="guide-page">
    <div v-if="loading" class="hint">加载中…</div>

    <template v-else-if="guide">
      <!-- aria-label 必填：一页里有两个 <nav>（面包屑 + 上下篇），不加以区分的话
           axe 的 landmark-unique 会判违规，屏幕阅读器也分不清这是哪一块。 -->
      <nav class="guide-crumbs seo-crumbs" aria-label="面包屑导航">
        <router-link to="/">首页</router-link>
        <span class="sep">/</span>
        <router-link to="/guide">教程</router-link>
        <span class="sep">/</span>
        <span>{{ guide.front.title }}</span>
      </nav>

      <!-- 目录：构建期生成的静态 HTML 里也有同样一份，给爬虫提供锚点内链 -->
      <aside v-if="toc.length > 0" class="guide-toc" aria-label="本页目录">
        <div class="guide-toc-title">目录</div>
        <ol class="guide-toc-list">
          <li
            v-for="item in toc"
            :key="item.anchor"
            class="guide-toc-item"
            :class="[`is-level-${item.level}`, { 'is-active': activeAnchor === item.anchor }]"
          >
            <a class="guide-toc-link" :href="`#${item.anchor}`" @click.prevent="scrollToAnchor(item.anchor)">
              {{ item.text }}
            </a>
          </li>
        </ol>
      </aside>

      <div class="guide-main">
        <!-- 正文由 markdown-it 渲染，内容来自仓库里的 md 文件，不含用户输入 -->
        <div class="seo-article" v-html="guide.html" />

        <nav v-if="neighbors.prev || neighbors.next" class="guide-neighbors" aria-label="上下篇导航">
          <router-link v-if="neighbors.prev" class="seo-tag" :to="`/guide/${neighbors.prev.slug}`">
            ← {{ neighbors.prev.title }}
          </router-link>
          <router-link v-if="neighbors.next" class="seo-tag" :to="`/guide/${neighbors.next.slug}`">
            {{ neighbors.next.title }} →
          </router-link>
        </nav>

        <template v-if="relatedTools.length > 0">
          <h2>相关工具</h2>
          <div class="seo-tags">
            <router-link v-for="tool in relatedTools" :key="tool.path" class="seo-tag" :to="tool.path">
              {{ tool.name }}
            </router-link>
          </div>
        </template>
      </div>
    </template>
  </div>
</template>

<style lang="less" scoped>
.guide-page {
  max-width: 1080px;
  margin: 0 auto;
  padding: 32px 16px 60px;
  box-sizing: border-box;

  display: grid;
  grid-template-columns: minmax(0, 1fr) 220px;
  grid-template-areas:
    'crumbs crumbs'
    'main   toc';
  gap: 0 32px;
  align-items: start;
}

.guide-crumbs {
  grid-area: crumbs;
}

.guide-main {
  grid-area: main;
  min-width: 0;
}

.guide-toc {
  grid-area: toc;
  position: sticky;
  top: 80px;
  max-height: calc(100vh - 120px);
  overflow-y: auto;
  font-size: 13px;

  .guide-toc-title {
    font-weight: 600;
    margin-bottom: 10px;
    opacity: 0.75;
  }

  .guide-toc-list {
    list-style: none;
    padding: 0;
    margin: 0;

    .guide-toc-item {
      border-left: 2px solid transparent;
      padding-left: 10px;
      margin-bottom: 6px;
      line-height: 1.5;

      &.is-level-3 {
        padding-left: 22px;
      }

      &.is-active {
        border-left-color: v-bind('themeVars.primaryColor');
      }
    }

    .guide-toc-link {
      color: inherit;
      text-decoration: none;
      opacity: 0.65;

      &:hover {
        opacity: 1;
        text-decoration: underline;
      }
    }

    .is-active .guide-toc-link {
      opacity: 1;
      font-weight: 600;
      color: v-bind('themeVars.primaryColor');
    }
  }
}

// 窄屏没有并排的空间，目录落到正文下方，避免把文章内容挤成一条线
@media (max-width: 1000px) {
  .guide-page {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      'crumbs'
      'main'
      'toc';
  }

  .guide-toc {
    position: static;
    max-height: none;
    margin-top: 36px;
  }
}

.hint {
  font-size: 14px;
  opacity: 0.6;
}

.seo-crumbs {
  font-size: 13px;
  margin-bottom: 18px;
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

.guide-neighbors {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: space-between;
  margin: 32px 0 8px;
}

.seo-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.seo-tag {
  display: inline-block;
  padding: 5px 12px;
  border: 1px solid rgba(128, 128, 128, 0.35);
  border-radius: 999px;
  font-size: 13px;
  color: inherit;
  text-decoration: none;

  &:hover {
    background-color: rgba(128, 128, 128, 0.12);
  }
}
</style>

<style lang="less" scoped>
// v-html 渲染出来的标签不在 scoped 作用域内，用 :deep 穿透
.seo-article {
  // 长 URL / 长 token 没有断行机会时会把整页撑宽，兜底允许任意位置断行
  overflow-wrap: break-word;

  :deep(h1) {
    font-size: 27px;
    font-weight: 600;
    margin: 0 0 14px;
    line-height: 1.4;
  }

  :deep(h2),
  :deep(h3) {
    // 锚点跳转时不要让标题被吸顶的导航栏盖住
    scroll-margin-top: 80px;
  }

  :deep(h2) {
    font-size: 20px;
    font-weight: 600;
    margin: 32px 0 10px;
    line-height: 1.4;
  }

  :deep(h3) {
    font-size: 17px;
    font-weight: 600;
    margin: 24px 0 8px;
  }

  :deep(p),
  :deep(li) {
    font-size: 15px;
    line-height: 1.85;
    margin: 0 0 12px;
    opacity: 0.88;
  }

  :deep(ul),
  :deep(ol) {
    padding-left: 22px;
    margin: 0 0 14px;
  }

  :deep(code) {
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 13.5px;
    padding: 2px 5px;
    border-radius: 4px;
    background-color: rgba(128, 128, 128, 0.16);
  }

  :deep(pre) {
    overflow-x: auto;
    max-width: 100%;
    padding: 14px 16px;
    border-radius: 8px;
    background-color: rgba(128, 128, 128, 0.12);
    margin: 0 0 16px;

    code {
      background: none;
      padding: 0;
    }
  }

  // 表格在窄屏上是教程页横向溢出的主因：列宽压不下去，会把整页撑宽（实测 375px 视口
  // 下 scrollWidth 到 412）。改成块级滚动容器，表格自己横向滚，页面不再跟着滚。
  :deep(table) {
    display: block;
    width: 100%;
    max-width: 100%;
    overflow-x: auto;
    border-collapse: collapse;
    margin: 0 0 16px;
    font-size: 14px;
  }

  :deep(th),
  :deep(td) {
    border: 1px solid rgba(128, 128, 128, 0.28);
    padding: 7px 10px;
    text-align: left;
  }

  :deep(blockquote) {
    margin: 0 0 16px;
    padding: 2px 0 2px 14px;
    border-left: 3px solid rgba(128, 128, 128, 0.4);
    opacity: 0.85;
  }

  :deep(a) {
    color: inherit;
    text-decoration: underline;
  }
}
</style>
