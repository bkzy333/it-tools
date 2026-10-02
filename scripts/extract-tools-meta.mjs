#!/usr/bin/env node
// 从 src/tools/*/index.ts + locales/zh.yml 抽取全站工具元数据，输出 src/seo/tools-meta.json。
//
// 为什么不能 import src/tools/index.ts：那个模块在顶层 await fetch 配置、且 name/description
// 是运行时 i18n 调用（t('tools.xxx.title')），构建期拿不到字符串。所以这里走静态解析：
// 结构字段（path/keywords/category/redirectFrom）从 index.ts 正则取，中文文案从 zh.yml 取。
//
// 只依赖 node 内置模块，可以在 pnpm install 之前就跑起来验证。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const toolsDir = path.join(root, 'src', 'tools');
const zhYml = path.join(root, 'locales', 'zh.yml');
const outFile = path.join(root, 'src', 'seo', 'tools-meta.json');

// ---------------------------------------------------------------- 分类中文名
// zh.yml 里的 tools.categories 不全（缺 Forensic/Physics/Converters 等，且 key 大小写对不上），
// 与其靠回退到英文，不如自己维护一份完整的。分类页标题也用这里的值。
export const CATEGORY_ZH = {
  Barcodes: '条形码与二维码',
  Cheatsheets: '命令速查表',
  Converters: '单位换算',
  Crypto: '加密与解密',
  Data: '数据处理',
  Datetime: '日期与时间',
  Default: '其他工具',
  Development: '开发工具',
  Docker: 'Docker',
  Finance: '金融计算',
  Forensic: '数字取证',
  Gaming: '游戏工具',
  Generators: '随机生成',
  Images: '图片处理',
  JSON: 'JSON 工具',
  Markdown: 'Markdown',
  Maths: '数学计算',
  Measurement: '测量工具',
  Network: '网络工具',
  PDF: 'PDF 工具',
  Physics: '物理计算',
  TOML: 'TOML',
  Text: '文本处理',
  Weather: '天气查询',
  Web: '网页工具',
  XML: 'XML 工具',
  YAML: 'YAML',
};

// 分类页 SEO 用名：比侧栏名更像一个搜索词（"JSON 在线工具"而非"JSON 工具"）
const CATEGORY_SEO_NAME = {
  Barcodes: '条形码与二维码在线生成',
  Cheatsheets: '开发者命令速查表',
  Converters: '单位换算在线计算',
  Crypto: '加密解密与哈希在线工具',
  Data: '数据格式转换工具',
  Datetime: '日期时间在线计算',
  Default: '实用在线工具',
  Development: '开发者在线工具',
  Docker: 'Docker 配置在线工具',
  Finance: '金融与贷款在线计算',
  Forensic: '数字取证分析工具',
  Gaming: '游戏辅助在线工具',
  Generators: '随机数与标识生成器',
  Images: '图片在线处理工具',
  JSON: 'JSON 在线格式化与转换',
  Markdown: 'Markdown 在线工具',
  Maths: '数学在线计算工具',
  Measurement: '度量衡单位换算',
  Network: '网络与 IP 在线工具',
  PDF: 'PDF 在线处理工具',
  Physics: '物理公式在线计算',
  TOML: 'TOML 在线转换工具',
  Text: '文本处理在线工具',
  Weather: '天气在线查询',
  Web: '网页与 URL 在线工具',
  XML: 'XML 在线格式化与转换',
  YAML: 'YAML 在线格式化与转换',
};

// ---------------------------------------------------------------- 分层规则
// 三档：
//   L1 深度页 —— 有真实中文搜索量，配原创长文（说明/步骤/示例/FAQ），放广告
//   L2 标准页 —— 内容从分类差异化模板生成，收录但 sitemap 优先级低
//   L3 noindex —— 备忘单、取证、物理、Docker 这类中文几乎没人搜的，不进索引
//
// 规则按优先级从高到低：显式 override > slug 后缀规则 > 分类默认。

const TIER_BY_CATEGORY = {
  Text: 'L1',
  JSON: 'L1',
  Crypto: 'L1',
  Images: 'L1',
  PDF: 'L1',
  Datetime: 'L1',
  Converters: 'L1',
  Generators: 'L1',
  Maths: 'L1',
  Measurement: 'L1',
  Finance: 'L1',
  Weather: 'L1',
  XML: 'L1',
  YAML: 'L1',
  TOML: 'L1',
  Web: 'L2',
  Data: 'L2',
  Markdown: 'L2',
  Barcodes: 'L2',
  Gaming: 'L2',
  Development: 'L2',
  Network: 'L3',
  Cheatsheets: 'L3',
  Forensic: 'L3',
  Physics: 'L3',
  Docker: 'L3',
  Default: 'L3',
};

// 备忘单类（*-memo）一律 noindex：这类页面就是 AdSense 眼里的典型薄内容
const MEMO_SUFFIX = /-memo$/;
// 明确没有中文搜索量的（名字一看就知道只有极窄的专业场景会用）
const FORCE_L3 = new Set([
  'ad-ldap-searcher',
  'ansi-escape-tester',
  'ansible-vault-crypt-decrypt',
  'arpa-decoder',
  'benchmark-builder',
  'bimi-dns-generator',
  'bounce-parser',
  'card-picker',
  'cidr-in-cidr',
  'cli-command-editor',
  'common-regex-memo',
  'cron-alarm',
  'css-selectors-memo',
  'dead-pixel',
  'device-information',
  'dkim-dns-generator',
  'dmarc-dns-generator',
  'dmarc-report-analyzer',
  'dns-propagation-tester',
  'dnsbl-checker',
  'docker-compose-memo',
  'docker-memo',
  'docker-pangolin-labels',
  'docker-swarm-memo',
  'dockerfile-label-generator',
  'emv-tlv-decoder',
  'epc-qrcode-generator',
  'eth-transaction-decoder',
  'explainshell',
  'firewalld-generator',
  'fstab-generator',
  'git-memo',
  'gtin-validator',
  'har-sanitizer',
  'hdd-calculator',
  'htpasswd-generator',
  'iana-whois-checker',
  'ico-converter',
  'ies-lighting-guidelines',
  'image-color-inverter',
  'image-to-ascii-art',
  'image-to-css',
  'i-and-l-checker',
  'ip-include-exclude',
  'iptables-generator',
  'ipv6-ula-generator',
  'jasypt-string-encryption',
  'jq-memo',
  'k6-script-generator',
  'k8s-memo',
  'k8s-rbac-generator',
  'keyboard-layout-converter',
  'korean-unpacker',
  'logrotate-generator',
  'mac-address-lookup',
  'middle-endian-converter',
  'mttdl-calculator',
  'multi-link-downloader',
  'nano-memo',
  'nmap-command-builder',
  'numeronym-generator',
  'objgen-html',
  'objgen-json',
  'online-wiktionary',
  'option43-generator',
  'paseto-encryption',
  'paseto-signing',
  'php-array-to-json',
  'picomatch-tester',
  'powershell-memo',
  'ptr-dns-generator',
  'restic-command-generator',
  'rj45-memo',
  'rsvp-reader',
  'rsync-generator',
  'screen-memo',
  'sed-command-generator',
  'sed-memo',
  'serial-console',
  'shamirs-secret-sharing',
  'sharepoint-decoder',
  'shell-linearizer',
  'si-prefixes-converter',
  'sip-auth',
  'spf-dns-generator',
  'sql-parameters',
  'swagger-ui-tester',
  'tcpdump-generator',
  'tmux-memo',
  'traefik-compose-maker',
  'ufw-generator',
  'unicode-characters-to-java-entities-converter',
  'vim-memo',
  'wireguard-config-generator',
  'x-vr-spamcause-decoder',
  'zalgo',
  'zellij-memo',
  'zpool-calculator',
  'zpool-memo',
]);

// 分类默认是 L1、但确实只有很窄场景会搜的，降到 L2（标准页：模板化内容，收录但不深耕）。
// 判定标准是"中文月搜索量"，不是"工具好不好用"。
const FORCE_DOWN = new Set([
  'age-crypto',
  'api-tester',
  'argon2-hash',
  'base64-hex-converter',
  'bech32',
  'bip39-generator',
  'camera-recorder',
  'certificate-key-parser',
  'coin-flipper',
  'crc-calculator',
  'dbm-mw-converter',
  'dns-queries',
  'ecdsa-key-pair-generator',
  'ed25519-key-pair-generator',
  'env-variables-converter',
  'folder-structure-diagram',
  'font-compare',
  'gpt-token-encoder',
  'ical-generator',
  'ical-merger',
  'ical-parser',
  'ipv6-address-converter',
  'javascript-to-json',
  'jq-tester',
  'json-escaper',
  'json-flatten-nestify',
  'json-query',
  'json-size-analyzer',
  'json-to-msgpack',
  'json-to-object',
  'json-to-php-array',
  'json-to-schema',
  'levenshtein-calculator',
  'markdown-editor',
  'math-formats-converter',
  'mermaid-exporter',
  'msgpack-to-json',
  'niceware-bytes-to-passphrase',
  'pack-files-for-ai',
  'pdf-linearize',
  'pdf-signature-checker',
  'properties-converter',
  'punycode-converter',
  'roman-numeral-converter',
  'rsa-ecdsa-signing',
  'rune-converter',
  'saml-parser',
  'social-link-sharer',
  'ssl-cert-converter',
  'svg-previewer',
  'text-to-nato-alphabet',
  'text-to-unicode-names',
  'trigo-viewer',
  'ttl-calculator',
  'unicode-formatter',
  'unicode-to-java-entities',
  'url-cleaner',
  'user-agent-parser',
  'x509-certificate-generator',
  'xslt-tester',
  'yaml-flatten-nestify',
]);

// 从 L3/L2 分类里捞回来、确实有中文搜索量的
const FORCE_UP = new Set([
  'regex-tester',
  'chmod-calculator',
  'crontab-generator',
  'cron-expression-builder',
  'gitignore-generator',
  'url-encoder',
  'url-parser',
  'url-builder',
  'user-agent-parser',
  'http-status-codes',
  'utm-url-generator',
  'slugify-string',
  'punycode-converter',
  'url-redirection-checker',
  'short-urls-expander',
  'csv-to-json',
  'json-to-csv',
  'excel-to-data',
  'markdown-to-html',
  'markdown-editor',
  'markdown-preview',
  'qr-code-generator',
  'qr-code-decoder',
  'qr-contact-info-generator',
  'wifi-qr-code-generator',
  'my-ip',
  'ip-geo-location',
  'ipv4-subnet-calculator',
  'ipv4-range-expander',
  'ipv6-subnet-calculator',
  'ipv4-address-converter',
  'ipv6-address-converter',
  'mac-address-generator',
  'random-port-generator',
  'port-numbers',
  'ping',
  'network-utils',
  'password-strength-analyser',
  'passphrase-generator',
  'password-generator',
  'uuid-generator',
  'nanoid-generator',
  'ulid-generator',
  'hash-text',
  'hmac-generator',
  'jwt-parser',
  'jwt-generator',
  'bcrypt',
  'otp-code-generator-and-validator',
  'rsa-key-pair-generator',
  'pgp-encryption',
  'pgp-keygen',
  'encryption',
  'token-generator',
  'random-numbers-generator',
  'random-line-picker',
  'dice-roller',
  'coin-flipper',
  'fortune-wheel',
  'string-obfuscator',
  'javascript-obfuscator',
  'sql-prettify',
  'json-viewer',
  'json-editor',
  'json-diff',
  'yaml-viewer',
  'xml-formatter',
  'html-prettifier',
  'html-to-markdown',
  'url-cleaner',
  'meta-tag-generator',
  'camera-recorder',
  'mic-tester',
  'keyboard-tester',
  'websocket-tester',
  'https-tester',
  'tcp-udp-port-tester',
  'dns-queries',
  'dns-query',
  'dns-tester',
  'api-tester',
]);

function decideTier(slug, category) {
  if (MEMO_SUFFIX.test(slug) || FORCE_L3.has(slug)) {
    return 'L3';
  }
  // FORCE_DOWN 优先于 FORCE_UP：两个名单都写了同一个 slug 时，以降级为准
  if (FORCE_DOWN.has(slug)) {
    return 'L2';
  }
  if (FORCE_UP.has(slug)) {
    return category === 'Cheatsheets' || category === 'Forensic' ? 'L2' : 'L1';
  }
  return TIER_BY_CATEGORY[category] ?? 'L2';
}

// ---------------------------------------------------------------- 解析 index.ts
function parseToolIndex(file) {
  const src = fs.readFileSync(file, 'utf-8');

  // path 是唯一权威访问路径（可能不等于目录名）
  const pathMatch = src.match(/path:\s*['"`]([^'"`]+)['"`]/);
  if (!pathMatch) {
    return null;
  }
  const toolPath = pathMatch[1];

  const categoryMatch = src.match(/category:\s*['"`]([^'"`]+)['"`]/);
  const keywordsMatch = src.match(/keywords:\s*\[([^\]]*)\]/);
  const redirectMatch = src.match(/redirectFrom:\s*\[([^\]]*)\]/);
  const npmMatch = src.match(/npmPackages:\s*\[([^\]]*)\]/);
  const externMatch = src.match(/externAccessDescription:/);

  const keywords = keywordsMatch
    ? (keywordsMatch[1].match(/['"`]([^'"`]+)['"`]/g) ?? []).map((s) => s.slice(1, -1))
    : [];
  const redirectFrom = redirectMatch
    ? (redirectMatch[1].match(/['"`]([^'"`]+)['"`]/g) ?? []).map((s) => s.slice(1, -1))
    : [];
  const npmPackages = npmMatch
    ? (npmMatch[1].match(/['"`]([^'"`]+)['"`]/g) ?? []).map((s) => s.slice(1, -1))
    : [];

  return {
    path: toolPath,
    slug: toolPath.replace(/^\/+|\/+$/g, ''),
    category: categoryMatch?.[1] ?? 'Default',
    keywords,
    redirectFrom,
    npmPackages,
    // 联网工具必须写 externAccessDescription，静态页要用它替换"数据不上传"的说法
    isExternalAccess: Boolean(externMatch),
  };
}

// ---------------------------------------------------------------- 解析 zh.yml
function parseZhTools() {
  const src = fs.readFileSync(zhYml, 'utf-8');
  const out = {};

  // 只取 tools 段下面每条工具的 title / description，其余（texts 等）一概不管。
  // 形如：
  //   base64-string-converter:
  //     title: Base64字符串编码器/解码器
  //     description: 简单地将字符串编码为Base64格式……
  const re = /^ {2}([a-z0-9][\w-]*):\r?\n(?:^ {4}.*\r?\n)*?^ {4}title: *(.+?)\r?\n(?:^ {4}.*\r?\n)*?^ {4}description: *(.+?)\r?\n/gm;

  let m;
  while ((m = re.exec(src)) !== null) {
    const [, slug, title, description] = m;
    out[slug] = { title: unquote(title), description: unquote(description) };
  }
  return out;
}

function unquote(s) {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

// ---------------------------------------------------------------- 主流程
const zhTools = parseZhTools();

const entries = fs
  .readdirSync(toolsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => path.join(toolsDir, d.name, 'index.ts'))
  .filter((f) => fs.existsSync(f))
  .map(parseToolIndex)
  .filter(Boolean);

const tools = entries.map((t) => {
  const zh = zhTools[t.slug] ?? {};
  const categoryZh = CATEGORY_ZH[t.category] ?? t.category;
  return {
    ...t,
    title: zh.title ?? '',
    description: zh.description ?? '',
    categoryZh,
    categorySeoName: CATEGORY_SEO_NAME[t.category] ?? categoryZh,
    tier: decideTier(t.slug, t.category),
  };
});

// 中文文案缺失的必须暴露出来，否则静态页会出现空 title —— 宁可构建失败也别静默产出坏页
const missingZh = tools.filter((t) => !t.title || !t.description);

tools.sort((a, b) => a.slug.localeCompare(b.slug));

const stats = { L1: 0, L2: 0, L3: 0 };
const byCategory = {};
for (const t of tools) {
  stats[t.tier] += 1;
  byCategory[t.category] ??= { total: 0, L1: 0, L2: 0, L3: 0 };
  byCategory[t.category].total += 1;
  byCategory[t.category][t.tier] += 1;
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(
  outFile,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      sourceCommit: 'extracted at build time',
      total: tools.length,
      tiers: stats,
      categories: CATEGORY_ZH,
      categorySeoNames: CATEGORY_SEO_NAME,
      tools,
    },
    null,
    2,
  ),
  'utf-8',
);

console.log(`已写出 ${path.relative(root, outFile)}`);
console.log(`工具总数: ${tools.length}`);
console.log(`分层: L1=${stats.L1}  L2=${stats.L2}  L3=${stats.L3}`);
if (missingZh.length > 0) {
  console.log(`\n[警告] ${missingZh.length} 个工具缺中文 title/description:`);
  for (const t of missingZh.slice(0, 30)) {
    console.log(`  - ${t.path} (${t.category})`);
  }
}
console.log('\n按分类分布:');
for (const [cat, s] of Object.entries(byCategory).sort((a, b) => b[1].total - a[1].total)) {
  console.log(`  ${cat.padEnd(14)} 共 ${String(s.total).padStart(3)}  L1=${s.L1} L2=${s.L2} L3=${s.L3}`);
}
