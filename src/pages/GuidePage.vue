<script lang="ts" setup>
/**
 * 教程文章页 /guide/<slug>。
 *
 * 和 CategoryPage 同理：构建期已经为每篇文章生成了静态 HTML，前端必须有一个渲染同样
 * 内容的路由，否则 Vue 挂载后静态正文会被 NotFound 顶掉，形成 cloaking。
 * 正文直接用 markdown-it 渲染 src/seo/guides/<slug>.md，和构建期同源。
 */
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useHead } from '@vueuse/head';
import { useToolStore } from '@/tools/tools.store';
import { loadGuide, type LoadedGuide } from '@/seo/guides';

const route = useRoute();
const toolStore = useToolStore();

const SITE_NAME = '在线工具箱';

const guide = ref<LoadedGuide | null>(null);
const loading = ref(true);

async function load(slug: string) {
  loading.value = true;
  guide.value = await loadGuide(slug);
  loading.value = false;
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
</script>

<template>
  <div class="guide-page">
    <div v-if="loading" class="hint">加载中…</div>

    <template v-else-if="guide">
      <nav class="seo-crumbs">
        <router-link to="/">首页</router-link>
        <span class="sep">/</span>
        <span>教程</span>
        <span class="sep">/</span>
        <span>{{ guide.front.title }}</span>
      </nav>

      <!-- 正文由 markdown-it 渲染，内容来自仓库里的 md 文件，不含用户输入 -->
      <div class="seo-article" v-html="guide.html" />

      <template v-if="relatedTools.length > 0">
        <h2>相关工具</h2>
        <div class="seo-tags">
          <router-link v-for="tool in relatedTools" :key="tool.path" class="seo-tag" :to="tool.path">
            {{ tool.name }}
          </router-link>
        </div>
      </template>
    </template>
  </div>
</template>

<style lang="less" scoped>
.guide-page {
  max-width: 820px;
  margin: 0 auto;
  padding: 32px 16px 60px;
  box-sizing: border-box;
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

// v-html 渲染出来的标签不在 scoped 作用域内，用 :deep 穿透
.seo-article {
  :deep(h1) {
    font-size: 27px;
    font-weight: 600;
    margin: 0 0 14px;
    line-height: 1.4;
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
    padding: 14px 16px;
    border-radius: 8px;
    background-color: rgba(128, 128, 128, 0.12);
    margin: 0 0 16px;

    code {
      background: none;
      padding: 0;
    }
  }

  :deep(table) {
    width: 100%;
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
