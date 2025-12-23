"""
Master Control Agent (MCA) v1.0
================================
The central orchestration brain for the SuperMega.dev AI Agent Infrastructure.
Runs on AWS 24/7, manages the agent fleet, and coordinates with Cloud AI APIs.

Responsibilities:
- Goal decomposition and task planning
- Agent spawning and lifecycle management
- Memory system integration (Qdrant)
- Cloud API routing (Gemini, Claude, OpenAI)
- Bangkok Node coordination via Tailscale
"""

import os
import json
import asyncio
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from enum import Enum
import httpx
from abc import ABC, abstractmethod

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("MCA")


# ============================================================================
# Configuration
# ============================================================================

@dataclass
class Config:
    """MCA Configuration"""
    # Cloud AI APIs
    gemini_api_key: str = field(default_factory=lambda: os.getenv("GEMINI_API_KEY", ""))
    anthropic_api_key: str = field(default_factory=lambda: os.getenv("ANTHROPIC_API_KEY", ""))
    openai_api_key: str = field(default_factory=lambda: os.getenv("OPENAI_API_KEY", ""))
    
    # Infrastructure
    bangkok_node_ip: str = field(default_factory=lambda: os.getenv("BANGKOK_NODE_IP", "100.113.30.52"))
    qdrant_url: str = field(default_factory=lambda: os.getenv("QDRANT_URL", "http://localhost:6333"))
    redis_url: str = field(default_factory=lambda: os.getenv("REDIS_URL", "redis://localhost:6379"))
    
    # Operational
    max_concurrent_agents: int = 10
    task_timeout_seconds: int = 3600
    heartbeat_interval: int = 30


# ============================================================================
# Enums and Data Classes
# ============================================================================

class TaskPriority(Enum):
    CRITICAL = 0
    HIGH = 1
    MEDIUM = 2
    LOW = 3


class TaskStatus(Enum):
    PENDING = "pending"
    QUEUED = "queued"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class AgentType(Enum):
    RESEARCH_ANALYST = "research_analyst"
    SOFTWARE_DEVELOPER = "software_developer"
    CONTENT_WRITER = "content_writer"
    DATA_ANALYST = "data_analyst"
    SALES_PROSPECTOR = "sales_prospector"
    DEVOPS_ENGINEER = "devops_engineer"
    FINANCE_AUDITOR = "finance_auditor"
    CUSTOMER_SUPPORT = "customer_support"
    COMPUTER_USE = "computer_use"


class OperatingMode(Enum):
    AUTONOMOUS = "autonomous"
    HYBRID = "hybrid"
    POWERHOUSE = "powerhouse"


@dataclass
class Task:
    """Represents a task to be executed by an agent."""
    id: str
    goal: str
    description: str
    priority: TaskPriority
    status: TaskStatus = TaskStatus.PENDING
    assigned_agent: Optional[str] = None
    parent_goal_id: Optional[str] = None
    subtasks: List[str] = field(default_factory=list)
    result: Optional[Dict] = None
    created_at: datetime = field(default_factory=datetime.now)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    metadata: Dict = field(default_factory=dict)


@dataclass
class Agent:
    """Represents an AI agent instance."""
    id: str
    type: AgentType
    status: str = "idle"
    current_task: Optional[str] = None
    tasks_completed: int = 0
    created_at: datetime = field(default_factory=datetime.now)
    last_heartbeat: datetime = field(default_factory=datetime.now)
    metadata: Dict = field(default_factory=dict)


# ============================================================================
# Cloud AI Router
# ============================================================================

class CloudAIRouter:
    """Routes requests to the optimal Cloud AI API based on task requirements."""
    
    def __init__(self, config: Config):
        self.config = config
        self.client = httpx.AsyncClient(timeout=60.0)
    
    async def route_request(
        self,
        prompt: str,
        task_type: str = "general",
        max_tokens: int = 4096,
        prefer_model: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Route a request to the optimal AI model.
        
        Routing logic:
        - Code tasks -> Claude (best for code)
        - Fast reasoning -> Gemini Flash (fastest, cheapest)
        - Complex analysis -> GPT-4 or Claude
        - Creative content -> Claude or GPT-4
        """
        
        # Determine best model based on task type
        if prefer_model:
            model = prefer_model
        elif task_type in ["code", "debug", "refactor"]:
            model = "claude"
        elif task_type in ["research", "analysis", "planning"]:
            model = "gemini"
        elif task_type in ["creative", "writing", "content"]:
            model = "claude"
        else:
            model = "gemini"  # Default to fastest/cheapest
        
        logger.info(f"Routing {task_type} task to {model}")
        
        # Call the appropriate API
        if model == "gemini":
            return await self._call_gemini(prompt, max_tokens)
        elif model == "claude":
            return await self._call_claude(prompt, max_tokens)
        elif model == "openai":
            return await self._call_openai(prompt, max_tokens)
        else:
            return await self._call_gemini(prompt, max_tokens)
    
    async def _call_gemini(self, prompt: str, max_tokens: int) -> Dict:
        """Call Google Gemini API."""
        if not self.config.gemini_api_key:
            return {"error": "Gemini API key not configured", "model": "gemini"}
        
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key={self.config.gemini_api_key}"
        
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "maxOutputTokens": max_tokens,
                "temperature": 0.7
            }
        }
        
        try:
            response = await self.client.post(url, json=payload)
            response.raise_for_status()
            data = response.json()
            
            text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            return {
                "model": "gemini-2.0-flash",
                "response": text,
                "usage": data.get("usageMetadata", {})
            }
        except Exception as e:
            logger.error(f"Gemini API error: {e}")
            return {"error": str(e), "model": "gemini"}
    
    async def _call_claude(self, prompt: str, max_tokens: int) -> Dict:
        """Call Anthropic Claude API."""
        if not self.config.anthropic_api_key:
            return {"error": "Anthropic API key not configured", "model": "claude"}
        
        url = "https://api.anthropic.com/v1/messages"
        
        headers = {
            "x-api-key": self.config.anthropic_api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
        }
        
        payload = {
            "model": "claude-3-5-sonnet-20241022",
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}]
        }
        
        try:
            response = await self.client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
            
            text = data.get("content", [{}])[0].get("text", "")
            return {
                "model": "claude-3.5-sonnet",
                "response": text,
                "usage": data.get("usage", {})
            }
        except Exception as e:
            logger.error(f"Claude API error: {e}")
            return {"error": str(e), "model": "claude"}
    
    async def _call_openai(self, prompt: str, max_tokens: int) -> Dict:
        """Call OpenAI API."""
        if not self.config.openai_api_key:
            return {"error": "OpenAI API key not configured", "model": "openai"}
        
        url = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1") + "/chat/completions"
        
        headers = {
            "Authorization": f"Bearer {self.config.openai_api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": "gpt-4o",
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}]
        }
        
        try:
            response = await self.client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
            
            text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            return {
                "model": "gpt-4o",
                "response": text,
                "usage": data.get("usage", {})
            }
        except Exception as e:
            logger.error(f"OpenAI API error: {e}")
            return {"error": str(e), "model": "openai"}


# ============================================================================
# Goal Decomposer
# ============================================================================

class GoalDecomposer:
    """Decomposes high-level goals into actionable tasks."""
    
    def __init__(self, ai_router: CloudAIRouter):
        self.ai_router = ai_router
    
    async def decompose(self, goal: str, context: Optional[Dict] = None) -> List[Task]:
        """
        Decompose a high-level goal into a list of tasks.
        Uses Cloud AI to analyze the goal and create a task plan.
        """
        
        prompt = f"""You are a task planning AI. Decompose the following goal into specific, actionable tasks.

GOAL: {goal}

CONTEXT: {json.dumps(context) if context else "None provided"}

For each task, provide:
1. A clear, specific description
2. The type of agent best suited (research_analyst, software_developer, content_writer, data_analyst, sales_prospector, devops_engineer, finance_auditor, customer_support, computer_use)
3. Priority (critical, high, medium, low)
4. Estimated time to complete
5. Dependencies on other tasks (if any)

Respond in JSON format:
{{
    "tasks": [
        {{
            "description": "...",
            "agent_type": "...",
            "priority": "...",
            "estimated_time": "...",
            "dependencies": []
        }}
    ],
    "total_estimated_time": "...",
    "notes": "..."
}}
"""
        
        result = await self.ai_router.route_request(prompt, task_type="planning")
        
        if "error" in result:
            logger.error(f"Goal decomposition failed: {result['error']}")
            return []
        
        try:
            # Parse the JSON response
            response_text = result.get("response", "")
            # Extract JSON from response (handle markdown code blocks)
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0]
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0]
            
            plan = json.loads(response_text)
            
            tasks = []
            for idx, task_data in enumerate(plan.get("tasks", [])):
                task = Task(
                    id=f"TASK-{datetime.now().strftime('%Y%m%d%H%M%S')}-{idx}",
                    goal=goal,
                    description=task_data.get("description", ""),
                    priority=TaskPriority[task_data.get("priority", "medium").upper()],
                    metadata={
                        "agent_type": task_data.get("agent_type", ""),
                        "estimated_time": task_data.get("estimated_time", ""),
                        "dependencies": task_data.get("dependencies", [])
                    }
                )
                tasks.append(task)
            
            logger.info(f"Decomposed goal into {len(tasks)} tasks")
            return tasks
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse task plan: {e}")
            return []


# ============================================================================
# Bangkok Node Coordinator
# ============================================================================

class BangkokNodeCoordinator:
    """Coordinates with the Bangkok Node via Tailscale."""
    
    def __init__(self, config: Config):
        self.config = config
        self.client = httpx.AsyncClient(timeout=30.0)
        self.base_url = f"http://{config.bangkok_node_ip}:8501"
    
    async def get_status(self) -> Dict:
        """Get the current status of the Bangkok Node."""
        try:
            response = await self.client.get(f"{self.base_url}/api/status")
            return response.json()
        except Exception as e:
            logger.warning(f"Bangkok Node unreachable: {e}")
            return {"online": False, "error": str(e)}
    
    async def get_operating_mode(self) -> OperatingMode:
        """Get the current operating mode of the Bangkok Node."""
        status = await self.get_status()
        if not status.get("online"):
            return OperatingMode.POWERHOUSE  # Assume gaming if unreachable
        
        mode_str = status.get("operating_mode", "autonomous")
        return OperatingMode(mode_str)
    
    async def dispatch_task(self, task: Task) -> Dict:
        """Dispatch a task to the Bangkok Node for execution."""
        mode = await self.get_operating_mode()
        
        if mode == OperatingMode.POWERHOUSE:
            logger.info("Bangkok Node in Powerhouse mode - queuing task")
            return {"status": "queued", "reason": "Node in gaming mode"}
        
        try:
            payload = {
                "task_id": task.id,
                "description": task.description,
                "priority": task.priority.name,
                "metadata": task.metadata
            }
            response = await self.client.post(
                f"{self.base_url}/api/tasks/dispatch",
                json=payload
            )
            return response.json()
        except Exception as e:
            logger.error(f"Failed to dispatch task: {e}")
            return {"status": "error", "error": str(e)}


# ============================================================================
# Master Control Agent
# ============================================================================

class MasterControlAgent:
    """
    The central orchestration brain.
    Coordinates all components to execute user goals.
    """
    
    def __init__(self, config: Optional[Config] = None):
        self.config = config or Config()
        self.ai_router = CloudAIRouter(self.config)
        self.goal_decomposer = GoalDecomposer(self.ai_router)
        self.bangkok_coordinator = BangkokNodeCoordinator(self.config)
        
        self.agents: Dict[str, Agent] = {}
        self.tasks: Dict[str, Task] = {}
        self.task_queue: List[str] = []
        
        logger.info("Master Control Agent initialized")
    
    async def execute_goal(self, goal: str, priority: TaskPriority = TaskPriority.MEDIUM) -> Dict:
        """
        Execute a high-level goal.
        
        1. Decompose the goal into tasks
        2. Assign tasks to appropriate agents
        3. Dispatch tasks to Bangkok Node or execute locally
        4. Monitor progress and aggregate results
        """
        
        goal_id = f"GOAL-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        logger.info(f"Executing goal {goal_id}: {goal[:50]}...")
        
        # Step 1: Decompose goal into tasks
        tasks = await self.goal_decomposer.decompose(goal)
        
        if not tasks:
            return {
                "goal_id": goal_id,
                "status": "failed",
                "error": "Failed to decompose goal into tasks"
            }
        
        # Step 2: Register tasks
        for task in tasks:
            task.parent_goal_id = goal_id
            self.tasks[task.id] = task
            self.task_queue.append(task.id)
        
        # Step 3: Check Bangkok Node availability
        bkk_mode = await self.bangkok_coordinator.get_operating_mode()
        
        # Step 4: Dispatch tasks
        dispatched = 0
        for task_id in self.task_queue[:]:
            task = self.tasks[task_id]
            
            if bkk_mode != OperatingMode.POWERHOUSE:
                result = await self.bangkok_coordinator.dispatch_task(task)
                if result.get("status") == "dispatched":
                    task.status = TaskStatus.IN_PROGRESS
                    task.started_at = datetime.now()
                    dispatched += 1
            else:
                task.status = TaskStatus.QUEUED
        
        return {
            "goal_id": goal_id,
            "status": "dispatched",
            "total_tasks": len(tasks),
            "dispatched": dispatched,
            "queued": len(tasks) - dispatched,
            "bangkok_mode": bkk_mode.value,
            "tasks": [
                {
                    "id": t.id,
                    "description": t.description[:100],
                    "status": t.status.value,
                    "agent_type": t.metadata.get("agent_type", "")
                }
                for t in tasks
            ]
        }
    
    async def get_status(self) -> Dict:
        """Get the current status of the MCA and all systems."""
        bkk_status = await self.bangkok_coordinator.get_status()
        
        return {
            "mca_status": "running",
            "timestamp": datetime.now().isoformat(),
            "bangkok_node": bkk_status,
            "agents": {
                "total": len(self.agents),
                "active": sum(1 for a in self.agents.values() if a.status == "active"),
                "idle": sum(1 for a in self.agents.values() if a.status == "idle")
            },
            "tasks": {
                "total": len(self.tasks),
                "pending": sum(1 for t in self.tasks.values() if t.status == TaskStatus.PENDING),
                "in_progress": sum(1 for t in self.tasks.values() if t.status == TaskStatus.IN_PROGRESS),
                "completed": sum(1 for t in self.tasks.values() if t.status == TaskStatus.COMPLETED),
                "failed": sum(1 for t in self.tasks.values() if t.status == TaskStatus.FAILED)
            },
            "queue_length": len(self.task_queue)
        }
    
    async def run(self):
        """Main event loop for the MCA."""
        logger.info("Starting MCA main loop")
        
        while True:
            try:
                # Heartbeat and status check
                status = await self.get_status()
                logger.debug(f"MCA Status: {json.dumps(status, indent=2)}")
                
                # Process task queue
                await self._process_queue()
                
                # Sleep before next iteration
                await asyncio.sleep(self.config.heartbeat_interval)
                
            except Exception as e:
                logger.error(f"MCA loop error: {e}")
                await asyncio.sleep(5)
    
    async def _process_queue(self):
        """Process pending tasks in the queue."""
        bkk_mode = await self.bangkok_coordinator.get_operating_mode()
        
        if bkk_mode == OperatingMode.POWERHOUSE:
            logger.debug("Bangkok Node in Powerhouse mode - skipping queue processing")
            return
        
        # Process up to max_concurrent_agents tasks
        active_tasks = sum(1 for t in self.tasks.values() if t.status == TaskStatus.IN_PROGRESS)
        available_slots = self.config.max_concurrent_agents - active_tasks
        
        for _ in range(min(available_slots, len(self.task_queue))):
            if not self.task_queue:
                break
            
            task_id = self.task_queue.pop(0)
            task = self.tasks.get(task_id)
            
            if task and task.status == TaskStatus.PENDING:
                result = await self.bangkok_coordinator.dispatch_task(task)
                if result.get("status") == "dispatched":
                    task.status = TaskStatus.IN_PROGRESS
                    task.started_at = datetime.now()
                    logger.info(f"Dispatched task {task_id}")


# ============================================================================
# FastAPI Server
# ============================================================================

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(
    title="JARVIS Master Control Agent",
    description="Central orchestration API for the SuperMega.dev AI Agent Infrastructure",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global MCA instance
mca: Optional[MasterControlAgent] = None


class GoalRequest(BaseModel):
    goal: str
    priority: str = "medium"
    context: Optional[Dict] = None


class TaskResponse(BaseModel):
    goal_id: str
    status: str
    total_tasks: int
    dispatched: int
    queued: int
    bangkok_mode: str
    tasks: List[Dict]


@app.on_event("startup")
async def startup():
    global mca
    mca = MasterControlAgent()
    logger.info("MCA API server started")


@app.get("/")
async def root():
    return {"service": "JARVIS Master Control Agent", "status": "online"}


@app.get("/health")
async def health():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}


@app.get("/status")
async def get_status():
    if not mca:
        raise HTTPException(status_code=503, detail="MCA not initialized")
    return await mca.get_status()


@app.post("/goals/execute", response_model=TaskResponse)
async def execute_goal(request: GoalRequest, background_tasks: BackgroundTasks):
    if not mca:
        raise HTTPException(status_code=503, detail="MCA not initialized")
    
    priority = TaskPriority[request.priority.upper()]
    result = await mca.execute_goal(request.goal, priority)
    
    return result


@app.get("/tasks")
async def list_tasks():
    if not mca:
        raise HTTPException(status_code=503, detail="MCA not initialized")
    
    return {
        "tasks": [
            {
                "id": t.id,
                "goal": t.goal[:100],
                "description": t.description[:200],
                "status": t.status.value,
                "priority": t.priority.name,
                "created_at": t.created_at.isoformat()
            }
            for t in mca.tasks.values()
        ]
    }


@app.get("/tasks/{task_id}")
async def get_task(task_id: str):
    if not mca:
        raise HTTPException(status_code=503, detail="MCA not initialized")
    
    task = mca.tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return {
        "id": task.id,
        "goal": task.goal,
        "description": task.description,
        "status": task.status.value,
        "priority": task.priority.name,
        "assigned_agent": task.assigned_agent,
        "result": task.result,
        "created_at": task.created_at.isoformat(),
        "started_at": task.started_at.isoformat() if task.started_at else None,
        "completed_at": task.completed_at.isoformat() if task.completed_at else None,
        "metadata": task.metadata
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
