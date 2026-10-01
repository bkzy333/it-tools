<script setup lang="ts">
import { useHead } from '@vueuse/head';

// ===================== 上线前请改成你自己的信息 =====================
const SITE_NAME = '在线工具箱';
const SITE_DOMAIN = 'https://gjxtools.com';
const CONTACT_EMAIL = 'zhendafang5202023@163.com';
// ==================================================================

const desc = `${SITE_NAME}的隐私政策：绝大多数工具在你的浏览器本地完成计算，文件和数据不会上传到服务器；本站使用 Cookie 与第三方广告服务。`;

useHead({
  title: `隐私政策 - ${SITE_NAME}`,
  meta: [
    { name: 'description', content: desc },
    { property: 'og:title', content: `隐私政策 - ${SITE_NAME}` },
    { property: 'og:description', content: desc },
  ],
});
</script>

<template>
  <div class="privacy-page">
    <n-card :title="`隐私政策`" mx-auto mt-50px>
      <p class="hint">最近更新：2026 年 10 月 1 日</p>
      <p>
        欢迎使用{{ SITE_NAME }}（{{ SITE_DOMAIN }}）。我们非常重视你的隐私，本页说明我们会接触哪些信息、怎么用，以及你有哪些选择。
      </p>
    </n-card>

    <n-card title="一、核心原则：尽量不收集" mx-auto mt-30px>
      <p>
        本站绝大多数工具是<b>纯前端计算</b>：你输入的文本、上传的图片和文件，都在你自己的浏览器里完成处理，
        <b>不会上传到我们的服务器</b>，我们也没有保存这些内容的能力。关闭页面后，这些数据即随之消失。
      </p>
      <p>少数工具需要联网获取公开数据（例如汇率、IP 归属查询），这类工具会在页面上明确标注。</p>
    </n-card>

    <n-card title="二、我们会接触到的信息" mx-auto mt-30px>
      <ul class="list">
        <li><b>工具使用偏好</b>：例如你收藏了哪些工具、选择的语言、深色/浅色模式，保存在你浏览器的本地存储（localStorage）里，仅用于在你本机恢复界面设置。</li>
        <li><b>热门统计</b>：为展示「热门工具」，我们会记录某个工具被打开的次数。这是<b>匿名计数</b>，不包含你的身份信息，也和你上传的内容无关。</li>
        <li><b>反馈信息</b>：你主动通过「反馈」按钮提交的内容（问题说明 + 选填的联系方式）会被保存，用于改进工具。</li>
        <li><b>访问日志</b>：我们使用的托管与加速服务（Cloudflare）会按常规记录访问 IP、浏览器类型、访问时间等，用于安全和性能统计。</li>
      </ul>
    </n-card>

    <n-card title="三、Cookie 与广告" mx-auto mt-30px>
      <p>
        本站接入了 <b>Google AdSense</b> 广告服务。Google 作为第三方供应商，会使用 Cookie（包括 DoubleClick Cookie）
        在本站及其他网站上向你展示广告；它也可能根据你的访问记录投放个性化广告。
      </p>
      <p>如果你不想看到个性化广告，可以自行关闭：</p>
      <ul class="list">
        <li>Google 广告设置：<c-link href="https://adssettings.google.com" target="_blank"
            rel="noopener">https://adssettings.google.com</c-link></li>
        <li>第三方 Cookie 停用：<c-link href="https://aboutads.info" target="_blank"
            rel="noopener">https://aboutads.info</c-link></li>
      </ul>
      <p class="hint">
        你也可以直接在浏览器设置里清除或屏蔽 Cookie。请注意，屏蔽 Cookie 可能影响本站部分功能的正常使用。
      </p>
    </n-card>

    <n-card title="四、第三方服务" mx-auto mt-30px>
      <p>本站使用了以下第三方服务，它们各自有其隐私政策：</p>
      <ul class="list">
        <li><b>Cloudflare</b>：网站托管、CDN 加速与安全防护</li>
        <li><b>Google AdSense</b>：广告投放与统计</li>
        <li><b>jsDelivr / 公共 CDN</b>：部分开源库与模型文件加载</li>
      </ul>
    </n-card>

    <n-card title="五、儿童隐私" mx-auto mt-30px>
      <p>本站面向大众，不会故意收集 13 岁以下儿童的个人信息。如果你是监护人并发现相关情况，请通过下方邮箱联系我们，我们会尽快删除。</p>
    </n-card>

    <n-card title="六、政策更新" mx-auto mt-30px>
      <p>本站可能会不时更新本隐私政策，更新后会在本页公布新的日期。继续使用本站即视为接受更新后的内容。</p>
    </n-card>

    <n-card title="七、联系我们" mx-auto mt-30px mb-50px>
      <p>
        站点地址：<c-link :href="SITE_DOMAIN" target="_blank" rel="noopener">{{ SITE_DOMAIN }}</c-link>
      </p>
      <p>隐私问题与数据删除请求：{{ CONTACT_EMAIL }}</p>
    </n-card>
  </div>
</template>

<style lang="less" scoped>
.privacy-page {
  max-width: 800px;
  margin: 0 auto;
  padding: 0 12px 40px;
  box-sizing: border-box;

  p {
    margin: 0 0 10px;
    line-height: 1.8;
    opacity: 0.85;
  }

  .list {
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
