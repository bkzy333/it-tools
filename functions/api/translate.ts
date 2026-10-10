// Cloudflare Pages Functions：文本翻译（腾讯云 TMT TextTranslate）
//
//   POST /api/translate   body: { text, source, target }
//   返回腾讯云结构：{ Response: { TargetText, Source, Target, RequestId } } 或 { Response: { Error } }
//
// 密钥：Cloudflare Pages 项目 → 设置 → 环境变量
//       变量名 TENCENT_SECRET_ID / TENCENT_SECRET_KEY（填你腾讯云 CAM 的密钥）
// 没配时返回 503，前端回退提示，不会崩溃。

import { callTmt } from './_tmt';

interface Env {
  TENCENT_SECRET_ID?: string;
  TENCENT_SECRET_KEY?: string;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  let body: { text?: unknown; source?: unknown; target?: unknown };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return json({ Response: { Error: { Code: 'InvalidBody', Message: '请求体不是合法 JSON' } } }, 400);
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return json({ Response: { Error: { Code: 'EmptyText', Message: '待翻译文本为空' } } }, 400);
  }
  if (text.length > 2000) {
    return json({ Response: { Error: { Code: 'TooLong', Message: '文本过长，单次最多 2000 字符' } } }, 400);
  }

  try {
    const data = await callTmt(
      context.env,
      'TextTranslate',
      {
        SourceText: text,
        Source: typeof body.source === 'string' && body.source ? body.source : 'auto',
        Target: typeof body.target === 'string' && body.target ? body.target : 'en',
        ProjectId: 0,
      },
      'ap-guangzhou',
      25_000,
    );
    return json(data);
  } catch (e) {
    return json({ Response: { Error: { Code: 'ProxyError', Message: String((e as Error)?.message ?? e) } } }, 502);
  }
}
