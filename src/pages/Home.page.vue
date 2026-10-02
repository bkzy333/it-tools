<script setup lang="ts">
import IconDragDrop from '~icons/tabler/drag-drop';
import IconHeart from '~icons/tabler/heart';
import { useHead } from '@vueuse/head';
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import Draggable from 'vuedraggable';
import ColoredCard from '../components/ColoredCard.vue';
import ToolCard from '../components/ToolCard.vue';
import HomeCustom from './Home.custom.vue';
import { useToolStore } from '@/tools/tools.store';
import { fetchGlobalHotTools, getMostUsedPaths } from '@/composable/toolUsage';
import type { ToolWithCategory } from '@/tools/tools.types';
import { config } from '@/config';
import { categoryMeta } from '@/seo/categories';
import { GUIDE_INDEX } from '@/seo/guide-index';

const { t } = useI18n();

const toolStore = useToolStore();

// 精选热门工具：面向大众、上手即用的一类，新访客也能一眼看到。
// 想调整顺序或增删，直接改这个数组；值是 src/tools/<目录>/index.ts 里的 path，
// 少数工具的 path 和目录名不一致（例如目录 json-viewer 的 path 是 /json-prettify）。
const POPULAR_TOOL_PATHS = [
  '/qrcode-generator', // 二维码生成器
  '/pdf-compressor', // PDF 压缩
  '/image-converter', // 图片格式转换
  '/remove-background', // 去除图片背景
  '/bmi-calculator', // BMI 计算
  '/percentage-calculator', // 百分比计算
  '/date-duration-calculator', // 日期间隔计算
  '/currency-converter', // 货币换算
  '/base64-string-converter', // Base64 编解码
  '/url-encoder', // URL 编解码
  '/json-prettify', // JSON 格式化
  '/password-strength-analyser', // 密码强度检测
];

const findTool = (path: string) => toolStore.tools.find((tool) => tool.path === path);

// 全站真实排行（来自 /api/hot + KV）。为空表示接口不可用或还没有数据。
const globalHotPaths = ref<string[]>([]);

const popularTools = computed<ToolWithCategory[]>(() => {
  // 全站排行优先；不足 12 个时用精选热门补齐，保证这个区块永远有内容
  const paths = [...globalHotPaths.value];
  for (const path of POPULAR_TOOL_PATHS) {
    if (paths.length >= 12) {
      break;
    }
    if (!paths.includes(path)) {
      paths.push(path);
    }
  }
  return paths.slice(0, 12).map(findTool).filter(Boolean) as ToolWithCategory[];
});

// 本机访问次数最多的工具（没有访问记录时为空，区块自动隐藏）
const mostUsedTools = computed<ToolWithCategory[]>(
  () => getMostUsedPaths(8).map(findTool).filter(Boolean) as ToolWithCategory[],
);
const desc = t(
  'home.page.text.collection-of-handy-online-tools-for-developers-with-great-ux-it-tools-is-a-free-and-open-source-collection-of-handy-online-tools-for-developers-and-people-working-in-it',
);
const title = t('home.page.text.it-tools-handy-online-tools-for-developers');

useHead({
  title,
  meta: [
    {
      itemprop: 'name',
      content: title,
    } as never,
    {
      property: 'og:title',
      content: title,
    },
    {
      property: 'twitter:title',
      content: title,
    },
    {
      name: 'description',
      content: desc,
    },
    {
      itemprop: 'description',
      content: desc,
    } as never,
    {
      property: 'og:description',
      content: desc,
    },
    {
      property: 'twitter:description',
      content: desc,
    },
  ],
});

// 分类导航：构建期生成的静态首页里也有这两个区块，Vue 挂载后如果没了，
// 渲染型爬虫就抓不到通往 /category/* 和 /guide/* 的内链，聚合页和教程页会成为孤岛。
const categories = computed(() => {
  const counts = new Map<string, number>();
  for (const tool of toolStore.tools) {
    counts.set(tool.category, (counts.get(tool.category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count, meta: categoryMeta(category) }))
    .sort((a, b) => a.meta.slug.localeCompare(b.meta.slug));
});

const guides = GUIDE_INDEX;

const favoriteTools = computed(() => toolStore.favoriteTools);
const isOrderingFavorites = ref(false);

window.addEventListener('contextmenu', (e) => {
  if (isOrderingFavorites.value) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    return false;
  }
});

function startOrderingFavorites() {
  isOrderingFavorites.value = true;
}

// Update favorite tools order when drag is finished
function stopOrderingFavorites() {
  isOrderingFavorites.value = false;
  toolStore.updateFavoriteTools(favoriteTools.value); // Update the store with the new order
}

// Batch loading logic for tool cards
const TOOLS_PER_ROW = 4; // Based on xl:grid-cols-4
const ROWS_PER_BATCH = 6;
const TOOLS_PER_BATCH = TOOLS_PER_ROW * ROWS_PER_BATCH; // 32 tools per batch

const visibleToolsCount = ref(TOOLS_PER_BATCH); // Start with first batch
let loadingObserver: IntersectionObserver | null = null;

// Computed property for visible tools
const visibleTools = computed(() => {
  return toolStore.tools.slice(0, visibleToolsCount.value);
});

// Function to load next batch
function loadNextBatch() {
  if (visibleToolsCount.value < toolStore.tools.length) {
    visibleToolsCount.value = Math.min(visibleToolsCount.value + TOOLS_PER_BATCH, toolStore.tools.length);
  }
}

// Start intersection observer on component mount
onMounted(() => {
  // 拉全站热门排行；失败或没数据时 globalHotPaths 保持为空，自动回退到精选热门
  fetchGlobalHotTools(12).then((paths) => {
    if (paths.length > 0) {
      globalHotPaths.value = paths;
    }
  });

  nextTick(() => {
    // Load first batch immediately
    loadNextBatch();

    // Setup intersection observer for lazy loading
    const loadingIndicator = document.querySelector('[data-loading-indicator]');
    if (loadingIndicator) {
      loadingObserver = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting && visibleToolsCount.value < toolStore.tools.length) {
            loadNextBatch();
          }
        },
        { rootMargin: '200px' },
      );
      loadingObserver.observe(loadingIndicator);
    }
  });
});

// Clean up on component unmount
onUnmounted(() => {
  if (loadingObserver) {
    loadingObserver.disconnect();
    loadingObserver = null;
  }
});
</script>

<template>
  <div class="home-content pt-50px">
    <div class="grid-wrapper">
      <div class="grid grid-cols-1 gap-12px lg:grid-cols-3 md:grid-cols-3 sm:grid-cols-2 xl:grid-cols-4">
        <ColoredCard v-if="config.showBanner" :title="$t('home.follow.title')" :icon="IconHeart">
          {{ $t('home.follow.p1') }}
          <a
            href="https://github.com/sharevb/it-tools"
            rel="noopener"
            target="_blank"
            :aria-label="$t('home.follow.githubRepository')"
            >GitHub</a
          >
          {{ $t('home.follow.thankYou') }}
          <n-icon :component="IconHeart" />
        </ColoredCard>
      </div>

      <transition name="height">
        <div v-if="toolStore.favoriteTools.length > 0">
          <h3 class="mb-5px mt-25px font-500 text-neutral-400">
            {{ $t('home.categories.favoriteTools') }}
            <c-tooltip :tooltip="$t('home.categories.favoritesDndToolTip')">
              <n-icon :component="IconDragDrop" size="18" />
            </c-tooltip>
          </h3>
          <Draggable
            :list="favoriteTools"
            class="grid grid-cols-1 gap-12px lg:grid-cols-3 md:grid-cols-3 sm:grid-cols-2 xl:grid-cols-4"
            ghost-class="ghost-favorites-draggable"
            item-key="name"
            :delay="100"
            @start="startOrderingFavorites"
            @end="stopOrderingFavorites"
          >
            <template #item="{ element: tool }">
              <ToolCard :tool="tool" />
            </template>
          </Draggable>
        </div>
      </transition>

      <div>
        <h3 class="mb-5px mt-25px font-500 text-neutral-400">
          {{ t('home.categories.popularTools', '热门工具') }}
        </h3>
        <div class="grid grid-cols-1 gap-12px lg:grid-cols-3 md:grid-cols-3 sm:grid-cols-2 xl:grid-cols-4">
          <ToolCard v-for="tool in popularTools" :key="tool.name" :tool="tool" />
        </div>
      </div>

      <div v-if="mostUsedTools.length > 0">
        <h3 class="mb-5px mt-25px font-500 text-neutral-400">
          {{ t('home.categories.mostUsedTools', '你常用的工具') }}
        </h3>
        <div class="grid grid-cols-1 gap-12px lg:grid-cols-3 md:grid-cols-3 sm:grid-cols-2 xl:grid-cols-4">
          <ToolCard v-for="tool in mostUsedTools" :key="tool.name" :tool="tool" />
        </div>
      </div>

      <div v-if="toolStore.newTools.length > 0">
        <h3 class="mb-5px mt-25px font-500 text-neutral-400">
          {{ t('home.categories.newestTools') }}
        </h3>
        <div class="grid grid-cols-1 gap-12px lg:grid-cols-3 md:grid-cols-3 sm:grid-cols-2 xl:grid-cols-4">
          <ToolCard v-for="tool in toolStore.newTools" :key="tool.name" :tool="tool" />
        </div>
      </div>

      <div>
        <h3 class="mb-5px mt-25px font-500 text-neutral-400">
          {{ t('home.categories.browseByCategory', '按分类浏览') }}
        </h3>
        <div class="category-chips">
          <router-link v-for="item in categories" :key="item.category" class="chip" :to="`/category/${item.meta.slug}`">
            {{ item.meta.zh }}
            <span class="count">{{ item.count }}</span>
          </router-link>
        </div>
      </div>

      <div>
        <h3 class="mb-5px mt-25px font-500 text-neutral-400">
          {{ t('home.categories.guides', '开发教程') }}
        </h3>
        <ul class="guide-links">
          <li v-for="guide in guides" :key="guide.slug">
            <router-link :to="`/guide/${guide.slug}`">{{ guide.title }}</router-link>
          </li>
        </ul>
      </div>

      <Suspense>
        <HomeCustom />
      </Suspense>

      <h3 class="mb-5px mt-25px font-500 text-neutral-400">
        {{ $t('home.categories.allTools') }}
      </h3>
      <div class="grid grid-cols-1 gap-12px lg:grid-cols-3 md:grid-cols-3 sm:grid-cols-2 xl:grid-cols-4">
        <ToolCard v-for="tool in visibleTools" :key="tool.name" :tool="tool" />
      </div>

      <!-- Loading indicator when more tools are coming -->
      <div v-if="visibleToolsCount < toolStore.tools.length" data-loading-indicator mt-6 text-center>
        <div text-14px op-70>
          {{ t('home.loading-more-tools') }} <span>({{ visibleTools.length }}/{{ toolStore.tools.length }})</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
// The 50px top spacing is a desktop nicety; on mobile it pushes the content
// too far below the top bar.
.home-content {
  @media (max-width: 700px) {
    padding-top: 0;
  }
}

.height-enter-active,
.height-leave-active {
  transition: all 0.5s ease-in-out;
  overflow: hidden;
  max-height: 500px;
}

.height-enter-from,
.height-leave-to {
  max-height: 42px;
  overflow: hidden;
  opacity: 0;
  margin-bottom: 0;
}

.category-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    border: 1px solid rgba(128, 128, 128, 0.35);
    border-radius: 999px;
    font-size: 13px;
    color: inherit;
    text-decoration: none;
    transition: background-color 0.15s;

    &:hover {
      background-color: rgba(128, 128, 128, 0.14);
    }

    .count {
      font-size: 12px;
      opacity: 0.6;
    }
  }
}

.guide-links {
  padding-left: 18px;
  margin: 0;
  columns: 2;
  column-gap: 24px;

  @media (max-width: 700px) {
    columns: 1;
  }

  li {
    font-size: 14px;
    margin-bottom: 6px;
    break-inside: avoid;
  }

  a {
    color: inherit;
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }
}

.ghost-favorites-draggable {
  opacity: 0.4;
  background-color: #ccc;
  border: 2px dashed #666;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.2);
  transform: scale(1.1);
  animation: ghost-favorites-draggable-animation 0.2s ease-out;
}

@keyframes ghost-favorites-draggable-animation {
  0% {
    opacity: 0;
    transform: scale(0.9);
  }
  100% {
    opacity: 0.4;
    transform: scale(1);
  }
}
</style>
