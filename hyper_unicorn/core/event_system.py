"""
Event System
=============
Event-driven architecture for reactive agent operations.

Features:
- Event bus for pub/sub messaging
- Event handlers and listeners
- Event sourcing
- Async event processing
- Event replay and debugging

Author: Manus AI for SuperMega.dev
"""

import os
import json
import asyncio
from datetime import datetime
from typing import Optional, Dict, List, Any, Callable, Awaitable, Set
from dataclasses import dataclass, field
from enum import Enum
import logging
import secrets
from collections import defaultdict

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("event_system")


# ============================================================================
# Data Models
# ============================================================================

class EventPriority(Enum):
    """Event priority levels."""
    LOW = 0
    NORMAL = 1
    HIGH = 2
    CRITICAL = 3


class EventStatus(Enum):
    """Event processing status."""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    RETRYING = "retrying"


@dataclass
class Event:
    """An event in the system."""
    event_id: str
    event_type: str
    source: str
    timestamp: datetime
    data: Dict[str, Any]
    priority: EventPriority = EventPriority.NORMAL
    correlation_id: Optional[str] = None
    causation_id: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    status: EventStatus = EventStatus.PENDING
    retry_count: int = 0


@dataclass
class EventHandler:
    """A handler for events."""
    handler_id: str
    event_types: List[str]  # Event types to handle, "*" for all
    handler_func: Callable[[Event], Awaitable[Any]]
    priority: int = 0  # Higher priority handlers run first
    filter_func: Optional[Callable[[Event], bool]] = None
    max_retries: int = 3
    timeout_seconds: int = 30
    is_active: bool = True


@dataclass
class EventSubscription:
    """A subscription to events."""
    subscription_id: str
    subscriber_id: str
    event_types: List[str]
    callback_url: Optional[str] = None  # For webhook delivery
    filter_expression: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    is_active: bool = True


# ============================================================================
# Event Types Registry
# ============================================================================

class EventTypes:
    """Standard event types."""
    # Agent events
    AGENT_STARTED = "agent.started"
    AGENT_COMPLETED = "agent.completed"
    AGENT_FAILED = "agent.failed"
    AGENT_PROGRESS = "agent.progress"
    
    # Task events
    TASK_CREATED = "task.created"
    TASK_ASSIGNED = "task.assigned"
    TASK_STARTED = "task.started"
    TASK_COMPLETED = "task.completed"
    TASK_FAILED = "task.failed"
    TASK_CANCELLED = "task.cancelled"
    
    # Workflow events
    WORKFLOW_STARTED = "workflow.started"
    WORKFLOW_STEP_COMPLETED = "workflow.step_completed"
    WORKFLOW_COMPLETED = "workflow.completed"
    WORKFLOW_FAILED = "workflow.failed"
    
    # System events
    SYSTEM_STARTUP = "system.startup"
    SYSTEM_SHUTDOWN = "system.shutdown"
    SYSTEM_ERROR = "system.error"
    SYSTEM_HEALTH_CHECK = "system.health_check"
    
    # External events
    WEBHOOK_RECEIVED = "external.webhook"
    EMAIL_RECEIVED = "external.email"
    CALENDAR_EVENT = "external.calendar"
    FILE_UPLOADED = "external.file_uploaded"
    
    # User events
    USER_ACTION = "user.action"
    USER_FEEDBACK = "user.feedback"
    USER_APPROVAL = "user.approval"
    
    # Data events
    DATA_CREATED = "data.created"
    DATA_UPDATED = "data.updated"
    DATA_DELETED = "data.deleted"
    
    # Integration events
    GITHUB_PUSH = "integration.github.push"
    GITHUB_PR = "integration.github.pr"
    STRIPE_PAYMENT = "integration.stripe.payment"
    SLACK_MESSAGE = "integration.slack.message"


# ============================================================================
# Event Bus
# ============================================================================

class EventBus:
    """
    Central event bus for pub/sub messaging.
    """
    
    def __init__(self, max_queue_size: int = 10000):
        self.handlers: Dict[str, List[EventHandler]] = defaultdict(list)
        self.subscriptions: Dict[str, EventSubscription] = {}
        self.event_queue: asyncio.Queue = asyncio.Queue(maxsize=max_queue_size)
        self.event_history: List[Event] = []
        self.max_history = 1000
        self._running = False
        self._processor_task: Optional[asyncio.Task] = None
    
    def register_handler(self, handler: EventHandler):
        """Register an event handler."""
        for event_type in handler.event_types:
            self.handlers[event_type].append(handler)
            # Sort by priority (highest first)
            self.handlers[event_type].sort(key=lambda h: h.priority, reverse=True)
        
        logger.info(f"Registered handler {handler.handler_id} for {handler.event_types}")
    
    def unregister_handler(self, handler_id: str):
        """Unregister an event handler."""
        for event_type in list(self.handlers.keys()):
            self.handlers[event_type] = [
                h for h in self.handlers[event_type]
                if h.handler_id != handler_id
            ]
    
    def subscribe(self, subscription: EventSubscription):
        """Add a subscription."""
        self.subscriptions[subscription.subscription_id] = subscription
        logger.info(f"Added subscription {subscription.subscription_id}")
    
    def unsubscribe(self, subscription_id: str):
        """Remove a subscription."""
        if subscription_id in self.subscriptions:
            del self.subscriptions[subscription_id]
    
    async def publish(self, event: Event):
        """Publish an event to the bus."""
        await self.event_queue.put(event)
        logger.debug(f"Published event {event.event_id}: {event.event_type}")
    
    def publish_sync(self, event: Event):
        """Synchronously publish an event (for non-async contexts)."""
        try:
            self.event_queue.put_nowait(event)
        except asyncio.QueueFull:
            logger.warning("Event queue full, dropping event")
    
    async def start(self):
        """Start the event processor."""
        if self._running:
            return
        
        self._running = True
        self._processor_task = asyncio.create_task(self._process_events())
        logger.info("Event bus started")
    
    async def stop(self):
        """Stop the event processor."""
        self._running = False
        if self._processor_task:
            self._processor_task.cancel()
            try:
                await self._processor_task
            except asyncio.CancelledError:
                pass
        logger.info("Event bus stopped")
    
    async def _process_events(self):
        """Process events from the queue."""
        while self._running:
            try:
                event = await asyncio.wait_for(
                    self.event_queue.get(),
                    timeout=1.0
                )
                
                await self._handle_event(event)
                
                # Add to history
                self.event_history.append(event)
                if len(self.event_history) > self.max_history:
                    self.event_history = self.event_history[-self.max_history:]
                
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                logger.error(f"Error processing event: {e}")
    
    async def _handle_event(self, event: Event):
        """Handle a single event."""
        event.status = EventStatus.PROCESSING
        
        # Get matching handlers
        handlers = []
        handlers.extend(self.handlers.get(event.event_type, []))
        handlers.extend(self.handlers.get("*", []))  # Wildcard handlers
        
        for handler in handlers:
            if not handler.is_active:
                continue
            
            # Apply filter
            if handler.filter_func and not handler.filter_func(event):
                continue
            
            try:
                await asyncio.wait_for(
                    handler.handler_func(event),
                    timeout=handler.timeout_seconds
                )
            except asyncio.TimeoutError:
                logger.warning(f"Handler {handler.handler_id} timed out for event {event.event_id}")
            except Exception as e:
                logger.error(f"Handler {handler.handler_id} failed: {e}")
                
                # Retry logic
                if event.retry_count < handler.max_retries:
                    event.retry_count += 1
                    event.status = EventStatus.RETRYING
                    await self.publish(event)
                    return
        
        event.status = EventStatus.COMPLETED
    
    def get_pending_count(self) -> int:
        """Get number of pending events."""
        return self.event_queue.qsize()
    
    def get_recent_events(self, n: int = 10, event_type: str = None) -> List[Event]:
        """Get recent events."""
        events = self.event_history
        if event_type:
            events = [e for e in events if e.event_type == event_type]
        return events[-n:]


# ============================================================================
# Event Factory
# ============================================================================

class EventFactory:
    """
    Factory for creating events.
    """
    
    @staticmethod
    def create(
        event_type: str,
        source: str,
        data: Dict[str, Any],
        priority: EventPriority = EventPriority.NORMAL,
        correlation_id: str = None,
        causation_id: str = None,
        metadata: Dict[str, Any] = None
    ) -> Event:
        """Create a new event."""
        return Event(
            event_id=f"evt_{secrets.token_hex(8)}",
            event_type=event_type,
            source=source,
            timestamp=datetime.utcnow(),
            data=data,
            priority=priority,
            correlation_id=correlation_id,
            causation_id=causation_id,
            metadata=metadata or {}
        )
    
    @staticmethod
    def agent_started(agent_id: str, task_id: str, task_type: str) -> Event:
        """Create an agent started event."""
        return EventFactory.create(
            EventTypes.AGENT_STARTED,
            source=agent_id,
            data={"agent_id": agent_id, "task_id": task_id, "task_type": task_type}
        )
    
    @staticmethod
    def agent_completed(agent_id: str, task_id: str, result: Any) -> Event:
        """Create an agent completed event."""
        return EventFactory.create(
            EventTypes.AGENT_COMPLETED,
            source=agent_id,
            data={"agent_id": agent_id, "task_id": task_id, "result": result}
        )
    
    @staticmethod
    def task_created(task_id: str, task_type: str, description: str) -> Event:
        """Create a task created event."""
        return EventFactory.create(
            EventTypes.TASK_CREATED,
            source="system",
            data={"task_id": task_id, "task_type": task_type, "description": description}
        )
    
    @staticmethod
    def workflow_started(workflow_id: str, template_id: str, inputs: Dict) -> Event:
        """Create a workflow started event."""
        return EventFactory.create(
            EventTypes.WORKFLOW_STARTED,
            source="workflow_engine",
            data={"workflow_id": workflow_id, "template_id": template_id, "inputs": inputs}
        )
    
    @staticmethod
    def webhook_received(source: str, payload: Dict) -> Event:
        """Create a webhook received event."""
        return EventFactory.create(
            EventTypes.WEBHOOK_RECEIVED,
            source=source,
            data=payload,
            priority=EventPriority.HIGH
        )
    
    @staticmethod
    def system_error(error: str, context: Dict = None) -> Event:
        """Create a system error event."""
        return EventFactory.create(
            EventTypes.SYSTEM_ERROR,
            source="system",
            data={"error": error, "context": context or {}},
            priority=EventPriority.CRITICAL
        )


# ============================================================================
# Event Store (Event Sourcing)
# ============================================================================

class EventStore:
    """
    Persistent event store for event sourcing.
    """
    
    def __init__(self, storage_path: str = None):
        self.storage_path = storage_path
        self.events: List[Event] = []
        self.streams: Dict[str, List[Event]] = defaultdict(list)
        
        if storage_path and os.path.exists(storage_path):
            self._load()
    
    def append(self, event: Event, stream_id: str = None):
        """Append an event to the store."""
        self.events.append(event)
        
        if stream_id:
            self.streams[stream_id].append(event)
        
        self._save()
    
    def get_stream(self, stream_id: str) -> List[Event]:
        """Get all events in a stream."""
        return self.streams.get(stream_id, [])
    
    def get_events_by_type(self, event_type: str) -> List[Event]:
        """Get all events of a type."""
        return [e for e in self.events if e.event_type == event_type]
    
    def get_events_since(self, timestamp: datetime) -> List[Event]:
        """Get all events since a timestamp."""
        return [e for e in self.events if e.timestamp >= timestamp]
    
    def replay(
        self,
        handler: Callable[[Event], Any],
        stream_id: str = None,
        event_type: str = None,
        since: datetime = None
    ):
        """Replay events through a handler."""
        events = self.events
        
        if stream_id:
            events = self.streams.get(stream_id, [])
        
        if event_type:
            events = [e for e in events if e.event_type == event_type]
        
        if since:
            events = [e for e in events if e.timestamp >= since]
        
        for event in events:
            handler(event)
    
    def _save(self):
        """Save events to storage."""
        if not self.storage_path:
            return
        
        data = {
            "events": [
                {
                    "event_id": e.event_id,
                    "event_type": e.event_type,
                    "source": e.source,
                    "timestamp": e.timestamp.isoformat(),
                    "data": e.data,
                    "priority": e.priority.value,
                    "correlation_id": e.correlation_id,
                    "causation_id": e.causation_id,
                    "metadata": e.metadata,
                    "status": e.status.value
                }
                for e in self.events[-5000:]  # Keep last 5000
            ]
        }
        
        with open(self.storage_path, "w") as f:
            json.dump(data, f)
    
    def _load(self):
        """Load events from storage."""
        if not self.storage_path or not os.path.exists(self.storage_path):
            return
        
        with open(self.storage_path) as f:
            data = json.load(f)
        
        for e_data in data.get("events", []):
            event = Event(
                event_id=e_data["event_id"],
                event_type=e_data["event_type"],
                source=e_data["source"],
                timestamp=datetime.fromisoformat(e_data["timestamp"]),
                data=e_data["data"],
                priority=EventPriority(e_data["priority"]),
                correlation_id=e_data.get("correlation_id"),
                causation_id=e_data.get("causation_id"),
                metadata=e_data.get("metadata", {}),
                status=EventStatus(e_data["status"])
            )
            self.events.append(event)


# ============================================================================
# Event-Driven Agent Triggers
# ============================================================================

class EventTriggers:
    """
    Define triggers that start agents based on events.
    """
    
    def __init__(self, event_bus: EventBus):
        self.event_bus = event_bus
        self.triggers: Dict[str, Dict] = {}
    
    def add_trigger(
        self,
        trigger_id: str,
        event_type: str,
        agent_id: str,
        condition: Callable[[Event], bool] = None,
        transform: Callable[[Event], Dict] = None
    ):
        """Add an event trigger."""
        self.triggers[trigger_id] = {
            "event_type": event_type,
            "agent_id": agent_id,
            "condition": condition,
            "transform": transform
        }
        
        # Register handler
        async def trigger_handler(event: Event):
            trigger = self.triggers[trigger_id]
            
            if trigger["condition"] and not trigger["condition"](event):
                return
            
            # Transform event data to agent input
            if trigger["transform"]:
                agent_input = trigger["transform"](event)
            else:
                agent_input = event.data
            
            logger.info(f"Trigger {trigger_id} activated, starting agent {agent_id}")
            # Here you would actually start the agent
            # await agent_manager.start_agent(agent_id, agent_input)
        
        handler = EventHandler(
            handler_id=f"trigger_{trigger_id}",
            event_types=[event_type],
            handler_func=trigger_handler
        )
        
        self.event_bus.register_handler(handler)
    
    def remove_trigger(self, trigger_id: str):
        """Remove an event trigger."""
        if trigger_id in self.triggers:
            del self.triggers[trigger_id]
            self.event_bus.unregister_handler(f"trigger_{trigger_id}")


# ============================================================================
# Main Entry Point
# ============================================================================

async def main():
    """Demo the Event System."""
    # Create event bus
    bus = EventBus()
    
    # Register a handler
    async def log_handler(event: Event):
        print(f"[{event.timestamp}] {event.event_type}: {event.data}")
    
    handler = EventHandler(
        handler_id="logger",
        event_types=["*"],
        handler_func=log_handler
    )
    bus.register_handler(handler)
    
    # Start the bus
    await bus.start()
    
    print("=== Event System Demo ===\n")
    
    # Publish some events
    events = [
        EventFactory.task_created("task_1", "research", "Research AI trends"),
        EventFactory.agent_started("research_agent", "task_1", "research"),
        EventFactory.agent_completed("research_agent", "task_1", {"findings": "AI is growing"}),
        EventFactory.webhook_received("github", {"action": "push", "repo": "test"}),
    ]
    
    for event in events:
        await bus.publish(event)
        await asyncio.sleep(0.5)
    
    # Wait for processing
    await asyncio.sleep(2)
    
    # Show stats
    print(f"\nPending events: {bus.get_pending_count()}")
    print(f"Recent events: {len(bus.get_recent_events(10))}")
    
    # Stop the bus
    await bus.stop()


if __name__ == "__main__":
    asyncio.run(main())
