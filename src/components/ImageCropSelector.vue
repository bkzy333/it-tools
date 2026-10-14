<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue';
import type { CropRect } from '@/tools/image-resizer/image-encode.service';

const props = defineProps<{
  src: string;
  modelValue: CropRect;
  /** 可选锁定比例（宽/高），>0 时拖拽保持该比例 */
  aspectRatio?: number;
}>();
const emit = defineEmits<{ 'update:modelValue': [CropRect] }>();

const rect = ref<CropRect>({ ...props.modelValue });
const wrap = ref<HTMLElement | null>(null);
const dragging = ref(false);

type Edge = 'n' | 's' | 'w' | 'e';
type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move';
const HANDLES: { key: Handle; edges: Edge[]; cls: string }[] = [
  { key: 'nw', edges: ['n', 'w'], cls: 'h-nw' },
  { key: 'n', edges: ['n'], cls: 'h-n' },
  { key: 'ne', edges: ['n', 'e'], cls: 'h-ne' },
  { key: 'e', edges: ['e'], cls: 'h-e' },
  { key: 'se', edges: ['s', 'e'], cls: 'h-se' },
  { key: 's', edges: ['s'], cls: 'h-s' },
  { key: 'sw', edges: ['s', 'w'], cls: 'h-sw' },
  { key: 'w', edges: ['w'], cls: 'h-w' },
];

const MIN = 0.05;

let mode: Handle = 'move';
let startX = 0;
let startY = 0;
let startRect: CropRect = { x: 0, y: 0, w: 1, h: 1 };
let pointerId = -1;

const rectStyle = computed(() => ({
  left: `${rect.value.x * 100}%`,
  top: `${rect.value.y * 100}%`,
  width: `${rect.value.w * 100}%`,
  height: `${rect.value.h * 100}%`,
}));

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

function toNormDelta(clientX: number, clientY: number) {
  const box = wrap.value!.getBoundingClientRect();
  return {
    dx: (clientX - startX) / box.width,
    dy: (clientY - startY) / box.height,
  };
}

function commit(next: CropRect) {
  rect.value = next;
  emit('update:modelValue', next);
}

function onPointerDown(e: PointerEvent, m: Handle) {
  e.preventDefault();
  mode = m;
  startX = e.clientX;
  startY = e.clientY;
  startRect = { ...rect.value };
  pointerId = e.pointerId;
  dragging.value = true;
  wrap.value?.setPointerCapture(pointerId);
}

function onPointerMove(e: PointerEvent) {
  if (!dragging.value || e.pointerId !== pointerId) {
    return;
  }
  const { dx, dy } = toNormDelta(e.clientX, e.clientY);
  let next: CropRect;
  if (mode === 'move') {
    next = {
      ...startRect,
      x: clamp(startRect.x + dx, 0, 1 - startRect.w),
      y: clamp(startRect.y + dy, 0, 1 - startRect.h),
    };
  } else {
    const edges = HANDLES.find((h) => h.key === mode)!.edges;
    const fixedRight = startRect.x + startRect.w;
    const fixedBottom = startRect.y + startRect.h;
    let x = startRect.x;
    let y = startRect.y;
    let w = startRect.w;
    let h = startRect.h;
    if (edges.includes('e')) {
      w = clamp(startRect.w + dx, MIN, 1 - startRect.x);
    }
    if (edges.includes('w')) {
      x = clamp(startRect.x + dx, 0, 1 - MIN);
      w = clamp(fixedRight - x, MIN, 1 - x);
    }
    if (edges.includes('s')) {
      h = clamp(startRect.h + dy, MIN, 1 - startRect.y);
    }
    if (edges.includes('n')) {
      y = clamp(startRect.y + dy, 0, 1 - MIN);
      h = clamp(fixedBottom - y, MIN, 1 - y);
    }
    next = { x, y, w, h };
  }
  // 锁定比例：以宽定高
  if (props.aspectRatio && props.aspectRatio > 0 && mode !== 'move') {
    const targetH = (next.w / props.aspectRatio) * (wrap.value!.clientWidth / wrap.value!.clientHeight);
    const clampedH = clamp(targetH, MIN, 1 - next.y);
    next = { ...next, h: clampedH };
  }
  commit(next);
}

function onPointerUp(e: PointerEvent) {
  if (e.pointerId === pointerId) {
    dragging.value = false;
    wrap.value?.releasePointerCapture(pointerId);
  }
}

onBeforeUnmount(() => {
  if (dragging.value && pointerId >= 0) {
    wrap.value?.releasePointerCapture(pointerId);
  }
});
</script>

<template>
  <div ref="wrap" class="img-crop" :class="{ 'is-dragging': dragging }">
    <img :src="src" alt="" draggable="false" @dragstart.prevent />
    <div class="img-crop__rect" :style="rectStyle" @pointerdown="onPointerDown($event, 'move')">
      <span
        v-for="h in HANDLES"
        :key="h.key"
        class="img-crop__handle"
        :class="h.cls"
        @pointerdown.stop="onPointerDown($event, h.key)"
      />
    </div>
  </div>
</template>

<style lang="less" scoped>
.img-crop {
  position: relative;
  display: inline-block;
  max-width: 100%;
  line-height: 0;
  user-select: none;
  touch-action: none;

  img {
    display: block;
    max-width: 100%;
    height: auto;
  }

  &__rect {
    position: absolute;
    border: 1.5px solid #2080f0;
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45);
    cursor: move;
    box-sizing: border-box;
  }

  &__handle {
    position: absolute;
    width: 12px;
    height: 12px;
    background: #2080f0;
    border: 1px solid #fff;
    border-radius: 2px;
    box-sizing: border-box;
  }

  .h-nw {
    left: -6px;
    top: -6px;
    cursor: nwse-resize;
  }
  .h-n {
    left: 50%;
    top: -6px;
    transform: translateX(-50%);
    cursor: ns-resize;
  }
  .h-ne {
    right: -6px;
    top: -6px;
    cursor: nesw-resize;
  }
  .h-e {
    right: -6px;
    top: 50%;
    transform: translateY(-50%);
    cursor: ew-resize;
  }
  .h-se {
    right: -6px;
    bottom: -6px;
    cursor: nwse-resize;
  }
  .h-s {
    left: 50%;
    bottom: -6px;
    transform: translateX(-50%);
    cursor: ns-resize;
  }
  .h-sw {
    left: -6px;
    bottom: -6px;
    cursor: nesw-resize;
  }
  .h-w {
    left: -6px;
    top: 50%;
    transform: translateY(-50%);
    cursor: ew-resize;
  }
}
</style>
