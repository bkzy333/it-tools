import { describe, expect, it } from 'vitest';

describe('image-translate service', () => {
  it('translateImage 在接口异常时返回 err 而不是抛错', async () => {
    // 用 fetch mock 模拟 500
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response('', { status: 500 })) as unknown as typeof fetch;
    const { translateImage } = await import('./image-translate.service');
    const r = await translateImage('AAAA', 'zh', 'en');
    expect(r.err).toBeTruthy();
    expect(r.records).toEqual([]);
    globalThis.fetch = original;
  });
});
