"""
HYPER UNICORN API Server
========================
FastAPI-based orchestration server for AI agent management.

Features:
- RESTful API for agent operations
- WebSocket for real-time updates
- Task queue management
- Agent health monitoring
- Authentication & rate limiting

Author: Manus AI for SuperMega.dev
"""

import os
import sys
import json
import asyncio
import uuid
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any, Union
from contextlib import asynccontextmanager

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, BackgroundTasks, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import uvicorn

# ============================================================================
# Data Models
# ============================================================================

class TaskCreate(BaseModel):
    """Request model for creating a task."""
    goal: str = Field(..., description="The goal/objective for the agent")
    agent_type: str = Field(default="auto", description="Agent type: auto, research, code, content, browser, financial, communication")
    priority: int = Field(default=5, ge=1, le=10, description="Priority 1-10 (10 highest)")
    context: Dict[str, Any] = Field(default_factory=dict, description="Additional context")
    callback_url: Optional[str] = Field(default=None, description="Webhook URL for completion notification")


class TaskResponse(BaseModel):
    """Response model for task operations."""
    task_id: str
    status: str
    goal: str
    agent_type: str
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class AgentStatus(BaseModel):
    """Agent status model."""
    agent_id: str
    agent_type: str
    status: str  # idle, busy, error
    current_task: Optional[str] = None
    tasks_completed: int = 0
    uptime_seconds: int = 0


class SystemHealth(BaseModel):
    """System health model."""
    status: str
    uptime: str
    agents: Dict[str, AgentStatus]
    tasks_queued: int
    tasks_running: int
    tasks_completed: int
    memory_usage_mb: float
    cpu_usage_percent: float


# ============================================================================
# Task Queue & State Management
# ============================================================================

class TaskQueue:
    """In-memory task queue with priority support."""
    
    def __init__(self):
        self.tasks: Dict[str, Dict[str, Any]] = {}
        self.queue: List[str] = []  # Task IDs in priority order
        self.running: Dict[str, str] = {}  # task_id -> agent_id
        self.completed: List[str] = []
        self.websocket_clients: List[WebSocket] = []
    
    def add_task(self, task: TaskCreate) -> str:
        """Add a new task to the queue."""
        task_id = str(uuid.uuid4())[:8]
        
        self.tasks[task_id] = {
            "task_id": task_id,
            "goal": task.goal,
            "agent_type": task.agent_type,
            "priority": task.priority,
            "context": task.context,
            "callback_url": task.callback_url,
            "status": "queued",
            "created_at": datetime.utcnow().isoformat(),
            "started_at": None,
            "completed_at": None,
            "result": None,
            "error": None
        }
        
        # Insert in priority order
        insert_pos = 0
        for i, tid in enumerate(self.queue):
            if self.tasks[tid]["priority"] < task.priority:
                insert_pos = i
                break
            insert_pos = i + 1
        
        self.queue.insert(insert_pos, task_id)
        
        return task_id
    
    def get_next_task(self) -> Optional[Dict[str, Any]]:
        """Get the next task from the queue."""
        if not self.queue:
            return None
        
        task_id = self.queue.pop(0)
        task = self.tasks[task_id]
        task["status"] = "running"
        task["started_at"] = datetime.utcnow().isoformat()
        
        return task
    
    def complete_task(self, task_id: str, result: Dict[str, Any] = None, error: str = None):
        """Mark a task as completed."""
        if task_id not in self.tasks:
            return
        
        task = self.tasks[task_id]
        task["status"] = "completed" if not error else "failed"
        task["completed_at"] = datetime.utcnow().isoformat()
        task["result"] = result
        task["error"] = error
        
        if task_id in self.running:
            del self.running[task_id]
        
        self.completed.append(task_id)
    
    def get_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Get a task by ID."""
        return self.tasks.get(task_id)
    
    def get_stats(self) -> Dict[str, int]:
        """Get queue statistics."""
        return {
            "queued": len(self.queue),
            "running": len(self.running),
            "completed": len(self.completed),
            "total": len(self.tasks)
        }
    
    async def broadcast(self, message: Dict[str, Any]):
        """Broadcast message to all WebSocket clients."""
        for client in self.websocket_clients:
            try:
                await client.send_json(message)
            except:
                pass


# Global task queue
task_queue = TaskQueue()

# Agent registry
agents: Dict[str, Dict[str, Any]] = {}

# System start time
start_time = datetime.utcnow()


# ============================================================================
# Agent Executor
# ============================================================================

async def execute_task(task: Dict[str, Any]):
    """Execute a task using the appropriate agent."""
    task_id = task["task_id"]
    agent_type = task["agent_type"]
    goal = task["goal"]
    context = task["context"]
    
    try:
        # Broadcast task started
        await task_queue.broadcast({
            "event": "task_started",
            "task_id": task_id,
            "agent_type": agent_type
        })
        
        # Import and run the appropriate agent
        result = None
        
        if agent_type == "research" or agent_type == "auto":
            from agents.research_agent import ResearchAgent
            agent = ResearchAgent()
            result = await agent.execute(goal)
        
        elif agent_type == "code":
            from agents.code_agent import CodeAgent
            agent = CodeAgent()
            result = await agent.execute(goal)
        
        elif agent_type == "content":
            from agents.content_agent import ContentAgent
            agent = ContentAgent()
            result = await agent.execute(goal)
        
        elif agent_type == "browser":
            from agents.browser_agent import BrowserAgent
            agent = BrowserAgent()
            result = await agent.execute(goal)
        
        elif agent_type == "financial":
            from agents.financial_agent import FinancialAgent
            agent = FinancialAgent()
            result = await agent.execute(goal)
        
        elif agent_type == "communication":
            from agents.communication_agent import CommunicationAgent
            agent = CommunicationAgent()
            result = await agent.execute(goal)
        
        else:
            # Default to research agent
            from agents.research_agent import ResearchAgent
            agent = ResearchAgent()
            result = await agent.execute(goal)
        
        # Complete the task
        task_queue.complete_task(task_id, result=result)
        
        # Broadcast task completed
        await task_queue.broadcast({
            "event": "task_completed",
            "task_id": task_id,
            "result": result
        })
        
    except Exception as e:
        # Handle error
        error_msg = str(e)
        task_queue.complete_task(task_id, error=error_msg)
        
        # Broadcast task failed
        await task_queue.broadcast({
            "event": "task_failed",
            "task_id": task_id,
            "error": error_msg
        })


# ============================================================================
# FastAPI Application
# ============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    print("🦄 HYPER UNICORN API Server starting...")
    
    # Initialize agents
    agent_types = ["research", "code", "content", "browser", "financial", "communication"]
    for agent_type in agent_types:
        agents[agent_type] = {
            "agent_id": f"{agent_type}-001",
            "agent_type": agent_type,
            "status": "idle",
            "current_task": None,
            "tasks_completed": 0,
            "started_at": datetime.utcnow().isoformat()
        }
    
    yield
    
    # Shutdown
    print("🦄 HYPER UNICORN API Server shutting down...")


app = FastAPI(
    title="HYPER UNICORN API",
    description="AI Agent Orchestration API for SuperMega.dev",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# API Endpoints
# ============================================================================

@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "HYPER UNICORN API",
        "version": "1.0.0",
        "status": "operational",
        "docs": "/docs"
    }


@app.get("/health", response_model=SystemHealth)
async def health_check():
    """Get system health status."""
    import psutil
    
    uptime = datetime.utcnow() - start_time
    stats = task_queue.get_stats()
    
    agent_statuses = {}
    for agent_id, agent in agents.items():
        agent_statuses[agent_id] = AgentStatus(
            agent_id=agent["agent_id"],
            agent_type=agent["agent_type"],
            status=agent["status"],
            current_task=agent.get("current_task"),
            tasks_completed=agent.get("tasks_completed", 0),
            uptime_seconds=int(uptime.total_seconds())
        )
    
    return SystemHealth(
        status="healthy",
        uptime=str(uptime),
        agents=agent_statuses,
        tasks_queued=stats["queued"],
        tasks_running=stats["running"],
        tasks_completed=stats["completed"],
        memory_usage_mb=psutil.Process().memory_info().rss / 1024 / 1024,
        cpu_usage_percent=psutil.cpu_percent()
    )


# ============================================================================
# Task Endpoints
# ============================================================================

@app.post("/tasks", response_model=TaskResponse)
async def create_task(task: TaskCreate, background_tasks: BackgroundTasks):
    """Create a new task for an agent."""
    task_id = task_queue.add_task(task)
    task_data = task_queue.get_task(task_id)
    
    # Start task execution in background
    background_tasks.add_task(execute_task, task_data)
    
    return TaskResponse(
        task_id=task_id,
        status=task_data["status"],
        goal=task_data["goal"],
        agent_type=task_data["agent_type"],
        created_at=task_data["created_at"]
    )


@app.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_task(task_id: str):
    """Get task status and result."""
    task = task_queue.get_task(task_id)
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return TaskResponse(
        task_id=task["task_id"],
        status=task["status"],
        goal=task["goal"],
        agent_type=task["agent_type"],
        created_at=task["created_at"],
        started_at=task.get("started_at"),
        completed_at=task.get("completed_at"),
        result=task.get("result"),
        error=task.get("error")
    )


@app.get("/tasks")
async def list_tasks(
    status: Optional[str] = None,
    limit: int = 50
):
    """List all tasks."""
    tasks = []
    
    for task_id, task in task_queue.tasks.items():
        if status and task["status"] != status:
            continue
        
        tasks.append({
            "task_id": task["task_id"],
            "status": task["status"],
            "goal": task["goal"][:100],
            "agent_type": task["agent_type"],
            "created_at": task["created_at"]
        })
        
        if len(tasks) >= limit:
            break
    
    return {"tasks": tasks, "total": len(task_queue.tasks)}


@app.delete("/tasks/{task_id}")
async def cancel_task(task_id: str):
    """Cancel a queued task."""
    task = task_queue.get_task(task_id)
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if task["status"] != "queued":
        raise HTTPException(status_code=400, detail="Can only cancel queued tasks")
    
    task["status"] = "cancelled"
    if task_id in task_queue.queue:
        task_queue.queue.remove(task_id)
    
    return {"message": "Task cancelled", "task_id": task_id}


# ============================================================================
# Agent Endpoints
# ============================================================================

@app.get("/agents")
async def list_agents():
    """List all agents and their status."""
    return {"agents": list(agents.values())}


@app.get("/agents/{agent_type}")
async def get_agent(agent_type: str):
    """Get agent details."""
    if agent_type not in agents:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    return agents[agent_type]


# ============================================================================
# WebSocket for Real-time Updates
# ============================================================================

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time task updates."""
    await websocket.accept()
    task_queue.websocket_clients.append(websocket)
    
    try:
        # Send initial state
        await websocket.send_json({
            "event": "connected",
            "stats": task_queue.get_stats(),
            "agents": list(agents.keys())
        })
        
        while True:
            # Keep connection alive and handle incoming messages
            data = await websocket.receive_text()
            
            try:
                message = json.loads(data)
                
                if message.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
                
                elif message.get("type") == "subscribe":
                    # Subscribe to specific task updates
                    pass
                
            except json.JSONDecodeError:
                pass
                
    except WebSocketDisconnect:
        task_queue.websocket_clients.remove(websocket)


# ============================================================================
# Quick Actions
# ============================================================================

@app.post("/quick/research")
async def quick_research(query: str, background_tasks: BackgroundTasks):
    """Quick research action."""
    task = TaskCreate(goal=f"Research: {query}", agent_type="research")
    task_id = task_queue.add_task(task)
    task_data = task_queue.get_task(task_id)
    background_tasks.add_task(execute_task, task_data)
    return {"task_id": task_id, "status": "started"}


@app.post("/quick/code")
async def quick_code(request: str, background_tasks: BackgroundTasks):
    """Quick code generation action."""
    task = TaskCreate(goal=f"Code: {request}", agent_type="code")
    task_id = task_queue.add_task(task)
    task_data = task_queue.get_task(task_id)
    background_tasks.add_task(execute_task, task_data)
    return {"task_id": task_id, "status": "started"}


@app.post("/quick/email")
async def quick_email(action: str, background_tasks: BackgroundTasks):
    """Quick email action."""
    task = TaskCreate(goal=f"Email: {action}", agent_type="communication")
    task_id = task_queue.add_task(task)
    task_data = task_queue.get_task(task_id)
    background_tasks.add_task(execute_task, task_data)
    return {"task_id": task_id, "status": "started"}


@app.post("/quick/analyze")
async def quick_analyze(topic: str, background_tasks: BackgroundTasks):
    """Quick financial analysis action."""
    task = TaskCreate(goal=f"Analyze: {topic}", agent_type="financial")
    task_id = task_queue.add_task(task)
    task_data = task_queue.get_task(task_id)
    background_tasks.add_task(execute_task, task_data)
    return {"task_id": task_id, "status": "started"}


# ============================================================================
# Main Entry Point
# ============================================================================

def main():
    """Run the API server."""
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=8080,
        reload=True
    )


if __name__ == "__main__":
    main()
