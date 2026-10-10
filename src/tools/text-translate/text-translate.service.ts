// 文本翻译的语言表与「源 → 目标」合法配对，依据腾讯云 TMT 官方文档。
// 注意：腾讯云当前日语代码是 ja、韩语是 ko（老文档的 jp/kr 已废弃，用了会报不支持的语言）。

export const LANG_LABELS: Record<string, string> = {
  'zh': '中文',
  'zh-TW': '繁体中文',
  'en': '英文',
  'ja': '日语',
  'ko': '韩语',
  'fr': '法语',
  'es': '西班牙语',
  'it': '意大利语',
  'de': '德语',
  'tr': '土耳其语',
  'ru': '俄语',
  'pt': '葡萄牙语',
  'vi': '越南语',
  'id': '印尼语',
  'th': '泰语',
  'ms': '马来语',
  'ar': '阿拉伯语',
  'hi': '印地语',
  'auto': '自动检测',
};

// 腾讯云 TMT 合法翻译对：不在表内的组合会被接口拒绝（例如 ja 只能到 zh/zh-TW/en/ko）。
export const TARGETS_FOR: Record<string, string[]> = {
  'zh': ['en', 'ja', 'ko', 'fr', 'es', 'it', 'de', 'tr', 'ru', 'pt', 'vi', 'id', 'th', 'ms'],
  'zh-TW': ['en', 'ja', 'ko', 'fr', 'es', 'it', 'de', 'tr', 'ru', 'pt', 'vi', 'id', 'th', 'ms'],
  'en': ['zh', 'zh-TW', 'ja', 'ko', 'fr', 'es', 'it', 'de', 'tr', 'ru', 'pt', 'vi', 'id', 'th', 'ms', 'ar', 'hi'],
  'ja': ['zh', 'zh-TW', 'en', 'ko'],
  'ko': ['zh', 'zh-TW', 'en', 'ja'],
  'fr': ['zh', 'zh-TW', 'en', 'es', 'it', 'de', 'tr', 'ru', 'pt'],
  'es': ['zh', 'zh-TW', 'en', 'fr', 'it', 'de', 'tr', 'ru', 'pt'],
  'it': ['zh', 'zh-TW', 'en', 'fr', 'es', 'de', 'tr', 'ru', 'pt'],
  'de': ['zh', 'zh-TW', 'en', 'fr', 'es', 'it', 'tr', 'ru', 'pt'],
  'tr': ['zh', 'zh-TW', 'en', 'fr', 'es', 'it', 'de', 'ru', 'pt'],
  'ru': ['zh', 'zh-TW', 'en', 'fr', 'es', 'it', 'de', 'tr', 'pt'],
  'pt': ['zh', 'zh-TW', 'en', 'fr', 'es', 'it', 'de', 'tr', 'ru'],
  'vi': ['zh', 'zh-TW', 'en'],
  'id': ['zh', 'zh-TW', 'en'],
  'th': ['zh', 'zh-TW', 'en'],
  'ms': ['zh', 'zh-TW', 'en'],
  'ar': ['en'],
  'hi': ['en'],
  'auto': ['zh', 'zh-TW', 'en', 'ja', 'ko', 'fr', 'es', 'it', 'de', 'tr', 'ru', 'pt', 'vi', 'id', 'th', 'ms', 'ar', 'hi'],
};

export interface TextTranslateResponse {
  Response?: {
    TargetText?: string;
    Source?: string;
    Target?: string;
    RequestId?: string;
    Error?: { Code: string; Message: string };
  };
}

export async function translateText(text: string, source: string, target: string): Promise<TextTranslateResponse> {
  const res = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, source, target }),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as TextTranslateResponse;
}
