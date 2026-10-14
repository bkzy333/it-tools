<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue';

/** 归一化裁剪框：相对原图的比例，范围 0~1（与 image-resizer 的 CropRect / ocr-image 的 NormRect 结构一致） */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const props = defineProps<{
  src: string;
  /** 归一化裁剪框；null 表示未选（显示整图，拖动后产出非空框） */
  modelValue: CropRect | null;
  /** 可选锁定比例（宽/高），>0 时拖拽保持该比例 */
  aspectRatio?: number;
}>();
const emit = defineEmits<{ 'update:modelValue': [CropRect] }>();

const FULL: CropRect = { x: 0, y: 0, w: 1, h: 1 };

const rect = ref<CropRect | null>(props.modelValue ? { ...props.modelValue } : null);
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
let startRect: CropRect = { ...FULL };
let pointerId = -1;

const rectStyle = computed(() => {
  const r = rect.value ?? FULL;
  return {
    left: `${r.x * 100}%`,
    top: `${r.y * 100}%`,
    width: `${r.w * 100}%`,
    height: `${r.h * 100}%`,
  };
});

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
  startRect = rect.value ? { ...rect.value } : { ...FULL };
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
  <div
    ref="wrap"
    class="img-crop"
    :class="{ 'is-dragging': dragging }"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
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
  -webkit-user-select: none;
  touch-action: none;

  img {
    display: block;
    max-width: 100%;
    height: auto;
    // 移动端点按不出现默认高亮/选中
    -webkit-tap-highlight-color: transparent;
  }

  &__rect {
    position: absolute;
    border: 1.5px solid #2080f0;
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45);
    cursor: move;
    box-sizing: border-box;
    touch-action: none;
  }

  &__handle {
    position: absolute;
    width: 12px;
    height: 12px;
    background: #2080f0;
    border: 1px solid #fff;
    border-radius: 2px;
    box-sizing: border-box;
    touch-action: none;
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

// 移动端（触摸屏）：视觉手柄保持 12px，但把可点热区扩大到约 44px
// （handle 含 1px 边框，padding box 10px + 两侧各 17px = 44px），
// 达到手指触摸的推荐目标尺寸，让缩放点更容易捏住、又不遮挡视线。
@media (pointer: coarse) {
  .img-crop__handle::after {
    content: '';
    position: absolute;
    left: -17px;
    top: -17px;
    right: -17px;
    bottom: -17px;
  }
}
</style>
