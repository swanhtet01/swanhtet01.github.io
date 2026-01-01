#!/bin/bash
# ============================================================
# AWS INSTANCE SETUP SCRIPT - Linux (Ubuntu)
# Swan's Cloud AI Infrastructure Node
# ============================================================
# Run: chmod +x setup-aws-instance.sh && sudo ./setup-aws-instance.sh
# ============================================================

set -e

echo "========================================"
echo "  AWS NODE SETUP - Swan's AI Infra"
echo "========================================"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Base directory
BASE_DIR="/opt/swan-ai"
sudo mkdir -p $BASE_DIR/{agents,data,logs,config,redis,monitoring,nginx}
sudo chown -R $USER:$USER $BASE_DIR

# ============================================================
# 1. SYSTEM UPDATES
# ============================================================
echo -e "\n${YELLOW}[1/10] Updating system...${NC}"
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git build-essential software-properties-common

# ============================================================
# 2. INSTALL DOCKER
# ============================================================
echo -e "\n${YELLOW}[2/10] Installing Docker...${NC}"
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
    echo -e "${GREEN}Docker installed!${NC}"
else
    echo -e "${CYAN}Docker already installed${NC}"
fi

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# ============================================================
# 3. INSTALL TAILSCALE
# ============================================================
echo -e "\n${YELLOW}[3/10] Installing Tailscale...${NC}"
curl -fsSL https://tailscale.com/install.sh | sh
echo -e "${CYAN}Run 'sudo tailscale up' to connect${NC}"

# ============================================================
# 4. INSTALL PYTHON & PACKAGES
# ============================================================
echo -e "\n${YELLOW}[4/10] Installing Python environment...${NC}"
sudo apt install -y python3.11 python3.11-venv python3-pip

# Create virtual environment
python3.11 -m venv $BASE_DIR/venv
source $BASE_DIR/venv/bin/activate

pip install --upgrade pip
pip install \
    anthropic \
    openai \
    google-generativeai \
    fastapi \
    uvicorn \
    redis \
    celery \
    httpx \
    pydantic \
    python-multipart \
    schedule \
    psutil \
    prometheus-client \
    python-telegram-bot \
    discord.py

# ============================================================
# 5. INSTALL NODE.JS & N8N
# ============================================================
echo -e "\n${YELLOW}[5/10] Installing Node.js & n8n...${NC}"
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g n8n pm2

# ============================================================
# 6. SETUP REDIS (Task Queue)
# ============================================================
echo -e "\n${YELLOW}[6/10] Setting up Redis...${NC}"

cat > $BASE_DIR/redis/docker-compose.yml << 'EOF'
version: '3.8'
services:
  redis:
    image: redis:7-alpine
    container_name: swan-redis
    restart: always
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD:-YOUR_REDIS_PASSWORD_HERE}

volumes:
  redis_data:
EOF

cd $BASE_DIR/redis && docker-compose up -d

# ============================================================
# 7. CREATE API GATEWAY (FastAPI)
# ============================================================
echo -e "\n${YELLOW}[7/10] Creating API Gateway...${NC}"

cat > $BASE_DIR/agents/api_gateway.py << 'PYEOF'
"""
Swan AI Infrastructure - API Gateway
Central coordinator for distributed AI agents
"""
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import redis
import json
import os
from datetime import datetime
import uuid

app = FastAPI(title="Swan AI Gateway", version="1.0.0")

# Redis connection
redis_client = redis.Redis(
    host=os.getenv("REDIS_HOST", "localhost"),
    port=6379,
    password=os.getenv("REDIS_PASSWORD", "YOUR_REDIS_PASSWORD_HERE"),
    decode_responses=True
)

# ============================================================
# MODELS
# ============================================================
class Task(BaseModel):
    task_type: str  # "process_file", "generate_report", "scrape_url", etc.
    payload: Dict[str, Any]
    priority: int = 5  # 1-10, lower = higher priority
    target_node: Optional[str] = None  # "bkk", "aws", or None for auto

class TaskResult(BaseModel):
    task_id: str
    status: str
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

class NodeStatus(BaseModel):
    node_id: str
    status: str
    last_heartbeat: datetime
    cpu: float
    memory: float
    active_tasks: int

# ============================================================
# TASK QUEUE ENDPOINTS
# ============================================================
@app.post("/tasks/submit")
async def submit_task(task: Task):
    """Submit a task to the distributed queue"""
    task_id = str(uuid.uuid4())
    
    task_data = {
        "id": task_id,
        "type": task.task_type,
        "payload": task.payload,
        "priority": task.priority,
        "target_node": task.target_node,
        "status": "pending",
        "created_at": datetime.now().isoformat(),
    }
    
    # Add to queue
    queue_name = f"tasks:{task.target_node or 'any'}"
    redis_client.zadd(queue_name, {json.dumps(task_data): task.priority})
    redis_client.hset("task_status", task_id, json.dumps(task_data))
    
    return {"task_id": task_id, "status": "queued"}

@app.get("/tasks/{task_id}")
async def get_task_status(task_id: str):
    """Get status of a submitted task"""
    task_data = redis_client.hget("task_status", task_id)
    if not task_data:
        raise HTTPException(status_code=404, detail="Task not found")
    return json.loads(task_data)

@app.get("/tasks/pending")
async def get_pending_tasks(node: Optional[str] = None):
    """Get pending tasks for a node"""
    queue_name = f"tasks:{node or 'any'}"
    tasks = redis_client.zrange(queue_name, 0, -1)
    return [json.loads(t) for t in tasks]

# ============================================================
# NODE MANAGEMENT
# ============================================================
@app.post("/nodes/heartbeat")
async def node_heartbeat(status: NodeStatus):
    """Receive heartbeat from a worker node"""
    redis_client.hset(
        "nodes",
        status.node_id,
        json.dumps({
            "status": status.status,
            "last_heartbeat": status.last_heartbeat.isoformat(),
            "cpu": status.cpu,
            "memory": status.memory,
            "active_tasks": status.active_tasks
        })
    )
    redis_client.expire(f"node:{status.node_id}", 120)  # 2 min TTL
    return {"acknowledged": True}

@app.get("/nodes")
async def list_nodes():
    """List all registered nodes"""
    nodes = redis_client.hgetall("nodes")
    return {k: json.loads(v) for k, v in nodes.items()}

# ============================================================
# AI ENDPOINTS
# ============================================================
@app.post("/ai/chat")
async def ai_chat(messages: List[Dict[str, str]], model: str = "claude"):
    """Direct AI chat endpoint"""
    import anthropic
    
    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    
    response = client.messages.create(
        model="claude-3-5-sonnet-20241022",
        max_tokens=4096,
        messages=messages
    )
    
    return {"response": response.content[0].text}

@app.post("/ai/process-file")
async def process_file(file_url: str, task_type: str, background_tasks: BackgroundTasks):
    """Queue file processing task"""
    task = Task(
        task_type="process_file",
        payload={"file_url": file_url, "processing_type": task_type},
        target_node="bkk"  # Heavy processing goes to BKK
    )
    result = await submit_task(task)
    return result

# ============================================================
# MONITORING
# ============================================================
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        redis_client.ping()
        redis_status = "healthy"
    except:
        redis_status = "unhealthy"
    
    return {
        "status": "healthy",
        "redis": redis_status,
        "timestamp": datetime.now().isoformat()
    }

@app.get("/metrics")
async def get_metrics():
    """Get system metrics"""
    import psutil
    
    return {
        "cpu_percent": psutil.cpu_percent(),
        "memory_percent": psutil.virtual_memory().percent,
        "disk_percent": psutil.disk_usage('/').percent,
        "pending_tasks": redis_client.zcard("tasks:any"),
        "active_nodes": redis_client.hlen("nodes")
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
PYEOF

# ============================================================
# 8. CREATE CELERY WORKER
# ============================================================
echo -e "\n${YELLOW}[8/10] Creating Celery worker...${NC}"

cat > $BASE_DIR/agents/celery_worker.py << 'PYEOF'
"""
Swan AI - Celery Task Worker
Handles distributed task execution
"""
from celery import Celery
import os
import anthropic
import google.generativeai as genai

# Configure Celery
app = Celery(
    'swan_tasks',
    broker=f'redis://:{os.getenv("REDIS_PASSWORD", "YOUR_REDIS_PASSWORD_HERE")}@localhost:6379/0',
    backend=f'redis://:{os.getenv("REDIS_PASSWORD", "YOUR_REDIS_PASSWORD_HERE")}@localhost:6379/1'
)

app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='Asia/Bangkok',
    enable_utc=True,
)

@app.task(name='process_with_claude')
def process_with_claude(prompt: str, context: str = None):
    """Process text with Claude"""
    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    
    messages = []
    if context:
        messages.append({"role": "user", "content": context})
    messages.append({"role": "user", "content": prompt})
    
    response = client.messages.create(
        model="claude-3-5-sonnet-20241022",
        max_tokens=4096,
        messages=messages
    )
    
    return response.content[0].text

@app.task(name='process_with_gemini')
def process_with_gemini(prompt: str, image_url: str = None):
    """Process with Gemini (good for vision tasks)"""
    genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
    model = genai.GenerativeModel('gemini-1.5-flash')
    
    if image_url:
        # Handle image processing
        import httpx
        image_data = httpx.get(image_url).content
        response = model.generate_content([prompt, image_data])
    else:
        response = model.generate_content(prompt)
    
    return response.text

@app.task(name='generate_report')
def generate_report(report_type: str, data: dict):
    """Generate a report using AI"""
    prompt = f"""Generate a {report_type} report based on this data:
    {data}
    
    Format it professionally with sections and key insights."""
    
    return process_with_claude(prompt)

@app.task(name='scrape_and_analyze')
def scrape_and_analyze(url: str, analysis_prompt: str):
    """Scrape a URL and analyze content"""
    import httpx
    from bs4 import BeautifulSoup
    
    response = httpx.get(url)
    soup = BeautifulSoup(response.text, 'html.parser')
    text = soup.get_text()[:10000]  # Limit text
    
    return process_with_claude(analysis_prompt, context=f"Web content:\n{text}")
PYEOF

# ============================================================
# 9. SETUP MONITORING (Prometheus + Grafana)
# ============================================================
echo -e "\n${YELLOW}[9/10] Setting up monitoring...${NC}"

cat > $BASE_DIR/monitoring/docker-compose.yml << 'EOF'
version: '3.8'
services:
  prometheus:
    image: prom/prometheus:latest
    container_name: swan-prometheus
    restart: always
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus

  grafana:
    image: grafana/grafana:latest
    container_name: swan-grafana
    restart: always
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=YOUR_GRAFANA_PASSWORD_HERE
    volumes:
      - grafana_data:/var/lib/grafana

  uptime-kuma:
    image: louislam/uptime-kuma:latest
    container_name: swan-uptime
    restart: always
    ports:
      - "3002:3001"
    volumes:
      - uptime_data:/app/data

volumes:
  prometheus_data:
  grafana_data:
  uptime_data:
EOF

cat > $BASE_DIR/monitoring/prometheus.yml << 'EOF'
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'swan-api'
    static_configs:
      - targets: ['localhost:8000']
    metrics_path: /metrics

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['localhost:9100']
EOF

cd $BASE_DIR/monitoring && docker-compose up -d

# ============================================================
# 10. CREATE SYSTEMD SERVICES
# ============================================================
echo -e "\n${YELLOW}[10/10] Creating systemd services...${NC}"

# API Gateway service
sudo cat > /etc/systemd/system/swan-api.service << EOF
[Unit]
Description=Swan AI API Gateway
After=network.target redis.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$BASE_DIR/agents
Environment="PATH=$BASE_DIR/venv/bin"
ExecStart=$BASE_DIR/venv/bin/uvicorn api_gateway:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Celery worker service
sudo cat > /etc/systemd/system/swan-celery.service << EOF
[Unit]
Description=Swan AI Celery Worker
After=network.target redis.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$BASE_DIR/agents
Environment="PATH=$BASE_DIR/venv/bin"
ExecStart=$BASE_DIR/venv/bin/celery -A celery_worker worker --loglevel=info
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# N8N service
sudo cat > /etc/systemd/system/swan-n8n.service << EOF
[Unit]
Description=Swan N8N Workflow Automation
After=network.target

[Service]
Type=simple
User=$USER
Environment="N8N_PORT=5678"
Environment="N8N_PROTOCOL=http"
Environment="GENERIC_TIMEZONE=Asia/Bangkok"
Environment="N8N_USER_FOLDER=$BASE_DIR/n8n"
ExecStart=/usr/bin/n8n start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Enable and start services
sudo systemctl daemon-reload
sudo systemctl enable swan-api swan-celery swan-n8n
sudo systemctl start swan-api swan-celery swan-n8n

# ============================================================
# DONE
# ============================================================
echo -e "\n${GREEN}========================================"
echo "  AWS NODE SETUP COMPLETE!"
echo "========================================${NC}"

echo -e "
${CYAN}SERVICES RUNNING:${NC}
- API Gateway: http://localhost:8000
- N8N: http://localhost:5678
- Grafana: http://localhost:3001 (admin/YOUR_GRAFANA_PASSWORD_HERE)
- Uptime Kuma: http://localhost:3002
- Prometheus: http://localhost:9090
- Redis: localhost:6379

${CYAN}NEXT STEPS:${NC}
1. Set environment variables in /etc/environment:
   ANTHROPIC_API_KEY=your_key
   OPENAI_API_KEY=your_key
   GEMINI_API_KEY=your_key
   REDIS_PASSWORD=YOUR_REDIS_PASSWORD_HERE

2. Connect Tailscale:
   sudo tailscale up

3. Configure firewall:
   sudo ufw allow 22,80,443,5678,8000/tcp
   sudo ufw enable

4. Setup SSL with Caddy/Nginx (optional)

${CYAN}API ENDPOINTS:${NC}
- POST /tasks/submit - Submit a task
- GET /tasks/{id} - Check task status
- GET /nodes - List connected nodes
- POST /ai/chat - Direct AI chat
- GET /health - Health check
- GET /metrics - System metrics
"
