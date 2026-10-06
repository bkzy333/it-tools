// 把 opencc-js 的 ESM 产物包进一个函数作用域再导出。
//
// 为什么要包：那两个文件是 minify 过的，顶层全是 n / o / c / s / N / b / T / e / r 这类
// 一两个字母的声明。rolldown 做 scope hoisting 时必须把这些名字在整个 chunk 里重新去重，
// 在这些文件上会失败并报 `It can not be redeclared here`（单独打包这两个文件反而没事，
// 说明是和其他模块撞名）。包进函数后这些名字变成局部变量，不再参与顶层去重，问题消失。
//
// 注意：文件正文**不改动**，只是在外面套一层，导出名沿用原文件的 export{...} 映射。
//
// 用法：node scripts/wrap-opencc.mjs
//   原始文件不在仓库里（为避免 1.1MB 的重复副本），脚本会先尝试从 jsdelivr 拉；
//   离线环境请自行把 cn2t.js / t2cn.js 放到 src/tools/chinese-script-converter/ 下再跑。
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'src/tools/chinese-script-converter';
const VERSION = '1.4.2';

const targets = [
  [`opencc-cn2t.js`, `https://cdn.jsdelivr.net/npm/opencc-js@${VERSION}/dist/esm/cn2t.js`, 'opencc-cn2t.wrapped.js'],
  [`opencc-t2cn.js`, `https://cdn.jsdelivr.net/npm/opencc-js@${VERSION}/dist/esm/t2cn.js`, 'opencc-t2cn.wrapped.js'],
];

const ensureSource = async (rawName, url) => {
  const rawPath = path.join(DIR, rawName);
  if (fs.existsSync(rawPath)) {
    return rawPath;
  }
  console.log(`${rawName} 不在本地，从 ${url} 下载…`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`下载失败 ${res.status} ${res.statusText}，请手动放置 ${rawPath}`);
  }
  fs.writeFileSync(rawPath, await res.text(), 'utf8');
  return rawPath;
};

for (const [rawName, url, outputName] of targets) {
  const rawPath = await ensureSource(rawName, url);
  const src = fs.readFileSync(rawPath, 'utf8');
  const match = src.match(/export\{([^}]*)\};?\s*$/);
  if (!match) {
    throw new Error(`${rawPath} 尾部没有 export{...}`);
  }

  const pairs = match[1]
    .split(',')
    .map((part) => part.trim().split(/\s+as\s+/))
    .map(([local, exported]) => ({ local, exported }));

  const body = src.replace(/export\{[^}]*\};?\s*$/, '');

  const lines = [
    '/* 自动生成，请勿手改：由 scripts/wrap-opencc.mjs 从 opencc-js ESM 产物包裹而来。',
    '   正文与上游一致，只是在外面套了一层函数作用域以避开打包器的顶层重名问题。',
    '   许可证见同目录 LICENSE-opencc-js.txt。 */',
    'function __openccFactory() {',
    body,
    '',
    '  return {',
    ...pairs.map((p) => `    ${p.exported === 'default' ? '"default"' : p.exported}: ${p.local},`),
    '  };',
    '}',
    '',
    'const __opencc = __openccFactory();',
    '',
    ...pairs.map((p) =>
      p.exported === 'default' ? 'export default __opencc.default;' : `export const ${p.exported} = __opencc.${p.exported};`,
    ),
    '',
  ];

  const outPath = path.join(DIR, outputName);
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log(`${outputName}: ${src.length} → ${lines.join('\n').length} 字符，导出 ${pairs.map((p) => p.exported).join(', ')}`);
}
