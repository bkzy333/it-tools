// 临时验证脚本（跑完即删，勿提交）：/api/translate 批量链路的正确性验证。
// 手法：注入假 KV/R2 + 拦截 globalThis.fetch（拦腾讯云），直接调用真 onRequestPost。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost } from './functions/api/translate';

interface TmtPayload {
  SourceText: string;
  Source: string;
  Target: string;
}

function makeKV() {
  const map = new Map<string, string>();
  return {
    map,
    get: async (k: string) => map.get(k) ?? null,
    put: async (k: string, v: string) => {
      map.set(k, v);
    },
  };
}

function makeR2() {
  const map = new Map<string, string>();
  return {
    map,
    get: async (k: string) => {
      const v = map.get(k);
      return v === undefined ? null : { text: async () => v };
    },
    put: async (k: string, v: string) => {
      map.set(k, v);
    },
  };
}

const zh = (s: string) => `中:${s}`;

let calls: string[] = [];
// 'ok'   → 逐行翻译并保持行结构（可被合并成 1 次调用）
// 'merge'→ 多行输入时故意合并成 1 行（模拟模型把行合并），触发后端逐条降级
let mode: 'ok' | 'merge' = 'ok';

function stubFetch() {
  vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
    const payload = JSON.parse(init.body) as TmtPayload;
    calls.push(payload.SourceText);
    const lines = payload.SourceText.split('\n');
    const target = mode === 'merge' && lines.length > 1 ? zh(lines.join(' ')) : lines.map(zh).join('\n');
    return {
      json: async () => ({
        Response: { TargetText: target, Source: payload.Source, Target: payload.Target, RequestId: 'req-1' },
      }),
    };
  });
}

function ctx(body: unknown, env: Record<string, unknown>) {
  return {
    request: new Request('https://gjxtools.com/api/translate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://gjxtools.com' },
      body: JSON.stringify(body),
    }),
    env,
  } as never;
}

function makeEnv() {
  return {
    TENCENT_SECRET_ID: 'AKIDtest',
    TENCENT_SECRET_KEY: 'SECRETtest',
    TOOLS_USAGE: makeKV(),
    TRANSLATE_R2: makeR2(),
  };
}

beforeEach(() => {
  calls = [];
  mode = 'ok';
  stubFetch();
});

describe('批量翻译 /api/translate', () => {
  it('多条未命中时合并成一次腾讯调用，结果逐行对应', async () => {
    const env = makeEnv();
    const res = await onRequestPost(ctx({ texts: ['apple', 'banana', 'cherry'], source: 'en', target: 'zh' }, env));
    const data = (await res.json()) as { results: { TargetText: string }[] };

    expect(res.status).toBe(200);
    expect(data.results.map((r) => r.TargetText)).toEqual(['中:apple', '中:banana', '中:cherry']);
    expect(calls).toEqual(['apple\nbanana\ncherry']); // 一次 HTTP 请求 = 一次腾讯调用
  });

  it('结果行数与输入条数不符时自动降级为逐条调用，顺序仍严格对应', async () => {
    mode = 'merge';
    const env = makeEnv();
    const res = await onRequestPost(ctx({ texts: ['apple', 'banana', 'cherry'], source: 'en', target: 'zh' }, env));
    const data = (await res.json()) as { results: { TargetText: string }[] };

    expect(data.results.map((r) => r.TargetText)).toEqual(['中:apple', '中:banana', '中:cherry']);
    expect(calls).toEqual(['apple\nbanana\ncherry', 'apple', 'banana', 'cherry']);
  });

  it('第二次相同请求全部走缓存，不再调用腾讯云', async () => {
    const env = makeEnv();
    const first = await onRequestPost(ctx({ texts: ['apple', 'banana'], source: 'en', target: 'zh' }, env));
    expect(((await first.json()) as { hitCache: boolean }).hitCache).toBe(false);
    expect(calls).toHaveLength(1);

    calls = [];
    const second = await onRequestPost(ctx({ texts: ['apple', 'banana'], source: 'en', target: 'zh' }, env));
    const data = (await second.json()) as { results: { TargetText: string; hitCache: boolean }[]; hitCache: boolean };
    expect(data.hitCache).toBe(true);
    expect(data.results.map((r) => r.TargetText)).toEqual(['中:apple', '中:banana']);
    expect(calls).toHaveLength(0);
  });

  it('批量与单条共享缓存：批量翻过的句子单条再翻也命中', async () => {
    const env = makeEnv();
    await onRequestPost(ctx({ texts: ['apple', 'banana'], source: 'en', target: 'zh' }, env));
    calls = [];

    const res = await onRequestPost(ctx({ text: 'banana', source: 'en', target: 'zh' }, env));
    const data = (await res.json()) as { TargetText: string; hitCache: boolean };
    expect(data.TargetText).toBe('中:banana');
    expect(data.hitCache).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('超过 50 条整批拒绝', async () => {
    const env = makeEnv();
    const texts = Array.from({ length: 51 }, (_v, i) => `w${i}`);
    const res = await onRequestPost(ctx({ texts, source: 'en', target: 'zh' }, env));
    expect(res.status).toBe(413);
    expect(calls).toHaveLength(0);
  });

  it('单条超过 2000 字符整批拒绝，并指出是第几条', async () => {
    const env = makeEnv();
    const res = await onRequestPost(
      ctx({ texts: ['ok', 'x'.repeat(2001)], source: 'en', target: 'zh' }, env),
    );
    const data = (await res.json()) as { err: string };
    expect(res.status).toBe(413);
    expect(data.err).toContain('第 2 条');
    expect(calls).toHaveLength(0);
  });

  it('超长条目自动切成多批，每批都在 2000 字符内且仍逐行对应', async () => {
    const env = makeEnv();
    const long = 'l'.repeat(1200);
    const res = await onRequestPost(ctx({ texts: [long, long, long], source: 'en', target: 'zh' }, env));
    const data = (await res.json()) as { results: { TargetText: string }[] };

    expect(data.results).toHaveLength(3);
    expect(calls.length).toBeGreaterThan(1);
    expect(calls.every((c) => c.length <= 2000)).toBe(true);
    expect(data.results.map((r) => r.TargetText)).toEqual([`中:${long}`, `中:${long}`, `中:${long}`]);
  });

  it('空数组 / 全空白条目按「请输入要翻译的文本」拒绝', async () => {
    const env = makeEnv();
    expect((await onRequestPost(ctx({ texts: [], source: 'en', target: 'zh' }, env))).status).toBe(400);
    expect((await onRequestPost(ctx({ texts: ['  ', '\n'], source: 'en', target: 'zh' }, env))).status).toBe(400);
  });

  it('非本站 Origin 被拒（防套壳）', async () => {
    const env = makeEnv();
    const request = new Request('https://gjxtools.com/api/translate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      body: JSON.stringify({ texts: ['apple'] }),
    });
    const res = await onRequestPost({ request, env } as never);
    expect(res.status).toBe(403);
  });
});
