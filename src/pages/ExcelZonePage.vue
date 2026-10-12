<script lang="ts" setup>
/**
 * Excel 专区聚合页 /excel。
 *
 * 和 build/seo-prerender.ts 的 renderExcelZonePage() 用同一份过滤逻辑
 * （tools.tags 含 'excel'），工具集合必须一致，否则算 cloaking。
 *
 * 场景化 Tab 把专区内的工具分成「文件操作 / 数据清洗 / 计算」三档，再在卡片上用
 * 视觉区分「浏览器上传文件」类（Excel 绿）与「复制粘贴即可」类（浅灰），降低认知负荷。
 */
import { computed, ref } from 'vue';
import { useHead } from '@vueuse/head';
import { useToolStore } from '@/tools/tools.store';
import type { ToolWithCategory } from '@/tools/tools.types';

const toolStore = useToolStore();

const SITE_NAME = '在线工具箱';

// 每个工具归属哪个场景 Tab（仅用于分区展示，不影响归类）
const TAB_MAP: Record<string, 'file' | 'clean' | 'calc'> = {
  'excel-merge-workbooks': 'file',
  'excel-cell-merge': 'file',
  'excel-cell-unmerge': 'file',
  'text-extract': 'clean',
  'text-dedupe': 'clean',
  // 2026-10-13：原 'text-join' 已合并进 'text-merge'（两者核心功能重复）
  'text-merge': 'clean',
  'text-split': 'clean',
  'number-rounding': 'clean',
  'csv-to-json': 'clean',
  'json-to-csv': 'clean',
  'markdown-table-generator': 'clean',
  'sequence-generator': 'clean',
  'rmb-numbers': 'clean',
  'table-pivot': 'calc',
  'table-transpose': 'calc',
  'table-lookup': 'calc',
};

type TabKey = 'all' | 'file' | 'clean' | 'calc';

const excelTools = computed<ToolWithCategory[]>(() =>
  toolStore.tools.filter((t) => (t.tags ?? []).includes('excel')),
);

const nativeTools = computed(() => excelTools.value.filter((t) => (t.tags ?? []).includes('excel-native')));
const auxTools = computed(() => excelTools.value.filter((t) => !(t.tags ?? []).includes('excel-native')));

const activeTab = ref<TabKey>('all');

const visibleTools = computed<ToolWithCategory[]>(() => {
  if (activeTab.value === 'all') {
    return excelTools.value;
  }
  if (activeTab.value === 'file') {
    return nativeTools.value;
  }
  return auxTools.value.filter((t) => TAB_MAP[t.path.replace(/\//g, '')] === activeTab.value);
});

const tabs: { key: TabKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'file', label: '文件操作' },
  { key: 'clean', label: '数据清洗' },
  { key: 'calc', label: '计算' },
];

const isNative = (tool: ToolWithCategory) => (tool.tags ?? []).includes('excel-native');

useHead({
  title: `Excel 工具箱 - ${SITE_NAME}`,
  meta: [
    {
      name: 'description',
      content:
        'Excel 相关免费在线工具汇总：多工作簿汇总、合并/拆分单元格、文本提取、去重、数值舍入、CSV/JSON 互转等，全部浏览器本地运行，文件不上传服务器。',
    } as never,
  ],
});
</script>

<template>
  <div class="excel-zone">
    <nav class="seo-crumbs">
      <router-link to="/">首页</router-link>
      <span class="sep">/</span>
      <span>Excel 工具箱</span>
    </nav>

    <h1>Excel 工具箱</h1>

    <div class="privacy-banner">
      <span class="lock">🔒</span>
      <span
        >隐私承诺：文件类操作（多工作簿汇总、合并/拆分单元格）全部在你的<strong>浏览器本地</strong>完成，文件<strong>不会上传到任何服务器</strong>；数据清洗类工具支持从
        Excel 直接复制粘贴，结果一键复制回表格。</span
      >
    </div>

    <div class="tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="tab"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="grid">
      <router-link
        v-for="tool in visibleTools"
        :key="tool.path"
        :to="tool.path"
        class="card"
        :class="isNative(tool) ? 'card-native' : 'card-aux'"
      >
        <div class="card-head">
          <span class="card-title">{{ tool.name }}</span>
          <span class="badge" :class="isNative(tool) ? 'badge-native' : 'badge-aux'">
            {{ isNative(tool) ? '上传文件' : '粘贴即可' }}
          </span>
        </div>
        <p class="card-desc">{{ tool.description }}</p>
      </router-link>
    </div>

    <p v-if="visibleTools.length === 0" class="empty">该分类下暂无工具。</p>

    <section class="about">
      <h2>关于 Excel 工具箱</h2>
      <p>
        这一页按使用场景聚合了本站所有和表格处理相关的工具。每一个工具点进去都能直接使用，计算过程在浏览器本地完成，输入的数据不会上传服务器。
      </p>
    </section>
  </div>
</template>

<style lang="less" scoped>
.excel-zone {
  max-width: 1000px;
  margin: 0 auto;
  padding: 32px 16px 60px;
  box-sizing: border-box;
  line-height: 1.8;

  h1 {
    font-size: 28px;
    font-weight: 600;
    margin: 0 0 14px;
  }

  h2 {
    font-size: 19px;
    font-weight: 600;
    margin: 30px 0 10px;
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

.privacy-banner {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  background: color-mix(in srgb, #21a366 12%, transparent);
  border: 1px solid color-mix(in srgb, #21a366 35%, transparent);
  border-radius: 10px;
  padding: 12px 14px;
  font-size: 14px;
  margin-bottom: 18px;

  .lock {
    font-size: 18px;
    line-height: 1.4;
  }

  strong {
    color: #21a366;
  }
}

.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 18px;

  .tab {
    border: 1px solid rgba(128, 128, 128, 0.3);
    background: transparent;
    border-radius: 18px;
    padding: 6px 16px;
    font-size: 14px;
    cursor: pointer;
    color: inherit;

    &.active {
      background: #21a366;
      border-color: #21a366;
      color: #fff;
    }
  }
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
}

.card {
  display: block;
  border-radius: 12px;
  padding: 14px 16px;
  text-decoration: none;
  color: inherit;
  border: 1px solid rgba(128, 128, 128, 0.22);
  background: #fff;
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
  }

  &.card-native {
    border-color: color-mix(in srgb, #21a366 45%, transparent);
    background: color-mix(in srgb, #21a366 6%, #fff);
  }

  &.card-aux {
    background: #f7f8fa;
  }

  .card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 6px;
  }

  .card-title {
    font-size: 16px;
    font-weight: 600;
  }

  .card-desc {
    font-size: 13px;
    margin: 0;
    opacity: 0.78;
    line-height: 1.6;
  }

  .badge {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 10px;
    white-space: nowrap;

    &.badge-native {
      background: #21a366;
      color: #fff;
    }

    &.badge-aux {
      background: rgba(128, 128, 128, 0.18);
      color: #555;
    }
  }
}

.empty {
  opacity: 0.7;
}

.about {
  p {
    font-size: 15px;
    opacity: 0.85;
    margin: 0;
  }
}
</style>
