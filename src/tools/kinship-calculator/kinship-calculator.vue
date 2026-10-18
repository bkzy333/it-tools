<script setup lang="ts">
/**
 * 亲戚关系计算器（也叫「亲戚称呼计算器」「辈分计算器」）。
 *
 * 算法用的是 mumuy/relationship —— 一个 MIT 许可的中文亲属关系库，内置三万多条
 * 「关系链 → 称谓」映射，见同目录 LICENSE-relationship.txt。这类映射没法靠代码
 * 推导，只能靠数据，所以直接接成熟库而不是自己造。
 *
 * 关于 sex 参数（这里容易踩坑）：库里的 sex 是「我自己的性别」，它决定配偶只能往
 * 哪个方向走 —— 选男时只能用「妻子」，选女时只能用「丈夫」，填反了直接算不出结果。
 * 所以默认给 -1（不限），两个配偶按钮点哪个都有结果，第一次用的人不会被卡住；
 * 想要更准的说法（比如区分「岳父 / 公公」）再选自己的性别。
 *
 * 关于反查模式的输入框：库里 21.9 万个称谓绝大多数是「舅鼻祖父」这类只存在于族谱
 * 的说法，所以不能把库里的词全塞进下拉框（输入「舅」会冒出 8000 多条）。候选来自
 * 人工收敛的常用表 `kinship-titles.ts`，每条都验过能被库反查出来 —— 点了一定有结果。
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { useCopy } from '@/composable/copy';
import { suggestKinshipTitles } from './kinship-titles';
import relationship from './relationship';

const { t } = useI18n();

/** -1 不限 / 1 男 / 0 女 —— 取值跟库保持一致，别自己另立一套 */
const sex = ref<-1 | 0 | 1>(-1);
/** false = 由关系链查称呼；true = 由称呼反查关系链 */
const reverse = ref(false);
const inputText = ref('');

/**
 * 最多往菜单里塞 12 条候选（菜单本身约一屏显示 8 条，其余滚动看）。
 * 命中超过 12 条时用下方提示告诉用户「共 N 个候选」，引导继续输入缩小范围 ——
 * 打「孙」这种宽泛的字能命中 25 个，全塞进菜单会让人往下翻半天。
 */
const SUGGESTION_LIMIT = 12;

const relationWords = ['爸爸', '妈妈', '哥哥', '弟弟', '姐姐', '妹妹', '儿子', '女儿', '妻子', '丈夫'];

const sexOptions = computed(() => [
  { value: -1 as const, label: t('tools.kinship-calculator.texts.sex-any') },
  { value: 1 as const, label: t('tools.kinship-calculator.texts.sex-male') },
  { value: 0 as const, label: t('tools.kinship-calculator.texts.sex-female') },
]);

/**
 * 反查模式下的候选称呼。正查模式的输入是一条关系链（「爸爸的妈妈」），
 * 拿称谓去补全会给出完全不搭的候选，所以那边一律不给下拉。
 */
const suggestions = computed(() => {
  if (!reverse.value) {
    return { items: [] as string[], total: 0 };
  }
  return suggestKinshipTitles(inputText.value, SUGGESTION_LIMIT);
});

const suggestionOptions = computed(() =>
  suggestions.value.items.map((title) => ({ label: title, value: title })),
);

const hiddenSuggestionCount = computed(() =>
  suggestions.value.total > suggestions.value.items.length ? suggestions.value.total : 0,
);

/**
 * 候选菜单的最大高度（naive-ui 的 InternalSelectMenu 用的是 max-height，菜单会按内容
 * 收缩、超出才滚动）。全站默认 500px（见 src/themes.ts），12 条候选在手机上是半屏还多，
 * 而且会把页面标题整块盖住，所以这里按实例压到 280px：桌面一屏能看八条左右，多的滚一下。
 */
const MENU_THEME_OVERRIDES = { peers: { InternalSelectMenu: { height: '280px' } } };

const results = computed<string[]>(() => {
  const text = inputText.value.trim();
  if (!text) {
    return [];
  }
  try {
    return relationship({ text, sex: sex.value, reverse: reverse.value }) ?? [];
  } catch {
    // 库对个别输入会抛错，工具页不该跟着崩，吞掉并按「算不出来」处理
    return [];
  }
});

const primaryResult = computed(() => results.value[0] ?? '');
const otherResults = computed(() => results.value.slice(1));
const resultText = computed(() => results.value.join(' / '));

const { copy } = useCopy({ source: resultText, text: t('tools.kinship-calculator.texts.copied') });

const exampleData = {
  forward: '爸爸的妈妈',
  reverse: '舅舅',
};

function loadExample() {
  inputText.value = reverse.value ? exampleData.reverse : exampleData.forward;
}

/** 输入框清空时 naive-ui 会抛 null，这里统一收敛成空串，避免下游 .trim() 炸掉 */
function onInputChange(value: string | null) {
  inputText.value = value ?? '';
}

/** 往关系链末尾追加一环，例如「爸爸」再点「妈妈」得到「爸爸的妈妈」 */
function appendWord(word: string) {
  inputText.value = inputText.value ? `${inputText.value}的${word}` : word;
}

/** 退掉关系链的最后一环 */
function backspace() {
  const parts = inputText.value.split('的');
  parts.pop();
  inputText.value = parts.join('的');
}

function switchMode(next: boolean) {
  if (reverse.value === next) {
    return;
  }
  reverse.value = next;
  // 两种模式填的东西不是一回事（关系链 vs 称呼），切换时清掉免得算出莫名其妙的结果
  inputText.value = '';
}
</script>

<template>
  <div flex flex-col gap-3>
    <div flex justify-end>
      <ToolExampleButton @click="loadExample" />
    </div>

    <c-card :title="t('tools.kinship-calculator.texts.title-input')">
      <div flex items-center gap-2 mb-3 flex-wrap>
        <span text-sm op-70>{{ t('tools.kinship-calculator.texts.label-mode') }}</span>
        <c-button size="small" :type="reverse ? 'default' : 'primary'" @click="switchMode(false)">
          {{ t('tools.kinship-calculator.texts.mode-forward') }}
        </c-button>
        <c-button size="small" :type="reverse ? 'primary' : 'default'" @click="switchMode(true)">
          {{ t('tools.kinship-calculator.texts.mode-reverse') }}
        </c-button>
      </div>

      <div flex items-center gap-2 mb-3 flex-wrap>
        <span text-sm op-70>{{ t('tools.kinship-calculator.texts.label-my-sex') }}</span>
        <c-button
          v-for="option in sexOptions"
          :key="option.value"
          size="small"
          :type="sex === option.value ? 'primary' : 'default'"
          @click="sex = option.value"
        >
          {{ option.label }}
        </c-button>
      </div>

      <!--
        两种模式共用一个输入框：反查模式挂候选称呼，正查模式 options 为空、就是普通输入框。
        刻意用 n-auto-complete 而不是自己拿 c-input-text 拼下拉 —— 中文输入法打字时按回车
        是「上屏候选字」，自己拼很容易把这个回车当成选中项，n-auto-complete 内部处理了
        composition 事件。
      -->
      <n-auto-complete
        :value="inputText"
        :options="suggestionOptions"
        :placeholder="
          reverse
            ? t('tools.kinship-calculator.texts.placeholder-reverse')
            : t('tools.kinship-calculator.texts.placeholder-input')
        "
        :input-props="{ autocomplete: 'off', spellcheck: false, 'aria-label': t('tools.kinship-calculator.texts.label-title-input') }"
        :theme-overrides="MENU_THEME_OVERRIDES"
        clearable
        mb-2
        @update:value="onInputChange"
      />

      <div v-if="hiddenSuggestionCount" mb-2 text-xs op-60>
        {{ t('tools.kinship-calculator.texts.hint-suggest-more', { count: hiddenSuggestionCount }) }}
      </div>

      <div v-if="!reverse" mt-2>
        <div grid grid-cols-5 gap-2>
          <c-button v-for="word in relationWords" :key="word" @click="appendWord(word)">
            {{ word }}
          </c-button>
        </div>
        <div flex gap-2 mt-2>
          <c-button size="small" @click="backspace">
            {{ t('tools.kinship-calculator.texts.btn-backspace') }}
          </c-button>
          <c-button size="small" @click="inputText = ''">
            {{ t('tools.kinship-calculator.texts.btn-clear') }}
          </c-button>
        </div>
        <div mt-2 text-sm op-60>
          {{ t('tools.kinship-calculator.texts.hint-forward') }}
        </div>
      </div>
      <div v-else mt-2 text-sm op-60>
        {{ t('tools.kinship-calculator.texts.hint-reverse') }}
      </div>
    </c-card>

    <c-card :title="t('tools.kinship-calculator.texts.title-result')">
      <div v-if="results.length" flex flex-col gap-2>
        <div text-3xl font-bold>{{ primaryResult }}</div>
        <div v-if="otherResults.length" op-70>
          {{ t('tools.kinship-calculator.texts.label-also') }}{{ otherResults.join('、') }}
        </div>
        <div>
          <c-button size="small" @click="copy()">
            {{ t('tools.kinship-calculator.texts.btn-copy') }}
          </c-button>
        </div>
      </div>
      <div v-else op-60>
        {{
          inputText.trim()
            ? t('tools.kinship-calculator.texts.hint-no-result')
            : t('tools.kinship-calculator.texts.hint-empty')
        }}
      </div>
    </c-card>
  </div>
</template>

<style scoped>
/*
 * 窄屏把输入框字号提到 16px：iOS Safari 在聚焦 font-size < 16px 的输入框时会自动放大
 * 整页，用户得再捏合缩回去 —— 而这个工具的主交互就是「打字看下拉 -> 点候选」，
 * 一放大整个流程就断了。只改本页这个输入框，不动全站字号。
 */
@media (max-width: 640px) {
  .n-auto-complete :deep(.n-input__input-el) {
    font-size: 16px;
  }
}
</style>
