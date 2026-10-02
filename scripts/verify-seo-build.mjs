#!/usr/bin/env node
// 构建产物自检：确认静态化真的生效了，而不是"看起来生成了一堆文件"。
//
// 用法：node scripts/verify-seo-build.mjs
// 退出码非 0 表示有问题，可以直接拿去当 CI 门禁。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

const problems = [];
const notes = [];

function fail(msg) {
  problems.push(msg);
}

if (!fs.existsSync(dist)) {
  console.error('dist/ 不存在，先跑一次构建');
  process.exit(1);
}

// ---------------------------------------------------------------- 1. 页面数量
const metaPath = path.join(root, 'src/seo/tools-meta.json');
const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
const tools = meta.tools;

function pageExists(route) {
  const rel = route === '/' ? 'index.html' : path.join(route.replace(/^\/+|\/+$/g, ''), 'index.html');
  return fs.existsSync(path.join(dist, rel));
}

let missing = 0;
for (const tool of tools) {
  if (!pageExists(tool.path)) {
    missing += 1;
    if (missing <= 5) {
      fail(`工具页未生成: ${tool.path}`);
    }
  }
}
if (missing > 5) {
  fail(`工具页未生成: 还有 ${missing - 5} 个`);
}

const categories = [...new Set(tools.map((t) => t.category))];
for (const category of categories) {
  const slug = category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  if (!pageExists(`/category/${slug}`)) {
    fail(`分类页未生成: /category/${slug}`);
  }
}

const guidesDir = path.join(root, 'src/seo/guides');
if (fs.existsSync(guidesDir)) {
  for (const file of fs.readdirSync(guidesDir).filter((f) => f.endsWith('.md'))) {
    const slug = file.replace(/\.md$/, '');
    if (!pageExists(`/guide/${slug}`)) {
      fail(`教程页未生成: /guide/${slug}`);
    }
  }
}

const htmlCount = (function count(dir) {
  let n = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'assets' || entry.name === 'figlet-fonts') {
        continue;
      }
      n += count(full);
    } else if (entry.name.endsWith('.html')) {
      n += 1;
    }
  }
  return n;
})(dist);

notes.push(`dist 下 HTML 文件总数: ${htmlCount}`);

// ---------------------------------------------------------------- 2. 抽查正文
// 抽 L1 / L2 / L3 / 分类页 / 教程页各几个，确认每页都有真东西
const samples = [
  ...tools.filter((t) => t.tier === 'L1').slice(0, 6).map((t) => ({ route: t.path, kind: 'L1' })),
  ...tools.filter((t) => t.tier === 'L2').slice(0, 3).map((t) => ({ route: t.path, kind: 'L2' })),
  ...tools.filter((t) => t.tier === 'L3').slice(0, 3).map((t) => ({ route: t.path, kind: 'L3' })),
  { route: `/category/${categories[0].toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, kind: '分类页' },
  { route: '/guide/what-is-jwt', kind: '教程页' },
  { route: '/', kind: '首页' },
  // AdSense 审核会逐个看这几页，必须真的生成且内容完整
  { route: '/privacy', kind: '信任页' },
  { route: '/contact', kind: '信任页' },
  { route: '/terms', kind: '信任页' },
  { route: '/cookies', kind: '信任页' },
  { route: '/open-source', kind: '信任页' },
  { route: '/about', kind: '关于页' },
];

function readPage(route) {
  const rel = route === '/' ? 'index.html' : path.join(route.replace(/^\/+|\/+$/g, ''), 'index.html');
  const full = path.join(dist, rel);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf-8') : null;
}

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const MIN_TEXT = {
  L1: 400,
  L2: 200,
  L3: 40,
  分类页: 200,
  教程页: 800,
  首页: 200,
  信任页: 300,
  关于页: 150,
};

for (const { route, kind } of samples) {
  const html = readPage(route);
  if (!html) {
    fail(`${kind} 抽查页不存在: ${route}`);
    continue;
  }
  const label = `${kind} ${route}`;

  const h1s = html.match(/<h1[\s\S]*?<\/h1>/g) ?? [];
  if (h1s.length !== 1) {
    fail(`${label}: h1 数量为 ${h1s.length}（应为 1）`);
  }

  const title = html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '';
  if (!title || title.includes('undefined')) {
    fail(`${label}: title 异常 -> ${title}`);
  }

  const canonical = html.match(/<link rel="canonical"[^>]*href="([^"]*)"/)?.[1] ?? '';
  if (!canonical) {
    fail(`${label}: 缺 canonical`);
  } else if (!canonical.endsWith('/')) {
    // Cloudflare 把 /x 规范化成 /x/，canonical 不带斜杠就多一层 308
    fail(`${label}: canonical 缺尾斜杠 -> ${canonical}`);
  }

  const desc = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '';
  if (!desc || desc.includes('undefined')) {
    fail(`${label}: description 异常 -> ${desc}`);
  }

  // 正文长度看的是 #seo-static 里的内容，也就是爬虫不执行 JS 能读到的部分
  const staticBlock = html.match(/<div id="seo-static">([\s\S]*?)<\/div>\s*<\/div>/)?.[1] ?? '';
  const text = stripTags(staticBlock);
  if (text.length < MIN_TEXT[kind]) {
    fail(`${label}: 静态正文仅 ${text.length} 字（${kind} 要求 ≥${MIN_TEXT[kind]}）`);
  }

  if (kind === 'L3') {
    if (!/name="robots" content="noindex/.test(html)) {
      fail(`${label}: L3 页缺 noindex`);
    }
  } else if ((kind === 'L1' || kind === 'L2') && /name="robots" content="noindex/.test(html)) {
    fail(`${label}: 可索引的工具页不该有 noindex`);
  }
  // 分类页允许 noindex：整个分类里没有可索引工具时（如 Physics），聚合页本身也不该进索引

  if (kind !== 'L3' && !/application\/ld\+json/.test(html)) {
    fail(`${label}: 缺 JSON-LD`);
  }

  if (kind === 'L1') {
    const faqCount = (html.match(/<details>/g) ?? []).length;
    if (faqCount < 3) {
      fail(`${label}: FAQ 只有 ${faqCount} 条（要求 ≥3）`);
    }
  }

  notes.push(
    `${label}: 正文 ${text.length} 字｜title「${title.slice(0, 34)}」｜canonical ${canonical}`,
  );
}

// title 唯一性：全站不能有重复 title
const titleSeen = new Map();
for (const tool of tools) {
  const html = readPage(tool.path);
  if (!html) {
    continue;
  }
  const t = html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '';
  if (titleSeen.has(t)) {
    fail(`title 重复: 「${t}」出现在 ${titleSeen.get(t)} 和 ${tool.path}`);
  }
  titleSeen.set(t, tool.path);
}

// ---------------------------------------------------------------- 3. sitemap
const sitemapPath = path.join(dist, 'sitemap.xml');
if (!fs.existsSync(sitemapPath)) {
  fail('dist/sitemap.xml 不存在');
} else {
  const sitemap = fs.readFileSync(sitemapPath, 'utf-8');
  const locs = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  // sitemap 里的 loc 统一带尾斜杠，这里要比对就得跟着带，否则检测会永远"通过"
  const l3Paths = new Set(tools.filter((t) => t.tier === 'L3').map((t) => `https://gjxtools.com${t.path}/`));
  const leaked = locs.filter((l) => l3Paths.has(l));
  if (leaked.length > 0) {
    fail(`sitemap 混进了 ${leaked.length} 个 noindex 页，例如 ${leaked[0]}`);
  }
  notes.push(`sitemap 收录 ${locs.length} 条，含 noindex 页 ${leaked.length} 条`);

  if (fs.existsSync(path.join(dist, 'robots.txt'))) {
    const robots = fs.readFileSync(path.join(dist, 'robots.txt'), 'utf-8');
    if (!robots.includes('Sitemap:')) {
      fail('robots.txt 未指向 sitemap');
    }
  } else {
    fail('dist/robots.txt 不存在');
  }
}

// ---------------------------------------------------------------- 4. 部署层：404 与 _redirects
// 顶层 404.html 是 Cloudflare Pages 关掉 SPA 兜底的开关：缺了它，任何不存在的 URL
// 都会返回 200 + 首页内容（软 404），等于给 Google 灌一大堆重复页。
const notFound = path.join(dist, '404.html');
if (!fs.existsSync(notFound)) {
  fail('dist/404.html 不存在，Cloudflare 会退回 SPA 兜底，未知路径变成软 404');
} else {
  const html = fs.readFileSync(notFound, 'utf-8');
  if (!/name="robots" content="noindex/.test(html)) {
    fail('404.html 缺 noindex，会被当成正常页面收录');
  }
}

// _redirects 里一旦出现 /* → /index.html 的兜底，静态子页就白生成了
const redirectsPath = path.join(dist, '_redirects');
if (fs.existsSync(redirectsPath)) {
  const redirects = fs.readFileSync(redirectsPath, 'utf-8');
  const catchAll = redirects
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .find((line) => /^\/\*/.test(line));
  if (catchAll) {
    fail(`_redirects 里有通配兜底规则「${catchAll}」，会覆盖静态子页或造成软 404`);
  }
}

// ---------------------------------------------------------------- 5. 前端路由
// 静态 HTML 有页面但前端没路由的话，Vue 挂载后会被 NotFound 顶掉 —— 静态内容和用户
// 看到的内容不一致，对 AdSense 来说就是 cloaking。
const routerPath = path.join(root, 'src/router.ts');
if (fs.existsSync(routerPath)) {
  const router = fs.readFileSync(routerPath, 'utf-8');
  for (const [route, file] of [
    ['/category/:slug', 'src/pages/CategoryPage.vue'],
    ['/guide/:slug', 'src/pages/GuidePage.vue'],
  ]) {
    if (!router.includes(route)) {
      fail(`router.ts 缺 ${route} 路由，${file} 渲染不出来`);
    }
    if (!fs.existsSync(path.join(root, file))) {
      fail(`${file} 不存在`);
    }
  }
}

// ---------------------------------------------------------------- 6. 资源路径
// 子目录页里的资源必须解析到根目录，否则 /json-prettify/ 会去找 /json-prettify/assets/
const probe = readPage(tools[0].path);
if (probe) {
  const badRef = probe.match(/(?:src|href)="\.\/(assets|figlet-fonts)\/[^"]*"/g) ?? [];
  const hasBase = /<base href="\/">/.test(probe);
  if (badRef.length > 0 && !hasBase) {
    fail(`子目录页资源用了相对路径且没有 <base href="/">，会导致 404: ${badRef[0]}`);
  }
  notes.push(`子目录页 <base href="/">: ${hasBase ? '有' : '无'}，相对资源引用 ${badRef.length} 处`);
}

// ---------------------------------------------------------------- 输出
console.log('—— 检查项 ——');
for (const n of notes) {
  console.log(`  ${n}`);
}

if (problems.length === 0) {
  console.log('\n全部通过');
  process.exit(0);
}

console.log(`\n发现 ${problems.length} 个问题：`);
for (const p of problems) {
  console.log(`  ✗ ${p}`);
}
process.exit(1);
