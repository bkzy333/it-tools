// 构建期把 SPA 的单一 index.html 展开成 500+ 份各自独立的静态 HTML。
//
// 要解决的问题：it-tools 是 SPA，所有路由都回退到同一个 index.html，爬虫看到的
// 只有一个空壳页面（body 里只有一个 <div id="app">），title/description 还是
// 客户端用 @vueuse/head 注入的 —— 这是 AdSense 判"低价值内容"的直接原因。
//
// 思路：build 之后，拿 dist/index.html 当模板，为每个路由写出一份独立 HTML，
// 里面带自己的 title / description / canonical / OG / JSON-LD，以及**服务端就存在
// 的正文**（说明、步骤、示例、FAQ、相关工具内链、面包屑）。爬虫不执行 JS 也能读全。
//
// 关键设计 —— 这不是 cloaking：
// 静态正文塞在 <div id="app"> 里作为预渲染内容，Vue mount 后替换成交互版。
// 两份内容由同一份数据（src/seo/content/*）驱动，用户看到的和爬虫读到的是一回事，
// 这就是标准的 hydration 行为。千万不要让静态版和用户版说不一样的话。

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Plugin } from 'vite';
import { build as viteBuild } from 'vite';

const SITE_URL = (process.env.HOSTNAME ?? 'https://gjxtools.com').replace(/\/+$/, '');
const SITE_NAME = '在线工具箱';

// sitemap 优先级：L1 深耕页最高，教程和分类页是内链枢纽，L2 次之
const PRIORITY = { L1: '0.9', L2: '0.6', category: '0.8', guide: '0.7', page: '0.5' };

interface ToolMeta {
  path: string;
  slug: string;
  title: string;
  description: string;
  keywords: string[];
  category: string;
  categoryZh: string;
  categorySeoName: string;
  redirectFrom: string[];
  npmPackages: string[];
  isExternalAccess: boolean;
  tier: 'L1' | 'L2' | 'L3';
}

interface ToolContent {
  intro: string;
  steps: string[];
  tips: string[];
  faq: { q: string; a: string }[];
  example?: { input: string; output: string; note?: string };
}

// ------------------------------------------------------------------ 工具函数

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 页面绝对地址，统一带尾斜杠。
 *
 * Cloudflare Pages 会把 /x/index.html 规范化成 /x/，请求 /x 时返回 308 跳到 /x/。
 * canonical、sitemap、JSON-LD 里的 url 如果写成不带斜杠的形式，就等于每个页面都
 * 声明了一个「和实际地址不一致」的规范地址，白白多一层跳转。
 */
function url(p: string): string {
  const full = `${SITE_URL}${p.startsWith('/') ? p : `/${p}`}`;
  return full.endsWith('/') ? full : `${full}/`;
}

/** 站内相对链接同样带尾斜杠，减少点击时的跳转 */
function href(p: string): string {
  return p.endsWith('/') ? p : `${p}/`;
}

/** 分类页 URL：/category/json */
function categorySlug(category: string): string {
  return category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/**
 * 换掉 head 里所有跟 SEO 相关的标签，再插入本页自己的一套。
 * 逐个扫描 meta 而不是用固定正则，是因为 dist/index.html 里的 meta 被格式化成了
 * 多行（`<meta\n name="description"\n content="..."\n/>`），单行正则匹配不到。
 */
function rewriteHead(html: string, opts: {
  title: string;
  description: string;
  keywords: string;
  /** 省略就不输出 canonical / og:url / hreflang —— 404 页用，它没有规范的自己 */
  canonical?: string;
  robots?: string;
  ogType?: string;
  jsonLd: unknown[];
}): string {
  const dropPattern = /^(?:description|keywords|author|robots|itemprop)$|^og:/i;
  const dropName = new Set(['description', 'keywords', 'author', 'robots', 'itemprop']);

  // 1) 删掉旧的 description / keywords / canonical / og:* / twitter:* / itemprop
  let out = html.replace(/<meta\b[\s\S]*?\/?>/g, (tag) => {
    const nameMatch = tag.match(/\bname\s*=\s*"([^"]*)"/);
    const propMatch = tag.match(/\bproperty\s*=\s*"([^"]*)"/);
    const key = nameMatch?.[1] ?? propMatch?.[1] ?? '';
    const isTwitter = key.toLowerCase().startsWith('twitter:');
    if (dropName.has(key.toLowerCase()) || dropPattern.test(key) || isTwitter) {
      return '';
    }
    return tag;
  });

  out = out.replace(/<link\s+rel="canonical"[^>]*>/g, '');

  // 2) 换 title
  out = out.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(opts.title)}</title>`);

  const fullTitle = opts.title;
  const tags = [
    `<meta name="description" content="${esc(opts.description)}">`,
    opts.keywords ? `<meta name="keywords" content="${esc(opts.keywords)}">` : '',
    opts.robots ? `<meta name="robots" content="${esc(opts.robots)}">` : '',
    opts.canonical ? `<link rel="canonical" href="${esc(opts.canonical)}">` : '',
    `<meta property="og:type" content="${opts.ogType ?? 'website'}">`,
    `<meta property="og:site_name" content="${esc(SITE_NAME)}">`,
    opts.canonical ? `<meta property="og:url" content="${esc(opts.canonical)}">` : '',
    `<meta property="og:title" content="${esc(fullTitle)}">`,
    `<meta property="og:description" content="${esc(opts.description)}">`,
    `<meta property="og:image" content="${SITE_URL}/banner.png?v=2">`,
    `<meta property="og:locale" content="zh_CN">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(fullTitle)}">`,
    `<meta name="twitter:description" content="${esc(opts.description)}">`,
    `<meta name="twitter:image" content="${SITE_URL}/banner.png?v=2">`,
    // 中文主站，其他语言是客户端切换、URL 不变，所以 x-default 指向自己
    opts.canonical ? `<link rel="alternate" hreflang="zh-CN" href="${esc(opts.canonical)}">` : '',
    opts.canonical ? `<link rel="alternate" hreflang="x-default" href="${esc(opts.canonical)}">` : '',
    ...opts.jsonLd.map(
      (ld) => `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`,
    ),
  ].filter(Boolean);

  return out.replace(/<\/head>/i, `    ${tags.join('\n    ')}\n  </head>`);
}

const STATIC_STYLE = `
  #seo-static{max-width:820px;margin:0 auto;padding:24px 16px 48px;box-sizing:border-box;
    font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#333;line-height:1.8}
  #seo-static h1{font-size:28px;font-weight:600;margin:0 0 12px;line-height:1.3}
  #seo-static h2{font-size:19px;font-weight:600;margin:32px 0 10px;line-height:1.4}
  #seo-static p,#seo-static li{font-size:15px;margin:0 0 10px}
  #seo-static ol,#seo-static ul{padding-left:22px;margin:0 0 10px}
  #seo-static .seo-lead{font-size:16px;opacity:.85}
  #seo-static .seo-crumb{font-size:13px;opacity:.7;margin-bottom:16px}
  #seo-static .seo-crumb a{color:inherit;text-decoration:none}
  #seo-static .seo-crumb a:hover{text-decoration:underline}
  #seo-static a.seo-link{color:#185fa5;text-decoration:none}
  #seo-static a.seo-link:hover{text-decoration:underline}
  #seo-static pre{background:#f5f6f8;border:1px solid #e3e5e8;border-radius:8px;padding:12px 14px;
    overflow-x:auto;font-size:13px;line-height:1.6;font-family:ui-monospace,Consolas,monospace}
  #seo-static code{font-family:ui-monospace,Consolas,monospace}
  #seo-static details{border:1px solid #e3e5e8;border-radius:8px;padding:10px 14px;margin-bottom:10px}
  #seo-static summary{cursor:pointer;font-weight:500;font-size:15px}
  #seo-static .seo-tags{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
  #seo-static .seo-tag{display:inline-block;padding:5px 12px;border:1px solid rgba(128,128,128,.25);
    border-radius:16px;font-size:13px;text-decoration:none;color:inherit}
  #seo-static .seo-note{font-size:13px;opacity:.7;margin-top:6px}
  @media (prefers-color-scheme:dark){
    #seo-static{color:#e5e5e5}
    #seo-static pre{background:#242424;border-color:#3a3a3a}
    #seo-static details{border-color:#3a3a3a}
    #seo-static a.seo-link{color:#7fb2e5}
  }
`;

/** 把静态正文塞进 <div id="app">，Vue mount 后会替换掉（标准 hydration） */
function injectBody(html: string, bodyHtml: string): string {
  const target = `<div id="app"><div id="seo-static">${bodyHtml}</div></div>`;
  // 允许标签里有空白（压缩器可能写成 <div id="app" >），但必须是空的
  const emptyApp = /<div id="app"\s*>\s*<\/div>/;
  if (emptyApp.test(html)) {
    return html.replace(emptyApp, target);
  }
  // 走到这里说明模板没被 stripExistingStatic 处理干净，直接抛错好过静默产出错页
  throw new Error('seo-prerender: 模板里找不到空的 <div id="app"></div>，静态正文无法注入');
}

function injectStyle(html: string): string {
  // 幂等：模板可能带着上一次构建注入的样式（首页那次会写回 dist/index.html）
  const cleaned = html.replace(/<style id="seo-static-style">[\s\S]*?<\/style>/, '');
  return cleaned.replace(/<\/head>/i, `    <style id="seo-static-style">${STATIC_STYLE}</style>\n  </head>`);
}

/**
 * 把模板还原成纯 SPA 空壳。
 *
 * 首页那一版静态 HTML 会写回 dist/index.html，于是这份文件在下次构建时既当产物又当模板。
 * 如果构建没有重新生成它（比如 outDir 没被清空），读进来的就是带静态内容的旧首页，
 * 后面 injectBody 找不到 `<div id="app"></div>` 就会静默跳过 —— 结果是几百个页面
 * 全都有着首页的正文。这里先把上一次的痕迹剥掉，保证每次都从干净的空壳出发。
 */
function stripExistingStatic(html: string): string {
  const openTag = '<div id="app">';
  const start = html.indexOf(openTag);
  if (start === -1) {
    return html;
  }

  // 按 div 嵌套深度找到 #app 的配对闭合标签。
  // 早先这里是正则 + 前瞻 `(?=\s*<script)`，但 Vite 会在 </div> 之后插入
  // <link rel="preload">（脚本排在后面），前瞻一旦失配就整段失效 —— 几百个页面
  // 会全部沿用上一次的正文。数深度不依赖后面跟着什么，稳得多。
  const OPEN = /<div\b/g;
  const CLOSE = /<\/div>/g;
  let depth = 1;
  let pos = start + openTag.length;

  while (depth > 0) {
    OPEN.lastIndex = pos;
    CLOSE.lastIndex = pos;
    const nextOpen = OPEN.exec(html);
    const nextClose = CLOSE.exec(html);
    const openIdx = nextOpen ? nextOpen.index : Number.POSITIVE_INFINITY;
    const closeIdx = nextClose ? nextClose.index : Number.POSITIVE_INFINITY;

    // 标签配不上对，说明模板结构不是预期的，原样返回让后面的 injectBody 报错
    if (openIdx === Number.POSITIVE_INFINITY && closeIdx === Number.POSITIVE_INFINITY) {
      return html;
    }
    if (closeIdx < openIdx) {
      depth -= 1;
      pos = closeIdx + '</div>'.length;
    } else {
      depth += 1;
      pos = openIdx + '<div'.length;
    }
  }

  return `${html.slice(0, start)}<div id="app"></div>${html.slice(pos)}`;
}

function breadcrumbHtml(items: { name: string; href?: string }[]): string {
  const parts = items.map((item, i) => {
    const label = esc(item.name);
    const sep = i > 0 ? ' <span aria-hidden="true">/</span> ' : '';
    return `${sep}${item.href ? `<a href="${esc(item.href)}">${label}</a>` : `<span>${label}</span>`}`;
  });
  return `<nav class="seo-crumb" aria-label="面包屑">${parts.join('')}</nav>`;
}

function breadcrumbLd(items: { name: string; href?: string }[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      ...(item.href ? { item: url(item.href) } : {}),
    })),
  };
}

// ------------------------------------------------------------------ 页面渲染

function renderToolPage(tool: ToolMeta, content: ToolContent | undefined, related: ToolMeta[]): string {
  const bc = [
    { name: '首页', href: '/' },
    { name: tool.categoryZh, href: `/category/${categorySlug(tool.category)}` },
    { name: tool.title },
  ];

  const parts: string[] = [breadcrumbHtml(bc), `<h1>${esc(tool.title)}</h1>`];

  if (content) {
    parts.push(`<p class="seo-lead">${esc(content.intro)}</p>`);
    // 工具本体是 Vue 渲染的，静态版只能说明它会加载出来，不能假装它已经在那儿
    parts.push(
      `<p class="seo-note">工具界面在页面加载完成后显示在本段下方，可以直接使用。${
        tool.isExternalAccess
          ? '注意：这个工具需要访问外部服务才能拿到结果。'
          : '所有计算都在你的浏览器本地完成，输入的内容不会上传到服务器。'
      }</p>`,
    );

    parts.push(`<h2>${esc(tool.title)}能做什么</h2>`, `<p>${esc(content.intro)}</p>`);
    parts.push(
      `<h2>怎么用${esc(tool.title)}</h2>`,
      `<ol>${content.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`,
    );
    if (content.example) {
      parts.push(
        `<h2>示例</h2>`,
        `<p>输入：</p><pre><code>${esc(content.example.input)}</code></pre>`,
        `<p>输出：</p><pre><code>${esc(content.example.output)}</code></pre>`,
        content.example.note ? `<p class="seo-note">${esc(content.example.note)}</p>` : '',
      );
    }
    if (content.tips.length > 0) {
      parts.push(
        `<h2>使用技巧与注意点</h2>`,
        `<ul>${content.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`,
      );
    }
    if (content.faq.length > 0) {
      parts.push(
        `<h2>常见问题</h2>`,
        content.faq
          .map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`)
          .join(''),
      );
    }
  } else {
    // L2 / L3：没有手写长文，用工具自身的中文名+描述+分类上下文拼装，保证每页文字不重样
    parts.push(`<p class="seo-lead">${esc(tool.description)}</p>`);
    parts.push(
      `<p class="seo-note">工具界面在页面加载完成后显示在本段下方，可以直接使用。${
        tool.isExternalAccess ? '这个工具需要访问外部服务才能拿到结果。' : '所有计算都在浏览器本地完成，数据不会上传。'
      }</p>`,
    );
    parts.push(
      `<h2>${esc(tool.title)}是什么</h2>`,
      `<p>${esc(tool.title)}属于${esc(tool.categoryZh)}分类。${esc(tool.description)}它是一个网页版工具，打开就能用，不需要下载安装，也不需要注册账号。</p>`,
      `<h2>怎么用</h2>`,
      `<ol><li>在页面上方输入或上传你要处理的内容</li><li>按需要调整选项</li><li>结果会实时显示，可以直接复制或下载</li></ol>`,
    );
  }

  if (related.length > 0) {
    parts.push(
      `<h2>相关工具</h2>`,
      `<div class="seo-tags">${related
        .map((t) => `<a class="seo-tag" href="${esc(href(t.path))}">${esc(t.title)}</a>`)
        .join('')}</div>`,
    );
  }

  parts.push(
    `<h2>同类${esc(tool.categoryZh)}工具</h2>`,
    `<p><a class="seo-link" href="/category/${categorySlug(tool.category)}/">查看全部${esc(tool.categoryZh)}工具</a></p>`,
  );

  return parts.filter(Boolean).join('\n');
}

function renderCategoryPage(category: string, categoryZh: string, seoName: string, tools: ToolMeta[]): string {
  const bc = [{ name: '首页', href: '/' }, { name: categoryZh }];

  // 列表给全量：像 Physics / Cheatsheets 这类分类里所有工具都被划进了 noindex，
  // 只列可索引的会得到一个「共 0 个工具」的空壳页，比不建这个页面还糟。
  // 可索引的排前面，剩下的照常列出 —— 用户照样找得到，页面也有真内容。
  const ordered = [...tools.filter((t) => t.tier !== 'L3'), ...tools.filter((t) => t.tier === 'L3')];

  const list = ordered
    .map(
      (t) =>
        `<li><a class="seo-link" href="${esc(href(t.path))}">${esc(t.title)}</a> — ${esc(t.description)}</li>`,
    )
    .join('');

  return [
    breadcrumbHtml(bc),
    `<h1>${esc(seoName)}</h1>`,
    `<p class="seo-lead">${esc(
      `${categoryZh}分类共收录 ${tools.length} 个免费在线工具，全部在浏览器里运行，不用注册、不用安装，打开网页就能用。`,
    )}</p>`,
    `<h2>全部${esc(categoryZh)}工具（${tools.length} 个）</h2>`,
    `<ul>${list}</ul>`,
    `<h2>关于${esc(categoryZh)}</h2>`,
    `<p>${esc(
      `这一页汇总了本站所有${categoryZh}相关的工具。每个工具点进去都能直接使用，处理过程在浏览器本地完成，输入的数据不会上传到服务器。`,
    )}</p>`,
  ].join('\n');
}

function renderGuidePage(
  front: { title: string; description: string; relatedTools: string[] },
  html: string,
  toolTitleByPath: Map<string, string>,
): string {
  const bc = [{ name: '首页', href: '/' }, { name: '教程' }, { name: front.title }];
  const links = front.relatedTools
    .map((p) => `<a class="seo-tag" href="${esc(href(p))}">${esc(toolTitleByPath.get(p) ?? p)}</a>`)
    .join('');

  return [
    breadcrumbHtml(bc),
    `<div class="seo-article">${html}</div>`,
    links ? `<h2>相关工具</h2><div class="seo-tags">${links}</div>` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function renderTrustPage(page: TrustPage): string {
  const bc = [{ name: '首页', href: '/' }, { name: page.h1 }];
  const parts = [
    breadcrumbHtml(bc),
    `<h1>${esc(page.h1)}</h1>`,
    `<p class="seo-note">最后更新：${esc(page.updatedAt)}</p>`,
  ];
  for (const section of page.sections) {
    parts.push(`<h2>${esc(section.heading)}</h2>`);
    for (const paragraph of section.paragraphs) {
      parts.push(`<p>${esc(paragraph)}</p>`);
    }
    if (section.bullets && section.bullets.length > 0) {
      parts.push(`<ul>${section.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`);
    }
  }
  return parts.join('\n');
}

// ------------------------------------------------------------------ 内容加载

interface TrustPageSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

interface TrustPage {
  path: string;
  title: string;
  description: string;
  h1: string;
  updatedAt: string;
  sections: TrustPageSection[];
}

/**
 * src/seo 下的内容都是 TS，Node 不能直接 import。用 vite 自己把它打成一份
 * 临时 ESM 再加载 —— 避免为了构建期读数据去引入额外的转译依赖。
 */
async function loadSeoData(root: string): Promise<{
  content: Record<string, ToolContent>;
  trustPages: TrustPage[];
}> {
  const entry = path.join(root, 'src/seo/seo-entry.ts');
  if (!fs.existsSync(entry)) {
    return { content: {}, trustPages: [] };
  }
  const outDir = path.join(root, 'node_modules/.cache/it-tools-seo');
  fs.mkdirSync(outDir, { recursive: true });

  await viteBuild({
    root,
    configFile: false,
    logLevel: 'error',
    build: {
      ssr: entry,
      outDir,
      // 不要动这个目录里的既有内容：vite 默认还会把 public/ 整个拷进来（figlet-fonts
      // 有几百个文件），再配合 emptyOutDir 就会变成一次几百文件的批量删除。
      // 这里只需要产出/覆盖那一个 content.mjs，所以两个开关都关掉。
      copyPublicDir: false,
      emptyOutDir: false,
      minify: false,
      write: true,
      target: 'node18',
      rollupOptions: { output: { format: 'es', entryFileNames: 'content.mjs' } },
    },
  });

  const mod = await import(pathToFileURL(path.join(outDir, 'content.mjs')).href);
  return {
    content: (mod.allToolContent ?? {}) as Record<string, ToolContent>,
    trustPages: (mod.TRUST_PAGES ?? []) as TrustPage[],
  };
}

// 复用了运行时的同一份实现：静态 HTML 和 Vue 渲染出的教程内容必须逐字一致，
// 解析逻辑分叉会直接造成 cloaking。
import { parseFrontmatter } from '../src/seo/frontmatter';
import { GUIDE_INDEX } from '../src/seo/guide-index';

/**
 * 核对 src/seo/guide-index.ts 和 md 原文里的标题是否一致。
 * 首页显示教程链接用的是轻量索引，这里保证它不会和实际文章漂移。
 */
function assertGuideIndex(actual: Map<string, string>): void {
  const problems: string[] = [];

  for (const entry of GUIDE_INDEX) {
    const realTitle = actual.get(entry.slug);
    if (realTitle === undefined) {
      problems.push(`索引里有 ${entry.slug}，但 src/seo/guides/ 下找不到对应文章`);
    } else if (realTitle !== entry.title) {
      problems.push(`${entry.slug} 标题不一致：索引写「${entry.title}」，md 里是「${realTitle}」`);
    }
  }
  for (const slug of actual.keys()) {
    if (!GUIDE_INDEX.some((e) => e.slug === slug)) {
      problems.push(`文章 ${slug} 没写进 src/seo/guide-index.ts，首页不会显示它的链接`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`seo-prerender: 教程索引和 md 对不上，请修正 src/seo/guide-index.ts：\n- ${problems.join('\n- ')}`);
  }
}

// ------------------------------------------------------------------ 插件主体

export function seoPrerender(): Plugin {
  // Vite 多环境（client / ssr / PWA）下 closeBundle 可能被触发多次。第二次进来时
  // dist/index.html 已经被上一轮写成了"带静态正文的首页"，再生成一遍纯属浪费，
  // 而且会让 sitemap 里出现重复条目。这里保证一次进程只跑一次。
  let hasRendered = false;

  return {
    name: 'it-tools:seo-prerender',
    apply: 'build',
    enforce: 'post',

    async closeBundle() {
      if (hasRendered) {
        return;
      }
      const root = process.cwd();
      const dist = path.join(root, 'dist');
      const templatePath = path.join(dist, 'index.html');

      if (!fs.existsSync(templatePath)) {
        this.warn('seo-prerender: dist/index.html 不存在，跳过静态化');
        return;
      }

      // 关键：先剥掉上一次构建可能残留的静态内容，否则几百个页面会共用首页正文
      const template = stripExistingStatic(fs.readFileSync(templatePath, 'utf-8'));
      const metaPath = path.join(root, 'src/seo/tools-meta.json');
      if (!fs.existsSync(metaPath)) {
        this.error('seo-prerender: 缺少 src/seo/tools-meta.json，请先跑 scripts/extract-tools-meta.mjs');
        return;
      }
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      const tools: ToolMeta[] = meta.tools;
      const { content, trustPages } = await loadSeoData(root);

      const byCategory = new Map<string, ToolMeta[]>();
      for (const tool of tools) {
        const list = byCategory.get(tool.category) ?? [];
        list.push(tool);
        byCategory.set(tool.category, list);
      }
      const titleByPath = new Map(tools.map((t) => [t.path, t.title]));

      const written: { loc: string; priority: string }[] = [];

      /** 写一份静态页：dist/<route>/index.html */
      const emit = (route: string, html: string) => {
        const rel = route === '/' ? 'index.html' : path.join(route.replace(/^\/+|\/+$/g, ''), 'index.html');
        const full = path.join(dist, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, html, 'utf-8');
      };

      // ---------- 1. 工具页 ----------
      for (const tool of tools) {
        const related = (byCategory.get(tool.category) ?? [])
          .filter((t) => t.path !== tool.path && t.tier !== 'L3')
          .slice(0, 8);

        const body = renderToolPage(tool, content[tool.path], related);
        const noindex = tool.tier === 'L3';
        const description = content[tool.path]?.intro
          ? `${content[tool.path].intro.slice(0, 110)}…`
          : tool.description;

        const jsonLd: unknown[] = [
          {
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'WebApplication',
                name: tool.title,
                applicationCategory: 'DeveloperApplication',
                operatingSystem: '任何（浏览器）',
                description: tool.description,
                url: url(tool.path),
                offers: { '@type': 'Offer', price: '0', priceCurrency: 'CNY' },
                browserRequirements: '需要启用 JavaScript',
              },
              breadcrumbLd([
                { name: '首页', href: '/' },
                { name: tool.categoryZh, href: `/category/${categorySlug(tool.category)}` },
                { name: tool.title },
              ]),
            ],
          },
        ];

        const faq = content[tool.path]?.faq ?? [];
        if (faq.length > 0) {
          jsonLd.push({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: faq.map((f) => ({
              '@type': 'Question',
              name: f.q,
              acceptedAnswer: { '@type': 'Answer', text: f.a },
            })),
          });
        }

        let html = injectStyle(template);
        html = injectBody(html, body);
        html = rewriteHead(html, {
          title: `${tool.title} - ${SITE_NAME}`,
          description,
          keywords: tool.keywords.slice(0, 12).join(','),
          canonical: url(tool.path),
          robots: noindex ? 'noindex,follow' : undefined,
          ogType: 'website',
          jsonLd,
        });
        emit(tool.path, html);

        if (!noindex) {
          written.push({ loc: tool.path, priority: tool.tier === 'L1' ? PRIORITY.L1 : PRIORITY.L2 });
        }

        // 旧地址（redirectFrom）：静态页输出成带 canonical 指向新地址的副本，
        // 这样老链接不会 404，也不会和新地址抢收录
        for (const old of tool.redirectFrom) {
          let legacy = injectStyle(template);
          legacy = injectBody(legacy, body);
          legacy = rewriteHead(legacy, {
            title: `${tool.title} - ${SITE_NAME}`,
            description,
            keywords: tool.keywords.slice(0, 12).join(','),
            canonical: url(tool.path),
            robots: 'noindex,follow',
            jsonLd: [],
          });
          emit(old, legacy);
        }
      }

      // ---------- 2. 分类页 ----------
      for (const [category, list] of byCategory) {
        const slug = categorySlug(category);
        const categoryZh = list[0]?.categoryZh ?? category;
        const seoName = list[0]?.categorySeoName ?? categoryZh;
        const route = `/category/${slug}`;
        const indexedCount = list.filter((t) => t.tier !== 'L3').length;
        // 整个分类没有一个可索引工具时，这个聚合页本身也别进索引
        const categoryNoindex = indexedCount === 0;

        const body = renderCategoryPage(category, categoryZh, seoName, list);
        let html = injectStyle(template);
        html = injectBody(html, body);
        html = rewriteHead(html, {
          title: indexedCount > 0 ? `${seoName} - ${indexedCount} 个免费工具 - ${SITE_NAME}` : `${seoName} - ${SITE_NAME}`,
          description: `${seoName}，共 ${list.length} 个免费在线工具，全部浏览器本地运行，无需注册。`,
          keywords: `${categoryZh},${seoName},在线工具`,
          canonical: url(route),
          robots: categoryNoindex ? 'noindex,follow' : undefined,
          jsonLd: [
            {
              '@context': 'https://schema.org',
              '@graph': [
                {
                  '@type': 'CollectionPage',
                  name: seoName,
                  description: `${categoryZh}分类的在线工具汇总`,
                  url: url(route),
                },
                breadcrumbLd([{ name: '首页', href: '/' }, { name: categoryZh }]),
              ],
            },
          ],
        });
        emit(route, html);
        if (!categoryNoindex) {
          written.push({ loc: route, priority: PRIORITY.category });
        }
      }

      // ---------- 3. 教程页 ----------
      const guidesDir = path.join(root, 'src/seo/guides');
      if (fs.existsSync(guidesDir)) {
        const { default: MarkdownIt } = await import('markdown-it');
        const md = new MarkdownIt({ html: true, linkify: true, typographer: false });
        const guideTitles = new Map<string, string>();

        for (const file of fs.readdirSync(guidesDir).filter((f) => f.endsWith('.md'))) {
          const raw = fs.readFileSync(path.join(guidesDir, file), 'utf-8');
          const { data, body } = parseFrontmatter(raw);
          const slug = String(data.slug ?? file.replace(/\.md$/, ''));
          const title = String(data.title ?? slug);
          const description = String(data.description ?? '');
          const keywords = Array.isArray(data.keywords) ? (data.keywords as string[]).join(',') : '';
          const relatedTools = Array.isArray(data.relatedTools) ? (data.relatedTools as string[]) : [];
          const route = `/guide/${slug}`;

          const articleHtml = md.render(body);
          const pageBody = renderGuidePage({ title, description, relatedTools }, articleHtml, titleByPath);

          let html = injectStyle(template);
          html = injectBody(html, pageBody);
          html = rewriteHead(html, {
            title: `${title} - ${SITE_NAME}`,
            description,
            keywords,
            canonical: url(route),
            ogType: 'article',
            jsonLd: [
              {
                '@context': 'https://schema.org',
                '@graph': [
                  {
                    '@type': 'Article',
                    headline: title,
                    description,
                    url: url(route),
                    inLanguage: 'zh-CN',
                    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
                  },
                  breadcrumbLd([{ name: '首页', href: '/' }, { name: '教程' }, { name: title }]),
                ],
              },
            ],
          });
          emit(route, html);
          written.push({ loc: route, priority: PRIORITY.guide });
          guideTitles.set(slug, title);
        }

        // 首页要在 Vue 里显示教程链接，用的是 src/seo/guide-index.ts 里那份轻量索引。
        // 索引和 md 里的标题一旦对不上，首页链接文案就会和教程页标题不一致，
        // 所以这里直接卡死，逼着改索引而不是等上线后才发现。
        assertGuideIndex(guideTitles);
      }

      // ---------- 4. 信任页（隐私政策 / 联系我们 / 使用条款 / Cookie / 开源声明） ----------
      for (const page of trustPages) {
        const body = renderTrustPage(page);
        let html = injectStyle(template);
        html = injectBody(html, body);
        html = rewriteHead(html, {
          title: page.title,
          description: page.description,
          keywords: '',
          canonical: url(page.path),
          jsonLd: [breadcrumbLd([{ name: '首页', href: '/' }, { name: page.h1 }])],
        });
        emit(page.path, html);
        written.push({ loc: page.path, priority: PRIORITY.page });
      }

      // ---------- 5. 关于页 ----------
      // About.vue 带收藏导入/清除本地数据这些交互，保留原页面不动。
      // 这里只补一段和它开头一致的静态简介，避免爬虫第一波抓到空页。
      {
        const body = [
          breadcrumbHtml([{ name: '首页', href: '/' }, { name: '关于' }]),
          `<h1>关于${esc(SITE_NAME)}</h1>`,
          `<p class="seo-lead">${esc(
            `${SITE_NAME}是一个完全免费的在线工具合集，收录了 ${tools.length} 个实用工具，涵盖 PDF、图片、文本、单位换算、加密解密、日期计算、网络工具等，全部在浏览器本地运行，数据不上传服务器。`,
          )}</p>`,
          `<h2>数据怎么处理</h2>`,
          `<p>绝大多数工具是纯前端计算，你输入的文本、上传的图片和文件都在你自己的浏览器里处理，不会上传到服务器。少数需要联网获取公开数据的工具（如汇率、IP 归属、天气）会在页面上明确标注。</p>`,
          `<h2>开源与许可</h2>`,
          `<p>本站基于开源项目 it-tools（GPLv3 协议）修改而来，改动清单和许可证说明见<a class="seo-link" href="/open-source">开源声明</a>。</p>`,
          `<h2>联系与条款</h2>`,
          `<p><a class="seo-link" href="/contact">联系我们</a>｜<a class="seo-link" href="/privacy">隐私政策</a>｜<a class="seo-link" href="/terms">使用条款</a>｜<a class="seo-link" href="/cookies">Cookie 政策</a></p>`,
        ].join('\n');

        let html = injectStyle(template);
        html = injectBody(html, body);
        html = rewriteHead(html, {
          title: `关于 - ${SITE_NAME}`,
          description: `${SITE_NAME}是一个完全免费的在线工具合集，收录 ${tools.length} 个实用工具，全部在浏览器本地运行，数据不上传服务器。`,
          keywords: '在线工具箱,关于我们,在线工具',
          canonical: url('/about'),
          jsonLd: [breadcrumbLd([{ name: '首页', href: '/' }, { name: '关于' }])],
        });
        emit('/about', html);
        written.push({ loc: '/about', priority: PRIORITY.page });
      }

      // ---------- 6. 首页：补上静态的分类导航，让爬虫第一波就能抓到内链 ----------
      {
        const homeCategories = [...byCategory.entries()]
          .filter(([, list]) => list.some((t) => t.tier !== 'L3'))
          .map(([category, list]) => ({
            name: list[0].categoryZh,
            seoName: list[0].categorySeoName,
            slug: categorySlug(category),
            count: list.filter((t) => t.tier !== 'L3').length,
          }));

        const topTools = tools.filter((t) => t.tier === 'L1').slice(0, 40);
        const homeBody = [
          `<h1>${SITE_NAME} - 免费实用的在线工具合集</h1>`,
          `<p class="seo-lead">收录 ${tools.filter((t) => t.tier !== 'L3').length} 个免费在线工具：文本处理、JSON 格式化、加密解密、单位换算、图片处理、PDF 工具、日期计算、网络工具等，全部在浏览器本地运行，无需注册，数据不上传服务器。</p>`,
          `<h2>按分类浏览</h2>`,
          `<div class="seo-tags">${homeCategories
            .map((c) => `<a class="seo-tag" href="/category/${c.slug}/">${esc(c.name)}（${c.count}）</a>`)
            .join('')}</div>`,
          `<h2>热门工具</h2>`,
          `<div class="seo-tags">${topTools
            .map((t) => `<a class="seo-tag" href="${esc(href(t.path))}">${esc(t.title)}</a>`)
            .join('')}</div>`,
          `<h2>开发教程</h2>`,
          // 用索引而不是写死几篇：Vue 版首页渲染的是同一份 GUIDE_INDEX，
          // 静态版少列几篇就会变成两套内容
          `<ul>${GUIDE_INDEX.map(
            (g) => `<li><a class="seo-link" href="/guide/${esc(g.slug)}/">${esc(g.title)}</a></li>`,
          ).join('')}</ul>`,
        ].join('\n');

        let html = injectStyle(template);
        html = injectBody(html, homeBody);
        html = rewriteHead(html, {
          title: `${SITE_NAME} - 免费实用的在线工具合集`,
          description: `收录 ${tools.filter((t) => t.tier !== 'L3').length} 个免费在线工具：文本、JSON、加密解密、单位换算、图片、PDF、日期计算等，全部浏览器本地运行，无需注册，数据不上传。`,
          keywords: '在线工具,在线工具箱,实用工具,JSON格式化,Base64,单位换算,加密解密,二维码生成',
          canonical: `${SITE_URL}/`,
          jsonLd: [
            {
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: SITE_NAME,
              url: `${SITE_URL}/`,
              inLanguage: 'zh-CN',
              potentialAction: {
                '@type': 'SearchAction',
                target: `${SITE_URL}/?q={search_term_string}`,
                'query-input': 'required name=search_term_string',
              },
            },
          ],
        });
        fs.writeFileSync(templatePath, html, 'utf-8');
        written.push({ loc: '/', priority: '1.0' });
      }

      // ---------- 6.5 404 页 ----------
      // 必须有顶层 404.html：Cloudflare Pages 只在没有它的时候才启用 SPA 兜底，
      // 而 SPA 兜底会让任何乱敲的 URL 都返回 200 + 首页内容（软 404），
      // Google 会把这些当成一大堆重复页面。有了这个文件，未知路径才返回真正的 404。
      {
        const topTools = tools.filter((t) => t.tier === 'L1').slice(0, 12);
        const notFoundBody = [
          `<h1>页面不存在</h1>`,
          `<p class="seo-lead">这个地址没有对应的页面，可能是链接过期或者输入有误。下面是本站常用的几个入口。</p>`,
          `<h2>热门工具</h2>`,
          `<div class="seo-tags">${topTools
            .map((t) => `<a class="seo-tag" href="${esc(href(t.path))}">${esc(t.title)}</a>`)
            .join('')}</div>`,
          `<h2>按分类浏览</h2>`,
          `<div class="seo-tags">${[...byCategory.entries()]
            .filter(([, list]) => list.some((t) => t.tier !== 'L3'))
            .map(
              ([category, list]) =>
                `<a class="seo-tag" href="/category/${categorySlug(category)}/">${esc(list[0].categoryZh)}</a>`,
            )
            .join('')}</div>`,
          `<p><a class="seo-link" href="/">返回首页</a></p>`,
        ].join('\n');

        let html = injectStyle(template);
        html = injectBody(html, notFoundBody);
        html = rewriteHead(html, {
          title: `页面不存在 - ${SITE_NAME}`,
          description: `这个地址没有对应的页面，可以看看本站的工具分类和热门工具。`,
          keywords: '',
          // 404 页没有「规范的自己」，不输出 canonical / hreflang；
          // 而且它绝不能进索引，否则会多出一堆垃圾页
          robots: 'noindex,follow',
          jsonLd: [],
        });
        // 注意：404.html 必须写在 dist 根目录，不能放进 dist/404/index.html
        fs.writeFileSync(path.join(dist, '404.html'), html, 'utf-8');
      }

      // ---------- 7. sitemap.xml ----------
      const today = new Date().toISOString().slice(0, 10);
      const urls = [...written]
        .sort((a, b) => a.loc.localeCompare(b.loc))
        .map((e) => `  <url>\n    <loc>${url(e.loc)}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${e.priority}</priority>\n  </url>`)
        .join('\n');

      fs.writeFileSync(
        path.join(dist, 'sitemap.xml'),
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
        'utf-8',
      );

      fs.writeFileSync(
        path.join(dist, 'robots.txt'),
        [
          'User-agent: *',
          'Allow: /',
          '',
          '# 生效前提：静态化后每个路由都有自己的 index.html，不再需要 SPA 回退',
          `Sitemap: ${SITE_URL}/sitemap.xml`,
          '',
        ].join('\n'),
        'utf-8',
      );

      const l1 = tools.filter((t) => t.tier === 'L1').length;
      const l2 = tools.filter((t) => t.tier === 'L2').length;
      const l3 = tools.filter((t) => t.tier === 'L3').length;
      hasRendered = true;
      this.info(
        `seo-prerender: 工具页 ${tools.length}（L1 ${l1} / L2 ${l2} / L3 noindex ${l3}）+ 分类页 ${byCategory.size} + 教程页 ${
          fs.existsSync(guidesDir) ? fs.readdirSync(guidesDir).filter((f) => f.endsWith('.md')).length : 0
        }，sitemap 收录 ${written.length} 条`,
      );
    },
  };
}
