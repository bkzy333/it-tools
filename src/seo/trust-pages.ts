// 信任页文案。AdSense 审核会逐个看这几页在不在、写得像不像真的，
// 所以内容由这里统一提供：Vue 页面（src/pages/TrustPage.vue）和构建期静态 HTML
// 读的是同一份，不会出现"网页上一套、源码里另一套"。
//
// 上线前必须替换：CONTACT_EMAIL 换成你自己的域名邮箱（别用 Gmail）。

import { normalizeRoutePath } from './route-path';

export const SITE_NAME = '在线工具箱';
export const SITE_DOMAIN = 'gjxtools.com';
export const SITE_URL = `https://${SITE_DOMAIN}`;
export const CONTACT_EMAIL = 'zhendafang5202023@163.com';

export interface TrustPageSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface TrustPage {
  path: string;
  title: string;
  description: string;
  h1: string;
  updatedAt: string;
  sections: TrustPageSection[];
}

export const TRUST_PAGES: TrustPage[] = [
  {
    path: '/privacy',
    title: '隐私政策 - 在线工具箱',
    description:
      '在线工具箱的隐私政策：绝大多数工具在浏览器本地完成计算，文件和数据不会上传到服务器；本站接入 Google AdSense，第三方 Cookie 的说明与关闭方式见此页。',
    h1: '隐私政策',
    updatedAt: '2026-10-02',
    sections: [
      {
        heading: '一、核心原则：尽量不收集',
        paragraphs: [
          '本站绝大多数工具是纯前端计算：你输入的文本、上传的图片和文件，都在你自己的浏览器里完成处理，不会上传到我们的服务器，我们也没有保存这些内容的能力。关闭页面后，这些数据即随之消失。',
          '少数工具需要联网获取公开数据（例如汇率、IP 归属查询、天气），这类工具会在页面上明确标注，不会含糊带过。',
        ],
      },
      {
        heading: '二、我们会接触到的信息',
        paragraphs: ['范围很有限，且都不包含你的输入内容：'],
        bullets: [
          '工具使用偏好：你收藏了哪些工具、选择的语言、深色/浅色模式，保存在浏览器的 localStorage 里，仅用于在你本机恢复界面设置',
          '常用工具排序：本机记录你打开过哪些工具（同样只存在浏览器里），只用来把你常用的工具排在前面',
          '热门统计：为展示「热门工具」，我们会记录某个工具被打开的次数。这是匿名计数，不包含身份信息，也和你上传的内容无关',
          '反馈信息：你主动通过「反馈」按钮提交的内容（问题说明 + 选填的联系方式）会被保存，用于改进工具',
          '访问日志：托管与加速服务（Cloudflare）会按常规记录访问 IP、浏览器类型、访问时间等，用于安全和性能统计',
        ],
      },
      {
        heading: '三、Cookie 与广告',
        paragraphs: [
          '本站接入 Google AdSense 广告服务。Google 作为第三方供应商，会使用 Cookie（包括 DoubleClick Cookie）在本站及其他网站上向你展示广告，也可能根据你的访问记录投放个性化广告。',
          '如果你不想看到个性化广告，可以自行关闭：',
        ],
        bullets: [
          'Google 广告设置：https://adssettings.google.com',
          'DAA 退出平台：https://optout.aboutads.info/',
          '欧洲互动广告数字联盟：https://www.youronlinechoices.com/',
        ],
      },
      {
        heading: '四、我们不做什么',
        paragraphs: [
          '我们不出售、不出租你的任何数据；不设置用于追踪你身份的 Cookie；不使用指纹识别；不把你的工具输入内容与广告投放做关联。',
        ],
      },
      {
        heading: '五、你的权利',
        paragraphs: [
          '你可以随时清除浏览器本地存储来删除本站保存在你设备上的偏好设置。如需查询或删除你曾主动提交的反馈内容，发邮件到上面的联系邮箱即可。',
        ],
      },
    ],
  },
  {
    path: '/contact',
    title: '联系我们 - 在线工具箱',
    description: '在线工具箱的联系方式。工具问题、广告问题、版权投诉都可以发邮件，我们会在 48 小时内回复。',
    h1: '联系我们',
    updatedAt: '2026-10-02',
    sections: [
      {
        heading: '邮箱',
        paragraphs: [
          `技术问题、工具报错、功能建议，请发邮件到 ${CONTACT_EMAIL}。我们会在 48 小时内回复，节假日顺延。`,
        ],
        bullets: [
          '工具报错：请附上工具名称、你输入的内容（脱敏后）、浏览器和版本',
          '功能建议：说明你想解决什么问题，比直接说"加个功能"更容易被采纳',
          '广告问题：说明你看到的广告类型和页面地址',
        ],
      },
      {
        heading: '版权与内容投诉',
        paragraphs: [
          '如果你认为本站的某些内容侵犯了你的权益，请发邮件到上面的地址，并附上权属证明和具体页面地址。我们核实后会尽快处理。',
        ],
      },
      {
        heading: '我们不会回复的',
        paragraphs: [
          '本站是一个免费工具集合，不承接定制开发、不提供付费技术支持、不代做作业或项目。这类邮件恕不回复。',
        ],
      },
    ],
  },
  {
    path: '/terms',
    title: '使用条款 - 在线工具箱',
    description: '在线工具箱的使用条款：工具结果仅供参考，加密和哈希类结果不构成安全建议，请勿用于违法用途。',
    h1: '使用条款',
    updatedAt: '2026-10-02',
    sections: [
      {
        heading: '服务的性质',
        paragraphs: [
          '本站提供的是免费在线工具集合，按"现状"提供，不做任何明示或暗示的担保。工具的计算结果仅供参考，因使用本站工具造成的任何损失，本站不承担责任。',
        ],
      },
      {
        heading: '安全相关工具的特别说明',
        paragraphs: [
          '本站提供加密、哈希、签名、证书、密码强度等安全相关工具，它们是用于学习和调试的辅助工具。这些工具的输出**不构成安全建议**，不能作为你系统安全性的依据。',
          '生产环境的密钥生成、密码存储、证书配置请使用经过审计的专业方案，并遵循你所在行业的安全规范。',
        ],
      },
      {
        heading: '禁止的用途',
        paragraphs: [
          '请勿将本站工具用于任何违法用途，包括但不限于：未经授权入侵他人系统、破解他人密码、伪造证书或身份、处理他人隐私数据。',
          '本站保留在发现滥用行为时拒绝提供服务的权利。',
        ],
      },
      {
        heading: '开源与源码',
        paragraphs: [
          '本站以 GNU General Public License v3.0（GPLv3）发布，许可证完整文本见 https://www.gnu.org/licenses/gpl-3.0.html',
          '本站是在开源代码基础上修改而成的版本，相对原始版本做过改动。对应的源代码可以在 https://github.com/bkzy333/it-tools 获取。',
          '按 GPLv3 的要求，任何通过网络使用本站的人，都可以从上述地址取得与本站运行版本相对应的源代码，无需额外付费。',
        ],
      },
      {
        heading: '条款变更',
        paragraphs: ['本条款可能随站点功能调整而更新，更新后会在本页标注新的日期。继续使用本站即视为接受更新后的条款。'],
      },
    ],
  },
];

export function getTrustPage(path: string): TrustPage | undefined {
  // 站内 URL 带尾斜杠（/privacy/），表里的 path 不带 —— 不规范化会查空，
  // 页面整个渲染不出来（v-if="page" 直接 false），静态 HTML 有正文、运行时一片空白。
  const p = normalizeRoutePath(path);
  return TRUST_PAGES.find((page) => page.path === p);
}
