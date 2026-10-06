<script lang="ts" setup>
/**
 * 「一键示例」按钮 —— 所有工具共用的新手指引入口。
 *
 * 为什么需要它：it-tools 里大量工具的输入框默认是空的，用户第一次进来面对一个
 * 空文本域，不知道该填什么、也不知道这个工具跑完长什么样，几秒钟就跳出去了。
 * 填上真实例子，工具的作用不用文字解释就明白了。
 *
 * 用法约定（新增工具时必须遵守）：
 *   1. 工具组件里定义一份 exampleData —— 要真实、要能跑出有代表性的结果；
 *   2. 模板的主操作区放 <ToolExampleButton @click="loadExample" />；
 *   3. loadExample() 把 exampleData 填进各个输入框。
 *
 * 本组件刻意保持"无状态"：它不知道任何工具的输入结构，只负责做按钮 + tooltip，
 * 数据怎么填由工具自己管。这样给 480 多个工具接入时不需要改这个组件。
 */
import IconBulb from '~icons/tabler/bulb';

withDefaults(
  defineProps<{
    /** 按钮文案，默认「一键示例」 */
    label?: string;
    /** 悬停提示，说明点了会发生什么 */
    hint?: string;
    /** 工具本身没有可填的输入时置为 true（比如纯展示类工具） */
    disabled?: boolean;
  }>(),
  {
    label: '一键示例',
    hint: '不知道从哪开始？点一下自动填入一组示例数据，立刻看到这个工具的效果。',
    disabled: false,
  },
);

const emit = defineEmits<{ click: [event: MouseEvent] }>();
</script>

<template>
  <c-tooltip :tooltip="hint" position="bottom">
    <c-button
      size="small"
      round
      :disabled="disabled"
      aria-label="填入示例数据"
      class="tool-example-button"
      @click="emit('click', $event)"
    >
      <span flex items-center gap-1>
        <n-icon :size="15" :component="IconBulb" />
        {{ label }}
      </span>
    </c-button>
  </c-tooltip>
</template>

<style lang="less" scoped>
.tool-example-button {
  // 这是个引导性入口，但也别抢工具本身主按钮的视觉重心
  flex-shrink: 0;
}
</style>
