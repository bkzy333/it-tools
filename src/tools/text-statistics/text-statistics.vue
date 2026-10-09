<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
// 时长格式化原本由 eta-calculator 工具提供，该工具已下线，实现内联到本目录。
import { formatMsDuration } from './duration-format.service';
import { getStringSizeInBytes, textStatistics, wordFrequency } from './text-statistics.service';
import { formatBytes } from '@/utils/convert';

const { t } = useI18n();

const text = ref('');
const activeTab = ref<'stats' | 'frequency'>('stats');
const stats = computed(() => textStatistics(text.value));

// 词频统计选项
const excludeStopwords = ref(false);
const excludeSingleCjk = ref(false);
const excludeDigits = ref(false);
const topN = ref(50);

const frequency = computed(() =>
  wordFrequency(text.value, {
    excludeStopwords: excludeStopwords.value,
    excludeSingleCjk: excludeSingleCjk.value,
    excludeDigits: excludeDigits.value,
    topN: Number(topN.value) || 50,
  }),
);

const maxFrequency = computed(() => frequency.value[0]?.count ?? 1);

/**
 * 示例用一段真实的中英混排内容：
 * 中文没有空格，字符数、字数、字节数三者的差距才是这个工具真正要展示的信息，
 * 用 "hello world" 这种纯英文例子根本看不出 UTF-8 下一个汉字占 3 个字节这件事。
 */
const exampleData = {
  text: '在线工具箱是一个完全在浏览器里运行的工具集合，所有计算都在本地完成，数据不会上传到服务器。\nIt works offline, and it is free.\n\n第一段用来看中文的字数统计，第二段用来看英文的单词计数。',
};

function loadExample() {
  text.value = exampleData.text;
}
</script>

<template>
  <div flex justify-end mb-2>
    <ToolExampleButton @click="loadExample" />
  </div>

  <c-card>
    <c-input-text
      v-model:value="text"
      multiline
      :placeholder="t('tools.text-statistics.texts.placeholder-your-text')"
      rows="5"
    />

    <n-tabs v-model:value="activeTab" type="line" animated mt-3>
      <n-tab-pane name="stats" :tab="t('tools.text-statistics.texts.tab-stats')">
        <n-space mt-3>
          <n-statistic :label="t('tools.text-statistics.texts.label-character-count')" :value="stats.chars" />
          <n-statistic :label="t('tools.text-statistics.texts.label-word-count')" :value="stats.words" />
          <n-statistic :label="t('tools.text-statistics.texts.label-sentences-count')" :value="stats.sentences" />
          <n-statistic :label="t('tools.text-statistics.texts.label-line-count')" :value="stats.lines" />
          <n-statistic
            :label="t('tools.text-statistics.texts.label-byte-size')"
            :value="formatBytes(getStringSizeInBytes(text))"
          />
        </n-space>

        <n-divider />

        <n-space mt-3>
          <n-statistic :label="t('tools.text-statistics.texts.label-unique-word-count')" :value="stats.words_uniques" />
          <n-statistic
            :label="t('tools.text-statistics.texts.label-unique-word-count-case-insensitive')"
            :value="stats.words_uniques_ci"
          />
          <n-statistic
            :label="t('tools.text-statistics.texts.label-read-time')"
            :value="formatMsDuration(stats.read_time * 1000)"
          />
        </n-space>

        <n-divider />

        <n-space>
          <n-statistic :label="t('tools.text-statistics.texts.label-chars-no-spaces')" :value="stats.chars_no_spaces" />
          <n-statistic :label="t('tools.text-statistics.texts.label-uppercase-chars')" :value="stats.chars_upper" />
          <n-statistic :label="t('tools.text-statistics.texts.label-lowercase-chars')" :value="stats.chars_lower" />
          <n-statistic :label="t('tools.text-statistics.texts.label-digit-chars')" :value="stats.chars_digits" />
          <n-statistic :label="t('tools.text-statistics.texts.label-punctuations')" :value="stats.chars_puncts" />
          <n-statistic :label="t('tools.text-statistics.texts.label-spaces-chars')" :value="stats.chars_spaces" />
          <n-statistic :label="t('tools.text-statistics.texts.label-word-count-no-punct')" :value="stats.words_no_puncs" />
        </n-space>
      </n-tab-pane>

      <n-tab-pane name="frequency" :tab="t('tools.text-statistics.texts.tab-frequency')">
        <div flex flex-wrap items-center gap-4 mt-3>
          <n-checkbox v-model:checked="excludeStopwords">
            {{ t('tools.text-statistics.texts.opt-exclude-stopwords') }}
          </n-checkbox>
          <n-checkbox v-model:checked="excludeSingleCjk">
            {{ t('tools.text-statistics.texts.opt-exclude-single-cjk') }}
          </n-checkbox>
          <n-checkbox v-model:checked="excludeDigits">
            {{ t('tools.text-statistics.texts.opt-exclude-digits') }}
          </n-checkbox>
          <div flex items-center gap-2>
            <span text-13px op-70>{{ t('tools.text-statistics.texts.label-top-n') }}</span>
            <n-input-number v-model:value="topN" :min="1" :max="500" :show-button="false" w-100px />
          </div>
        </div>

        <n-empty v-if="frequency.length === 0" size="small" mt-3
          :description="t('tools.text-statistics.texts.hint-no-frequency')" />
        <div v-else mt-3 flex flex-col gap-1>
          <div
            v-for="item in frequency"
            :key="item.word"
            flex
            items-center
            gap-2
          >
            <span w-120px shrink-0 text-right text-13px truncate>{{ item.word }}</span>
            <div flex-1 h-18px rounded-3px bg-(cool-gray-1) relative overflow-hidden>
              <div
                absolute
                inset-y-0
                left-0
                rounded-3px
                bg-(primary)
                :style="{ width: `${(item.count / maxFrequency) * 100}%` }"
              />
            </div>
            <span w-40px shrink-0 text-13px op-70>{{ item.count }}</span>
          </div>
        </div>
      </n-tab-pane>
    </n-tabs>
  </c-card>
</template>
