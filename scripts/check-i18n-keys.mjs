// 扫描 src/ 下所有 .vue/.ts 里引用到的 i18n key，检查 locales/zh.yml 和 en.yml 是否都有。
//
// 为什么要这个脚本：缺一个键的效果是页面上直接把 "tools.xxx.texts.yyy" 这串原文显示出来，
// 构建不会报错、类型检查也不会报错，只有肉眼在页面上看得见。上线前跑一遍能一次性抓干净。
//
// 两个坑，脚本里都处理了：
//   1) i18n key 不等于工具目录名（json-viewer 目录 → key json-prettify），所以从源码里抠真实 key，
//      不按目录名猜；
//   2) 命名空间不只有 tools.<key>.texts.<f> 一种形状，还有 tools.<key>.store.texts.<f>
//      （command-palette 就是），所以按完整点路径去语言文件里逐段解析，不写死两层。
//
// 用法：
//   node scripts/check-i18n-keys.mjs              # 扫全部
//   node scripts/check-i18n-keys.mjs kinship-calculator china-holidays   # 只扫指定的 key 前缀
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

const ROOT = 'src';
const EXT = new Set(['.vue', '.ts']);

const onlyKeys = process.argv.slice(2);

const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (EXT.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
};

const zh = parse(fs.readFileSync('locales/zh.yml', 'utf8'));
const en = parse(fs.readFileSync('locales/en.yml', 'utf8'));

// 真实工具 i18n key 的清单：从每个工具的 index.ts 里抠 name: t('tools.<KEY>.title')。
// 注意 key 不等于目录名（json-viewer 目录 → key json-prettify），所以必须读 index.ts。
const KNOWN_KEYS = new Set(['command-palette']); // 非工具但同在 tools 命名空间下的（命令面板）
for (const entry of fs.readdirSync('src/tools', { withFileTypes: true })) {
  if (!entry.isDirectory()) {
    continue;
  }
  const file = path.join('src/tools', entry.name, 'index.ts');
  if (!fs.existsSync(file)) {
    continue;
  }
  for (const m of fs.readFileSync(file, 'utf8').matchAll(/tools\.([^\s'"`,).]+)\.title/g)) {
    KNOWN_KEYS.add(m[1]);
  }
}

// 键里可能带非 ASCII（calendar-converter 的波斯历/法国共和历月份名就是阿拉伯文、带重音的拉丁字母），
// 所以不能只匹配 [a-zA-Z0-9-]，否则会把 label-floréal 截成 label-flor 报假阳性；
// 也不能吃到 '.', 否则会把 command-palette.store 当成一个 key。取到引号/反引号/空白/点为止。
const SEG = String.raw`[^\s'"\`,).]+`;
// 前面不能是单词字符或 '-'，否则 it-tools.vercel.app 这类 URL 会被当成 tools.vercel.app 抓进来
const REF_RE = new RegExp(String.raw`(?<![\w-])tools\.(${SEG}(?:\.${SEG})*)`, 'g');

// 只看长得像 i18n 键的路径：单段（tools 下的一层键）、以 title/description 结尾、或含 .texts. 段。
// 其余是代码噪声（tools.value.length、tools.value.filter(({ … )）—— 那是变量不是键。
const looksLikeKey = (p) => {
  const segs = p.split('.');
  return segs.length === 1 || ['title', 'description'].includes(segs.at(-1)) || segs.includes('texts');
};

const refs = new Map(); // 完整路径 -> Set<file>
for (const file of walk(ROOT)) {
  const content = fs.readFileSync(file, 'utf8');
  for (const m of content.matchAll(REF_RE)) {
    if (!looksLikeKey(m[1])) {
      continue;
    }
    if (!refs.has(m[1])) {
      refs.set(m[1], new Set());
    }
    refs.get(m[1]).add(file);
  }
}

// 运行时拼出来的键（含 ${...}）静态查不了，单独归类
const isDynamic = (s) => s.includes('${');
// 文档/注释里出现的占位键，不是真实引用
const IGNORE_KEYS = new Set(['xxx']);

const resolve = (locale, fullPath) => {
  let node = locale;
  for (const seg of fullPath.split('.')) {
    if (node === undefined || node === null || typeof node !== 'object') {
      return undefined;
    }
    node = node[seg];
  }
  return node;
};

const dynamic = [];
let problems = 0;
const rows = [];

const fullPaths = [...refs.keys()].sort();
const byKey = new Map();
for (const p of fullPaths) {
  const key = p.split('.')[0];
  if (!byKey.has(key)) {
    byKey.set(key, []);
  }
  byKey.get(key).push(p);
}

for (const key of [...byKey.keys()].sort()) {
  // 首段不是已知工具 key 的，多半是代码噪声（import from '@/tools/store'、tools.value.length …）
  if (IGNORE_KEYS.has(key) || !KNOWN_KEYS.has(key) || (onlyKeys.length && !onlyKeys.includes(key))) {
    continue;
  }
  const paths = byKey.get(key);
  const statics = paths.filter((p) => !isDynamic(p));
  for (const p of paths.filter(isDynamic)) {
    dynamic.push(`${p}  ← ${[...refs.get(p)].join(', ')}`);
  }

  const missZh = statics.filter((p) => resolve(zh, `tools.${p}`) === undefined);
  const missEn = statics.filter((p) => resolve(en, `tools.${p}`) === undefined);

  problems += missZh.length + missEn.length;
  for (const p of missZh) {
    console.log(`  zh 缺  tools.${p}   ← ${[...refs.get(p)].join(', ')}`);
  }
  for (const p of missEn) {
    console.log(`  en 缺  tools.${p}   ← ${[...refs.get(p)].join(', ')}`);
  }
  rows.push(`${key.padEnd(34)} 引用 ${String(paths.length).padStart(3)} ｜ zh 缺 ${missZh.length} ｜ en 缺 ${missEn.length}`);
}

console.log(rows.join('\n'));

const dyn = [...new Set(dynamic)].sort();
if (dyn.length) {
  console.log(`\n以下 ${dyn.length} 处是运行时拼出来的键，静态检查覆盖不到，需人工确认：`);
  for (const d of dyn) {
    console.log(`  - tools.${d}`);
  }
}
console.log(problems === 0 ? '\n全部键齐全' : `\n共 ${problems} 处缺失`);
process.exit(problems === 0 ? 0 : 1);
