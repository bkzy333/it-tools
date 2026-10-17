/**
 * bcrypt 密码哈希：生成与校验。
 *
 * bcrypt 不是"加密"——它是单向的、带盐的、故意慢的。所以这页只做两件事：
 *   1. 给一个密码生成 `$2b$10$...` 形式的哈希
 *   2. 拿一个密码去验证某个已有哈希是否匹配
 * 不做"解密"，也不该做——那等于宣称能还原密码。
 *
 * 三个必须让用户看见的坑：
 * - **只认前 72 个字节**：超出部分被静默丢弃。中文一个字占 3 字节，24 个汉字就到顶了，
 *   所以「密码超长被截断」这件事必须显式提示，否则用户以为 80 位密码更安全。
 * - **cost 决定耗时**：每 +1 耗时翻倍。cost 10 大约几十毫秒，cost 14 就到一秒级，
 *   在前端会明显卡顿，所以上限卡在 14 并给出耗时估算。
 * - **每次生成的哈希都不一样**：盐是随机的。校验只能靠 compare，不能拿哈希做等值比较。
 */
import bcrypt from 'bcryptjs';

export const COST_MIN = 4;
export const COST_MAX = 14;
export const COST_DEFAULT = 10;
/** bcrypt 只取密码前 72 个字节 */
export const MAX_PASSWORD_BYTES = 72;

/** 密码的 UTF-8 字节数（bcrypt 按字节截断，不是按字符） */
export function passwordByteLength(password: string): number {
  return new TextEncoder().encode(password).length;
}

/** 会不会被截断（超过 72 字节） */
export function willBeTruncated(password: string): boolean {
  return passwordByteLength(password) > MAX_PASSWORD_BYTES;
}

/** cost 夹到 4~14 并取整 */
export function normalizeCost(cost: number): number {
  if (!Number.isFinite(cost)) {
    return COST_DEFAULT;
  }

  return Math.min(COST_MAX, Math.max(COST_MIN, Math.round(cost)));
}

/**
 * 估算生成耗时（毫秒）。以 cost 10 ≈ 75ms 为基准，每 +1 翻倍。
 * 只用于给用户一个"这一步会明显变慢"的预警，不是精确测量。
 */
export function estimateDurationMs(cost: number): number {
  return Math.round(75 * 2 ** (normalizeCost(cost) - 10));
}

/** 生成哈希。密码为空或超长直接报错，不静默替用户决定 */
export function hashPassword(password: string, cost = COST_DEFAULT): string {
  if (password === '') {
    throw new Error('密码不能为空');
  }

  return bcrypt.hashSync(password, normalizeCost(cost));
}

/** 形如 $2a$/$2b$/$2y$ + cost + 22 位盐 + 31 位摘要 */
export function isBcryptHash(hash: string): boolean {
  return /^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash.trim());
}

/** 从哈希里读出 cost（读不出返回 null） */
export function getCost(hash: string): number | null {
  const match = hash.trim().match(/^\$2[aby]?\$(\d{2})\$/);

  return match ? Number(match[1]) : null;
}

/** 从哈希里读出版本前缀（$2a$ / $2b$ / $2y$） */
export function getVersion(hash: string): string | null {
  const match = hash.trim().match(/^(\$2[aby]?\$)/);

  return match ? match[1] : null;
}

/** 校验密码是否匹配哈希；哈希格式不对返回 false（不抛异常，避免页面炸掉） */
export function verifyPassword(password: string, hash: string): boolean {
  if (!isBcryptHash(hash)) {
    return false;
  }

  try {
    return bcrypt.compareSync(password, hash.trim());
  }
  catch {
    return false;
  }
}
