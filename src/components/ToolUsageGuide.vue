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

const route = useRoute();
const toolStore = useToolStore();
const themeVars = useThemeVars();

// 工具名和描述取自 store（已按当前语言翻译），避免直接引用 route.meta 里的英文原名
const currentTool = computed(() => toolStore.tools.find((tool) => tool.path === route.path));

const toolName = computed(() => currentTool.value?.name ?? String(route.meta.name ?? ''));
const toolDescription = computed(() => currentTool.value?.description ?? String(route.meta.description ?? ''));

// 有的工具会联网（汇率、AI 模型等），这类工具不能宣称「不上传服务器」
const runsOnlyLocally = computed(() => !route.meta.externAccessDescription);

// 登记过的工具显示定制文案，没登记的用工具自身的名称 + 描述拼装，
// 避免出现 400 个页面共用一段完全相同的话（会被搜索引擎判为低质重复内容）。
// L1 深度页走 src/seo/content，其余回退到旧的 tool-usage.ts
const deep = computed(() => getToolContent(route.path));
const usage = computed(() => deep.value ?? getToolUsage(route.path));

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
  const currentIndex = all.findIndex((tool) => tool.path === route.path);
  if (currentIndex === -1) {
    return [];
  }
  const current = all[currentIndex];

  // 同类目优先，不足 6 个时用固定步长在全部工具里补齐（确定性取值，保证每次抓取一致）
  const sameCategory = all.filter((tool) => tool.category === current.category && tool.path !== current.path);
  const result = [...sameCategory];
  for (let i = 1; result.length < 6 && i < all.length; i++) {
    const candidate = all[(currentIndex + i * 7) % all.length];
    if (candidate.path !== current.path && !result.some((tool) => tool.path === candidate.path)) {
      result.push(candidate);
    }
  }
  return result.slice(0, 6);
});
</script>

<template>
  <div class="usage-guide">
    <div class="usage-block">
      <h2>{{ toolName }}是什么</h2>
      <p>{{ intro }}</p>
      <p v-if="runsOnlyLocally" class="hint">本工具在你的浏览器本地运行，输入的内容不会上传到服务器。</p>
    </div>

    <div class="usage-block">
      <h2>怎么用{{ toolName }}</h2>
      <ol>
        <li v-for="(step, index) in steps" :key="index">{{ step }}</li>
      </ol>
    </div>

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

    <div v-if="tips.length > 0" class="usage-block">
      <h2>小提示</h2>
      <ul>
        <li v-for="(tip, index) in tips" :key="index">{{ tip }}</li>
      </ul>
    </div>

    <div v-if="relatedTools.length > 0" class="usage-block">
      <h2>相关工具</h2>
      <div class="related-list">
        <RouterLink v-for="tool in relatedTools" :key="tool.path" :to="tool.path" class="related-item">
          {{ tool.name }}
        </RouterLink>
      </div>
    </div>
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
