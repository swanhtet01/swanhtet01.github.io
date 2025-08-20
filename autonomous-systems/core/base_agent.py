#!/usr/bin/env python3
"""
🤖 Base Agent Framework - Core Infrastructure
============================================
Unified base class for all autonomous agents in the MEGA Agent OS
"""

import asyncio
import json
import logging
import time
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Dict, List, Any, Optional, Union
from dataclasses import dataclass, field
from enum import Enum


class AgentStatus(Enum):
    """Agent status enumeration"""
    IDLE = "idle"
    ACTIVE = "active"
    PAUSED = "paused"
    ERROR = "error"
    COMPLETED = "completed"


class TaskPriority(Enum):
    """Task priority levels"""
    LOW = 1
    MEDIUM = 2
    HIGH = 3
    CRITICAL = 4


@dataclass
class AgentTask:
    """Standardized task structure for all agents"""
    id: str
    description: str
    priority: TaskPriority
    assigned_to: str
    created_at: datetime = field(default_factory=datetime.now)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    status: str = "pending"
    metadata: Dict[str, Any] = field(default_factory=dict)
    result: Optional[Any] = None
    error: Optional[str] = None


@dataclass
class AgentMetrics:
    """Performance metrics for agents"""
    tasks_completed: int = 0
    tasks_failed: int = 0
    average_completion_time: float = 0.0
    uptime: float = 0.0
    last_activity: Optional[datetime] = None
    efficiency_score: float = 1.0


class BaseAgent(ABC):
    """
    Abstract base class for all autonomous agents
    Provides standard interface and common functionality
    """
    
    def __init__(self, agent_id: str, name: str, description: str, 
                 tools: List[str] = None, capabilities: List[str] = None):
        self.agent_id = agent_id
        self.name = name
        self.description = description
        self.tools = tools or []
        self.capabilities = capabilities or []
        
        # Agent state
        self.status = AgentStatus.IDLE
        self.current_task: Optional[AgentTask] = None
        self.task_queue: List[AgentTask] = []
        self.completed_tasks: List[AgentTask] = []
        self.metrics = AgentMetrics()
        
        # Configuration
        self.config: Dict[str, Any] = {}
        self.max_concurrent_tasks = 1
        self.retry_attempts = 3
        self.timeout_seconds = 300
        
        # Logging
        self.logger = self._setup_logging()
        self.log_history: List[Dict] = []
        
        # Event handlers
        self._event_handlers = {}
        
    def _setup_logging(self) -> logging.Logger:
        """Setup agent-specific logging"""
        logger = logging.getLogger(f"agent.{self.agent_id}")
        logger.setLevel(logging.INFO)
        
        if not logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter(
                f'%(asctime)s - {self.agent_id} - %(levelname)s - %(message)s'
            )
            handler.setFormatter(formatter)
            logger.addHandler(handler)
            
        return logger
    
    def log(self, message: str, level: str = "info", **kwargs):
        """Centralized logging with history tracking"""
        timestamp = datetime.now()
        log_entry = {
            'timestamp': timestamp,
            'agent': self.name,
            'level': level,
            'message': message,
            **kwargs
        }
        
        # Add to history
        self.log_history.append(log_entry)
        
        # Keep only last 100 logs
        if len(self.log_history) > 100:
            self.log_history = self.log_history[-100:]
            
        # Log to logger
        getattr(self.logger, level.lower(), self.logger.info)(message)
    
    async def add_task(self, task: AgentTask) -> bool:
        """Add task to agent queue"""
        try:
            self.task_queue.append(task)
            self.log(f"Task added: {task.description[:50]}...", "info")
            
            # Trigger task processing if agent is idle
            if self.status == AgentStatus.IDLE:
                await self.start()
                
            return True
        except Exception as e:
            self.log(f"Failed to add task: {str(e)}", "error")
            return False
    
    async def start(self) -> bool:
        """Start the agent"""
        try:
            if self.status == AgentStatus.ACTIVE:
                return True
                
            self.status = AgentStatus.ACTIVE
            self.log("Agent started", "info")
            
            # Start task processing loop
            asyncio.create_task(self._task_processing_loop())
            
            return True
        except Exception as e:
            self.log(f"Failed to start agent: {str(e)}", "error")
            self.status = AgentStatus.ERROR
            return False
    
    async def pause(self) -> bool:
        """Pause the agent"""
        try:
            self.status = AgentStatus.PAUSED
            self.log("Agent paused", "info")
            return True
        except Exception as e:
            self.log(f"Failed to pause agent: {str(e)}", "error")
            return False
    
    async def stop(self) -> bool:
        """Stop the agent"""
        try:
            self.status = AgentStatus.IDLE
            self.current_task = None
            self.log("Agent stopped", "info")
            return True
        except Exception as e:
            self.log(f"Failed to stop agent: {str(e)}", "error")
            return False
    
    async def _task_processing_loop(self):
        """Main task processing loop"""
        while self.status == AgentStatus.ACTIVE:
            try:
                if self.task_queue and not self.current_task:
                    # Get next task
                    task = self.task_queue.pop(0)
                    await self._execute_task(task)
                
                # Brief pause to prevent busy waiting
                await asyncio.sleep(0.1)
                
            except Exception as e:
                self.log(f"Error in task processing loop: {str(e)}", "error")
                await asyncio.sleep(1)  # Wait longer on error
    
    async def _execute_task(self, task: AgentTask):
        """Execute a single task with error handling and metrics"""
        start_time = datetime.now()
        
        try:
            # Update task and agent state
            self.current_task = task
            task.status = "running"
            task.started_at = start_time
            
            self.log(f"Starting task: {task.description}", "info")
            
            # Execute the task (implemented by subclass)
            result = await self.process_task(task)
            
            # Task completed successfully
            task.status = "completed"
            task.completed_at = datetime.now()
            task.result = result
            
            self.completed_tasks.append(task)
            self.current_task = None
            
            # Update metrics
            completion_time = (task.completed_at - task.started_at).total_seconds()
            self._update_metrics(completion_time, success=True)
            
            self.log(f"Task completed: {task.description}", "info")
            
            # Trigger completion event
            await self._trigger_event('task_completed', task)
            
        except Exception as e:
            # Task failed
            task.status = "failed"
            task.completed_at = datetime.now()
            task.error = str(e)
            
            self.completed_tasks.append(task)
            self.current_task = None
            
            # Update metrics
            completion_time = (task.completed_at - task.started_at).total_seconds()
            self._update_metrics(completion_time, success=False)
            
            self.log(f"Task failed: {task.description} - Error: {str(e)}", "error")
            
            # Trigger failure event
            await self._trigger_event('task_failed', task)
    
    def _update_metrics(self, completion_time: float, success: bool):
        """Update agent performance metrics"""
        if success:
            self.metrics.tasks_completed += 1
            
            # Update average completion time
            total_tasks = self.metrics.tasks_completed
            current_avg = self.metrics.average_completion_time
            self.metrics.average_completion_time = (
                (current_avg * (total_tasks - 1) + completion_time) / total_tasks
            )
        else:
            self.metrics.tasks_failed += 1
        
        # Update efficiency score
        total_tasks = self.metrics.tasks_completed + self.metrics.tasks_failed
        if total_tasks > 0:
            self.metrics.efficiency_score = self.metrics.tasks_completed / total_tasks
        
        self.metrics.last_activity = datetime.now()
    
    async def _trigger_event(self, event_type: str, data: Any):
        """Trigger registered event handlers"""
        if event_type in self._event_handlers:
            for handler in self._event_handlers[event_type]:
                try:
                    await handler(self, data)
                except Exception as e:
                    self.log(f"Event handler error: {str(e)}", "error")
    
    def on(self, event_type: str, handler):
        """Register event handler"""
        if event_type not in self._event_handlers:
            self._event_handlers[event_type] = []
        self._event_handlers[event_type].append(handler)
    
    def get_status(self) -> Dict[str, Any]:
        """Get comprehensive agent status"""
        return {
            'agent_id': self.agent_id,
            'name': self.name,
            'description': self.description,
            'status': self.status.value,
            'tools': self.tools,
            'capabilities': self.capabilities,
            'current_task': self.current_task.description if self.current_task else None,
            'queue_length': len(self.task_queue),
            'metrics': {
                'tasks_completed': self.metrics.tasks_completed,
                'tasks_failed': self.metrics.tasks_failed,
                'average_completion_time': self.metrics.average_completion_time,
                'efficiency_score': self.metrics.efficiency_score,
                'last_activity': self.metrics.last_activity.isoformat() if self.metrics.last_activity else None
            }
        }
    
    def get_recent_logs(self, count: int = 10) -> List[Dict]:
        """Get recent log entries"""
        return self.log_history[-count:] if self.log_history else []
    
    @abstractmethod
    async def process_task(self, task: AgentTask) -> Any:
        """
        Process a single task - must be implemented by subclass
        
        Args:
            task: The task to process
            
        Returns:
            Task result (any type)
            
        Raises:
            Exception: If task processing fails
        """
        pass
    
    @abstractmethod
    def get_capabilities(self) -> List[str]:
        """Get list of agent capabilities - must be implemented by subclass"""
        pass
    
    def can_handle_task(self, task: AgentTask) -> bool:
        """Check if agent can handle a specific task"""
        # Default implementation - can be overridden by subclasses
        return True
    
    def estimate_completion_time(self, task: AgentTask) -> float:
        """Estimate task completion time in seconds"""
        # Default implementation based on average
        return self.metrics.average_completion_time or 60.0


class AgentManager:
    """
    Manager class for coordinating multiple agents
    """
    
    def __init__(self):
        self.agents: Dict[str, BaseAgent] = {}
        self.task_history: List[AgentTask] = []
        self.logger = logging.getLogger("agent_manager")
        
    def register_agent(self, agent: BaseAgent):
        """Register an agent with the manager"""
        self.agents[agent.agent_id] = agent
        self.logger.info(f"Registered agent: {agent.name}")
    
    def unregister_agent(self, agent_id: str):
        """Unregister an agent"""
        if agent_id in self.agents:
            del self.agents[agent_id]
            self.logger.info(f"Unregistered agent: {agent_id}")
    
    async def assign_task(self, task: AgentTask, agent_id: Optional[str] = None) -> bool:
        """Assign task to specific agent or best available agent"""
        try:
            # If specific agent requested
            if agent_id:
                if agent_id in self.agents:
                    agent = self.agents[agent_id]
                    return await agent.add_task(task)
                else:
                    raise ValueError(f"Agent {agent_id} not found")
            
            # Find best agent for task
            best_agent = self._find_best_agent(task)
            if best_agent:
                task.assigned_to = best_agent.agent_id
                return await best_agent.add_task(task)
            else:
                raise ValueError("No suitable agent found for task")
                
        except Exception as e:
            self.logger.error(f"Failed to assign task: {str(e)}")
            return False
    
    def _find_best_agent(self, task: AgentTask) -> Optional[BaseAgent]:
        """Find the best agent for a given task"""
        suitable_agents = [
            agent for agent in self.agents.values() 
            if agent.can_handle_task(task) and agent.status != AgentStatus.ERROR
        ]
        
        if not suitable_agents:
            return None
        
        # Sort by efficiency score and queue length
        suitable_agents.sort(
            key=lambda a: (a.metrics.efficiency_score, -len(a.task_queue)), 
            reverse=True
        )
        
        return suitable_agents[0]
    
    def get_system_status(self) -> Dict[str, Any]:
        """Get overall system status"""
        total_tasks = sum(len(agent.completed_tasks) for agent in self.agents.values())
        active_agents = sum(1 for agent in self.agents.values() if agent.status == AgentStatus.ACTIVE)
        
        return {
            'total_agents': len(self.agents),
            'active_agents': active_agents,
            'total_tasks_completed': total_tasks,
            'agents': [agent.get_status() for agent in self.agents.values()]
        }


# Export key classes
__all__ = [
    'BaseAgent', 
    'AgentManager', 
    'AgentTask', 
    'AgentStatus', 
    'TaskPriority', 
    'AgentMetrics'
]
