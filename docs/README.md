# OpenClaw Observability Platform 文档指南

🎉 欢迎阅读 **OpenClaw Observability Platform (OpenClaw 可观测性平台)** 的官方官方文档！

OpenClaw 是一款专门针对 AI Agent（智能体）与数字化员工工作流设计的开源可观测性平台。基于现代化的技术栈（React + Vite + ECharts + Apache Doris + Vector），它为错综复杂的 LLM (大语言模型) 调用与真实执行流提供**一站式立体追踪、监控与审计**能力。

---

## 🎯 我们的使命与核心价值

在真正的企业落地实践中，大语言模型带来的不确定性和“黑盒”问题严重阻碍了自动化流程。OpenClaw 的愿景是帮助开发与 IT 安全团队看清数字员工运行的每一处细节，兼顾效率与安全。

本平台提供以下三大核心支柱能力：

1. **🔍 全链路无死角会话追踪 (Trace)**
   * **白盒化执行流**：精准记录每次 prompt 的下发、模型推理和回复过程。
   * **工具连线追踪**：完整绘制 `用户输入 -> 意图识别 -> 工具调用 -> 环境读写` 拓扑图，避免迷失在堆栈里。
   * **Token 消耗穿透**：洞悉单次交互中 Input、Output 以及 Cache 的热度分配，为性能调优提供事实依据。

2. **🛡️ 智能合规审计体系 (Risk Perception)**
   * **越限阻断感知**：实时高亮并拦截执行了高危工具（例如敏感 Bash 或网络操作）の行为记录。
   * **动态风险评估**：将海量机器对话自动打标并划定“高、中、低”的潜在风险与错误级别，便于日常审阅。
   * **配置防污染审计**：记录主机及业务级别配置被 Agent 覆盖篡改的前后对比与动作来源。

3. **💰 颗粒度极高的成本归集 (Cost Analysis)**
   * **多维度账单分流**：随时查看近期的平台开销状况，并按通道（Channel）、项目或特定调用者分解 USD 开支。
   * **价值模型分析**：抓出“循环无效调用”的黑户及浪费点，优化模型的实际投资回报（ROI）。

---

## 📖 文档导航

我们为您准备了从入门到精通的各阶段材料。请根据您的角色与需求选择阅读内容：

### 🚀 快速起步系列
帮助您在短时间内完成本地拉起和系统接入。

- **[👉 快速入门篇](./getting-started/quick-start.md)**：包含前置要求解读、单机拉起分析前端组件、在几步内看到效果的全流程。
- **[👉 部署与数据接入拓扑](./getting-started/deployment.md)**：讲述如何在多环境安装使用 `Vector` 以及流式导入海量日志。

### 🧩 核心功能大观
深入了解控制面板上的数据逻辑和场景。

- **[👉 审计概览看板](./features/audit-dashboard.md)**：全局监控数字员工的活跃规律和安全态势。
- **[👉 会话与流水线审计](./features/session-tracing.md)**：通过拓扑图深度追踪一次复杂对话的前因后果。
- **[👉 特权变更审计](./features/config-audit.md)**：观测环境漂移，追踪系统内敏感文件覆盖溯源。
- **[👉 成本评估与分析](./features/cost-analysis.md)**：如何查看不同模型、不同通道带来的费用情况及其拆解。

### 🏗️ 架构探秘
满足开发极客的好奇心，分析数据管道内幕。

- **[👉 OTel & eBPF 数据流水线](./architecture/data-pipeline.md)**：从架构视角看日志数据抓取引擎设计如何保持轻量。

### 💻 开发者贡献指引
准备向 OpenClaw Observability Platform 发起您的第一个 PR 吗？

- **[👉 开发指南与环境构建](./development/local-setup.md)**：前后端调试要求，环境变量详解与数据库测试指南。

---

> GitHub 官方仓库: [https://github.com/aishu-opsRobot/openclaw-observability-platform](https://github.com/aishu-opsRobot/openclaw-observability-platform)
