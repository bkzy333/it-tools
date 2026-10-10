// Cloudflare Pages Function：服务端转发 HTTP 请求，绕开浏览器跨域(CORS)限制。
//
//   POST /api/proxy
//   body(JSON): { method, url, headers: [["K","V"], ...], body: string|null, timeout?: number }
//   returns(JSON): { status, statusText, headers: {k:v}, body, bodyEncoding: 'utf-8'|'base64', elapsedMs }
//
// 部署要求：纯转发，无需 KV 绑定。属于「会向外发请求」的能力，已在工具页 externAccessDescription 说明。
// 安全：基础 SSRF 防护，拦截内网 / 回环 / 链路本地 / 元数据地址与明显内部主机名，避免被人拿去打内网。

interface ProxyInput {
  method?: string;
  url?: string;
  headers?: [string, string][];
  body?: string | null;
  timeout?: number;
}

// 拦截明显的内网 / 保留地址，防止 SSRF
const PRIVATE_HOST_RE = /^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.svc|.*\.cluster\.local|.*\.example|.*\.test)$/i;
const PRIVATE_IP_RE = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.0\.0\.0|::1|fe80:|fc|fd)/i;

function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase();
  if (PRIVATE_HOST_RE.test(h)) return true;
  if (PRIVATE_IP_RE.test(h)) return true;
  return false;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': '*',
      'access-control-allow-headers': '*',
    },
  });
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// 文本型 content-type 直接当字符串读；其余按 base64 返回，前端解码后通常给「(二进制内容)」提示
const TEXT_CT_RE = /^(text\/|application\/(json|xml|javascript|csv|ld\+json|graphql|x-www-form-urlencoded|eco|typescript|xml\+.*|x-ndjson)|image\/svg\+xml)/i;

// 由运行时 / 传输层控制的头，不允许用户覆盖，否则上游可能按压缩编码返回导致无法读取正文
const STRIP_HEADERS = new Set([
  'host',
  'content-length',
  'connection',
  'transfer-encoding',
  'upgrade',
  'keep-alive',
  'accept-encoding',
  'origin',
  'referer',
]);

export async function onRequestPost(context: { request: Request }) {
  let input: ProxyInput;
  try {
    input = (await context.request.json()) as ProxyInput;
  } catch {
    return json({ error: 'invalid json body' }, 400);
  }

  const method = (input.method || 'GET').toUpperCase();
  const target = (input.url || '').trim();
  if (!target) return json({ error: 'missing url' }, 400);

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return json({ error: 'invalid url' }, 400);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return json({ error: 'only http/https allowed' }, 400);
  }
  if (isBlockedHost(parsed.hostname)) {
    return json({ error: 'target host is not allowed (private/internal address)' }, 403);
  }

  const headers = new Headers();
  for (const [k, v] of input.headers || []) {
    if (!k) continue;
    if (STRIP_HEADERS.has(k.toLowerCase())) continue;
    try {
      headers.append(k, v ?? '');
    } catch {
      // 忽略非法头名
    }
  }

  const hasBody = method !== 'GET' && method !== 'HEAD' && input.body != null && input.body !== '';
  const init: RequestInit = { method, headers, redirect: 'follow' };
  if (hasBody) init.body = input.body as string;

  const timeoutMs = Math.min(Math.max(Number(input.timeout) || 25000, 1000), 60000);
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const resp = await fetch(parsed.toString(), { ...init, signal: controller.signal });
    clearTimeout(timer);

    const buf = new Uint8Array(await resp.arrayBuffer());
    const ct = resp.headers.get('content-type') || '';
    const isText = TEXT_CT_RE.test(ct) || (ct === '' && !buf.includes(0));
    let body: string;
    let bodyEncoding: 'utf-8' | 'base64';
    if (isText) {
      body = new TextDecoder('utf-8').decode(buf);
      bodyEncoding = 'utf-8';
    } else {
      body = toBase64(buf);
      bodyEncoding = 'base64';
    }

    const outHeaders: Record<string, string> = {};
    resp.headers.forEach((v, k) => {
      if (outHeaders[k] === undefined) outHeaders[k] = v;
      else outHeaders[k] += ', ' + v;
    });

    return json({
      status: resp.status,
      statusText: resp.statusText,
      headers: outHeaders,
      body,
      bodyEncoding,
      elapsedMs: Date.now() - start,
    });
  } catch (e: any) {
    return json({ error: `request failed: ${e?.message || String(e)}`, elapsedMs: Date.now() - start }, 502);
  }
}

// localhost 调试 / 跨域预检
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': '*',
      'access-control-allow-headers': '*',
    },
  });
}
