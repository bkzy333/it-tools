<script lang="ts" setup>
// 联系我们 / 使用条款 / Cookie 政策 / 开源声明 四个页面共用这个组件，
// 文案全部来自 src/seo/trust-pages.ts —— 和构建期生成的静态 HTML 同源，
// 改文案只需要改那一个文件。
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { getTrustPage, CONTACT_EMAIL } from '@/seo/trust-pages';

const route = useRoute();
const page = computed(() => getTrustPage(route.path));
</script>

<template>
  <div v-if="page" class="trust-page">
    <h1>{{ page.h1 }}</h1>
    <p class="updated">最后更新：{{ page.updatedAt }}</p>

    <section v-for="(section, index) in page.sections" :key="index">
      <h2>{{ section.heading }}</h2>
      <p v-for="(paragraph, pIndex) in section.paragraphs" :key="pIndex">{{ paragraph }}</p>
      <ul v-if="section.bullets">
        <li v-for="(bullet, bIndex) in section.bullets" :key="bIndex">{{ bullet }}</li>
      </ul>
    </section>

    <p class="contact-hint">
      有问题可以发邮件到
      <a :href="`mailto:${CONTACT_EMAIL}`">{{ CONTACT_EMAIL }}</a>
    </p>
  </div>
</template>

<style lang="less" scoped>
.trust-page {
  max-width: 820px;
  margin: 0 auto;
  padding: 40px 16px 60px;
  box-sizing: border-box;
  line-height: 1.8;

  h1 {
    font-size: 28px;
    font-weight: 600;
    margin: 0 0 6px;
  }

  h2 {
    font-size: 19px;
    font-weight: 600;
    margin: 32px 0 10px;
  }

  p,
  li {
    font-size: 15px;
    margin: 0 0 10px;
    opacity: 0.85;
  }

  ul {
    padding-left: 22px;
  }
}

.updated {
  font-size: 13px;
  opacity: 0.6;
  margin-bottom: 24px;
}

.contact-hint {
  margin-top: 40px;
  padding-top: 16px;
  border-top: 1px solid rgba(128, 128, 128, 0.2);
  font-size: 14px;

  a {
    color: inherit;
  }
}
</style>
