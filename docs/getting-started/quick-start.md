# 快速起步：本地运行与预览

这篇指南将协助你在本地计算机上以最快速度运行 OpenClaw Observability Platform，以便预览其 UI 界面、交互与基础分析功能。

---

## 📋 前提条件
在尝试拉起测试环境之前，请确保当前的系统环境中已安装或支持以下基础组件：

- **Node.js**: `v18.0` 及更高版本 (推荐使用 `npm` 或者 `pnpm` 作为依赖包管理器)。
- **Docker** 引擎以及 **Docker Compose** 插件：平台需要拉起基于镜像构建的 Apache Doris 分析型数据库作为持久化数据存储。
- *(可选)* **Vector**: 仅当你准备将生产环境或正式测试机中的真实 Agent 本地文件日志（如 JSONL）实时收集并导入时需要安装。如果是用于体验前端面板与查阅已有数据，不需要配置。

---

## 🛠️ 步骤 1: 启动并拉起 Apache Doris (数据中枢)

OpenClaw 平台强依赖于以 [Apache Doris](https://doris.apache.org/) 为核心构建结构化数仓。我们在项目中内置了一套用于一键拉起的 `docker-compose` 来降低你的配置成本。

1. 打开一个终端窗口，将路径切换至整个项目的根目录。
2. 直接执行容器编排命令以启动配套的 Doris 套件进行初始化：

```bash
docker-compose up -d
```

> **[!NOTE] 容器启动准备阶段**
> > Doris 的 FE (Frontend) 和 BE (Backend) 容器在首次启动并初始化 `opsRobot` 数据库、拉取和创建对应的数据流表（如 `agent_sessions`, `agent_sessions_logs` 等）时，可能需要等待约 **15至30秒** 的准备时间才能完全接受外部连接。

---

## ⚙️ 步骤 2: 安装平台依赖与关联本地环境

在继续之前我们需要完成 Node 依赖模块的拉取并处理好前端连接后端的指向配置：

```bash
# 安装后端接口封装及 React 前端运行必需的 node_modules 依赖
npm install

# (如果根目录下目前没有 .env)
# 复制我们准备的 env 环境变量样例
cp .env.example .env
```

此时可以检查你的 `.env` 配置文件。确保存在例如 `DORIS_HOST=127.0.0.1` 且指向你本机刚拉起容器的网络映射，以便后续提供后端 Node 进程访问。

---

## 🚀 步骤 3: 启动应用核心服务

确认本地 Doris 的端口监控显示已经存活且稳定后，我们需要分别将后端 API 代理层和前端 Vite 层运行。为了方便查看不同层次的日志输出，建议拆分两组命令运行：

**终端 A: 启动 API 代理 （主要承担 Doris 数据聚合逻辑请求与组装）**
```bash
npm run api
```
*如果成功，终端将打出与 Doris 连接成功的相关字眼，并且提示 Node 服务器（默认在 `:8787`）已监听到： `"[agent-sessions] http://127.0.0.1:8787/xxx"`*

**终端 B: 启动前端页面视图**
```bash
npm run dev
```
*运行成功后，Vite 将自动分配并输出访问的本地地址，如： `"http://localhost:5173"` 或者 `"http://localhost:3000"`*

---

## 👀 步骤 4: 浏览平台与下一步操作

现在，你可以打开常用的现代浏览器（Chrome/Edge），访问终端 B 输出的本地开发服务器页面（例如 `http://localhost:5173` ）。

- 初次加载并登录后，你会直接来到左侧主导航上的 **安全审计概览 (Audit Dashboard)** 看板。
- 如果你的 Apache Doris 数据库中尚无通过 Vector 打入的真实日志数据，各类饼图和列表将被置空、或填充为基础的预留 `-` 符号位。

**恭喜你，平台环境已在你的本地准备就绪！** 

接下来你可以：
- 参阅 [部署与架构拓扑](./deployment.md) 获取系统在真实上线的完整连线设计与 Vector 管道（Pipeline）如何采集数据到 Doris 的指引。
- 移步 [功能详解 - 会话与流水线审计](../features/session-tracing.md) 了解不同菜单的使用场景。
