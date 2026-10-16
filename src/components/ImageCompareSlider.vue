<script setup lang="ts">
import { computed, ref } from 'vue';

/**
 * 前后对比滑块：左半显示「原图」，右半显示「结果」，中间竖线可拖。
 * 结果的透明区域会透出棋盘格，便于看清抠图边缘。
 * 鼠标 / 触摸 / 键盘（←→、Shift+←→ 大步、Home/End）都能调。
 */
const props = withDefaults(
  defineProps<{
    beforeSrc: string;
    afterSrc: string;
    beforeLabel?: string;
    afterLabel?: string;
    checkerboard?: boolean;
  }>(),
  {
    beforeLabel: '',
    afterLabel: '',
    checkerboard: true,
  },
);

const pos = ref(50);
const container = ref<HTMLElement | null>(null);
let dragging = false;

function updateFromClientX(clientX: number) {
  const el = container.value;
  if (!el) {
    return;
  }
  const rect = el.getBoundingClientRect();
  if (rect.width === 0) {
    return;
  }
  pos.value = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
}

function onPointerDown(e: PointerEvent) {
  dragging = true;
  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  updateFromClientX(e.clientX);
  e.preventDefault();
}

function onPointerMove(e: PointerEvent) {
  if (dragging) {
    updateFromClientX(e.clientX);
  }
}

function onPointerUp(e: PointerEvent) {
  dragging = false;
  (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
}

function onKeydown(e: KeyboardEvent) {
  const step = e.shiftKey ? 10 : 2;
  if (e.key === 'ArrowLeft') {
    pos.value = Math.max(0, pos.value - step);
  }
  else if (e.key === 'ArrowRight') {
    pos.value = Math.min(100, pos.value + step);
  }
  else if (e.key === 'Home') {
    pos.value = 0;
  }
  else if (e.key === 'End') {
    pos.value = 100;
  }
  else {
    return;
  }
  e.preventDefault();
}

// 结果层只显示滑块右侧部分
const afterClip = computed(() => `inset(0 0 0 ${pos.value}%)`);
</script>

<template>
  <div
    ref="container"
    class="compare-slider"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <!-- 原图：正常流内，负责撑开容器高度（两侧图片尺寸一致） -->
    <img class="base" :src="props.beforeSrc" :alt="props.beforeLabel || 'before'" draggable="false">

    <!-- 结果：绝对定位覆盖，按滑块位置裁剪；透明处透出棋盘格 -->
    <div class="after-layer" :style="{ clipPath: afterClip }">
      <div v-if="props.checkerboard" class="checker" />
      <img :src="props.afterSrc" :alt="props.afterLabel || 'after'" draggable="false">
    </div>

    <span v-if="props.beforeLabel" class="tag tag-left">{{ props.beforeLabel }}</span>
    <span v-if="props.afterLabel" class="tag tag-right">{{ props.afterLabel }}</span>

    <div
      class="handle"
      :style="{ left: `${pos}%` }"
      role="slider"
      tabindex="0"
      aria-orientation="horizontal"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="Math.round(pos)"
      :aria-label="`${props.beforeLabel} / ${props.afterLabel}`"
      @keydown="onKeydown"
    >
      <span class="handle-line" />
      <span class="handle-knob">↔</span>
    </div>
  </div>
</template>

<style scoped>
.compare-slider {
  position: relative;
  overflow: hidden;
  border-radius: 8px;
  cursor: ew-resize;
  touch-action: none;
  user-select: none;
  background: var(--n-color, #fff);
}

.base {
  display: block;
  width: 100%;
  height: auto;
  pointer-events: none;
}

.after-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.after-layer img {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
}

/* 透明棋盘格 */
.checker {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(45deg, #d8d8d8 25%, transparent 25%, transparent 75%, #d8d8d8 75%),
    linear-gradient(45deg, #d8d8d8 25%, transparent 25%, transparent 75%, #d8d8d8 75%);
  background-size: 20px 20px;
  background-position: 0 0, 10px 10px;
  background-color: #fff;
}

.tag {
  position: absolute;
  top: 8px;
  padding: 2px 8px;
  font-size: 12px;
  line-height: 18px;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  border-radius: 4px;
  pointer-events: none;
}

.tag-left {
  left: 8px;
}

.tag-right {
  right: 8px;
}

.handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: #fff;
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.5);
  /* 保留指针事件：点中把手可以直接把它拉进焦点，键盘用户也能 Tab 进来 */
  cursor: ew-resize;
}

.handle-knob {
  position: absolute;
  top: 50%;
  left: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  margin: -16px 0 0 -16px;
  font-size: 14px;
  color: #333;
  background: #fff;
  border-radius: 50%;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
}

.handle:focus-visible .handle-knob {
  outline: 2px solid var(--primary-color, #18a058);
  outline-offset: 2px;
}
</style>
