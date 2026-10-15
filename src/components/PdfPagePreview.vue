<script setup lang="ts">
import { ref } from 'vue';
import { IconRotateClockwise, IconTrash, IconRestore, IconArrowUp, IconArrowDown } from '@tabler/icons-vue';

export interface PreviewPage {
  /** 稳定 id：原始 1-based 页码，用于与后端对应 */
  id: number;
  dataUrl: string;
  rotation: number;
  deleted: boolean;
  selected: boolean;
  /** 文本状态（文本提取场景用）：text=已有原生文字 / none=尚无文字需OCR / ocr=已OCR识别。缺省不渲染徽标 */
  status?: 'text' | 'none' | 'ocr';
}

const props = withDefaults(
  defineProps<{
    pages: PreviewPage[];
    rotatable?: boolean;
    deletable?: boolean;
    /** 是否显示上下移动按钮（文本提取等不需要重排的场景传 false） */
    movable?: boolean;
    selectable?: boolean;
    selectLabel?: string;
    /** status='none' 徽标文案（文本提取：需OCR） */
    statusNeedText?: string;
    /** status='ocr' 徽标文案（文本提取：已OCR） */
    statusOcrText?: string;
  }>(),
  {
    rotatable: true,
    deletable: true,
    movable: true,
    selectable: false,
    selectLabel: '选',
    statusNeedText: '需OCR',
    statusOcrText: '已OCR',
  },
);

const emit = defineEmits<{
  rotate: [id: number];
  toggleDelete: [id: number];
  toggleSelect: [id: number];
  reorder: [fromId: number, toId: number];
}>();

const dragId = ref<number | null>(null);

function onDragStart(id: number) {
  dragId.value = id;
}
function onDrop(id: number) {
  if (dragId.value != null && dragId.value !== id) {
    emit('reorder', dragId.value, id);
  }
  dragId.value = null;
}
function move(dir: 'up' | 'down', index: number) {
  if (dir === 'up' && index > 0) {
    emit('reorder', props.pages[index].id, props.pages[index - 1].id);
  }
  if (dir === 'down' && index < props.pages.length - 1) {
    emit('reorder', props.pages[index].id, props.pages[index + 1].id);
  }
}
</script>

<template>
  <div class="pdf-prev-grid">
    <div
      v-for="(p, i) in pages"
      :key="p.id"
      class="pdf-prev-card"
      :class="{ deleted: p.deleted, 'pdf-prev-card--static': !movable }"
      :draggable="movable"
      @dragstart="onDragStart(p.id)"
      @dragover.prevent
      @drop="onDrop(p.id)"
    >
      <div class="pp-head">
        <span class="pp-num">第 {{ p.id }} 页</span>
        <label v-if="selectable" class="pp-sel">
          <input type="checkbox" :checked="p.selected" @change="emit('toggleSelect', p.id)" />
          <span>{{ selectLabel }}</span>
        </label>
      </div>

      <div class="pp-canvas">
        <img :src="p.dataUrl" :style="{ transform: `rotate(${p.rotation}deg)` }" alt="" draggable="false" />
        <span v-if="p.deleted" class="pp-del-badge">已删除</span>
        <span v-if="p.rotation" class="pp-rot-badge">{{ p.rotation }}°</span>
        <span v-if="p.status === 'none'" class="pp-status-badge pp-status-badge--need">{{ statusNeedText }}</span>
        <span v-else-if="p.status === 'ocr'" class="pp-status-badge pp-status-badge--done">{{ statusOcrText }}</span>
      </div>

      <div class="pp-actions">
        <button v-if="rotatable" class="pp-btn" title="旋转 90°" @click="emit('rotate', p.id)">
          <IconRotateClockwise :size="16" />
        </button>
        <button
          v-if="deletable"
          class="pp-btn"
          :title="p.deleted ? '恢复' : '删除'"
          @click="emit('toggleDelete', p.id)"
        >
          <IconRestore v-if="p.deleted" :size="16" />
          <IconTrash v-else :size="16" />
        </button>
        <span v-if="movable" class="pp-move">
          <button class="pp-btn" title="上移" :disabled="i === 0" @click="move('up', i)">
            <IconArrowUp :size="14" />
          </button>
          <button class="pp-btn" title="下移" :disabled="i === pages.length - 1" @click="move('down', i)">
            <IconArrowDown :size="14" />
          </button>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pdf-prev-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
  margin: 12px 0;
}
.pdf-prev-card {
  border: 1px solid var(--border-color, #ddd);
  border-radius: 8px;
  padding: 8px;
  background: var(--card-bg, #fff);
  display: flex;
  flex-direction: column;
  gap: 6px;
  cursor: grab;
  transition: opacity 0.15s;
}
.pdf-prev-card:active {
  cursor: grabbing;
}
.pdf-prev-card.deleted {
  opacity: 0.45;
}
.pdf-prev-card--static {
  cursor: default;
}
.pp-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
}
.pp-num {
  font-weight: 600;
}
.pp-sel {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  cursor: pointer;
}
.pp-canvas {
  position: relative;
  background: #f4f4f5;
  border-radius: 4px;
  min-height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 6px;
}
.pp-canvas img {
  max-width: 100%;
  max-height: 200px;
  transition: transform 0.15s;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
}
.pp-del-badge,
.pp-rot-badge {
  position: absolute;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 10px;
  color: #fff;
}
.pp-del-badge {
  top: 4px;
  left: 4px;
  background: #d03050;
}
.pp-rot-badge {
  top: 4px;
  right: 4px;
  background: #2080f0;
}
.pp-status-badge {
  position: absolute;
  white-space: nowrap;
  bottom: 4px;
  left: 4px;
  background: #f0a020;
  font-weight: 600;
}
.pp-status-badge--done {
  background: #2080f0;
}
.pp-actions {
  display: flex;
  gap: 4px;
  align-items: center;
  justify-content: center;
}
.pp-btn {
  border: 1px solid var(--border-color, #ddd);
  background: var(--card-bg, #fff);
  border-radius: 6px;
  padding: 3px 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
}
.pp-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.pp-move {
  display: inline-flex;
  gap: 2px;
  margin-left: auto;
}
</style>
