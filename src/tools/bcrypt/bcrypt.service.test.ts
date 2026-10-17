import { describe, expect, it } from 'vitest';
import {
  COST_DEFAULT,
  COST_MAX,
  COST_MIN,
  MAX_PASSWORD_BYTES,
  estimateDurationMs,
  getCost,
  getVersion,
  hashPassword,
  isBcryptHash,
  normalizeCost,
  passwordByteLength,
  verifyPassword,
  willBeTruncated,
} from './bcrypt.service';

describe('hashPassword / verifyPassword', () => {
  it('生成的哈希能被同一密码校验通过', () => {
    const hash = hashPassword('correct horse battery staple', 4);

    expect(isBcryptHash(hash)).toBe(true);
    expect(verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(verifyPassword('wrong password', hash)).toBe(false);
  });

  it('同一个密码两次生成的哈希不同（随机盐），但都能校验通过', () => {
    const a = hashPassword('同一个密码', 4);
    const b = hashPassword('同一个密码', 4);

    expect(a).not.toBe(b);
    expect(verifyPassword('同一个密码', a)).toBe(true);
    expect(verifyPassword('同一个密码', b)).toBe(true);
  });

  it('空密码直接报错，不生成空哈希', () => {
    expect(() => hashPassword('', 4)).toThrow(/不能为空/);
  });

  it('哈希里能读出 cost 与版本', () => {
    const hash = hashPassword('abc', 5);

    expect(getCost(hash)).toBe(5);
    expect(getVersion(hash)).toMatch(/^\$2[aby]?\$$/);
  });

  it('格式不对的哈希：isBcryptHash=false，verify 返回 false 而不是抛错', () => {
    expect(isBcryptHash('not-a-hash')).toBe(false);
    expect(isBcryptHash('$2b$10$short')).toBe(false);
    expect(verifyPassword('abc', 'not-a-hash')).toBe(false);
  });

  it('被篡改过的哈希校验失败', () => {
    const hash = hashPassword('secret', 4);
    // 改掉最后一个字符
    const tampered = `${hash.slice(0, -1)}${hash.endsWith('a') ? 'b' : 'a'}`;

    expect(verifyPassword('secret', tampered)).toBe(false);
  });
});

describe('72 字节截断（bcrypt 最容易被忽略的坑）', () => {
  it('ASCII 72 字节不截断，73 字节截断', () => {
    expect(willBeTruncated('a'.repeat(MAX_PASSWORD_BYTES))).toBe(false);
    expect(willBeTruncated('a'.repeat(MAX_PASSWORD_BYTES + 1))).toBe(true);
  });

  it('中文按字节算：24 个汉字刚好 72 字节，25 个就超', () => {
    expect(passwordByteLength('中'.repeat(24))).toBe(72);
    expect(willBeTruncated('中'.repeat(24))).toBe(false);
    expect(willBeTruncated('中'.repeat(25))).toBe(true);
  });

  it('超长密码的第 73 字节之后被丢弃 —— 两个不同密码会互相通过', () => {
    const base = 'a'.repeat(MAX_PASSWORD_BYTES);
    const hash = hashPassword(base, 4);

    // 这就是必须提示用户的原因：base 与 base+'xxx' 会被当成同一个密码
    expect(verifyPassword(`${base}xxx`, hash)).toBe(true);
  });
});

describe('cost', () => {
  it('夹到 4~14 并取整', () => {
    expect(normalizeCost(1)).toBe(COST_MIN);
    expect(normalizeCost(99)).toBe(COST_MAX);
    expect(normalizeCost(9.6)).toBe(10);
    expect(normalizeCost(Number.NaN)).toBe(COST_DEFAULT);
  });

  it('超出范围的 cost 落在合法区间内，且生成的哈希仍可校验', () => {
    const hash = hashPassword('abc', 99);

    expect(getCost(hash)).toBe(COST_MAX);
    expect(verifyPassword('abc', hash)).toBe(true);
  });

  it('耗时估算随 cost 翻倍', () => {
    expect(estimateDurationMs(10)).toBe(75);
    expect(estimateDurationMs(11)).toBe(150);
    expect(estimateDurationMs(13)).toBe(600);
  });
});
