import { describe, expect, it } from 'vitest';
import toolsMetaRaw from '../tools-meta.json?raw';
import { hasToolContent } from './index';

/**
 * L1 是「深耕页」档位：每页应该配一份手写正文（说明 / 步骤 / 示例 / FAQ）。
 *
 * 坑在这里：**档位是按分类给的**（`scripts/extract-tools-meta.mjs` 的 TIER 表把整个分类
 * 标成 L1），而正文要单独写进 `src/seo/content/`。漏写不会报错 —— 页面照常生成、构建日志
 * 照常报「工具页 113」，但静态正文会退化到通用兜底文案（300~480 字，真 L1 是 1200~1500 字），
 * 等于占着 L1 的名额、只有 L2 的内容。这种情况已经发生过 16 次（2026-10-17 实测）。
 *
 * 下面是**存量欠账**（只许变短）：
 *   - 新加的 L1 工具必须有正文，否则「不许出现新的 L1 缺正文页」会红
 *   - 补完正文记得把路径从这里划掉，否则「名单里的欠账页必须仍然缺正文」会红
 * 两条一起构成棘轮，谁都别想悄悄滑过去。
 */
const L1_WITHOUT_CONTENT = [
  '/free-ssl',
  '/fullwidth-halfwidth-converter',
  '/image-translate',
  '/income-tax-calculator',
  '/json-html-table',
  '/json-markdown-table',
  '/loan-calculator',
  '/mortgage-calculator',
  '/pdf-organize',
  '/salary-calculator',
  '/special-symbols',
  '/text-numbering',
  '/text-similarity',
  '/text-translate',
  '/text-typography',
];

const meta = JSON.parse(toolsMetaRaw) as { tools: { path: string; tier: string }[] };
const l1Paths = meta.tools.filter(tool => tool.tier === 'L1').map(tool => tool.path);

describe('L1 正文覆盖', () => {
  it('名单里的欠账页确实仍然缺正文（补完就要从名单里划掉）', () => {
    // 只断言「缺」会把空实现也判绿，所以先确认名单本身是有效的 L1 路由
    const notL1 = L1_WITHOUT_CONTENT.filter(path => !l1Paths.includes(path));

    expect(notL1).toEqual([]);
    expect(L1_WITHOUT_CONTENT.filter(path => hasToolContent(path))).toEqual([]);
  });

  it('不许出现新的 L1 缺正文页', () => {
    const missing = l1Paths.filter(path => !hasToolContent(path)).sort();

    expect(missing).toEqual([...L1_WITHOUT_CONTENT].sort());
  });
});
