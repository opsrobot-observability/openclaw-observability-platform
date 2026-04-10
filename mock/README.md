# Mock 模式使用说明

## 快速启动

```bash
npm run dev:mock
```

即可在**无需数据库**的情况下启动前端开发服务器。浏览器访问 `http://localhost:5173`。

## 原理

通过环境变量 `VITE_MOCK=true`，Vite 开发插件在请求到达时短路到 Mock 处理器，返回预设的静态 JSON 数据，**不调用任何数据库查询逻辑**。

```
请求 → Vite 中间件 → VITE_MOCK=true? → mock/mockHandler.mjs → 返回 Mock 数据
                                     → false → 原有 DB 查询逻辑（需数据库）
```

## 涵盖接口

| 路由 | Mock 数据文件 |
|------|---------------|
| `/api/cost-overview` | `mock/data/cost-overview.mjs` |
| `/api/agent-cost-list` | `mock/data/agent-cost-list.mjs` |
| `/api/llm-cost-detail` | `mock/data/llm-cost-detail.mjs` |
| `/api/agent-sessions` | `mock/data/agent-sessions.mjs` |
| `/api/agent-sessions-logs` | `mock/data/agent-sessions-logs.mjs` |
| `/api/agent-sessions-audit-overview` | `mock/data/audit-overview.mjs` |
| `/api/agent-sessions-logs-tables` | `mock/data/log-tables.mjs` |
| `/api/agent-sessions-logs-search` | `mock/data/log-search.mjs` |
| `/api/config-audit-logs` | `mock/data/config-audit-logs.mjs` |
| `/api/config-audit-stats` | `mock/data/config-audit-stats.mjs` |
| `/api/monitor-dashboard` | `mock/data/monitor-dashboard.mjs` |
| `/api/monitor-session` | `mock/data/monitor-session.mjs` |
| `/api/monitor-session-overview` | `mock/data/monitor-session.mjs` |
| `/api/monitor-session-risk` | `mock/data/monitor-session.mjs` |
| `/api/monitor-session-trend` | `mock/data/monitor-session.mjs` |

## 修改 Mock 数据

直接编辑 `mock/data/*.mjs` 中的数据即可。由于 Vite HMR 的存在，修改后刷新浏览器即可看到效果。

## 切换回真实模式

使用默认的开发命令（需要配置好 Doris 数据库连接）：

```bash
npm run dev
```
