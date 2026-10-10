// API Tester 的解析与代码生成工具集（纯函数，便于单测与复用）。
// 解析目标：批量参数 / Header 文本、curl / PowerShell / fetch / Map 导入。
// 生成目标：curl / Python(requests) / C#(HttpClient) / Java 11+ / Go / Node.js(fetch) / PHP(cURL)。

import { parse as parseJson5 } from 'json5';
import { jsonrepair } from 'jsonrepair';

export interface KeyValue {
  key: string;
  value: string;
}

export type BodyMode = 'none' | 'form' | 'raw';

/** 归一化后的请求（供发送与代码生成共用） */
export interface ApiRequest {
  method: string;
  url: string; // 已拼接查询参数
  headers: KeyValue[];
  body: string | null;
}

export interface ParsedRequest {
  method: string;
  baseUrl: string;
  queryParams: KeyValue[];
  headers: KeyValue[];
  body: string;
  bodyMode: BodyMode;
  contentType: string;
  formParams: KeyValue[];
}

/**
 * 把任意 JSON 值转成可展示/可发送的字符串。
 * 不能直接 String(v)：对象会变成 "[object Object]"，嵌套结构就丢了。
 */
function toDisplayValue(v: unknown): string {
  if (v == null) {
    return '';
  }
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v) ?? '';
    }
    catch {
      return '';
    }
  }
  return String(v);
}

export function emptyRequest(): ParsedRequest {
  return {
    method: '',
    baseUrl: '',
    queryParams: [],
    headers: [],
    body: '',
    bodyMode: 'none',
    contentType: 'application/json',
    formParams: [],
  };
}

// ---------------------------------------------------------------------------
// 批量解析
// ---------------------------------------------------------------------------

/** 解析「查询参数 / 表单」批量文本：支持 a=1&b=2、JSON 对象、逐行 Key=Value / Key: Value */
export function parseKeyValueText(text: string): KeyValue[] {
  const out: KeyValue[] = [];
  const trimmed = text.trim();
  if (!trimmed) return out;

  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed);
      for (const [k, v] of Object.entries(obj)) out.push({ key: k, value: toDisplayValue(v) });
      return out;
    } catch {
      // 不是 JSON，继续按其它格式解析
    }
  }

  if (trimmed.includes('=') && (trimmed.includes('&') || !trimmed.includes('\n'))) {
    for (const pair of trimmed.split('&')) {
      const p = pair.trim();
      if (!p) continue;
      const idx = p.indexOf('=');
      if (idx === -1) out.push({ key: p, value: '' });
      else out.push({ key: p.slice(0, idx).trim(), value: p.slice(idx + 1).trim() });
    }
    return out;
  }

  for (const line of trimmed.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const m = s.match(/^([^:=]+)[:=]\s*(.*)$/);
    if (m) out.push({ key: m[1].trim(), value: m[2].trim() });
  }
  return out;
}

/** 解析 Header 批量文本：支持 Key: Value 逐行、JSON 对象 */
export function parseHeadersText(text: string): KeyValue[] {
  const out: KeyValue[] = [];
  const trimmed = text.trim();
  if (!trimmed) return out;

  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed);
      for (const [k, v] of Object.entries(obj)) out.push({ key: k, value: toDisplayValue(v) });
      return out;
    } catch {
      // 继续
    }
  }

  for (const line of trimmed.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const idx = s.indexOf(':');
    if (idx === -1) continue;
    const k = s.slice(0, idx).trim();
    if (!k) continue;
    let v = s.slice(idx + 1).trim();
    // 去掉浏览器 / 抓包工具常见的多余引号
    v = v.replace(/^["']|["']$/g, '');
    out.push({ key: k, value: v });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 通用小工具
// ---------------------------------------------------------------------------

function applyUrl(req: ParsedRequest, u: string) {
  try {
    const url = new URL(u);
    for (const [k, v] of url.searchParams.entries()) req.queryParams.push({ key: k, value: v });
    url.search = '';
    req.baseUrl = url.toString();
  } catch {
    req.baseUrl = u;
  }
}

function hasHeader(req: ParsedRequest, name: string): boolean {
  return req.headers.some((h) => h.key.toLowerCase() === name.toLowerCase());
}

function setHeaderIfAbsent(req: ParsedRequest, name: string, value: string) {
  if (!hasHeader(req, name)) req.headers.push({ key: name, value });
}

function isJson(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
}

/** 宽松 tokenizer：正确处理单/双引号与反斜杠转义（用于 curl） */
function tokenize(s: string): string[] {
  const tokens: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"') {
        cur += s[i + 1] ?? '';
        i++;
      } else cur += c;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (/\s/.test(c)) {
      if (cur) {
        tokens.push(cur);
        cur = '';
      }
    } else cur += c;
  }
  if (cur) tokens.push(cur);
  return tokens;
}

function extractBalanced(s: string): string {
  let depth = 0;
  let started = false;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '{' || c === '[') {
      if (!started) {
        started = true;
        start = i;
      }
      depth++;
    } else if (c === '}' || c === ']') {
      depth--;
      if (started && depth === 0) return s.slice(start, i + 1);
    }
  }
  return s;
}

function splitTopLevel(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const c of s) {
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') depth--;
    if (c === sep && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim());
}

// ---------------------------------------------------------------------------
// curl 解析
// ---------------------------------------------------------------------------

export function parseCurl(cmd: string): ParsedRequest {
  const req = emptyRequest();
  const normalized = cmd.replace(/\\\s*\n/g, ' ').replace(/\r/g, '');
  const tokens = tokenize(normalized);
  let i = tokens[0] === 'curl' ? 1 : 0;

  for (; i < tokens.length; i++) {
    const tok = tokens[i];
    if (!tok.startsWith('-')) {
      applyUrl(req, tok);
      continue;
    }
    const lower = tok.toLowerCase();
    if (lower === '-x' || lower === '--request' || lower === '--method') {
      req.method = (tokens[++i] || '').toUpperCase();
    } else if (lower === '-h' || lower === '--header') {
      const h = tokens[++i] || '';
      const ci = h.indexOf(':');
      if (ci !== -1) req.headers.push({ key: h.slice(0, ci).trim(), value: h.slice(ci + 1).trim() });
    } else if (lower === '-d' || lower === '--data' || lower === '--data-raw' || lower === '--data-binary') {
      req.body = tokens[++i] || '';
      if (!req.method || req.method === 'GET') req.method = 'POST';
      if (!hasHeader(req, 'Content-Type')) {
        req.contentType = isJson(req.body) ? 'application/json' : 'application/x-www-form-urlencoded';
      }
      req.bodyMode = 'raw';
    } else if (lower === '-u' || lower === '--user') {
      req.headers.push({ key: 'Authorization', value: 'Basic ' + btoa(tokens[++i] || '') });
    } else if (lower === '-b' || lower === '--cookie') {
      req.headers.push({ key: 'Cookie', value: tokens[++i] || '' });
    } else if (lower === '--json') {
      req.body = tokens[++i] || '';
      req.method = req.method || 'POST';
      setHeaderIfAbsent(req, 'Content-Type', 'application/json');
      req.bodyMode = 'raw';
    } else if (lower === '-g' || lower === '--get') {
      req.method = 'GET';
      if (req.body && req.body.includes('=')) {
        for (const p of req.body.split('&')) {
          const ci = p.indexOf('=');
          if (ci === -1) req.queryParams.push({ key: p, value: '' });
          else req.queryParams.push({ key: p.slice(0, ci), value: p.slice(ci + 1) });
        }
        req.body = '';
        req.bodyMode = 'none';
      }
    } else if (lower === '-f' || lower === '--form') {
      const f = tokens[++i] || '';
      const ci = f.indexOf('=');
      req.formParams.push({ key: ci === -1 ? f : f.slice(0, ci), value: ci === -1 ? '' : f.slice(ci + 1) });
      req.bodyMode = 'form';
      if (!hasHeader(req, 'Content-Type')) req.contentType = 'multipart/form-data';
    } else if (lower === '--url') {
      applyUrl(req, tokens[++i] || '');
    }
    // 未知选项（带值的不影响后续 token 解析，因为值已被 tokenizer 合并成独立 token 且已跳过）
  }

  if (req.body) req.bodyMode = 'raw';
  return req;
}

// ---------------------------------------------------------------------------
// PowerShell 解析（Invoke-RestMethod / Invoke-WebRequest）
// ---------------------------------------------------------------------------

function matchParam(text: string, name: string): string | null {
  // 匹配 -Name "value" / -Name 'value' / -Name value（value 不得是 hashtable）
  const re = new RegExp(`-${name}\\s*[:=]?\\s*("([^"]*)"|'([^']*)'|((?!@{)[^\\s"']+))`, 'i');
  const m = text.match(re);
  if (!m) return null;
  const v = m[2] ?? m[3] ?? m[4] ?? '';
  return v.startsWith('@{') ? null : v;
}

function matchHashtable(text: string, name: string): string | null {
  const re = new RegExp(`-${name}\\s*[:=]?\\s*@\\{([^}]*)\\}`, 'i');
  const m = text.match(re);
  return m ? m[1] : null;
}

function parseHashtable(block: string): KeyValue[] {
  const out: KeyValue[] = [];
  const re = /"?([^"=\s]+)"?\s*=\s*("([^"]*)"|'([^']*)'|([^\s;]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    out.push({ key: m[1], value: m[3] ?? m[4] ?? m[5] ?? '' });
  }
  return out;
}

export function parsePowerShell(cmd: string): ParsedRequest {
  const req = emptyRequest();
  const text = cmd.replace(/\r/g, ' ');

  const uri = matchParam(text, 'Uri') || matchParam(text, 'Url');
  if (uri) applyUrl(req, uri);

  const method = matchParam(text, 'Method');
  if (method) req.method = method.toUpperCase();

  const ct = matchParam(text, 'ContentType');
  if (ct) req.contentType = ct;

  const headersBlock = matchHashtable(text, 'Headers');
  if (headersBlock) req.headers.push(...parseHashtable(headersBlock));

  const bodyBlock = matchHashtable(text, 'Body');
  const bodyStr = matchParam(text, 'Body');
  if (bodyBlock) {
    const kv = parseHashtable(bodyBlock);
    if (req.contentType && req.contentType.includes('json')) {
      req.body = JSON.stringify(Object.fromEntries(kv.map((x) => [x.key, x.value])));
    } else {
      req.body = kv.map((x) => `${encodeURIComponent(x.key)}=${encodeURIComponent(x.value)}`).join('&');
      req.contentType = req.contentType || 'application/x-www-form-urlencoded';
    }
    req.bodyMode = 'raw';
  } else if (bodyStr) {
    req.body = bodyStr;
    req.bodyMode = 'raw';
  }

  if (!req.method) req.method = req.body ? 'POST' : 'GET';
  return req;
}

// ---------------------------------------------------------------------------
// fetch(JS) 解析
// ---------------------------------------------------------------------------

/**
 * 把一段「JS 字面量」（可能是不带引号的 key、单引号、尾逗号等非法 JSON）安全地转成 JSON 字符串。
 *
 * 这里曾经用 `eval` 实现，会把用户粘贴的内容当脚本执行 —— 粘贴任意文本即可在同源下跑任意 JS。
 * 改为纯解析降级链：严格 JSON → JSON5 → jsonrepair 修复后再严格解析，全程不执行任何代码。
 * 三种策略都失败时返回 ''（与旧的 eval 抛错分支行为一致）。
 */
function stringifyJsLiteral(source: string): string {
  const text = extractBalanced(source).trim();
  if (!text) {
    return '';
  }

  const strategies: Array<() => unknown> = [
    () => JSON.parse(text),
    () => parseJson5(text),
    () => JSON.parse(jsonrepair(text)),
  ];

  for (const parse of strategies) {
    try {
      const value = parse();
      if (value === undefined) {
        continue;
      }
      // 与旧实现保持一致：无论解析出什么类型，最终都以 JSON 字符串形式作为请求体
      return JSON.stringify(value) ?? '';
    }
    catch {
      // 该策略解析失败，继续尝试下一种
    }
  }

  return '';
}

function parseJsObjectOrArray(str: string): KeyValue[] {
  const out: KeyValue[] = [];
  const trimmed = str.trim();
  if (trimmed.startsWith('[')) {
    const re = /\[\s*['"`]([^'"`]+)['"`]\s*,\s*['"`]([^'"`]*)['"`]\s*\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(str))) out.push({ key: m[1], value: m[2] });
    return out;
  }
  const re = /['"`]?([^'"`\s:]+)['"`]?\s*:\s*['"`]([^'"`]*)['"`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(str))) out.push({ key: m[1], value: m[2] });
  return out;
}

export function parseFetch(code: string): ParsedRequest {
  const req = emptyRequest();

  const urlMatch = code.match(/fetch\s*\(\s*['"`]([^'"`]+)['"`]/);
  const url =
    urlMatch?.[1] ?? code.match(/fetch\s*\(\s*([^,\s'"`]+)/)?.[1] ?? '';
  if (url) applyUrl(req, url);

  const optMatch = code.match(/fetch\s*\([^,]*,\s*(\{[\s\S]*\})/);
  if (optMatch) {
    const optStr = extractBalanced(optMatch[1]);
    const mMethod = optStr.match(/method\s*:\s*['"`]?([A-Za-z]+)['"`]?/);
    if (mMethod) req.method = mMethod[1].toUpperCase();

    const hMatch = optStr.match(/headers\s*:\s*(\{[\s\S]*?\}|\[[\s\S]*?\])/);
    if (hMatch) req.headers.push(...parseJsObjectOrArray(extractBalanced(hMatch[1])));

    const bMatch = optStr.match(/body\s*:\s*(['"`][\s\S]*?['"`]|JSON\.stringify\([^)]*\)|\{[\s\S]*?\})/);
    if (bMatch) {
      let b = bMatch[1];
      if (b.startsWith('JSON.stringify')) {
        const inner = b.match(/JSON\.stringify\(\s*([\s\S]*?)\)/);
        if (inner) {
          b = stringifyJsLiteral(inner[1]);
        }
      } else if (b.startsWith('`') || b.startsWith("'") || b.startsWith('"')) {
        b = b.slice(1, -1);
      } else {
        b = extractBalanced(b);
      }
      req.body = b;
      req.bodyMode = 'raw';
    }
  }

  if (!req.method) req.method = req.body ? 'POST' : 'GET';
  return req;
}

// ---------------------------------------------------------------------------
// Map / HashMap 解析（Java 风格）
// ---------------------------------------------------------------------------

function stripQuotes(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  return t;
}

export function parseMap(text: string): KeyValue[] {
  const out: KeyValue[] = [];
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed);
      for (const [k, v] of Object.entries(obj)) out.push({ key: k, value: String(v) });
      return out;
    } catch {
      // 继续
    }
  }

  const ofMatch = text.match(/Map\.of\s*\(([\s\S]*?)\)/);
  if (ofMatch) {
    const args = splitTopLevel(ofMatch[1], ',');
    for (let i = 0; i + 1 < args.length; i += 2) {
      out.push({ key: stripQuotes(args[i]), value: stripQuotes(args[i + 1]) });
    }
    return out;
  }

  const entryRe = /entry\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*['"`]([^'"`]*)['"`]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(text))) out.push({ key: m[1], value: m[2] });
  if (out.length) return out;

  return parseHeadersText(text);
}

// ---------------------------------------------------------------------------
// 代码生成
// ---------------------------------------------------------------------------

export type CodeLang = 'curl' | 'python' | 'csharp' | 'java' | 'go' | 'node' | 'php';

function quotePy(s: string): string {
  if (s.includes('\n') || s.includes("'")) {
    return '"""' + s.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"') + '"""';
  }
  return "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

function quoteCs(s: string): string {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"';
}

function quoteJava(s: string): string {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
}

function quotePhp(s: string): string {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\$/g, '\\$') + '"';
}

function quoteGo(s: string): string {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
}

function quoteJs(s: string): string {
  return '`' + s.replace(/`/g, '\\`').replace(/\$/g, '\\$') + '`';
}

function jsKey(k: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(k) ? k : quoteJs(k);
}

function csharpVerb(m: string): string {
  const u = m.toUpperCase();
  return (
    {
      GET: 'Get',
      POST: 'Post',
      PUT: 'Put',
      DELETE: 'Delete',
      PATCH: 'Patch',
      HEAD: 'Head',
      OPTIONS: 'Options',
    }[u] || 'Get'
  );
}

function escShell(s: string): string {
  return s.replace(/'/g, `'\\''`);
}

function genCurl(r: ApiRequest): string {
  const parts: string[] = [`curl -X ${r.method}`, `'${r.url}'`];
  for (const h of r.headers) parts.push(`-H '${h.key}: ${escShell(h.value)}'`);
  if (r.body != null && r.body !== '') parts.push(`-d '${escShell(r.body)}'`);
  return parts.join(' \\\n  ');
}

function genPython(r: ApiRequest): string {
  const L: string[] = ['import requests', ''];
  L.push(`url = ${quotePy(r.url)}`);
  if (r.headers.length) {
    L.push('headers = {');
    for (const h of r.headers) L.push(`    ${quotePy(h.key)}: ${quotePy(h.value)},`);
    L.push('}');
  } else {
    L.push('headers = {}');
  }
  if (r.body != null && r.body !== '') {
    L.push(`data = ${quotePy(r.body)}`);
    L.push('');
    L.push('response = requests.request(');
    L.push(`    ${quotePy(r.method)},`);
    L.push('    url,');
    L.push('    headers=headers,');
    L.push('    data=data,');
    L.push(')');
  } else {
    L.push('');
    L.push('response = requests.request(');
    L.push(`    ${quotePy(r.method)},`);
    L.push('    url,');
    L.push('    headers=headers,');
    L.push(')');
  }
  L.push('');
  L.push('print(response.status_code)');
  L.push('print(response.text)');
  return L.join('\n');
}

function genCsharp(r: ApiRequest): string {
  const L: string[] = [
    'using System;',
    'using System.Net.Http;',
    'using System.Text;',
    'using System.Threading.Tasks;',
    '',
    'class Program',
    '{',
    '    static async Task Main()',
    '    {',
    '        using var client = new HttpClient();',
  ];
  const ct = r.headers.find((h) => h.key.toLowerCase() === 'content-type');
  const others = r.headers.filter((h) => h.key.toLowerCase() !== 'content-type');
  for (const h of others) L.push(`        client.DefaultRequestHeaders.TryAddWithoutValidation(${quoteCs(h.key)}, ${quoteCs(h.value)});`);
  L.push(`        var request = new HttpRequestMessage(HttpMethod.${csharpVerb(r.method)}, ${quoteCs(r.url)});`);
  if (r.body != null && r.body !== '') {
    const media = ct ? quoteCs(ct.value) : 'null';
    L.push(`        request.Content = new StringContent(${quoteCs(r.body)}, Encoding.UTF8, ${media});`);
  }
  L.push('        using var response = await client.SendAsync(request);');
  L.push('        var body = await response.Content.ReadAsStringAsync();');
  L.push('        Console.WriteLine((int)response.StatusCode);');
  L.push('        Console.WriteLine(body);');
  L.push('    }');
  L.push('}');
  return L.join('\n');
}

function genJava(r: ApiRequest): string {
  const L: string[] = [
    'import java.net.URI;',
    'import java.net.http.HttpClient;',
    'import java.net.http.HttpRequest;',
    'import java.net.http.HttpResponse;',
    'import java.time.Duration;',
    '',
    'public class Main {',
    '    public static void main(String[] args) throws Exception {',
    '        HttpClient client = HttpClient.newHttpClient();',
    '        HttpRequest.Builder builder = HttpRequest.newBuilder()',
    `            .uri(URI.create(${quoteJava(r.url)}))`,
    '            .timeout(Duration.ofSeconds(30))',
  ];
  for (const h of r.headers) L.push(`            .header(${quoteJava(h.key)}, ${quoteJava(h.value)})`);
  if (r.body != null && r.body !== '') {
    L.push(`            .method(${quoteJava(r.method)}, HttpRequest.BodyPublishers.ofString(${quoteJava(r.body)}))`);
  } else {
    L.push(`            .method(${quoteJava(r.method)}, HttpRequest.BodyPublishers.noBody())`);
  }
  L.push('            ;');
  L.push('        HttpRequest request = builder.build();');
  L.push('        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());');
  L.push('        System.out.println(response.statusCode());');
  L.push('        System.out.println(response.body());');
  L.push('    }');
  L.push('}');
  return L.join('\n');
}

function genGo(r: ApiRequest): string {
  const L: string[] = [
    'package main',
    '',
    'import (',
    '\t"fmt"',
    '\t"io"',
    '\t"net/http"',
    '\t"strings"',
    ')',
    '',
    'func main() {',
    '\tclient := &http.Client{}',
  ];
  if (r.body != null && r.body !== '') {
    L.push(`\treq, err := http.NewRequest(${quoteGo(r.method)}, ${quoteGo(r.url)}, strings.NewReader(${quoteGo(r.body)}))`);
  } else {
    L.push(`\treq, err := http.NewRequest(${quoteGo(r.method)}, ${quoteGo(r.url)}, nil)`);
  }
  L.push('\tif err != nil { panic(err) }');
  for (const h of r.headers) L.push(`\treq.Header.Set(${quoteGo(h.key)}, ${quoteGo(h.value)})`);
  L.push('\tresp, err := client.Do(req)');
  L.push('\tif err != nil { panic(err) }');
  L.push('\tdefer resp.Body.Close()');
  L.push('\tbody, _ := io.ReadAll(resp.Body)');
  L.push('\tfmt.Println(resp.StatusCode)');
  L.push('\tfmt.Println(string(body))');
  L.push('}');
  return L.join('\n');
}

function genNode(r: ApiRequest): string {
  const headersObj = r.headers.map((h) => `    ${jsKey(h.key)}: ${quoteJs(h.value)}`).join(',\n');
  const bodyLine = r.body != null && r.body !== '' ? `,\n  body: ${quoteJs(r.body)}` : '';
  const L: string[] = [
    `const url = ${quoteJs(r.url)};`,
    'const options = {',
    `  method: ${quoteJs(r.method)},`,
    '  headers: {',
    headersObj,
    '  }' + bodyLine,
    '};',
    '',
    'fetch(url, options)',
    '  .then(async (res) => [res.status, await res.text()])',
    '  .then(([status, text]) => {',
    '    console.log(status);',
    '    console.log(text);',
    '  })',
    '  .catch((err) => console.error(err));',
  ];
  return L.join('\n');
}

function genPhp(r: ApiRequest): string {
  const L: string[] = ['<?php'];
  L.push('$ch = curl_init();');
  L.push(`curl_setopt($ch, CURLOPT_URL, ${quotePhp(r.url)});`);
  L.push(`curl_setopt($ch, CURLOPT_CUSTOMREQUEST, ${quotePhp(r.method)});`);
  if (r.headers.length) {
    const arr = r.headers.map((h) => `    ${quotePhp(`${h.key}: ${h.value}`)}`).join(',\n');
    L.push(`curl_setopt($ch, CURLOPT_HTTPHEADER, array(\n${arr}\n));`);
  }
  if (r.body != null && r.body !== '') {
    L.push(`curl_setopt($ch, CURLOPT_POSTFIELDS, ${quotePhp(r.body)});`);
  }
  L.push('curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);');
  L.push('$response = curl_exec($ch);');
  L.push('$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);');
  L.push('curl_close($ch);');
  L.push('echo $httpCode . "\\n";');
  L.push('echo $response;');
  return L.join('\n');
}

export function generateCode(lang: CodeLang, r: ApiRequest): string {
  switch (lang) {
    case 'curl':
      return genCurl(r);
    case 'python':
      return genPython(r);
    case 'csharp':
      return genCsharp(r);
    case 'java':
      return genJava(r);
    case 'go':
      return genGo(r);
    case 'node':
      return genNode(r);
    case 'php':
      return genPhp(r);
  }
}

export const CODE_LANGS: { value: CodeLang; label: string }[] = [
  { value: 'python', label: 'Python' },
  { value: 'csharp', label: 'C#' },
  { value: 'java', label: 'Java' },
  { value: 'go', label: 'Go' },
  { value: 'node', label: 'Node.js' },
  { value: 'php', label: 'PHP' },
  { value: 'curl', label: 'cURL' },
];
