<script lang="ts" setup>
withDefaults(defineProps<{ variant?: 'top' | 'sidebar' | 'tool-bottom' }>(), {
  variant: 'top',
});

// 接入谷歌广告前保持 false，页面不渲染任何占位，避免空白块。
// 接 AdSense 时改为 true，并把下面 .ads-inner 里的内容换成
// <ins class="adsbygoogle" ...></ins>，再在 index.html 或此处加载广告脚本。
const ADS_ENABLED = false;
</script>

<template>
  <div v-if="ADS_ENABLED" class="ads-placeholder" :class="variant" aria-hidden="true">
    <div class="ads-inner">
      <span class="ads-label">广告位</span>
    </div>
  </div>
</template>

<style scoped>
.ads-placeholder {
  width: 100%;
  display: flex;
  justify-content: center;
}

.ads-inner {
  width: 100%;
  max-width: 728px;
  min-height: 90px;
  border: 1px dashed #c0c4cc;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #909399;
  background: #fafafa;
  margin: 12px 0;
}

.ads-label {
  font-size: 13px;
  letter-spacing: 2px;
}

.ads-placeholder.sidebar .ads-inner {
  max-width: 100%;
  min-height: 250px;
}

.ads-placeholder.tool-bottom .ads-inner {
  max-width: 600px;
}
</style>
