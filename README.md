# OpenClaw Observability Platform

OpenClaw Observability Platform 是一个面向OpenClaw的企业级可观测性平台，旨在为基于 OpenClaw 框架构建的数字员工提供全方位的监控、审计与成本分析能力。

**OpenClaw 可观测性平台**，基于 KWeaver Core 框架构建，融合 OpenTelemetry (OTel) 与 eBPF 技术，实现 AI Agent 的全链路追踪与监控。通过快速故障隔离、安全合规管控与精益资源优化，确保 AI 赋能业务生态的可靠运行与规模化性能

---

## 项目架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    OpenClaw Observability Platform              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐ │
│  │   Frontend   │    │  Backend API  │    │  Apache Doris     │ │
│  │   (Vite+     │◄──►│  (Node.js)    │◄──►│  (OLAP Database)  │ │
│  │   React)     │    │  Port: 8787   │    │  Port: 9030       │ │
│  │  Port: 3000  │    └──────────────┘    └──────────────────┘ │
│  └──────────────┘                                               │
│           ▲                                                    │
│           │                                                    │
│  ┌────────┴────────────────────────────────────────────────┐   │
│  │                  OTel  Data Pipeline                    │   │
│  │                                                         │   │
│  │  ┌─────────────┐   ┌─────────────┐   ┌──────────────┐  │    │
│  │  │   Sources   │──►│ Transform   │──►│    Sinks     │  │    │
│  │  │  (File/Exec)│   │  (Remap/    │   │ (HTTP to     │  │    │
│  │  │             │   │   Reduce)   │   │  Doris)      │  │    │
│  │  └─────────────┘   └─────────────┘   └──────────────┘  │    │
│  └────────────────────────────────────────────────────────┘    │
│           ▲                                                    │
│           │                                                    │
│  ┌────────┴──────────────┐                                     │
│  │   OpenClaw Agent       │                                    │
│  │   Session Logs         │                                    │
│  │   (sessions.json /     │                                    │
│  │    *.jsonl)            │                                    │
│  └────────────────────────┘                                    │
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


=======
| 功能模块 | 说明 |
|----------|------|
| **成本概览** | 总成本、日均消耗、多维度占比分析、趋势图表 |
| **Agent 成本列表** | 各 Agent 的总消耗、单任务平均消耗、调用量与成功率统计 |
| **LLM 成本明细** | 按模型维度的 Token 使用量与费用明细 |

---


## 如何工作

```
┌─────────┐    ┌───────────────────┐    ┌─────────────────┐    ┌──────────────┐
│OpenClaw │───►│ Vector Pipeline   │───►│ Apache Doris     │◄───│   Frontend   │
│ Agent   │    │ (数据采集与转换)   │    │ (数据存储分析)   │    │   (可视化)   │
│ Logs    │    │                   │    │                 │    │              │
└─────────┘    └───────────────────┘    └─────────────────┘    └──────┬───────┘
                                                                          │
                                           ┌─────────────────┐            │
                                           │   Backend API    │◄───────────┘
                                           │   (Node.js)      │
                                           │   Port: 8787     │
                                           └─────────────────┘
```

## 快速启动

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

服务启动后访问：

| 服务 | 地址 |
|------|------|
| 前端界面 | http://localhost:3000 |
| Doris FE | http://localhost:8030 |

### 方式二：本地开发

```bash
# 安装依赖
npm install

# 启动后端 API（端口 8787）
npm run api

# 另起终端，启动前端开发服务器（端口 3000）
npm run dev
```

### 配置 Vector 数据采集



修改 `vector.yaml` 中的数据源路径，指向实际的 OpenClaw 日志目录：

```yaml
sources:
  openclaw_sessions:
    command: ["cat", "/path/to/openclaw/sessions/sessions.json"]

  openclaw_session_logs:
    include:
      - "/path/to/openclaw/agents/*/sessions/*.jsonl"
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

---



