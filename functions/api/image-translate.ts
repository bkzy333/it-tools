// Cloudflare Pages Functions：图片翻译（腾讯云 TMT ImageTranslate）
//
//   POST /api/image-translate   body: { image(base64), source, target }
//   返回：{ records: [{ X,Y,W,H,SourceText,TargetText }], source, target } 或 { err }
//
// 腾讯云「图片翻译」仅支持「中文 ↔ 英文」互译，本 Function 会先校验，非法组合直接拒绝。
// 密钥同样来自 Cloudflare 环境变量 TENCENT_SECRET_ID / TENCENT_SECRET_KEY，不下发浏览器。

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
  let body: { image?: unknown; source?: unknown; target?: unknown };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return json({ err: '请求体不是合法 JSON' }, 400);
  }

  const image = typeof body.image === 'string' ? body.image : '';
  if (!image) {
    return json({ err: '图片数据为空' }, 400);
  }

  const source = typeof body.source === 'string' && body.source ? body.source : 'zh';
  const target = typeof body.target === 'string' && body.target ? body.target : 'en';
  if (!((source === 'zh' && target === 'en') || (source === 'en' && target === 'zh'))) {
    return json({ err: '图片翻译仅支持「中文 ↔ 英文」互译' }, 400);
  }

  try {
    const data = await callTmt(
      context.env,
      'ImageTranslate',
      {
        SessionUuid: crypto.randomUUID(),
        Scene: 'doc',
        Data: image,
        Source: source,
        Target: target,
        ProjectId: 0,
      },
      'ap-guangzhou',
      30_000,
    );
    const resp = (data.Response ?? {}) as { Error?: { Code: string; Message: string }; ImageRecord?: { Value?: unknown[] }; Source?: string; Target?: string };
    if (resp.Error) {
      return json({ err: `${resp.Error.Code} ${resp.Error.Message}` }, 502);
    }
    const records = Array.isArray(resp.ImageRecord?.Value) ? resp.ImageRecord!.Value : [];
    return json({ records, source: resp.Source, target: resp.Target, err: '' });
  } catch (e) {
    return json({ err: '代理异常：' + String((e as Error)?.message ?? e) }, 502);
  }
}
