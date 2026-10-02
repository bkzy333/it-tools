/**
 * 教程 Markdown 的 frontmatter 解析。
 *
 * 构建期（build/seo-prerender.ts 生成静态 HTML）和运行时（GuidePage.vue 渲染给真人看）
 * 都用这一个实现 —— 两边解析结果必须一致，否则静态标题和用户看到的标题会不一样。
 * 只支持本项目实际用到的语法：标量、行内数组 [a, b]、以及 "- 项" 形式的列表。
 */

export interface ParsedMarkdown {
  data: Record<string, unknown>;
  body: string;
}

export function parseFrontmatter(raw: string): ParsedMarkdown {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) {
    return { data: {}, body: raw };
  }
  const [, head, body] = m;
  const data: Record<string, unknown> = {};
  let currentListKey: string | null = null;

  for (const line of head.split(/\r?\n/)) {
    const listItem = line.match(/^\s*-\s+(.*)$/);
    if (listItem && currentListKey) {
      (data[currentListKey] as string[]).push(listItem[1].trim().replace(/^["']|["']$/g, ''));
      continue;
    }
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!kv) {
      continue;
    }
    const [, key, rawValue] = kv;
    const value = rawValue.trim();
    if (value === '') {
      data[key] = [];
      currentListKey = key;
    } else if (value.startsWith('[') && value.endsWith(']')) {
      data[key] = value
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
      currentListKey = null;
    } else {
      data[key] = value.replace(/^["']|["']$/g, '');
      currentListKey = null;
    }
  }
  return { data, body };
}

export interface GuideFrontmatter {
  slug: string;
  title: string;
  description: string;
  keywords: string[];
  relatedTools: string[];
}

export function toGuideFrontmatter(data: Record<string, unknown>, fallbackSlug: string): GuideFrontmatter {
  const asArray = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]).filter(Boolean) : []);
  return {
    slug: String(data.slug ?? fallbackSlug),
    title: String(data.title ?? fallbackSlug),
    description: String(data.description ?? ''),
    keywords: asArray(data.keywords),
    relatedTools: asArray(data.relatedTools),
  };
}
