/**
 * 检查 public/_redirects 有没有把**还活着的**工具路由 301 走。
 *
 * 为什么需要这个脚本：下线工具时要补 301（否则边缘缓存会继续吐旧 HTML），而补完的
 * 301 行留在文件里不会自己消失。等到某天又新建一个同 slug 的工具，那条老 301 就会
 * 把线上新页面直接打到分类页 —— 页面存在、构建能过、SEO 自检也能过，只有真去访问
 * 的人会看到「跳走了」。bcrypt 就这么中过一次。
 *
 * 用法：node scripts/check-redirect-conflicts.mjs [--fix]
 *   --fix 会删掉冲突的 301 行（源路径等于某个存活路由的那两行）
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const redirectsPath = path.join(root, 'public', '_redirects');
const metaPath = path.join(root, 'src', 'seo', 'tools-meta.json');

if (!fs.existsSync(redirectsPath) || !fs.existsSync(metaPath)) {
  console.error('缺少 public/_redirects 或 src/seo/tools-meta.json，先跑一次构建或 extract-tools-meta');
  process.exit(1);
}

const raw = fs.readFileSync(redirectsPath, 'latin1');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
const lines = raw.split(eol);
const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
const alive = new Set(meta.tools.map(tool => tool.path));
const fix = process.argv.includes('--fix');

const isComment = line => line.trim() === '' || line.trim().startsWith('#');

const conflicts = [];
for (const [index, line] of lines.entries()) {
  if (isComment(line)) {
    continue;
  }
  const [source, target] = line.trim().split(/\s+/);
  if (!source) {
    continue;
  }
  // 只关心「重定向的源正好是某个存活路由」的情况；把 /old 指向别的工具不算冲突
  const bare = source.replace(/\/$/, '') || '/';
  if (alive.has(bare) && target && target !== source) {
    conflicts.push({ index, line: line.trim(), bare, target });
  }
}

console.log(`存活工具 ${alive.size} 个，_redirects 共 ${lines.length} 行`);

if (conflicts.length === 0) {
  console.log('✔ 没有冲突：没有存活路由被 301 走');
  process.exit(0);
}

console.log(`\n✘ 发现 ${conflicts.length} 条冲突（存活路由被重定向走）：`);
for (const item of conflicts) {
  console.log(`  第 ${item.index + 1} 行  ${item.line}   ← ${item.bare} 还活着`);
}

if (!fix) {
  console.log('\n加 --fix 可自动删掉这些行');
  process.exit(1);
}

const drop = new Set(conflicts.map(item => item.index));
const kept = lines.filter((_, index) => !drop.has(index));
fs.writeFileSync(redirectsPath, kept.join(eol), 'latin1');
console.log(`\n已删除 ${drop.size} 行。请重新构建，让 dist/_redirects 同步。`);
