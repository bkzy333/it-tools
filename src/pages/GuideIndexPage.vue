<script lang="ts" setup>
/**
 * 教程列表页 /guide。
 *
 * 之前缺这一层：12 篇文章各自有静态页，却没有一个汇总入口，爬虫只能从首页那几条链接
 * 进来，用户也找不到栏目目录。这里把它补上。
 *
 * 数据和两处同源：
 *  - 标题顺序来自 src/seo/guide-index.ts（构建期写静态 HTML 用的是同一份）
 *  - 描述来自每篇 md 自己的 frontmatter（运行时走 import.meta.glob 懒加载）
 * 两边都读同样的地方，不会出现静态版和用户版说法不一样的情况。
 */
import { computed, ref } from 'vue';
import { useHead } from '@vueuse/head';
import { loadAllGuideMeta, type GuideFrontmatter } from '@/seo/guides';

const SITE_NAME = '在线工具箱';

const guides = ref<GuideFrontmatter[]>([]);
const loading = ref(true);

// 每篇 md 都是独立懒加载 chunk，12 个并行请求量很小，只有进这个列表页才会发
loadAllGuideMeta().then((metas) => {
  guides.value = metas;
  loading.value = false;
});

const title = computed(() => `开发教程 - ${SITE_NAME}`);
const description = computed(
  () =>
    `收录 ${guides.value.length} 篇面向开发者的实用教程：JWT、Base64、UUID、cron 表达式、Unix 时间戳、正则表达式、HTTP 状态码、哈希算法、WCAG 对比度等，配合本站在线工具一起看效果。`,
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
  <div class="guide-index-page">
    <nav class="seo-crumbs">
      <router-link to="/">首页</router-link>
      <span class="sep">/</span>
      <span>教程</span>
    </nav>

    <h1>开发教程</h1>

    <p class="guide-lead">
      这里汇集了 {{ guides.length }} 篇写给开发者的实用教程。每篇都对应本站的真实工具，看完可以直接在线试，不用装环境。
    </p>

    <div v-if="loading" class="hint">加载中…</div>

    <ul v-else class="guide-list">
      <li v-for="item in guides" :key="item.slug">
        <router-link class="guide-link" :to="`/guide/${item.slug}`">{{ item.title }}</router-link>
        <p v-if="item.description" class="guide-desc">{{ item.description }}</p>
      </li>
    </ul>
  </div>
</template>

<style lang="less" scoped>
.guide-index-page {
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

h1 {
  font-size: 27px;
  font-weight: 600;
  margin: 0 0 14px;
  line-height: 1.4;
}

.guide-lead {
  font-size: 15px;
  line-height: 1.85;
  margin: 0 0 24px;
  opacity: 0.85;
}

.guide-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;

  li {
    padding-bottom: 18px;
    border-bottom: 1px solid rgba(128, 128, 128, 0.18);

    &:last-child {
      border-bottom: none;
    }
  }
}

.guide-link {
  font-size: 17px;
  font-weight: 600;
  color: inherit;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
}

.guide-desc {
  font-size: 14px;
  line-height: 1.8;
  margin: 6px 0 0;
  opacity: 0.7;
}
</style>
