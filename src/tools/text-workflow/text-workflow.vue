<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import ToolExampleButton from '@/components/ToolExampleButton.vue';
import { useCopy } from '@/composable/copy';
import {
  createOp,
  runWorkflow,
  WORKFLOW_OP_TYPES,
  OP_PARAM_KEYS,
  type WorkflowOp,
  type WorkflowOpType,
} from './text-workflow.service';

const { t } = useI18n();
const { copy } = useCopy();

const input = ref('');
const ops = ref<WorkflowOp[]>([]);

const opTypeOptions = computed(() =>
  WORKFLOW_OP_TYPES.map((type) => ({
    value: type,
    label: t(`tools.text-workflow.texts.op-${type}`),
  })),
);

function addOp(type: WorkflowOpType) {
  ops.value.push(createOp(type));
}

function removeOp(index: number) {
  ops.value.splice(index, 1);
}

function moveOp(index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= ops.value.length) return;
  const [item] = ops.value.splice(index, 1);
  ops.value.splice(target, 0, item);
}

const output = computed(() => runWorkflow({ input: input.value, ops: ops.value }));
const canCopy = computed(() => output.value.length > 0);

function copyResult() {
  copy(output.value);
}

function clearAll() {
  input.value = '';
  ops.value = [];
}

const exampleData = {
  input: '  Apple  \nbanana\n\napple\nCherry\nbanana',
  opTypes: ['trim', 'remove-empty', 'lowercase', 'dedupe', 'sort', 'number'] as WorkflowOpType[],
};

function loadExample() {
  input.value = exampleData.input;
  ops.value = exampleData.opTypes.map((type) => {
    const op = createOp(type);
    if (type === 'sort') op.params.mode = 'asc';
    if (type === 'number') {
      op.params.start = '1';
      op.params.step = '1';
    }
    return op;
  });
}

/** 判断某参数是否用下拉（reverse/sort 的 mode） */
function isSelectParam(type: WorkflowOpType, key: string): boolean {
  return (type === 'reverse' || type === 'sort') && key === 'mode';
}

function selectOptionsFor(type: WorkflowOpType, key: string) {
  if (type === 'reverse') {
    return [
      { value: 'lines', label: t('tools.text-workflow.texts.param-reverse-lines') },
      { value: 'chars', label: t('tools.text-workflow.texts.param-reverse-chars') },
    ];
  }
  if (type === 'sort') {
    return [
      { value: 'asc', label: t('tools.text-workflow.texts.param-sort-asc') },
      { value: 'desc', label: t('tools.text-workflow.texts.param-sort-desc') },
    ];
  }
  return [];
}
</script>

<template>
  <c-card :title="t('tools.text-workflow.title')" max-w-900px>
    <div flex items-center justify-between gap-2 mb-2>
      <span />
      <ToolExampleButton @click="loadExample" />
    </div>

    <!-- 左侧：操作面板 -->
    <div grid grid-cols-1 lg:grid-cols-2 gap-4>
      <div>
        <div mb-2 text-sm op-70>{{ t('tools.text-workflow.texts.label-add-op') }}</div>
        <div flex flex-wrap gap-2 mb-3>
          <c-button
            v-for="type in WORKFLOW_OP_TYPES"
            :key="type"
            size="small"
            @click="addOp(type)"
          >
            {{ t(`tools.text-workflow.texts.op-${type}`) }}
          </c-button>
        </div>

        <div mb-2 text-sm op-70>{{ t('tools.text-workflow.texts.label-workflow') }}</div>
        <n-empty v-if="ops.length === 0" size="small" :description="t('tools.text-workflow.texts.hint-no-op')" />
        <div v-else flex flex-col gap-2>
          <div
            v-for="(op, index) in ops"
            :key="op.id"
            flex
            items-start
            gap-2
            rounded-6px
            border-1
            border-solid
            border-(cool-gray-3)
            p-2
          >
            <div flex flex-col gap-1>
              <c-button size="small" quaternary :disabled="index === 0" @click="moveOp(index, -1)">↑</c-button>
              <c-button size="small" quaternary :disabled="index === ops.length - 1" @click="moveOp(index, 1)">↓</c-button>
            </div>

            <div flex-1>
              <div flex items-center justify-between mb-1>
                <span font-600>{{ t(`tools.text-workflow.texts.op-${op.type}`) }}</span>
                <c-button size="small" quaternary type="error" @click="removeOp(index)">×</c-button>
              </div>

              <div v-for="param in OP_PARAM_KEYS[op.type]" :key="param.key" flex items-center gap-2 mt-1>
                <span w-80px shrink-0 text-12px op-70>
                  {{ t(`tools.text-workflow.texts.param-${param.key}`) }}
                </span>
                <c-select
                  v-if="isSelectParam(op.type, param.key)"
                  :value="op.params[param.key]"
                  :options="selectOptionsFor(op.type, param.key)"
                  size="small"
                  @update:value="(v: string) => (op.params[param.key] = v)"
                />
                <n-input
                  v-else
                  :value="op.params[param.key]"
                  size="small"
                  @update:value="(v: string) => (op.params[param.key] = v)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧：输入 / 输出 -->
      <div>
        <n-form-item :label="t('tools.text-workflow.texts.label-input')" label-placement="left" mb-1>
          <n-input
            v-model:value="input"
            type="textarea"
            :rows="8"
            :placeholder="t('tools.text-workflow.texts.placeholder-input')"
          />
        </n-form-item>

        <c-card :title="t('tools.text-workflow.texts.title-result')" size="small" mt-3>
          <n-input :value="output" type="textarea" :rows="8" readonly
            :placeholder="t('tools.text-workflow.texts.placeholder-result')" />
          <div flex items-center gap-2 mt-2>
            <c-button type="primary" :disabled="!canCopy" @click="copyResult">
              {{ t('tools.text-workflow.texts.action-copy') }}
            </c-button>
            <c-button @click="clearAll">{{ t('tools.text-workflow.texts.action-clear') }}</c-button>
          </div>
        </c-card>
      </div>
    </div>
  </c-card>
</template>
