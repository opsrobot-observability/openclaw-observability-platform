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

### Core Components

| Component | Tech Stack | Port | Description |
|-----------|------------|------|-------------|
| **Frontend** | React 18 + Vite + Tailwind CSS | 3000 | Observability Web UI |
| **Backend API** | Node.js | 8787 | RESTful API service for data queries |
| **Database** | Apache Doris | 9030 (MySQL) / 8040 (BE) | OLAP analytics database for session and log storage |
| **Data Pipeline** | Vector | - | Data collection, transformation, and ingestion pipeline |
| **Data Source** | OpenClaw Agent | - | AI Agent runtime, source of log output |

---

## Features

### 1. Security Audit

| Module | Description |
|--------|-------------|
| **Audit Overview** | Core security metrics, risk statistics, real-time situational awareness, trends and rankings |
| **Configuration Changes** | History of critical configuration changes with multi-dimensional filtering by source, event type, and configuration path |
| **Session Audit** | OpenClaw session indexing, model usage, and Token consumption compliance logging


### 2. Cost Analysis

| Module | Description |
|--------|-------------|
| **Cost Overview** | Total cost, daily average consumption, multi-dimensional proportion analysis, and trend charts |
| **Agent Cost List** | Per-Agent total consumption, average cost per task, call volume, and success rate statistics |
| **LLM Cost Details** | Token usage and cost details by model dimension |

---

## How It Works

```
┌─────────┐    ┌───────────────────┐    ┌─────────────────┐    ┌──────────────┐
│OpenClaw │───►│  Vector Pipeline  │───►│ Apache Doris    │◄───│   Frontend   │
│ Agent   │    │   (Data Collection│    │ (Data Storage & │    │ (Visualization)
│ Logs    │    │    & Transformation)│   │    Analysis)    │    │              │
└─────────┘    └───────────────────┘    └─────────────────┘    └──────┬───────┘
                                                                      │
                                           ┌─────────────────┐        │
                                           │   Backend API   │◄───────┘
                                           │   (Node.js)     │
                                           │   Port: 8787    │
                                           └─────────────────┘
```

## Online Live Demo

Try it out now!

- **URL**: http://nw1pe2061132.vicp.fun/
- **Password**: aishu.cn


## Quick Start

### 1. Environment Requirements

- Docker Desktop with Docker Compose plugin
- Node.js 18+

### 2. Clone the Project

```bash
git clone https://github.com/opsrobot-observability/openclaw-observability-platform.git
cd openclaw-observability-platform
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
```

#### Start Vector Collector Service:

```bash
vector --config vector.yaml
```

### 5. View All OpenClaw Observability Data:

- Interact with OpenClaw through its interface
- View collected data in the opsRobot product interface: http://localhost:3000




### Build & Deploy from Source

```bash
# Or use full path
docker compose -f docker-compose-build.yml up -d --build
```

#### Doris Data Persistence

To ensure Doris data persistence, Doris data is stored in `~/var/doris_data`. If this directory doesn't exist, create it:
```bash
# Create Doris persistent data directory
mkdir -p ~/var/doris_data
```

By default, Doris will be reinitialized on each redeployment (historical data will be cleared). To preserve data:

```bash
# Use local historical data
docker compose -f docker-compose-build.yml up -d --build
```

| `DORIS_USE_LOCAL_DATA` | Behavior |
|------------------------|----------|
| `false` (default) | Clear all data and reinitialize on each deployment |
| `true` | Preserve and use local historical data from `./doris-data` |

After services start, access:

| Service | URL |
|---------|-----|
| Frontend UI | http://localhost:3000 |
| Doris FE | http://localhost:8030 |

### Local Development Deployment

```bash
# Install dependencies
npm install

# Start backend API (port 8787)
npm run api

# In a separate terminal, start frontend dev server (port 3000)
npm run dev
```

### OpenClaw Data Collection Configuration

Same as the Quick Start section above.


---

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DORIS_HOST` | doris | Doris hostname |
| `DORIS_PORT` | 9030 | Doris MySQL port |
| `DORIS_USER` | root | Database username |
| `DORIS_PASSWORD` | (empty) | Database password |
| `DORIS_DATABASE` | opsRobot | Database name |
| `API_PORT` | 8787 | Backend API port |
| `FRONTEND_PORT` | 3000 | Frontend port |
| `DORIS_USE_LOCAL_DATA` | false | Whether to preserve Doris historical data across redeployments. `false` = reinitialize (default), `true` = use local data |

---

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
