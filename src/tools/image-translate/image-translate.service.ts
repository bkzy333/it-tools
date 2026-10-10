// 图片翻译的前端调用层：把图片 base64 发给服务端 /api/image-translate，
// 拿回逐行坐标 + 译文（ImageRecord），再由 .vue 用 canvas 绘制回原图。
// 腾讯云图片翻译仅支持「中文 ↔ 英文」互译，语种校验放在服务端。

export interface ImageTranslateRecord {
  X?: number;
  Y?: number;
  W?: number;
  H?: number;
  SourceText?: string;
  TargetText?: string;
}

export interface ImageTranslateResult {
  records: ImageTranslateRecord[];
  source?: string;
  target?: string;
  err?: string;
}

export async function translateImage(imageBase64: string, source: string, target: string): Promise<ImageTranslateResult> {
  const res = await fetch('/api/image-translate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image: imageBase64, source, target }),
  });
  if (!res.ok) {
    return { records: [], err: `HTTP ${res.status}` };
  }
  return (await res.json()) as ImageTranslateResult;
}
