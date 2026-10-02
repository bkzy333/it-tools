---
slug: base64-is-not-encryption
title: Base64 不是加密：什么时候该用，什么时候不该用
description: Base64 是可逆编码，不是加密算法。这篇讲清它的编码原理、体积开销、与 Base64URL 的区别，以及哪些场景可以用、哪些场景用了等于裸奔。
keywords: [Base64, Base64URL, 编码与加密, 数据传输, 明文泄露]
relatedTools:
  - /base64-string-converter
  - /base64-file-converter
---

# Base64 不是加密：什么时候该用，什么时候不该用

Base64 是一种编码，不是加密。判断标准只有一条：**加密需要密钥，编码不需要**。Base64 的可逆性完全公开，任何人拿一个在线工具半秒就能还原原文，它提供的保密性是零。

## 它到底做了什么

Base64 要解决的问题是"二进制数据没法安全通过只接受文本的通道"。它把每 3 个字节（24 位）切成 4 组、每组 6 位，再把 6 位的值映射到一个 64 字符的可打印字符集（`A-Z`、`a-z`、`0-9`、`+`、`/`），不足 3 字节的部分用 `=` 补齐。

| 输入字节数 | 输出字符数 | 膨胀率 |
| --- | --- | --- |
| 3 | 4 | 33.3% |
| 6 | 8 | 33.3% |
| 1 | 4 | 300% |
| 1 MB | 约 1.33 MB | 33.3% |

通项公式是 `ceil(n / 3) * 4`。也就是说，无论数据多大，编码后体积固定增加约三分之一。这是它在带宽敏感场景下的唯一硬成本，也是大文件不该内联进 JSON 或 HTML 的原因。

## 该用的四个场景

1. **把二进制塞进文本协议**。HTML 的 Data URI（`data:image/png;base64,...`）、JSON 里传一段小图标、邮件 MIME 附件，都是典型用法。
2. **HTTP Basic 认证**。`Authorization: Basic` 后面跟的是 `base64(username:password)`。
3. **JWT、URL 参数、Cookie 里传结构化数据**。这些场合用的是 Base64URL 变体。
4. **日志与调试输出**。把不可打印字节变成可复制粘贴的文本。

## 不该用的场景（用了等于裸奔）

| 场景 | 错误做法 | 正确做法 |
| --- | --- | --- |
| 存用户密码 | `base64(password)` | Argon2id / bcrypt / scrypt |
| 传输 API 密钥 | 请求头里塞一层 Base64 就以为安全 | 走 HTTPS，服务端用 HMAC 签名 |
| 隐藏 URL 里的 ID | `base64("user:10086")` | 换成不可猜测的随机 ID（如 UUID） |
| 混淆配置里的数据库密码 | Base64 包一层 | 用密钥管理服务或环境变量 + 访问控制 |
| 保护用户隐私数据 | 编码后存库 | 用 AES-GCM 这类真加密，密钥独立管理 |

HTTP Basic 认证尤其容易被误解：它"看起来安全"是因为通常跑在 HTTPS 上，真正起作用的是 TLS，Base64 本身没有任何贡献。抓到明文 HTTP 流量，一眼就能解开。

## Base64 和 Base64URL 别混用

URL 与文件名安全变体（RFC 4648 第 5 节）把 `+` 换成 `-`、`/` 换成 `_`，通常还去掉 `=` 填充。JWT、OAuth 的 `code`、各种 URL 参数都用这一套。混用的后果很具体：一个带 `+` 的标准 Base64 串放进 URL 查询串，服务端会把它解成空格；带 `/` 的出现在路径里会被当成分隔符。

## 写代码会踩的三个坑

**第一，`btoa` 处理不了中文。** 浏览器的 `btoa()` 只接受 Latin-1（码位 0–255）字符，传中文会直接抛 `InvalidCharacterError`。正确做法是先做 UTF-8 编码：

```js
function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64decode(b64) {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

b64encode('你好');     // '5L2g5aW9'
b64decode('5L2g5aW9'); // '你好'
```

Node 里没有这个问题，直接指定编码即可：

```js
Buffer.from('你好', 'utf8').toString('base64');       // '5L2g5aW9'
Buffer.from('5L2g5aW9', 'base64').toString('utf8');  // '你好'
```

**第二，MIME 场景会自动插入换行。** 邮件和一些老库每 76 个字符插一个 `\r\n`，直接拼接或比对会失败。处理前先去掉所有空白字符。

**第三，Python 里别忘 `urlsafe` 变体。**

```python
import base64

base64.b64encode(b'\xfb\xff')          # b'+/8='
base64.urlsafe_b64encode(b'\xfb\xff')  # b'-_8='
```

## Base64、Base32、Base58、Hex 怎么选

| 编码 | 字符集大小 | 膨胀率 | 典型用途 |
| --- | --- | --- | --- |
| Hex（十六进制） | 16 | 100% | 哈希值展示、颜色值、调试输出 |
| Base32 | 32 | 60% | 需要大小写不敏感的场合（OTP 密钥、部分文件系统） |
| Base64 | 64 | 33% | 通用二进制转文本 |
| Base58 | 58 | 约 37% | 比特币地址一类，去掉了 `0`/`O`、`l`/`I` 等易混字符 |

选择依据只有三条：能不能容忍大小写、需不需要人眼抄写、对膨胀率有多敏感。只有前两条都不满足时才需要考虑 Base58 这类非标准方案，代价是要自己实现，标准库里没有。

## 怎么判断一段文本是不是 Base64

三个条件一起看：

1. **字符集**：只含 `A-Z`、`a-z`、`0-9`、`+`、`/`，末尾最多两个 `=`（URL 变体则是 `-` 和 `_`，通常不带填充）。
2. **长度**：带填充时长度一定是 4 的倍数；去掉填充后，长度模 4 的余数只能是 0、2、3——余 1 是无效编码，因为 1 个字节不可能编码出 2 个 Base64 字符。
3. **末位约束**：余 2 时最后那个字符的低 4 位必须为 0，余 3 时低 2 位必须为 0。只有自己写解码器时才用得上这一条。

满足前两条基本就能判定。但要记住：Base64 不携带任何类型信息，一段 Base64 解码后是文本还是 PNG，要靠字符集和文件头（`‰PNG`、PDF 的 `%PDF-`）进一步判断，不能靠猜。

## 一行区分编码、哈希、加密

- **编码（Base64）**：可逆，无密钥，目的是让数据能过文本通道。
- **哈希（SHA-256）**：不可逆，无密钥，目的是校验完整性。
- **加密（AES-GCM）**：可逆，**必须有密钥**，目的是保密。

只要需求里出现了"不能被别人看到"这几个字，Base64 就从选项里划掉。

## 自己动手试试

- [在线做 Base64 编码和解码](/base64-string-converter)
- [对整个文件做 Base64 编码](/base64-file-converter)
