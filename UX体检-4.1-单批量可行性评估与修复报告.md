# 4.1 真批量半成品 — 单/批量可行性评估与修复报告

- 日期：2026-10-11
- 仓库：`gjxtools` 分支 `chore/all-my-stuffs`（it-tools 克隆）
- 范围：4.1 节列出的 22 个「真批量半成品」工具
- 目标：让结果支持「单条/批量转换 + 一键复制全部 + 单条导出 TXT + 批量导出 Excel」

---

## 一、核心设计决策（先说结论，避免误改）

1. **不做「单 / 批量」模式切换开关。**
   这批工具几乎都是「多行文本输入框 → 多行结果」的形态：输 1 行就是单条，输多行就是批量。
   强行加一个模式开关反而增加认知负荷，违背 it-tools 的极简原则。单/批量由用户输入行数天然决定。

2. **「导出 Excel」= CSV + UTF-8 BOM，不是真 .xlsx。**
   - 仓库 `package.json` 虽声明了 `xlsx`，但本地并未真正安装，全站也无任何工具实际使用它。
   - 为保持**零新增依赖、零构建风险**，复用 `rmb-numbers` 已验证的成熟做法：导出带 BOM 的 CSV，
     Excel 原生可打开、中文不乱码，按钮文案写「导出 Excel」贴合用户心智。
   - 两列场景（A 列输入 / B 列输出）CSV 天然就是它；表格类工具（table-transpose / markdown-table）按真实单元格拆列导出。

3. **统一组件 `CopyExportBar`，全站结果区右下角标配三连：复制全部 / 导出 TXT / 导出 Excel。**
   彻底消除之前「有的只有复制、有的只有下载、有的下载还没 BOM」的乱象。

---

## 二、评估结论：22 个工具 × 是否适配单/批量模式

### ✅ 适配组（13 个）— 已全部接入 `CopyExportBar`

| 工具 | 单/批量 | 复制全部 | 导出 TXT | 导出 Excel | 备注 |
|---|---|---|---|---|---|
| text-format（文本处理） | 天然支持 | ✅ | ✅ | ✅ 单列 | 上一轮已完成 |
| text-join（文本拼接） | 天然支持 | ✅ | ✅ | ✅ 单列 | 上一轮已完成 |
| text-workflow（文本流水线） | 天然支持 | ✅ | ✅ | ✅ 单列 | 上一轮已完成 |
| case-converter（大小写转换） | 天然支持 | ✅ | ✅ | ✅ 多列（输入+各格式） | 上一轮已完成 |
| table-lookup（表格查找） | 天然支持 | ✅ | ✅ | ✅ 多列（查找/合并） | 上一轮已完成 |
| regex-tester（正则测试） | 天然支持 | ✅ | ✅ | ✅ 多列（序号/匹配/起止） | 上一轮已完成，另保留逐条复制按钮 |
| chinese-pinyin-converter（拼音） | 天然支持 | ✅ | ✅ | ✅ 单列 | 上一轮已完成 |
| number-rounding（数值舍入） | 天然支持 | ✅ | ✅ | ✅ 单列 | **本轮**：结果卡 + 格式卡三子工具全接 |
| table-transpose（表格转换） | 天然支持 | ✅ | ✅ | ✅ **按分隔符拆多列**（flatten/merge 退化为单列） | **本轮** |
| markdown-table-generator（MD 表格） | 单表 | ✅ | ✅ | ✅ **表头+各行多列** | **本轮** |
| token-generator（令牌生成） | 批量生成 | ✅ | ✅ | ✅ 单列 | **本轮** |
| uuid-generator（UUID 生成） | 批量生成 | ✅ | ✅ | ✅ 单列 | **本轮** |
| random-picker（随机抽签·4 玩法） | 批量生成 | ✅ | ✅ | ✅ 单列 | **本轮**：4 个 tab 各自接 `CopyExportBar` |

> 说明：生成器类（token/uuid/random-picker）虽然本质是「一次生成 N 个」，但其结果也是 N 行文本，
> 同样满足「一键复制全部 + 导出 TXT + 导出 Excel(CSV)」，因此归入适配组。

### ⛔ 豁免组（9 个）— 不适合「单/批量 + CSV-Excel」模式，强行改会伤害 UX

| 工具 | 类型 | 豁免原因 | 应如何处理 |
|---|---|---|---|
| crontab-generator | 单表达式解释器 | 输入是**单条** cron 表达式，输出是人类可读描述 + 未来 5 次执行时间，没有「批量」概念 | 保持现状；如需可加一个「复制执行时间」按钮（小增强，非必须） |
| date-duration-calculator | 单值计算 | 两个日期 → **一个**时长值，不是文本批处理 | 保持现状（结果已是单值展示） |
| api-tester | 交互式 HTTP 客户端 | 结果是**单个**响应体，且为交互调试场景，CSV-Excel 无意义 | 保持现状（已有响应体复制） |
| barcode-generator | 图片输出 | 输入文本 → **条码图片**，结果不是文本 | 保持图片导出（PNG/SVG），不属于 CSV 范畴 |
| qr-code-generator | 图片输出 | 输入文本 → **二维码图片**，同上 | 保持图片导出 |
| yaml-viewer | 原生格式 | 输出是 **YAML**（或格式化后文本），应以 .yml 导出而非 CSV | 保持原生格式导出，不做 CSV 折算 |
| xml-formatter | 原生格式 | 输出是 **XML**，应以 .xml 导出 | 保持原生格式导出 |
| csv-to-json | 原生格式 | 输出是 **JSON**，应以 .json 导出 | 保持原生格式导出 |
| list-converter | 原生格式 | 在多种列表格式间互转，应以**对应格式**导出 | 保持对应格式导出 |

> 这 9 个的共性是：结果要么是**图片**、要么是**单值**、要么是**原生格式文本**。
> 对它们套用「导出 Excel(CSV)」既不符合用户心智，也破坏各自已有的导出方式，因此判定为豁免，不做改造。

---

## 三、本轮代码改动清单

### 基础设施（2 个，新增）
- `src/composable/export.ts` — 统一下载出口：`downloadTextFile`（TXT）、`downloadCsvFile`（CSV + BOM，自动转义逗号/引号/换行）。
- `src/components/CopyExportBar.vue` — 统一结果操作条：复制全部 / 导出 TXT / 导出 Excel 三连。

### 适配组工具（13 个 .vue）
- **上一轮已改（7）**：text-format、text-join、text-workflow、case-converter、table-lookup、regex-tester、chinese-pinyin-converter
- **本轮新改（6）**：
  - `number-rounding` — 去掉自写的 `copyResult/downloadResult/copyFmt/canCopy`，结果卡与格式卡三个子工具统一接 `CopyExportBar`
  - `table-transpose` — 同上；新增 `exportRows`（按分隔符拆多列，flatten/merge 退化为单列）
  - `markdown-table-generator` — 用只读 `n-input` 取代 `TextareaCopyable` 展示，下方加 `CopyExportBar`（`exportRows = [表头, ...各行]`）
  - `token-generator` — 去掉 `useCopy`，接 `CopyExportBar`
  - `uuid-generator` — 同上
  - `random-picker` — 4 个 tab（随机令牌/抽签/加权抽样/权重分摊）各接 `CopyExportBar`，去掉 4 处 `useCopy`

### 公共收益
- 全站移除散落的 `new Blob(...).click()` + `URL.revokeObjectURL` 手写下载逻辑，收敛到 `export.ts`，从根本上消除「能复制却不能导出」「导出中文乱码」两类问题。

---

## 四、验证结果

| 检查项 | 命令 | 结果 |
|---|---|---|
| Lint（项目级） | `oxlint.cmd src` | exit 0；全项目 374 条为历史既有样式规则，**本次 13 文件零新增错误** |
| 类型检查 | `vue-tsc --noEmit -p tsconfig.app.json` | 全项目 **0 错误**（exit 0） |
| 生产构建 | `vite build` | ✓ built in 1m34s，exit 0 |
| 单文件 Lint 抽检 | `oxlint` 仅对 13 个工具目录 | 仅命中 table-lookup 的 pre-existing `curly`/`no-base-to-string` 既有告警，非本次引入 |

> 说明：上一轮提到的 `UX契约体检报告-2026-10-10.md` 与本轮计划中的 `ux-check.mjs` / `ux-exempt.json` 在本地工作区未找到实体文件，
> 故本轮以「已确立的 22 工具分类」为依据推进，并以 **oxlint + vue-tsc + vite build** 三道真实构建闸门替代静态检查器做验收。

---

## 五、构建产物清理清单（A / B / C / D）

| 分类 | 文件 / 目录 | 说明 | 处理 |
|---|---|---|---|
| **A**（gitignored，可删 / 重生成无风险） | `dist/`、`stats.html`、`build.log` | 本次构建产出，均已在 `.gitignore` 中 | 可随时删；重跑 `vite build` 即重建 |
| **B**（留档备份目录，确认线上无误后删） | `dist-*`、`dist-stale-*/` | 以往「改名留档」的旧产物目录 | 本次未生成 |
| **C**（待确认，未清理） | — | — | 无 |
| **D**（保留，本次源码改动，勿动） | 13 个改动的 `.vue` + 2 个新增基础设施文件 | 即上文第三节所列 | **禁止删除** |

---

## 六、后续建议（ROI 排序）

1. **（高 ROI，已落地）** 13 个适配组接 `CopyExportBar`，统一体验、消除乱码 —— 完成。
2. **（中 ROI，可选）** 为 `crontab-generator` 的执行时间区加一个「复制」按钮（纯增强，不影响批量模式）。
3. **（低 ROI，不建议）** 豁免组 9 个维持现状；若日后确实要「导出 Excel」，请按各自原生格式（图片/yml/xml/json）做，不要套 CSV。
4. **（运维）** 用户自跑 `git -c http.sslBackend=openssl push origin chore/all-my-stuffs`；AI 侧已完成构建与扫描，A 类产物可清理。
