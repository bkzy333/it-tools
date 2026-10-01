<script setup lang="ts">
import { useMessage } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { useQueryParam } from '@/composable/queryParams';

const { t } = useI18n();
const message = useMessage();

const input = useQueryParam({ tool: 'favicon-grabber', name: 'domain', defaultValue: '' });
const loadState = ref<'idle' | 'loading' | 'loaded' | 'error'>(hostname.value ? 'loading' : 'idle');
const loadError = ref('');
const downloading = ref(false);
const downloadError = ref('');

const PREVIEW_SIZES = [16, 32, 64, 128];

// 用户可能粘贴完整网址，也可能是裸域名，这里统一提取主机名
const hostname = computed(() => {
  const value = input.value.trim().toLowerCase();
  if (!value) {
    return '';
  }
  let candidate = value;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }
  try {
    return new URL(candidate).hostname;
  } catch {
    return '';
  }
});

const iconUrl = computed(() => (hostname.value ? `https://icon.horse/icon/${hostname.value}` : ''));

// 每次目标主机变化时重置状态，避免沿用上一次的成功/失败结果
watch(hostname, () => {
  loadState.value = hostname.value ? 'loading' : 'idle';
  loadError.value = '';
  downloadError.value = '';
});

function onImageError() {
  loadState.value = 'error';
  loadError.value = t('tools.favicon-grabber.texts.load-failed');
}

function onImageLoad(event: Event) {
  const img = event.target as HTMLImageElement | null;
  if (!img?.naturalWidth) {
    return;
  }
  loadState.value = 'loaded';
}

async function copyIconUrl() {
  if (!iconUrl.value) {
    return;
  }
  try {
    await navigator.clipboard.writeText(iconUrl.value);
    message.success(t('tools.favicon-grabber.texts.copied'));
  } catch {
    message.error(t('tools.favicon-grabber.texts.copy-failed'));
  }
}

// icon.horse 返回了 CORS 头，所以可以直接 fetch 成 blob 做真实的「下载」，
// 而不是依赖 <a download>（跨域时 download 属性会被忽略）。
async function downloadIcon() {
  if (!iconUrl.value || downloading.value) {
    return;
  }

  downloading.value = true;
  downloadError.value = '';

  try {
    const response = await fetch(iconUrl.value);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const blob = await response.blob();
    const extension = blob.type.includes('png')
      ? 'png'
      : blob.type.includes('svg')
        ? 'svg'
        : blob.type.includes('jpeg')
          ? 'jpg'
          : 'ico';

    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `${hostname.value}.${extension}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  } catch (e: any) {
    downloadError.value = e?.message ?? String(e);
  } finally {
    downloading.value = false;
  }
}
</script>

<template>
  <div>
    <c-input-text
      v-model:value="input"
      :label="t('tools.favicon-grabber.texts.label-domain')"
      :placeholder="t('tools.favicon-grabber.texts.placeholder-domain')"
      label-position="left"
      label-width="80px"
      clearable
      mb-2
    />

    <div class="hint">
      {{ t('tools.favicon-grabber.texts.support-hint') }}
    </div>

    <n-divider />

    <c-card v-if="!hostname" mt-4>
      {{ t('tools.favicon-grabber.texts.empty-hint') }}
    </c-card>

    <template v-else>
      <div flex items-center gap-2 flex-wrap>
        <n-button :disabled="loadState !== 'loaded'" secondary @click="copyIconUrl">
          {{ t('tools.favicon-grabber.texts.copy-url') }}
        </n-button>
        <n-button
          type="primary"
          :disabled="loadState !== 'loaded'"
          :loading="downloading"
          @click="downloadIcon"
        >
          {{ t('tools.favicon-grabber.texts.download') }}
        </n-button>
      </div>

      <n-alert v-if="loadState === 'error'" type="error" mt-4 :title="t('tools.favicon-grabber.texts.load-failed')">
        {{ loadError }}
      </n-alert>

      <n-alert v-if="downloadError" type="error" mt-4 :title="t('tools.favicon-grabber.texts.download-failed')">
        {{ downloadError }}
      </n-alert>

      <div v-if="loadState === 'loading'" mt-4 opacity-70>
        {{ t('tools.favicon-grabber.texts.loading') }}
      </div>

      <div v-if="loadState === 'loaded'" class="result" mt-5>
        <div class="result-row">
          <div v-for="size in PREVIEW_SIZES" :key="size" class="preview-box">
            <img :src="iconUrl" :width="size" :height="size" alt="favicon" @load="onImageLoad" @error="onImageError" />
            <div class="preview-label">{{ size }}px</div>
          </div>
        </div>

        <c-text-copyable :value="iconUrl" mt-4 />
        <div class="source-hint">
          {{ t('tools.favicon-grabber.texts.source') }}
        </div>
      </div>

      <!-- 首次加载靠这张 img 触发 @load/@error，隐藏起来只为检测可用性 -->
      <img v-if="loadState === 'loading'" :src="iconUrl" hidden @load="onImageLoad" @error="onImageError" />
    </template>
  </div>
</template>

<style lang="less" scoped>
.hint {
  font-size: 12px;
  opacity: 0.6;
}

.result-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 20px;
}

.preview-box {
  text-align: center;

  img {
    display: block;
    image-rendering: auto;
  }
}

.preview-label {
  margin-top: 6px;
  font-size: 12px;
  opacity: 0.6;
}

.source-hint {
  margin-top: 6px;
  font-size: 12px;
  opacity: 0.5;
}
</style>
