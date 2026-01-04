"""
Agent-to-Agent Communication Protocol
======================================
Enables agents to collaborate on complex tasks through structured messaging.

Features:
- Message passing between agents
- Task delegation and handoffs
- Shared context and memory
- Workflow orchestration
- Conflict resolution
- Consensus building
"""

import os
import json
import asyncio
from datetime import datetime
from typing import Dict, List, Any, Optional, Callable, Set
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict
import uuid


class MessageType(Enum):
    """Types of inter-agent messages."""
    REQUEST = "request"  # Ask another agent to do something
    RESPONSE = "response"  # Reply to a request
    INFORM = "inform"  # Share information
    DELEGATE = "delegate"  # Hand off a task
    QUERY = "query"  # Ask for information
    BROADCAST = "broadcast"  # Send to all agents
    HANDSHAKE = "handshake"  # Establish connection
    HEARTBEAT = "heartbeat"  # Status check
    ESCALATE = "escalate"  # Escalate to supervisor
    CONSENSUS = "consensus"  # Request consensus decision


class MessagePriority(Enum):
    """Message priority levels."""
    LOW = 1
    NORMAL = 2
    HIGH = 3
    URGENT = 4
    CRITICAL = 5


class AgentStatus(Enum):
    """Agent operational status."""
    IDLE = "idle"
    BUSY = "busy"
    WAITING = "waiting"
    ERROR = "error"
    OFFLINE = "offline"


@dataclass
class AgentMessage:
    """Represents a message between agents."""
    id: str
    type: MessageType
    sender: str
    recipient: str  # Agent ID or "broadcast"
    content: Dict[str, Any]
    priority: MessagePriority = MessagePriority.NORMAL
    timestamp: datetime = field(default_factory=datetime.now)
    reply_to: Optional[str] = None  # ID of message being replied to
    requires_response: bool = False
    timeout_seconds: int = 300
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "type": self.type.value,
            "sender": self.sender,
            "recipient": self.recipient,
            "content": self.content,
            "priority": self.priority.value,
            "timestamp": self.timestamp.isoformat(),
            "reply_to": self.reply_to,
            "requires_response": self.requires_response,
            "metadata": self.metadata
        }


@dataclass
class AgentCapability:
    """Describes what an agent can do."""
    name: str
    description: str
    input_schema: Dict[str, Any] = field(default_factory=dict)
    output_schema: Dict[str, Any] = field(default_factory=dict)
    cost_estimate: float = 0  # Estimated cost per invocation
    time_estimate: int = 0  # Estimated time in seconds


@dataclass
class AgentProfile:
    """Profile of a registered agent."""
    id: str
    name: str
    type: str  # research, code, content, etc.
    capabilities: List[AgentCapability] = field(default_factory=list)
    status: AgentStatus = AgentStatus.IDLE
    current_task: Optional[str] = None
    message_handler: Optional[Callable] = None
    last_heartbeat: datetime = field(default_factory=datetime.now)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class Conversation:
    """A conversation thread between agents."""
    id: str
    participants: Set[str]
    messages: List[AgentMessage] = field(default_factory=list)
    topic: str = ""
    started_at: datetime = field(default_factory=datetime.now)
    ended_at: Optional[datetime] = None
    outcome: Optional[Dict[str, Any]] = None


@dataclass
class TaskHandoff:
    """Represents a task being handed off between agents."""
    id: str
    task_description: str
    from_agent: str
    to_agent: str
    context: Dict[str, Any] = field(default_factory=dict)
    artifacts: List[str] = field(default_factory=list)  # File paths, URLs, etc.
    instructions: str = ""
    deadline: Optional[datetime] = None
    status: str = "pending"  # pending, accepted, rejected, completed
    result: Optional[Dict[str, Any]] = None


class AgentCommunicationHub:
    """
    Central hub for agent-to-agent communication.
    
    Features:
    - Agent registration and discovery
    - Message routing and delivery
    - Task delegation and handoffs
    - Conversation management
    - Consensus protocols
    - Load balancing
    """
    
    def __init__(self):
        self.agents: Dict[str, AgentProfile] = {}
        self.message_queues: Dict[str, List[AgentMessage]] = defaultdict(list)
        self.conversations: Dict[str, Conversation] = {}
        self.handoffs: Dict[str, TaskHandoff] = {}
        self.pending_responses: Dict[str, asyncio.Future] = {}
        self.message_history: List[AgentMessage] = []
        self.subscribers: Dict[str, List[Callable]] = defaultdict(list)
        
        # Performance metrics
        self.metrics = {
            "messages_sent": 0,
            "messages_delivered": 0,
            "handoffs_completed": 0,
            "avg_response_time": 0
        }
    
    # ==================== Agent Registration ====================
    
    def register_agent(
        self,
        agent_id: str,
        name: str,
        agent_type: str,
        capabilities: List[Dict[str, Any]] = None,
        message_handler: Callable = None
    ) -> AgentProfile:
        """Register an agent with the communication hub."""
        caps = []
        for cap_data in (capabilities or []):
            cap = AgentCapability(
                name=cap_data.get("name", ""),
                description=cap_data.get("description", ""),
                input_schema=cap_data.get("input_schema", {}),
                output_schema=cap_data.get("output_schema", {}),
                cost_estimate=cap_data.get("cost_estimate", 0),
                time_estimate=cap_data.get("time_estimate", 0)
            )
            caps.append(cap)
        
        profile = AgentProfile(
            id=agent_id,
            name=name,
            type=agent_type,
            capabilities=caps,
            message_handler=message_handler
        )
        
        self.agents[agent_id] = profile
        self.message_queues[agent_id] = []
        
        # Broadcast registration
        self._broadcast_event("agent_registered", {
            "agent_id": agent_id,
            "name": name,
            "type": agent_type
        })
        
        return profile
    
    def unregister_agent(self, agent_id: str):
        """Unregister an agent from the hub."""
        if agent_id in self.agents:
            del self.agents[agent_id]
            del self.message_queues[agent_id]
            
            self._broadcast_event("agent_unregistered", {"agent_id": agent_id})
    
    def get_agent(self, agent_id: str) -> Optional[AgentProfile]:
        """Get agent profile by ID."""
        return self.agents.get(agent_id)
    
    def find_agents_by_capability(self, capability_name: str) -> List[AgentProfile]:
        """Find agents that have a specific capability."""
        matching = []
        for agent in self.agents.values():
            for cap in agent.capabilities:
                if cap.name == capability_name:
                    matching.append(agent)
                    break
        return matching
    
    def find_agents_by_type(self, agent_type: str) -> List[AgentProfile]:
        """Find agents of a specific type."""
        return [a for a in self.agents.values() if a.type == agent_type]
    
    def get_available_agents(self) -> List[AgentProfile]:
        """Get all agents that are currently available."""
        return [a for a in self.agents.values() if a.status == AgentStatus.IDLE]
    
    # ==================== Message Passing ====================
    
    async def send_message(
        self,
        sender: str,
        recipient: str,
        content: Dict[str, Any],
        message_type: MessageType = MessageType.INFORM,
        priority: MessagePriority = MessagePriority.NORMAL,
        requires_response: bool = False,
        timeout: int = 300
    ) -> AgentMessage:
        """Send a message from one agent to another."""
        message = AgentMessage(
            id=str(uuid.uuid4()),
            type=message_type,
            sender=sender,
            recipient=recipient,
            content=content,
            priority=priority,
            requires_response=requires_response,
            timeout_seconds=timeout
        )
        
        # Add to history
        self.message_history.append(message)
        self.metrics["messages_sent"] += 1
        
        # Route message
        if recipient == "broadcast":
            await self._broadcast_message(message)
        else:
            await self._deliver_message(message)
        
        return message
    
    async def _deliver_message(self, message: AgentMessage):
        """Deliver a message to a specific agent."""
        recipient = self.agents.get(message.recipient)
        
        if not recipient:
            # Agent not found - queue for later
            self.message_queues[message.recipient].append(message)
            return
        
        # Add to queue
        self.message_queues[message.recipient].append(message)
        self.metrics["messages_delivered"] += 1
        
        # If agent has a handler, invoke it
        if recipient.message_handler:
            try:
                await recipient.message_handler(message)
            except Exception as e:
                print(f"Error delivering message to {message.recipient}: {e}")
        
        # Notify subscribers
        self._broadcast_event("message_delivered", message.to_dict())
    
    async def _broadcast_message(self, message: AgentMessage):
        """Broadcast a message to all agents."""
        for agent_id in self.agents:
            if agent_id != message.sender:
                broadcast_msg = AgentMessage(
                    id=str(uuid.uuid4()),
                    type=message.type,
                    sender=message.sender,
                    recipient=agent_id,
                    content=message.content,
                    priority=message.priority,
                    metadata={"broadcast_id": message.id}
                )
                await self._deliver_message(broadcast_msg)
    
    async def send_and_wait(
        self,
        sender: str,
        recipient: str,
        content: Dict[str, Any],
        message_type: MessageType = MessageType.REQUEST,
        timeout: int = 300
    ) -> Optional[AgentMessage]:
        """Send a message and wait for a response."""
        message = await self.send_message(
            sender=sender,
            recipient=recipient,
            content=content,
            message_type=message_type,
            requires_response=True,
            timeout=timeout
        )
        
        # Create future for response
        future = asyncio.get_event_loop().create_future()
        self.pending_responses[message.id] = future
        
        try:
            response = await asyncio.wait_for(future, timeout=timeout)
            return response
        except asyncio.TimeoutError:
            del self.pending_responses[message.id]
            return None
    
    async def reply_to_message(
        self,
        original_message: AgentMessage,
        content: Dict[str, Any],
        sender: str
    ) -> AgentMessage:
        """Reply to a message."""
        response = AgentMessage(
            id=str(uuid.uuid4()),
            type=MessageType.RESPONSE,
            sender=sender,
            recipient=original_message.sender,
            content=content,
            reply_to=original_message.id
        )
        
        # Resolve pending future if exists
        if original_message.id in self.pending_responses:
            self.pending_responses[original_message.id].set_result(response)
            del self.pending_responses[original_message.id]
        
        await self._deliver_message(response)
        return response
    
    def get_messages(
        self,
        agent_id: str,
        unread_only: bool = True
    ) -> List[AgentMessage]:
        """Get messages for an agent."""
        messages = self.message_queues.get(agent_id, [])
        if unread_only:
            # In production, would track read status
            return messages
        return messages
    
    # ==================== Task Delegation ====================
    
    async def delegate_task(
        self,
        from_agent: str,
        to_agent: str,
        task_description: str,
        context: Dict[str, Any] = None,
        artifacts: List[str] = None,
        instructions: str = "",
        deadline: Optional[datetime] = None
    ) -> TaskHandoff:
        """Delegate a task from one agent to another."""
        handoff = TaskHandoff(
            id=str(uuid.uuid4()),
            task_description=task_description,
            from_agent=from_agent,
            to_agent=to_agent,
            context=context or {},
            artifacts=artifacts or [],
            instructions=instructions,
            deadline=deadline
        )
        
        self.handoffs[handoff.id] = handoff
        
        # Send delegation message
        await self.send_message(
            sender=from_agent,
            recipient=to_agent,
            content={
                "handoff_id": handoff.id,
                "task": task_description,
                "context": context,
                "artifacts": artifacts,
                "instructions": instructions,
                "deadline": deadline.isoformat() if deadline else None
            },
            message_type=MessageType.DELEGATE,
            priority=MessagePriority.HIGH,
            requires_response=True
        )
        
        return handoff
    
    async def accept_handoff(
        self,
        handoff_id: str,
        agent_id: str
    ) -> TaskHandoff:
        """Accept a task handoff."""
        handoff = self.handoffs.get(handoff_id)
        if not handoff:
            raise ValueError(f"Handoff {handoff_id} not found")
        
        if handoff.to_agent != agent_id:
            raise ValueError(f"Agent {agent_id} is not the recipient of this handoff")
        
        handoff.status = "accepted"
        
        # Update agent status
        agent = self.agents.get(agent_id)
        if agent:
            agent.status = AgentStatus.BUSY
            agent.current_task = handoff.task_description
        
        # Notify sender
        await self.send_message(
            sender=agent_id,
            recipient=handoff.from_agent,
            content={
                "handoff_id": handoff_id,
                "status": "accepted",
                "message": f"Task accepted: {handoff.task_description}"
            },
            message_type=MessageType.INFORM
        )
        
        return handoff
    
    async def complete_handoff(
        self,
        handoff_id: str,
        agent_id: str,
        result: Dict[str, Any]
    ) -> TaskHandoff:
        """Complete a task handoff."""
        handoff = self.handoffs.get(handoff_id)
        if not handoff:
            raise ValueError(f"Handoff {handoff_id} not found")
        
        handoff.status = "completed"
        handoff.result = result
        
        # Update agent status
        agent = self.agents.get(agent_id)
        if agent:
            agent.status = AgentStatus.IDLE
            agent.current_task = None
        
        self.metrics["handoffs_completed"] += 1
        
        # Notify sender
        await self.send_message(
            sender=agent_id,
            recipient=handoff.from_agent,
            content={
                "handoff_id": handoff_id,
                "status": "completed",
                "result": result
            },
            message_type=MessageType.INFORM,
            priority=MessagePriority.HIGH
        )
        
        return handoff
    
    async def escalate_task(
        self,
        from_agent: str,
        task_description: str,
        reason: str,
        context: Dict[str, Any] = None
    ) -> AgentMessage:
        """Escalate a task to a supervisor or CEO agent."""
        # Find CEO or supervisor agent
        supervisors = self.find_agents_by_type("ceo") or self.find_agents_by_type("supervisor")
        
        if not supervisors:
            # Broadcast to all if no supervisor
            return await self.send_message(
                sender=from_agent,
                recipient="broadcast",
                content={
                    "task": task_description,
                    "reason": reason,
                    "context": context,
                    "needs_help": True
                },
                message_type=MessageType.ESCALATE,
                priority=MessagePriority.URGENT
            )
        
        return await self.send_message(
            sender=from_agent,
            recipient=supervisors[0].id,
            content={
                "task": task_description,
                "reason": reason,
                "context": context
            },
            message_type=MessageType.ESCALATE,
            priority=MessagePriority.URGENT,
            requires_response=True
        )
    
    # ==================== Conversations ====================
    
    def start_conversation(
        self,
        participants: List[str],
        topic: str
    ) -> Conversation:
        """Start a new conversation between agents."""
        conversation = Conversation(
            id=str(uuid.uuid4()),
            participants=set(participants),
            topic=topic
        )
        
        self.conversations[conversation.id] = conversation
        return conversation
    
    async def add_to_conversation(
        self,
        conversation_id: str,
        sender: str,
        content: Dict[str, Any]
    ) -> AgentMessage:
        """Add a message to a conversation."""
        conversation = self.conversations.get(conversation_id)
        if not conversation:
            raise ValueError(f"Conversation {conversation_id} not found")
        
        message = AgentMessage(
            id=str(uuid.uuid4()),
            type=MessageType.INFORM,
            sender=sender,
            recipient="conversation",
            content=content,
            metadata={"conversation_id": conversation_id}
        )
        
        conversation.messages.append(message)
        
        # Notify all participants
        for participant in conversation.participants:
            if participant != sender:
                await self._deliver_message(AgentMessage(
                    id=str(uuid.uuid4()),
                    type=MessageType.INFORM,
                    sender=sender,
                    recipient=participant,
                    content=content,
                    metadata={"conversation_id": conversation_id}
                ))
        
        return message
    
    def end_conversation(
        self,
        conversation_id: str,
        outcome: Dict[str, Any] = None
    ) -> Conversation:
        """End a conversation."""
        conversation = self.conversations.get(conversation_id)
        if conversation:
            conversation.ended_at = datetime.now()
            conversation.outcome = outcome
        return conversation
    
    # ==================== Consensus Protocol ====================
    
    async def request_consensus(
        self,
        requester: str,
        question: str,
        options: List[str],
        voters: List[str] = None,
        timeout: int = 60
    ) -> Dict[str, Any]:
        """Request consensus from multiple agents."""
        if not voters:
            voters = [a.id for a in self.get_available_agents() if a.id != requester]
        
        votes = {}
        
        # Send consensus request to all voters
        for voter in voters:
            await self.send_message(
                sender=requester,
                recipient=voter,
                content={
                    "question": question,
                    "options": options,
                    "vote_required": True
                },
                message_type=MessageType.CONSENSUS,
                requires_response=True,
                timeout=timeout
            )
        
        # Wait for responses (simplified - in production would use proper async gathering)
        await asyncio.sleep(min(timeout, 5))  # Wait briefly for votes
        
        # Tally votes (in production, would collect actual responses)
        # For now, return mock result
        return {
            "question": question,
            "options": options,
            "votes": votes,
            "winner": options[0] if options else None,
            "consensus_reached": True
        }
    
    # ==================== Event System ====================
    
    def subscribe(self, event_type: str, callback: Callable):
        """Subscribe to hub events."""
        self.subscribers[event_type].append(callback)
    
    def unsubscribe(self, event_type: str, callback: Callable):
        """Unsubscribe from hub events."""
        if callback in self.subscribers[event_type]:
            self.subscribers[event_type].remove(callback)
    
    def _broadcast_event(self, event_type: str, data: Dict[str, Any]):
        """Broadcast an event to all subscribers."""
        for callback in self.subscribers[event_type]:
            try:
                callback(event_type, data)
            except Exception as e:
                print(f"Error in event subscriber: {e}")
    
    # ==================== Health & Monitoring ====================
    
    async def heartbeat(self, agent_id: str) -> bool:
        """Record a heartbeat from an agent."""
        agent = self.agents.get(agent_id)
        if agent:
            agent.last_heartbeat = datetime.now()
            return True
        return False
    
    def get_agent_status(self, agent_id: str) -> Optional[AgentStatus]:
        """Get the current status of an agent."""
        agent = self.agents.get(agent_id)
        return agent.status if agent else None
    
    def set_agent_status(self, agent_id: str, status: AgentStatus):
        """Set the status of an agent."""
        agent = self.agents.get(agent_id)
        if agent:
            agent.status = status
    
    def get_hub_metrics(self) -> Dict[str, Any]:
        """Get communication hub metrics."""
        return {
            **self.metrics,
            "registered_agents": len(self.agents),
            "active_conversations": len([c for c in self.conversations.values() if not c.ended_at]),
            "pending_handoffs": len([h for h in self.handoffs.values() if h.status == "pending"]),
            "queued_messages": sum(len(q) for q in self.message_queues.values())
        }


# Global hub instance
_hub: Optional[AgentCommunicationHub] = None


def get_communication_hub() -> AgentCommunicationHub:
    """Get the global communication hub instance."""
    global _hub
    if _hub is None:
        _hub = AgentCommunicationHub()
    return _hub


# Convenience functions
async def quick_delegate(
    from_agent: str,
    capability_needed: str,
    task: str,
    context: Dict[str, Any] = None
) -> Optional[TaskHandoff]:
    """Quickly delegate a task to an agent with the needed capability."""
    hub = get_communication_hub()
    
    # Find suitable agent
    agents = hub.find_agents_by_capability(capability_needed)
    available = [a for a in agents if a.status == AgentStatus.IDLE]
    
    if not available:
        return None
    
    # Delegate to first available
    return await hub.delegate_task(
        from_agent=from_agent,
        to_agent=available[0].id,
        task_description=task,
        context=context
    )


async def broadcast_announcement(sender: str, message: str):
    """Broadcast an announcement to all agents."""
    hub = get_communication_hub()
    await hub.send_message(
        sender=sender,
        recipient="broadcast",
        content={"announcement": message},
        message_type=MessageType.BROADCAST,
        priority=MessagePriority.HIGH
    )
