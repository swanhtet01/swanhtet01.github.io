# Swan AI Infrastructure

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SWAN DISTRIBUTED AI SYSTEM                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                           ┌─────────────────┐                               │
│                           │   TAILSCALE     │                               │
│                           │   MESH VPN      │                               │
│                           └────────┬────────┘                               │
│                                    │                                        │
│         ┌──────────────────────────┼──────────────────────────┐            │
│         │                          │                          │            │
│         ▼                          │                          ▼            │
│  ┌─────────────────┐               │               ┌─────────────────┐     │
│  │   AWS INSTANCE  │               │               │    BKK NODE     │     │
│  │   (Coordinator) │◄──────────────┴──────────────►│    (Worker)     │     │
│  │                 │                               │                 │     │
│  │  ┌───────────┐  │                               │  ┌───────────┐  │     │
│  │  │ API Gate  │  │    Task Queue (Redis)         │  │  Worker   │  │     │
│  │  │   :8000   │  │◄─────────────────────────────►│  │  Process  │  │     │
│  │  └───────────┘  │                               │  └───────────┘  │     │
│  │                 │                               │                 │     │
│  │  ┌───────────┐  │                               │  ┌───────────┐  │     │
│  │  │   Redis   │  │                               │  │ File Sync │  │     │
│  │  │   :6379   │  │                               │  │   Agent   │  │     │
│  │  └───────────┘  │                               │  └───────────┘  │     │
│  │                 │                               │                 │     │
│  │  ┌───────────┐  │                               │  ┌───────────┐  │     │
│  │  │    N8N    │  │                               │  │    N8N    │  │     │
│  │  │   :5678   │  │                               │  │   :5678   │  │     │
│  │  └───────────┘  │                               │  └───────────┘  │     │
│  │                 │                               │                 │     │
│  │  ┌───────────┐  │                               │  ┌───────────┐  │     │
│  │  │ Grafana   │  │                               │  │  rclone   │  │     │
│  │  │   :3001   │  │                               │  │  GDrive   │  │     │
│  │  └───────────┘  │                               │  └───────────┘  │     │
│  │                 │                               │                 │     │
│  └─────────────────┘                               └─────────────────┘     │
│                                                                             │
│                           EXTERNAL SERVICES                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │   Claude    │  │   Gemini    │  │   OpenAI    │  │   GDrive    │       │
│  │     API     │  │     API     │  │     API     │  │    Sync     │       │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Components

### AWS Instance (Coordinator)
- **Role**: Central coordinator, public-facing services, high availability
- **Location**: Singapore (ap-southeast-1)
- **Services**:
  - API Gateway (FastAPI) - Task submission, node management
  - Redis - Task queue, state management
  - N8N - Workflow automation (triggers, webhooks)
  - Grafana - Monitoring dashboard
  - Prometheus - Metrics collection
  - Uptime Kuma - Service monitoring

### BKK Node (Worker)
- **Role**: Heavy processing, file sync, cost-free compute
- **Location**: Bangkok, Thailand (residential)
- **Services**:
  - Worker Node - Executes tasks from queue
  - File Sync Agent - Google Drive ↔ Platform sync
  - N8N - Local workflow automation
  - rclone - Cloud storage sync

## Task Flow

```
1. Task Submitted
   └─► AWS API Gateway (/tasks/submit)
       └─► Redis Queue (tasks:bkk or tasks:any)
           └─► BKK Worker polls queue
               └─► Execute task (AI processing, file handling)
                   └─► Report result to AWS
                       └─► Store in Redis (task_status)
```

## Workload Distribution

| Task Type | Primary Node | Reason |
|-----------|--------------|--------|
| API endpoints | AWS | High availability, static IP |
| Database hosting | AWS | Reliability, backups |
| Task scheduling | AWS | 24/7 uptime guarantee |
| File processing | BKK | Free compute, no hourly cost |
| Web scraping | BKK | Residential IP, less blocking |
| Heavy AI tasks | BKK | No compute cost |
| Report generation | BKK | Overnight processing |
| Real-time alerts | AWS | Low latency, high uptime |

## Setup Instructions

### Prerequisites
- AWS account with EC2 instance (t3.small or larger)
- Windows PC in Bangkok (32GB RAM)
- Tailscale account
- API keys: Anthropic, OpenAI, Gemini

### Step 1: AWS Instance Setup
```bash
# SSH into AWS instance
ssh -i your-key.pem ubuntu@your-aws-ip

# Download and run setup script
curl -O https://raw.githubusercontent.com/your-repo/swan-infrastructure/main/aws-instance/setup-aws-instance.sh
chmod +x setup-aws-instance.sh
sudo ./setup-aws-instance.sh
```

### Step 2: BKK Node Setup
```powershell
# Open PowerShell as Administrator
Set-ExecutionPolicy Bypass -Scope Process -Force

# Download and run setup script
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/your-repo/swan-infrastructure/main/bkk-node/setup-bkk-node.ps1" -OutFile "setup-bkk-node.ps1"
.\setup-bkk-node.ps1
```

### Step 3: Connect Tailscale
```bash
# AWS
sudo tailscale up --hostname=swan-aws

# BKK (via Tailscale app)
# Set hostname to swan-bkk
```

### Step 4: Configure Environment Variables

**AWS Instance** (`/etc/environment`):
```
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AI...
REDIS_PASSWORD=YOUR_REDIS_PASSWORD_HERE
```

**BKK Node** (System Environment Variables):
```
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AI...
AWS_API_URL=http://swan-aws:8000
```

### Step 5: Start Services

**AWS**:
```bash
sudo systemctl start swan-api swan-celery swan-n8n
sudo systemctl status swan-api
```

**BKK**:
```powershell
# Start worker
python C:\SwanAI\agents\worker_node.py

# Or run as scheduled task (auto-starts on boot)
```

## API Reference

### Submit Task
```bash
POST /tasks/submit
{
  "task_type": "process_file",
  "payload": {
    "file_url": "https://...",
    "processing_type": "extract"
  },
  "priority": 5,
  "target_node": "bkk"
}
```

### Check Task Status
```bash
GET /tasks/{task_id}
```

### List Nodes
```bash
GET /nodes
```

### AI Chat
```bash
POST /ai/chat
{
  "messages": [
    {"role": "user", "content": "Hello"}
  ]
}
```

### Health Check
```bash
GET /health
```

## Monitoring

### Grafana Dashboard
- URL: http://swan-aws:3001
- Default login: admin / YOUR_GRAFANA_PASSWORD_HERE
- Dashboards: System metrics, task queue, node status

### Uptime Kuma
- URL: http://swan-aws:3002
- Monitor: All services, external APIs

### Logs
- AWS: `/opt/swan-ai/logs/`
- BKK: `C:\SwanAI\logs\`

## Troubleshooting

### BKK Node not connecting
```powershell
# Check Tailscale
tailscale status

# Test connection
ping swan-aws

# Check worker logs
Get-Content C:\SwanAI\logs\worker_*.log -Tail 50
```

### Tasks not processing
```bash
# Check Redis
redis-cli -a YOUR_REDIS_PASSWORD_HERE ping

# Check queue
redis-cli -a YOUR_REDIS_PASSWORD_HERE zrange tasks:bkk 0 -1

# Check worker status
curl http://swan-aws:8000/nodes
```

### API Gateway errors
```bash
# Check service
sudo systemctl status swan-api

# View logs
sudo journalctl -u swan-api -f
```

## Security Considerations

1. **Tailscale**: All inter-node traffic encrypted
2. **Redis**: Password protected, not exposed publicly
3. **API Keys**: Stored in environment variables, not in code
4. **Firewall**: Only necessary ports open
5. **Updates**: Regular security updates via apt/choco

## Cost Analysis

| Component | Monthly Cost |
|-----------|--------------|
| AWS t3.small | ~$15 |
| BKK electricity | ~$5 |
| API calls (est.) | ~$20-50 |
| **Total** | **~$40-70** |

vs. Running everything on cloud: ~$200-500/month
