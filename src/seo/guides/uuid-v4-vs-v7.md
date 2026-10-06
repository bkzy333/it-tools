---
slug: uuid-v4-vs-v7
title: UUID v4 和 v7 该选哪个做数据库主键
description: 从 RFC 9562 定义的位布局讲起，说明 UUIDv7 的时间前缀为什么能改善 B 树索引的写入局部性，以及它带来的时间泄露代价，并给出 PostgreSQL 18 与 MySQL 的具体落地写法。
keywords: [UUID v4, UUID v7, 数据库主键, RFC 9562, 索引局部性]
relatedTools:
  - /uuid-generator
  - /token-generator
---

# UUID v4 和 v7 该选哪个做数据库主键

RFC 9562（2024 年 5 月发布，取代 RFC 4122）新增了 UUID v6、v7、v8。对做数据库主键这件事来说，v7 是第一个"为数据库设计"的标准 UUID 版本。

## 两者的位布局

UUID 一共 128 位，其中版本位（4 位）和变体位（2 位）是固定的，剩下 122 位是可变的。

**v4**：122 位全部来自随机数。

```text
xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
                ^    ^
             版本 4  变体位（值为 8/9/a/b 之一）
```

**v7**：前 48 位是**毫秒级 Unix 时间戳（大端序）**，紧接着 4 位版本号 `0111`（十六进制就是 `7`），然后 12 位 `rand_a`，2 位变体，最后 62 位 `rand_b`。

```text
tttttttt-tttt-7aaa-ybbb-bbbbbbbbbbbb
└── 48 位毫秒时间戳 ──┘
```

看出来了吗：时间戳放在**最高位**，所以 UUIDv7 的字符串排序顺序就等于生成时间顺序。这是它和 v4 唯一但决定性的区别。

## 为什么这对主键很重要

数据库的主键通常是 B 树索引。B 树在"新数据总是插在最右边"时效率最高——叶子页连续写入、缓存命中率高、几乎不发生页分裂。

| 主键类型 | 插入位置 | 后果 |
| --- | --- | --- |
| 自增 BIGINT | 总在最右 | 最省，但暴露总量、无法跨库生成 |
| UUIDv4 | 树上随机位置 | 页分裂频繁、索引膨胀、缓存命中下降 |
| UUIDv7 | 近似最右 | 接近自增的写入特性，又能本地生成 |

v4 的问题不在"UUID 太大"，而在"随机"。每条新记录都落在索引树的随机位置，写放大明显，索引体积也会比顺序写入时大。v7 把随机性挪到了低位，高位保持单调，于是新记录总是追加到索引尾部附近。

## 代价：时间泄露

v7 的前 48 位就是生成时间的毫秒值，任何人拿到 ID 都能反推出记录是什么时候创建的。这在两类场景里是问题：

1. **ID 对外暴露且不希望泄露创建时间**（订单号、用户编号可能被竞品统计）。
2. **ID 被当作不可预测的凭据**——这不是 v7 的问题，是所有 UUID 都要注意的：UUID 规范本身不保证实现使用密码学安全的随机数发生器。会话令牌、密码重置链接应该使用专门的 CSPRNG 生成随机串，而不是依赖某个 UUID 库的实现细节。

## 落地写法

PostgreSQL 从 18 版本起内置了 `uuidv7()`，同时给原来的 `gen_random_uuid()` 加了 `uuidv4()` 别名：

```sql
CREATE TABLE orders (
  id         uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id    bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 直接从 ID 反查生成时间
SELECT uuid_extract_timestamp(id), uuid_extract_version(id) FROM orders LIMIT 5;
```

PostgreSQL 的实现把 12 位 `rand_a` 用作亚毫秒时间戳，因此同一进程内生成的值是严格递增的——即使系统时钟回拨也不会乱序。这对按 ID 做游标分页很有用。

MySQL 没有原生 UUIDv7，但有 `UUID_TO_BIN` 的第二个参数可以把 UUID 的时间相关字节提到前面，让索引写入变得顺序：

```sql
CREATE TABLE orders (
  id BINARY(16) PRIMARY KEY DEFAULT (UUID_TO_BIN(UUID(), 1)),
  user_id BIGINT NOT NULL
);
```

注意这里的 `UUID()` 生成的是 v1 而不是 v7，参数 `1` 只负责交换时间字节的位置。另外 `BINARY(16)` 比 `CHAR(36)` 省一半以上空间，索引也小得多——这一条对 v4 同样适用。

## 应用层生成

如果要在应用里生成 v7（比如需要在插入前就知道 ID），核心逻辑就十几行：

```js
function uuidv7() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);              // 先填满随机位
  const ms = Date.now();
  b[0] = Math.floor(ms / 2 ** 40) & 0xff; // 写入 48 位毫秒时间戳（大端）
  b[1] = Math.floor(ms / 2 ** 32) & 0xff;
  b[2] = Math.floor(ms / 2 ** 24) & 0xff;
  b[3] = Math.floor(ms / 2 ** 16) & 0xff;
  b[4] = Math.floor(ms / 2 ** 8) & 0xff;
  b[5] = ms & 0xff;
  b[6] = (b[6] & 0x0f) | 0x70;            // 版本 7
  b[8] = (b[8] & 0x3f) | 0x80;            // 变体 10
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
```

生产环境建议直接用成熟库，自己实现容易忽略"同一毫秒内单调"这个细节。

## 怎么选

| 需求 | 推荐 |
| --- | --- |
| 高并发写入的主键，希望索引小、写入稳 | UUIDv7 |
| 需要按创建时间排序或做游标分页 | UUIDv7 |
| ID 对外暴露且在意时间泄露 | UUIDv4 |
| 需要跨库合并、客户端生成 ID | 两者皆可，v7 更利于后续合并 |
| 数据量小、写入量低 | 差别不明显，v4 也够 |

一句话总结：**默认用 v7，除非你有明确理由不想让 ID 带上时间信息**。

## 已经有 v4 主键了要不要迁移

先判断值不值。迁移只在三个信号同时出现时才划算：单表行数在千万级以上、写入 QPS 高、并且已经观察到索引膨胀或写入延迟上升。小表迁移的收益通常看不出来。

可以走的三条路线：

1. **新表用 v7，老表不动**。最简单，也是多数项目的实际选择。
2. **双写过渡**。加一列新 ID，写入时同时生成 v7，读路径逐步切换，最后把主键换过去。改造量最大。
3. **只改默认值**。把 `DEFAULT gen_random_uuid()` 换成 `DEFAULT uuidv7()`，存量数据一行不动。这样从今往后的插入都落在索引尾部，历史数据仍然是随机分布的。

第三条的性价比最高：不需要停机，不改外键值，写入局部性立刻改善。

## ULID 和 UUIDv7 什么关系

ULID 是 UUIDv7 出现之前社区给出的同类方案：同样是 48 位毫秒时间戳在前、随机位在后，但它把 128 位用 Crockford Base32 编码成 **26 个字符**，比 UUID 的 36 字符短，而且大小写无关、字典序即时间序。

它的短板是**不是 IETF 标准**，各语言实现质量参差，也没有数据库原生类型支持（PostgreSQL 里要存成 `text` 或自己转 `bytea`）。

新项目如果数据库支持（比如 PostgreSQL 18 的 `uuidv7()`），优先选 UUIDv7；如果需要更短的字符串表示、或者数据库没有原生 UUID 类型，ULID 仍然是个务实的选择。

## 自己动手试试

- [在线生成 UUID（含 v4 / v7）](/uuid-generator)
- [在线生成 UUID](/uuid-generator)
