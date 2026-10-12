/**
 * 「相关工具」映射表校验。
 *
 * 这张表是人工维护的，最容易出的三类静默错误都必须靠脚本卡住：
 *   1. 死链 —— 引用了不存在的 path（工具改名/删除后残留）
 *   2. 自引用 —— 某条里填了自己
 *   3. 引用了 noindex 页（tier = L3），链过去没有收录价值
 *
 * 顺带输出覆盖度与「新增工具未登记」清单，提醒补表。
 *
 * 用法：node scripts/verify-related-tools.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const metaPath = path.join(root, 'src', 'seo', 'tools-meta.json');
const mapPath = path.join(root, 'src', 'seo', 'related-tools.ts');

const rawMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
const tools = Array.isArray(rawMeta) ? rawMeta : (rawMeta.tools ?? Object.values(rawMeta)[0]);
const byPath = new Map(tools.map((t) => [t.path, t]));

// 直接把 TS 映射表读出来：只需要 RELATED_TOOLS 这个纯对象字面量，
// 用正则截到 `};` 为止再 eval，避免为一个校验脚本引入 TS 编译链路。
const src = fs.readFileSync(mapPath, 'utf8');
const start = src.indexOf('export const RELATED_TOOLS');
if (start === -1) {
  console.error('✗ 没找到 RELATED_TOOLS 导出');
  process.exit(1);
}
const braceStart = src.indexOf('{', start);
let depth = 0;
let end = -1;
for (let i = braceStart; i < src.length; i++) {
  if (src[i] === '{') depth++;
  else if (src[i] === '}') {
    depth--;
    if (depth === 0) {
      end = i + 1;
      break;
    }
  }
}
const literal = src.slice(braceStart, end);
const RELATED_TOOLS = new Function(`return ${literal}`)();

const errors = [];
const warnings = [];

// ---- 1. key 必须是真实存在的工具 path ----
for (const key of Object.keys(RELATED_TOOLS)) {
  if (!byPath.has(key)) {
    errors.push(`映射表的 key 不是真实工具：${key}`);
  }
}

// ---- 2. 值：死链 / 自引用 / 重复 / L3 ----
for (const [key, list] of Object.entries(RELATED_TOOLS)) {
  const seen = new Set();
  for (const p of list) {
    if (p === key) {
      errors.push(`${key} 自引用了自己`);
      continue;
    }
    if (!byPath.has(p)) {
      errors.push(`${key} 引用了不存在的工具：${p}`);
      continue;
    }
    // 必须是硬错误，不能只是警告：运行时的 Tool 类型没有 tier 字段，
    // getRelatedToolPaths 里的 L3 过滤只对静态侧生效。若表里引用了 L3，
    // 运行时会显示而静态 HTML 不显示 —— 两边又不一致（cloaking）。
    if (byPath.get(p).tier === 'L3') {
      errors.push(`${key} 引用了 noindex 页（L3）：${p} —— 请从表中移除`);
    }
    if (seen.has(p)) {
      errors.push(`${key} 重复引用：${p}`);
    }
    seen.add(p);
  }
  if (list.length < 4) {
    warnings.push(`${key} 只配了 ${list.length} 个，建议 5~6 个`);
  }
  if (list.length > 6) {
    warnings.push(`${key} 配了 ${list.length} 个，超过展示上限 6`);
  }
}

// ---- 3. 覆盖度 ----
const unregistered = tools.filter((t) => !RELATED_TOOLS[t.path]).map((t) => t.path);

// ---- 4. 关键互链是否成立（重复/互转工具必须互链，这是建表的首要目的）----
const MUST_LINK = [
  // 2026-10-13：/text-join 已合并进 /text-merge，改用「合并 ↔ 分割」这对互逆操作作为断言
  ['/text-merge', '/text-split'],
  ['/text-split', '/text-merge'],
  ['/date-distance-calculator', '/days-calculator'],
  ['/date-distance-calculator', '/date-duration-calculator'],
  ['/days-calculator', '/date-distance-calculator'],
  ['/date-duration-calculator', '/date-distance-calculator'],
  ['/json-minify', '/json-prettify'],
  ['/json-prettify', '/json-minify'],
  ['/csv-to-json', '/json-to-csv'],
  ['/json-to-csv', '/csv-to-json'],
  ['/json-to-yaml-converter', '/yaml-to-json-converter'],
  ['/yaml-to-json-converter', '/json-to-yaml-converter'],
  ['/html-to-markdown', '/markdown-to-html'],
  ['/markdown-to-html', '/html-to-markdown'],
  ['/qrcode-generator', '/qr-code-decoder'],
  ['/qr-code-decoder', '/qrcode-generator'],
  ['/barcode-generator', '/barcode-reader'],
  ['/barcode-reader', '/barcode-generator'],
  ['/my-ip', '/ip-geo-location'],
  ['/ip-geo-location', '/my-ip'],
  ['/excel-cell-merge', '/excel-cell-unmerge'],
  ['/excel-cell-unmerge', '/excel-cell-merge'],
  ['/image-converter', '/heic-converter'],
  ['/heic-converter', '/image-converter'],
  ['/base64-string-converter', '/base64-file-converter'],
  ['/base64-file-converter', '/base64-string-converter'],
  ['/table-converter', '/table-transpose'],
  ['/table-transpose', '/table-converter'],
];
for (const [from, to] of MUST_LINK) {
  if (!(RELATED_TOOLS[from] ?? []).includes(to)) {
    errors.push(`关键互链缺失：${from} 应链向 ${to}`);
  }
}

// ---- 输出 ----
console.log(`映射表条目：${Object.keys(RELATED_TOOLS).length} / 工具总数：${tools.length}`);
console.log(`未登记（将回退到同分类）：${unregistered.length} 个`);
if (unregistered.length > 0) {
  for (const p of unregistered) console.log(`   · ${p}`);
}

if (warnings.length > 0) {
  console.log(`\n⚠ 警告 ${warnings.length} 条：`);
  for (const w of warnings) console.log(`   · ${w}`);
}

if (errors.length > 0) {
  console.log(`\n✗ 错误 ${errors.length} 条：`);
  for (const e of errors) console.log(`   · ${e}`);
  process.exit(1);
}

console.log(`\n✓ 映射表校验通过（关键互链 ${MUST_LINK.length} 条全部成立）`);
