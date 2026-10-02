---
slug: yaml-json-toml-compare
title: YAML、JSON、TOML 配置文件怎么选
description: 从注释、类型系统、嵌套表达和可维护性四个维度对比三种配置格式，给出 YAML 的隐式类型坑、JSON 的适用边界和 TOML 的强项，以及具体的选型建议。
keywords: [YAML, JSON, TOML, 配置文件格式, 格式转换]
relatedTools:
  - /yaml-to-json-converter
  - /toml-to-json
---

# YAML、JSON、TOML 配置文件怎么选

这三种格式能表达的数据模型基本一致：键值对、嵌套表、数组。真正决定选型的是另外四件事——要不要注释、类型是否显式、手写频率有多高、以及生态里解析器认哪个。

## 一张表看清差异

| 维度 | JSON | YAML | TOML |
| --- | --- | --- | --- |
| 注释 | 不支持 | `#` | `#` |
| 类型 | 显式（`true`/`null`） | 隐式推断为主 | 显式，字符串必须加引号 |
| 嵌套 | 花括号 | 缩进 | `[section]` 表头 |
| 尾部逗号 | 不允许 | 不适用 | 不适用 |
| Tab 缩进 | 允许 | **禁止** | 不适用 |
| 多文档 | 不支持 | `---` 分隔 | 不支持 |
| 复用/锚点 | 无 | 锚点 `&` 与别名 `*` | 无 |
| 典型主场 | API、包管理、日志 | K8s、CI、docker-compose | Cargo、pyproject |

## 同一份配置的三种写法

```yaml
service: billing-api
port: 8080
debug: false
tags:
  - billing
  - prod
database:
  host: db.internal
  port: 5432
```

```json
{
  "service": "billing-api",
  "port": 8080,
  "debug": false,
  "tags": ["billing", "prod"],
  "database": { "host": "db.internal", "port": 5432 }
}
```

```toml
service = "billing-api"
port = 8080
debug = false
tags = ["billing", "prod"]

[database]
host = "db.internal"
port = 5432
```

TOML 的读法很直观：方括号前面的是顶层键，方括号后面缩进的都是这个表的成员。数组表用双方括号：

```toml
[[servers]]
name = "alpha"
ip = "10.0.0.1"

[[servers]]
name = "beta"
ip = "10.0.0.2"
```

## YAML 的三个真实坑

**隐式类型会把你以为的字符串变成别的东西。** 这是著名的"挪威问题"：在 YAML 1.1 的解析器里，`no`、`NO`、`off`、`on`、`yes` 会被当成布尔值。一份国家列表里写 `NO`（挪威）会被解析成 `false`。YAML 1.2 的核心模式收敛到了只有 `true`/`false`，但各语言解析器版本参差不齐。凡是可能被误读的值，一律加引号：`country: "NO"`。

**缩进是全部分层依据。** YAML 只允许空格缩进，Tab 会直接报错；同一个文件里混用不同层级的缩进也会报错。几百行的 YAML 里少一个空格，错误信息往往定位不到真正的那一行。

**锚点和别名很强大，但让文件难以静态审查。** 用 `&base` 定义、用 `*base` 引用，能消除重复配置，代价是读者必须自己在大脑里展开。团队协作时多数人更愿意接受重复。

## JSON 的边界在哪

JSON 的优势是**零歧义**：类型显式、无注释、无尾逗号，任何语言都有成熟解析器，序列化后就是可传输的数据。它的短板也正来自这些约束——配置需要说明"为什么这么写"时无处安放注释，人手写时忘删一个尾逗号就解析失败。

所以 JSON 的定位很清楚：**机器与机器之间交换用 JSON，人经常要改的文件不要强用 JSON**。需要说明的是，JSONC、JSON5 这些带注释的方言不是标准 JSON，标准 JSON 解析器读不了它们。

## TOML 的强项

TOML 是三者里最"像配置"的：类型显式（字符串必须加引号，数字和布尔一眼可辨）、层次用表头表达、读起来接近 INI 的升级版。它还有一个别的格式没有的细节——**日期时间是原生类型**：

```toml
release = 2024-05-20
deploy_at = 2024-05-20T15:30:00Z
```

不需要靠约定去区分"这是字符串还是时间"。这也是 Rust 的 `Cargo.toml`、Python 的 `pyproject.toml` 都选它的原因。

## 选型建议

| 场景 | 选 | 理由 |
| --- | --- | --- |
| API 请求/响应、数据落库、日志 | JSON | 机器生成机器读，生态最广 |
| Kubernetes、GitHub Actions、docker-compose | YAML | 生态规定，没有选择余地 |
| 手写的应用配置、多环境覆盖 | YAML 或 TOML | 要注释；人多手杂时 TOML 更不容易出错 |
| 语言生态的配置文件 | TOML | 跟 Cargo.toml / pyproject.toml 保持一致 |
| 需要严格校验 schema 的场合 | JSON | 配合 JSON Schema 工具链最完整 |

## 格式互转时注意什么

YAML 转 JSON 会丢掉注释、锚点别名和多文档分隔。这些是单向损失，转过去就回不来了。另外 YAML 里的非字符串标量（日期、布尔）在转成 JSON 时会被具体化成字符串或数字，转换结果需要人工核对一遍。

```python
import json, tomllib   # tomllib 自 Python 3.11 起进标准库，只支持读

with open('config.toml', 'rb') as f:      # 注意必须以二进制模式打开
    cfg = tomllib.load(f)

print(json.dumps(cfg, ensure_ascii=False, indent=2))
```

读 YAML 时请始终用 `yaml.safe_load()` 而不是 `yaml.load()`——后者在部分实现里会实例化任意 Python 对象，等于给配置文件开了代码执行的口子。

## 自己动手试试

- [把 YAML 转成 JSON 并核对结构](/yaml-to-json-converter)
- [把 TOML 转成 JSON](/toml-to-json)
