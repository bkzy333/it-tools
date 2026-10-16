<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

// miniPaint 以自托管方式放在 public/minipaint/（MIT 许可，构建产物 + 两处路径修补），
// 用同源 iframe 加载。?lang=zh 走它官方的 URL 参数机制强制中文界面——语言包已打进它的 bundle。
// 所有图像处理都在浏览器本地完成，图片不出本机，与本站「数据不上传」的承诺一致。
const editorSrc = '/minipaint/index.html?lang=zh';
const loaded = ref(false);
</script>

<template>
  <div class="image-editor">
    <div v-show="!loaded" class="editor-loading">
      <n-spin size="medium" />
      <span>{{ t('tools.image-editor.texts.loading') }}</span>
    </div>
    <iframe
      class="editor-frame"
      :src="editorSrc"
      :title="t('tools.image-editor.title')"
      allow="clipboard-read; clipboard-write"
      @load="loaded = true"
    />
  </div>
</template>

<style lang="less" scoped>
.image-editor {
  position: relative;
  width: 100%;
}

// 编辑器要尽量大：桌面上撑满首屏减去页头，移动端给 75vh。
// 上下留 1px 边框 + 圆角，和站内卡片视觉对齐。
.editor-loading,
.editor-frame {
  height: calc(100vh - 18rem);
  min-height: 36rem;
}

.editor-loading {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  justify-content: center;
  color: var(--text-color-3, #888);
}

.editor-frame {
  display: block;
  width: 100%;
  border: 1px solid var(--border-color, rgba(0, 0, 0, 0.12));
  border-radius: 6px;
  background: #fff;
}

@media (max-width: 768px) {
  .editor-loading,
  .editor-frame {
    height: 75vh;
    min-height: 26rem;
  }
}
</style>
