// Cloudflare Pages Functions：PDF 页面 OCR（腾讯云 通用印刷体 GeneralBasicOCR）。
//
// 前端把「需要 OCR 的 PDF 页」用 pdfjs 渲染成高清图片（JPEG）后，只把图片 base64 传过来，
// 因此：① 按勾选页数计费（绝不多算整份 PDF）；② 不受 10MB PDF 限制；③ 百页大文件也能用。
//
// 防护链路（同翻译）：防套壳 → 图片体积上限(8MB) → 缓存命中(0 消耗) → 月度预算闸(80/90/95%)
//   → IP 软限流(采样兜底) → miss 才调腾讯云 + 写缓存(TTL30d) + 累加用量。
// 密钥走 Cloudflare 环境变量 TENCENT_SECRET_ID / TENCENT_SECRET_KEY（与翻译同一套）；
// 月度额度上限走 OCR_MONTHLY_QUOTA（默认 10000）。硬限速建议再加一条 Cloudflare WAF
// 速率限制规则匹配 /api/pdf-ocr。KV 绑定 TOOLS_USAGE（与翻译同一命名空间，txocr: 前缀隔离）。

import { callTencent } from './_tmt';
import {
  type OcrEnv,
  type OcrBudget,
  isOriginAllowed,
  corsResponse,
  json,
  base64DecodedSize,
  OCR_MAX_BYTES,
  ocrImageCacheKey,
  getOcrCache,
  putOcrCache,
  ocrRateLimited,
  ocrBudgetState,
  addOcrUsage,
  parseGeneralBasic,
} from './_ocr';

const OCR_HOST = 'ocr.tencentcloudapi.com';
const OCR_SERVICE = 'ocr';
const OCR_VERSION = '2018-11-19';

function monthlyQuota(env: OcrEnv): number {
  const n = Number(env.OCR_MONTHLY_QUOTA);
  return Number.isFinite(n) && n > 0 ? n : 10_000;
}

export async function onRequestOptions(): Promise<Response> {
  return corsResponse();
}

export async function onRequestPost(context: { request: Request; env: OcrEnv }): Promise<Response> {
  if (!isOriginAllowed(context.request)) {
    return new Response('Forbidden', { status: 403 });
  }
  const kv = context.env?.TOOLS_USAGE;

  let body: { imageBase64?: unknown };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return json({ err: '请求体不是合法 JSON' }, 400);
  }

  const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : '';
  if (!imageBase64) {
    return json({ err: '缺少 imageBase64' }, 400);
  }

  // 单次图片体积护栏（base64 解码后真实字节数）
  if (base64DecodedSize(imageBase64) > OCR_MAX_BYTES) {
    return json({ err: '图片过大，请降低渲染分辨率' }, 413);
  }

  // ① 缓存命中：同一页图片天然幂等，命中 = 0 消耗、不限速、不记账
  const cacheKey = await ocrImageCacheKey(imageBase64);
  const hit = await getOcrCache(kv, cacheKey);
  if (hit !== null) {
    return json({ text: hit, hitCache: true });
  }

  // ② 月度预算闸
  const quota = monthlyQuota(context.env);
  const bs: OcrBudget = await ocrBudgetState(kv, quota);
  if (bs.level === 'stop') {
    return json({ err: '本月 OCR 免费额度已用完，将于下月 1 日恢复' }, 503);
  }

  // ③ IP 软限流（采样兜底，仅预算偏紧时启用，平时交给 WAF 硬限速）
  let rl = { limited: false, count: 0 };
  if (kv && (bs.level === 'warn' || bs.level === 'limit') && Math.random() < 1 / 20) {
    rl = await ocrRateLimited(kv, context.request);
  }
  if (rl.limited) {
    return json({ err: '请求过于频繁，请稍后再试' }, 429);
  }

  try {
    const data = await callTencent(context.env, {
      host: OCR_HOST,
      service: OCR_SERVICE,
      version: OCR_VERSION,
      action: 'GeneralBasicOCR',
      payloadObj: { ImageBase64: imageBase64 },
    });
    const { text, error } = parseGeneralBasic(data);
    if (error) {
      // 腾讯云返回的具体错误（如 UnsupportedOperation 未开通服务、FailedOperation 等）原样透出
      return json({ err: `${error.code} ${error.message}` }, 502);
    }
    await putOcrCache(kv, cacheKey, text);
    await addOcrUsage(kv, context.env, 1, quota);
    return json({ text, hitCache: false });
  } catch (e) {
    return json({ err: '代理异常：' + String((e as Error)?.message ?? e) }, 502);
  }
}
