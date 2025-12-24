"""
Agent Collaboration Protocol
============================
Enables multi-agent collaboration for complex tasks.

Features:
- Agent-to-agent communication
- Task handoff protocols
- Shared memory and context
- Consensus mechanisms
- Workflow orchestration

Author: Manus AI for SuperMega.dev
"""

import os
import sys
import json
import asyncio
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, List, Any, Callable, Set
from dataclasses import dataclass, field
from enum import Enum
import logging
import uuid

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("collaboration")


# ============================================================================
# Data Models
# ============================================================================

class MessageType(Enum):
    """Types of inter-agent messages."""
    REQUEST = "request"
    RESPONSE = "response"
    BROADCAST = "broadcast"
    HANDOFF = "handoff"
    STATUS = "status"
    QUERY = "query"
    RESULT = "result"


class CollaborationMode(Enum):
    """Modes of agent collaboration."""
    SEQUENTIAL = "sequential"  # Agents work one after another
    PARALLEL = "parallel"      # Agents work simultaneously
    HIERARCHICAL = "hierarchical"  # Manager delegates to workers
    CONSENSUS = "consensus"    # Agents vote on decisions
    SWARM = "swarm"           # Emergent collaboration


@dataclass
class AgentMessage:
    """A message between agents."""
    message_id: str
    message_type: MessageType
    sender: str
    recipient: str  # Can be "all" for broadcast
    content: Dict[str, Any]
    timestamp: datetime = field(default_factory=datetime.utcnow)
    reply_to: Optional[str] = None
    priority: int = 5  # 1-10, 1 is highest


@dataclass
class SharedContext:
    """Shared context between collaborating agents."""
    context_id: str
    task_description: str
    participants: List[str]
    data: Dict[str, Any] = field(default_factory=dict)
    artifacts: List[str] = field(default_factory=list)
    decisions: List[Dict[str, Any]] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.utcnow)


@dataclass
class CollaborationTask:
    """A task requiring multi-agent collaboration."""
    task_id: str
    description: str
    mode: CollaborationMode
    required_agents: List[str]
    subtasks: List[Dict[str, Any]] = field(default_factory=list)
    dependencies: Dict[str, List[str]] = field(default_factory=dict)
    status: str = "pending"
    progress: float = 0.0
    results: Dict[str, Any] = field(default_factory=dict)


# ============================================================================
# Message Bus
# ============================================================================

class MessageBus:
    """
    Central message bus for agent communication.
    """
    
    def __init__(self):
        self.subscribers: Dict[str, List[Callable]] = {}
        self.message_queue: asyncio.Queue = asyncio.Queue()
        self.message_history: List[AgentMessage] = []
        self.running = False
    
    def subscribe(self, agent_id: str, handler: Callable):
        """Subscribe an agent to receive messages."""
        if agent_id not in self.subscribers:
            self.subscribers[agent_id] = []
        self.subscribers[agent_id].append(handler)
        logger.info(f"Agent {agent_id} subscribed to message bus")
    
    def unsubscribe(self, agent_id: str):
        """Unsubscribe an agent from the message bus."""
        if agent_id in self.subscribers:
            del self.subscribers[agent_id]
    
    async def publish(self, message: AgentMessage):
        """Publish a message to the bus."""
        await self.message_queue.put(message)
        self.message_history.append(message)
        
        # Keep only last 1000 messages
        if len(self.message_history) > 1000:
            self.message_history = self.message_history[-1000:]
    
    async def send_direct(self, message: AgentMessage):
        """Send a message directly to a specific agent."""
        if message.recipient in self.subscribers:
            for handler in self.subscribers[message.recipient]:
                try:
                    if asyncio.iscoroutinefunction(handler):
                        await handler(message)
                    else:
                        handler(message)
                except Exception as e:
                    logger.error(f"Error delivering message to {message.recipient}: {e}")
        else:
            logger.warning(f"No subscriber for agent {message.recipient}")
    
    async def broadcast(self, message: AgentMessage):
        """Broadcast a message to all agents."""
        for agent_id, handlers in self.subscribers.items():
            if agent_id != message.sender:  # Don't send to self
                for handler in handlers:
                    try:
                        if asyncio.iscoroutinefunction(handler):
                            await handler(message)
                        else:
                            handler(message)
                    except Exception as e:
                        logger.error(f"Error broadcasting to {agent_id}: {e}")
    
    async def run(self):
        """Run the message bus processor."""
        self.running = True
        logger.info("Message bus started")
        
        while self.running:
            try:
                message = await asyncio.wait_for(
                    self.message_queue.get(),
                    timeout=1.0
                )
                
                if message.recipient == "all":
                    await self.broadcast(message)
                else:
                    await self.send_direct(message)
                    
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                logger.error(f"Message bus error: {e}")
    
    def stop(self):
        """Stop the message bus."""
        self.running = False


# ============================================================================
# Shared Memory
# ============================================================================

class SharedMemory:
    """
    Shared memory space for collaborating agents.
    """
    
    def __init__(self):
        self.contexts: Dict[str, SharedContext] = {}
        self.locks: Dict[str, asyncio.Lock] = {}
    
    def create_context(
        self,
        task_description: str,
        participants: List[str]
    ) -> SharedContext:
        """Create a new shared context."""
        context_id = str(uuid.uuid4())[:8]
        
        context = SharedContext(
            context_id=context_id,
            task_description=task_description,
            participants=participants
        )
        
        self.contexts[context_id] = context
        self.locks[context_id] = asyncio.Lock()
        
        logger.info(f"Created shared context {context_id} for {len(participants)} agents")
        
        return context
    
    async def read(self, context_id: str, key: str = None) -> Any:
        """Read from shared context."""
        if context_id not in self.contexts:
            raise ValueError(f"Unknown context: {context_id}")
        
        context = self.contexts[context_id]
        
        if key:
            return context.data.get(key)
        return context.data
    
    async def write(self, context_id: str, key: str, value: Any, agent_id: str):
        """Write to shared context (with locking)."""
        if context_id not in self.contexts:
            raise ValueError(f"Unknown context: {context_id}")
        
        async with self.locks[context_id]:
            context = self.contexts[context_id]
            
            # Verify agent is a participant
            if agent_id not in context.participants:
                raise PermissionError(f"Agent {agent_id} not in context {context_id}")
            
            context.data[key] = value
            
            logger.debug(f"Agent {agent_id} wrote to context {context_id}: {key}")
    
    async def add_artifact(self, context_id: str, artifact_path: str, agent_id: str):
        """Add an artifact to the shared context."""
        if context_id not in self.contexts:
            raise ValueError(f"Unknown context: {context_id}")
        
        async with self.locks[context_id]:
            context = self.contexts[context_id]
            context.artifacts.append({
                "path": artifact_path,
                "added_by": agent_id,
                "timestamp": datetime.utcnow().isoformat()
            })
    
    async def add_decision(
        self,
        context_id: str,
        decision: str,
        rationale: str,
        agent_id: str
    ):
        """Record a decision in the shared context."""
        if context_id not in self.contexts:
            raise ValueError(f"Unknown context: {context_id}")
        
        async with self.locks[context_id]:
            context = self.contexts[context_id]
            context.decisions.append({
                "decision": decision,
                "rationale": rationale,
                "made_by": agent_id,
                "timestamp": datetime.utcnow().isoformat()
            })


# ============================================================================
# Collaboration Orchestrator
# ============================================================================

class CollaborationOrchestrator:
    """
    Orchestrates multi-agent collaboration.
    """
    
    def __init__(self):
        self.message_bus = MessageBus()
        self.shared_memory = SharedMemory()
        self.active_tasks: Dict[str, CollaborationTask] = {}
        self.agent_registry: Dict[str, Dict[str, Any]] = {}
    
    def register_agent(
        self,
        agent_id: str,
        agent_type: str,
        capabilities: List[str],
        handler: Callable
    ):
        """Register an agent for collaboration."""
        self.agent_registry[agent_id] = {
            "type": agent_type,
            "capabilities": capabilities,
            "status": "available"
        }
        
        self.message_bus.subscribe(agent_id, handler)
        
        logger.info(f"Registered agent {agent_id} ({agent_type})")
    
    def unregister_agent(self, agent_id: str):
        """Unregister an agent."""
        if agent_id in self.agent_registry:
            del self.agent_registry[agent_id]
        self.message_bus.unsubscribe(agent_id)
    
    async def create_collaboration(
        self,
        description: str,
        mode: CollaborationMode,
        required_capabilities: List[str] = None,
        specific_agents: List[str] = None
    ) -> CollaborationTask:
        """
        Create a new collaboration task.
        
        Args:
            description: Task description
            mode: Collaboration mode
            required_capabilities: Capabilities needed (auto-select agents)
            specific_agents: Specific agents to include
        """
        task_id = str(uuid.uuid4())[:8]
        
        # Select agents
        if specific_agents:
            agents = specific_agents
        elif required_capabilities:
            agents = self._select_agents_by_capability(required_capabilities)
        else:
            agents = list(self.agent_registry.keys())
        
        if not agents:
            raise ValueError("No suitable agents available")
        
        # Create task
        task = CollaborationTask(
            task_id=task_id,
            description=description,
            mode=mode,
            required_agents=agents
        )
        
        self.active_tasks[task_id] = task
        
        # Create shared context
        context = self.shared_memory.create_context(description, agents)
        task.results["context_id"] = context.context_id
        
        logger.info(f"Created collaboration task {task_id} with {len(agents)} agents")
        
        return task
    
    def _select_agents_by_capability(self, capabilities: List[str]) -> List[str]:
        """Select agents that have the required capabilities."""
        selected = []
        
        for agent_id, info in self.agent_registry.items():
            if info["status"] != "available":
                continue
            
            agent_caps = set(info["capabilities"])
            required_caps = set(capabilities)
            
            if required_caps & agent_caps:  # Has at least one required capability
                selected.append(agent_id)
        
        return selected
    
    async def execute_sequential(self, task: CollaborationTask) -> Dict[str, Any]:
        """Execute task with agents working sequentially."""
        results = {}
        context_id = task.results.get("context_id")
        
        for i, agent_id in enumerate(task.required_agents):
            # Send task to agent
            message = AgentMessage(
                message_id=str(uuid.uuid4())[:8],
                message_type=MessageType.REQUEST,
                sender="orchestrator",
                recipient=agent_id,
                content={
                    "task_id": task.task_id,
                    "description": task.description,
                    "context_id": context_id,
                    "sequence": i,
                    "previous_results": results
                }
            )
            
            await self.message_bus.publish(message)
            
            # Wait for response (simplified - real implementation would use async callbacks)
            await asyncio.sleep(1)
            
            # Update progress
            task.progress = (i + 1) / len(task.required_agents)
        
        task.status = "completed"
        return results
    
    async def execute_parallel(self, task: CollaborationTask) -> Dict[str, Any]:
        """Execute task with agents working in parallel."""
        context_id = task.results.get("context_id")
        
        # Send task to all agents simultaneously
        for agent_id in task.required_agents:
            message = AgentMessage(
                message_id=str(uuid.uuid4())[:8],
                message_type=MessageType.REQUEST,
                sender="orchestrator",
                recipient=agent_id,
                content={
                    "task_id": task.task_id,
                    "description": task.description,
                    "context_id": context_id,
                    "mode": "parallel"
                }
            )
            
            await self.message_bus.publish(message)
        
        # Wait for all agents (simplified)
        await asyncio.sleep(2)
        
        task.status = "completed"
        task.progress = 1.0
        
        return task.results
    
    async def execute_hierarchical(
        self,
        task: CollaborationTask,
        manager_agent: str
    ) -> Dict[str, Any]:
        """Execute task with a manager delegating to workers."""
        context_id = task.results.get("context_id")
        
        # Send task to manager
        message = AgentMessage(
            message_id=str(uuid.uuid4())[:8],
            message_type=MessageType.REQUEST,
            sender="orchestrator",
            recipient=manager_agent,
            content={
                "task_id": task.task_id,
                "description": task.description,
                "context_id": context_id,
                "mode": "hierarchical",
                "workers": [a for a in task.required_agents if a != manager_agent]
            }
        )
        
        await self.message_bus.publish(message)
        
        # Manager will delegate and coordinate
        await asyncio.sleep(3)
        
        task.status = "completed"
        task.progress = 1.0
        
        return task.results
    
    async def execute_consensus(
        self,
        task: CollaborationTask,
        question: str,
        options: List[str]
    ) -> Dict[str, Any]:
        """Execute task requiring consensus among agents."""
        context_id = task.results.get("context_id")
        votes: Dict[str, str] = {}
        
        # Request votes from all agents
        for agent_id in task.required_agents:
            message = AgentMessage(
                message_id=str(uuid.uuid4())[:8],
                message_type=MessageType.QUERY,
                sender="orchestrator",
                recipient=agent_id,
                content={
                    "task_id": task.task_id,
                    "question": question,
                    "options": options,
                    "context_id": context_id
                }
            )
            
            await self.message_bus.publish(message)
        
        # Collect votes (simplified)
        await asyncio.sleep(2)
        
        # Tally votes and determine consensus
        # In real implementation, this would collect actual responses
        
        task.status = "completed"
        task.results["consensus"] = {
            "question": question,
            "votes": votes,
            "decision": options[0] if options else None
        }
        
        return task.results
    
    async def execute(self, task: CollaborationTask) -> Dict[str, Any]:
        """Execute a collaboration task based on its mode."""
        task.status = "running"
        
        try:
            if task.mode == CollaborationMode.SEQUENTIAL:
                return await self.execute_sequential(task)
            elif task.mode == CollaborationMode.PARALLEL:
                return await self.execute_parallel(task)
            elif task.mode == CollaborationMode.HIERARCHICAL:
                manager = task.required_agents[0]  # First agent is manager
                return await self.execute_hierarchical(task, manager)
            elif task.mode == CollaborationMode.CONSENSUS:
                return await self.execute_consensus(
                    task,
                    task.description,
                    ["option_a", "option_b"]  # Would be extracted from task
                )
            else:
                raise ValueError(f"Unknown collaboration mode: {task.mode}")
                
        except Exception as e:
            task.status = "failed"
            task.results["error"] = str(e)
            raise
    
    async def handoff(
        self,
        from_agent: str,
        to_agent: str,
        task_data: Dict[str, Any],
        context_id: str = None
    ):
        """Hand off a task from one agent to another."""
        message = AgentMessage(
            message_id=str(uuid.uuid4())[:8],
            message_type=MessageType.HANDOFF,
            sender=from_agent,
            recipient=to_agent,
            content={
                "task_data": task_data,
                "context_id": context_id,
                "handoff_reason": "task_continuation"
            }
        )
        
        await self.message_bus.publish(message)
        
        logger.info(f"Task handed off from {from_agent} to {to_agent}")
    
    async def start(self):
        """Start the collaboration orchestrator."""
        asyncio.create_task(self.message_bus.run())
        logger.info("Collaboration Orchestrator started")
    
    def stop(self):
        """Stop the collaboration orchestrator."""
        self.message_bus.stop()


# ============================================================================
# Collaboration Patterns
# ============================================================================

class CollaborationPatterns:
    """
    Pre-defined collaboration patterns for common scenarios.
    """
    
    @staticmethod
    async def research_and_write(
        orchestrator: CollaborationOrchestrator,
        topic: str
    ) -> CollaborationTask:
        """
        Pattern: Research agent gathers info, content agent writes.
        """
        task = await orchestrator.create_collaboration(
            description=f"Research and write about: {topic}",
            mode=CollaborationMode.SEQUENTIAL,
            required_capabilities=["research", "writing"]
        )
        
        return task
    
    @staticmethod
    async def code_review(
        orchestrator: CollaborationOrchestrator,
        code_path: str
    ) -> CollaborationTask:
        """
        Pattern: Multiple code agents review in parallel.
        """
        task = await orchestrator.create_collaboration(
            description=f"Review code: {code_path}",
            mode=CollaborationMode.PARALLEL,
            required_capabilities=["coding", "review"]
        )
        
        return task
    
    @staticmethod
    async def strategic_decision(
        orchestrator: CollaborationOrchestrator,
        decision: str,
        options: List[str]
    ) -> CollaborationTask:
        """
        Pattern: Agents vote on a strategic decision.
        """
        task = await orchestrator.create_collaboration(
            description=decision,
            mode=CollaborationMode.CONSENSUS,
            required_capabilities=["analysis", "strategy"]
        )
        
        task.results["options"] = options
        
        return task
    
    @staticmethod
    async def complex_project(
        orchestrator: CollaborationOrchestrator,
        project_description: str,
        manager_agent: str
    ) -> CollaborationTask:
        """
        Pattern: Manager delegates subtasks to specialized agents.
        """
        task = await orchestrator.create_collaboration(
            description=project_description,
            mode=CollaborationMode.HIERARCHICAL,
            specific_agents=[manager_agent]
        )
        
        return task


# ============================================================================
# Main Entry Point
# ============================================================================

async def main():
    """Demo the Collaboration Protocol."""
    orchestrator = CollaborationOrchestrator()
    
    # Register some agents
    async def research_handler(msg):
        print(f"Research Agent received: {msg.content}")
    
    async def code_handler(msg):
        print(f"Code Agent received: {msg.content}")
    
    async def content_handler(msg):
        print(f"Content Agent received: {msg.content}")
    
    orchestrator.register_agent(
        "research_01",
        "research",
        ["research", "analysis"],
        research_handler
    )
    
    orchestrator.register_agent(
        "code_01",
        "code",
        ["coding", "review"],
        code_handler
    )
    
    orchestrator.register_agent(
        "content_01",
        "content",
        ["writing", "editing"],
        content_handler
    )
    
    # Start orchestrator
    await orchestrator.start()
    
    # Create a collaboration task
    task = await orchestrator.create_collaboration(
        description="Research AI trends and write a report",
        mode=CollaborationMode.SEQUENTIAL,
        required_capabilities=["research", "writing"]
    )
    
    print(f"Created task: {task.task_id}")
    print(f"Agents: {task.required_agents}")
    
    # Execute the task
    results = await orchestrator.execute(task)
    
    print(f"Task completed: {task.status}")
    print(f"Results: {results}")
    
    # Stop
    orchestrator.stop()


if __name__ == "__main__":
    asyncio.run(main())
