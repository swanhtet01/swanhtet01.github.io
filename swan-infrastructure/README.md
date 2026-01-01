# Swan AI Infrastructure

Distributed AI infrastructure across AWS (Singapore) and BKK Node (Bangkok Windows PC).

## Quick Start

### 1. AWS Instance Setup (5 minutes)
```bash
ssh ubuntu@your-aws-ip
curl -O https://raw.githubusercontent.com/swan/infra/main/aws-instance/setup-aws-instance.sh
chmod +x setup-aws-instance.sh && sudo ./setup-aws-instance.sh
```

### 2. BKK Node Setup (10 minutes)
```powershell
# Run PowerShell as Administrator
Set-ExecutionPolicy Bypass -Scope Process -Force
.\setup-bkk-node.ps1
```

### 3. Connect via Tailscale
```bash
# AWS
sudo tailscale up --hostname=swan-aws

# BKK - use Tailscale app, set hostname to swan-bkk
```

### 4. Set API Keys
```bash
# AWS: /etc/environment
# BKK: System Environment Variables

ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AI...
```

### 5. Verify Connection
```bash
# From AWS
curl http://swan-bkk:8080/health

# From BKK
curl http://swan-aws:8000/health
```

## Directory Structure

```
swan-infrastructure/
├── aws-instance/
│   └── setup-aws-instance.sh    # AWS setup script
├── bkk-node/
│   ├── setup-bkk-node.ps1       # Windows setup script
│   └── worker_node.py           # Distributed worker
├── shared/
│   ├── tailscale-mesh.md        # VPN setup guide
│   └── n8n-workflows/           # Automation templates
└── docs/
    └── INFRASTRUCTURE.md        # Full documentation
```

## Services

| Service | AWS | BKK | Port |
|---------|-----|-----|------|
| API Gateway | ✅ | - | 8000 |
| Redis | ✅ | - | 6379 |
| N8N | ✅ | ✅ | 5678 |
| Grafana | ✅ | - | 3001 |
| Worker | - | ✅ | - |
| File Sync | - | ✅ | - |

## Common Commands

```bash
# Submit a task
curl -X POST http://swan-aws:8000/tasks/submit \
  -H "Content-Type: application/json" \
  -d '{"task_type": "ai_chat", "payload": {"messages": [{"role": "user", "content": "Hello"}]}}'

# Check nodes
curl http://swan-aws:8000/nodes

# View metrics
curl http://swan-aws:8000/metrics
```

## Support

- Full docs: [docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md)
- Tailscale setup: [shared/tailscale-mesh.md](shared/tailscale-mesh.md)
