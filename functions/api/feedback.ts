// Cloudflare Pages Functions：工具页「一键反馈」
//
//   POST /api/feedback           提交反馈，body: { tool, toolName, message, contact, ua }
//   GET  /api/feedback?token=xxx 查看最近 100 条反馈（需要在环境变量里配 FEEDBACK_TOKEN）
//
// 存储：复用热门榜那个 KV 命名空间（变量名 TOOLS_USAGE），用 fb: 前缀区分，
// 所以不用再新建一个 KV 绑定。热门榜只扫 tool: 前缀，两者互不干扰。

const KEY_PREFIX = 'fb:';
const TOOL_PATH_RE = /^\/[a-z0-9-]{1,60}$/;

interface KvNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number }): Promise<{ keys: { name: string }[] }>;
}

type Env = { TOOLS_USAGE?: KvNamespace; FEEDBACK_TOKEN?: string };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  const kv = context.env?.TOOLS_USAGE;
  if (!kv) {
    return json({ error: 'KV namespace TOOLS_USAGE is not bound' }, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'invalid json body' }, 400);
  }

  const tool = typeof body.tool === 'string' && TOOL_PATH_RE.test(body.tool) ? body.tool : '';
  const content = typeof body.message === 'string' ? body.message.trim() : '';

  if (content.length === 0 || content.length > 2000) {
    return json({ error: 'message must be 1-2000 chars' }, 400);
  }

  const record = {
    tool,
    toolName: typeof body.toolName === 'string' ? body.toolName.slice(0, 120) : '',
    message: content,
    contact: typeof body.contact === 'string' ? body.contact.slice(0, 200) : '',
    ua: typeof body.ua === 'string' ? body.ua.slice(0, 300) : '',
    ip: context.request.headers.get('cf-connecting-ip') ?? '',
    country: context.request.headers.get('cf-ipcountry') ?? '',
    time: new Date().toISOString(),
  };

  const key = `${KEY_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await kv.put(key, JSON.stringify(record));

  return json({ ok: true });
}

export async function onRequestGet(context: { request: Request; env: Env }) {
  const kv = context.env?.TOOLS_USAGE;
  const token = context.env?.FEEDBACK_TOKEN;
  if (!kv) {
    return json({ error: 'KV namespace TOOLS_USAGE is not bound' }, 503);
  }

  const url = new URL(context.request.url);
  if (!token || url.searchParams.get('token') !== token) {
    return json({ error: 'unauthorized' }, 401);
  }

  const { keys } = await kv.list({ prefix: KEY_PREFIX, limit: 100 });
  const items = await Promise.all(
    keys.map(async ({ name }) => {
      const raw = await kv.get(name);
      try {
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    }),
  );

  // fb:<时间戳>-<随机> 按时间戳倒序
  return json({ items: items.filter(Boolean).reverse() });
}
