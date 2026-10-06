// 用真实浏览器打开 dist 里的页面，检查渲染出来的文字有没有问题。
//
// 比截图更可靠：截图要人眼看，这个能自动断言三件事 ——
//   1) 页面正文里有没有漏 i18n 键（会原样显示 "tools.xxx.texts.yyy"）
//   2) h1 是否是中文标题（英文标题 = i18n 初始化顺序又出错了，历史上踩过一次）
//   3) 有没有 Naive UI 报 prop 非法之类的控制台错误
//
// 用法：node scripts/check-page-text.mjs <slug1> [slug2 ...]
//   不带参数则检查全部工具页（读 src/seo/tools-meta.json 的 key）
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const PLAYWRIGHT_CANDIDATES = [
  'playwright',
  path.resolve('node_modules/.pnpm/playwright@1.62.0/node_modules/playwright/index.js'),
  ...fs
    .readdirSync(path.resolve('node_modules/.pnpm'))
    .filter((d) => d.startsWith('playwright@'))
    .map((d) => path.resolve('node_modules/.pnpm', d, 'node_modules/playwright/index.js')),
];

let chromium;
for (const p of PLAYWRIGHT_CANDIDATES) {
  try {
    ({ chromium } = require(p));
    break;
  } catch {
    /* 换下一个候选路径 */
  }
}
if (!chromium) {
  console.error('找不到 playwright，请先安装：pnpm add -D playwright && npx playwright install');
  process.exit(1);
}

const args = process.argv.slice(2);
// tools-meta.json 的工具清单在 .tools 下（是个数组），顶层还有 generatedAt / tiers 等元信息
const meta = JSON.parse(fs.readFileSync('src/seo/tools-meta.json', 'utf8'));
const allSlugs = (meta.tools ? Object.values(meta.tools) : []).map((t) => t.slug).filter(Boolean);
const slugs = args.length ? args : allSlugs;

const PORT = 4193;
const ROOT = path.resolve('dist');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(ROOT, urlPath);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(file, 'index.html');
  }
  if (!fs.existsSync(file)) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const browser = await chromium.launch({ channel: 'msedge' });
const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1120, height: 900 } });
const page = await context.newPage();

// 漏键时页面上会原样出现这种串
const RAW_KEY = /\btools\.[a-z0-9-]+(\.[a-z0-9-]+)+\b/;
// 中文标题至少要有一个汉字
const HAS_HAN = /[一-龥]/;

let bad = 0;
for (const slug of slugs) {
  const errors = [];
  // /api/hot 是 Cloudflare Pages Function，本地静态服务没有，404 属正常，不算缺陷
  const IGNORE_ERR = /\/api\/|favicon/i;
  const onConsole = (msg) => {
    if (msg.type() === 'error' && !IGNORE_ERR.test(`${msg.text()} ${msg.location()?.url ?? ''}`)) {
      errors.push(`${msg.text()} @ ${msg.location()?.url ?? ''}`);
    }
  };
  page.off('console', onConsole);
  page.on('console', onConsole);

  await page.goto(`http://127.0.0.1:${PORT}/${slug}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);

  const h1 = (await page.locator('h1').first().textContent().catch(() => '')) ?? '';
  const body = await page.locator('body').innerText();
  const rawKeys = [...new Set(body.match(new RegExp(RAW_KEY, 'g')) ?? [])];

  const problems = [];
  if (!HAS_HAN.test(h1)) {
    problems.push(`h1 非中文:「${h1.trim()}」`);
  }
  if (rawKeys.length) {
    problems.push(`原文键 ${rawKeys.length} 处: ${rawKeys.slice(0, 3).join(', ')}`);
  }
  if (errors.length) {
    problems.push(`控制台报错 ${errors.length} 条: ${errors[0].slice(0, 80)}`);
  }

  bad += problems.length ? 1 : 0;
  console.log(`${problems.length ? '✗' : '✓'} ${slug.padEnd(38)} ${h1.trim().slice(0, 24)}${problems.length ? '  → ' + problems.join('；') : ''}`);
}

await browser.close();
server.close();
console.log(bad === 0 ? `\n${slugs.length} 个页面全部通过` : `\n${bad}/${slugs.length} 个页面有问题`);
process.exit(bad === 0 ? 0 : 1);
