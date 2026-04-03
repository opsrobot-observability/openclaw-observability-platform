# OTel与日志采集：数据流水线架构 (Data Pipeline)

为了实现对运行环境的全面可观测性，系统需要跨平台、跨代码逻辑地捕获工具使用和状态变更记录。

OpenClaw 采用了基于 **OTel (OpenTelemetry)** 规范的设计思路，实现了一套低侵入性的日志接入流水线。

---

## 🛠️ 流水线整体设计

```text
┌─────────┐    ┌───────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│OpenClaw │───►│ Vector Pipeline   │───►│ Apache Doris    │◄───│    Frontend     │
│ Agent   │    │ (Data Collection  │    │ (Storage &      │    │ (Visualization) │
│ Logs    │    │  & Transformation)│    │  Analytics)     │    │   React / Vite  │
└─────────┘    └───────────────────┘    └─────────────────┘    └────────┬────────┘
                                                                        │
                                           ┌─────────────────┐          │
                                           │   Backend API   │◄─────────┘
                                           │   (Node.js)     │
                                           │   Port: 8787    │
                                           └─────────────────┘
```

该架构涉及以下重点流转环节：

### 1. 源头注入与导出 (Source & Logs Generation)
平台使用基于 KWeaver Core 建立的数字员工节点。在执行过程中，Agent 在每次 Prompt 发送、结果接收及环境 I/O 读取时，仅在宿主机本地生成结构化的日志文件（如 `.jsonl` 或 `session.json`），而无需主动发起网络日志请求。
这种设计将监控模块与核心业务代码解耦，确保日志采集系统的状态不会影响 agent 任务的正常执行。

### 2. 遥测过滤与数据转换 (Vector Transform)
对于本地产生的日志文件，系统采用超轻量的开源工具 `Vector` 作为数据采集和分发守护进程。根据 `vector.yaml` 的配置：
- **Source 读取**：实时监听指定目录下新增的日志数据。
- **Transform (Remap / Reduce)**：运用内置脚本解析深度嵌套的 JSON `payload`，提取核心字段，如 `.log_attributes` 和主键 `.session_id` 等索引标签。
- **数据清洗**：剔除无效的系统调试信息，减少网络传输与存储开销。

### 3. 数据高吞吐入库核心 (Apache Doris)
数据清洗完毕后，采用 `HTTP Sinks` 分批将格式化的 JSONL 数据写入 Doris OLAP 数据库：
- 依靠 `_stream_load` 协议的并发能力，实现高吞吐量的数据落库。
- 数据存储于 `agent_sessions_logs` 等明细表和索引表中，以供后续查询分析。

---

## 🔎 架构特性说明

此数据收集与处理架构具有以下特点：
1. **轻量与资源隔离**：Vector 进程的资源消耗极低，即使在承载大量并发 Agent 任务的宿主节点上也能平稳运行。
2. **高可扩展性**：面对海量日志增长，可通过横向扩展 Doris BE (Backend) 节点来提升系统的查询性能与存储吞吐量。
