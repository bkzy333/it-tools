<script lang="ts" setup>
import { useThemeVars } from 'naive-ui';
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { useToolStore } from '@/tools/tools.store';
import { getToolUsage } from '@/tools/tool-usage';
// 和 build/seo-prerender.ts 用的是同一份数据：静态 HTML 里写进去的说明/步骤/示例/FAQ，
// 就是用户在这里看到的这些。两边一旦不同源，就变成了给爬虫和用户看不同内容（cloaking），
// AdSense 会直接判违规 —— 所以不要在这里另写一套文案。
import { getToolContent } from '@/seo/content';
import { getRelatedToolPaths } from '@/seo/related-tools';
import { categoryAllLabel, categoryMeta, categorySlug } from '@/seo/categories';
import { normalizeRoutePath } from '@/seo/route-path';
// 哪些页的说明区默认折叠 —— 和 build/seo-prerender.ts 读的是同一份名单
import { shouldCollapseGuide } from '@/seo/guide-collapse';

const route = useRoute();
const toolStore = useToolStore();
const themeVars = useThemeVars();

// 站内 URL 带尾斜杠（/age-calculator/），而工具 path / content / usage / related
// 四张表的 key 都不带。这里统一剥一次，下面所有查找都用剥过的值 —— 之前每张表
// 各查各的，currentTool 和 related 的守卫漏了规范化，相关工具区块整个不渲染。
const routePath = computed(() => normalizeRoutePath(route.path));

// 工具名和描述取自 store（已按当前语言翻译），避免直接引用 route.meta 里的英文原名
const currentTool = computed(() => toolStore.tools.find((tool) => tool.path === routePath.value));

const toolName = computed(() => currentTool.value?.name ?? String(route.meta.name ?? ''));
const toolDescription = computed(() => currentTool.value?.description ?? String(route.meta.description ?? ''));

// 有的工具会联网（汇率、AI 模型等），这类工具不能宣称「不上传服务器」
const runsOnlyLocally = computed(() => !route.meta.externAccessDescription);

// 登记过的工具显示定制文案，没登记的用工具自身的名称 + 描述拼装，
// 避免出现 400 个页面共用一段完全相同的话（会被搜索引擎判为低质重复内容）。
// L1 深度页走 src/seo/content，其余回退到旧的 tool-usage.ts
const deep = computed(() => getToolContent(routePath.value));
const usage = computed(() => deep.value ?? getToolUsage(routePath.value));

const example = computed(() => deep.value?.example);
const faq = computed(() => deep.value?.faq ?? []);

const intro = computed(
  () =>
    usage.value?.intro ??
    `${toolName.value}是一个免费的在线工具，${toolDescription.value}打开网页就能用，不用下载安装，也不用注册。`,
);

const steps = computed(() => usage.value?.steps ?? ['在页面上方输入或上传你要处理的内容', '按需要调整选项', '结果会实时显示，可直接复制或下载']);

const tips = computed(() => usage.value?.tips ?? []);

const relatedTools = computed(() => {
  const all = toolStore.tools;
  if (!all.some((tool) => tool.path === routePath.value)) {
    return [];
  }

  // 推荐关系取自 src/seo/related-tools.ts —— 和 build/seo-prerender.ts 是同一张表。
  // ⚠️ 这里千万不要另写一套推荐逻辑：静态 HTML 是爬虫看到的版本，运行时是用户看到的版本，
  // 两边一旦算出不同的推荐列表，就等于给爬虫和用户看不同内容（cloaking），AdSense 判违规。
  const paths = getRelatedToolPaths(routePath.value, all);

  // 标题走 store（已按当前语言翻译），不在这里硬编码中文名
  return paths
    .map((p) => all.find((tool) => tool.path === p))
    .filter((tool): tool is NonNullable<typeof tool> => Boolean(tool));
});

// 「同类XX工具」区块：和静态 HTML 里 renderToolPage 末尾那段是同一份内容
// （分类链接 + 同套标签函数），少任何一半都是 cloaking。
const categoryLabel = computed(() => {
  const raw = currentTool.value?.rawCategory ?? '';
  if (!raw) {
    return '';
  }
  // categoryAllLabel 负责「分类名本身已带『工具』时不再拼一个」
  // （否则生活工具会变成「同类生活工具工具」）。
  return categoryAllLabel(categoryMeta(raw));
});
const categoryHref = computed(() => {
  const raw = currentTool.value?.rawCategory ?? '';
  return raw ? `/category/${categorySlug(raw)}` : '';
});

// 「怎么用 / 小提示 / 相关工具 / 同类工具」这四块是长参考内容 + 内链，在部分工具页
// 会把工具本体挤到很下面。名单命中的页面把它们收进 <details>（默认收起），正文仍在
// DOM 里。名单来自 src/seo/guide-collapse.ts —— 静态预渲染读的是同一份，不能各写一套。
const collapseBlocks = computed(() => shouldCollapseGuide(routePath.value));
</script>

<template>
  <div class="usage-guide">
    <div class="usage-block">
      <h2>{{ toolName }}是什么</h2>
      <p>{{ intro }}</p>
      <p v-if="runsOnlyLocally" class="hint">所有计算都在你的浏览器本地完成，输入的内容不会上传到服务器。</p>
    </div>

    <component
      :is="collapseBlocks ? 'details' : 'div'"
      class="usage-block"
      :class="{ 'usage-collapsible': collapseBlocks }"
    >
      <summary v-if="collapseBlocks" class="usage-summary">
        <h2>怎么用{{ toolName }}</h2>
      </summary>
      <h2 v-else>怎么用{{ toolName }}</h2>
      <ol>
        <li v-for="(step, index) in steps" :key="index">{{ step }}</li>
      </ol>
    </component>

    <div v-if="example" class="usage-block">
      <h2>示例</h2>
      <p class="example-label">输入</p>
      <pre class="example-box"><code>{{ example.input }}</code></pre>
      <p class="example-label">输出</p>
      <pre class="example-box"><code>{{ example.output }}</code></pre>
      <p v-if="example.note" class="hint">{{ example.note }}</p>
    </div>

    <div v-if="faq.length > 0" class="usage-block">
      <h2>常见问题</h2>
      <details v-for="(item, index) in faq" :key="index" class="faq-item">
        <summary>{{ item.q }}</summary>
        <p>{{ item.a }}</p>
      </details>
    </div>

    <component
      v-if="tips.length > 0"
      :is="collapseBlocks ? 'details' : 'div'"
      class="usage-block"
      :class="{ 'usage-collapsible': collapseBlocks }"
    >
      <summary v-if="collapseBlocks" class="usage-summary">
        <h2>小提示</h2>
      </summary>
      <h2 v-else>小提示</h2>
      <ul>
        <li v-for="(tip, index) in tips" :key="index">{{ tip }}</li>
      </ul>
    </component>

    <component
      v-if="relatedTools.length > 0"
      :is="collapseBlocks ? 'details' : 'div'"
      class="usage-block"
      :class="{ 'usage-collapsible': collapseBlocks }"
    >
      <summary v-if="collapseBlocks" class="usage-summary">
        <h2>相关工具</h2>
      </summary>
      <h2 v-else>相关工具</h2>
      <div class="related-list">
        <RouterLink v-for="tool in relatedTools" :key="tool.path" :to="tool.path" class="related-item">
          {{ tool.name }}
        </RouterLink>
      </div>
    </component>

    <component
      v-if="categoryLabel"
      :is="collapseBlocks ? 'details' : 'div'"
      class="usage-block"
      :class="{ 'usage-collapsible': collapseBlocks }"
    >
      <summary v-if="collapseBlocks" class="usage-summary">
        <h2>同类{{ categoryLabel }}</h2>
      </summary>
      <h2 v-else>同类{{ categoryLabel }}</h2>
      <div class="related-list">
        <RouterLink :to="categoryHref" class="related-item">查看全部{{ categoryLabel }}</RouterLink>
      </div>
    </component>
  </div>
</template>

<style lang="less" scoped>
.usage-guide {
  max-width: 800px;
  margin: 40px auto 0;
  padding: 0 12px;
  box-sizing: border-box;

  h2 {
    font-size: 17px;
    font-weight: 600;
    margin: 0 0 10px;
    opacity: 0.9;
  }

  p,
  li {
    line-height: 1.8;
    font-size: 14px;
    opacity: 0.8;
  }

  p {
    margin: 0 0 8px;
  }

  ol,
  ul {
    margin: 0;
    padding-left: 20px;
  }

  .hint {
    font-size: 13px;
    opacity: 0.6;
  }
}

.example-label {
  margin: 0 0 4px;
  font-size: 13px;
  opacity: 0.7;
}

.example-box {
  background: rgba(128, 128, 128, 0.08);
  border: 1px solid rgba(128, 128, 128, 0.18);
  border-radius: 8px;
  padding: 10px 12px;
  overflow-x: auto;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
  margin: 0 0 12px;
  white-space: pre-wrap;
  word-break: break-all;
}

.faq-item {
  border: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: 8px;
  padding: 10px 14px;
  margin-bottom: 10px;

  summary {
    cursor: pointer;
    font-weight: 500;
    font-size: 15px;
  }

  p {
    margin: 8px 0 0;
  }
}

.usage-block {
  margin-bottom: 28px;
}

// 默认折叠的块：标题变成可点的 summary。
// 箭头用浏览器原生 marker（和下面 FAQ 的折叠箭头同一套外观），不自己画 ::before ——
// 自绘的空心三角在 12px / 半透明下缩成一个小点，看不出是能点的。
.usage-collapsible {
  > summary {
    margin-bottom: 10px;
    cursor: pointer;

    h2 {
      display: inline;
      margin: 0;
    }

    &:hover h2 {
      opacity: 1;
      color: v-bind('themeVars.primaryColor');
    }
  }
}

.related-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.related-item {
  display: inline-block;
  padding: 6px 12px;
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 16px;
  font-size: 13px;
  text-decoration: none;
  color: inherit;
  opacity: 0.8;
  transition: all 0.2s ease;

  &:hover {
    opacity: 1;
    border-color: v-bind('themeVars.primaryColor');
    color: v-bind('themeVars.primaryColor');
  }
}
</style>
