// Cloudflare Pages Functions：工具页「一键反馈」
//
//   POST /api/feedback           提交反馈，body: { tool, toolName, message, contact, ua }
//   GET  /api/feedback?token=xxx 查看最近 100 条反馈（需要在环境变量里配 FEEDBACK_TOKEN）
//
// 查看方式：浏览器直接打开上面那个 GET 地址即可（会渲染成表格）；
// 用 curl / 脚本访问则拿到 JSON。
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
  const records = items.filter(Boolean).reverse();

  // 浏览器打开时给一个能直接看的表格，省得还要自己解析 JSON
  const accept = context.request.headers.get('accept') ?? '';
  if (accept.includes('text/html')) {
    return new Response(renderHtml(records as FeedbackRecord[]), {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  return json({ items: records });
}

interface FeedbackRecord {
  tool?: string;
  toolName?: string;
  message?: string;
  contact?: string;
  ua?: string;
  ip?: string;
  country?: string;
  time?: string;
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderHtml(records: FeedbackRecord[]): string {
  const rows = records
    .map(
      (item) => `<tr>
      <td>${esc(item.time?.slice(0, 19).replace('T', ' '))}</td>
      <td>${esc(item.toolName || item.tool)}<br><span class="path">${esc(item.tool)}</span></td>
      <td class="msg">${esc(item.message)}</td>
      <td>${esc(item.contact)}</td>
      <td>${esc(item.country)}<br><span class="path">${esc(item.ip)}</span></td>
      <td class="ua">${esc(item.ua)}</td>
    </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>用户反馈 · ${records.length} 条</title>
<style>
  body{font-family:system-ui,-apple-system,"Microsoft YaHei",sans-serif;margin:24px;color:#222;background:#fff}
  h1{font-size:18px;font-weight:600;margin:0 0 4px}
  .meta{font-size:12px;color:#888;margin-bottom:18px}
  table{border-collapse:collapse;width:100%;font-size:13px}
  th,td{border:1px solid #e3e3e3;padding:8px 10px;text-align:left;vertical-align:top}
  th{background:#f7f7f7;font-weight:600;white-space:nowrap}
  td.msg{min-width:280px;white-space:pre-wrap;word-break:break-word}
  td.ua{max-width:220px;word-break:break-all;color:#888;font-size:12px}
  .path{color:#aaa;font-size:12px}
  .empty{padding:24px;text-align:center;color:#888}
</style></head>
<body>
<h1>用户反馈</h1>
<div class="meta">共 ${records.length} 条（最多显示最近 100 条，按时间倒序）</div>
${
  records.length === 0
    ? '<div class="empty">暂无反馈</div>'
    : `<table><thead><tr>
    <th>时间</th><th>工具</th><th>反馈内容</th><th>联系方式</th><th>来源</th><th>User Agent</th>
  </tr></thead><tbody>${rows}</tbody></table>`
}
</body></html>`;
}
