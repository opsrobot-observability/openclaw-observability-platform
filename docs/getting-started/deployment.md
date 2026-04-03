# 部署架构与数据接入 (Deployment & Architecture)

在 AI Agent（数字员工）的应用场景中，日志生成量大且格式多变。为了保障业务系统的性能并实现对模型请求的观测，OpenClaw Observability Platform 采用了基于无侵入异步采集的架构方案。

通过整合 `Vector` 和 `Apache Doris`，平台提供了一套高吞吐量的日志采集与分析链路。

---

## 📐 基础拓扑图

以下为各组件之间的通信流向及逻辑架构：

```text
[ AI Agent 环境 / 服务器节点 ]
       |
       | -- 生成 .jsonl 日志文件 (包含 Token/Tools/Message 等负载数据)
       v
[ Vector 数据采集代理 (守护进程) ]
       |
       | -- 实时解析 JSON 数据并格式化
       | -- 异步路由至远端数据仓库
       v
[ Apache Doris (OLAP 数据库集群) ]
       |
       | -- 高速并行写入与存储
       | -- 支持大规模结构化日志的多维聚合分析
       v
[ OpenClaw 后端服务 (Node.js API) ]
       |
       | -- 封装 MySQL 通信协议，处理业务查询与缓存
       v
[ OpenClaw 前端应用 (Vite + React) ]
       | -- 接收数据并完成监控看板与统计图表的渲染
```

---

## 🚀 日志流水线配置指引 (Vector 设置)

如需将生产环境的 Agent 日志接入观测平台，建议使用轻量级代理服务 [Vector](https://vector.dev/)。

### 1. 配置 Vector 监控数据源 (Source)

在 Agent 运行的节点部署 Vector 客户端，并配置 `vector.yaml` 指定日志目录：

```yaml
sources:
  my_agent_logs:
    type: "file"
    # 指定数字员工运行产生的 JSONL 日志路径
    include:
      - "/var/log/my-ai-agents/**/*.jsonl" # 会话日志
      - "/var/log/my-audit-records/*.log"  # 审计相关日志
    read_from: "beginning"                   
```

> **[!TIP] 目录隔离与过滤**
> 建议在业务端规范日志输出目录（如限定 `/sessions/*.jsonl`），以便 Vector 更高效地过滤并排除无效历史数据。

### 2. 配置数据入库目标 (Sink)

完成数据格式转换（如提取 `timestamp`, `session_id`, `tool_call` 等字段）后，需通过 Vector 将日志投递至 Apache Doris 中的对应数据表（如 `agent_sessions_logs`）。推荐使用 Doris 的 `HTTP Stream Load` 接口以支持高并发的批量写入。

```yaml
sinks:
  doris_sink:
    type: "http"
    inputs: ["my_agent_transforms"]
    uri: "http://<DORIS_HOST>:8040/api/opsRobot/agent_sessions_logs/_stream_load"
    
    # [!IMPORTANT]
    # 请确保开启 json 格式声明，以保障字段可以正确映射进入 Doris 表。
    request:
      headers:
        Expect: "100-continue"
        format: "json"
        strip_outer_array: "true"
        read_json_by_line: "true"
```

### 3. 多租户数据隔离与标签

面对多部门或多业务线的场景，平台支持前端基于自定义标签（如 `agent_name`, `group_id`, `origin_account_id`）进行数据过滤。业务系统在输出 JSONL 时只需将这些维度信息写入 `context` 对象即可，Doris 将完整记录这些元数据。

通过此类标签，系统管理员可以在 OpenClaw 中的成本与审计模块内，精准实现跨租户、跨部门的精细化统计与分析。
