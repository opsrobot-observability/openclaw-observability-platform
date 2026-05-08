# OpenClaw Observability Platform

> English | [中文](./README_zh.md)


**OpenClaw Observability Platform**, developed based on the KWeaver Core framework, uses OTel protocol and eBPF technology for full-link tracing and monitoring of AI Agents. It provides rapid fault diagnosis, security compliance management, and lean computing operations capabilities to ensure high-quality growth of AI-powered businesses.

## Core Features & Business Value

### 24/7 Observability: Making OpenClaw Execution "White-Box"

- **Core Capability**: Build a comprehensive observation system providing lifecycle guarantees including pre-event (automated inspection), during-event (real-time monitoring & alerting), and post-event (precise fault diagnosis)
- **Business Value (for IT Ops)**: Full-process transparency, eliminating black-box troubleshooting, ensuring 100% visibility and control of system status

### Risk Perception: Enterprise-Grade "Brake System" for OpenClaw

- **Core Capability**: Establish robust security defenses covering real-time control (authorization management, compliance validation, storm blocking) and closed-loop auditing (audit traceability)
- **Business Value (for CIO)**: Maintaining system security baseline, eliminating unauthorized calls and data security risks, achieving a perfect closed loop between business execution and security compliance

### Productivity Assessment: Every Compute Investment Made Clear

- **Core Capability**: Based on multi-dimensional business accounting models, accurately decompose and track cost consumption across infrastructure computing, individual employees, and business departments
- **Business Value (for CEO/CFO)**: Drive refined operations, reject "confusing compute accounts", and intuitively convert abstract LLM Tokens into clear business ROI

![alt text](overview_en.png)

## Architecture

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
│                                                ▲                │
│                                                │                │
│  ┌─────────────────────────────────────────────┴───────────┐    │
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

### Core Components

| Component | Tech Stack | Port | Description |
|-----------|------------|------|-------------|
| **Frontend** | React 18 + Vite + Tailwind CSS | 3000 | Observability Web UI |
| **Backend API** | Node.js | 8787 | RESTful API service for data queries |
| **Database** | Apache Doris | 9030 (MySQL) / 8040 (BE) | OLAP analytics database for session and log storage |
| **Data Pipeline** | Vector | - | Data collection, transformation, and ingestion pipeline |
| **Data Source** | OpenClaw Agent | - | AI Agent runtime, source of log output |

---

## Online Live Demo

Try it out now!

- **URL**: https://opsrobot-demo.aishu.cn:3000/



## Quick Start

### 1. Environment Requirements

- Docker Desktop with Docker Compose plugin
- Node.js 18+

### 2. Clone the Project

```bash
git clone https://github.com/opsrobot-ai/opsrobot.git
cd opsrobot
```

### 3. Deploy Backend Services with Images

```bash
docker compose -f docker-compose.yml up -d
```

After services start, access: http://localhost:3000


### 4. Configure OpenClaw Data Collection

**Note: Install and configure the Vector collector on each machine running OpenClaw.**
[Vector Official Site](https://vector.dev/docs/) | [Vector Installation Guide](https://vector.dev/docs/setup/installation/)

#### Vector Installation for macOS:

```bash
brew tap vectordotdev/brew && brew install vector
```

#### Vector Installation for Linux:

For CentOS:
```bash
bash -c "$(curl -L https://setup.vector.dev)"
sudo yum install vector
```

For Ubuntu:
```bash
bash -c "$(curl -L https://setup.vector.dev)"
sudo apt-get install vector
```

#### Modify `vector.yaml` collector configuration:
[Vector Configuration Documentation](https://vector.dev/docs/reference/configuration/)

Point to the backend server IP address (if OpenClaw is on the same server, no modification needed):
```yaml
sinks:
  session_to_doris: &sink_template
    uri: "http://127.0.0.1:8040/api/opsRobot/agent_sessions/_stream_load"

  session_logs_to_doris:
    uri: "http://127.0.0.1:8040/api/opsRobot/agent_sessions_logs/_stream_load"

  gateway_logs_to_doris:
    uri: "http://127.0.0.1:8040/api/opsRobot/gateway_logs/_stream_load"

  audit_logs_to_doris:
    uri: "http://127.0.0.1:8040/api/opsRobot/audit_logs/_stream_load"

  openclaw_config_to_doris:
    uri: "http://127.0.0.1:8040/api/opsRobot/openclaw_config/_stream_load"

  agent_models_to_doris:
    uri: "http://127.0.0.1:8040/api/opsRobot/agent_models/_stream_load"
```

Point to the actual OpenClaw log directory for log collection monitoring:
```yaml
sources:
  sessions:
    command:
      - "sh"
      - "-c"
      - 'for f in ~/.openclaw/agents/*/sessions/sessions.json; do if [ -f "$$f" ]; then tr -d "\n" < "$$f"; echo ""; fi; done'

  session_logs:
    include:
      - "~/.openclaw/agents/*/sessions/*.jsonl"

  gateway_logs:
    include:
      - "~/.openclaw/logs/gateway.log"
      - "~/.openclaw/logs/gateway.err.log"

  audit_logs:
    include:
      - "~/.openclaw/logs/config-audit.jsonl"

  openclaw_config_file:
    command:
    - "sh"
    - "-c"
    - 'f="~/.openclaw/openclaw.json"; if [ -f "$$f" ]; then j=$$(tr -d "\n" < "$$f"); printf "{\"source_path\":\"%s\",\"openclaw_root\":%s}\n" "$$f" "$$j"; fi'

  agent_models_file:
    command:
    - "sh"
    - "-c"
    - 'for f in ~/.openclaw/agents/*/agent/models.json; do if [ -f "$$f" ]; then agent=$$(basename "$$(dirname "$$(dirname "$$f")")"); [ -z "$$agent" ] && continue; j=$$(tr -d "\n" < "$$f"); printf "{\"source_path\":\"%s\",\"agent_name\":\"%s\",\"models_root\":%s}\n" "$$f" "$$agent" "$$j"; fi; done'

  cron_jobs_config_file:
    type: exec
    command: 
      - "sh"
      - "-c"
      - 'for f in ~/.openclaw/cron/jobs.json; do if [ -f "$$f" ]; then tr -d "\n" < "$$f"; echo ""; fi; done'

  cron_runs_config_file:
    type: file
    include:
    - "~/.openclaw/cron/runs/*.jsonl"
    read_from: beginning
    fingerprint:
      strategy: device_and_inode
```

#### Start Vector Collector Service:

```bash
vector --config vector.yaml
```
### 5. Configure OpenClaw-Diagnostics-Otel Data Collection

* [Official Documentation](https://docs.openclaw.ai/zh-CN/logging)

In the openclaw.json file, add or modify the configuration as follows:
```yaml
{
  "diagnostics": {
    "enabled": true,
    "otel": {
      "enabled": true,
      "endpoint": "http://192.168.72.87:4318",
      "traces": true,
      "metrics": true,
      "logs": true,
    },
    "cacheTrace": {
      "enabled": true,
      "includeMessages": true,
      "includePrompt": true,
      "includeSystem": true
    }
  },
  "plugins": {
    "entries": {
      "diagnostics-otel": {
        "enabled": true
      },
    },
    "allow": [
      "diagnostics-otel",
    ]
  }
}
```

After modifying the configuration, restart OpenClaw:
```bash
openclaw gateway restart
```

### 6. View All OpenClaw Observability Data:

- Interact with OpenClaw through its interface
- View collected data in the opsRobot product interface: http://localhost:3000

---

## More Screenshots
Session Traceability Analysis:
![溯源分析](./docs/pictures/溯源分析.png)

Token Consumption Dashboard:
![Token消耗](./docs/pictures/Token消耗.png)

Digital Employee Module (Overview & Portrait):
![Digital-Employee-Overview](./docs/pictures/Digital-Emmployee-Overview.png)
![Digital-Employee-Overview2](./docs/pictures/Digital-Employee-Overview2.png)
![Digital-Employee-Portrait-Capability](./docs/pictures/Digital-Employee-Portrait-Capability.png)
![Digital-Employee-Portrait-Security](./docs/pictures/Digital-Employee-Portrait-Security.png)
![Digital-Employee-Portrait](./docs/pictures/Digital-Employee-Portrait.png)


## Version Compatibility

This project closely follows the development of the OpenClaw community. It has been developed, validated, and tested based on the latest version of OpenClaw. For accurate collection and display of observability metrics, it is recommended to use in the following environment:

| Component | Recommended Version | Description |
|-----------|---------------------|-------------|
| OpenClaw | latest (v3.x+) | Core scheduling and management platform |
| Linux Kernel | 4.18+ | Minimum kernel requirement for eBPF probes |
| Docker | 20.10.0+ | Recommended container runtime environment |
| Docker Compose | v2.0.0+ | Recommended for local fast orchestration |


## Contributing & Community

We welcome and encourage contributions in any form! Whether submitting bug reports, improving documentation, or submitting PRs for core code, all contributions are greatly appreciated to support the opsRobot open source community.
Contributing Guide: Please read our [CONTRIBUTING.md](./CONTRIBUTING.md) to learn how to get started.
Community Exchange: WeChat group QR code


## WeChat Community

Scan the QR code below to join the WeChat community:

<img src="./wechat-qr.png" width = 300 height = 442>

---


## License

[Apache License 2.0](LICENSE)
