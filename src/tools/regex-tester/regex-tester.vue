<script setup lang="ts">
import RandExp from 'randexp';
import { render } from '@regexper/render';
import type { ShadowRootExpose } from 'vue-shadow-dom';
import { useThemeVars } from 'naive-ui';

import { matchRegex } from './regex-tester.service';
import { CHEAT_CATEGORIES, REGEX_PRESETS, type RegexPreset } from './regex-cheatsheet';
import { CODEGEN_LANGS, sampleForCode } from './regex-codegen';
import { useValidation } from '@/composable/validation';
import { useCopy } from '@/composable/copy';
import { useQueryParamOrStorage } from '@/composable/queryParams';

const { t, locale } = useI18n();
const themeVars = useThemeVars();

/**
 * 正则输入框的 DOM id。
 * 速查表要「插到光标处」，必须拿到真实 input 元素去读 selectionStart，
 * 而 c-input-text 只透传 id、不暴露元素引用，所以这里给个固定 id 再取。
 */
const REGEX_INPUT_ID = 'regex-tester-pattern-input';

const isZh = computed(() => String(locale.value).toLowerCase().startsWith('zh'));

const regex = useQueryParamOrStorage({ name: 'regex', storageName: 'regex-tester:regex', defaultValue: '' });
const text = ref('');
const replacement = ref('');
const global = useQueryParamOrStorage({ storageName: 'regex-tester:g', name: 'global', defaultValue: true });
const ignoreCase = useQueryParamOrStorage({ storageName: 'regex-tester:i', name: 'igncase', defaultValue: false });
const multiline = useQueryParamOrStorage({ storageName: 'regex-tester:m', name: 'multi', defaultValue: false });
const dotAll = useQueryParamOrStorage({ storageName: 'regex-tester:da', name: 'dotall', defaultValue: true });
const unicode = useQueryParamOrStorage({ storageName: 'regex-tester:u', name: 'uni', defaultValue: true });
const unicodeSets = useQueryParamOrStorage({ storageName: 'regex-tester:us', name: 'unisets', defaultValue: false });

/**
 * 「一键示例」的数据。
 *
 * 选邮箱提取这个例子是因为它同时用到了字符类、量词和单词边界，正则里最常用的几个
 * 概念一次就讲全了；待测文本里故意放了一个不像邮箱的字符串，好让用户一眼看出
 * 「匹配上了 2 个、漏掉了 1 个」，而不是看到满屏高亮不知道边界在哪。
 */
const exampleData = {
  regex: '\\b[\\w.+-]+@[\\w-]+\\.[A-Za-z]{2,}\\b',
  text: [
    '联系我们：support@gjxtools.com',
    '业务合作：biz@gjxtools.com',
    '下面这串不是邮箱，不该被匹配上：192.168.1.1',
    '带别名的写法：chao <chao@gjxtools.com>',
  ].join('\n'),
};

function loadExample() {
  regex.value = exampleData.regex;
  text.value = exampleData.text;
  activeTab.value = 'highlight';
}

function applyPreset(preset: RegexPreset) {
  regex.value = preset.pattern;
  text.value = preset.text;
  activeTab.value = 'highlight';
}

/**
 * 用户勾选出来的修饰符，不含内部加的 d。
 * 代码生成和 `/…/flags` 展示都要用这一份，带 d 会让生成的代码里混进别家语言没有的标志。
 */
const flags = computed(() => {
  let f = '';
  if (global.value) {
    f += 'g';
  }
  if (ignoreCase.value) {
    f += 'i';
  }
  if (multiline.value) {
    f += 'm';
  }
  if (dotAll.value) {
    f += 's';
  }
  if (unicode.value) {
    f += 'u';
  } else if (unicodeSets.value) {
    f += 'v';
  }
  return f;
});

/** 匹配用的标志：额外加 d（索引模式），捕获组才能给出精确起止下标 */
const matchFlags = computed(() => `d${flags.value}`);

const regexValidation = useValidation({
  source: regex,
  rules: computed(() => [
    {
      message: t('tools.regex-tester.texts.message-invalid-regex-0'),
      validator: (value: string) => new RegExp(value, matchFlags.value),
      getErrorMessage: (value: string) => {
        // 故意在这里再抛一次：useValidation 会捕获异常并把 e.toString() 填进 {0}
        new RegExp(value, matchFlags.value);
        return '';
      },
    },
  ]),
});

interface Evaluation {
  matches: ReturnType<typeof matchRegex>;
  groupCount: number;
  ms: number;
}

const evaluation = computed<Evaluation>(() => {
  const pattern = regex.value;
  const source = text.value;

  if (pattern === '' || source === '') {
    return { matches: [], groupCount: 0, ms: 0 };
  }

  const startedAt = performance.now();
  try {
    const matches = matchRegex(pattern, source, matchFlags.value);
    const groupCount = matches.reduce((total, m) => total + m.captures.length + m.groups.length, 0);
    return { matches, groupCount, ms: performance.now() - startedAt };
  } catch (_) {
    return { matches: [], groupCount: 0, ms: 0 };
  }
});

const matches = computed(() => evaluation.value.matches);

/**
 * 高亮预览按段渲染，不用 v-html。
 * 测试文本是用户输入的内容，拼 HTML 字符串等于给自己开一个 XSS 口子；
 * 切成 { 普通文本 / 命中文本 } 的序列交给模板 v-for，转义由 Vue 自动完成。
 */
interface HighlightSegment {
  text: string;
  matchIndex: number | null;
}

const segments = computed<HighlightSegment[]>(() => {
  const source = text.value;
  const found = matches.value;

  if (source === '' || found.length === 0) {
    return [{ text: source, matchIndex: null }];
  }

  const out: HighlightSegment[] = [];
  let cursor = 0;

  found.forEach((match, k) => {
    if (match.index > cursor) {
      out.push({ text: source.slice(cursor, match.index), matchIndex: null });
    }
    out.push({ text: match.value, matchIndex: k });
    cursor = match.index + match.value.length;
  });

  if (cursor < source.length) {
    out.push({ text: source.slice(cursor), matchIndex: null });
  }
  return out;
});

/** 替换结果：每次新建 RegExp，避免复用带 lastIndex 状态的实例导致替换位置错乱 */
const replacedText = computed(() => {
  if (regex.value === '' || text.value === '') {
    return '';
  }
  try {
    return text.value.replace(new RegExp(regex.value, flags.value), replacement.value);
  } catch (_) {
    return '';
  }
});

const codeSample = computed(() => sampleForCode(text.value, t('tools.regex-tester.texts.code-sample-fallback')));

const codeBlocks = computed(() => {
  if (regex.value === '') {
    return [];
  }
  return CODEGEN_LANGS.map((lang) => ({
    id: lang.id,
    label: lang.label,
    code: lang.gen(regex.value, flags.value, codeSample.value),
  }));
});

const { copy } = useCopy({ createToast: true });

type TabKey = 'highlight' | 'matches' | 'replace' | 'code' | 'cheat';

const activeTab = ref<TabKey>('highlight');

const tabs = computed<{ key: TabKey; label: string; badge?: number }[]>(() => [
  { key: 'highlight', label: t('tools.regex-tester.texts.tab-highlight'), badge: matches.value.length },
  { key: 'matches', label: t('tools.regex-tester.texts.tab-matches'), badge: matches.value.length },
  { key: 'replace', label: t('tools.regex-tester.texts.tab-replace') },
  { key: 'code', label: t('tools.regex-tester.texts.tab-code') },
  { key: 'cheat', label: t('tools.regex-tester.texts.tab-cheat') },
]);

/** 速查表点击插入：插到光标处，并保持光标落在新内容的后面 */
function insertPattern(pattern: string) {
  const input = document.getElementById(REGEX_INPUT_ID) as HTMLInputElement | null;
  if (!input) {
    regex.value += pattern;
    return;
  }
  const start = input.selectionStart ?? regex.value.length;
  const end = input.selectionEnd ?? regex.value.length;
  regex.value = regex.value.slice(0, start) + pattern + regex.value.slice(end);

  nextTick(() => {
    input.focus();
    const caret = start + pattern.length;
    input.setSelectionRange(caret, caret);
  });
}

// ------------------------------------------------------------------ 铁路图与随机示例（折叠区保留）

const visualizerSVG = ref<ShadowRootExpose>();

watchEffect(async () => {
  const regexValue = regex.value;
  // shadow root is required:
  // @regexper/render append a <defs><style> that broke svg transparency of icons in the whole site
  const visualizer = visualizerSVG.value?.shadow_root;
  if (visualizer) {
    while (visualizer.lastChild) {
      visualizer.removeChild(visualizer.lastChild);
    }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    try {
      await render(regexValue, svg);
    } catch (_) {}
    visualizer.appendChild(svg);
  }
});

tryOnBeforeUnmount(() => {
  const visualizer = visualizerSVG.value?.shadow_root;
  if (visualizer) {
    visualizer.parentElement?.removeChild(visualizer);
  }
});

const sample = computed(() => {
  try {
    const randexp = new RandExp(new RegExp(regex.value.replace(/\(\?\<[^\>]*\>/g, '(?:')));
    return randexp.gen();
  } catch (_) {
    return '';
  }
});
</script>

<template>
  <div>
    <!-- 顶部：一键示例 + 常用预设 -->
    <c-card mb-1>
      <div flex flex-wrap items-center justify-between gap-2>
        <ToolExampleButton @click="loadExample" />
        <c-link to="/guide/regex-for-developers">{{ t('tools.regex-tester.guide-link') }}</c-link>
      </div>

      <div class="rt-presets">
        <span class="rt-presets-label">{{ t('tools.regex-tester.presets-label') }}</span>
        <n-button
          v-for="preset of REGEX_PRESETS"
          :key="preset.key"
          class="rt-preset-chip"
          size="tiny"
          secondary
          round
          @click="applyPreset(preset)"
        >
          {{ isZh ? preset.labelZh : preset.labelEn }}
        </n-button>
      </div>
    </c-card>

    <div class="rt-layout">
      <!-- ══ 左栏：输入 ══ -->
      <div class="rt-left">
        <c-input-text
          :id="REGEX_INPUT_ID"
          v-model:value="regex"
          :label="t('tools.regex-tester.regex-input')"
          :placeholder="t('tools.regex-tester.regex-input-placeholder')"
          :validation="regexValidation"
          monospace
          spellcheck="false"
        >
          <template #prefix>
            <span class="rt-slash">/</span>
          </template>
          <template #suffix>
            <span class="rt-slash">/<span class="rt-flags">{{ flags }}</span></span>
          </template>
        </c-input-text>

        <div class="rt-flag-row">
          <span class="rt-flag-label">{{ t('tools.regex-tester.texts.flags-label') }}</span>
          <n-checkbox v-model:checked="global" size="small">
            <span :title="t('tools.regex-tester.global')"
              >{{ t('tools.regex-tester.texts.tag-global-search') }}<code>{{ t('tools.regex-tester.texts.tag-g') }}</code
              >{{ t('tools.regex-tester.texts.tag-') }}</span
            >
          </n-checkbox>
          <n-checkbox v-model:checked="ignoreCase" size="small">
            <span :title="t('tools.regex-tester.ignoreCase')"
              >{{ t('tools.regex-tester.texts.tag-case-insensitive-search')
              }}<code>{{ t('tools.regex-tester.texts.tag-i') }}</code
              >{{ t('tools.regex-tester.texts.tag-') }}</span
            >
          </n-checkbox>
          <n-checkbox v-model:checked="multiline" size="small">
            <span :title="t('tools.regex-tester.multiline')"
              >{{ t('tools.regex-tester.texts.tag-multiline') }}<code>{{ t('tools.regex-tester.texts.tag-m') }}</code
              >{{ t('tools.regex-tester.texts.tag-') }}</span
            >
          </n-checkbox>
          <n-checkbox v-model:checked="dotAll" size="small">
            <span :title="t('tools.regex-tester.dotAll')"
              >{{ t('tools.regex-tester.texts.tag-singleline') }}<code>{{ t('tools.regex-tester.texts.tag-s') }}</code
              >{{ t('tools.regex-tester.texts.tag-') }}</span
            >
          </n-checkbox>
          <n-checkbox v-model:checked="unicode" size="small">
            <span :title="t('tools.regex-tester.unicode')"
              >{{ t('tools.regex-tester.texts.tag-unicode') }}<code>{{ t('tools.regex-tester.texts.tag-u') }}</code
              >{{ t('tools.regex-tester.texts.tag-') }}</span
            >
          </n-checkbox>
          <n-checkbox v-model:checked="unicodeSets" size="small">
            <span :title="t('tools.regex-tester.unicodeSets')"
              >{{ t('tools.regex-tester.texts.tag-unicode-sets') }}<code>{{ t('tools.regex-tester.texts.tag-v') }}</code
              >{{ t('tools.regex-tester.texts.tag-') }}</span
            >
          </n-checkbox>
        </div>

        <div class="rt-label-row">
          <span class="rt-label">{{ t('tools.regex-tester.text-input') }}</span>
          <span class="rt-label rt-label-dim">{{ text.length }} {{ t('tools.regex-tester.texts.unit-chars') }}</span>
        </div>

        <c-input-text
          v-model:value="text"
          class="rt-text-input"
          :placeholder="t('tools.regex-tester.text-input-placeholder')"
          multiline
          monospace
          :rows="4"
        />

        <div class="rt-replace-row">
          <span class="rt-label">{{ t('tools.regex-tester.texts.replace-input') }}</span>
          <c-input-text
            v-model:value="replacement"
            :placeholder="t('tools.regex-tester.texts.replace-input-placeholder')"
            monospace
          />
          <n-button size="small" type="primary" @click="activeTab = 'replace'">
            {{ t('tools.regex-tester.texts.replace-button') }}
          </n-button>
        </div>
      </div>

      <!-- ══ 右栏：结果 ══ -->
      <div class="rt-right">
        <div class="rt-stats">
          <span class="rt-stat">
            {{ t('tools.regex-tester.texts.stats-match') }}
            <n-tag :type="matches.length > 0 ? 'success' : 'default'" size="small" round :bordered="false">
              {{ matches.length }}
            </n-tag>
          </span>
          <span class="rt-stat">
            {{ t('tools.regex-tester.texts.stats-group') }}
            <n-tag :type="evaluation.groupCount > 0 ? 'info' : 'default'" size="small" round :bordered="false">
              {{ evaluation.groupCount }}
            </n-tag>
          </span>
          <span class="rt-stat">
            {{ t('tools.regex-tester.texts.stats-chars') }}
            <n-tag size="small" round :bordered="false">{{ text.length }}</n-tag>
          </span>
          <span v-if="matches.length > 0" class="rt-stat rt-stat-time">{{ evaluation.ms.toFixed(2) }} ms</span>
        </div>

        <div class="rt-nav">
          <div
            v-for="tab of tabs"
            :key="tab.key"
            class="rt-nav-item"
            :class="{ active: activeTab === tab.key }"
            @click="activeTab = tab.key"
          >
            {{ tab.label }}
            <span v-if="tab.badge && tab.badge > 0" class="rt-nav-badge">{{ tab.badge }}</span>
          </div>
        </div>

        <!-- 高亮预览 -->
        <div v-if="activeTab === 'highlight'" class="rt-pane">
          <div class="rt-highlight">
            <div v-if="text.length === 0" class="rt-empty">{{ t('tools.regex-tester.texts.empty-highlight') }}</div>
            <div v-else class="rt-highlight-text">
              <template v-for="(segment, k) of segments" :key="k">
                <span v-if="segment.matchIndex === null">{{ segment.text }}</span>
                <span v-else class="rt-hit" :class="segment.matchIndex % 2 === 0 ? 'rt-hit-a' : 'rt-hit-b'">{{
                  segment.text
                }}</span>
              </template>
            </div>
          </div>
        </div>

        <!-- 匹配列表 -->
        <div v-else-if="activeTab === 'matches'" class="rt-pane">
          <div v-if="matches.length === 0" class="rt-empty">{{ t('tools.regex-tester.no-match') }}</div>
          <div v-else class="rt-match-scroll">
            <div v-for="(match, k) of matches.slice(0, 300)" :key="`${match.index}-${k}`" class="rt-match-card">
              <div class="rt-match-head">
                <n-tag :type="k % 2 === 0 ? 'info' : 'warning'" size="small" round :bordered="false">
                  #{{ k + 1 }}
                </n-tag>
                <span class="rt-match-pos">
                  {{ t('tools.regex-tester.texts.match-position') }} {{ match.index }}–{{
                    match.index + match.value.length
                  }}
                </span>
              </div>
              <div class="rt-match-body">
                <code>{{ match.value }}</code>
                <div v-if="match.captures.length > 0 || match.groups.length > 0" class="rt-group-row">
                  <span v-for="capture of match.captures" :key="`c-${capture.name}`" class="rt-group-pill">
                    <span class="rt-group-key">${{ capture.name }}</span>{{ capture.value }}
                  </span>
                  <span v-for="group of match.groups" :key="`g-${group.name}`" class="rt-group-pill">
                    <span class="rt-group-key">{{ group.name }}</span>{{ group.value }}
                  </span>
                </div>
              </div>
            </div>
            <div v-if="matches.length > 300" class="rt-more">
              {{ t('tools.regex-tester.texts.matches-truncated', { count: 300, total: matches.length }) }}
            </div>
          </div>
        </div>

        <!-- 替换结果 -->
        <div v-else-if="activeTab === 'replace'" class="rt-pane">
          <div v-if="replacedText.length === 0" class="rt-empty">{{ t('tools.regex-tester.texts.empty-replace') }}</div>
          <div v-else class="rt-pane-inner">
            <div flex justify-end mb-2>
              <n-button size="tiny" secondary @click="copy(replacedText)">
                {{ t('tools.regex-tester.texts.copy') }}
              </n-button>
            </div>
            <pre class="rt-pre">{{ replacedText }}</pre>
          </div>
        </div>

        <!-- 代码生成 -->
        <div v-else-if="activeTab === 'code'" class="rt-pane">
          <div v-if="codeBlocks.length === 0" class="rt-empty">{{ t('tools.regex-tester.texts.empty-code') }}</div>
          <div v-else class="rt-code-scroll">
            <div v-for="block of codeBlocks" :key="block.id" class="rt-code-block">
              <div class="rt-code-head">
                <span class="rt-code-lang">{{ block.label }}</span>
                <n-button size="tiny" secondary @click="copy(block.code)">
                  {{ t('tools.regex-tester.texts.copy') }}
                </n-button>
              </div>
              <pre class="rt-pre rt-pre-code">{{ block.code }}</pre>
            </div>
          </div>
        </div>

        <!-- 语法速查表 -->
        <div v-else class="rt-pane">
          <div class="rt-cheat-scroll">
            <div class="rt-cheat-grid">
              <div v-for="category of CHEAT_CATEGORIES" :key="category.key" class="rt-cheat-card">
                <div class="rt-cheat-title">{{ isZh ? category.titleZh : category.titleEn }}</div>
                <div
                  v-for="item of category.items"
                  :key="item.pattern"
                  class="rt-cheat-item"
                  :title="t('tools.regex-tester.texts.cheat-insert-hint')"
                  @click="insertPattern(item.pattern)"
                >
                  <code class="rt-cheat-pat">{{ item.pattern }}</code>
                  <span class="rt-cheat-desc">{{ isZh ? item.zh : item.en }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 折叠区：铁路图 + 随机示例，保留原有能力但不再抢占首屏 -->
    <c-card mt-3>
      <c-collapse :title="t('tools.regex-tester.diagram')">
        <div style="overflow-x: auto">
          <shadow-root ref="visualizerSVG">&#xA0;</shadow-root>
        </div>
      </c-collapse>

      <c-collapse :title="t('tools.regex-tester.sample')" mt-3>
        <pre class="rt-pre">{{ sample }}</pre>
      </c-collapse>
    </c-card>
  </div>
</template>

<style lang="less" scoped>
.rt-layout {
  display: flex;
  align-items: stretch;
  border: 1px solid v-bind('themeVars.borderColor');
  border-radius: 4px;
  overflow: hidden;
  background-color: v-bind('themeVars.cardColor');
  height: min(72vh, 720px);
  min-height: 520px;
}

.rt-left {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  width: 420px;
  min-width: 0;
  flex-shrink: 0;
  border-right: 1px solid v-bind('themeVars.borderColor');
  overflow: hidden;
}

.rt-right {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

/* 输入框两侧的 / 与 /flags 装饰，做成字面量样式 */
.rt-slash {
  font-family: v-bind('themeVars.fontFamilyMono');
  font-size: 16px;
  font-weight: 300;
  color: v-bind('themeVars.textColor3');
  padding: 0 4px;
  white-space: nowrap;
}

.rt-flags {
  margin-left: 4px;
  font-size: 13px;
  font-weight: 700;
  color: v-bind('themeVars.primaryColor');
}

.rt-presets {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
}

.rt-presets-label {
  font-size: 12px;
  font-weight: 700;
  color: v-bind('themeVars.textColor3');
  margin-right: 2px;
}

.rt-flag-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
}

.rt-flag-label {
  font-size: 12px;
  font-weight: 700;
  color: v-bind('themeVars.textColor3');
  margin-right: 2px;
}

.rt-label-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.rt-label {
  font-size: 12px;
  font-weight: 700;
  color: v-bind('themeVars.textColor2');
}

.rt-label-dim {
  font-weight: 400;
  color: v-bind('themeVars.textColor3');
}

/* 测试文本框撑满左栏剩余高度：c-input-text 内部有两层 wrapper，都要跟着拉伸 */
.rt-text-input {
  flex: 1 1 0;
  min-height: 0;
  display: flex;

  :deep(.feedback-wrapper) {
    flex: 1 1 0;
    min-height: 0;
    display: flex;
  }

  :deep(.input-wrapper) {
    flex: 1 1 0;
    min-height: 0;
    align-items: stretch;
  }

  :deep(textarea) {
    height: 100%;
    resize: none;
  }
}

.rt-replace-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.rt-stats {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 14px;
  border-bottom: 1px solid v-bind('themeVars.dividerColor');
  font-size: 12px;
  color: v-bind('themeVars.textColor2');
  flex-shrink: 0;
}

.rt-stat {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.rt-stat-time {
  margin-left: auto;
  font-family: v-bind('themeVars.fontFamilyMono');
  color: v-bind('themeVars.textColor3');
}

.rt-nav {
  display: flex;
  border-bottom: 1px solid v-bind('themeVars.dividerColor');
  overflow-x: auto;
  flex-shrink: 0;
  padding: 0 8px;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.rt-nav-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 9px 14px;
  font-size: 13px;
  font-weight: 500;
  color: v-bind('themeVars.textColor2');
  cursor: pointer;
  white-space: nowrap;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;

  &:hover {
    color: v-bind('themeVars.textColor1');
  }

  &.active {
    color: v-bind('themeVars.primaryColor');
    border-bottom-color: v-bind('themeVars.primaryColor');
  }
}

.rt-nav-badge {
  font-size: 11px;
  padding: 0 6px;
  border-radius: 980px;
  background-color: v-bind('themeVars.primaryColor');
  color: #fff;
}

.rt-pane {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.rt-pane-inner {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 14px;
}

.rt-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: v-bind('themeVars.textColor3');
  font-size: 13px;
  padding: 24px;
  text-align: center;
}

.rt-highlight {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 14px;
}

.rt-highlight-text {
  font-family: v-bind('themeVars.fontFamilyMono');
  font-size: 13px;
  line-height: 1.9;
  white-space: pre-wrap;
  word-break: break-word;
  color: v-bind('themeVars.textColor1');
}

.rt-hit {
  border-radius: 3px;
  padding: 1px 0;
}

.rt-hit-a {
  background-color: rgba(24, 160, 88, 0.22);
  box-shadow: 0 0 0 1px rgba(24, 160, 88, 0.45);
}

.rt-hit-b {
  background-color: rgba(240, 160, 32, 0.24);
  box-shadow: 0 0 0 1px rgba(240, 160, 32, 0.45);
}

.rt-match-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rt-match-card {
  border: 1px solid v-bind('themeVars.dividerColor');
  border-radius: 6px;
  overflow: hidden;
}

.rt-match-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 5px 10px;
  background-color: v-bind('themeVars.tableHeaderColor');
  border-bottom: 1px solid v-bind('themeVars.dividerColor');
}

.rt-match-pos {
  font-family: v-bind('themeVars.fontFamilyMono');
  font-size: 11px;
  color: v-bind('themeVars.textColor3');
}

.rt-match-body {
  padding: 8px 10px;
  font-size: 13px;

  code {
    font-family: v-bind('themeVars.fontFamilyMono');
    word-break: break-all;
  }
}

.rt-group-row {
  margin-top: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.rt-group-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px;
  border-radius: 980px;
  font-size: 11.5px;
  font-family: v-bind('themeVars.fontFamilyMono');
  border: 1px solid v-bind('themeVars.dividerColor');
  background-color: v-bind('themeVars.tableHeaderColor');
  word-break: break-all;
}

.rt-group-key {
  opacity: 0.6;
}

.rt-more {
  text-align: center;
  font-size: 12px;
  color: v-bind('themeVars.textColor3');
  padding: 6px 0;
}

.rt-code-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.rt-code-block {
  border: 1px solid v-bind('themeVars.dividerColor');
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
}

.rt-code-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background-color: v-bind('themeVars.tableHeaderColor');
  border-bottom: 1px solid v-bind('themeVars.dividerColor');
}

.rt-code-lang {
  font-size: 13px;
  font-weight: 500;
}

.rt-pre {
  margin: 0;
  padding: 12px 14px;
  font-family: v-bind('themeVars.fontFamilyMono');
  font-size: 12.5px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  color: v-bind('themeVars.textColor1');
}

.rt-pre-code {
  white-space: pre;
  overflow-x: auto;
}

.rt-cheat-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
}

.rt-cheat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 10px;
}

.rt-cheat-card {
  border: 1px solid v-bind('themeVars.dividerColor');
  border-radius: 6px;
  overflow: hidden;
}

.rt-cheat-title {
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 700;
  color: v-bind('themeVars.textColor2');
  background-color: v-bind('themeVars.tableHeaderColor');
  border-bottom: 1px solid v-bind('themeVars.dividerColor');
}

.rt-cheat-item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 12px;
  cursor: pointer;

  &:hover {
    background-color: v-bind('themeVars.tableHeaderColor');
  }
}

.rt-cheat-pat {
  font-family: v-bind('themeVars.fontFamilyMono');
  font-size: 12.5px;
  font-weight: 600;
  color: v-bind('themeVars.primaryColor');
  white-space: nowrap;
  flex-shrink: 0;
}

.rt-cheat-desc {
  font-size: 11.5px;
  color: v-bind('themeVars.textColor3');
  text-align: right;
  line-height: 1.4;
}

@media (max-width: 900px) {
  .rt-layout {
    flex-direction: column;
    height: auto;
  }

  .rt-left {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid v-bind('themeVars.borderColor');
    height: 420px;
  }

  .rt-right {
    min-height: 460px;
  }
}
</style>
