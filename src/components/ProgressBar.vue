<script setup lang="ts">
withDefaults(
  defineProps<{
    /** 是否显示进度条 */
    visible: boolean;
    /** 进度 0~100；传 -1 表示不确定（读取/解析阶段用来回扫动动画） */
    percent?: number;
    /** 提示文字（如「正在渲染缩略图 5/100」） */
    text?: string;
  }>(),
  { percent: -1, text: '' },
);
</script>

<template>
  <div v-if="visible" class="progress-bar" role="status">
    <n-progress
      type="line"
      :height="6"
      :percentage="percent >= 0 ? percent : 0"
      :indeterminate="percent < 0"
      :show-indicator="false"
    />
    <p v-if="text" class="progress-bar__text">{{ text }}</p>
  </div>
</template>

<style scoped>
.progress-bar {
  margin: 8px 0;
}
.progress-bar__text {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--text-color-secondary, #888);
  text-align: center;
}
</style>
