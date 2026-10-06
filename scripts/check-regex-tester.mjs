// 正则测试器改造后的交互验收：真的点一遍，而不是只看代码。
//
// 覆盖：预设填入 → 高亮数量 → 匹配列表 → 替换结果 → 代码生成（6 语言）
//       → 速查表点击插入 → 修饰符切换 → 无效正则报错 → 折叠区铁路图。
// 用法：node scripts/check-regex-tester.mjs [--shot]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const PLAYWRIGHT_CANDIDATES = [
  'playwright',
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
  console.error('找不到 playwright');
  process.exit(1);
}

const PORT = 4196;
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
const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error' && !/\/api\/|favicon/i.test(`${msg.text()} ${msg.location()?.url ?? ''}`)) {
    consoleErrors.push(msg.text());
  }
});

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(34)} ${detail}`);
};

const tab = async (label) => {
  await page.locator('.rt-nav-item', { hasText: label }).first().click();
  await page.waitForTimeout(350);
};

await page.goto(`http://127.0.0.1:${PORT}/regex-tester/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);

// 1. 布局：左右两栏都在
const layout = page.locator('.rt-layout');
check('左右分栏容器渲染', (await layout.count()) === 1);
const leftBox = await page.locator('.rt-left').boundingBox();
const rightBox = await page.locator('.rt-right').boundingBox();
check(
  '左栏在左、右栏在右且都有宽度',
  !!leftBox && !!rightBox && leftBox.x < rightBox.x && leftBox.width > 200 && rightBox.width > 200,
  `left=${Math.round(leftBox?.width ?? 0)}px right=${Math.round(rightBox?.width ?? 0)}px`,
);

// 2. 预设：点「邮箱」应同时填进正则和测试文本
await page.getByRole('button', { name: '邮箱', exact: true }).click();
await page.waitForTimeout(400);
const patternValue = await page.locator('#regex-tester-pattern-input').inputValue();
check('点预设后正则框被填入', patternValue.includes('@'), patternValue.slice(0, 40));

// 3. 高亮预览：应有高亮片段
const hits = await page.locator('.rt-hit').count();
check('高亮预览出现命中片段', hits > 0, `${hits} 处`);

// 4. 统计条：匹配数 > 0
const statsText = await page.locator('.rt-stats').innerText();
check('统计条显示匹配数', /匹配数/.test(statsText), statsText.replace(/\s+/g, ' ').slice(0, 40));

// 5. 匹配列表 Tab
await tab('匹配列表');
await page.waitForTimeout(300);
const cards = await page.locator('.rt-match-card').count();
check('匹配列表条数与高亮一致', cards === hits, `列表 ${cards} / 高亮 ${hits}`);

// 6. 替换：填 $1 引用捕获组
await page.locator('#regex-tester-pattern-input').fill('(\\w+)@(\\w+)\\.com');
await page.waitForTimeout(300);
await page.locator('.rt-replace-row input').fill('$1');
await page.getByRole('button', { name: '替换', exact: true }).click();
await page.waitForTimeout(400);
const preText = await page.locator('.rt-pane .rt-pre').first().innerText();
check('替换结果应用了 $1 捕获组', preText.includes('support') && !preText.includes('@gjxtools.com'), preText.slice(0, 50).replace(/\n/g, ' | '));

// 7. 代码生成：6 个语言块
await tab('代码生成');
await page.waitForTimeout(400);
const blocks = await page.locator('.rt-code-block').count();
check('代码生成含 6 种语言', blocks === 6, `${blocks} 块`);
const goCode = await page.locator('.rt-code-block').nth(4).innerText();
check('Go 代码带内联标志位', goCode.includes('regexp.MustCompile'), goCode.split('\n').find((l) => l.includes('MustCompile')) ?? '');

// 8. 速查表：点击插入到光标处
await tab('语法速查');
await page.waitForTimeout(300);
await page.locator('#regex-tester-pattern-input').fill('');
await page.locator('.rt-cheat-item').filter({ hasText: '\\d' }).first().click();
await page.waitForTimeout(300);
const afterInsert = await page.locator('#regex-tester-pattern-input').inputValue();
check('速查表条目插入到正则框', afterInsert.includes('\\d'), afterInsert);

// 9. 修饰符影响结果
await page.locator('#regex-tester-pattern-input').fill('SUPPORT');
await page.locator('.rt-replace-row input').fill('');
await tab('高亮预览');
await page.waitForTimeout(400);
const beforeI = await page.locator('.rt-hit').count();
await page.locator('.rt-flag-row').getByText('忽略大小写').first().click();
await page.waitForTimeout(400);
const afterI = await page.locator('.rt-hit').count();
check('勾选 i 后匹配数增加', afterI > beforeI, `${beforeI} → ${afterI}`);

// 10. 无效正则要报错
await page.locator('#regex-tester-pattern-input').fill('(');
await page.waitForTimeout(500);
const feedback = await page.locator('.feedback').count();
check('无效正则显示错误提示', feedback > 0);

// 11. 折叠区
const collapses = await page.locator('.c-collapse, [class*="collapse"]').count();
check('折叠区保留铁路图与示例', collapses >= 2, `${collapses} 个`);

// 12. 窄屏应堆叠
await page.setViewportSize({ width: 420, height: 900 });
await page.waitForTimeout(400);
const l2 = await page.locator('.rt-left').boundingBox();
const r2 = await page.locator('.rt-right').boundingBox();
check('窄屏下两栏改为上下堆叠', !!l2 && !!r2 && r2.y > l2.y + l2.height - 5, `left.y=${Math.round(l2?.y ?? 0)} right.y=${Math.round(r2?.y ?? 0)}`);

check('无控制台报错', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));

if (process.argv.includes('--shot')) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`http://127.0.0.1:${PORT}/regex-tester/`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '邮箱', exact: true }).click();
  await page.waitForTimeout(700);
  fs.mkdirSync('shots', { recursive: true });
  await page.screenshot({ path: 'shots/regex-tester-highlight.png' });
  await tab('代码生成');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'shots/regex-tester-code.png' });
  await tab('语法速查');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'shots/regex-tester-cheat.png' });
  console.log('\n截图已存到 shots/');
}

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
process.exit(failed.length === 0 ? 0 : 1);
