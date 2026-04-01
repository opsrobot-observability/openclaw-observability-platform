# 开发指南与环境构建 (Local Setup)

欢迎各位开发者参与到 **OpenClaw Observability Platform** 的开源共建中。在这里我们将提供您为本系统贡献代码与提交 Pull Request (PR) 前所需准备的必需环境与调试规范。

---

## 🛠️ 前提构建要求

如果您想要对 UI 面板或者后端监控聚合接口进行修改，请确保您的系统：

1. **已安装 Git** 用于代码同步控制；
2. **已安装 Node.js v18 以上**，包管理器推荐使用原生 `npm`；
3. **有可用的 Apache Doris 测试实例**：无论是通过预置的 Docker Compose 在本地拉起集群，还是连入了你们组织的测试 Doris 网段。

---

## 🔍 后端服务测试开发

**模块职责**：`Node.js` 中间层，位于 `backend/` 目录下。主要负责承担前端的 HTTPS 请求，校验并拼接执行到后台 Doris 高维分析引擎所需的查询 SQL 并返回。
- 默认运行端口: `8787`

**构建依赖与调试**：
在项目根目录下通过以下配置开启监控并刷新后端：
```bash
# 进入并安装
npm install

# 确保带有本地数据库的映射配置，或直接设置 Doris 的 Hostname
export DORIS_HOST=127.0.0.1
export DORIS_PORT=9030   # 注意，如果是连接 MySQL 协议查询为 9030
export DORIS_USER=root
export DORIS_PASSWORD=

# 拉起服务
npm run api
```
如果启动顺利，你可以尝试进行简单的 `curl http://localhost:8787/api/xxx` 测试返回体是否有效。

---

## 🎨 前端面板视图的开发

**模块职责**：可视化层，前端采用 React 18, 路由, 结合 Vite 工具链，样式采用 Tailwind CSS。图表强耦合了 ECharts。所有前端渲染业务位于 `frontend/` 下。
- 默认运行端口: `3000` 或是 Vite 随机分配的 `5173`。

**启动 Vite 热更新调试**：
无需进入额外的目录，只要保持在上一步的同一层级执行：
```bash
npm run dev
```

> **注意 (Attention): CORS 与跨域**
> 前端项目在进行开发时，我们默认配置了 `vite.config.js` 的 proxy，使得所有尝试拉取数据的 `/api/` 都会**透明转发代理**给您本地运行在 `8787` 端口的 Node 服务。这免去了手搓后端跨域策略的麻烦！

---

## 🐞 贡献代码的建议流程

1. **理解数据流**：在提交任何有关 `Model Token / Tool Count` 的计算统计前，请优先阅读 [数据管道设计](../architecture/data-pipeline.md)。
2. **建立分支**：从 `main` 分支拉出您的个人特性开发节点，例如 `git checkout -b feature/awesome-new-chart`。
3. **书写文档**：如果您对某一个功能如“审计大盘”增加了新的组件，请同步提交更新至本 `docs/features` 目录下对应的说明书中。
4. **提交并 Push** 您的提交 PR 应当具有明晰的语义化标签，例如：`feat(ui): add new token consumption graph`。
