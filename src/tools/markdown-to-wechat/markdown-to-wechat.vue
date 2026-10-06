<script setup lang="ts">
/**
 * Markdown 转公众号排版。
 *
 * 输出目标是"能直接粘进微信编辑器"，所以和普通 Markdown 预览有三处不同：
 * 1. 样式必须内联，class 和 <style> 进了公众号会被剥掉（见 wechat.ts）。
 * 2. 复制要走富文本通道，光复制纯文本等于白做。
 * 3. 代码块用深色背景 + 横向滚动，因为公众号里 <pre> 的换行很脆弱。
 */
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdownLang from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import MarkdownIt from 'markdown-it';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { THEMES, applyTheme, copyRichText } from './wechat';

const { t } = useI18n();

for (const [name, language] of Object.entries({
  javascript,
  typescript,
  python,
  bash,
  json,
  css,
  xml,
  java,
  go,
  sql,
  markdown: markdownLang,
  yaml,
})) {
  hljs.registerLanguage(name, language as unknown as Parameters<typeof hljs.registerLanguage>[1]);
}

// highlight 回调里要用到 md 自己（md.utils.escapeHtml），不显式标注类型会让 TS
// 陷入「md 的推断依赖 md 自身」的循环（TS7022 / TS7023）。
const md: InstanceType<typeof MarkdownIt> = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: false,
  highlight(code: string, language: string): string {
    const lang = language && hljs.getLanguage(language) ? language : null;
    if (!lang) {
      return `<pre><code>${md.utils.escapeHtml(code)}</code></pre>`;
    }
    const highlighted = hljs.highlight(code, { language: lang }).value;
    return `<pre><code class="language-${lang}">${highlighted}</code></pre>`;
  },
});

const markdown = ref('');
const themeKey = ref(THEMES[0].key);
const previewRef = ref<HTMLElement | null>(null);
const copyState = ref<'idle' | 'ok' | 'fail'>('idle');
const copyHtmlState = ref<'idle' | 'ok' | 'fail'>('idle');

const themeOptions = THEMES.map((theme) => ({ label: theme.name, value: theme.key }));
const currentTheme = computed(() => THEMES.find((theme) => theme.key === themeKey.value) ?? THEMES[0]);

const renderedHtml = computed(() => DOMPurify.sanitize(md.render(markdown.value)));

const exampleData = {
  markdown: `# 为什么你的文章在手机上没人看

排版决定读者会不会读完第一段。这篇短文演示一下常见元素的效果。

## 三个最容易被忽略的细节

1. **段落间距**：手机上 1.5 倍行距起步，挤在一起没人愿意读
2. *重点标记*：别整段加粗，加粗用多了等于没加粗
3. 代码块：手机上一定要能横向滚动

> 排版不是装饰，它是阅读体验的一部分。

### 一段示例代码

\`\`\`python
def monthly_payment(principal, annual_rate, months):
    rate = annual_rate / 12
    return principal * rate / (1 - (1 + rate) ** -months)


print(round(monthly_payment(2_000_000, 0.031, 360), 2))
\`\`\`

### 常见还款方式对比

| 方式 | 月供 | 总利息 |
| --- | --- | --- |
| 等额本息 | 固定 | 较高 |
| 等额本金 | 递减 | 较低 |

行内代码像 \`npm run build\` 这样写，链接会自动识别：https://gjxtools.com

---

写完之后点上面的「复制富文本」，直接粘进公众号编辑器就行。`,
  themeKey: 'blue',
};

/** 示例刻意覆盖标题/列表/引用/代码/表格/行内代码/链接/分割线，一次把主题里所有规则都跑一遍 */
function loadExample() {
  markdown.value = exampleData.markdown;
  themeKey.value = exampleData.themeKey;
}

watch(
  [renderedHtml, currentTheme],
  () => {
    // flush: post 保证 v-html 已经把新内容写进 DOM
    const element = previewRef.value;
    if (element) {
      applyTheme(element, currentTheme.value);
    }
  },
  { flush: 'post', immediate: true },
);

async function copyPreview() {
  if (!previewRef.value) {
    return;
  }
  copyState.value = (await copyRichText(previewRef.value)) ? 'ok' : 'fail';
  setTimeout(() => {
    copyState.value = 'idle';
  }, 2000);
}

async function copyHtml() {
  try {
    await navigator.clipboard.writeText(previewRef.value?.innerHTML ?? '');
    copyHtmlState.value = 'ok';
  }
  catch {
    copyHtmlState.value = 'fail';
  }
  setTimeout(() => {
    copyHtmlState.value = 'idle';
  }, 2000);
}
</script>

<template>
  <div class="markdown-to-wechat">
    <div flex justify-end mb-2>
      <ToolExampleButton @click="loadExample" />
    </div>

    <c-card :title="t('tools.markdown-to-wechat.texts.title-input')" mb-3>
      <n-input
        v-model:value="markdown"
        type="textarea"
        :rows="12"
        :placeholder="t('tools.markdown-to-wechat.texts.placeholder-markdown')"
        mb-2
      />
      <n-space>
        <c-select
          v-model:value="themeKey"
          :label="t('tools.markdown-to-wechat.texts.label-theme')"
          label-position="left"
          :options="themeOptions"
        />
        <c-button :disabled="!renderedHtml" @click="copyPreview">
          {{ t('tools.markdown-to-wechat.texts.btn-copy-rich') }}
        </c-button>
        <c-button :disabled="!renderedHtml" @click="copyHtml">
          {{ t('tools.markdown-to-wechat.texts.btn-copy-html') }}
        </c-button>
      </n-space>

      <div class="hint" mt-2>
        <span v-if="copyState === 'ok'" class="state-ok">{{ t('tools.markdown-to-wechat.texts.state-copied') }}</span>
        <span v-else-if="copyState === 'fail'" class="state-bad">{{ t('tools.markdown-to-wechat.texts.state-failed') }}</span>
        <span v-else-if="copyHtmlState === 'ok'" class="state-ok">{{ t('tools.markdown-to-wechat.texts.state-copied') }}</span>
        <span v-else-if="copyHtmlState === 'fail'" class="state-bad">{{ t('tools.markdown-to-wechat.texts.state-failed') }}</span>
        <span v-else>{{ t('tools.markdown-to-wechat.texts.hint-copy') }}</span>
      </div>
    </c-card>

    <c-card :title="t('tools.markdown-to-wechat.texts.title-preview')">
      <div ref="previewRef" class="wechat-preview" v-html="renderedHtml" />
      <div class="hint" mt-2>
        {{ t('tools.markdown-to-wechat.texts.hint-image') }}
      </div>
    </c-card>
  </div>
</template>

<style scoped lang="less">
.markdown-to-wechat {
  .hint {
    font-size: 13px;
    color: var(--n-text-color-disabled, #999);
  }

  .state-ok {
    color: #18a058;
  }

  .state-bad {
    color: #d03050;
  }

  .wechat-preview {
    max-width: 677px;
    margin: 0 auto;
    padding: 16px;
    border: 1px solid rgb(0 0 0 / 8%);
    border-radius: 8px;
    background-color: #fff;
    font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  }
}
</style>
