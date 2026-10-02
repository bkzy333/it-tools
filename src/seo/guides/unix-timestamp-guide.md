---
slug: unix-timestamp-guide
title: Unix 时间戳完全指南：秒、毫秒、时区和各语言对照
description: Unix 时间戳是从 1970-01-01 UTC 起算的秒数且不含闰秒。这篇给出 JS/Python/Go/SQL 的互转写法、秒与毫秒的判别方法、2038 年问题与存储建议。
keywords: [Unix 时间戳, timestamp, 秒与毫秒, 时区转换, 2038 问题]
relatedTools:
  - /date-converter
  - /date-duration-calculator
---

# Unix 时间戳完全指南：秒、毫秒、时区和各语言对照

Unix 时间戳是从 1970-01-01 00:00:00 UTC 起算的**秒数**，不含闰秒。这一句里有两个容易被忽略的点：它是相对 UTC 定义的，和你所在时区无关；它计的是"日历秒"，闰秒不参与计数，所以不能拿两个时间戳之差去算物理时间。

## 秒还是毫秒：先看位数

这是日常最常遇到的坑。一眼判别的经验规则：

| 位数 | 单位 | 覆盖范围 | 常见来源 |
| --- | --- | --- | --- |
| 10 位 | 秒 | 约 2001-09-09 至 2286-11-20 | C、Go、Python、MySQL `UNIX_TIMESTAMP()` |
| 13 位 | 毫秒 | 同上，精度到毫秒 | JavaScript `Date.now()`、Java `System.currentTimeMillis()` |

`1700000000` 是秒，对应 2023-11-14 22:13:20 UTC；`1700000000000` 是毫秒，对应同一时刻。把毫秒当秒传给后端，会得到一个公元五万多年的日期；把秒当毫秒喂给 JS 的 `new Date()`，会得到 1970-01-20。

## 各语言互转对照

```js
const sec = Math.floor(Date.now() / 1000);   // 当前秒级时间戳
const ms  = Date.now();                      // 毫秒
new Date(sec * 1000).toISOString();          // '2023-11-14T22:13:20.000Z'
Date.parse('2023-11-14T22:13:20Z');          // 1700000000000（毫秒）
```

`new Date()` 只接受毫秒。另外 `Date.parse` 对不带时区的 `'2023-11-14 22:13:20'` 在不同引擎里可能按本地时区解释，写死 `Z` 或完整偏移量最安全。

```python
import datetime

now = int(datetime.datetime.now(datetime.timezone.utc).timestamp())  # 秒
datetime.datetime.fromtimestamp(1700000000, datetime.timezone.utc)
# datetime.datetime(2023, 11, 14, 22, 13, 20, tzinfo=datetime.timezone.utc)
```

Python 的 `fromtimestamp()` 不传第二个参数时会按**本地时区**解释，同一份代码在不同机器上结果不同，务必显式传 `tz`。

```go
now := time.Now().Unix()             // 秒
ms  := time.Now().UnixMilli()        // 毫秒（Go 1.17+）
t   := time.Unix(1700000000, 0).UTC()
fmt.Println(t.Format(time.RFC3339))  // 2023-11-14T22:13:20Z
```

```sql
-- MySQL
SELECT UNIX_TIMESTAMP();                      -- 当前秒
SELECT FROM_UNIXTIME(1700000000);             -- 按会话时区显示

-- PostgreSQL
SELECT extract(epoch FROM now())::bigint;
SELECT to_timestamp(1700000000) AT TIME ZONE 'UTC';

-- SQLite
SELECT strftime('%s', 'now');
SELECT datetime(1700000000, 'unixepoch');     -- 结果恒为 UTC
```

## 2038 年问题

32 位有符号整数能表示的最大秒数是 `2147483647`，对应 2038-01-19 03:14:07 UTC，再加一秒就溢出成负数（回到 1901 年）。受影响的是把时间戳存成 32 位 `INT` 的老系统和老嵌入式设备。

MySQL 的 `TIMESTAMP` 类型上限就是 2038-01-19，要存更远的日期必须改用 `DATETIME`。PostgreSQL 的 `timestamptz`、SQLite、以及所有用 64 位整数的语言都没有这个问题。

## 存储该用整数还是日期类型

优先用数据库原生的带时区类型（PostgreSQL 的 `timestamptz`、MySQL 的 `DATETIME`）。理由是：直接可读、能直接用日期函数做按月聚合、不会被误读单位。只有在跨系统交换时（API 响应、日志行）才用整数时间戳，并且**在字段名里写清单位**，例如 `created_at_ms`。

如果一定要存整数，用 `BIGINT` 而不是 `INT`。

## 展示时怎么处理时区

时间戳本身没有时区，时区只在"渲染成人类可读形式"和"按自然日聚合"时才出现。规则：

1. 传输和存储统一用 UTC。
2. 只在渲染层转成本地时区，转换逻辑集中在前端或视图层。
3. 遇到"按自然日统计"这类业务语义，必须先确定按哪个时区切分——同一批数据按 UTC 切和按 `Asia/Shanghai` 切，日活数字会不一样。
4. 输出给机器时优先用 RFC 3339 带偏移量的字符串（`2023-11-14T22:13:20+08:00`），比裸数字更不容易被误读。

## 时间戳不能直接做日期加减

"加一天"不等于"加 86400 秒"。夏令时切换的那天只有 23 小时或 25 小时，中国没有夏令时，但你的用户可能在美国或欧洲。正确做法是用库提供的日期运算：Python 的 `timedelta`、Go 的 `AddDate(0, 0, 1)`、JS 里先转 `Date` 再用 `setDate()`，或者交给数据库的 `DATE_ADD` / `INTERVAL '1 day'`。

## 秒、毫秒、微秒、纳秒别搞混

各语言和系统的默认单位不一样，混一次就是十亿倍的误差：

| 单位 | 1 秒 = | 常见来源 |
| --- | --- | --- |
| 秒 | 1 | Go `Unix()`、C `time()`、MySQL `UNIX_TIMESTAMP()` |
| 毫秒 | 10³ | JS `Date.now()`、Java `currentTimeMillis()` |
| 微秒 | 10⁶ | Python `datetime` 的内部精度、MySQL `DATETIME(6)` |
| 纳秒 | 10⁹ | Go `time.Time` 的内部精度、Linux `CLOCK_MONOTONIC` |

跨服务传值时最有效的做法，是**把单位写进字段名**（`expires_at_ms`、`created_at_us`），比在接口文档里补一句"单位是毫秒"可靠得多——文档会过时，字段名不会。

## 浮点时间戳有精度坑

Python 的 `time.time()` 和 `datetime.timestamp()` 返回浮点数。时间戳到 1.7e9 量级时，float64 能表示的最小间隔大约是 0.2 微秒，再往下的位数不可信。所以不要用浮点时间戳做相等判断，也不要依赖它的小数末位；需要精确比较就用整数秒或 `datetime` 对象。

## 查时间范围时别用函数包住列

这是性能问题不是正确性问题，但在大表上差别巨大：

```sql
-- 不推荐：对索引列做运算，索引失效
SELECT * FROM orders WHERE FROM_UNIXTIME(created_at) >= '2024-01-01';

-- 推荐：把运算放到常量一侧，索引可用
SELECT * FROM orders WHERE created_at >= UNIX_TIMESTAMP('2024-01-01');
```

规则是**让索引列保持裸露，把转换放在常量那一侧**。PostgreSQL 里同理：写 `created_at >= to_timestamp(1700000000)`，而不是对列做 `extract(epoch FROM created_at) >= 1700000000`。

## 自己动手试试

- [时间戳与日期互转、切换时区查看](/date-converter)
- [计算两个时间点之间隔了多久](/date-duration-calculator)
