// 起一个本地静态服务指向 dist，用真实浏览器逐个工具页截图，供人工验收。
//
// 为什么要跑真实浏览器：vite 构建成功 ≠ 页面能看。UnoCSS 类名拼错、组件 prop 写错、
// i18n 键缺失都只在运行时才暴露，截图是发现这些问题最快的方式。
//
// 用法：
//   node scripts/shot-tools.mjs <输出目录> <路径1> [路径2 ...]
//   node scripts/shot-tools.mjs ../新工具截图 /kinship-calculator/ /china-holidays/
//
// 约定：页面上有「示例」按钮的会自动点一下（tool.exampleData 的约定），没有的就截默认状态。
// 依赖 playwright + 本机 Edge/Chromium；没装的话先 npx playwright install。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// 传 slug 而不是完整路径：Git Bash 会把以 / 开头的参数当成路径转成 Windows 形式再传进来
const [outDir, ...slugs] = process.argv.slice(2);
if (!outDir || slugs.length === 0) {
  console.error('用法: node scripts/shot-tools.mjs <输出目录> <slug1> [slug2 ...]');
  console.error('示例: node scripts/shot-tools.mjs ../新工具截图 kinship-calculator china-holidays');
  process.exit(1);
}
const paths = slugs.map((s) => `/${s.replace(/^\/|\/$/g, '')}/`);

// playwright 是可选依赖：优先正常解析，解析不到再退到 .pnpm 里的实际路径。
// 注意候选路径要写成绝对路径 —— createRequire(import.meta.url) 是相对脚本所在目录解析的，
// 而脚本在 scripts/ 下、node_modules 在仓库根。
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

const PORT = 4192;
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
fs.mkdirSync(outDir, { recursive: true });

for (const [i, p] of paths.entries()) {
  const name = slugs[i].replace(/^\/|\/$/g, '') || 'home';
  await page.goto(`http://127.0.0.1:${PORT}${p}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const example = page.locator('button', { hasText: '示例' }).first();
  if (await example.count()) {
    await example.click();
    await page.waitForTimeout(900);
  }
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file });
  console.log('已截图', file);
}

await browser.close();
server.close();
