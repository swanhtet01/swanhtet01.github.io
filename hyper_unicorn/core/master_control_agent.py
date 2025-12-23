"""
Master Control Agent (MCA) v2.0
===============================
The central orchestrator for the HYPER UNICORN architecture.
Acts as the CTO of the AI workforce, managing task delegation,
agent coordination, and system optimization.

Author: Manus AI
Date: December 2025
"""

import os
import json
import asyncio
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
import hashlib

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Import our modules
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.intelligence_fabric import get_intelligence_fabric, think, code, research
from memory.memory_cortex import get_memory_cortex, MemoryType

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("MCA")


# ============================================================================
# Data Models
# ============================================================================

class TaskPriority(Enum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    CRITICAL = "critical"


class TaskStatus(Enum):
    PENDING = "pending"
    PLANNING = "planning"
    IN_PROGRESS = "in_progress"
    WAITING = "waiting"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class Task:
    """A task to be executed by the agent workforce."""
    id: str
    goal: str
    priority: TaskPriority = TaskPriority.NORMAL
    status: TaskStatus = TaskStatus.PENDING
    assigned_agent: Optional[str] = None
    subtasks: List['Task'] = field(default_factory=list)
    result: Optional[Any] = None
    error: Optional[str] = None
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "goal": self.goal,
            "priority": self.priority.value,
            "status": self.status.value,
            "assigned_agent": self.assigned_agent,
            "subtasks": [st.to_dict() for st in self.subtasks],
            "result": self.result,
            "error": self.error,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "metadata": self.metadata
        }


@dataclass
class AgentSpec:
    """Specification for a specialized agent."""
    id: str
    name: str
    role: str
    capabilities: List[str]
    tools: List[str]
    system_prompt: str
    max_concurrent_tasks: int = 3
    current_tasks: int = 0
    performance_score: float = 1.0
    
    def is_available(self) -> bool:
        return self.current_tasks < self.max_concurrent_tasks


# ============================================================================
# Agent Constellation
# ============================================================================

AGENT_CONSTELLATION = {
    "researcher": AgentSpec(
        id="researcher",
        name="Research Analyst",
        role="Deep research and analysis",
        capabilities=["web_search", "document_analysis", "synthesis", "fact_checking"],
        tools=["web_search", "web_scrape", "file_read", "llm"],
        system_prompt="""You are an expert research analyst. Your job is to:
1. Conduct thorough research on any topic
2. Synthesize information from multiple sources
3. Provide well-sourced, accurate analysis
4. Identify key insights and patterns
Always cite your sources and acknowledge uncertainty."""
    ),
    "coder": AgentSpec(
        id="coder",
        name="Software Engineer",
        role="Code development and debugging",
        capabilities=["code_generation", "debugging", "code_review", "architecture"],
        tools=["code_execute", "file_read", "file_write", "git", "llm"],
        system_prompt="""You are an expert software engineer. Your job is to:
1. Write clean, efficient, well-documented code
2. Debug and fix issues systematically
3. Review code for quality and security
4. Design scalable architectures
Always follow best practices and explain your reasoning."""
    ),
    "writer": AgentSpec(
        id="writer",
        name="Content Writer",
        role="Content creation and editing",
        capabilities=["writing", "editing", "formatting", "translation"],
        tools=["file_read", "file_write", "web_search", "llm"],
        system_prompt="""You are an expert content writer. Your job is to:
1. Create engaging, well-structured content
2. Edit and improve existing content
3. Adapt tone and style for different audiences
4. Ensure clarity and accuracy
Always aim for excellence in communication."""
    ),
    "analyst": AgentSpec(
        id="analyst",
        name="Data Analyst",
        role="Data analysis and visualization",
        capabilities=["data_analysis", "visualization", "statistics", "reporting"],
        tools=["data_analysis", "data_visualization", "file_read", "code_execute", "llm"],
        system_prompt="""You are an expert data analyst. Your job is to:
1. Analyze data to extract insights
2. Create clear visualizations
3. Identify trends and patterns
4. Provide actionable recommendations
Always validate your findings and explain methodology."""
    ),
    "automator": AgentSpec(
        id="automator",
        name="Automation Specialist",
        role="Task automation and workflow optimization",
        capabilities=["browser_automation", "api_integration", "workflow_design"],
        tools=["browser", "api_call", "code_execute", "file_write", "llm"],
        system_prompt="""You are an expert automation specialist. Your job is to:
1. Automate repetitive tasks
2. Design efficient workflows
3. Integrate systems via APIs
4. Monitor and optimize processes
Always prioritize reliability and error handling."""
    ),
    "coordinator": AgentSpec(
        id="coordinator",
        name="Project Coordinator",
        role="Task coordination and project management",
        capabilities=["planning", "delegation", "monitoring", "communication"],
        tools=["calendar", "email", "file_write", "llm"],
        system_prompt="""You are an expert project coordinator. Your job is to:
1. Break down complex goals into tasks
2. Assign tasks to appropriate agents
3. Monitor progress and resolve blockers
4. Ensure timely delivery
Always maintain clear communication and documentation."""
    )
}


# ============================================================================
# Task Planner
# ============================================================================

class TaskPlanner:
    """Plans and decomposes tasks into subtasks."""
    
    def __init__(self, intelligence_fabric):
        self.fabric = intelligence_fabric
        self.memory = get_memory_cortex("planner")
    
    async def plan(self, goal: str, context: Optional[Dict] = None) -> List[Task]:
        """Decompose a goal into executable tasks."""
        # Get relevant context from memory
        memory_context = await self.memory.get_context_for_task(goal)
        
        # Build planning prompt
        planning_prompt = f"""You are a task planner for an AI agent workforce. 
Decompose the following goal into specific, actionable subtasks.

Goal: {goal}

Available Agents:
{json.dumps({k: {"role": v.role, "capabilities": v.capabilities} for k, v in AGENT_CONSTELLATION.items()}, indent=2)}

Relevant Past Experience:
{json.dumps(memory_context.get("similar_episodes", []), indent=2)}

Instructions:
1. Break down the goal into 3-7 subtasks
2. Each subtask should be specific and actionable
3. Assign each subtask to the most appropriate agent
4. Order subtasks by dependency (independent tasks first)
5. Estimate complexity: simple (1-5 min), moderate (5-30 min), complex (30+ min)

Respond in JSON format:
{{
    "analysis": "Brief analysis of the goal",
    "subtasks": [
        {{
            "description": "What needs to be done",
            "agent": "agent_id",
            "complexity": "simple|moderate|complex",
            "dependencies": ["subtask_index"],
            "tools_needed": ["tool1", "tool2"]
        }}
    ],
    "estimated_total_time": "X minutes"
}}"""
        
        result = await self.fabric.think(
            planning_prompt,
            force_model="claude-sonnet",
            system_prompt="You are an expert task planner. Always respond with valid JSON."
        )
        
        if not result["success"]:
            return [Task(
                id=self._generate_id(),
                goal=goal,
                priority=TaskPriority.NORMAL,
                metadata={"error": "Planning failed"}
            )]
        
        # Parse the plan
        try:
            # Extract JSON from response
            content = result["content"]
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            
            plan = json.loads(content)
            
            # Convert to Task objects
            tasks = []
            for i, subtask in enumerate(plan.get("subtasks", [])):
                task = Task(
                    id=self._generate_id(),
                    goal=subtask["description"],
                    priority=TaskPriority.NORMAL,
                    assigned_agent=subtask.get("agent"),
                    metadata={
                        "complexity": subtask.get("complexity", "moderate"),
                        "dependencies": subtask.get("dependencies", []),
                        "tools_needed": subtask.get("tools_needed", []),
                        "index": i
                    }
                )
                tasks.append(task)
            
            return tasks
            
        except json.JSONDecodeError:
            logger.error(f"Failed to parse plan: {result['content']}")
            return [Task(
                id=self._generate_id(),
                goal=goal,
                priority=TaskPriority.NORMAL,
                metadata={"error": "Failed to parse plan"}
            )]
    
    def _generate_id(self) -> str:
        return hashlib.md5(
            f"{datetime.now().isoformat()}{os.urandom(8).hex()}".encode()
        ).hexdigest()[:12]


# ============================================================================
# Task Executor
# ============================================================================

class TaskExecutor:
    """Executes tasks using the agent constellation."""
    
    def __init__(self, intelligence_fabric):
        self.fabric = intelligence_fabric
        self.agents = AGENT_CONSTELLATION
    
    async def execute(self, task: Task) -> Task:
        """Execute a single task."""
        task.status = TaskStatus.IN_PROGRESS
        task.started_at = datetime.now().isoformat()
        
        # Get assigned agent
        agent = self.agents.get(task.assigned_agent)
        if not agent:
            # Auto-assign based on task
            agent = await self._auto_assign_agent(task)
            task.assigned_agent = agent.id
        
        agent.current_tasks += 1
        
        try:
            # Build execution prompt
            execution_prompt = f"""Execute the following task:

Task: {task.goal}

Tools Available: {', '.join(agent.tools)}

Instructions:
1. Analyze what needs to be done
2. Execute the task step by step
3. Provide a clear result
4. Note any issues or learnings

Respond with:
1. Your approach
2. The execution steps
3. The final result
4. Any learnings for future tasks"""
            
            # Execute with appropriate model
            if "code" in agent.capabilities or "code_generation" in agent.capabilities:
                result = await code(execution_prompt, system_prompt=agent.system_prompt)
            elif "research" in agent.capabilities or "analysis" in agent.capabilities:
                result = await research(execution_prompt, system_prompt=agent.system_prompt)
            else:
                result = await self.fabric.think(
                    execution_prompt,
                    system_prompt=agent.system_prompt
                )
            
            if result["success"]:
                task.status = TaskStatus.COMPLETED
                task.result = result["content"]
            else:
                task.status = TaskStatus.FAILED
                task.error = result.get("error", "Unknown error")
            
        except Exception as e:
            task.status = TaskStatus.FAILED
            task.error = str(e)
            logger.error(f"Task execution failed: {e}")
        
        finally:
            agent.current_tasks -= 1
            task.completed_at = datetime.now().isoformat()
        
        return task
    
    async def _auto_assign_agent(self, task: Task) -> AgentSpec:
        """Auto-assign an agent based on task requirements."""
        goal_lower = task.goal.lower()
        
        # Simple keyword matching
        if any(kw in goal_lower for kw in ["code", "implement", "debug", "fix", "build"]):
            return self.agents["coder"]
        elif any(kw in goal_lower for kw in ["research", "analyze", "investigate", "find"]):
            return self.agents["researcher"]
        elif any(kw in goal_lower for kw in ["write", "draft", "edit", "content"]):
            return self.agents["writer"]
        elif any(kw in goal_lower for kw in ["data", "chart", "graph", "statistics"]):
            return self.agents["analyst"]
        elif any(kw in goal_lower for kw in ["automate", "workflow", "integrate"]):
            return self.agents["automator"]
        else:
            return self.agents["coordinator"]


# ============================================================================
# Master Control Agent
# ============================================================================

class MasterControlAgent:
    """
    The central orchestrator for the HYPER UNICORN architecture.
    Manages the entire AI workforce.
    """
    
    def __init__(self):
        self.fabric = get_intelligence_fabric()
        self.memory = get_memory_cortex("mca")
        self.planner = TaskPlanner(self.fabric)
        self.executor = TaskExecutor(self.fabric)
        self.task_queue: List[Task] = []
        self.completed_tasks: List[Task] = []
        self.active_tasks: Dict[str, Task] = {}
    
    async def process_goal(self, goal: str, priority: TaskPriority = TaskPriority.NORMAL) -> Dict:
        """Process a high-level goal from the CEO (user)."""
        logger.info(f"Processing goal: {goal}")
        
        # Store in memory
        await self.memory.remember(
            f"Goal received: {goal}",
            memory_type=MemoryType.EPISODIC,
            importance=0.8
        )
        
        # Plan the goal
        tasks = await self.planner.plan(goal)
        
        # Create master task
        master_task = Task(
            id=hashlib.md5(goal.encode()).hexdigest()[:12],
            goal=goal,
            priority=priority,
            status=TaskStatus.PLANNING,
            subtasks=tasks
        )
        
        # Execute tasks
        master_task.status = TaskStatus.IN_PROGRESS
        master_task.started_at = datetime.now().isoformat()
        
        results = []
        for task in tasks:
            self.active_tasks[task.id] = task
            completed_task = await self.executor.execute(task)
            results.append(completed_task.to_dict())
            self.completed_tasks.append(completed_task)
            del self.active_tasks[task.id]
        
        # Determine overall status
        failed_count = sum(1 for t in tasks if t.status == TaskStatus.FAILED)
        if failed_count == 0:
            master_task.status = TaskStatus.COMPLETED
        elif failed_count == len(tasks):
            master_task.status = TaskStatus.FAILED
        else:
            master_task.status = TaskStatus.COMPLETED  # Partial success
        
        master_task.completed_at = datetime.now().isoformat()
        master_task.result = results
        
        # Learn from the experience
        learnings = []
        for task in tasks:
            if task.status == TaskStatus.COMPLETED:
                learnings.append(f"Successfully completed: {task.goal}")
            else:
                learnings.append(f"Failed: {task.goal} - {task.error}")
        
        await self.memory.learn_from_task(
            task=goal,
            outcome="success" if master_task.status == TaskStatus.COMPLETED else "partial",
            actions=[t.to_dict() for t in tasks],
            learnings=learnings
        )
        
        return master_task.to_dict()
    
    async def get_status(self) -> Dict:
        """Get current system status."""
        return {
            "active_tasks": len(self.active_tasks),
            "completed_tasks": len(self.completed_tasks),
            "queued_tasks": len(self.task_queue),
            "agents": {
                agent_id: {
                    "name": agent.name,
                    "current_tasks": agent.current_tasks,
                    "available": agent.is_available(),
                    "performance": agent.performance_score
                }
                for agent_id, agent in AGENT_CONSTELLATION.items()
            },
            "intelligence_stats": self.fabric.get_stats(),
            "memory_stats": await self.memory.get_stats()
        }
    
    async def get_agent_info(self, agent_id: str) -> Optional[Dict]:
        """Get information about a specific agent."""
        agent = AGENT_CONSTELLATION.get(agent_id)
        if not agent:
            return None
        
        return {
            "id": agent.id,
            "name": agent.name,
            "role": agent.role,
            "capabilities": agent.capabilities,
            "tools": agent.tools,
            "current_tasks": agent.current_tasks,
            "max_concurrent_tasks": agent.max_concurrent_tasks,
            "performance_score": agent.performance_score,
            "available": agent.is_available()
        }


# ============================================================================
# FastAPI Application
# ============================================================================

app = FastAPI(
    title="HYPER UNICORN MCA",
    description="Master Control Agent for the SuperMega.dev AI Agent Infrastructure",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global MCA instance
mca = MasterControlAgent()


class GoalRequest(BaseModel):
    goal: str
    priority: str = "normal"


class TaskResponse(BaseModel):
    success: bool
    task: Optional[Dict] = None
    error: Optional[str] = None


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}


@app.post("/goal", response_model=TaskResponse)
async def submit_goal(request: GoalRequest, background_tasks: BackgroundTasks):
    """Submit a goal for the MCA to process."""
    try:
        priority = TaskPriority(request.priority)
        result = await mca.process_goal(request.goal, priority)
        return TaskResponse(success=True, task=result)
    except Exception as e:
        logger.error(f"Error processing goal: {e}")
        return TaskResponse(success=False, error=str(e))


@app.get("/status")
async def get_status():
    """Get current system status."""
    return await mca.get_status()


@app.get("/agents")
async def list_agents():
    """List all available agents."""
    return {
        agent_id: {
            "name": agent.name,
            "role": agent.role,
            "capabilities": agent.capabilities,
            "available": agent.is_available()
        }
        for agent_id, agent in AGENT_CONSTELLATION.items()
    }


@app.get("/agents/{agent_id}")
async def get_agent(agent_id: str):
    """Get information about a specific agent."""
    info = await mca.get_agent_info(agent_id)
    if not info:
        raise HTTPException(status_code=404, detail="Agent not found")
    return info


@app.get("/tasks/active")
async def get_active_tasks():
    """Get currently active tasks."""
    return {
        task_id: task.to_dict()
        for task_id, task in mca.active_tasks.items()
    }


@app.get("/tasks/completed")
async def get_completed_tasks(limit: int = 10):
    """Get recently completed tasks."""
    return [task.to_dict() for task in mca.completed_tasks[-limit:]]


# ============================================================================
# Main
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
