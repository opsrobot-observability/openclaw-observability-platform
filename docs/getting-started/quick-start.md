# 快速起步：本地运行与预览

本指南将协助您在本地环境中快速启动 OpenClaw Observability Platform，以便预览界面与基础分析功能。

---

## 📋 前提条件

在此之前，请确保当前系统已安装以下基础依赖：

- **Node.js**: `v18.0` 或更高版本 (建议使用 `npm` 或 `pnpm` 管理依赖)。
- **Docker** 引擎与 **Docker Compose** 插件：用于启动作为数据中枢的 Apache Doris 数据库。
- *(可选)* **Vector**: 若需从本地真实应用节点收集日志则需安装。仅体验控制台界面可跳过此步。

---

## 🛠️ 步骤 1: 启动 Apache Doris 数据服务

OpenClaw 平台基于 [Apache Doris](https://doris.apache.org/) 实现数据存储。项目内置了 `docker-compose` 编排文件以简化部署。

1. 在终端中，进入项目根目录。
2. 运行以下命令启动 Doris 及相关初始化服务：

```bash
docker compose up -d
```

> **[!NOTE] 服务就绪时间**
> Doris 容器启动后，需要进行 Schema 初始化并创建表结构（如 `agent_sessions`、`agent_sessions_logs` 等）。通常需要约 **15至30秒** 后方可接受外部网络连接。

---

## ⚙️ 步骤 2: 安装依赖与环境变量配置

安装 Node 核心依赖，并准备前端所需的配置文件：

```bash
# 安装所需的所有包依赖
npm install

# 复制一份环境变量文件（如有需要可按实际情况调整）
cp .env.example .env
```

请检查 `.env` 文件，确保 `DORIS_HOST=127.0.0.1` 映射正确，以保证后端服务能连接到刚刚拉起的数据库。

---

## 🚀 步骤 3: 运行平台核心进程

确认 Doris 处于健康状态后，分别启动后端 API 服务和前端视图：

**终端 A: 启动 API 代理**
```bash
npm run api
```
*启动成功后，终端将输出连接到 Doris 的确认信息，以及监听端口提示：`[agent-sessions] http://127.0.0.1:8787/xxx`*

**终端 B: 启动前端开发服务器**
```bash
npm run dev
```
*启动完毕后，Vite 将输出本地访问地址，如：`http://localhost:5173` 或 `http://localhost:3000`*

---

## 👀 步骤 4: 访问平台界面

使用浏览器打开前端输出的本地地址（如 `http://localhost:5173`）。

- 系统加载后，将默认显示 **安全审计概览 (Audit Dashboard)** 页面。
- 若数据库内尚无源数据输入，图表组件将显示为空占位符。

**平台已在您的本地就绪！**

阅读建议：
- 参考 [部署与架构拓扑](./deployment.md) 了解生产环境的集成方案。
- 阅读 [功能介绍 - 会话与审计追踪](../features/session-tracing.md) 深入了解业务模块的具体功能。
