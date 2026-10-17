<script setup lang="ts">
/**
 * 汉字转拼音。
 *
 * 字典首次转换时才加载，加载状态直接显示在按钮上——
 * 267KB 在弱网下要等一两秒，如果不给反馈用户会以为工具坏了。
 *
 * 本次对照 lddgo.net/convert/pinyin 补齐：原文与拼音的位置关系（不显示 / 文字在前 /
 * 文字在后 / 文字在下对齐 / 自定义模板）、大小写、ü 保留、未注音字符保留或删除，
 * 以及中置数字声调（zho1ng）风格。
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { appBaseUrl } from '@/utils/base-url';
import CopyExportBar from '@/components/CopyExportBar.vue';
import {
  buildAlignedBlock,
  buildAlignedCells,
  formatItem,
  formatPinyin,
  joinPinyin,
  loadPinyinDict,
  tokenize,
  type PinyinItem,
  type PinyinFormatOptions,
  type PinyinStyle,
} from './pinyin';

const { t } = useI18n();

const input = ref('');
const style = ref<PinyinStyle>('tone');
const separator = ref(' ');
const dictState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
const dict = ref<Record<string, string>>({});
const items = ref<PinyinItem[]>([]);

/** 原文位置：拼音与文字的位置关系（本次新增） */
const rawPosition = ref<'hide' | 'before' | 'after' | 'below' | 'custom'>('hide');
const alignLength = ref(7);
const customTemplate = ref('{{raw}}：{{pinyin}}');

/** 更多参数 */
const upperCase = ref<'lower' | 'upper'>('lower');
const keepUmlaut = ref<'u' | 'umlaut'>('u');
const keepUnrecognized = ref<'keep' | 'delete'>('keep');

const styleOptions = [
  { label: t('tools.chinese-pinyin-converter.texts.style-tone'), value: 'tone' },
  { label: t('tools.chinese-pinyin-converter.texts.style-number'), value: 'number' },
  { label: t('tools.chinese-pinyin-converter.texts.style-number-mid'), value: 'number-mid' },
  { label: t('tools.chinese-pinyin-converter.texts.style-plain'), value: 'plain' },
  { label: t('tools.chinese-pinyin-converter.texts.style-initial'), value: 'initial' },
];

const rawPositionOptions = [
  { label: t('tools.chinese-pinyin-converter.texts.pos-hide'), value: 'hide' },
  { label: t('tools.chinese-pinyin-converter.texts.pos-before'), value: 'before' },
  { label: t('tools.chinese-pinyin-converter.texts.pos-after'), value: 'after' },
  { label: t('tools.chinese-pinyin-converter.texts.pos-below'), value: 'below' },
  { label: t('tools.chinese-pinyin-converter.texts.pos-custom'), value: 'custom' },
];

const separatorOptions = [
  { label: t('tools.chinese-pinyin-converter.texts.sep-space'), value: ' ' },
  { label: t('tools.chinese-pinyin-converter.texts.sep-none'), value: '' },
  { label: t('tools.chinese-pinyin-converter.texts.sep-dash'), value: '-' },
];

const caseOptions = [
  { label: t('tools.chinese-pinyin-converter.texts.case-lower'), value: 'lower' },
  { label: t('tools.chinese-pinyin-converter.texts.case-upper'), value: 'upper' },
];

const umlautOptions = [
  { label: t('tools.chinese-pinyin-converter.texts.umlaut-u'), value: 'u' },
  { label: t('tools.chinese-pinyin-converter.texts.umlaut-keep'), value: 'umlaut' },
];

const unrecognizedOptions = [
  { label: t('tools.chinese-pinyin-converter.texts.unrec-keep'), value: 'keep' },
  { label: t('tools.chinese-pinyin-converter.texts.unrec-delete'), value: 'delete' },
];

const formatOpts = computed<PinyinFormatOptions>(() => ({
  upper: upperCase.value === 'upper',
  keepUmlaut: keepUmlaut.value === 'umlaut',
  keepUnrecognized: keepUnrecognized.value === 'keep',
}));

const exampleData = {
  input: '中国人民银行推出数字人民币',
  style: 'tone' as PinyinStyle,
};

/** 示例特意选了"中国人民银行"——"行"是多音字，能顺带把多音字的说明带出来 */
function loadExample() {
  input.value = exampleData.input;
  style.value = exampleData.style;
  convert();
}

async function convert() {
  if (!input.value.trim()) {
    items.value = [];
    return;
  }
  if (dictState.value !== 'ready') {
    dictState.value = 'loading';
    try {
      // appBaseUrl 是普通字符串（不是 ref），这里不能取 .value
      dict.value = await loadPinyinDict(appBaseUrl);
      dictState.value = 'ready';
    }
    catch {
      dictState.value = 'error';
      return;
    }
  }
  items.value = tokenize(input.value, dict.value);
}

const output = computed(() => {
  if (items.value.length === 0) {
    return '';
  }
  const pinyinStr = joinPinyin(items.value, style.value, separator.value, formatOpts.value);
  const rawStr = input.value;
  switch (rawPosition.value) {
    case 'hide':
      return pinyinStr;
    case 'before':
      return `${rawStr} ${pinyinStr}`;
    case 'after':
      return `${pinyinStr} ${rawStr}`;
    case 'below': {
      const { pinyinLine, textLine } = buildAlignedBlock(items.value, style.value, alignLength.value, formatOpts.value);
      return `${pinyinLine}\n${textLine}`;
    }
    case 'custom': {
      const tpl = customTemplate.value || '{{raw}}：{{pinyin}}';
      return tpl.replace(/\{\{raw\}\}/g, rawStr).replace(/\{\{pinyin\}\}/g, pinyinStr);
    }
    default:
      return pinyinStr;
  }
});

const isBelow = computed(() => rawPosition.value === 'below');
const hasResult = computed(() => items.value.length > 0);

/**
 * 「文字在下」页面上的那两行。
 * 用逐列数据 + 真实列布局渲染，不用 output 里那段空格填充文本 ——
 * 空格填充的对齐依赖字体度量（详见 pinyin.ts 的 buildAlignedBlock 注释），
 * 换字体就会逐列错开。output 仍然给「复制全部 / 导出」用。
 */
const alignedCells = computed(() => buildAlignedCells(items.value, style.value, formatOpts.value));

const polyphones = computed(() => items.value.filter((item) => item.polyphone));

/** 逐字对照的 Excel 行：表头 + 每字一行（汉字 / 拼音），拼音跟随「拼音格式」与更多参数 */
const gridRows = computed<string[][]>(() => {
  const header = [
    t('tools.chinese-pinyin-converter.texts.col-char'),
    t('tools.chinese-pinyin-converter.texts.col-pinyin'),
  ];
  const body = items.value.map((item) => [item.char, formatItem(item, style.value, formatOpts.value)]);
  return [header, ...body];
});

/** 逐字对照的复制 / TXT 文本：TSV，可直接粘回 Excel 两列 */
const gridText = computed(() => gridRows.value.slice(1).map((row) => row.join('\t')).join('\n'));
</script>

<template>
  <div class="pinyin-converter">
    <div flex justify-end mb-2>
      <ToolExampleButton @click="loadExample" />
    </div>

    <c-card :title="t('tools.chinese-pinyin-converter.texts.title-input')" mb-3>
      <n-input
        v-model:value="input"
        type="textarea"
        :rows="5"
        :placeholder="t('tools.chinese-pinyin-converter.texts.placeholder-input')"
        mb-2
      />
      <n-space>
        <c-select
          v-model:value="style"
          :label="t('tools.chinese-pinyin-converter.texts.label-style')"
          label-position="left"
          :options="styleOptions"
        />
        <c-select
          v-model:value="rawPosition"
          :label="t('tools.chinese-pinyin-converter.texts.label-raw-position')"
          label-position="left"
          :options="rawPositionOptions"
        />
        <c-select
          v-model:value="separator"
          :label="t('tools.chinese-pinyin-converter.texts.label-separator')"
          label-position="left"
          :options="separatorOptions"
        />
        <c-button :loading="dictState === 'loading'" @click="convert">
          {{ t('tools.chinese-pinyin-converter.texts.btn-convert') }}
        </c-button>
      </n-space>

      <n-space v-if="rawPosition === 'below'" align="center" mt-2>
        <c-select
          v-model:value="alignLength"
          :label="t('tools.chinese-pinyin-converter.texts.label-align-length')"
          label-position="left"
          :options="[
            { label: '7', value: 7 },
            { label: '9', value: 9 },
            { label: '11', value: 11 },
            { label: '13', value: 13 },
          ]"
        />
        <span class="hint">{{ t('tools.chinese-pinyin-converter.texts.hint-align') }}</span>
      </n-space>

      <n-input
        v-if="rawPosition === 'custom'"
        v-model:value="customTemplate"
        type="textarea"
        :rows="2"
        :placeholder="'{{raw}}：{{pinyin}}'"
        :label="t('tools.chinese-pinyin-converter.texts.label-custom-template')"
        mt-2
      />
      <div v-if="rawPosition === 'custom'" class="hint" mt-1>
        {{ t('tools.chinese-pinyin-converter.texts.hint-template') }}
      </div>

      <n-collapse mt-2>
        <n-collapse-item :title="t('tools.chinese-pinyin-converter.texts.more-params')" name="more">
          <n-space vertical>
            <c-select
              v-model:value="upperCase"
              :label="t('tools.chinese-pinyin-converter.texts.label-case')"
              label-position="left"
              :options="caseOptions"
            />
            <c-select
              v-model:value="keepUmlaut"
              :label="t('tools.chinese-pinyin-converter.texts.label-umlaut')"
              label-position="left"
              :options="umlautOptions"
            />
            <c-select
              v-model:value="keepUnrecognized"
              :label="t('tools.chinese-pinyin-converter.texts.label-unrecognized')"
              label-position="left"
              :options="unrecognizedOptions"
            />
          </n-space>
        </n-collapse-item>
      </n-collapse>

      <div v-if="dictState === 'error'" class="hint hint-error" mt-2>
        {{ t('tools.chinese-pinyin-converter.texts.hint-error') }}
      </div>
    </c-card>

    <c-card v-if="hasResult" :title="t('tools.chinese-pinyin-converter.texts.title-output')" mb-3>
      <!-- 文字在下：两行共用一个 grid 的列，列宽由 grid 决定 →
           拼音与汉字在任何字体下都对齐（字体度量不再参与对齐计算） -->
      <div v-if="isBelow" class="aligned-block" data-test-id="pinyin-aligned">
        <div class="aligned-grid" :style="{ '--cell-w': `${alignLength}ch` }">
          <template v-for="(cell, index) in alignedCells" :key="index">
            <span class="aligned-py">{{ cell.pinyin }}</span>
            <span class="aligned-hz">{{ cell.char }}</span>
          </template>
        </div>
      </div>
      <input-copyable v-else :value="output" />
      <div flex justify-end mt-2>
        <CopyExportBar :text="output" filename="拼音" />
      </div>
    </c-card>

    <c-card v-if="hasResult" :title="t('tools.chinese-pinyin-converter.texts.title-detail')">
      <div flex justify-end mb-2>
        <CopyExportBar :text="gridText" filename="逐字对照" :rows="gridRows" />
      </div>
      <div class="char-grid">
        <div v-for="(item, index) in items" :key="index" class="char-cell">
          <div class="char">{{ item.char }}</div>
          <div class="char-pinyin">{{ formatItem(item, style, formatOpts) || '-' }}</div>
        </div>
      </div>
      <div v-if="polyphones.length > 0" class="hint" mt-2>
        {{ t('tools.chinese-pinyin-converter.texts.hint-polyphone') }}
      </div>
    </c-card>
  </div>
</template>

<style scoped lang="less">
.pinyin-converter {
  .hint {
    font-size: 13px;
    color: var(--n-text-color-disabled, #999);
  }

  .hint-error {
    color: #d03050;
  }

  /* 「文字在下（对齐注音）」的结果块。
     对齐靠**真实列布局**，不靠空格填充：空格填充隐含「CJK 宽度 = 等宽字体里 2 个
     拉丁字符」，只在拉丁字符恰好 0.5em 的等宽字体下成立（Ubuntu Mono 是，Consolas
     0.55em / Cascadia Code 0.6em 都不是），字体一换汉字列就每列窄几像素、逐列累积。
     这里两行是同一个 grid 的两行、列宽共享，任何字体下都不会错位。
     复制/导出仍是空格填充的等宽文本（粘贴到等宽字体里查看）。 */
  .aligned-block {
    padding: 12px;
    background: rgb(0 0 0 / 4%);
    border-radius: 6px;
    overflow-x: auto;

    .aligned-grid {
      display: grid;
      grid-auto-flow: column;
      grid-template-rows: auto auto;
      grid-auto-columns: minmax(var(--cell-w, 7ch), auto);
      row-gap: 2px;
      // 列不压缩，超宽交给外层滚动（和原来 pre 的 overflow-x 一致）
      width: max-content;
      font-family: 'Ubuntu Mono', 'Cascadia Code', 'Consolas', monospace;
      line-height: 1.5;
    }

    .aligned-py {
      font-size: 13px;
      white-space: nowrap;
      opacity: 0.65;
    }

    .aligned-hz {
      font-size: 18px;
      white-space: nowrap;
    }
  }

  .char-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
    gap: 8px;
  }

  .char-cell {
    padding: 6px 4px;
    border: 1px solid rgb(0 0 0 / 8%);
    border-radius: 6px;
    text-align: center;
  }

  .char {
    font-size: 18px;
  }

  .char-pinyin {
    margin-top: 2px;
    font-size: 12px;
    color: #888;
  }
}
</style>
