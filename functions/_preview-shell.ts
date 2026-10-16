/**
 * HTML 预览壳页 —— html-editor 工具用来渲染用户 HTML 的空白容器。
 *
 * ## 为什么必须单独开一个路由
 *
 * `srcdoc` / `blob:` 预览会**继承父页的 CSP**（真浏览器实测：父页 script-src 只放行
 * 'self' 时，预览里的外链 CDN 脚本直接 `Refused to load`，外链样式同理；`blob:`
 * 更是连 frame-src 都过不去）。而本站 CSP 的 script-src / style-src / font-src 都只放行
 * 'self'，那是刻意的（见 public/_headers 里关于 Google Fonts 的注释）。
 *
 * 解法不在放宽站点 CSP，而在于：Cloudflare 官方文档明确写着
 * 「_headers 里定义的自定义头**不**作用于 Pages Function 生成的响应」。
 * 所以这个由 Function 提供的路由能带一份独立的宽松 CSP —— 预览里外链资源可用，
 * 站内其它页面的 CSP 一行不用改。
 *
 * 实测确认（scripts-瘦身/_tmp/csp-probe2.mjs）：父页通过 `contentDocument.open()/write()`
 * 写入内容后，文档沿用**本响应**的 CSP，而不是父页的 —— 外链脚本执行成功、外链样式生效、
 * 零 CSP 违规。新标签（window.open 本路由后再写入）行为一致。
 *
 * ## 这个文件为什么叫 `_preview-shell.ts`
 *
 * `functions/` 下划线前缀 = 不是路由，只作共享模块被 import（同 `functions/api/_tmt.ts`）。
 * 站点构建期（vite.config.ts）也 import 它，给 `vite dev` / `vite preview` 补上同一个路由 ——
 * 本地没有 Pages Functions 运行时，否则本地开发会看到 iframe 里套了一层 SPA。
 */

/** 预览壳页的路由。工具页拼 URL 时走 `appBaseUrl + 'html-preview'`。 */
export const PREVIEW_SHELL_PATH = '/html-preview';

/**
 * 壳页专用 CSP：刻意宽松 —— 它的唯一用途是渲染「用户自己写的 HTML」，
 * 用户 HTML 会引外链 CDN（Bootstrap / Tailwind CDN / 字体 / 图片），拦了就等于功能坏了。
 * 隔离靠的是承载它的 iframe 的 sandbox（见 html-editor.vue），不靠 CSP。
 *
 * `frame-ancestors 'self'` 保证只有本站页面能把它嵌进 iframe / 写内容。
 */
export const PREVIEW_SHELL_CSP = [
  "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'",
  "script-src * data: blob: 'unsafe-inline' 'unsafe-eval'",
  "style-src * data: blob: 'unsafe-inline'",
  "img-src * data: blob:",
  "font-src * data:",
  "connect-src *",
  "media-src * data: blob:",
  "frame-src * data: blob:",
  "worker-src * data: blob:",
  "object-src 'none'",
  "base-uri 'self'",
  'form-action *',
  "frame-ancestors 'self'",
].join('; ');

/**
 * 壳页本体：一块空白画布 + 一个「我就绪了」的握手信号。
 *
 * 握手是为了让写入方知道 document 何时可写 —— iframe 刚挂上时 contentDocument 还停在
 * 初始 about:blank，此时写入会被随后的导航冲掉；新标签窗口同理。
 */
export const PREVIEW_SHELL_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex, nofollow">
<title>HTML 预览</title>
<style>
  html, body { margin: 0; padding: 0; }
</style>
</head>
<body>
<script>
  (function () {
    var target = window.parent !== window ? window.parent : window.opener;
    if (!target) { return; }
    try {
      target.postMessage({ type: 'gjxtools-preview-ready' }, window.location.origin);
    } catch (error) { /* 对方不接受也无所谓，写入方还有轮询兜底 */ }
  })();
</script>
</body>
</html>
`;

/** 壳页响应头（Function 与本地 dev/preview 中间件共用，保证三处行为一致）。 */
export const PREVIEW_SHELL_HEADERS: Record<string, string> = {
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': PREVIEW_SHELL_CSP,
  // 空壳页被搜索引擎收录没有意义，收进去还是条「空页面」
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',

  // ⚠️ 别在这里加 COEP / CORP。
  //
  // 曾经出现过：本地 /html-editor 的预览 iframe 是空白页，读 contentDocument 得 null（像跨域），
  // 但 curl 直接拿 /html-preview 却是正常 200 + 正常的头。真因不在本路由，而在 vite.config.ts 的
  // `server.headers` 曾给全站挂了 `COEP: require-corp`（Vite 的 preview.headers 会继承它）：
  // 宿主页带 COEP 时，被嵌文档**自己必须也声明 COEP 头**，否则 Chrome 报
  // `net::ERR_BLOCKED_BY_RESPONSE`（blockedReason = `coep-frame-resource-needs-coep-header`）。
  // 给本路由补 CORP / `COEP: unsafe-none` 都救不了（实测 6 种组合全挂），已把那两条头从
  // vite.config.ts 移除。线上（public/_headers）本来就没有 COEP，所以这边什么都不用加。
};
