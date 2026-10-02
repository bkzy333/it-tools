---
slug: sql-formatting-conventions
title: SQL 怎么写才好看：格式化与命名约定
description: 给出一份可直接落地的 SQL 排版规范（关键字大写、主子句顶格、JOIN 缩进、CTE 替代深层子查询）和数据库对象命名约定表，并说明哪些约定是审美、哪些会真正影响正确性和可维护性。
keywords: [SQL 格式化, SQL 命名规范, SQL 代码风格, CTE, sqlfluff]
relatedTools:
  - /sql-prettify
  - /sql-minifier
---

# SQL 怎么写才好看：格式化与命名约定

SQL 是少数"写完就交给别人读"的代码。一份查询在仓库里躺三年，中间被五个人改过，排版规范的价值就体现在那时——能不能三十秒内定位到 `WHERE` 里多加的那个条件。

## 先看一个改造前后

压缩版：

```sql
select o.id,o.created_at,u.name,sum(oi.amount) total from orders o join users u on u.id=o.user_id join order_items oi on oi.order_id=o.id where o.status='paid' and o.created_at>='2024-01-01' group by o.id,o.created_at,u.name having sum(oi.amount)>1000 order by total desc limit 20
```

排版后：

```sql
SELECT
    o.id,
    o.created_at,
    u.name,
    SUM(oi.amount) AS total
FROM orders AS o
JOIN users AS u
    ON u.id = o.user_id
JOIN order_items AS oi
    ON oi.order_id = o.id
WHERE o.status = 'paid'
    AND o.created_at >= '2024-01-01'
GROUP BY o.id, o.created_at, u.name
HAVING SUM(oi.amount) > 1000
ORDER BY total DESC
LIMIT 20;
```

内容一模一样，第二份能一眼看出：查了哪几张表、过滤条件是什么、聚合在哪个层级。

## 排版规则

| 规则 | 做法 | 理由 |
| --- | --- | --- |
| 关键字大写 | `SELECT`、`FROM`、`WHERE` | 一眼区分关键字和标识符 |
| 主子句顶格 | 每个主子句单独一行，不缩进 | 竖着扫就能看到查询骨架 |
| 选择列一行一个 | 缩进 4 空格 | 增删列时 diff 只有一行 |
| `ON` 缩进 | 比 `JOIN` 多缩进 2–4 空格 | 连接条件归属明确 |
| 逗号位置 | 前置或尾随，**全库统一** | 见下 |
| 别名写 `AS` | `orders AS o` | 省略 `AS` 时 `from a b` 容易看成两个表 |
| 语句以分号结尾 | `;` | 批量执行和脚本化时安全 |
| 缩进用空格 | 不用 Tab | 不同编辑器 Tab 宽度不一致 |

逗号前置还是尾随是个长期争论，两种都合理：

```sql
-- 尾随逗号（更常见）
    o.id,
    o.created_at,
    u.name

-- 前置逗号（注释掉最后一行不会语法错）
    o.id
    , o.created_at
    , u.name
```

前置逗号的好处是注释掉任意一行都不会破坏语法，适合经常手工改查询的分析场景。选一个，写进规范文档，然后用工具强制。

## 深层子查询用 CTE 拆开

嵌套三层以上的子查询是 SQL 可读性的头号杀手。用 `WITH` 把它摊平：

```sql
WITH paid_orders AS (
    SELECT id, user_id, created_at
    FROM orders
    WHERE status = 'paid'
      AND created_at >= '2024-01-01'
),
order_totals AS (
    SELECT order_id, SUM(amount) AS total
    FROM order_items
    GROUP BY order_id
)
SELECT
    po.id,
    po.created_at,
    u.name,
    ot.total
FROM paid_orders AS po
JOIN users AS u
    ON u.id = po.user_id
JOIN order_totals AS ot
    ON ot.order_id = po.id
WHERE ot.total > 1000
ORDER BY ot.total DESC
LIMIT 20;
```

每一段都能单独拿出来跑，调试时可以逐个 `SELECT * FROM paid_orders` 验证中间结果。需要递归查询树形结构时用 `WITH RECURSIVE`。

## 命名约定

| 对象 | 约定 | 示例 |
| --- | --- | --- |
| 表、列 | `snake_case` 全小写 | `order_items` |
| 表名 | 复数（或全库统一单数） | `users`、`orders` |
| 主键 | `id` | `id` |
| 外键 | `<单数表名>_id` | `user_id` |
| 关联表 | 两表名用下划线连接 | `order_items` |
| 布尔列 | `is_` / `has_` 前缀 | `is_paid`、`has_refund` |
| 时间列 | `created_at`、`updated_at` | 类型用 `timestamptz` |
| 金额 | 整数存最小单位，或用 `numeric` | `amount_cents` |
| 索引 | `idx_<表名>_<列名>` | `idx_orders_status` |
| 唯一约束 | `uq_<表名>_<列名>` | `uq_users_email` |

几条硬性要求：

- **不要用保留字做列名。** `order`、`user`、`desc`、`status`、`key`、`range` 在不同数据库里是保留字，用了就得到处加引号，而且引号风格（双引号 / 反引号 / 方括号）各库还不一样。
- **不要缩写。** `cust_addr` 省下的几个字符，远不值后来人猜错的成本。
- **列名不要重复表名。** `orders.order_id` 是好的，`orders.orders_id` 是冗余的。
- **时间列统一带时区。** PostgreSQL 用 `timestamptz`，MySQL 用 `DATETIME` 并约定存 UTC。

## 几条影响正确性而不只是审美的约定

1. **不要写 `SELECT *`。** 上游加一列，下游所有 `*` 查询的输出结构都变了，ORM 映射和报表会静默出错。只在临时排查时用。
2. **`JOIN` 必须写 `ON`。** 漏掉 `ON` 会变成笛卡尔积，数据量一大直接把库打满。宁可用显式 `CROSS JOIN` 表达"我就是要交叉"。
3. **`ORDER BY` 不要依赖隐式顺序。** 没有 `ORDER BY` 时返回顺序是未定义的，加了索引可能就变了。分页必须配 `ORDER BY`，且排序键要能唯一确定顺序（否则第二页可能重复第一页的行）。
4. **注释只写"为什么"。** `-- 排除已退款订单（财务口径要求）` 有用；`-- 查询订单` 是废话。行注释用 `--`，块注释用 `/* */`。

## 用工具固化，别靠自觉

格式约定只有被自动检查才有约束力。常用选择：

```bash
# sqlfluff：支持 PostgreSQL / MySQL / BigQuery 等多种方言，可 lint 也可 fix
pip install sqlfluff
sqlfluff lint --dialect postgres query.sql
sqlfluff fix  --dialect postgres query.sql
```

把它接进 pre-commit 和 CI，规范才不会在第三次赶工时崩掉。IDE 里一般也有内置的格式化（DataGrip、DBeaver、VS Code 的 SQL 插件），配成与 `sqlfluff` 一致的规则即可。

需要把 SQL 塞进日志或配置文件时再考虑压缩成一行，但仓库里始终保留格式化版本——压缩是不可逆的，注释会被一起去掉。

## 自己动手试试

- [把一段 SQL 格式化成易读的缩进排版](/sql-prettify)
- [把 SQL 压缩成单行（用于日志或配置）](/sql-minifier)
