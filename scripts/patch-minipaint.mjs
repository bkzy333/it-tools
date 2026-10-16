#!/usr/bin/env node
/**
 * patch-minipaint.mjs — 对 miniPaint 官方 dist/bundle.js 打自托管补丁
 *
 * 用法：node scripts/patch-minipaint.mjs [bundle.js 路径]
 * 默认：public/minipaint/dist/bundle.js
 *
 * 背景：本站以同源 iframe 嵌入自托管的 miniPaint（见 src/tools/image-editor/）。
 * 官方产物有三处按「部署在域名根目录 + 允许访问 Google」假设写的行为，
 * 自托管到 gjxtools.com 子路径 + 严格 CSP 下必须修补：
 *
 *   P1  gif.worker.js 引用源码树路径 ./src/js/libs/gifjs/gif.worker.js，
 *       自托管站点该路径不存在 → GIF 导出的 worker 404。改为站点根相对路径。
 *
 *   P2  config.FONTS 里 28 个 Google 字体（Lato/Montserrat/Poppins...）。
 *       选中它们会触发 webfontloader 请求 fonts.googleapis.com：
 *         - 本站 CSP style-src 为 'self'，请求被拦 → 弹「Font X could not be loaded.」错误提示；
 *         - 即便放行 CSP，Google 字体域名在中国大陆不稳定，主要受众照样加载失败，
 *           且要等 TCP 超时才失败，体验比被 CSP 秒拦更差。
 *       替换为中文系统字体（微软雅黑/黑体/宋体/楷体/等线等）：
 *       零网络、零失败，且补上了原版没有的中文字体选择（原版 36 个字体无一中文，
 *       中文只能靠不可见的系统 fallback 渲染）。
 *
 *   P3  fontLoadMap 预载集合原本只含 8 个英文字体。P2 新增的中文字体若不在集合内，
 *       首次使用仍会走 WebFont.load → 补入集合，保证零网络。
 *
 *   P4  字体下拉的 [Add Font...] 入口会调 www.googleapis.com 拉全目录（还需 API key），
 *       被拦后弹「Error loading the list of fonts from Google.」且列表为空。
 *       移除该入口（对话框代码成为死代码，不可达）。
 *
 * 每次升级 miniPaint：重新拷贝官方 dist/bundle.js 后重跑本脚本即可。
 * 脚本幂等：已打过的补丁会跳过；模式匹配不到会报错退出（说明官方产物结构变了，需人工核对）。
 */

import fs from 'node:fs';

const bundlePath = process.argv[2] || 'public/minipaint/dist/bundle.js';

// P2/P3 共用的中文字体清单（按流行度排序，覆盖 Win/macOS/Linux/Android）
const CJK_FONTS = [
	'Microsoft YaHei', // 微软雅黑（Windows 现代默认）
	'SimHei', // 黑体
	'SimSun', // 宋体
	'KaiTi', // 楷体
	'DengXian', // 等线（Win10+）
	'FangSong', // 仿宋
	'PingFang SC', // macOS
	'Hiragino Sans GB', // 旧版 macOS
	'STHeiti', // 旧版 macOS/iOS
	'Noto Sans CJK SC', // Linux / Android
];

const SYSTEM_FONTS = [
	'Arial',
	'Courier',
	'Impact',
	'Helvetica',
	'Monospace',
	'Tahoma',
	'Times New Roman',
	'Verdana',
];

function readBundle(path) {
	if (!fs.existsSync(path)) {
		console.error(`[patch-minipaint] 找不到文件: ${path}`);
		process.exit(1);
	}
	return fs.readFileSync(path, 'utf8');
}

/** 单处替换：oldStr 必须恰好出现一次 */
function replaceOnce(src, oldStr, newStr, label) {
	const count = src.split(oldStr).length - 1;
	if (count !== 1) {
		console.error(`[patch-minipaint] ${label}: 期望匹配 1 处，实际 ${count} 处 —— 官方产物结构可能已变，请人工核对`);
		process.exit(1);
	}
	return src.replace(oldStr, newStr);
}

function patchGifWorker(src) {
	const oldPath = './src/js/libs/gifjs/gif.worker.js';
	const oldCount = src.split(oldPath).length - 1;
	if (oldCount === 0) {
		// 已打过：确认站点根引用存在
		if (!/["']gif\.worker\.js["']/.test(src)) {
			console.error('[patch-minipaint] P1: 既无源码树路径也无站点根引用，状态异常');
			process.exit(1);
		}
		console.log('[patch-minipaint] P1 gif.worker.js 路径: 已修补，跳过');
		return src;
	}
	if (oldCount !== 1) {
		console.error(`[patch-minipaint] P1: 源码树路径匹配 ${oldCount} 处，期望 1 处`);
		process.exit(1);
	}
	src = src.replace(oldPath, 'gif.worker.js');
	console.log('[patch-minipaint] P1 gif.worker.js 路径: 源码树路径 -> 站点根');
	return src;
}

function patchFontsList(src) {
	const m = src.match(/\.FONTS=\[[^\]]*\]/);
	if (!m) {
		console.error('[patch-minipaint] P2: 找不到 config.FONTS 数组');
		process.exit(1);
	}
	if (m[0].includes('Microsoft YaHei')) {
		console.log('[patch-minipaint] P2 config.FONTS: 已替换为中文字体，跳过');
		return src;
	}
	const googleFonts = m[0].match(/"([^"]+)"/g).slice(8); // 前 8 个是系统字体
	const next = `.FONTS=[${[...SYSTEM_FONTS, ...CJK_FONTS].map((f) => `"${f}"`).join(',')}]`;
	src = src.replace(m[0], next);
	console.log(`[patch-minipaint] P2 config.FONTS: ${googleFonts.length} 个 Google 字体 -> ${CJK_FONTS.length} 个中文系统字体`);
	return src;
}

function patchFontLoadMap(src) {
	// minified 形态: <var>.set("Arial",!0),<var>.set("Courier",!0),...,<var>.set("Verdana",!0);
	const re = /(\w+)\.set\("Arial",!0\)(?:,\1\.set\("[^"]*",!0\))*;/;
	const m = src.match(re);
	if (!m) {
		console.error('[patch-minipaint] P3: 找不到 fontLoadMap 预载集合');
		process.exit(1);
	}
	if (m[0].includes('"Microsoft YaHei"')) {
		console.log('[patch-minipaint] P3 fontLoadMap 预载: 已含中文字体，跳过');
		return src;
	}
	const varName = m[1];
	const extra = CJK_FONTS.map((f) => `${varName}.set("${f}",!0)`).join(',');
	const next = m[0].replace(/;$/, `,${extra};`);
	src = src.replace(m[0], next);
	console.log(`[patch-minipaint] P3 fontLoadMap 预载: 补入 ${CJK_FONTS.length} 个中文字体（零 WebFont.load）`);
	return src;
}

function patchAddFontEntry(src) {
	const entry = '["","[Add Font...]"].concat(';
	if (!src.includes(entry)) {
		if (src.includes('[Add Font...]')) {
			console.error('[patch-minipaint] P4: [Add Font...] 形态与预期不符，请人工核对');
			process.exit(1);
		}
		console.log('[patch-minipaint] P4 [Add Font...] 入口: 已移除，跳过');
		return src;
	}
	src = replaceOnce(src, entry, '[""].concat(', 'P4 [Add Font...] 入口');
	console.log('[patch-minipaint] P4 [Add Font...] 入口: 已移除（不再调 www.googleapis.com）');
	return src;
}

function verify(src) {
	const problems = [];
	// 可达路径必须清零
	if (src.includes('./src/js/libs/gifjs/gif.worker.js')) problems.push('P1 未生效');
	if (!src.includes('"Microsoft YaHei"')) problems.push('P2 未生效');
	if (!src.includes('.set("SimHei",!0)')) problems.push('P3 未生效');
	if (src.includes('[Add Font...]')) problems.push('P4 未生效');

	// FONTS 数组必须恰好等于 系统字体 + 中文字体，不得残留任何 Google 字体
	const fontsMatch = src.match(/\.FONTS=\[[^\]]*\]/);
	if (!fontsMatch) {
		problems.push('找不到 config.FONTS 数组');
	} else {
		const actual = fontsMatch[0].match(/"([^"]+)"/g).map((s) => s.slice(1, -1));
		const expected = [...SYSTEM_FONTS, ...CJK_FONTS];
		const same = actual.length === expected.length && expected.every((f, i) => actual[i] === f);
		if (!same) problems.push(`FONTS 与预期不符: ${actual.join(',')}`);
	}

	if (problems.length > 0) {
		console.error(`[patch-minipaint] 校验失败: ${problems.join(' / ')}`);
		process.exit(1);
	}

	// 死代码提示（不拦截）：以下字面量位于不可达代码，运行期不会发起请求 ——
	//   www.googleapis.com: P4 已移除入口的字体搜索对话框（Google_fonts_search_class）
	//   fonts.googleapis.com: webfontloader 库内部，仅 load_font_family 遇到未预载字体时才会拼 URL，
	//                       而 P3 已把下拉框全部字体预载
	// 权威验证见浏览器冒烟（scripts-瘦身/minipaint-smoke.mjs）：全会话零 Google 域名请求。
	const deadRefs = src.match(/https?:\/\/[a-z0-9.-]*googleapis\.com/g) || [];
	if (deadRefs.length > 0) {
		console.log(`[patch-minipaint] 提示: bundle 内残留 ${deadRefs.length} 处 googleapis 字面量，均在不可达死代码中，运行期不会发起请求`);
	}
}

const bundle = readBundle(bundlePath);
let patched = bundle;
patched = patchGifWorker(patched);
patched = patchFontsList(patched);
patched = patchFontLoadMap(patched);
patched = patchAddFontEntry(patched);
verify(patched);

if (patched === bundle) {
	console.log('[patch-minipaint] 无需改动（所有补丁均已应用）');
} else {
	fs.writeFileSync(bundlePath, patched);
	const before = Buffer.byteLength(bundle);
	const after = Buffer.byteLength(patched);
	console.log(`[patch-minipaint] 已写入 ${bundlePath}（${(before / 1024).toFixed(0)}KB -> ${(after / 1024).toFixed(0)}KB）`);
}
console.log('[patch-minipaint] 完成，校验通过');
