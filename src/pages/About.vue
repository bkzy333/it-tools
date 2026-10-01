<script setup lang="ts">
import { useHead } from '@vueuse/head';
import { useMessage } from 'naive-ui';
import { storeToRefs } from 'pinia';
import { useToolStore } from '@/tools/tools.store';

// ===================== 上线前请改成你自己的信息 =====================
const SITE_NAME = '在线工具箱';
const SITE_DOMAIN = 'https://gjxtools.com';
const CONTACT_EMAIL = '【你的联系邮箱】';
// ==================================================================

useHead({
  title: `关于 - ${SITE_NAME}`,
  meta: [
    {
      name: 'description',
      content: `${SITE_NAME}是一个完全免费的在线工具合集，涵盖 PDF、图片、文本、单位换算、加密、日期计算等工具，全部在浏览器本地运行，数据不上传服务器。`,
    },
  ],
});

const toolStore = useToolStore();
const { favoriteToolsName } = storeToRefs(toolStore);

const message = useMessage();
const importFavoritesJson = ref('');

function importFavorites() {
  try {
    favoriteToolsName.value = JSON.parse(importFavoritesJson.value);
    message.success('收藏导入成功');
  } catch (e: any) {
    message.error(`导入失败：${e?.message ?? e}`);
  }
}

const favoritesJson = computed(() => JSON.stringify(favoriteToolsName.value));
</script>

<template>
  <div class="about-page">
    <n-card :title="`关于${SITE_NAME}`" mx-auto mt-50px>
      <p>
        {{ SITE_NAME }}是一个<b>完全免费</b>的在线工具合集，收录了 {{ toolStore.tools.length }} 个实用工具，涵盖
        PDF 处理、图片编辑、文本转换、单位换算、加密解密、日期计算、网络工具等日常场景。
      </p>
      <p>打开网页就能用，<b>无需注册、无需下载安装、不收取任何费用</b>。</p>
    </n-card>

    <n-card title="为什么用它" mx-auto mt-30px>
      <ul class="feature-list">
        <li><b>隐私安全</b>：绝大多数工具直接在你的浏览器里完成计算，文件和数据不会上传到任何服务器。</li>
        <li><b>随手可用</b>：电脑、手机浏览器都能打开，界面自适应小屏幕。</li>
        <li><b>收藏功能</b>：把常用工具加进收藏，左侧菜单置顶显示。</li>
        <li><b>深色模式</b>：右上角可切换跟随系统 / 浅色 / 深色。</li>
        <li><b>多语言</b>：默认简体中文，右上角可切换其他语言。</li>
      </ul>
    </n-card>

    <n-card title="收藏导入" mx-auto mt-30px>
      <p class="hint">换设备或换浏览器时，把之前导出的内容粘贴到这里，即可恢复收藏列表。</p>
      <c-input-text
        v-model:value="importFavoritesJson"
        placeholder="把之前导出的 JSON 数组粘贴到这里"
        multiline
        monospace
        mb-2
      />
      <c-button @click="importFavorites">导入收藏</c-button>
    </n-card>

    <n-card title="收藏导出" mx-auto mt-30px>
      <p class="hint">复制下面的内容保存起来，之后可在「收藏导入」中恢复。</p>
      <textarea-copyable v-model:value="favoritesJson" />
    </n-card>

    <n-card title="联系方式" mx-auto mt-30px>
      <p>
        站点地址：<c-link :href="SITE_DOMAIN" target="_blank" rel="noopener">{{ SITE_DOMAIN }}</c-link>
      </p>
      <p>问题反馈与建议：{{ CONTACT_EMAIL }}</p>
      <p class="hint">
        如果你发现某个工具计算有误、页面显示异常，或有想要新增的工具，欢迎通过上面的邮箱告诉我们。
      </p>
    </n-card>

    <n-card title="隐私政策" mx-auto mt-30px>
      <p class="hint">
        本站工具在你的浏览器本地运行，文件和数据不会上传到服务器。详细说明见
        <c-link to="/privacy">隐私政策</c-link>。
      </p>
    </n-card>

    <n-card title="免责声明" mx-auto mt-30px mb-50px>
      <p class="hint">
        本站工具的计算结果仅供参考，不构成专业建议。涉及财务、医疗、法律等重要事项，请以权威机构的结果为准。
      </p>
      <p class="hint">本站基于开源项目 IT Tools 构建，在 GPLv3 许可下使用与修改。</p>
    </n-card>
  </div>
</template>

<style lang="less" scoped>
.about-page {
  max-width: 800px;
  margin: 0 auto;
  padding: 0 12px 40px;
  box-sizing: border-box;

  p {
    margin: 0 0 10px;
    line-height: 1.8;
    opacity: 0.85;
  }

  .feature-list {
    margin: 0;
    padding-left: 20px;

    li {
      margin-bottom: 8px;
      line-height: 1.8;
      opacity: 0.85;
    }
  }

  .hint {
    font-size: 13px;
    opacity: 0.65;
  }
}
</style>
