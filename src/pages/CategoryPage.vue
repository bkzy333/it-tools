<script lang="ts" setup>
/**
 * 分类聚合页 /category/<slug>。
 *
 * 存在的原因：构建期会为每个分类生成一份静态 HTML 给搜索引擎看；如果前端没有对应
 * 路由，Vue 挂载后会把静态正文替换成 NotFound，用户点进来看到「页面不存在」，
 * 而爬虫看到的是另一套内容 —— 这正是 AdSense 判定的 cloaking。所以这个组件必须
 * 和 build/seo-prerender.ts 里的 renderCategoryPage() 输出同样的内容。
 *
 * 工具列表直接取 toolStore.tools，不额外打包 tools-meta.json。
 */
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useHead } from '@vueuse/head';
import { useToolStore } from '@/tools/tools.store';
import { findCategory, categoryMeta } from '@/seo/categories';
import type { ToolWithCategory } from '@/tools/tools.types';

const route = useRoute();
const toolStore = useToolStore();

const SITE_NAME = '在线工具箱';

const found = computed(() => findCategory(String(route.params.slug ?? '')));

const category = computed(() => found.value?.category ?? '');
const meta = computed(() => found.value?.meta ?? categoryMeta(''));

const tools = computed<ToolWithCategory[]>(() =>
  category.value ? toolStore.tools.filter((tool) => tool.category === category.value) : [],
);

const title = computed(() =>
  tools.value.length > 0
    ? `${meta.value.seo} - ${tools.value.length} 个免费工具 - ${SITE_NAME}`
    : `${meta.value.seo} - ${SITE_NAME}`,
);

const description = computed(
  () => `${meta.value.seo}，共 ${tools.value.length} 个免费在线工具，全部浏览器本地运行，无需注册。`,
);

useHead({
  title,
  meta: [
    { name: 'description', content: description } as never,
    { property: 'og:title', content: title } as never,
    { property: 'og:description', content: description } as never,
  ],
});
</script>

<template>
  <div v-if="found" class="category-page">
    <nav class="seo-crumbs">
      <router-link to="/">首页</router-link>
      <span class="sep">/</span>
      <span>{{ meta.zh }}</span>
    </nav>

    <h1>{{ meta.seo }}</h1>
    <p class="seo-lead">
      {{ meta.zh }}分类共收录 {{ tools.length }} 个免费在线工具，全部在浏览器里运行，不用注册、不用安装，打开网页就能用。
    </p>

    <h2>全部{{ meta.zh }}工具（{{ tools.length }} 个）</h2>
    <ul class="tool-list">
      <li v-for="tool in tools" :key="tool.path">
        <router-link :to="tool.path">{{ tool.name }}</router-link>
        <span class="dash"> — </span>
        <span>{{ tool.description }}</span>
      </li>
    </ul>

    <h2>关于{{ meta.zh }}</h2>
    <p>
      这一页汇总了本站所有{{ meta.zh }}相关的工具。每个工具点进去都能直接使用，处理过程在浏览器本地完成，输入的数据不会上传到服务器。
    </p>
  </div>
</template>

<style lang="less" scoped>
.category-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 32px 16px 60px;
  box-sizing: border-box;
  line-height: 1.8;

  h1 {
    font-size: 26px;
    font-weight: 600;
    margin: 0 0 10px;
  }

  h2 {
    font-size: 19px;
    font-weight: 600;
    margin: 30px 0 10px;
  }

  p {
    font-size: 15px;
    margin: 0 0 10px;
    opacity: 0.85;
  }
}

.seo-crumbs {
  font-size: 13px;
  margin-bottom: 14px;
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

.seo-lead {
  font-size: 15px;
}

.tool-list {
  padding-left: 20px;
  margin: 0;

  li {
    font-size: 15px;
    margin-bottom: 6px;
  }

  a {
    color: inherit;
    font-weight: 500;
  }

  .dash {
    opacity: 0.6;
  }
}
</style>
