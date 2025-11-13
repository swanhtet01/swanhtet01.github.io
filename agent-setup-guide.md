# Autonomous Agent Setup Guide - AWS EC2

## EC2 Instance Configuration

### Instance Specifications
- **Instance Type**: t3.xlarge (4 vCPU, 16GB RAM)
- **OS**: Ubuntu 22.04 LTS
- **Storage**: 100GB SSD (gp3)
- **Region**: us-east-1 (or Asia Pacific for Yangon)

---

## Installation Script

```bash
#!/bin/bash
# SuperMega Agent Environment Setup

set -e

echo "🚀 Setting up SuperMega Agent Environment..."

# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install essential tools
sudo apt-get install -y \
    git curl wget vim htop \
    build-essential python3-pip \
    docker.io docker-compose \
    redis-server postgresql-client

# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install GitHub CLI
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt-get update
sudo apt-get install -y gh

# Install GitHub Copilot CLI
npm install -g @githubnext/github-copilot-cli

# Setup GitHub Copilot CLI auth (will be automated with token)
echo "export GITHUB_TOKEN=your_token_here" >> ~/.bashrc

# Install Python packages for agents
pip3 install --upgrade pip
pip3 install \
    langchain langchain-openai langchain-anthropic \
    openai anthropic google-generativeai \
    fastapi uvicorn pydantic \
    sqlalchemy psycopg2-binary \
    boto3 awscli \
    redis celery \
    python-dotenv \
    httpx aiohttp \
    pandas numpy \
    prometheus-client

# Install AWS CLI v2
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
rm -rf aws awscliv2.zip

# Configure Docker
sudo usermod -aG docker ubuntu
sudo systemctl enable docker
sudo systemctl start docker

# Create agent directory structure
mkdir -p ~/supermega-agents/{
    config,
    logs,
    models,
    tasks,
    scripts,
    data
}

echo "✅ Base installation complete!"
```

---

## Self-Sovereign LLM Stack
1. **Local reflex model**: ship the AMI with a quantized small frontier model (e.g., Mixtral 8x7B or Phi-3) running via ollama or LLM. This model handles rapid reasoning, log summarization, and health checks even if external APIs are unreachable.
2. **Provider connectors**: install Bedrock, OpenAI, Claude, and Gemini SDKs plus configure Interface VPC Endpoints so traffic never leaves the private network unencrypted. Secrets stay in AWS Secrets Manager and are injected at runtime via IRSA.
3. **Routing microservice**: deploy gent-llm-router (FastAPI) in Docker. It inspects each task (latency target, cost sensitivity, security level) and decides whether to use the local model or escalate to a hosted model. Feedback is logged to DynamoDB so routing improves automatically.
4. **Copilot CLI autonomy**: GitHub Copilot CLI runs headlessly with COPILOT_TOKEN from Secrets Manager. Agents can call gh copilot explain / gh copilot suggest without human terminals, enabling full-code workflows.
5. **Health reporting**: every minute, agents emit a DualLLMHeartbeat metric (CloudWatch namespace SuperMega/Agents) and push structured logs to OpenSearch for Conscience-agent introspection.

> Bake the above into the EC2 Image Builder pipeline so every new agent host is self-sovereign by default.
## Agent Orchestration System

### Main Agent Controller (`agent-controller.py`)

```python
import os
import asyncio
from typing import Dict, List
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.tools import Tool
import boto3
import redis
import json
from datetime import datetime

class SuperMegaAgentOrchestrator:
    """
    Central orchestrator for all autonomous agents
    Manages GitHub Copilot CLI, OpenAI Codex, Claude, and custom agents
    """
    
    def __init__(self):
        self.openai_client = ChatOpenAI(
            model="gpt-4-turbo-preview",
            temperature=0.1
        )
        self.claude_client = ChatAnthropic(
            model="claude-3-opus-20240229",
            temperature=0.1
        )
        self.codex_client = ChatOpenAI(
            model="gpt-4",
            temperature=0
        )
        
        # AWS clients
        self.s3 = boto3.client('s3')
        self.dynamodb = boto3.resource('dynamodb')
        self.sagemaker = boto3.client('sagemaker-runtime')
        self.ses = boto3.client('ses')
        
        # Redis for task queue
        self.redis = redis.Redis(host='localhost', port=6379, decode_responses=True)
        
        # Initialize agent tools
        self.tools = self._setup_tools()
        
    def _setup_tools(self) -> List[Tool]:
        """Setup tools available to all agents"""
        return [
            Tool(
                name="github_copilot_suggest",
                func=self._copilot_suggest,
                description="Use GitHub Copilot CLI to generate code suggestions"
            ),
            Tool(
                name="openai_codex_refactor",
                func=self._codex_refactor,
                description="Use OpenAI Codex for complex code refactoring"
            ),
            Tool(
                name="query_database",
                func=self._query_rds,
                description="Query PostgreSQL database for manufacturing data"
            ),
            Tool(
                name="analyze_defect_image",
                func=self._analyze_defect,
                description="Analyze product images for defects using AWS Rekognition"
            ),
            Tool(
                name="send_supplier_email",
                func=self._send_email,
                description="Send automated email to suppliers"
            ),
            Tool(
                name="calculate_oee",
                func=self._calculate_oee,
                description="Calculate OEE metrics from production data"
            ),
            Tool(
                name="predict_maintenance",
                func=self._predict_maintenance,
                description="Predict equipment maintenance needs using ML"
            )
        ]
    
    async def _copilot_suggest(self, prompt: str) -> str:
        """Use GitHub Copilot CLI for suggestions"""
        import subprocess
        try:
            result = subprocess.run(
                ['github-copilot-cli', 'suggest', '--prompt', prompt],
                capture_output=True,
                text=True,
                timeout=30
            )
            return result.stdout
        except Exception as e:
            return f"Error: {str(e)}"
    
    async def _codex_refactor(self, code: str) -> str:
        """Use OpenAI Codex for refactoring"""
        prompt = f"Refactor this code for production:\n\n{code}"
        response = await self.codex_client.ainvoke(prompt)
        return response.content
    
    async def _query_rds(self, query: str) -> str:
        """Query PostgreSQL via SQLAlchemy"""
        # Implementation with proper connection pooling
        pass
    
    async def _analyze_defect(self, image_s3_url: str) -> Dict:
        """Analyze defect using AWS Rekognition"""
        rekognition = boto3.client('rekognition')
        response = rekognition.detect_labels(
            Image={'S3Object': {'Bucket': 'supermega-defects', 'Name': image_s3_url}},
            MaxLabels=10,
            MinConfidence=80
        )
        return response
    
    async def _send_email(self, to: str, subject: str, body: str) -> bool:
        """Send email via AWS SES"""
        try:
            self.ses.send_email(
                Source='noreply@supermega.dev',
                Destination={'ToAddresses': [to]},
                Message={
                    'Subject': {'Data': subject},
                    'Body': {'Text': {'Data': body}}
                }
            )
            return True
        except Exception as e:
            print(f"Email error: {e}")
            return False
    
    async def _calculate_oee(self, machine_id: str, shift_date: str) -> Dict:
        """Calculate OEE from DynamoDB data"""
        table = self.dynamodb.Table('production_logs')
        # Implementation for OEE calculation
        pass
    
    async def _predict_maintenance(self, equipment_id: str) -> Dict:
        """Call SageMaker endpoint for predictive maintenance"""
        response = self.sagemaker.invoke_endpoint(
            EndpointName='maintenance-predictor',
            ContentType='application/json',
            Body=json.dumps({'equipment_id': equipment_id})
        )
        return json.loads(response['Body'].read())
    
    async def create_development_agent(self):
        """Agent for code generation and deployment"""
        prompt = ChatPromptTemplate.from_messages([
            ("system", """You are a senior software engineer with access to:
            - GitHub Copilot CLI for code suggestions
            - OpenAI Codex for refactoring
            - AWS services for deployment
            
            Your job is to write, test, and deploy production-ready code autonomously.
            Always follow best practices and write comprehensive tests."""),
            MessagesPlaceholder(variable_name="chat_history"),
            ("human", "{input}"),
            MessagesPlaceholder(variable_name="agent_scratchpad")
        ])
        
        agent = create_openai_functions_agent(self.openai_client, self.tools, prompt)
        return AgentExecutor(agent=agent, tools=self.tools, verbose=True)
    
    async def create_manufacturing_agent(self):
        """Agent for manufacturing intelligence"""
        prompt = ChatPromptTemplate.from_messages([
            ("system", """You are a manufacturing intelligence expert with access to:
            - Real-time production data
            - Quality inspection results
            - Equipment sensor data
            - Inventory levels
            
            Analyze data, identify issues, and provide actionable recommendations."""),
            MessagesPlaceholder(variable_name="chat_history"),
            ("human", "{input}"),
            MessagesPlaceholder(variable_name="agent_scratchpad")
        ])
        
        agent = create_openai_functions_agent(self.claude_client, self.tools, prompt)
        return AgentExecutor(agent=agent, tools=self.tools, verbose=True)
    
    async def create_supplier_agent(self):
        """Agent for supplier communication"""
        prompt = ChatPromptTemplate.from_messages([
            ("system", """You are a procurement specialist responsible for:
            - Generating purchase orders
            - Communicating with suppliers
            - Tracking deliveries
            - Analyzing supplier performance
            
            Write professional, concise emails and take proactive action."""),
            MessagesPlaceholder(variable_name="chat_history"),
            ("human", "{input}"),
            MessagesPlaceholder(variable_name="agent_scratchpad")
        ])
        
        agent = create_openai_functions_agent(self.openai_client, self.tools, prompt)
        return AgentExecutor(agent=agent, tools=self.tools, verbose=True)
    
    async def run_continuous(self):
        """Main loop - runs 24/7"""
        print("🤖 SuperMega Agent Orchestrator starting...")
        
        while True:
            try:
                # Check for tasks in Redis queue
                task = self.redis.lpop('agent_tasks')
                
                if task:
                    task_data = json.loads(task)
                    agent_type = task_data.get('agent_type')
                    task_input = task_data.get('input')
                    
                    if agent_type == 'development':
                        agent = await self.create_development_agent()
                    elif agent_type == 'manufacturing':
                        agent = await self.create_manufacturing_agent()
                    elif agent_type == 'supplier':
                        agent = await self.create_supplier_agent()
                    else:
                        continue
                    
                    # Execute agent task
                    result = await agent.ainvoke({
                        "input": task_input,
                        "chat_history": []
                    })
                    
                    # Log result to DynamoDB
                    self._log_agent_activity(agent_type, task_input, result)
                
                await asyncio.sleep(5)  # Check queue every 5 seconds
                
            except Exception as e:
                print(f"Error in agent loop: {e}")
                await asyncio.sleep(10)
    
    def _log_agent_activity(self, agent_type: str, input_data: str, result: Dict):
        """Log agent activities to DynamoDB"""
        table = self.dynamodb.Table('agent_activity_log')
        table.put_item(Item={
            'timestamp': datetime.utcnow().isoformat(),
            'agent_type': agent_type,
            'input': input_data,
            'result': json.dumps(result),
            'status': 'completed'
        })

# Main execution
if __name__ == "__main__":
    orchestrator = SuperMegaAgentOrchestrator()
    asyncio.run(orchestrator.run_continuous())
```

---

## Docker Compose Configuration

```yaml
version: '3.8'

services:
  agent-orchestrator:
    build: .
    container_name: supermega-orchestrator
    restart: always
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
      - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
      - AWS_REGION=us-east-1
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=redis://redis:6379
    volumes:
      - ./supermega-agents:/app
      - /var/run/docker.sock:/var/run/docker.sock
    depends_on:
      - redis
    networks:
      - supermega-network

  redis:
    image: redis:7-alpine
    container_name: supermega-redis
    restart: always
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    networks:
      - supermega-network

  development-agent:
    build: ./agents/development
    container_name: dev-agent
    restart: always
    environment:
      - GITHUB_TOKEN=${GITHUB_TOKEN}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    volumes:
      - ./workspace:/workspace
    networks:
      - supermega-network

  manufacturing-agent:
    build: ./agents/manufacturing
    container_name: mfg-agent
    restart: always
    environment:
      - CLAUDE_API_KEY=${ANTHROPIC_API_KEY}
      - AWS_REGION=us-east-1
    networks:
      - supermega-network

  supplier-agent:
    build: ./agents/supplier
    container_name: supplier-agent
    restart: always
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - AWS_SES_REGION=us-east-1
    networks:
      - supermega-network

volumes:
  redis-data:

networks:
  supermega-network:
    driver: bridge
```

---

## Systemd Service Configuration

```ini
# /etc/systemd/system/supermega-agents.service

[Unit]
Description=SuperMega Autonomous Agents
After=docker.service
Requires=docker.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/supermega-agents
ExecStart=/usr/local/bin/docker-compose up
ExecStop=/usr/local/bin/docker-compose down
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start service
sudo systemctl enable supermega-agents
sudo systemctl start supermega-agents
sudo systemctl status supermega-agents
```

---

## Monitoring & Alerts

### CloudWatch Agent Configuration
### Agent Conscience Telemetry
1. Install the CloudWatch agent config shown above and extend it with procstat entries for each container (langgraph, gent-router, conscience).
2. Ship enriched JSON logs (including intent_id, agent_id, llm_route, latency_ms) to OpenSearch index gent-conscience-* using Fluent Bit.
3. Create CloudWatch alarms on DualLLMHeartbeat and IntentBeaconLag (>30 seconds) and wire them to the PagerDuty Agent Mesh integration.
4. Deploy a small Lambda that reads the alarms and writes summarized health into ws_status_report.json so the public demo reflects reality.


```json
{
  "metrics": {
    "namespace": "SuperMega/Agents",
    "metrics_collected": {
      "cpu": {
        "measurement": [{"name": "cpu_usage_idle"}],
        "totalcpu": false
      },
      "mem": {
        "measurement": [{"name": "mem_used_percent"}]
      },
      "disk": {
        "measurement": [{"name": "disk_used_percent"}]
      }
    }
  },
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/home/ubuntu/supermega-agents/logs/*.log",
            "log_group_name": "/supermega/agents",
            "log_stream_name": "{instance_id}"
          }
        ]
      }
    }
  }
}
```

---

## Agent Task Queue Examples

```python
# Add tasks to Redis queue for agents to process

import redis
import json

r = redis.Redis(host='localhost', port=6379, decode_responses=True)

# Development task
r.rpush('agent_tasks', json.dumps({
    'agent_type': 'development',
    'input': 'Create a REST API endpoint for OEE calculation with FastAPI'
}))

# Manufacturing intelligence task
r.rpush('agent_tasks', json.dumps({
    'agent_type': 'manufacturing',
    'input': 'Analyze production data for Machine-101 and identify quality issues'
}))

# Supplier communication task
r.rpush('agent_tasks', json.dumps({
    'agent_type': 'supplier',
    'input': 'Send follow-up email to Supplier ABC about delayed PO #12345'
}))
```

---

## Success Checklist
### Copilot CLI Autonomy Runbook
```bash
# authenticate once, token pulled from AWS Secrets Manager
printf "%s" "$COPILOT_TOKEN" | gh auth login --with-token

# example actions agents run headlessly
gh copilot suggest --shell "deploy new FlowCore microservice" --execute
gh copilot explain src/oee/service.py --format json | jq '.summary'
```
- Wrap these commands inside agent skills so they can open PRs, request reviews, and trigger GitHub Actions without human shells.
- Combine the routing microservice and Copilot CLI so prompts always hit the right LLM before execution.

- [ ] EC2 instance running 24/7
- [ ] All agents containerized and auto-restarting
- [ ] GitHub Copilot CLI authenticated
- [ ] OpenAI Codex integrated
- [ ] Claude API connected
- [ ] Redis task queue operational
- [ ] CloudWatch monitoring active
- [ ] Agents processing tasks autonomously
- [ ] Self-healing on failures
- [ ] Daily activity reports generated

---

## Next: Connect to Manufacturing System

Now that agents are running, integrate them with the ERP+DQMS modules for autonomous operation.
