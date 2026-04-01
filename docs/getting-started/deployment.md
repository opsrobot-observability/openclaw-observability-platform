# 部署架构与上报机制 (Deployment & Architecture)

在企业级的 AI Agent（数字化员工）实战中，监控日志的产生不仅多变，而且体量庞大。为了实现对 Agent 输出延迟的“零影响”外加系统极速响应的大模型洞察，OpenClaw Observability Platform 不使用可能污染业务代码本身的方法，而是构建了一条基于**无侵入异步打桩采集**的健壮组合。

通过整合 `Vector` 和 `Apache Doris`，我们可以完成一套工业级高吞吐量的日志接入水管。

---

## 📐 逻辑基础拓扑图

了解各个系统之间的组合方式和通信方向是正确部署平台的第一步。

```text
[ AI Agent 环境 / 线上服务器 ]
       |
       | -- 生成 .jsonl 日志文件 (包含 Token/Tools/Message 等 payload 载体)
       v
[ Vector 日志拉取层 (Daemon 守护进程) ]
       |
       | -- 实时监控并在内存解析 JSON 后格式化发出
       | -- 分发给远端的数据仓库
       v
[ Apache Doris (OLAP 平台计算集群) ]
       |
       | -- 高速并行入库、清洗
       | -- 依靠预构建的表结构，对超大规模日志在几秒内实现多维聚合分析
       v
[ OpenClaw 后端服务 (Node.js API) ]
       |
       | -- 负责执行通过标准 MySQL 协议发起的查询，构建 HTTP 路由封装聚合缓存
       v
[ OpenClaw 可视化前端 (Vite + React) ]
       | -- 向 API 发出请求进行控制面板及业务页面的 ECharts 数据渲染图表
```

---

## 🚀 接入日志流工作指引 (Vector 配置)

如果你正在考虑开始将你们公司内部署的数字化员工真实地接入该观测平台，你首先必须熟练掌握利用开源的高性能遥测路由引擎 [Vector](https://vector.dev/)。

### 1. 配置 Vector Pipeline 监控源

对于 Agent 所处的每台机器或宿主机节点，你需要安装 Vector 客户端并调整其监听的 `vector.yaml` 监控目标路径，以便于能够捕捉最新的日志事件。

以下给出了一段示例的 `Vector Source` 结构：
```yaml
sources:
  my_agent_logs:
    type: "file"
    # 读取你本地存放的由于数字员工对话所不断生成的真实 JSONL 日志文件的路径夹
    include:
      - "/var/log/my-ai-agents/**/*.jsonl" # 例如：Agent 会话文件
      - "/var/log/my-audit-records/*.log"  # 例如：特权与审计日志
    read_from: "beginning"                   # 对于初次启动，从头开始抓取文件游标
```

> **[!TIP] 文件隔离**
> > 如果你使用特定的存储命名规范，通过设定类似 `/sessions/*.jsonl` 限定，你可以规避无效大体积旧日志的收集。

### 2. 对接 Sink (流目标指向 Doris 入口)

在本地完成了各种 `Transform` 数据变换，并提炼好比如 `timestamp`, `session_id`, `tool_call` 等结构后，需要在 Vector 将标准化的流送回我们在远端或者集群部署好的 Doris 数仓中存储对应表（比如 `agent_sessions_logs`）里。Apache Doris 所提供的 `HTTP Stream Load` 接口是支持这种高并发流直接分批入库（Batch Ingestion）的绝佳选择。

```yaml
sinks:
  doris_sink:
    type: "http"
    inputs: ["my_agent_transforms"]
    uri: "http://<DORIS_HOST>:8040/api/opsRobot/agent_sessions_logs/_stream_load"
    
    # [!IMPORTANT]
    # Doris 对 _stream_load 的请求头有严格格式限制
    # 参数设置中必须开启 json 或对应分隔符以确保按列名自动映射与入库：
    request:
      headers:
        Expect: "100-continue"
        format: "json"
        strip_outer_array: "true"
        read_json_by_line: "true"
```
（你可以根据[数据管线设计文档](../architecture/data-pipeline.md) 了解更深层的数据重映射和解析细节）

### 3. 数据隔离机制与标签使用

当业务横跨多个子公司或者部门业务线时（即多租户情况），平台允许在前端基于诸如 `agent_name`, `group_id`, `origin_account_id` 等自定义扩展标签进行精细切片审计。只要源头（即你真正的 Agent 业务代码）在打印输出 JSONL 时携带并赋予了对应的元信息 `context`，Doris 将会原封不动地存储它们。

在进行系统部署并连通日志探针之后，业务主管无需修改一行业务代码，即可依靠 `OpenClaw` 内部针对这些标签发起的查询分析引擎，在成本和审计面板完美拆解特定维度的账单和日志详情！
