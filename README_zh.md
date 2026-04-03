# OpenClaw 可观测性平台

**OpenClaw 可观测性平台**，基于 KWeaver Core 框架开发，使用 OTel 协议、eBPF 技术对智能体进行全链路追踪与监管，提供故障快速排查、安全合规管控及算力精益运营的管理能力，护航 AI 赋能业务的高质量增长。

## 核心特性与业务价值

### 全天候观测：让 OpenClaw 的执行过程“白盒化”

- **核心能力**： 构建贯穿全局的观测体系，提供事前（预前自动巡检）、事中（实时监控告警）、事后（精准故障排查）的全生命周期保障。
- **业务价值 (赋能 IT 运维)**：全流程透明，彻底告别黑盒排障，确保系统运行状态 100% 可视可控。

### 风险感知：为 OpenClaw 挂载企业级“刹车系统”

- **核心能力**：建立坚固的安全防线，涵盖实时控制（越权管控、合规校验、风暴拦截）与闭环审计（审计溯源）两大核心机制。
- **业务价值 (赋能 CIO)**：坚守系统底线，消除越权调用与数据安全隐患，实现业务执行与安全合规的完美闭环。

### 生产力评估：让每一分算力投资都清清楚楚
- **核心能力**：依托多维业务核算模型，精准拆解并追踪基础算力、员工个体及业务部门维度的费用消耗情况。
- **业务价值 (赋能 CEO / CFO)**：驱动精细化运营，拒绝算力“糊涂账”，将抽象的大模型 Token 直观转化为清晰的业务 ROI。

![alt text](overview_zh.png)

## 项目架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    OpenClaw Observability Platform              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌───────────────┐    ┌───────────────────┐ │
│  │   Frontend   │    │  Backend API  │    │  Apache Doris     │ │
│  │   (Vite+     │◄──►│  (Node.js)    │◄──►│  (OLAP Database)  │ │
│  │   React)     │    │  Port: 8787   │    │  Port: 9030       │ │
│  │  Port: 3000  │    └───────────────┘    └───────────────────┘ │
│  └──────────────┘                                               │
│           ▲                                                     │
│           │                                                     │
│  ┌────────┴────────────────────────────────────────────────┐    │
│  │                  OTel  Data Pipeline                    │    │
│  │                                                         │    │
│  │  ┌─────────────┐   ┌──────────────┐   ┌───────────────┐ │    │
│  │  │   Sources   │──►│   Transform  │──►│    Sinks      │ │    │
│  │  │  (File/Exec)│   │(Remap/Reduce)│   │(HTTP to Doris)│ │    │
│  │  │             │   │              │   │               │ │    │
│  │  └─────────────┘   └──────────────┘   └───────────────┘ │    │
│  └─────────────────────────────────────────────────────────┘    │
│           ▲                                                     │
│           │                                                     │
│  ┌────────┴───────────────┐                                     │
│  │   OpenClaw Agent       │                                     │
│  │   Session Logs         │                                     │
│  │   (sessions.json /     │                                     │
│  │    *.jsonl)            │                                     │
│  └────────────────────────┘                                     │
└─────────────────────────────────────────────────────────────────┘
```

### 核心组件

| 组件 | 技术栈 | 端口 | 说明 |
|------|--------|------|------|
| **Frontend** | React 18 + Vite + Tailwind CSS | 3000 | 可观测性 Web 界面 |
| **Backend API** | Node.js | 8787 | RESTful API 服务，提供数据查询接口 |
| **Database** | Apache Doris | 9030 (MySQL) / 8040 (BE) | OLAP 分析数据库，存储会话与日志数据 |
| **Data Pipeline** | Vector | - | 数据采集、转换与写入管道 |
| **Data Source** | OpenClaw Agent | - | AI Agent 运行时，日志输出源 |

---

## 功能介绍

### 1. 安全审计 (Security Audit)

| 功能模块 | 说明 |
|----------|------|
| **审计概览** | 核心安全指标、风险统计、实时态势、趋势与排行 |
| **配置变更** | 关键配置项变更历史记录，支持按来源、事件类型、配置路径等多维度筛选 |
| **会话审计** | OpenClaw 会话索引、模型使用与 Token 用量合规留痕 |


### 2 成本分析 (Cost Analysis)

| 功能模块 | 说明 |
|----------|------|
| **成本概览** | 总成本、日均消耗、多维度占比分析、趋势图表 |
| **Agent 成本列表** | 各 Agent 的总消耗、单任务平均消耗、调用量与成功率统计 |
| **LLM 成本明细** | 按模型维度的 Token 使用量与费用明细 |

---


## 如何工作

```
┌─────────┐    ┌───────────────────┐    ┌─────────────────┐    ┌──────────────┐
│OpenClaw │───►│  Vector Pipeline  │───►│ Apache Doris    │◄───│   Frontend   │
│ Agent   │    │   (数据采集与转换)  │    │ (数据存储分析)    │    │   (可视化)    │
│ Logs    │    │                   │    │                 │    │              │
└─────────┘    └───────────────────┘    └─────────────────┘    └──────┬───────┘
                                                                      │
                                           ┌─────────────────┐        │
                                           │   Backend API   │◄───────┘
                                           │   (Node.js)     │
                                           │   Port: 8787    │
                                           └─────────────────┘
```

## 在线体验

立即体验！

- **地址**: http://nw1pe2061132.vicp.fun/
- **密码**: aishu.cn

### 环境要求

- Docker Desktop
- Node.js 18+
### 方式一：Docker Compose -镜像 部署（推荐）

```bash
# 或使用完整路径
docker compose -f docker-compose.yml up -d
```
### 方式二：Docker Compose -编译 部署

```bash
# 构建并启动所有服务
docker compose up -d

# 或使用完整路径
docker compose -f docker-compose-build.yml up -d
```

#### Doris 数据持久化

为保证doris 数据的持久话，会将doris 相关数据保存在 ～/var/doris_data, 如果没有该目录需要使用下面命令创建文件夹。
如果像修改到其他文件夹路径，在docker-compose-build.yml   的volumes》doris_data配置上修改 
```bash
# 创建doris 持久化数据文件夹
 mkdir -p  ～/var/doris_data
```
默认情况下，每次重新部署时 Doris 会重新初始化（历史数据会被清除）。如需保留数据：

```bash
# 使用本地历史数据
 docker compose -f docker-compose-build.yml up -d --build
```

| `DORIS_USE_LOCAL_DATA` | 行为 |
|------------------------|------|
| `false`（默认） | 每次部署时清除所有数据并重新初始化 |
| `true` | 保留并使用 `./doris-data` 中的本地历史数据 |

服务启动后访问：

| 服务 | 地址 |
|------|------|
| 前端界面 | http://localhost:3000 |
| Doris FE | http://localhost:8030 |

### 方式三：本地开发

```bash
# 安装依赖
npm install

# 启动后端 API（端口 8787）
npm run api

# 另起终端，启动前端开发服务器（端口 3000）
npm run dev
```

### 配置 Vector 数据采集

说明：vector 作为openclaw的日志采集器，需要每个openclaw实际机器上安装配置vector，OpenClaw 可观测性平台 支持多个vector 采集器实现对多个openclaw 日志数据的采集


修改 `vector.yaml` 中的数据源路径，指向实际的 OpenClaw 日志目录：

```yaml
sources:
  sessions:
    command: ["cat", "/path/to/openclaw/sessions/sessions.json"]

  session_logs:
    include:
      - "/path/to/openclaw/agents/*/sessions/*.jsonl"

  gateway_logs:
    include:
      - "/path/to/openclaw/logs/gateway.log"
      - "/path/to/openclaw/logs/gateway.err.log"

  audit_logs:
    include:
      - "/path/to/openclaw/logs/config-audit.jsonl"
```

macos vector 安装：

```bash
brew tap vectordotdev/brew && brew install vector
```

启动 Vector：

```bash
vector --config vector.yaml
```

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DORIS_HOST` | doris | Doris 主机名 |
| `DORIS_PORT` | 9030 | Doris MySQL 端口 |
| `DORIS_USER` | root | 数据库用户名 |
| `DORIS_PASSWORD` | (空) | 数据库密码 |
| `DORIS_DATABASE` | opsRobot | 数据库名称 |
| `API_PORT` | 8787 | Backend API 端口 |
| `FRONTEND_PORT` | 3000 | 前端端口 |
| `DORIS_USE_LOCAL_DATA` | false | 是否在重新部署时保留 Doris 历史数据。`false` = 重新初始化（默认），`true` = 使用本地数据 |

---

## 版本兼容性
本项目紧随 OpenClaw 社区的发展，目前已基于 OpenClaw 最新版本 完成了开发、功能验证及稳定性测试。为确保各项可观测性指标的准确抓取与展示，建议在以下环境中使用：

| 组件 | 推荐版本 | 说明 |
|------|----------|------|
| OpenClaw | latest (v3.x+) | 核心调度与管理平台 |
| Linux Kernel | 4.18+ | eBPF 探针运行的最低内核要求 |
| Docker | 20.10.0+ | 推荐容器运行时环境 |
| Docker Compose | v2.0.0+ | 推荐用于本地快速编排验证 |


## 参与贡献与社区：
我们欢迎并鼓励任何形式的贡献！无论是提交 Bug 反馈、完善文档，还是提交核心代码的 PR，都是对 opsRobot 开源社区的巨大支持。
贡献指南: 请阅读我们的 [CONTRIBUTING.md 链接] 了解如何开始。
社区交流:微信交流群二维码


## 微信交流群

扫描下方二维码加入微信交流群：

<img src="./wechat-qr.png" width = 300 height = 442>

---


## License

[Apache License 2.0](LICENSE)
