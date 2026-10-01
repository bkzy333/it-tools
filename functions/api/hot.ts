// Cloudflare Pages Functions：全站工具热度统计（KV 存储）
//
//   GET  /api/hot              取热门工具排行（结果缓存 5 分钟）
//   POST /api/hot              上报一次访问，body: { "tool": "/json-prettify" }
//
// 绑定要求：Cloudflare Pages 项目 → 设置 → Functions → KV 命名空间绑定
//          变量名必须叫 TOOLS_USAGE，值选你创建的 KV 命名空间
// 没绑定时接口返回 503，前端会自动回退到「精选热门 + 本机常用」，不会报错。

const CACHE_KEY = 'ranking:top';
// 缓存 30 分钟：刷新一次排行要读取全部工具的计数（几百次 KV 读），
// 缓存越久越省免费额度（KV 免费版 10 万次读/天、1000 次写/天）。
const CACHE_TTL_MS = 30 * 60 * 1000;
const TOP_LIMIT = 50;
const KEY_PREFIX = 'tool:';
// 只接受形如 /json-prettify 的路径，避免有人乱塞 key 把 KV 写爆
const TOOL_PATH_RE = /^\/[a-z0-9-]{1,60}$/;

interface KvNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number }): Promise<{ keys: { name: string }[] }>;
}

type Env = { TOOLS_USAGE?: KvNamespace };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function notBound() {
  return json({ error: 'KV namespace TOOLS_USAGE is not bound' }, 503);
}

async function buildRanking(kv: KvNamespace) {
  const { keys } = await kv.list({ prefix: KEY_PREFIX, limit: 1000 });

  const entries = await Promise.all(
    keys.map(async ({ name }) => ({
      path: name.slice(KEY_PREFIX.length),
      count: Number((await kv.get(name)) ?? 0) || 0,
    })),
  );

  return entries.sort((a, b) => b.count - a.count).slice(0, TOP_LIMIT);
}

export async function onRequestGet(context: { env: Env }) {
  const kv = context.env?.TOOLS_USAGE;
  if (!kv) {
    return notBound();
  }

  // 命中缓存直接返回（一次 KV 读），避免每次访问首页都把几百个 key 全读一遍
  try {
    const raw = await kv.get(CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw);
      if (Array.isArray(cached?.list) && Date.now() - Number(cached.updatedAt || 0) < CACHE_TTL_MS) {
        return json({ list: cached.list, updatedAt: cached.updatedAt, cached: true });
      }
    }
  } catch {
    // 缓存损坏就当没有，下面重算
  }

  try {
    const list = await buildRanking(kv);
    await kv.put(CACHE_KEY, JSON.stringify({ updatedAt: Date.now(), list }));
    return json({ list, updatedAt: Date.now(), cached: false });
  } catch (e) {
    return json({ error: `build ranking failed: ${String(e)}` }, 500);
  }
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  const kv = context.env?.TOOLS_USAGE;
  if (!kv) {
    return notBound();
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: 'invalid json body' }, 400);
  }

  const tool = (body as { tool?: unknown })?.tool;
  if (typeof tool !== 'string' || !TOOL_PATH_RE.test(tool)) {
    return json({ error: 'invalid tool path' }, 400);
  }

  const key = `${KEY_PREFIX}${tool}`;
  const current = Number((await kv.get(key)) ?? 0) || 0;
  const next = current + 1;
  await kv.put(key, String(next));

  return json({ tool, count: next });
}
