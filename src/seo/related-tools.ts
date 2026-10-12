/**
 * 「相关工具」人工策划映射表（全站唯一数据源）。
 *
 * 为什么不用算法自动推：
 *   之前的做法是「同分类优先 + 不足 6 个时按 (index + i*7) % 总数 随机补齐」，
 *   实测下来两类页面是坏的：
 *     · 小分类（Measurement 只有 1 个工具、XML/YAML 各 2 个）几乎 100% 靠随机填充，
 *       /percentage-calculator 的 6 个推荐里出现过「五笔编码查询」「合并单元格」这种完全无关的；
 *     · 大分类（Text 有 23 个）只按固定顺序取前 6 个，导致真正该互链的一对被截断
 *       —— /text-merge 与 /text-join 功能近乎重复，却从未互相推荐过。
 *   内链是给爬虫理解站内结构和给用户找下一步用法的，随机推荐两边都不讨好，只能人工策划。
 *
 * 使用方式（两边共用同一份，绝不各写一套）：
 *   1. 运行时   —— src/components/ToolUsageGuide.vue 拿 path 列表，再从 tools.store 取中文名
 *   2. 静态 HTML —— build/seo-prerender.ts 拿 path 列表，再从 tools-meta.json 取标题
 *   标题/描述这类会被语言切换影响的东西留在各自的渲染层，映射表只存 path 这个稳定标识。
 *   ⚠️ 一旦两边用不同的推荐结果，等于给爬虫和用户看不同内容（cloaking），AdSense 判违规。
 *
 * 维护约定：
 *   - 每条给 5~6 个，按「最该先点的」排序，第一位尽量放功能重叠或互为逆向操作的工具；
 *   - 只填本表 = 手动档；没填的工具会回退到「同分类」自动档（见 getRelatedToolPaths）；
 *   - 不要引用 tier = L3（noindex，如 /iana-whois-checker）的页面，链过去没有收录价值；
 *   - 新增/删除工具后，跑 `node scripts/verify-related-tools.mjs` 校验表里没有死链和自引用。
 */

/** 工具 path → 相关工具 path 列表（有序，第一位最相关） */
export const RELATED_TOOLS: Record<string, string[]> = {
  // ---------------- 日期与时间 ----------------
  '/age-calculator': [
    '/date-distance-calculator',
    '/days-calculator',
    '/lunar-calendar',
    '/date-converter',
    '/retirement-age-calculator',
    '/batch-timestamp',
  ],
  '/batch-timestamp': [
    '/date-converter',
    '/timezone-converter',
    '/date-distance-calculator',
    '/date-duration-calculator',
    '/api-tester',
    '/crontab-generator',
  ],
  '/china-holidays': [
    '/days-calculator',
    '/date-duration-calculator',
    '/date-distance-calculator',
    '/lunar-calendar',
    '/calendar-converter',
    '/retirement-age-calculator',
  ],
  '/date-converter': [
    '/batch-timestamp',
    '/timezone-converter',
    '/date-uppercase',
    '/english-date-format',
    '/date-distance-calculator',
    '/lunar-calendar',
  ],
  '/date-distance-calculator': [
    '/days-calculator',
    '/date-duration-calculator',
    '/age-calculator',
    '/china-holidays',
    '/date-converter',
    '/lunar-calendar',
  ],
  '/date-duration-calculator': [
    '/date-distance-calculator',
    '/days-calculator',
    '/china-holidays',
    '/date-converter',
    '/batch-timestamp',
    '/lunar-calendar',
  ],
  '/date-uppercase': [
    '/date-converter',
    '/rmb-numbers',
    '/lunar-calendar',
    '/english-date-format',
    '/date-duration-calculator',
    '/calendar-converter',
  ],
  '/days-calculator': [
    '/date-distance-calculator',
    '/date-duration-calculator',
    '/china-holidays',
    '/age-calculator',
    '/lunar-calendar',
    '/date-converter',
  ],
  '/english-date-format': [
    '/date-converter',
    '/date-uppercase',
    '/english-numbers',
    '/date-duration-calculator',
    '/timezone-converter',
    '/text-translate',
  ],
  '/lunar-calendar': [
    '/calendar-converter',
    '/china-holidays',
    '/date-converter',
    '/age-calculator',
    '/date-distance-calculator',
    '/date-uppercase',
  ],
  '/retirement-age-calculator': [
    '/age-calculator',
    '/salary-calculator',
    '/severance-pay-calculator',
    '/days-calculator',
    '/date-distance-calculator',
    '/income-tax-calculator',
  ],
  '/timezone-converter': [
    '/date-converter',
    '/batch-timestamp',
    '/date-distance-calculator',
    '/english-date-format',
    '/crontab-generator',
    '/api-tester',
  ],

  // ---------------- 开发工具 ----------------
  '/api-tester': [
    '/tcp-udp-port-tester',
    '/jwt-parser',
    '/json-prettify',
    '/dns-query',
    '/base64-string-converter',
    '/ping',
  ],
  '/crontab-generator': [
    '/timezone-converter',
    '/batch-timestamp',
    '/date-converter',
    '/sequence-generator',
    '/api-tester',
    '/date-duration-calculator',
  ],
  '/css-js-prettify-minify': [
    '/html-prettifier',
    '/sql-prettify',
    '/json-prettify',
    '/html-strip',
    '/url-encoder',
    '/json-minify',
  ],
  '/sql-prettify': ['/json-prettify', '/css-js-prettify-minify', '/xml-formatter', '/yaml-prettify', '/api-tester'],

  // ---------------- 条码与二维码 ----------------
  '/barcode-generator': ['/barcode-reader', '/qrcode-generator', '/qr-code-decoder', '/watermarker', '/image-converter'],
  '/barcode-reader': ['/barcode-generator', '/qr-code-decoder', '/ocr-image', '/image-converter', '/qrcode-generator'],
  '/qr-code-decoder': ['/qrcode-generator', '/barcode-reader', '/ocr-image', '/image-converter', '/barcode-generator'],
  '/qrcode-generator': ['/qr-code-decoder', '/barcode-generator', '/barcode-reader', '/url-encoder', '/watermarker'],

  // ---------------- 进制与编码 ----------------
  '/base-converter': [
    '/base64-string-converter',
    '/data-storage-unit-converter',
    '/hash-text',
    '/encryption',
    '/uuid-generator',
    '/base64-file-converter',
  ],
  '/base64-file-converter': [
    '/base64-string-converter',
    '/data-storage-unit-converter',
    '/image-converter',
    '/heic-converter',
    '/hash-text',
    '/pdf-compressor',
  ],
  '/base64-string-converter': [
    '/base64-file-converter',
    '/url-encoder',
    '/hash-text',
    '/encryption',
    '/json-string-converter',
    '/jwt-parser',
  ],
  '/data-storage-unit-converter': [
    '/many-units-converter',
    '/base-converter',
    '/base64-file-converter',
    '/image-resizer',
    '/pdf-compressor',
    '/image-converter',
  ],
  '/many-units-converter': [
    '/data-storage-unit-converter',
    '/percentage-calculator',
    '/bmi-calculator',
    '/base-converter',
    '/currency-converter',
    '/number-rounding',
  ],

  // ---------------- 数据与表格 ----------------
  '/bmi-calculator': ['/many-units-converter', '/percentage-calculator', '/salary-calculator', '/age-calculator', '/number-rounding'],
  '/calendar-converter': [
    '/lunar-calendar',
    '/date-converter',
    '/china-holidays',
    '/date-distance-calculator',
    '/timezone-converter',
    '/date-uppercase',
  ],
  '/currency-converter': [
    '/many-units-converter',
    '/percentage-calculator',
    '/number-rounding',
    '/english-amount',
    '/rmb-numbers',
    '/loan-calculator',
  ],
  '/english-amount': ['/rmb-numbers', '/english-numbers', '/number-rounding', '/currency-converter', '/text-translate'],
  '/excel-cell-merge': ['/excel-cell-unmerge', '/table-pivot', '/table-lookup', '/excel-merge-workbooks', '/table-transpose'],
  '/excel-cell-unmerge': ['/excel-cell-merge', '/table-pivot', '/table-lookup', '/table-transpose', '/excel-merge-workbooks'],
  '/excel-merge-workbooks': ['/excel-cell-merge', '/excel-cell-unmerge', '/table-pivot', '/table-lookup', '/csv-to-json'],
  '/id-card-parser': ['/age-calculator', '/kinship-calculator', '/text-extract', '/date-uppercase', '/retirement-age-calculator'],
  '/kinship-calculator': ['/id-card-parser', '/age-calculator', '/lunar-calendar', '/special-symbols', '/text-format'],
  '/number-process': ['/number-rounding', '/rmb-numbers', '/percentage-calculator', '/english-numbers', '/english-amount'],
  '/number-rounding': ['/number-process', '/percentage-calculator', '/rmb-numbers', '/english-amount', '/many-units-converter'],
  '/rmb-numbers': ['/english-amount', '/number-process', '/date-uppercase', '/number-rounding', '/english-numbers'],
  '/table-converter': ['/table-transpose', '/table-lookup', '/table-pivot', '/json-html-table', '/csv-to-json', '/excel-cell-merge'],
  '/table-lookup': ['/table-pivot', '/table-converter', '/table-transpose', '/excel-cell-merge', '/csv-to-json'],
  '/table-pivot': ['/table-lookup', '/table-converter', '/table-transpose', '/excel-cell-merge', '/excel-merge-workbooks'],
  '/table-transpose': ['/table-converter', '/table-pivot', '/table-lookup', '/excel-cell-unmerge', '/json-html-table'],

  // ---------------- 文本处理 ----------------
  '/case-converter': [
    '/text-format',
    '/text-typography',
    '/fullwidth-halfwidth-converter',
    '/text-split',
    '/list-converter',
    '/text-workflow',
  ],
  '/chinese-pinyin-converter': [
    '/chinese-script-converter',
    '/wubi-dict',
    '/text-typography',
    '/fullwidth-halfwidth-converter',
    '/text-statistics',
  ],
  '/chinese-script-converter': [
    '/chinese-pinyin-converter',
    '/text-typography',
    '/fullwidth-halfwidth-converter',
    '/wubi-dict',
    '/text-translate',
  ],
  '/english-numbers': ['/number-process', '/rmb-numbers', '/english-amount', '/text-format', '/sequence-generator'],
  '/fullwidth-halfwidth-converter': [
    '/case-converter',
    '/text-typography',
    '/text-format',
    '/chinese-pinyin-converter',
    '/special-symbols',
  ],
  '/list-converter': ['/text-split', '/text-join', '/text-merge', '/text-format', '/text-dedupe', '/csv-to-json'],
  '/regex-tester': ['/text-extract', '/text-format', '/text-split', '/json-diff', '/text-workflow'],
  '/special-symbols': ['/text-typography', '/fullwidth-halfwidth-converter', '/text-format', '/wubi-dict', '/kinship-calculator'],
  '/text-dedupe': ['/text-format', '/text-split', '/list-converter', '/text-similarity', '/text-diff'],
  '/text-diff': ['/text-similarity', '/json-diff', '/text-dedupe', '/text-format', '/text-extract'],
  '/text-extract': ['/regex-tester', '/text-split', '/text-format', '/text-statistics', '/html-strip'],
  '/text-format': ['/text-dedupe', '/text-split', '/case-converter', '/text-join', '/text-workflow', '/regex-tester'],
  '/text-join': ['/text-merge', '/text-split', '/list-converter', '/text-format', '/text-dedupe'],
  '/text-merge': ['/text-join', '/text-split', '/list-converter', '/text-format', '/text-numbering'],
  '/text-numbering': ['/text-merge', '/text-join', '/text-split', '/list-converter', '/sequence-generator'],
  '/text-similarity': ['/text-diff', '/text-dedupe', '/text-format', '/text-statistics', '/text-translate'],
  '/text-split': ['/text-join', '/text-merge', '/text-format', '/list-converter', '/text-numbering'],
  '/text-statistics': ['/text-extract', '/text-similarity', '/text-typography', '/typing-speed-test', '/text-format'],
  '/text-translate': ['/image-translate', '/text-typography', '/chinese-script-converter', '/text-similarity', '/ocr-image'],
  '/text-typography': [
    '/fullwidth-halfwidth-converter',
    '/case-converter',
    '/chinese-pinyin-converter',
    '/special-symbols',
    '/text-format',
  ],
  '/text-workflow': ['/text-format', '/text-split', '/text-join', '/text-extract', '/regex-tester'],
  '/typing-speed-test': ['/text-statistics', '/text-format', '/text-typography', '/case-converter', '/text-translate'],
  '/wubi-dict': ['/chinese-pinyin-converter', '/chinese-script-converter', '/special-symbols', '/text-extract', '/text-format'],

  // ---------------- Web ----------------
  '/color-converter': ['/watermarker', '/image-converter', '/css-js-prettify-minify', '/html-prettifier', '/remove-background'],
  '/html-prettifier': ['/html-strip', '/css-js-prettify-minify', '/html-to-markdown', '/markdown-to-html', '/json-prettify'],
  '/html-strip': ['/html-prettifier', '/html-to-markdown', '/text-extract', '/markdown-to-html', '/css-js-prettify-minify'],
  '/url-encoder': ['/base64-string-converter', '/api-tester', '/qrcode-generator', '/html-prettifier', '/json-string-converter'],

  // ---------------- 财务 ----------------
  '/credit-card-installment-calculator': [
    '/loan-calculator',
    '/mortgage-calculator',
    '/salary-calculator',
    '/percentage-calculator',
    '/income-tax-calculator',
  ],
  '/income-tax-calculator': [
    '/salary-calculator',
    '/severance-pay-calculator',
    '/percentage-calculator',
    '/retirement-age-calculator',
    '/credit-card-installment-calculator',
  ],
  '/loan-calculator': [
    '/mortgage-calculator',
    '/credit-card-installment-calculator',
    '/percentage-calculator',
    '/salary-calculator',
    '/income-tax-calculator',
  ],
  '/mortgage-calculator': [
    '/loan-calculator',
    '/credit-card-installment-calculator',
    '/salary-calculator',
    '/percentage-calculator',
    '/currency-converter',
  ],
  '/salary-calculator': [
    '/income-tax-calculator',
    '/severance-pay-calculator',
    '/loan-calculator',
    '/percentage-calculator',
    '/retirement-age-calculator',
  ],
  '/severance-pay-calculator': [
    '/salary-calculator',
    '/income-tax-calculator',
    '/retirement-age-calculator',
    '/date-distance-calculator',
    '/percentage-calculator',
  ],

  // ---------------- JSON ----------------
  '/csv-to-json': ['/json-to-csv', '/json-prettify', '/table-converter', '/json-to-yaml-converter', '/json-html-table'],
  '/json-diff': ['/text-diff', '/json-prettify', '/json-minify', '/regex-tester', '/text-similarity'],
  '/json-html-table': ['/json-markdown-table', '/json-to-csv', '/json-prettify', '/table-converter', '/markdown-table-generator'],
  '/json-markdown-table': [
    '/json-html-table',
    '/markdown-table-generator',
    '/json-to-csv',
    '/json-prettify',
    '/table-converter',
  ],
  '/json-minify': ['/json-prettify', '/json-string-converter', '/json-diff', '/css-js-prettify-minify', '/json-to-yaml-converter'],
  '/json-prettify': ['/json-minify', '/json-string-converter', '/json-to-yaml-converter', '/json-diff', '/csv-to-json'],
  '/json-string-converter': ['/json-prettify', '/json-minify', '/json-to-yaml-converter', '/csv-to-json', '/url-encoder'],
  '/json-to-csv': ['/csv-to-json', '/json-html-table', '/table-converter', '/json-prettify', '/excel-merge-workbooks'],
  '/json-to-yaml-converter': [
    '/yaml-to-json-converter',
    '/yaml-prettify',
    '/json-prettify',
    '/json-minify',
    '/json-string-converter',
  ],

  // ---------------- 网络 ----------------
  '/dns-query': ['/my-ip', '/ip-geo-location', '/ping', '/tcp-udp-port-tester', '/free-ssl', '/api-tester'],
  '/free-ssl': ['/dns-query', '/api-tester', '/tcp-udp-port-tester', '/ping', '/my-ip'],
  '/iana-whois-checker': ['/dns-query', '/my-ip', '/ip-geo-location', '/free-ssl', '/ping'],
  '/ip-geo-location': ['/my-ip', '/dns-query', '/timezone-converter', '/ping', '/tcp-udp-port-tester'],
  '/my-ip': ['/ip-geo-location', '/dns-query', '/ping', '/tcp-udp-port-tester', '/api-tester'],
  '/ping': ['/tcp-udp-port-tester', '/my-ip', '/dns-query', '/api-tester', '/ip-geo-location'],
  '/tcp-udp-port-tester': ['/ping', '/api-tester', '/my-ip', '/dns-query', '/ip-geo-location'],

  // ---------------- 加密 ----------------
  '/encryption': ['/hash-text', '/jwt-parser', '/base64-string-converter', '/base-converter', '/token-generator'],
  '/hash-text': ['/encryption', '/jwt-parser', '/base64-string-converter', '/base-converter', '/uuid-generator'],
  '/jwt-parser': ['/encryption', '/hash-text', '/base64-string-converter', '/api-tester', '/json-prettify'],

  // ---------------- 图片 ----------------
  '/heic-converter': ['/image-converter', '/image-resizer', '/ocr-image', '/watermarker', '/remove-background', '/image-translate'],
  '/image-converter': ['/heic-converter', '/image-resizer', '/watermarker', '/remove-background', '/ocr-image', '/pdf-compressor'],
  '/image-resizer': ['/image-converter', '/heic-converter', '/watermarker', '/remove-background', '/pdf-compressor', '/ocr-image'],
  '/image-translate': ['/text-translate', '/ocr-image', '/image-converter', '/heic-converter', '/remove-background'],
  '/ocr-image': ['/pdf-text-extractor', '/image-translate', '/heic-converter', '/image-converter', '/text-extract'],
  '/remove-background': ['/image-converter', '/watermarker', '/image-resizer', '/heic-converter', '/ocr-image'],
  '/watermarker': ['/image-converter', '/image-resizer', '/remove-background', '/heic-converter', '/color-converter'],

  // ---------------- Markdown ----------------
  '/html-to-markdown': ['/markdown-to-html', '/html-strip', '/html-prettifier', '/markdown-preview', '/markdown-to-wechat'],
  '/markdown-preview': [
    '/markdown-to-html',
    '/markdown-to-wechat',
    '/html-to-markdown',
    '/markdown-table-generator',
    '/text-statistics',
  ],
  '/markdown-table-generator': [
    '/json-markdown-table',
    '/table-converter',
    '/markdown-preview',
    '/json-html-table',
    '/markdown-to-html',
  ],
  '/markdown-to-html': [
    '/html-to-markdown',
    '/markdown-preview',
    '/markdown-to-wechat',
    '/html-prettifier',
    '/markdown-table-generator',
  ],
  '/markdown-to-wechat': [
    '/markdown-preview',
    '/markdown-to-html',
    '/html-to-markdown',
    '/markdown-table-generator',
    '/text-typography',
  ],

  // ---------------- PDF ----------------
  '/html-to-pdf': ['/pdf-compressor', '/pdf-concat', '/markdown-to-html', '/html-prettifier', '/pdf-text-extractor'],
  '/pdf-compressor': ['/pdf-concat', '/html-to-pdf', '/image-resizer', '/pdf-text-extractor', '/image-converter'],
  '/pdf-concat': ['/pdf-compressor', '/html-to-pdf', '/pdf-text-extractor', '/image-converter', '/ocr-image'],
  '/pdf-text-extractor': ['/ocr-image', '/pdf-concat', '/pdf-compressor', '/text-extract', '/html-to-pdf'],

  // ---------------- 单位 ----------------
  '/percentage-calculator': [
    '/many-units-converter',
    '/currency-converter',
    '/number-rounding',
    '/loan-calculator',
    '/income-tax-calculator',
    '/bmi-calculator',
  ],

  // ---------------- 生成器 ----------------
  '/random-picker': ['/sequence-generator', '/text-split', '/list-converter', '/text-dedupe', '/token-generator'],
  '/sequence-generator': ['/random-picker', '/token-generator', '/uuid-generator', '/text-numbering', '/crontab-generator'],
  '/token-generator': ['/uuid-generator', '/sequence-generator', '/random-picker', '/hash-text', '/encryption'],
  '/uuid-generator': ['/token-generator', '/sequence-generator', '/hash-text', '/random-picker', '/encryption'],

  // ---------------- XML / YAML ----------------
  '/xml-formatter': ['/xml-to-json', '/json-prettify', '/html-prettifier', '/yaml-prettify', '/json-to-yaml-converter'],
  '/xml-to-json': ['/xml-formatter', '/json-prettify', '/json-to-yaml-converter', '/csv-to-json', '/json-html-table'],
  '/yaml-prettify': ['/yaml-to-json-converter', '/json-prettify', '/xml-formatter', '/json-to-yaml-converter', '/json-minify'],
  '/yaml-to-json-converter': ['/json-to-yaml-converter', '/yaml-prettify', '/json-prettify', '/xml-to-json', '/json-string-converter'],
};

/**
 * 取某个工具的相关工具 path 列表。
 *
 * 手动档（RELATED_TOOLS 里登记过）直接用；没登记的回退到「同分类」自动档，
 * 这样新增工具时即使忘了登记，也不会出现空白或随机填充。
 *
 * @param currentPath 当前工具页路由，如 '/case-converter'
 * @param allTools 全部工具（运行时传 tools.store，构建期传 tools-meta.json）
 * @param limit 返回条数上限
 */
export function getRelatedToolPaths(
  currentPath: string,
  allTools: { path: string; category?: string; tier?: string }[],
  limit = 6,
): string[] {
  const known = new Set(allTools.map((t) => t.path));
  // noindex 页面（L3）不给内链：链过去既没有收录价值，也可能把权重导向不收录的页
  const indexable = new Set(allTools.filter((t) => t.tier !== 'L3').map((t) => t.path));

  const picked: string[] = [];
  const push = (p: string) => {
    if (p === currentPath || picked.includes(p)) {
      return;
    }
    if (!known.has(p) || !indexable.has(p)) {
      return;
    }
    if (picked.length < limit) {
      picked.push(p);
    }
  };

  const manual = RELATED_TOOLS[currentPath];
  for (const p of manual ?? []) {
    push(p);
  }

  // 只有「表里压根没登记」才回退到同分类，保证新增工具忘登记时页面不会空白。
  // ⚠️ 不要改成「手动档不足 limit 就补齐」：人工既然配了 5 个，说明就是要这 5 个，
  // 再自动塞一个同分类顺序取到的工具进去，既违背策划意图，质量也不可控
  //（实测 /text-merge 策划 5 个，却被补进「大小写转换器」）。
  if (!manual) {
    const current = allTools.find((t) => t.path === currentPath);
    if (current?.category) {
      for (const t of allTools) {
        if (picked.length >= limit) {
          break;
        }
        if (t.category === current.category) {
          push(t.path);
        }
      }
    }
  }

  return picked;
}
