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
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { useCopy } from '@/composable/copy';
import relationship from './relationship';

const { t } = useI18n();

/** -1 不限 / 1 男 / 0 女 —— 取值跟库保持一致，别自己另立一套 */
const sex = ref<-1 | 0 | 1>(-1);
/** false = 由关系链查称呼；true = 由称呼反查关系链 */
const reverse = ref(false);
const inputText = ref('');

const relationWords = ['爸爸', '妈妈', '哥哥', '弟弟', '姐姐', '妹妹', '儿子', '女儿', '妻子', '丈夫'];

const sexOptions = computed(() => [
  { value: -1 as const, label: t('tools.kinship-calculator.texts.sex-any') },
  { value: 1 as const, label: t('tools.kinship-calculator.texts.sex-male') },
  { value: 0 as const, label: t('tools.kinship-calculator.texts.sex-female') },
]);

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

      <c-input-text
        v-model:value="inputText"
        :placeholder="
          reverse
            ? t('tools.kinship-calculator.texts.placeholder-reverse')
            : t('tools.kinship-calculator.texts.placeholder-input')
        "
        clearable
        mb-2
      />

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
