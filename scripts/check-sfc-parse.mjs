/**
 * 快速检查所有 .vue 的模板能不能被 Vue 编译器解析。
 *
 * 为什么需要独立的检查：模板里一个多余的引号（比如 `<div class="hint" mt-2">` 多打一个 `"`）
 * 会让 Vue 3.5 的新解析器报 `Attribute name cannot contain U+0022 ...`，而**报错位置会指向
 * 下一行**（解析错位），非常容易误判成别的问题。更糟的是：
 *   - vue-tsc 不报错（它对解析失败的模板直接跳过类型检查）
 *   - 构建能跑到最后才失败，一次要等 40 秒以上
 * 这个脚本用 devDependency 里的 vue/compiler-sfc 直接跑，几百毫秒给结论。
 *
 * 用法：node scripts/check-sfc-parse.mjs [目录，默认 src]
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { compileTemplate, parse } from 'vue/compiler-sfc';

const root = path.resolve(import.meta.dirname, '..');
const target = path.resolve(root, process.argv[2] ?? 'src');

/** 递归收集 .vue 文件 */
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
        continue;
      }
      walk(full, out);
    }
    else if (entry.name.endsWith('.vue')) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(target);
const problems = [];

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const { descriptor, errors } = parse(source, { filename: file });

  for (const error of errors) {
    const line = error.loc?.start?.line ?? 0;

    problems.push({ file, line, message: error.message });
  }
  if (!descriptor.template || errors.length > 0) {
    continue;
  }

  const result = compileTemplate({
    source: descriptor.template.content,
    filename: file,
    id: file,
  });

  for (const error of result.errors ?? []) {
    const message = typeof error === 'string' ? error : error.message;
    const line = typeof error === 'string' ? 0 : (error.loc?.start?.line ?? 0);

    problems.push({ file, line, message });
  }
}

if (problems.length === 0) {
  console.log(`✔ ${files.length} 个 .vue 全部可解析`);
  process.exit(0);
}

console.log(`✘ ${problems.length} 处解析问题（检查了 ${files.length} 个文件）：\n`);
for (const item of problems) {
  console.log(`  ${path.relative(root, item.file)}:${item.line}\n    ${item.message}\n`);
}
console.log('提示：报错的行号常常是「解析错位」后的下一行，真正的问题多在上一行或更靠前。');
process.exit(1);
