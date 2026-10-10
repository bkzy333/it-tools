// 腾讯云 API v3 签名（TC3-HMAC-SHA256）—— 仅被本目录下的翻译 Function 复用，不下发浏览器。
//
// 密钥来自 Cloudflare 环境变量 TENCENT_SECRET_ID / TENCENT_SECRET_KEY，绝不出现在前端包里。
// 配置位置：Cloudflare Pages 项目 → 设置 → 环境变量（Production / Preview 都要设）。
//
// 注意：腾讯云 TMT 当前日语代码是 ja、韩语是 ko（老文档的 jp/kr 已废弃，用了会报不支持的语言）。

interface TmtEnv {
  TENCENT_SECRET_ID?: string;
  TENCENT_SECRET_KEY?: string;
}

const HOST = 'tmt.tencentcloudapi.com';
const SERVICE = 'tmt';
const VERSION = '2018-03-21';

async function sha256Hex(msg: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmac(keyBytes: Uint8Array<ArrayBuffer>, msg: string): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return new Uint8Array(sig);
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/**
 * 调用腾讯云 TMT 任意 Action（文本翻译 TextTranslate / 图片翻译 ImageTranslate 等）。
 * 返回腾讯云原始 JSON，形如 { Response: { ... } } 或 { Response: { Error: { Code, Message } } }。
 */
export async function callTmt(
  env: TmtEnv,
  action: string,
  payloadObj: Record<string, unknown>,
  region = 'ap-guangzhou',
  timeoutMs = 25_000,
): Promise<{ Response?: { Error?: { Code: string; Message: string } } & Record<string, unknown> }> {
  // trim 兜底：在 Cloudflare 后台粘贴密钥时极易带入首尾空格或换行，
  // 那会让派生密钥整体错位、返回值同样是 AuthFailure.SignatureFailure。
  const secretId = env.TENCENT_SECRET_ID?.trim();
  const secretKey = env.TENCENT_SECRET_KEY?.trim();
  if (!secretId || !secretKey) {
    throw new Error('TENCENT_SECRET_ID / TENCENT_SECRET_KEY 未配置');
  }

  const payload = JSON.stringify(payloadObj);
  const t = Math.floor(Date.now() / 1000);
  const date = new Date(t * 1000).toISOString().slice(0, 10);
  const hashedPayload = await sha256Hex(payload);
  // ⚠️ 结尾的 \n 绝对不能省。腾讯云 TC3 的 CanonicalHeaders 本身必须以换行符收尾，
  //    再叠加拼接公式里的 '\n'，规范请求串在 `host:...` 之后会出现一个空行。
  //    少了它 → 规范请求串哈希不同 → 必然 AuthFailure.SignatureFailure。
  //    官方 SDK（tencentcloud-sdk-nodejs/common/sign.js 的 sign3）就是 headers += `host:...\n`。
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${HOST}\n`;
  const signedHeaders = 'content-type;host';
  const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, hashedPayload].join('\n');
  const scope = `${date}/${SERVICE}/tc3_request`;
  const stringToSign = ['TC3-HMAC-SHA256', t, scope, await sha256Hex(canonicalRequest)].join('\n');
  const kDate = await hmac(new TextEncoder().encode('TC3' + secretKey), date);
  const kService = await hmac(kDate, SERVICE);
  const kSigning = await hmac(kService, 'tc3_request');
  const signature = hex(await hmac(kSigning, stringToSign));
  const authorization = `TC3-HMAC-SHA256 Credential=${secretId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(`https://${HOST}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Host: HOST,
      'X-TC-Action': action,
      'X-TC-Version': VERSION,
      'X-TC-Region': region,
      'X-TC-Timestamp': String(t),
      Authorization: authorization,
    },
    body: payload,
    signal: AbortSignal.timeout(timeoutMs),
  });

  return res.json();
}
