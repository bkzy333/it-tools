/**
 * 教程索引：slug → 标题。
 *
 * 单独列一份而不是运行时去解析 12 个 md，是因为首页要显示教程链接，如果把 100KB 的
 * md 原文全塞进首屏包太浪费，按需加载又要发 12 个请求。
 * 这份索引由 build/seo-prerender.ts 在每次构建时核对（标题对不上会直接构建失败），
 * 所以新增或改标题不用手动同步，跑一次 build 就会报错提醒。
 */

export interface GuideIndexEntry {
  slug: string;
  title: string;
}

export const GUIDE_INDEX: GuideIndexEntry[] = [
  { slug: 'base64-is-not-encryption', title: 'Base64 不是加密：什么时候该用，什么时候不该用' },
  { slug: 'cron-expression-guide', title: 'cron 表达式怎么写（含常见写法速查）' },
  { slug: 'hash-algorithm-choice', title: 'MD5、SHA-1、SHA-256、SHA-512 到底该选哪个' },
  { slug: 'http-status-codes-guide', title: 'HTTP 状态码：真正需要记住的那些' },
  { slug: 'password-security-guide', title: '怎么生成和保存一个真正安全的密码' },
  { slug: 'regex-for-developers', title: '开发者最常用的正则表达式写法' },
  { slug: 'sql-formatting-conventions', title: 'SQL 怎么写才好看：格式化与命名约定' },
  { slug: 'unix-timestamp-guide', title: 'Unix 时间戳完全指南：秒、毫秒、时区和各语言对照' },
  { slug: 'uuid-v4-vs-v7', title: 'UUID v4 和 v7 该选哪个做数据库主键' },
  { slug: 'wcag-color-contrast', title: 'WCAG 对比度怎么算、怎么改到达标' },
  { slug: 'what-is-jwt', title: 'JWT 是什么？三分钟看懂并学会本地调试 Token' },
  { slug: 'yaml-json-toml-compare', title: 'YAML、JSON、TOML 配置文件怎么选' },
];
