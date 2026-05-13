---
name: Doris 数据模型文档生成
description: 当用户要生成或更新 Doris 表的数据模型 Markdown（三一级标题：数据摘要、数据表列、JSON扩展字段）、从 Doris 拉取元数据与至少 100 行样本，并由脚本或 `--llm` 补全说明时启用。
---

# Doris 数据模型文档自动生成

## 前置条件

- 仓库根目录存在 `.env`，且可配置 `DORIS_HOST`、`DORIS_PORT`、`DORIS_USER`、`DORIS_PASSWORD`；默认库见 `getCronDatabaseName()` / `getLogTablesDatabaseName()`（`--log-database`）。
- 本机网络可连 Doris；已安装 Node（与项目一致）。
- 依赖：使用项目已有 `mysql2`，无需额外 `npm install`。

## 表列 · 字段说明规则（重要）

1. **数据库有 COMMENT**：`SHOW FULL COLUMNS` 中的注释必须**原样写入**「说明」列，脚本不覆盖、不臆造。
2. **数据库无 COMMENT**：**由 Cursor Agent（大模型）**结合本仓库代码（如 `backend/`、`frontend/lib/sessionAudit.js`）、**类型**与 **样例** 列，将「说明」补成准确业务描述（可整表重写该列，保持表格其它列不变）。
3. **Node 脚本角色**（离线/CI 友好）：
   - 默认 **`--description-source=hybrid`**：无 COMMENT 时，脚本用**列名语义推断**（高频表如 `agent_sessions` 有精确映射，其余由下划线词表组合中文）填「说明」；Agent 仍可在交付前按业务再润色。
   - **`--description-source=db-only`**：无 COMMENT 时「说明」固定为 **`—`**，不写入启发式；适合「先出结构 + 样例，再全交给 Agent 写说明」的流程。

推荐工作流：先 `node scripts/generate-doris-datamodel-md.mjs …`（`hybrid` 或 `db-only`）→ 在 Cursor 里 @ 生成的 md + 相关源码 → 请 Agent **仅优化「说明」列**（有 COMMENT 的列勿改）。

## 自然语言 → 命令

| 意图 | 命令示例（均在仓库根执行） |
|------|---------------------------|
| 只生成一张表 | `node scripts/generate-doris-datamodel-md.mjs --table=cron_runs` 或 `node scripts/generate-doris-datamodel-md.mjs cron_runs` |
| 多张表 | `node scripts/generate-doris-datamodel-md.mjs --tables=cron_jobs,cron_runs` |
| 当前库全部表 | `node scripts/generate-doris-datamodel-md.mjs --all-tables` |
| 按表名前缀筛选 | `node scripts/generate-doris-datamodel-md.mjs --all-tables --prefix=cron_` |
| 指定库名 | `node scripts/generate-doris-datamodel-md.mjs --database=opsRobot --table=foo` |
| `agent_sessions`（日志库） | `node scripts/generate-doris-datamodel-md.mjs --log-database --table=agent_sessions --force` |
| 提高采样上限（内置至少 **100** 行，与 `--sample-rows` 取较大值） | `node scripts/generate-doris-datamodel-md.mjs --table=cron_runs --sample-rows=200 --force` |
| 仅表结构、不拉数据 | `node scripts/generate-doris-datamodel-md.mjs --table=foo --no-json-sample` |
| 说明列仅库注释 / 其余留「—」给 Agent | `node scripts/generate-doris-datamodel-md.mjs --table=foo --description-source=db-only --force` |
| 只打印不写盘（校对版式） | `node scripts/generate-doris-datamodel-md.mjs --table=cron_runs --print` 或 `--dry-run` |
| 覆盖已有文件 | 加上 `--force` |
| **大模型一键补概要 + 表列说明 + JSON 平铺说明** | `node scripts/generate-doris-datamodel-md.mjs --table=agent_sessions --llm --force`（需 API Key，见下） |
| 自定义 bundle 输出目录 | 同上并加 `--llm-bundle-dir=D:\\tmp\\bundles` |

### `--llm` 模式（OpenAI 兼容 Chat Completions）

1. **采样**：整表一次 `SELECT` 至少 **max(100, --sample-rows)** 行（封顶 **500**）；JSON/VARIANT 列的路径汇总**从同一批行**中抽取该列值，不再为每列单独查库。
2. **Bundle**：默认写入 `data/datamodel-llm/<表名>.bundle.json`（含列元数据、截断后的行快照、各 JSON 列的路径与类型样例）。目录已在仓库 `.gitignore` 中忽略，**勿将含真实数据的 bundle 提交到 git**。
3. **环境变量**（任选其一 Key；Base URL / Model 可选）：
   - `DORIS_DATAMODEL_OPENAI_API_KEY` 或 `OPENAI_API_KEY`
   - `DORIS_DATAMODEL_OPENAI_BASE_URL`（默认 `https://api.openai.com/v1`，可指向其它兼容网关）
   - `DORIS_DATAMODEL_OPENAI_MODEL`（默认 `gpt-4o-mini`）
4. **写入 Markdown 的规则**（与脚本 `layout: datamodel-v2` 一致）：
   - **`# 数据摘要`**：脚本写入「数据库、数据表、原始来源、原始路径、用途定位」列表；`--llm` 且返回 `overview` 时，在列表后追加「基于样本的模型补充摘要」段落。
   - **`# 数据表列`**：**Doris COMMENT 始终优先**写入「字段说明」；无 COMMENT 时用模型 `columns[列名]`；仍无则按 `--description-source`（hybrid / db-only）。
   - **`# JSON扩展字段`**：每个 VARIANT/JSON 列下 **`## <列名>`** 平铺路径表；**优先**模型 `jsonFlat`（禁止占位套话）；缺省用 `describeJsonPath`。
5. **无 API Key**：仍会生成 md（摘要列表与启发式说明照常；无模型补充），stderr 提示可仅用 bundle 再手工合并。

## 执行步骤

1. 确认 `.env` 中 Doris 变量已填且可连通。
2. 在仓库根运行上表对应命令（按需加 `--description-source=db-only`）。
3. 默认输出路径：`docs/datamodel/<表名>.md`（每张表一个文件）。若未加 `--force` 且文件已存在，脚本会跳过并提示。
4. **脚本输出结构（`layout: datamodel-v2`）**：首行 HTML 注释；至少拉取 **max(100, --sample-rows)** 行（封顶 500）用于摘要推断与表列样例；`--no-json-sample` 仅省略「JSON扩展字段」整节中的平铺表（摘要与表列仍生成）。
   - **`# 数据摘要`**：`- **数据库**`、`- **数据表**`、`- **原始来源**`（由 `origin_provider` / `origin_label` 等样本聚合）、`- **原始路径**`（`source_path` 或 `log_attributes.sessionFile` 等）、`- **用途定位**`（脚本内置表级说明）。
   - **`# 数据表列`**：表头 **`| 字段名称 | 字段类型 | 字段说明 | 字段示例 |`**；类型为 `ddlLike`；样例至多 2 个去重片段。
   - **`# JSON扩展字段`**：每个 JSON/VARIANT 列一块：`<!-- DATAMODEL_JSON_FLAT:列名_START -->`、二级标题 **`## <列名>`**、四列表（字段名 \| 字段类型 \| 说明 \| 样例（截断））。无此类列时本节仅一段说明引用。
   - **说明列与 `--llm`**：无 Key 时为启发式；需要数据驱动说明时加 `--llm` 并配置 API Key。

## 版式校验（与 `scripts/generate-doris-datamodel-md.mjs` 输出一致）

1. **首行**：`<!-- generated: ... · layout: datamodel-v2 -->`。
2. **一级标题顺序**：`# 数据摘要` → `# 数据表列` → `# JSON扩展字段`（无 JSON 类列时第三节仍保留并说明「无…需平铺」）。
3. **数据摘要**：上述五个加粗列表项齐全；可选模型补充段落在列表后。
4. **数据表列**：表头为「字段名称、字段类型、字段说明、字段示例」四列及对应分隔行。
5. **JSON扩展字段**：每个列块含 HTML 锚点、`## <列名>`、四列表；路径列反引号包裹。

历史稿若仍为 `# 数据概要` + `# 数据字段` + `## 表列`（[example.md](docs/datamodel/example.md)），与当前脚本 v2 不同；以脚本生成为准或手工对齐团队约定。

## 边界与注意

- 库名、表名仅允许 `[a-zA-Z0-9_]`，防止标识符注入。
- 无权限访问的库/表会在查询阶段报错，需检查账号授权。
- 空表仍可有结构（仅表头）；有数据时至少拉取 **max(100, --sample-rows)** 行（封顶 500），不写全表扫描。
- 与 `scripts/extract-otel-doris-schema.mjs` 不同：本脚本专门服务 `docs/datamodel/` 版式，不替换旧脚本。

## 帮助

```bash
node scripts/generate-doris-datamodel-md.mjs --help
```
