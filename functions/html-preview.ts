// Cloudflare Pages Functions：HTML 预览壳页（GET /html-preview）
//
// 给 html-editor 工具提供一个能渲染用户 HTML 的空白容器。为什么要单独一个路由、
// 为什么这里的 CSP 可以放宽到 `*`，全部理由写在 `_preview-shell.ts` 的注释里。
//
// 要点只有一条：**_headers 里那份站点 CSP 不会作用到这个响应上**
// （Cloudflare 官方文档明确说明），所以这里的宽松策略不会削弱站内其它页面。
//
// 本身不渲染任何内容、不读任何 KV / 环境变量，部署即可用。

import { PREVIEW_SHELL_HEADERS, PREVIEW_SHELL_HTML } from './_preview-shell';

export const onRequestGet = (): Response => new Response(PREVIEW_SHELL_HTML, { headers: PREVIEW_SHELL_HEADERS });
