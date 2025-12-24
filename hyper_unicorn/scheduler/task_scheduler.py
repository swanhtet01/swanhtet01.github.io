"""
HYPER UNICORN Task Scheduler
============================
Automated task scheduling for AI agent operations.

Features:
- Cron-based scheduling
- Interval-based recurring tasks
- One-time delayed execution
- Task dependencies
- Failure retry with backoff
- Calendar integration

Author: Manus AI for SuperMega.dev
"""

import os
import sys
import asyncio
import json
import logging
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any, Callable, Union
from dataclasses import dataclass, field
from enum import Enum
import uuid
import heapq

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("scheduler")


# ============================================================================
# Data Models
# ============================================================================

class TaskFrequency(Enum):
    """Task frequency types."""
    ONCE = "once"
    MINUTELY = "minutely"
    HOURLY = "hourly"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    CRON = "cron"


class TaskStatus(Enum):
    """Scheduled task status."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    PAUSED = "paused"


@dataclass
class ScheduledTask:
    """A scheduled task definition."""
    task_id: str
    name: str
    goal: str
    agent_type: str
    frequency: TaskFrequency
    next_run: datetime
    status: TaskStatus = TaskStatus.PENDING
    cron_expression: Optional[str] = None
    interval_seconds: Optional[int] = None
    max_retries: int = 3
    retry_count: int = 0
    retry_delay_seconds: int = 60
    timeout_seconds: int = 3600
    dependencies: List[str] = field(default_factory=list)
    context: Dict[str, Any] = field(default_factory=dict)
    last_run: Optional[datetime] = None
    last_result: Optional[Dict[str, Any]] = None
    last_error: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    enabled: bool = True
    
    def __lt__(self, other):
        """Compare tasks by next_run time for heap ordering."""
        return self.next_run < other.next_run


# ============================================================================
# Cron Parser
# ============================================================================

class CronParser:
    """Simple cron expression parser."""
    
    @staticmethod
    def parse(expression: str) -> Dict[str, List[int]]:
        """
        Parse a cron expression.
        Format: minute hour day_of_month month day_of_week
        """
        parts = expression.split()
        if len(parts) != 5:
            raise ValueError(f"Invalid cron expression: {expression}")
        
        fields = ["minute", "hour", "day", "month", "weekday"]
        ranges = [
            (0, 59),   # minute
            (0, 23),   # hour
            (1, 31),   # day
            (1, 12),   # month
            (0, 6)     # weekday (0 = Sunday)
        ]
        
        result = {}
        for i, (part, field_name, (min_val, max_val)) in enumerate(zip(parts, fields, ranges)):
            result[field_name] = CronParser._parse_field(part, min_val, max_val)
        
        return result
    
    @staticmethod
    def _parse_field(field: str, min_val: int, max_val: int) -> List[int]:
        """Parse a single cron field."""
        if field == "*":
            return list(range(min_val, max_val + 1))
        
        values = set()
        
        for part in field.split(","):
            if "/" in part:
                # Step values
                range_part, step = part.split("/")
                step = int(step)
                if range_part == "*":
                    values.update(range(min_val, max_val + 1, step))
                else:
                    start, end = map(int, range_part.split("-"))
                    values.update(range(start, end + 1, step))
            elif "-" in part:
                # Range
                start, end = map(int, part.split("-"))
                values.update(range(start, end + 1))
            else:
                # Single value
                values.add(int(part))
        
        return sorted(values)
    
    @staticmethod
    def get_next_run(expression: str, after: datetime = None) -> datetime:
        """Get the next run time for a cron expression."""
        if after is None:
            after = datetime.utcnow()
        
        parsed = CronParser.parse(expression)
        
        # Start from the next minute
        current = after.replace(second=0, microsecond=0) + timedelta(minutes=1)
        
        # Find the next matching time (max 1 year search)
        for _ in range(525600):  # minutes in a year
            if (current.minute in parsed["minute"] and
                current.hour in parsed["hour"] and
                current.day in parsed["day"] and
                current.month in parsed["month"] and
                current.weekday() in parsed["weekday"]):
                return current
            
            current += timedelta(minutes=1)
        
        raise ValueError(f"Could not find next run time for: {expression}")


# ============================================================================
# Task Scheduler
# ============================================================================

class TaskScheduler:
    """
    Advanced task scheduler for AI agents.
    
    Features:
    - Multiple scheduling strategies (cron, interval, one-time)
    - Task dependencies
    - Retry with exponential backoff
    - Concurrent execution control
    - Persistence support
    """
    
    def __init__(
        self,
        max_concurrent: int = 5,
        persistence_file: Optional[str] = None
    ):
        self.tasks: Dict[str, ScheduledTask] = {}
        self.task_heap: List[ScheduledTask] = []
        self.max_concurrent = max_concurrent
        self.running_count = 0
        self.persistence_file = persistence_file
        self._running = False
        self._executor = None
        
        # Load persisted tasks
        if persistence_file and os.path.exists(persistence_file):
            self._load_tasks()
    
    # ========================================================================
    # Task Management
    # ========================================================================
    
    def add_task(
        self,
        name: str,
        goal: str,
        agent_type: str = "auto",
        frequency: Union[TaskFrequency, str] = TaskFrequency.ONCE,
        run_at: Optional[datetime] = None,
        cron: Optional[str] = None,
        interval_seconds: Optional[int] = None,
        dependencies: List[str] = None,
        context: Dict[str, Any] = None,
        max_retries: int = 3,
        timeout_seconds: int = 3600
    ) -> str:
        """
        Add a new scheduled task.
        
        Args:
            name: Human-readable task name
            goal: The goal/objective for the agent
            agent_type: Type of agent to use
            frequency: How often to run (once, hourly, daily, etc.)
            run_at: When to run (for one-time tasks)
            cron: Cron expression (for cron frequency)
            interval_seconds: Interval in seconds (for interval frequency)
            dependencies: List of task IDs that must complete first
            context: Additional context for the agent
            max_retries: Maximum retry attempts on failure
            timeout_seconds: Task timeout
        
        Returns:
            Task ID
        """
        task_id = str(uuid.uuid4())[:8]
        
        # Convert string frequency to enum
        if isinstance(frequency, str):
            frequency = TaskFrequency(frequency)
        
        # Calculate next run time
        if frequency == TaskFrequency.ONCE:
            next_run = run_at or datetime.utcnow()
        elif frequency == TaskFrequency.CRON:
            if not cron:
                raise ValueError("Cron expression required for cron frequency")
            next_run = CronParser.get_next_run(cron)
        elif frequency == TaskFrequency.MINUTELY:
            next_run = datetime.utcnow() + timedelta(minutes=1)
            interval_seconds = 60
        elif frequency == TaskFrequency.HOURLY:
            next_run = datetime.utcnow() + timedelta(hours=1)
            interval_seconds = 3600
        elif frequency == TaskFrequency.DAILY:
            next_run = datetime.utcnow() + timedelta(days=1)
            interval_seconds = 86400
        elif frequency == TaskFrequency.WEEKLY:
            next_run = datetime.utcnow() + timedelta(weeks=1)
            interval_seconds = 604800
        else:
            next_run = datetime.utcnow()
        
        task = ScheduledTask(
            task_id=task_id,
            name=name,
            goal=goal,
            agent_type=agent_type,
            frequency=frequency,
            next_run=next_run,
            cron_expression=cron,
            interval_seconds=interval_seconds,
            dependencies=dependencies or [],
            context=context or {},
            max_retries=max_retries,
            timeout_seconds=timeout_seconds
        )
        
        self.tasks[task_id] = task
        heapq.heappush(self.task_heap, task)
        
        logger.info(f"Added task {task_id}: {name} (next run: {next_run})")
        
        self._save_tasks()
        
        return task_id
    
    def remove_task(self, task_id: str) -> bool:
        """Remove a scheduled task."""
        if task_id not in self.tasks:
            return False
        
        task = self.tasks[task_id]
        task.status = TaskStatus.CANCELLED
        del self.tasks[task_id]
        
        logger.info(f"Removed task {task_id}")
        
        self._save_tasks()
        
        return True
    
    def pause_task(self, task_id: str) -> bool:
        """Pause a scheduled task."""
        if task_id not in self.tasks:
            return False
        
        self.tasks[task_id].enabled = False
        self.tasks[task_id].status = TaskStatus.PAUSED
        
        logger.info(f"Paused task {task_id}")
        
        return True
    
    def resume_task(self, task_id: str) -> bool:
        """Resume a paused task."""
        if task_id not in self.tasks:
            return False
        
        self.tasks[task_id].enabled = True
        self.tasks[task_id].status = TaskStatus.PENDING
        
        logger.info(f"Resumed task {task_id}")
        
        return True
    
    def get_task(self, task_id: str) -> Optional[ScheduledTask]:
        """Get a task by ID."""
        return self.tasks.get(task_id)
    
    def list_tasks(self, status: Optional[TaskStatus] = None) -> List[ScheduledTask]:
        """List all tasks, optionally filtered by status."""
        tasks = list(self.tasks.values())
        
        if status:
            tasks = [t for t in tasks if t.status == status]
        
        return sorted(tasks, key=lambda t: t.next_run)
    
    # ========================================================================
    # Scheduling Helpers
    # ========================================================================
    
    def schedule_daily(
        self,
        name: str,
        goal: str,
        hour: int = 9,
        minute: int = 0,
        agent_type: str = "auto"
    ) -> str:
        """Schedule a task to run daily at a specific time."""
        cron = f"{minute} {hour} * * *"
        return self.add_task(
            name=name,
            goal=goal,
            agent_type=agent_type,
            frequency=TaskFrequency.CRON,
            cron=cron
        )
    
    def schedule_weekly(
        self,
        name: str,
        goal: str,
        weekday: int = 1,  # Monday
        hour: int = 9,
        minute: int = 0,
        agent_type: str = "auto"
    ) -> str:
        """Schedule a task to run weekly."""
        cron = f"{minute} {hour} * * {weekday}"
        return self.add_task(
            name=name,
            goal=goal,
            agent_type=agent_type,
            frequency=TaskFrequency.CRON,
            cron=cron
        )
    
    def schedule_interval(
        self,
        name: str,
        goal: str,
        interval_minutes: int,
        agent_type: str = "auto"
    ) -> str:
        """Schedule a task to run at regular intervals."""
        return self.add_task(
            name=name,
            goal=goal,
            agent_type=agent_type,
            frequency=TaskFrequency.MINUTELY,
            interval_seconds=interval_minutes * 60
        )
    
    def schedule_once(
        self,
        name: str,
        goal: str,
        run_at: datetime,
        agent_type: str = "auto"
    ) -> str:
        """Schedule a one-time task."""
        return self.add_task(
            name=name,
            goal=goal,
            agent_type=agent_type,
            frequency=TaskFrequency.ONCE,
            run_at=run_at
        )
    
    # ========================================================================
    # Execution
    # ========================================================================
    
    async def _execute_task(self, task: ScheduledTask):
        """Execute a single task."""
        logger.info(f"Executing task {task.task_id}: {task.name}")
        
        task.status = TaskStatus.RUNNING
        task.last_run = datetime.utcnow()
        self.running_count += 1
        
        try:
            # Check dependencies
            for dep_id in task.dependencies:
                dep_task = self.tasks.get(dep_id)
                if dep_task and dep_task.status != TaskStatus.COMPLETED:
                    raise Exception(f"Dependency {dep_id} not completed")
            
            # Execute the appropriate agent
            result = await self._run_agent(task)
            
            task.status = TaskStatus.COMPLETED
            task.last_result = result
            task.last_error = None
            task.retry_count = 0
            
            logger.info(f"Task {task.task_id} completed successfully")
            
        except Exception as e:
            task.last_error = str(e)
            task.retry_count += 1
            
            if task.retry_count < task.max_retries:
                # Schedule retry with exponential backoff
                delay = task.retry_delay_seconds * (2 ** (task.retry_count - 1))
                task.next_run = datetime.utcnow() + timedelta(seconds=delay)
                task.status = TaskStatus.PENDING
                heapq.heappush(self.task_heap, task)
                
                logger.warning(f"Task {task.task_id} failed, retry {task.retry_count}/{task.max_retries} in {delay}s")
            else:
                task.status = TaskStatus.FAILED
                logger.error(f"Task {task.task_id} failed after {task.max_retries} retries: {e}")
        
        finally:
            self.running_count -= 1
            
            # Schedule next run for recurring tasks
            if task.status == TaskStatus.COMPLETED and task.frequency != TaskFrequency.ONCE:
                self._schedule_next_run(task)
        
        self._save_tasks()
    
    async def _run_agent(self, task: ScheduledTask) -> Dict[str, Any]:
        """Run the appropriate agent for a task."""
        agent_type = task.agent_type
        goal = task.goal
        context = task.context
        
        # Import and run the appropriate agent
        if agent_type == "research" or agent_type == "auto":
            from agents.research_agent import ResearchAgent
            agent = ResearchAgent()
            return await agent.execute(goal)
        
        elif agent_type == "code":
            from agents.code_agent import CodeAgent
            agent = CodeAgent()
            return await agent.execute(goal)
        
        elif agent_type == "content":
            from agents.content_agent import ContentAgent
            agent = ContentAgent()
            return await agent.execute(goal)
        
        elif agent_type == "browser":
            from agents.browser_agent import BrowserAgent
            agent = BrowserAgent()
            return await agent.execute(goal)
        
        elif agent_type == "financial":
            from agents.financial_agent import FinancialAgent
            agent = FinancialAgent()
            return await agent.execute(goal)
        
        elif agent_type == "communication":
            from agents.communication_agent import CommunicationAgent
            agent = CommunicationAgent()
            return await agent.execute(goal)
        
        else:
            raise ValueError(f"Unknown agent type: {agent_type}")
    
    def _schedule_next_run(self, task: ScheduledTask):
        """Schedule the next run for a recurring task."""
        if task.frequency == TaskFrequency.CRON:
            task.next_run = CronParser.get_next_run(task.cron_expression)
        elif task.interval_seconds:
            task.next_run = datetime.utcnow() + timedelta(seconds=task.interval_seconds)
        
        task.status = TaskStatus.PENDING
        heapq.heappush(self.task_heap, task)
        
        logger.info(f"Scheduled next run for {task.task_id}: {task.next_run}")
    
    # ========================================================================
    # Main Loop
    # ========================================================================
    
    async def start(self):
        """Start the scheduler."""
        logger.info("Starting task scheduler...")
        self._running = True
        
        while self._running:
            try:
                await self._process_tasks()
                await asyncio.sleep(1)  # Check every second
            except Exception as e:
                logger.error(f"Scheduler error: {e}")
                await asyncio.sleep(5)
    
    async def _process_tasks(self):
        """Process due tasks."""
        now = datetime.utcnow()
        
        while (self.task_heap and 
               self.task_heap[0].next_run <= now and
               self.running_count < self.max_concurrent):
            
            task = heapq.heappop(self.task_heap)
            
            # Skip disabled or non-pending tasks
            if not task.enabled or task.status not in [TaskStatus.PENDING]:
                continue
            
            # Skip if task was removed
            if task.task_id not in self.tasks:
                continue
            
            # Execute task
            asyncio.create_task(self._execute_task(task))
    
    def stop(self):
        """Stop the scheduler."""
        logger.info("Stopping task scheduler...")
        self._running = False
    
    # ========================================================================
    # Persistence
    # ========================================================================
    
    def _save_tasks(self):
        """Save tasks to persistence file."""
        if not self.persistence_file:
            return
        
        data = []
        for task in self.tasks.values():
            data.append({
                "task_id": task.task_id,
                "name": task.name,
                "goal": task.goal,
                "agent_type": task.agent_type,
                "frequency": task.frequency.value,
                "next_run": task.next_run.isoformat(),
                "status": task.status.value,
                "cron_expression": task.cron_expression,
                "interval_seconds": task.interval_seconds,
                "max_retries": task.max_retries,
                "retry_count": task.retry_count,
                "dependencies": task.dependencies,
                "context": task.context,
                "enabled": task.enabled
            })
        
        with open(self.persistence_file, "w") as f:
            json.dump(data, f, indent=2)
    
    def _load_tasks(self):
        """Load tasks from persistence file."""
        if not self.persistence_file or not os.path.exists(self.persistence_file):
            return
        
        with open(self.persistence_file, "r") as f:
            data = json.load(f)
        
        for item in data:
            task = ScheduledTask(
                task_id=item["task_id"],
                name=item["name"],
                goal=item["goal"],
                agent_type=item["agent_type"],
                frequency=TaskFrequency(item["frequency"]),
                next_run=datetime.fromisoformat(item["next_run"]),
                status=TaskStatus(item["status"]),
                cron_expression=item.get("cron_expression"),
                interval_seconds=item.get("interval_seconds"),
                max_retries=item.get("max_retries", 3),
                retry_count=item.get("retry_count", 0),
                dependencies=item.get("dependencies", []),
                context=item.get("context", {}),
                enabled=item.get("enabled", True)
            )
            
            self.tasks[task.task_id] = task
            
            if task.status == TaskStatus.PENDING and task.enabled:
                heapq.heappush(self.task_heap, task)
        
        logger.info(f"Loaded {len(self.tasks)} tasks from persistence")


# ============================================================================
# Pre-built Scheduled Tasks
# ============================================================================

def setup_default_schedules(scheduler: TaskScheduler):
    """Set up default scheduled tasks."""
    
    # Daily morning briefing
    scheduler.schedule_daily(
        name="Morning Briefing",
        goal="Generate a morning briefing with: 1) Unread important emails, 2) Today's calendar events, 3) News relevant to my business, 4) Market updates for tracked stocks",
        hour=7,
        minute=0,
        agent_type="communication"
    )
    
    # Weekly report
    scheduler.schedule_weekly(
        name="Weekly Summary Report",
        goal="Generate a comprehensive weekly summary including: 1) Tasks completed this week, 2) Key metrics and KPIs, 3) Important emails and communications, 4) Recommendations for next week",
        weekday=5,  # Friday
        hour=17,
        minute=0,
        agent_type="research"
    )
    
    # Hourly inbox check
    scheduler.schedule_interval(
        name="Inbox Monitor",
        goal="Check email inbox for urgent messages and flag any that need immediate attention",
        interval_minutes=60,
        agent_type="communication"
    )
    
    # Daily market analysis
    scheduler.schedule_daily(
        name="Market Analysis",
        goal="Analyze today's market movements, identify significant trends, and summarize key financial news",
        hour=16,
        minute=30,
        agent_type="financial"
    )
    
    logger.info("Default schedules configured")


# ============================================================================
# Main Entry Point
# ============================================================================

async def main():
    """Main entry point for the scheduler."""
    scheduler = TaskScheduler(
        max_concurrent=5,
        persistence_file="scheduled_tasks.json"
    )
    
    # Set up default schedules
    setup_default_schedules(scheduler)
    
    # Start the scheduler
    await scheduler.start()


if __name__ == "__main__":
    asyncio.run(main())
