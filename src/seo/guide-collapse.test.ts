import { describe, expect, it } from 'vitest';
// 用 ?raw 读：tools-meta.json 有 270KB，按 JSON 模块 import 会走 resolveJsonModule，
// 而这里只要一份路径清单，读成字符串自己的用 JSON.parse 更省事也更明确。
import toolsMetaRaw from './tools-meta.json?raw';
import { shouldCollapseGuide } from './guide-collapse';

/**
 * 这组用例守的是一条 cloaking 级的约定：说明区的折叠名单被**运行时**
 * （ToolUsageGuide.vue，拿的是带尾斜杠的 `route.path`）和**静态预渲染**
 * （seo-prerender.ts，拿的是 tools-meta 里不带尾斜杠的 `tool.path`）同时读取。
 * 两侧路径形态不一样，只要有一侧没走归一化，就会出现「爬虫看展开版、用户看折叠版」。
 */
describe('shouldCollapseGuide', () => {
  it('运行时路径带尾斜杠也命中', () => {
    expect(shouldCollapseGuide('/html-editor/')).toBe(true);
  });

  it('静态侧的裸路径同样命中（两侧必须同时命中）', () => {
    expect(shouldCollapseGuide('/html-editor')).toBe(true);
  });

  it('没登记的页面不折叠', () => {
    expect(shouldCollapseGuide('/base64')).toBe(false);
    expect(shouldCollapseGuide('/qrcode-generator/')).toBe(false);
    expect(shouldCollapseGuide('')).toBe(false);
  });

  it('名单里的路径在 tools-meta 里真实存在（防写错 slug 后静默不生效）', () => {
    const meta = JSON.parse(toolsMetaRaw) as { tools: { path: string }[] };
    const known = new Set(meta.tools.map(t => t.path));
    // 名单是私有常量，这里反过来核：所有真实工具路径里，命中的必须恰好是预期那几个
    const hits = [...known].filter(p => shouldCollapseGuide(p));

    expect(hits).toContain('/html-editor');
    expect(hits).toEqual(['/html-editor']);
  });
});
