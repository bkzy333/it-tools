<script lang="ts" setup>
import IconMessageReport from '~icons/tabler/message-report';
import { useMessage } from 'naive-ui';
import { useRoute } from 'vue-router';

const route = useRoute();
const message = useMessage();

const showModal = ref(false);
const content = ref('');
const contact = ref('');
const submitting = ref(false);

async function submit() {
  const text = content.value.trim();
  if (text.length === 0) {
    message.warning('请先写点什么再提交');
    return;
  }

  submitting.value = true;
  try {
    const response = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tool: route.path,
        toolName: String(route.meta.name ?? ''),
        message: text.slice(0, 2000),
        contact: contact.value.trim().slice(0, 200),
        ua: navigator.userAgent.slice(0, 300),
      }),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    message.success('反馈已提交，感谢！');
    showModal.value = false;
    content.value = '';
    contact.value = '';
  } catch {
    message.error('提交失败，请稍后再试，或直接发邮件告诉我们');
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <c-tooltip tooltip="反馈这个工具的问题" position="bottom">
    <c-button circle variant="text" aria-label="反馈" @click="showModal = true">
      <n-icon size="22" :component="IconMessageReport" />
    </c-button>
  </c-tooltip>

  <n-modal v-model:show="showModal" preset="card" style="max-width: 520px" title="反馈问题">
    <div mb-2 op-70 text-13px>
      当前工具：{{ route.meta.name }}（{{ route.path }}）
    </div>

    <c-input-text
      v-model:value="content"
      placeholder="这个工具有什么问题？计算结果不对、页面报错、还是想加个功能？"
      multiline
      rows="5"
      mb-3
    />

    <c-input-text v-model:value="contact" placeholder="联系方式（选填，方便我们回复你）" mb-3 />

    <div flex justify-end gap-2>
      <c-button @click="showModal = false">取消</c-button>
      <c-button type="primary" :loading="submitting" @click="submit">提交反馈</c-button>
    </div>
  </n-modal>
</template>
