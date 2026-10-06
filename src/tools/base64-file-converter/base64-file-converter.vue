<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useBase64 } from '@vueuse/core';
import type { Ref } from 'vue';
import { useCopy } from '@/composable/copy';
import {
  getExtensionFromMimeType,
  getMimeTypeFromBase64,
  previewImageFromBase64,
  useDownloadFileFromBase64Refs,
} from '@/composable/downloadBase64';
import { useValidation } from '@/composable/validation';
import { isValidBase64 } from '@/utils/base64';

const { t } = useI18n();

const fileName = ref('file');
const fileExtension = ref('');
const base64Input = ref('');
const { download } = useDownloadFileFromBase64Refs({
  source: base64Input,
  filename: fileName,
  extension: fileExtension,
});
const base64InputValidation = useValidation({
  source: base64Input,
  rules: [
    {
      message: t('tools.base64-file-converter.texts.message-invalid-base-64-string'),
      validator: (value) => isValidBase64(value.trim()),
    },
  ],
});

/**
 * 示例是一张 64×64 的 PNG 的 base64（不是 data URI，就是裸的 base64 串）。
 * 选它是因为工具靠开头的 iVBORw0KGgo 签名自动识别 MIME，
 * 一粘进来就能自动填上 .png 扩展名并直接出图片预览，
 * 比放一段文字的 base64 更能说清"这工具能把 base64 还原成文件"。
 */
const exampleData = {
  fileName: '示例图片',
  fileExtension: 'png',
  base64Input:
    'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAd0lEQVR4nO3PMQ3AMBAEQXNyGU6BGFbuA8LF6KVdHYCb9bzf6C3+IIB+EEA/CKAfBNAPAugHAfSDAPpBAP0ggH4QQD8IoB8E0A8C6Ae3gD28ALoAugC6+YAzvAC6ALoAugC6ALoAugC6ALoAugC6ALoAugC68YAf2gId0oN+Iu8AAAAASUVORK5CYII=',
};

function loadExample() {
  fileName.value = exampleData.fileName;
  fileExtension.value = exampleData.fileExtension;
  base64Input.value = exampleData.base64Input;
}

watch(base64Input, (newValue, _) => {
  const { mimeType } = getMimeTypeFromBase64({ base64String: newValue });
  if (mimeType) {
    fileExtension.value = getExtensionFromMimeType(mimeType) || fileExtension.value;
  }
});

function previewImage() {
  if (!base64InputValidation.isValid) {
    return;
  }
  try {
    const image = previewImageFromBase64(base64Input.value);
    image.style.maxWidth = '100%';
    image.style.maxHeight = '400px';
    const previewContainer = document.getElementById('previewContainer');
    if (previewContainer) {
      previewContainer.innerHTML = '';
      previewContainer.appendChild(image);
    }
  } catch (_) {
    //
  }
}

function downloadFile() {
  if (!base64InputValidation.isValid) {
    return;
  }

  try {
    download();
  } catch (_) {
    //
  }
}

const includeDataUri = ref(true);
const fileInput = ref() as Ref<File>;
const { base64: fileBase64 } = useBase64(fileInput);
const cleanedFileBase64 = computed(() => {
  if (includeDataUri.value) {
    return fileBase64.value;
  }
  return fileBase64.value.replace(/^data:[^;]*;base64,/, '');
});
const { copy: copyFileBase64 } = useCopy({
  source: cleanedFileBase64,
  text: t('tools.base64-file-converter.texts.text-base64-string-copied-to-the-clipboard'),
});

async function onUpload(file: File) {
  if (file) {
    fileInput.value = file;
  }
}
</script>

<template>
  <div flex justify-end mb-2>
    <ToolExampleButton @click="loadExample" />
  </div>

  <c-card :title="t('tools.base64-file-converter.texts.title-base64-to-file')">
    <n-grid cols="3" x-gap="12">
      <n-gi span="2">
        <c-input-text
          v-model:value="fileName"
          :label="t('tools.base64-file-converter.texts.label-file-name')"
          :placeholder="t('tools.base64-file-converter.texts.placeholder-download-filename')"
          mb-2
        />
      </n-gi>
      <n-gi>
        <c-input-text
          v-model:value="fileExtension"
          :label="t('tools.base64-file-converter.texts.label-extension')"
          :placeholder="t('tools.base64-file-converter.texts.placeholder-extension')"
          mb-2
        />
      </n-gi>
    </n-grid>
    <c-input-text
      v-model:value="base64Input"
      multiline
      :placeholder="t('tools.base64-file-converter.texts.placeholder-put-your-base64-file-string-here')"
      rows="5"
      :validation="base64InputValidation"
      mb-2
    />

    <div flex justify-center py-2>
      <div id="previewContainer" />
    </div>

    <div flex justify-center gap-3>
      <c-button :disabled="base64Input === '' || !base64InputValidation.isValid" @click="previewImage()">
        {{ t('tools.base64-file-converter.texts.tag-preview-image') }}
      </c-button>
      <c-button :disabled="base64Input === '' || !base64InputValidation.isValid" @click="downloadFile()">
        {{ t('tools.base64-file-converter.texts.tag-download-file') }}
      </c-button>
    </div>
  </c-card>

  <c-card :title="t('tools.base64-file-converter.texts.title-file-to-base64')">
    <c-file-upload
      :title="t('tools.base64-file-converter.texts.title-drag-and-drop-a-file-here-or-click-to-select-a-file')"
      :paste-image="true"
      mb-1
      @file-upload="onUpload"
    />

    <n-space justify="center" mb-1>
      <n-checkbox v-model:checked="includeDataUri">
        {{ $t('tools.base64-file-converter.texts.include-data-uri-prefix') }}
      </n-checkbox>
    </n-space>

    <c-input-text
      :value="cleanedFileBase64"
      multiline
      readonly
      :placeholder="t('tools.base64-file-converter.texts.placeholder-file-in-base64-will-be-here')"
      rows="5"
      my-2
    />

    <div flex justify-center>
      <c-button @click="copyFileBase64()">
        {{ t('tools.base64-file-converter.texts.tag-copy') }}
      </c-button>
    </div>
  </c-card>
</template>

<style lang="less" scoped>
::v-deep(.n-upload-trigger) {
  width: 100%;
}
</style>
