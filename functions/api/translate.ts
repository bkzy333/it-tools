// Cloudflare Pages Functions：文本翻译（腾讯云 TMT TextTranslate）+ 多层防护。
//
// 两种入参形态共用同一入口与同一条防护链：
//   { text: string }    → 单条翻译，返回扁平 { TargetText, Source, Target, RequestId }
//   { texts: string[] } → 批量翻译，返回 { results: [{ TargetText, err }] }（逐行对应、顺序一致）
//
// 单条链路（按顺序）：防套壳 → 单次上限 2000 字符 → 缓存命中(0 消耗) → 全局预算闸(80/90/95%)
//   → IP 软限流(采样兜底，仅预算偏紧时启用) → miss 才调腾讯云 + 写缓存(TTL30d) + 累加用量。
//   真正的硬限速交给 Cloudflare WAF Rate Limiting Rule（见 _translate-common.ts 顶部说明），零 KV 消耗。
//
// 批量链路：条数/字符数闸门 → 预算闸 → 逐条查缓存(命中即 0 消耗) → 未命中的按换行拼成
//   ≤2000 字符的批次调用腾讯云（一批一次调用）→ 按换行拆回逐条；若拆出的行数与输入条数
//   不一致（模型把多行合并/拆开了），该批自动降级为逐条调用 —— 宁可多几次调用，
//   也绝不接受「一行输入配错一行译文」（用户要把结果贴回 Excel B 列，错位就是灾难）。
//   逐条写缓存时用的是单条 key，所以批量翻过的句子之后用单条模式再翻同样命中。
//
// 密钥只走 Cloudflare 环境变量 TENCENT_SECRET_ID / TENCENT_SECRET_KEY，不下发浏览器。
// 缓存 / 限流 / 用量计数复用 TOOLS_USAGE KV（tx: 前缀）。未绑 KV 时这些层自动跳过。

import { callTmt } from './_tmt';
import {
  budgetState,
  corsResponse,
  isOriginAllowed,
  json,
  putTextCache,
  rateLimited,
  getTextCache,
  textCacheKey,
  addUsage,
  normalizeText,
  RATE_SAMPLE,
  type KvLike,
  type R2Like,
  type TranslateEnv,
} from './_translate-common';

// 腾讯云 TMT 硬限制：单次请求字符数不超过 2000（汉字 / 字母 / 标点各计 1 个字符）。
// 注意别把这里放开到 3000：超过了腾讯侧直接拒绝，白跑一次调用。
const MAX_TEXT_CHARS = 2000;
// 批量上限：一次最多 50 条（与「上传 PDF ≤50 页」口径一致，刚好覆盖 Excel 一列常用量）。
const BATCH_MAX_ITEMS = 50;
// 整批字符上限：护住免费额度，也避免一次请求把边缘函数拖太久。
const BATCH_MAX_CHARS = 20_000;
// 降级逐条调用时的并发上限。腾讯云 TMT 文本翻译默认接口频率限制是 5 次/秒，
// 取 3 留出安全余量，避免降级路径自己把自己限流。
const FALLBACK_CONCURRENCY = 3;

export async function onRequestOptions(): Promise<Response> {
  return corsResponse();
}

export async function onRequestPost(context: { request: Request; env: TranslateEnv }): Promise<Response> {
  if (!isOriginAllowed(context.request)) {
    return new Response('Forbidden', { status: 403 });
  }
  const kv = context.env?.TOOLS_USAGE;
  const r2 = context.env?.TRANSLATE_R2;

  let body: { text?: unknown; texts?: unknown; source?: unknown; target?: unknown };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return json({ err: '请求体不是合法 JSON' }, 400);
  }

  const source = typeof body.source === 'string' && body.source ? body.source : 'auto';
  const target = typeof body.target === 'string' && body.target ? body.target : 'en';

  if (Array.isArray(body.texts)) {
    return handleBatch(context, body.texts, source, target, kv, r2);
  }

  const text = typeof body.text === 'string' ? body.text : '';

  if (!text.trim()) {
    return json({ err: '请输入要翻译的文本' }, 400);
  }
  // 单次上限：超长 payload 直接拒，别让它走到腾讯计费。
  if (text.length > MAX_TEXT_CHARS) {
    return json({ err: `单次最多 ${MAX_TEXT_CHARS} 字符，请分批翻译` }, 413);
  }

  // ① 缓存命中：天然幂等，同一段文字永远同一结果。命中 = 0 字符消耗、不限速、不记账。
  const ck = await textCacheKey(text, source, target);
  const hit = await getTextCache(kv, r2, ck);
  if (hit) {
    try {
      return json({ ...JSON.parse(hit), hitCache: true });
    } catch {
      /* 缓存损坏则当作未命中，下面重算 */
    }
  }

  // ② 预算闸（读 KV，免费）：先读，决定后面要不要启用 KV 软限流。
  const bs = await budgetState(kv, 'txt');
  if (bs.level === 'stop') {
    return json({ err: '本月免费额度已用完，将于下月 1 日恢复' }, 503);
  }

  // ③ IP 软限流（次级兜底，平时完全不写 KV）：仅当预算偏紧(≥warn)时才以 RATE_SAMPLE 概率
  //    采样写，把 KV 写次数压到「请求数 / RATE_SAMPLE」；平时交给 Cloudflare WAF 硬限速。
  let rl = { limited: false, count: 0 };
  if (kv && (bs.level === 'warn' || bs.level === 'limit') && Math.random() < 1 / RATE_SAMPLE) {
    rl = await rateLimited(kv, context.request, 'txt', bs.level === 'limit' ? 50 : undefined);
  }
  if (rl.limited) {
    return json({ err: '请求过于频繁，请稍后再试', challenge: true }, 429);
  }
  if (bs.level === 'limit' && rl.count > 50) {
    return json({ err: '当前用量偏高，已临时限速，请稍后再试' }, 429);
  }

  try {
    const resp = await translateOne(context.env, text, source, target);
    if (resp.Error) {
      return json({ err: `${resp.Error.Code} ${resp.Error.Message}` }, 502);
    }
    await putTextCache(kv, r2, ck, JSON.stringify(resp));
    await addUsage(kv, context.env, 'txt', normalizeText(text).length);
    return json({ ...resp, hitCache: false });
  } catch (e) {
    return json({ err: '代理异常：' + String((e as Error)?.message ?? e) }, 502);
  }
}

interface TmtTextResponse {
  TargetText?: string;
  Source?: string;
  Target?: string;
  RequestId?: string;
  Error?: { Code: string; Message: string };
}

/** 单条调用腾讯云并解包 Response（批量降级路径也复用）。 */
async function translateOne(
  env: TranslateEnv,
  text: string,
  source: string,
  target: string,
): Promise<TmtTextResponse> {
  const data = await callTmt(env, 'TextTranslate', {
    Source: source,
    Target: target,
    ProjectId: 0,
    SourceText: text,
  });
  return (data.Response ?? {}) as TmtTextResponse;
}

interface BatchItem {
  TargetText: string;
  err: string;
  hitCache: boolean;
}

/**
 * 批量翻译：逐行对应，顺序与入参一致。
 * 整体失败（条数/字符数超限、预算耗尽）走顶层 err；单条失败只把那条标 err，不拖垮整批。
 */
async function handleBatch(
  context: { request: Request; env: TranslateEnv },
  rawTexts: unknown[],
  source: string,
  target: string,
  kv: KvLike | undefined,
  r2: R2Like | undefined,
): Promise<Response> {
  // 剔除非字符串与空白条目：前端已过滤，这里再兜一层（调接口的人不止前端）
  const items = rawTexts
    .filter((x): x is string => typeof x === 'string')
    .map((x) => normalizeText(x))
    .filter((x) => x.length > 0);

  if (items.length === 0) {
    return json({ err: '请输入要翻译的文本' }, 400);
  }
  if (items.length > BATCH_MAX_ITEMS) {
    return json({ err: `批量翻译一次最多 ${BATCH_MAX_ITEMS} 条，当前 ${items.length} 条，请分批处理` }, 413);
  }
  const overIdx = items.findIndex((x) => x.length > MAX_TEXT_CHARS);
  if (overIdx !== -1) {
    return json({ err: `第 ${overIdx + 1} 条超过 ${MAX_TEXT_CHARS} 字符（腾讯云单次上限），请拆分后再翻译` }, 413);
  }
  const totalChars = items.reduce((sum, x) => sum + x.length, 0);
  if (totalChars > BATCH_MAX_CHARS) {
    return json({ err: `本次共 ${totalChars} 字符，超过单批 ${BATCH_MAX_CHARS} 字符上限，请分批处理` }, 413);
  }

  // 预算闸 / IP 软限流与单条同口径：批量一次可能吃掉很多字符，闸门必须前置。
  const bs = await budgetState(kv, 'txt');
  if (bs.level === 'stop') {
    return json({ err: '本月免费额度已用完，将于下月 1 日恢复' }, 503);
  }
  if (kv && (bs.level === 'warn' || bs.level === 'limit') && Math.random() < 1 / RATE_SAMPLE) {
    const rl = await rateLimited(kv, context.request, 'txt', bs.level === 'limit' ? 50 : undefined);
    if (rl.limited) {
      return json({ err: '请求过于频繁，请稍后再试', challenge: true }, 429);
    }
  }

  // 逐条查缓存。KV 读不心疼（10 万次/天），命中一条就省一条字符并少一次腾讯调用。
  const keys = await Promise.all(items.map((x) => textCacheKey(x, source, target)));
  const cached = await Promise.all(keys.map((k) => getTextCache(kv, r2, k)));
  const results: BatchItem[] = items.map((_x, i) => {
    const raw = cached[i];
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as TmtTextResponse;
        if (parsed?.TargetText) {
          return { TargetText: parsed.TargetText, err: '', hitCache: true };
        }
      } catch {
        /* 缓存损坏则当作未命中 */
      }
    }
    return { TargetText: '', err: '', hitCache: false };
  });

  const missIdx = results.map((r, i) => (r.hitCache ? -1 : i)).filter((i) => i >= 0);
  let usedChars = 0;

  if (missIdx.length > 0) {
    // 按换行把未命中的条目拼成 ≤MAX_TEXT_CHARS 的批次（含换行本身的长度）。
    const batches: number[][] = [];
    let cur: number[] = [];
    let curLen = 0;
    for (const i of missIdx) {
      const len = items[i].length + 1;
      if (cur.length > 0 && curLen + len > MAX_TEXT_CHARS) {
        batches.push(cur);
        cur = [];
        curLen = 0;
      }
      cur.push(i);
      curLen += len;
    }
    if (cur.length > 0) {
      batches.push(cur);
    }

    for (const batch of batches) {
      const joined = batch.map((i) => items[i]).join('\n');
      let lines: string[] | null = null;
      let batchErr = '';
      let requestId: string | undefined;
      try {
        const resp = await translateOne(context.env, joined, source, target);
        if (resp.Error) {
          batchErr = `${resp.Error.Code} ${resp.Error.Message}`;
        } else {
          requestId = resp.RequestId;
          const parts = String(resp.TargetText ?? '').split('\n');
          // 行数必须与输入条数严格相等，且不能出现空行 —— 否则视为「模型把行合并/拆开了」，走降级。
          if (parts.length === batch.length && parts.every((p) => p.trim() !== '')) {
            lines = parts;
          }
        }
      } catch (e) {
        batchErr = '代理异常：' + String((e as Error)?.message ?? e);
      }

      if (lines) {
        batch.forEach((i, j) => {
          results[i] = { TargetText: lines![j].trim(), err: '', hitCache: false };
          usedChars += items[i].length;
        });
        // 缓存按「单条 key」写：批量翻过的句子，之后单条模式再翻同样命中。
        await Promise.all(
          batch.map((i) =>
            putTextCache(
              kv,
              r2,
              keys[i],
              JSON.stringify({ TargetText: results[i].TargetText, Source: source, Target: target, RequestId: requestId }),
            ),
          ),
        );
        continue;
      }

      // 降级：逐条调用。行数对不上时绝不猜 —— 一条一条来，顺序天然正确。
      await runPool(batch, FALLBACK_CONCURRENCY, async (i) => {
        try {
          const resp = await translateOne(context.env, items[i], source, target);
          if (resp.Error) {
            results[i] = { TargetText: '', err: `${resp.Error.Code} ${resp.Error.Message}`, hitCache: false };
            return;
          }
          const out = String(resp.TargetText ?? '').trim();
          if (!out) {
            results[i] = { TargetText: '', err: '翻译结果为空', hitCache: false };
            return;
          }
          results[i] = { TargetText: out, err: '', hitCache: false };
          usedChars += items[i].length;
          await putTextCache(
            kv,
            r2,
            keys[i],
            JSON.stringify({ TargetText: out, Source: source, Target: target, RequestId: resp.RequestId }),
          );
        } catch (e) {
          results[i] = { TargetText: '', err: batchErr || '代理异常：' + String((e as Error)?.message ?? e), hitCache: false };
        }
      });
    }
  }

  // 只按「真正调用了腾讯云」的字符数记账（缓存命中不计）。
  if (usedChars > 0) {
    await addUsage(kv, context.env, 'txt', usedChars);
  }

  return json({ results, hitCache: results.every((r) => r.hitCache) });
}

/** 受限并发执行（降级路径用）：腾讯侧有 5 次/秒的频率限制，并发不能开太大。 */
async function runPool<T>(list: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const workerCount = Math.min(Math.max(size, 1), list.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < list.length) {
        const item = list[cursor];
        cursor += 1;
        await fn(item);
      }
    }),
  );
}
