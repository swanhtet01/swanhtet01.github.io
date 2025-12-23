# 🦄 HYPER UNICORN

## SuperMega.dev AI Agent Operating System

**Transform your Bangkok Node into a JARVIS-level autonomous AI workforce that does your job 1000x better.**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        HYPER UNICORN ARCHITECTURE                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                  │
│   │   GEMINI    │     │   CLAUDE    │     │   OPENAI    │  ← Cloud AI      │
│   │  (Speed)    │     │  (Reason)   │     │   (Code)    │    APIs          │
│   └──────┬──────┘     └──────┬──────┘     └──────┬──────┘                  │
│          │                   │                   │                          │
│          └───────────────────┼───────────────────┘                          │
│                              ▼                                              │
│   ┌──────────────────────────────────────────────────────────────────────┐ │
│   │                   INTELLIGENCE FABRIC                                 │ │
│   │              (Multi-Model Router & Optimizer)                        │ │
│   └──────────────────────────────────────────────────────────────────────┘ │
│                              │                                              │
│          ┌───────────────────┼───────────────────┐                          │
│          ▼                   ▼                   ▼                          │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                  │
│   │  RESEARCHER │     │   CODER     │     │   WRITER    │  ← Agent         │
│   │    Agent    │     │   Agent     │     │   Agent     │    Constellation │
│   └─────────────┘     └─────────────┘     └─────────────┘                  │
│                              │                                              │
│   ┌──────────────────────────────────────────────────────────────────────┐ │
│   │                      MEMORY CORTEX                                    │ │
│   │           (Redis + Qdrant + Episodic Memory)                         │ │
│   └──────────────────────────────────────────────────────────────────────┘ │
│                              │                                              │
│   ┌──────────────────────────────────────────────────────────────────────┐ │
│   │                     BANGKOK NODE                                      │ │
│   │        Ryzen 5 3600X | 32GB RAM | RX 6600 | 100.113.30.52           │ │
│   │                                                                       │ │
│   │   ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐                │ │
│   │   │ Browser │  │  Code   │  │  File   │  │ Desktop │                │ │
│   │   │ Control │  │  Exec   │  │   Ops   │  │ Control │                │ │
│   │   └─────────┘  └─────────┘  └─────────┘  └─────────┘                │ │
│   └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start (5 Minutes)

### Prerequisites
- Docker & Docker Compose installed on Bangkok Node
- At least one AI API key (Gemini, Claude, or OpenAI)
- Tailscale connected

### 1. Clone & Configure

```bash
# SSH into your Bangkok Node
ssh ubuntu@100.113.30.52

# Clone the repo
git clone https://github.com/swanhtet01/swanhtet01.github.io.git
cd swanhtet01.github.io/hyper_unicorn

# Configure environment
cp .env.template .env
nano .env  # Add your API keys
```

### 2. Launch

```bash
# Start everything
docker-compose up -d

# Check status
docker-compose ps
```

### 3. Access

| Service | URL | Description |
|---------|-----|-------------|
| **Alfred Dashboard** | http://100.113.30.52:8501 | Main control interface |
| **MCA API** | http://100.113.30.52:8080 | Master Control Agent |
| **n8n Workflows** | http://100.113.30.52:5678 | Automation engine |
| **Grafana** | http://100.113.30.52:3000 | Monitoring dashboards |

---

## 🧠 How It Works

### The Intelligence Fabric

Instead of running local LLMs (limited by 8GB VRAM), HYPER UNICORN uses **cloud AI APIs** for maximum intelligence:

| Model | Use Case | Speed | Cost |
|-------|----------|-------|------|
| **Gemini 2.0 Flash** | Fast tasks, routing | ~150 tok/s | $0.075/1M |
| **Claude 3.5 Sonnet** | Complex reasoning | ~80 tok/s | $3/1M |
| **GPT-4o** | Code generation | ~100 tok/s | $5/1M |

The system automatically routes tasks to the optimal model based on:
- Task complexity
- Required capabilities
- Cost constraints
- Latency requirements

### The Agent Constellation

Six specialized agents work together:

| Agent | Role | Capabilities |
|-------|------|--------------|
| **Researcher** | Deep research & analysis | Web search, document analysis, synthesis |
| **Coder** | Software development | Code generation, debugging, architecture |
| **Writer** | Content creation | Writing, editing, formatting |
| **Analyst** | Data analysis | Statistics, visualization, reporting |
| **Automator** | Task automation | Browser control, API integration |
| **Coordinator** | Project management | Planning, delegation, monitoring |

### The Memory Cortex

Agents remember and learn:

- **Working Memory**: Active task context (in-process)
- **Short-term Memory**: Recent interactions (Redis, 24h TTL)
- **Long-term Memory**: Persistent knowledge (Qdrant vectors)
- **Episodic Memory**: Task history and learnings

---

## 📋 Example Use Cases

### 1. Research & Report Generation

```
Goal: "Research the top 5 AI agent frameworks and create a comparison report"

→ Researcher: Searches web, analyzes documentation
→ Analyst: Compares features, creates charts
→ Writer: Drafts comprehensive report
→ Result: Professional PDF report in 10 minutes
```

### 2. Code Development

```
Goal: "Build a REST API for user authentication with JWT"

→ Coder: Designs architecture, writes code
→ Researcher: Checks security best practices
→ Coder: Implements tests, documentation
→ Result: Production-ready API with tests
```

### 3. Workflow Automation

```
Goal: "Monitor competitor pricing and alert me of changes"

→ Automator: Sets up web scraping workflow
→ Analyst: Creates price tracking dashboard
→ Coordinator: Schedules daily checks
→ Result: Automated monitoring system
```

---

## 🔧 Configuration

### API Keys (Required)

At minimum, you need ONE of these:

```bash
# .env file
GEMINI_API_KEY=your_key      # Recommended for cost
ANTHROPIC_API_KEY=your_key   # Recommended for quality
OPENAI_API_KEY=your_key      # Recommended for code
```

### Multi-Purpose Mode

Your Bangkok Node can switch between modes:

```bash
# Set in .env
NODE_MODE=autonomous  # Full agent workforce (default)
NODE_MODE=gaming      # Pause agents for gaming
NODE_MODE=hybrid      # Light agents only
```

---

## 📊 Monitoring

### Grafana Dashboards

Access at http://100.113.30.52:3000

- **System Overview**: CPU, RAM, GPU usage
- **Agent Performance**: Task completion rates
- **API Usage**: Calls, costs, latency
- **Memory Stats**: Vector DB size, cache hits

### Prometheus Metrics

Access at http://100.113.30.52:9090

```promql
# Example queries
rate(mca_tasks_completed_total[5m])
histogram_quantile(0.95, mca_task_duration_seconds_bucket)
sum(mca_api_cost_dollars_total)
```

---

## 🛠 Development

### Project Structure

```
hyper_unicorn/
├── core/
│   ├── intelligence_fabric.py   # Multi-model router
│   └── master_control_agent.py  # Orchestration brain
├── memory/
│   └── memory_cortex.py         # Persistent memory
├── tools/
│   └── tool_ecosystem.py        # MCP-compatible tools
├── interfaces/
│   └── alfred_dashboard.py      # Streamlit UI
├── docker/
│   ├── Dockerfile.mca
│   ├── Dockerfile.dashboard
│   └── Dockerfile.sandbox
├── config/
│   ├── prometheus.yml
│   └── nginx/
├── docker-compose.yml
├── requirements.txt
└── .env.template
```

### Adding New Tools

```python
from tools.tool_ecosystem import BaseTool, ToolDefinition, ToolCategory

class MyCustomTool(BaseTool):
    def __init__(self):
        super().__init__(ToolDefinition(
            name="my_tool",
            description="Does something awesome",
            category=ToolCategory.API,
            input_schema={
                "type": "object",
                "properties": {
                    "param": {"type": "string"}
                }
            }
        ))
    
    async def execute(self, param: str) -> Dict:
        # Your implementation
        return {"success": True, "result": "..."}
```

### Adding New Agents

```python
from core.master_control_agent import AgentSpec, AGENT_CONSTELLATION

AGENT_CONSTELLATION["my_agent"] = AgentSpec(
    id="my_agent",
    name="My Custom Agent",
    role="Does specialized tasks",
    capabilities=["skill1", "skill2"],
    tools=["tool1", "tool2"],
    system_prompt="You are an expert at..."
)
```

---

## 🔐 Security

### Network Security

- All services run on Tailscale VPN (not exposed to internet)
- Inter-service communication via Docker network
- API keys stored in environment variables

### Sandbox Security

- Code execution in isolated containers
- No root access in sandboxes
- Resource limits enforced

### Best Practices

```bash
# Use strong passwords
N8N_PASSWORD=$(openssl rand -base64 32)
GRAFANA_PASSWORD=$(openssl rand -base64 32)

# Rotate API keys regularly
# Monitor API usage for anomalies
```

---

## 🚨 Troubleshooting

### Services Not Starting

```bash
# Check logs
docker-compose logs mca
docker-compose logs dashboard

# Restart services
docker-compose restart
```

### API Errors

```bash
# Test API connectivity
curl http://localhost:8080/health

# Check API key validity
python -c "import os; print(os.getenv('GEMINI_API_KEY')[:10])"
```

### Memory Issues

```bash
# Check Qdrant status
curl http://localhost:6333/health

# Check Redis status
docker exec hyper-redis redis-cli ping
```

---

## 📈 Roadmap

### Phase 1 (Current)
- [x] Intelligence Fabric with multi-model routing
- [x] Memory Cortex with vector storage
- [x] Agent Constellation (6 agents)
- [x] Alfred Dashboard
- [x] Docker deployment

### Phase 2 (Next)
- [ ] Voice interface (ElevenLabs integration)
- [ ] Mobile app for remote control
- [ ] Slack/Discord bot integration
- [ ] Scheduled autonomous tasks

### Phase 3 (Future)
- [ ] Multi-node clustering
- [ ] Custom model fine-tuning
- [ ] Marketplace for agent templates
- [ ] Enterprise features

---

## 📄 License

MIT License - SuperMega.dev

---

## 🤝 Support

- **Issues**: GitHub Issues
- **Discord**: [SuperMega Community](https://discord.gg/supermega)
- **Email**: support@supermega.dev

---

**Built with 🦄 by SuperMega.dev**

*"Your AI workforce, working 24/7 so you don't have to."*
