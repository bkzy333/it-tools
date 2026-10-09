<script setup lang="ts">
import { computed, ref } from 'vue';
import { CaretDown, CaretRight } from '@vicons/tabler';

// 递归可折叠 JSON 树节点。
// 行为规格对齐 json.cn（jquery.json.js，MIT/GPL 双许可，见 _recon-json/）：
// - `{}`/`[]` 前有折叠图标，展开态显示向下箭头，点击折叠成 Object{...} / Array[N]
// - 键名、字符串、数字、布尔、null 分别着色
// - 字符串以 http:// 或 https:// 开头时渲染成可点击链接

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

const props = withDefaults(
  defineProps<{
    value: JsonValue;
    name?: string;
    depth?: number;
    expanded?: boolean;
  }>(),
  {
    // 注意：Boolean prop 不传时 Vue 默认给 false（Boolean casting），
    // 必须用 withDefaults 显式给 true，否则 `props.expanded ?? true` 永远拿到 false
    expanded: true,
  },
);

defineOptions({ name: 'JsonTree' });

const isOpen = ref(props.expanded ?? true);

const isContainer = computed(() => {
  const v = props.value;
  return v !== null && typeof v === 'object';
});

const isArray = computed(() => Array.isArray(props.value));

const childCount = computed(() => {
  const v = props.value;
  if (Array.isArray(v)) {
    return v.length;
  }
  if (v !== null && typeof v === 'object') {
    return Object.keys(v).length;
  }
  return 0;
});

const entries = computed<{ key: string; value: JsonValue }[]>(() => {
  const v = props.value;
  if (Array.isArray(v)) {
    return v.map((item, index) => ({ key: String(index), value: item }));
  }
  if (v !== null && typeof v === 'object') {
    return Object.entries(v).map(([key, value]) => ({ key, value }));
  }
  return [];
});

function toggle() {
  isOpen.value = !isOpen.value;
}

const valueType = computed<'string' | 'number' | 'boolean' | 'null'>(() => {
  const v = props.value;
  if (v === null) {
    return 'null';
  }
  return typeof v as 'string' | 'number' | 'boolean';
});

const isLink = computed(() => {
  const v = props.value;
  return typeof v === 'string' && /^https?:\/\//.test(v);
});

const displayString = computed(() => (typeof props.value === 'string' ? props.value : ''));
</script>

<template>
  <div class="json-tree-node">
    <!-- 容器节点（对象/数组）：带折叠图标 -->
    <div v-if="isContainer" class="json-tree-container">
      <span class="json-tree-toggle" @click="toggle">
        <n-icon v-if="isOpen" :component="CaretDown" size="14" />
        <n-icon v-else :component="CaretRight" size="14" />
      </span>
      <span v-if="name !== undefined" class="json-tree-key">{{ name }}</span>
      <span v-if="name !== undefined" class="json-tree-colon">: </span>

      <!-- 折叠态：显示 Object{...} / Array[N] -->
      <span v-if="!isOpen" class="json-tree-folded" @click="toggle">
        <template v-if="isArray">Array[<span class="json-tree-count">{{ childCount }}</span>]</template>
        <template v-else>Object{...}</template>
      </span>

      <!-- 展开态 -->
      <template v-else>
        <span class="json-tree-bracket">{{ isArray ? '[' : '{' }}</span>
        <div class="json-tree-children">
          <JsonTree
            v-for="entry in entries"
            :key="entry.key"
            :name="entry.key"
            :value="entry.value"
            :depth="(depth ?? 0) + 1"
          />
        </div>
        <span class="json-tree-bracket">{{ isArray ? ']' : '}' }}</span>
      </template>
    </div>

    <!-- 叶子节点（原始值） -->
    <div v-else class="json-tree-leaf">
      <span v-if="name !== undefined" class="json-tree-key">{{ name }}</span>
      <span v-if="name !== undefined" class="json-tree-colon">: </span>
      <a v-if="isLink" :href="displayString" target="_blank" rel="noopener" class="json-tree-string json-tree-link">
        "{{ displayString }}"
      </a>
      <span v-else-if="valueType === 'string'" class="json-tree-string">"{{ displayString }}"</span>
      <span v-else-if="valueType === 'number'" class="json-tree-number">{{ value }}</span>
      <span v-else-if="valueType === 'boolean'" class="json-tree-boolean">{{ value }}</span>
      <span v-else class="json-tree-null">null</span>
    </div>
  </div>
</template>

<style scoped>
.json-tree-node {
  font-family: var(--font-mono, 'JetBrains Mono', 'Fira Code', Consolas, monospace);
  font-size: 13px;
  line-height: 1.6;
}

.json-tree-container,
.json-tree-leaf {
  white-space: nowrap;
}

.json-tree-children {
  margin-left: 1.25em;
  border-left: 1px solid var(--border-color, #e5e5e5);
  padding-left: 0.75em;
}

.json-tree-toggle {
  display: inline-block;
  width: 16px;
  cursor: pointer;
  user-select: none;
  color: var(--text-color-secondary, #888);
  vertical-align: middle;
}

.json-tree-toggle:hover {
  color: var(--primary-color, #18a058);
}

.json-tree-key {
  color: #92278f;
  font-weight: 600;
}

.json-tree-colon {
  color: var(--text-color-secondary, #888);
}

.json-tree-string {
  color: #3a8a3a;
}

.json-tree-number {
  color: #1a7fbf;
}

.json-tree-boolean {
  color: #e08e0b;
  font-weight: 600;
}

.json-tree-null {
  color: #f1592a;
  font-weight: 600;
}

.json-tree-bracket {
  color: var(--text-color, #333);
}

.json-tree-count {
  color: #1a7fbf;
  font-weight: 600;
}

.json-tree-folded {
  cursor: pointer;
  color: var(--text-color-secondary, #666);
  font-style: italic;
}

.json-tree-link {
  text-decoration: underline;
  cursor: pointer;
}

.json-tree-link:hover {
  color: var(--primary-color, #18a058);
}
</style>
