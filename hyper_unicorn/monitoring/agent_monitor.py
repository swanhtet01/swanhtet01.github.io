"""
Agent Monitor
=============
Real-time monitoring and observability for the HYPER UNICORN agent system.

Features:
- Agent health monitoring
- Task tracking and metrics
- Performance analytics
- Alert system
- Dashboard data provider

Author: Manus AI for SuperMega.dev
"""

import os
import json
import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field, asdict
from collections import defaultdict
import redis
import psutil

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("AgentMonitor")


@dataclass
class AgentStatus:
    """Status of an agent."""
    agent_id: str
    agent_type: str
    status: str  # idle, running, error, offline
    current_task: Optional[str] = None
    tasks_completed: int = 0
    tasks_failed: int = 0
    avg_task_duration: float = 0.0
    last_heartbeat: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    memory_usage_mb: float = 0.0
    cpu_usage_percent: float = 0.0
    uptime_seconds: int = 0
    error_rate: float = 0.0


@dataclass
class TaskMetrics:
    """Metrics for a task."""
    task_id: str
    agent_id: str
    task_type: str
    status: str  # pending, running, completed, failed
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    duration_seconds: float = 0.0
    tokens_used: int = 0
    cost_usd: float = 0.0
    error_message: Optional[str] = None


@dataclass
class SystemMetrics:
    """System-wide metrics."""
    timestamp: str
    total_agents: int
    active_agents: int
    tasks_in_queue: int
    tasks_completed_today: int
    tasks_failed_today: int
    avg_response_time_ms: float
    total_tokens_used: int
    total_cost_usd: float
    cpu_usage_percent: float
    memory_usage_percent: float
    disk_usage_percent: float


class AgentMonitor:
    """
    Monitoring system for HYPER UNICORN agents.
    
    Tracks:
    - Agent health and status
    - Task execution metrics
    - System resource usage
    - Cost tracking
    - Performance analytics
    """
    
    def __init__(self, redis_url: str = "redis://localhost:6379"):
        self.redis_url = redis_url
        self.redis_client: Optional[redis.Redis] = None
        
        # In-memory storage (fallback if Redis unavailable)
        self.agents: Dict[str, AgentStatus] = {}
        self.tasks: Dict[str, TaskMetrics] = {}
        self.metrics_history: List[SystemMetrics] = []
        self.alerts: List[Dict] = []
        
        # Alert thresholds
        self.alert_thresholds = {
            "error_rate": 0.1,  # 10% error rate
            "cpu_usage": 90,  # 90% CPU
            "memory_usage": 85,  # 85% memory
            "task_queue_size": 100,  # 100 pending tasks
            "response_time_ms": 5000  # 5 seconds
        }
        
        # Cost tracking (per 1M tokens)
        self.model_costs = {
            "gemini-1.5-flash": {"input": 0.075, "output": 0.30},
            "gemini-1.5-pro": {"input": 1.25, "output": 5.00},
            "claude-3-haiku": {"input": 0.25, "output": 1.25},
            "claude-3-5-sonnet": {"input": 3.00, "output": 15.00},
            "gpt-3.5-turbo": {"input": 0.50, "output": 1.50},
            "gpt-4-turbo": {"input": 10.00, "output": 30.00}
        }
    
    async def connect(self):
        """Connect to Redis."""
        try:
            self.redis_client = redis.from_url(self.redis_url)
            self.redis_client.ping()
            logger.info("Connected to Redis")
        except Exception as e:
            logger.warning(f"Redis connection failed: {e}. Using in-memory storage.")
            self.redis_client = None
    
    # =========================================================================
    # Agent Management
    # =========================================================================
    
    def register_agent(self, agent_id: str, agent_type: str) -> AgentStatus:
        """Register a new agent."""
        status = AgentStatus(
            agent_id=agent_id,
            agent_type=agent_type,
            status="idle"
        )
        self.agents[agent_id] = status
        self._save_agent(status)
        logger.info(f"Registered agent: {agent_id} ({agent_type})")
        return status
    
    def update_agent_status(
        self,
        agent_id: str,
        status: str,
        current_task: Optional[str] = None
    ):
        """Update agent status."""
        if agent_id not in self.agents:
            logger.warning(f"Unknown agent: {agent_id}")
            return
        
        agent = self.agents[agent_id]
        agent.status = status
        agent.current_task = current_task
        agent.last_heartbeat = datetime.utcnow().isoformat()
        
        self._save_agent(agent)
    
    def agent_heartbeat(self, agent_id: str, metrics: Optional[Dict] = None):
        """Record agent heartbeat with optional metrics."""
        if agent_id not in self.agents:
            return
        
        agent = self.agents[agent_id]
        agent.last_heartbeat = datetime.utcnow().isoformat()
        
        if metrics:
            agent.memory_usage_mb = metrics.get("memory_mb", 0)
            agent.cpu_usage_percent = metrics.get("cpu_percent", 0)
        
        self._save_agent(agent)
    
    def get_agent_status(self, agent_id: str) -> Optional[AgentStatus]:
        """Get status of a specific agent."""
        return self.agents.get(agent_id)
    
    def get_all_agents(self) -> List[AgentStatus]:
        """Get status of all agents."""
        return list(self.agents.values())
    
    # =========================================================================
    # Task Tracking
    # =========================================================================
    
    def start_task(
        self,
        task_id: str,
        agent_id: str,
        task_type: str
    ) -> TaskMetrics:
        """Record task start."""
        metrics = TaskMetrics(
            task_id=task_id,
            agent_id=agent_id,
            task_type=task_type,
            status="running",
            started_at=datetime.utcnow().isoformat()
        )
        self.tasks[task_id] = metrics
        
        # Update agent status
        self.update_agent_status(agent_id, "running", task_id)
        
        self._save_task(metrics)
        logger.info(f"Task started: {task_id} by {agent_id}")
        return metrics
    
    def complete_task(
        self,
        task_id: str,
        tokens_used: int = 0,
        model: str = "gemini-1.5-flash"
    ):
        """Record task completion."""
        if task_id not in self.tasks:
            logger.warning(f"Unknown task: {task_id}")
            return
        
        task = self.tasks[task_id]
        task.status = "completed"
        task.completed_at = datetime.utcnow().isoformat()
        task.tokens_used = tokens_used
        
        # Calculate duration
        if task.started_at:
            start = datetime.fromisoformat(task.started_at)
            end = datetime.fromisoformat(task.completed_at)
            task.duration_seconds = (end - start).total_seconds()
        
        # Calculate cost
        if model in self.model_costs:
            cost_per_m = self.model_costs[model]
            task.cost_usd = (tokens_used / 1_000_000) * (cost_per_m["input"] + cost_per_m["output"]) / 2
        
        # Update agent stats
        if task.agent_id in self.agents:
            agent = self.agents[task.agent_id]
            agent.tasks_completed += 1
            agent.status = "idle"
            agent.current_task = None
            
            # Update average duration
            total_tasks = agent.tasks_completed + agent.tasks_failed
            agent.avg_task_duration = (
                (agent.avg_task_duration * (total_tasks - 1) + task.duration_seconds) / total_tasks
            )
            
            self._save_agent(agent)
        
        self._save_task(task)
        logger.info(f"Task completed: {task_id} in {task.duration_seconds:.2f}s")
    
    def fail_task(self, task_id: str, error_message: str):
        """Record task failure."""
        if task_id not in self.tasks:
            return
        
        task = self.tasks[task_id]
        task.status = "failed"
        task.completed_at = datetime.utcnow().isoformat()
        task.error_message = error_message
        
        if task.started_at:
            start = datetime.fromisoformat(task.started_at)
            end = datetime.fromisoformat(task.completed_at)
            task.duration_seconds = (end - start).total_seconds()
        
        # Update agent stats
        if task.agent_id in self.agents:
            agent = self.agents[task.agent_id]
            agent.tasks_failed += 1
            agent.status = "error"
            agent.current_task = None
            
            # Update error rate
            total_tasks = agent.tasks_completed + agent.tasks_failed
            agent.error_rate = agent.tasks_failed / total_tasks if total_tasks > 0 else 0
            
            self._save_agent(agent)
            
            # Check for alert
            if agent.error_rate > self.alert_thresholds["error_rate"]:
                self._create_alert(
                    "high_error_rate",
                    f"Agent {task.agent_id} has error rate of {agent.error_rate:.1%}",
                    "warning"
                )
        
        self._save_task(task)
        logger.warning(f"Task failed: {task_id} - {error_message}")
    
    def get_task_metrics(self, task_id: str) -> Optional[TaskMetrics]:
        """Get metrics for a specific task."""
        return self.tasks.get(task_id)
    
    # =========================================================================
    # System Metrics
    # =========================================================================
    
    def collect_system_metrics(self) -> SystemMetrics:
        """Collect current system metrics."""
        now = datetime.utcnow()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        
        # Count tasks today
        tasks_today = [
            t for t in self.tasks.values()
            if t.completed_at and datetime.fromisoformat(t.completed_at) >= today_start
        ]
        completed_today = len([t for t in tasks_today if t.status == "completed"])
        failed_today = len([t for t in tasks_today if t.status == "failed"])
        
        # Calculate averages
        response_times = [t.duration_seconds * 1000 for t in tasks_today if t.duration_seconds > 0]
        avg_response_time = sum(response_times) / len(response_times) if response_times else 0
        
        # Total tokens and cost
        total_tokens = sum(t.tokens_used for t in tasks_today)
        total_cost = sum(t.cost_usd for t in tasks_today)
        
        # System resources
        cpu_percent = psutil.cpu_percent()
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        
        metrics = SystemMetrics(
            timestamp=now.isoformat(),
            total_agents=len(self.agents),
            active_agents=len([a for a in self.agents.values() if a.status == "running"]),
            tasks_in_queue=len([t for t in self.tasks.values() if t.status == "pending"]),
            tasks_completed_today=completed_today,
            tasks_failed_today=failed_today,
            avg_response_time_ms=avg_response_time,
            total_tokens_used=total_tokens,
            total_cost_usd=total_cost,
            cpu_usage_percent=cpu_percent,
            memory_usage_percent=memory.percent,
            disk_usage_percent=disk.percent
        )
        
        self.metrics_history.append(metrics)
        
        # Keep only last 24 hours
        cutoff = now - timedelta(hours=24)
        self.metrics_history = [
            m for m in self.metrics_history
            if datetime.fromisoformat(m.timestamp) > cutoff
        ]
        
        # Check for alerts
        self._check_system_alerts(metrics)
        
        return metrics
    
    def get_metrics_history(self, hours: int = 24) -> List[SystemMetrics]:
        """Get metrics history for the specified period."""
        cutoff = datetime.utcnow() - timedelta(hours=hours)
        return [
            m for m in self.metrics_history
            if datetime.fromisoformat(m.timestamp) > cutoff
        ]
    
    # =========================================================================
    # Alerts
    # =========================================================================
    
    def _check_system_alerts(self, metrics: SystemMetrics):
        """Check system metrics against thresholds and create alerts."""
        if metrics.cpu_usage_percent > self.alert_thresholds["cpu_usage"]:
            self._create_alert(
                "high_cpu",
                f"CPU usage at {metrics.cpu_usage_percent:.1f}%",
                "warning"
            )
        
        if metrics.memory_usage_percent > self.alert_thresholds["memory_usage"]:
            self._create_alert(
                "high_memory",
                f"Memory usage at {metrics.memory_usage_percent:.1f}%",
                "warning"
            )
        
        if metrics.tasks_in_queue > self.alert_thresholds["task_queue_size"]:
            self._create_alert(
                "queue_backlog",
                f"Task queue has {metrics.tasks_in_queue} pending tasks",
                "warning"
            )
        
        if metrics.avg_response_time_ms > self.alert_thresholds["response_time_ms"]:
            self._create_alert(
                "slow_response",
                f"Average response time is {metrics.avg_response_time_ms:.0f}ms",
                "warning"
            )
    
    def _create_alert(self, alert_type: str, message: str, severity: str):
        """Create a new alert."""
        alert = {
            "id": f"{alert_type}_{datetime.utcnow().timestamp()}",
            "type": alert_type,
            "message": message,
            "severity": severity,
            "timestamp": datetime.utcnow().isoformat(),
            "acknowledged": False
        }
        self.alerts.append(alert)
        logger.warning(f"Alert: [{severity}] {message}")
        
        # Keep only recent alerts
        cutoff = datetime.utcnow() - timedelta(hours=24)
        self.alerts = [
            a for a in self.alerts
            if datetime.fromisoformat(a["timestamp"]) > cutoff
        ]
    
    def get_alerts(self, unacknowledged_only: bool = False) -> List[Dict]:
        """Get all alerts."""
        if unacknowledged_only:
            return [a for a in self.alerts if not a["acknowledged"]]
        return self.alerts
    
    def acknowledge_alert(self, alert_id: str):
        """Acknowledge an alert."""
        for alert in self.alerts:
            if alert["id"] == alert_id:
                alert["acknowledged"] = True
                break
    
    # =========================================================================
    # Dashboard Data
    # =========================================================================
    
    def get_dashboard_data(self) -> Dict:
        """Get all data needed for the monitoring dashboard."""
        metrics = self.collect_system_metrics()
        
        return {
            "system": asdict(metrics),
            "agents": [asdict(a) for a in self.agents.values()],
            "recent_tasks": [
                asdict(t) for t in sorted(
                    self.tasks.values(),
                    key=lambda x: x.started_at or "",
                    reverse=True
                )[:20]
            ],
            "alerts": self.get_alerts(unacknowledged_only=True),
            "metrics_history": [asdict(m) for m in self.get_metrics_history(hours=6)]
        }
    
    # =========================================================================
    # Persistence
    # =========================================================================
    
    def _save_agent(self, agent: AgentStatus):
        """Save agent to Redis."""
        if self.redis_client:
            try:
                self.redis_client.hset(
                    "agents",
                    agent.agent_id,
                    json.dumps(asdict(agent))
                )
            except Exception as e:
                logger.error(f"Failed to save agent: {e}")
    
    def _save_task(self, task: TaskMetrics):
        """Save task to Redis."""
        if self.redis_client:
            try:
                self.redis_client.hset(
                    "tasks",
                    task.task_id,
                    json.dumps(asdict(task))
                )
            except Exception as e:
                logger.error(f"Failed to save task: {e}")
    
    def _load_from_redis(self):
        """Load data from Redis."""
        if not self.redis_client:
            return
        
        try:
            # Load agents
            agents_data = self.redis_client.hgetall("agents")
            for agent_id, data in agents_data.items():
                agent_dict = json.loads(data)
                self.agents[agent_id.decode()] = AgentStatus(**agent_dict)
            
            # Load tasks
            tasks_data = self.redis_client.hgetall("tasks")
            for task_id, data in tasks_data.items():
                task_dict = json.loads(data)
                self.tasks[task_id.decode()] = TaskMetrics(**task_dict)
            
            logger.info(f"Loaded {len(self.agents)} agents and {len(self.tasks)} tasks from Redis")
        except Exception as e:
            logger.error(f"Failed to load from Redis: {e}")


# ============================================================================
# Monitoring Dashboard API
# ============================================================================

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="HYPER UNICORN Monitor", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

monitor = AgentMonitor()


@app.on_event("startup")
async def startup():
    await monitor.connect()


@app.get("/")
async def root():
    return {"status": "ok", "service": "HYPER UNICORN Monitor"}


@app.get("/dashboard")
async def get_dashboard():
    """Get all dashboard data."""
    return monitor.get_dashboard_data()


@app.get("/agents")
async def get_agents():
    """Get all agents."""
    return [asdict(a) for a in monitor.get_all_agents()]


@app.get("/agents/{agent_id}")
async def get_agent(agent_id: str):
    """Get a specific agent."""
    agent = monitor.get_agent_status(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return asdict(agent)


@app.post("/agents/{agent_id}/register")
async def register_agent(agent_id: str, agent_type: str):
    """Register a new agent."""
    agent = monitor.register_agent(agent_id, agent_type)
    return asdict(agent)


@app.post("/agents/{agent_id}/heartbeat")
async def agent_heartbeat(agent_id: str, metrics: Optional[Dict] = None):
    """Record agent heartbeat."""
    monitor.agent_heartbeat(agent_id, metrics)
    return {"status": "ok"}


@app.get("/tasks")
async def get_tasks(limit: int = 50):
    """Get recent tasks."""
    tasks = sorted(
        monitor.tasks.values(),
        key=lambda x: x.started_at or "",
        reverse=True
    )[:limit]
    return [asdict(t) for t in tasks]


@app.get("/tasks/{task_id}")
async def get_task(task_id: str):
    """Get a specific task."""
    task = monitor.get_task_metrics(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return asdict(task)


@app.get("/metrics")
async def get_metrics():
    """Get current system metrics."""
    return asdict(monitor.collect_system_metrics())


@app.get("/metrics/history")
async def get_metrics_history(hours: int = 24):
    """Get metrics history."""
    return [asdict(m) for m in monitor.get_metrics_history(hours)]


@app.get("/alerts")
async def get_alerts(unacknowledged_only: bool = False):
    """Get alerts."""
    return monitor.get_alerts(unacknowledged_only)


@app.post("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str):
    """Acknowledge an alert."""
    monitor.acknowledge_alert(alert_id)
    return {"status": "ok"}


# ============================================================================
# CLI
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8081)
