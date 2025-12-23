# 🚀 HYPER UNICORN Quick Start Guide

Get your AI agent infrastructure running in 10 minutes.

---

## Prerequisites

- **Bangkok Node** (or any machine with Docker)
- **Tailscale** installed and connected
- **API Keys** for at least one AI provider (Gemini, Claude, or OpenAI)

---

## Step 1: Clone the Repository

```bash
# On your Bangkok Node (via SSH or remote desktop)
git clone https://github.com/swanhtet01/swanhtet01.github.io.git
cd swanhtet01.github.io/hyper_unicorn
```

---

## Step 2: Configure Environment

```bash
# Copy the template
cp .env.template .env

# Edit with your API keys
nano .env
```

**Minimum required keys:**
```env
# At least one AI provider
GEMINI_API_KEY=your_gemini_key
# OR
ANTHROPIC_API_KEY=your_anthropic_key
# OR
OPENAI_API_KEY=your_openai_key
```

**Optional but recommended:**
```env
# For research capabilities
TAVILY_API_KEY=your_tavily_key

# For code sandboxes
E2B_API_KEY=your_e2b_key
```

---

## Step 3: Deploy with Docker

```bash
# Make deploy script executable
chmod +x scripts/deploy.sh

# Run deployment
./scripts/deploy.sh
```

This will:
1. Build all Docker images
2. Start the services (MCA, Dashboard, Redis, Qdrant, n8n)
3. Initialize the memory systems

---

## Step 4: Access the Dashboard

Open in your browser:
- **Alfred Dashboard**: http://localhost:8501 (or http://100.113.30.52:8501 via Tailscale)
- **n8n Workflows**: http://localhost:5678
- **MCA API**: http://localhost:8080/docs

---

## Step 5: Submit Your First Task

### Via Dashboard
1. Open Alfred Dashboard
2. Enter a goal: "Research the latest AI agent frameworks and create a summary report"
3. Click "Submit"
4. Watch the agents work!

### Via API
```bash
curl -X POST http://localhost:8080/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "Research the latest AI agent frameworks",
    "priority": "high"
  }'
```

### Via Python
```python
from hyper_unicorn.core.master_control_agent import MasterControlAgent

mca = MasterControlAgent()
result = await mca.execute_goal("Research the latest AI agent frameworks")
print(result)
```

---

## Quick Commands

### Check System Status
```bash
docker compose ps
```

### View Logs
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f mca
```

### Restart Services
```bash
docker compose restart
```

### Stop Everything
```bash
docker compose down
```

---

## Available Tools

| Tool | Command | Description |
|------|---------|-------------|
| **Research** | `universal_research` | Multi-source web research |
| **Code** | `python_execute` | Execute Python code |
| **Browser** | `browser_navigate` | Web automation |
| **Files** | `file_read`, `file_write` | File operations |
| **Gmail** | Via MCP | Email management |
| **Calendar** | Via MCP | Schedule management |
| **Drive** | Via rclone | File storage |

---

## Troubleshooting

### Docker not starting
```bash
# Check Docker status
sudo systemctl status docker

# Start Docker
sudo systemctl start docker
```

### API key errors
```bash
# Verify environment variables are loaded
docker compose exec mca env | grep API_KEY
```

### Memory issues
```bash
# Check container resources
docker stats
```

---

## Next Steps

1. **Customize Workflows**: Edit `workflows/n8n_workflows.json`
2. **Add More Tools**: Extend `tools/tool_ecosystem.py`
3. **Configure Agents**: Modify `core/master_control_agent.py`
4. **Set Up Monitoring**: Access Grafana at http://localhost:3000

---

## Support

- **Documentation**: See `docs/` folder
- **Issues**: GitHub Issues
- **Architecture**: See `README.md`

---

**Happy Automating! 🦄**
