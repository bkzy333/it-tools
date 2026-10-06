---
slug: what-is-jwt
title: JWT 是什么？三分钟看懂并学会本地调试 Token
description: 用最直白的方式讲清 JWT 的结构、签名原理和常见安全隐患，并说明怎么在不泄露密钥的前提下本地解析和调试一个 Token。
keywords: [JWT, JSON Web Token, token 调试, 签名验证, 过期时间]
relatedTools:
  - /jwt-parser
  - /base64-string-converter
---

# JWT 是什么？三分钟看懂并学会本地调试 Token

JWT（JSON Web Token，定义在 RFC 7519）就是三段用点号隔开的字符串：`header.payload.signature`。前两段是 Base64URL 编码后的 JSON，第三段是签名。签名只保证"前两段没被改过"，不保证"别人读不到内容"——这是新手最大的误解，也是后面几乎所有安全问题的根源。

## 拆开一个真实的 Token

下面这个是最常见的示例 Token：

```text
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
```

按点号切成三段分别解 Base64URL，得到：

| 段 | 原始内容 | 作用 |
| --- | --- | --- |
| header | `{"alg":"HS256","typ":"JWT"}` | 声明签名算法和类型 |
| payload | `{"sub":"1234567890","name":"John Doe","iat":1516239022}` | 实际要传递的数据 |
| signature | 32 字节二进制的 Base64URL | 防篡改 |

注意第三段不是字符串，而是一串二进制摘要编码后的结果。把它当文本去读没有意义，只有拿密钥重新算一遍、比对字节是否相同才有意义。

## Base64URL 和标准 Base64 不一样

JWT 用的是 Base64URL（RFC 4648 第 5 节）：字符表把 `+` 换成 `-`、`/` 换成 `_`，并且**去掉末尾的 `=` 填充**。原因是 Token 要放进 URL 查询串、HTTP 头和 Cookie，而 `+` 在查询串里会被解码成空格，`/` 和 `=` 也需要额外转义。

所以直接用标准 Base64 去解 JWT 的某一段，当这段长度不是 4 的倍数时（JWT 里很常见，比如 34 个字符的 header）就会报长度错误或非法字符。解析前要么补齐 `=`，要么直接用语言里支持 base64url 的接口。

## payload 能放什么、不能放什么

规范预定义了七个注册声明（registered claims），用得最多的是这几个：

| 声明 | 全称 | 说明 |
| --- | --- | --- |
| `iss` | issuer | 签发者，比如 `https://auth.example.com` |
| `sub` | subject | 主体，通常是用户 ID |
| `aud` | audience | 受众，标明这个 Token 是发给哪个服务的 |
| `exp` | expiration | 过期时间 |
| `nbf` | not before | 生效时间 |
| `iat` | issued at | 签发时间 |
| `jti` | JWT ID | 唯一 ID，用于吊销和防重放 |

关键的坑：**`exp`、`nbf`、`iat` 的单位都是秒**（规范里叫 NumericDate），不是毫秒。JavaScript 的 `Date.now()` 返回毫秒，直接塞进 `exp` 等于把过期时间设到了五万年以后。反过来，拿秒级时间戳直接喂给 `new Date()` 会得到 1970 年的结果——`new Date(1700000000)` 是 1970-01-20，而 `new Date(1700000000 * 1000)` 才是 2023-11-14。

至于不能放什么：**任何敏感信息都不要放**。payload 只是编码，不是加密，拿到 Token 的人一秒就能解开。密码、身份证号、密钥、内部价格都别往里塞。

## 签名到底签了什么

HS256 的签名公式就一行：

```text
HMAC-SHA256( base64url(header) + "." + base64url(payload), secret )
```

签名对象是"编码后的字符串"，不是 JSON 原文。这意味着你改动一个字节的空白符、改一个键的顺序，签名就会完全不同——手工验证时千万别先解 JSON 再重新序列化去比对。

算法怎么选：

| 算法 | 类型 | 密钥形态 | 适用场景 |
| --- | --- | --- | --- |
| HS256 | 对称 HMAC | 同一个 secret | 单体服务，签发和校验在同一个信任域内 |
| RS256 | 非对称 RSA | 私钥签 / 公钥验 | 多方校验，不想把签发密钥扩散出去 |
| ES256 | 非对称 ECDSA | 私钥签 / 公钥验 | 同上，签名更短、验签更快 |
| `none` | 无签名 | — | 只应出现在测试环境 |

HS256 的 secret 至少要有 256 位（32 字节）随机数据。用 `"secret"`、`"123456"` 这类字符串当密钥，等于没签。

## 本地怎么解析和调试

调试时最常问的是"这段 payload 到底写了啥"，这一步**不需要密钥**，完全可以在本地做：

```js
// Node 16+，Buffer 支持 base64url
function decodeJwt(token) {
  const [h, p, s] = token.split('.');
  const decode = (seg) => JSON.parse(Buffer.from(seg, 'base64url').toString('utf8'));
  return { header: decode(h), payload: decode(p), signature: s };
}

const { payload } = decodeJwt(token);
if (payload.exp && Date.now() / 1000 > payload.exp) {
  console.log('已过期：', new Date(payload.exp * 1000).toISOString());
}
```

真正要**验证签名**时必须带上密钥，并且显式限定算法白名单：

```python
import jwt

# 正确做法：显式指定 algorithms
payload = jwt.decode(token, "your-256-bit-secret", algorithms=["HS256"])

# 只看内容不验签（仅调试，生产禁止）
raw = jwt.decode(token, options={"verify_signature": False})
```

PyJWT 把 `algorithms` 设计成必填，是有原因的。如果服务端原本用 RS256，攻击者把 header 改成 HS256，拿公开的 RSA 公钥当作 HMAC 密钥重新签名，服务端若照着 header 里的 `alg` 走就会直接放行——这就是算法混淆攻击。

## 六个高频安全坑

1. **把 JWT 当加密容器**。payload 是明文，要保密就别放进去。
2. **信任 header 里的 `alg`**。服务端必须自己维护算法白名单，`alg: none` 一律拒绝。
3. **不校验 `exp` / `nbf` / `aud`**。成熟库默认会验 `exp`，但自己手写 Base64 解析就全都丢了。
4. **`exp` 写成毫秒**。见上文，单位错了等于没有过期时间。
5. **密钥太弱或硬编码进前端**。前端 JS 里的 secret 等同于公开。
6. **以为能主动注销 JWT**。Token 签发后到过期前一直有效，服务端不查库就拦不住。要么把 `exp` 压到 15 分钟并配 refresh token，要么在服务端维护一个短期黑名单（只存"已登出且尚未过期"的 `jti`）。

## 自己动手试试

- [在线解析和调试 JWT](/jwt-parser)
- [解析并查看一个 JWT 里的内容](/jwt-parser)
