<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMessage } from 'naive-ui';
import { stripHtml, type HtmlStripOptions } from './html-strip.service';
import { useCopy } from '@/composable/copy';

const { t } = useI18n();
const message = useMessage();

const defaultValue = `<div class="container" id="main" style="color:red;padding:10px">
  <h1 id="title" class="head">Hello <b>World</b></h1>
  <p class="text" style="font-size:14px">Visit <a href="https://example.com" class="link">our site</a> &amp; learn more.</p>
  <ul class="list">
    <li>Item 1</li>
    <li>Item 2</li>
  </ul>
</div>`;

const input = ref(defaultValue);

const opts = ref<HtmlStripOptions>({
  removeStyle: true,
  removeId: true,
  removeClass: true,
  stripTags: false,
  decodeEntities: false,
  preserveNewlines: true,
});

function loadExample() {
  input.value = defaultValue;
  opts.value = {
    removeStyle: true,
    removeId: true,
    removeClass: true,
    stripTags: false,
    decodeEntities: false,
    preserveNewlines: true,
  };
}

const output = computed(() => {
  if (input.value.trim() === '') {
    return '';
  }
  return stripHtml(input.value, opts.value);
});

const { copy: copyOut } = useCopy();

function copyAll() {
  if (!output.value) {
    message.warning(t('tools.html-strip.texts.msg-empty'));
    return;
  }
  copyOut(output.value, { notificationMessage: t('tools.html-strip.texts.msg-copied') });
}

function exportFile() {
  if (!output.value) {
    message.warning(t('tools.html-strip.texts.msg-empty'));
    return;
  }
  const isText = opts.value.stripTags;
  const filename = isText ? 'text.txt' : 'cleaned.html';
  const mime = isText ? 'text/plain' : 'text/html';
  const blob = new Blob(['﻿' + output.value], { type: `${mime};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div flex flex-col gap-3>
    <div flex justify-end>
      <ToolExampleButton @click="loadExample" />
    </div>

    <c-card :title="t('tools.html-strip.texts.input-label')">
      <c-input-text
        v-model:value="input"
        :placeholder="t('tools.html-strip.texts.placeholder')"
        multiline
        rows="10"
        clearable
      />
    </c-card>

    <c-card :title="t('tools.html-strip.texts.options-title')">
      <n-space vertical :size="12">
        <n-checkbox v-model:checked="opts.stripTags">
          {{ t('tools.html-strip.texts.opt-strip-tags') }}
        </n-checkbox>

        <n-divider style="margin: 4px 0" />

        <div flex flex-wrap items-center gap-x-6 gap-y-2>
          <n-checkbox v-model:checked="opts.removeStyle" :disabled="opts.stripTags">
            {{ t('tools.html-strip.texts.opt-remove-style') }}
          </n-checkbox>
          <n-checkbox v-model:checked="opts.removeId" :disabled="opts.stripTags">
            {{ t('tools.html-strip.texts.opt-remove-id') }}
          </n-checkbox>
          <n-checkbox v-model:checked="opts.removeClass" :disabled="opts.stripTags">
            {{ t('tools.html-strip.texts.opt-remove-class') }}
          </n-checkbox>
        </div>

        <n-divider style="margin: 4px 0" />

        <div flex flex-wrap items-center gap-x-6 gap-y-2>
          <n-checkbox v-model:checked="opts.decodeEntities">
            {{ t('tools.html-strip.texts.opt-decode-entities') }}
          </n-checkbox>
          <n-checkbox v-model:checked="opts.preserveNewlines" :disabled="!opts.stripTags">
            {{ t('tools.html-strip.texts.opt-preserve-newlines') }}
          </n-checkbox>
        </div>
      </n-space>
    </c-card>

    <c-card v-if="output" :title="t('tools.html-strip.texts.output-label')">
      <c-input-text :value="output" multiline rows="10" readonly />
      <div flex flex-wrap gap-2 mt-3>
        <c-button secondary @click="copyAll">{{ t('tools.html-strip.texts.action-copy') }}</c-button>
        <c-button secondary @click="exportFile">
          {{ opts.stripTags ? t('tools.html-strip.texts.action-export-txt') : t('tools.html-strip.texts.action-export-html') }}
        </c-button>
      </div>
    </c-card>
  </div>
</template>
