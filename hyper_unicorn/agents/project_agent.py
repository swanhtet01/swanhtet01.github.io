"""
Client Project Management Agent
================================
Autonomous agent for managing client projects, deliverables, and communications.

Capabilities:
- Project lifecycle management
- Task tracking and assignment
- Client communication automation
- Deliverable management
- Timeline and milestone tracking
- Resource allocation
- Progress reporting
"""

import os
import json
import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
from enum import Enum


class ProjectStatus(Enum):
    """Project lifecycle stages."""
    DRAFT = "draft"
    PROPOSAL = "proposal"
    APPROVED = "approved"
    IN_PROGRESS = "in_progress"
    REVIEW = "review"
    COMPLETED = "completed"
    ON_HOLD = "on_hold"
    CANCELLED = "cancelled"


class TaskStatus(Enum):
    """Task status options."""
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    BLOCKED = "blocked"
    REVIEW = "review"
    DONE = "done"


class TaskPriority(Enum):
    """Task priority levels."""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class DeliverableType(Enum):
    """Types of deliverables."""
    DOCUMENT = "document"
    CODE = "code"
    DESIGN = "design"
    VIDEO = "video"
    DATA = "data"
    REPORT = "report"
    PRESENTATION = "presentation"
    OTHER = "other"


@dataclass
class Client:
    """Represents a client."""
    id: str
    name: str
    company: str
    email: str
    phone: str = ""
    timezone: str = "UTC"
    preferred_contact: str = "email"
    notes: str = ""
    projects: List[str] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.now)


@dataclass
class Task:
    """Represents a project task."""
    id: str
    title: str
    description: str
    project_id: str
    status: TaskStatus = TaskStatus.TODO
    priority: TaskPriority = TaskPriority.MEDIUM
    assigned_to: str = ""
    assigned_agent: str = ""
    estimated_hours: float = 0
    actual_hours: float = 0
    due_date: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    dependencies: List[str] = field(default_factory=list)
    subtasks: List[str] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)
    attachments: List[str] = field(default_factory=list)
    comments: List[Dict[str, Any]] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.now)


@dataclass
class Deliverable:
    """Represents a project deliverable."""
    id: str
    title: str
    description: str
    project_id: str
    type: DeliverableType
    status: str = "pending"
    due_date: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    file_path: str = ""
    file_url: str = ""
    version: str = "1.0"
    feedback: List[Dict[str, Any]] = field(default_factory=list)
    revisions: List[Dict[str, Any]] = field(default_factory=list)
    approved: bool = False
    approved_by: str = ""
    approved_at: Optional[datetime] = None


@dataclass
class Milestone:
    """Represents a project milestone."""
    id: str
    title: str
    description: str
    project_id: str
    due_date: datetime
    completed: bool = False
    completed_at: Optional[datetime] = None
    deliverables: List[str] = field(default_factory=list)
    payment_due: float = 0
    payment_received: bool = False


@dataclass
class Project:
    """Represents a client project."""
    id: str
    name: str
    description: str
    client_id: str
    status: ProjectStatus = ProjectStatus.DRAFT
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    budget: float = 0
    spent: float = 0
    hourly_rate: float = 0
    fixed_price: bool = True
    tasks: List[str] = field(default_factory=list)
    deliverables: List[str] = field(default_factory=list)
    milestones: List[str] = field(default_factory=list)
    team: List[str] = field(default_factory=list)
    agents_assigned: List[str] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)
    notes: List[Dict[str, Any]] = field(default_factory=list)
    communications: List[Dict[str, Any]] = field(default_factory=list)
    files: List[str] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)


class ProjectAgent:
    """
    Autonomous Client Project Management Agent.
    
    Features:
    - Full project lifecycle management
    - Automated task tracking and assignment
    - Client communication automation
    - Progress reporting and analytics
    - Resource and budget management
    - Integration with other agents
    """
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self.clients: Dict[str, Client] = {}
        self.projects: Dict[str, Project] = {}
        self.tasks: Dict[str, Task] = {}
        self.deliverables: Dict[str, Deliverable] = {}
        self.milestones: Dict[str, Milestone] = {}
        
        # Agent assignments
        self.agent_capabilities = {
            "research_agent": ["research", "analysis", "report"],
            "code_agent": ["development", "code", "testing", "debugging"],
            "content_agent": ["writing", "content", "documentation", "copywriting"],
            "data_agent": ["data", "analytics", "visualization", "dashboard"],
            "design_agent": ["design", "ui", "ux", "graphics"],
            "browser_agent": ["scraping", "automation", "testing"]
        }
    
    # ==================== Client Management ====================
    
    def create_client(self, client_data: Dict[str, Any]) -> Client:
        """Create a new client."""
        client_id = f"client_{datetime.now().timestamp()}"
        client = Client(
            id=client_id,
            name=client_data.get("name", ""),
            company=client_data.get("company", ""),
            email=client_data.get("email", ""),
            phone=client_data.get("phone", ""),
            timezone=client_data.get("timezone", "UTC"),
            preferred_contact=client_data.get("preferred_contact", "email"),
            notes=client_data.get("notes", "")
        )
        self.clients[client_id] = client
        return client
    
    def get_client(self, client_id: str) -> Optional[Client]:
        """Get a client by ID."""
        return self.clients.get(client_id)
    
    # ==================== Project Management ====================
    
    def create_project(self, project_data: Dict[str, Any]) -> Project:
        """Create a new project."""
        project_id = f"proj_{datetime.now().timestamp()}"
        project = Project(
            id=project_id,
            name=project_data.get("name", ""),
            description=project_data.get("description", ""),
            client_id=project_data.get("client_id", ""),
            budget=project_data.get("budget", 0),
            hourly_rate=project_data.get("hourly_rate", 0),
            fixed_price=project_data.get("fixed_price", True),
            tags=project_data.get("tags", [])
        )
        
        # Parse dates
        if "start_date" in project_data:
            project.start_date = self._parse_date(project_data["start_date"])
        if "end_date" in project_data:
            project.end_date = self._parse_date(project_data["end_date"])
        
        self.projects[project_id] = project
        
        # Link to client
        client = self.clients.get(project.client_id)
        if client:
            client.projects.append(project_id)
        
        return project
    
    def _parse_date(self, date_input: Any) -> datetime:
        """Parse various date formats."""
        if isinstance(date_input, datetime):
            return date_input
        if isinstance(date_input, str):
            try:
                return datetime.fromisoformat(date_input)
            except:
                return datetime.strptime(date_input, "%Y-%m-%d")
        return datetime.now()
    
    def update_project_status(self, project_id: str, status: ProjectStatus) -> Project:
        """Update project status."""
        project = self.projects.get(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")
        
        project.status = status
        project.updated_at = datetime.now()
        
        # Auto-set dates based on status
        if status == ProjectStatus.IN_PROGRESS and not project.start_date:
            project.start_date = datetime.now()
        elif status == ProjectStatus.COMPLETED and not project.end_date:
            project.end_date = datetime.now()
        
        return project
    
    # ==================== Task Management ====================
    
    def create_task(self, task_data: Dict[str, Any]) -> Task:
        """Create a new task."""
        task_id = f"task_{datetime.now().timestamp()}"
        task = Task(
            id=task_id,
            title=task_data.get("title", ""),
            description=task_data.get("description", ""),
            project_id=task_data.get("project_id", ""),
            priority=TaskPriority(task_data.get("priority", "medium")),
            estimated_hours=task_data.get("estimated_hours", 0),
            tags=task_data.get("tags", [])
        )
        
        if "due_date" in task_data:
            task.due_date = self._parse_date(task_data["due_date"])
        
        self.tasks[task_id] = task
        
        # Link to project
        project = self.projects.get(task.project_id)
        if project:
            project.tasks.append(task_id)
        
        # Auto-assign agent based on task tags
        task.assigned_agent = self._suggest_agent_for_task(task)
        
        return task
    
    def _suggest_agent_for_task(self, task: Task) -> str:
        """Suggest the best agent for a task based on its tags and description."""
        task_text = f"{task.title} {task.description} {' '.join(task.tags)}".lower()
        
        best_agent = ""
        best_score = 0
        
        for agent, capabilities in self.agent_capabilities.items():
            score = sum(1 for cap in capabilities if cap in task_text)
            if score > best_score:
                best_score = score
                best_agent = agent
        
        return best_agent or "research_agent"  # Default to research agent
    
    def update_task_status(self, task_id: str, status: TaskStatus) -> Task:
        """Update task status."""
        task = self.tasks.get(task_id)
        if not task:
            raise ValueError(f"Task {task_id} not found")
        
        task.status = status
        if status == TaskStatus.DONE:
            task.completed_at = datetime.now()
        
        return task
    
    def get_project_tasks(self, project_id: str) -> List[Task]:
        """Get all tasks for a project."""
        return [t for t in self.tasks.values() if t.project_id == project_id]
    
    # ==================== Deliverable Management ====================
    
    def create_deliverable(self, deliverable_data: Dict[str, Any]) -> Deliverable:
        """Create a new deliverable."""
        deliverable_id = f"del_{datetime.now().timestamp()}"
        deliverable = Deliverable(
            id=deliverable_id,
            title=deliverable_data.get("title", ""),
            description=deliverable_data.get("description", ""),
            project_id=deliverable_data.get("project_id", ""),
            type=DeliverableType(deliverable_data.get("type", "document"))
        )
        
        if "due_date" in deliverable_data:
            deliverable.due_date = self._parse_date(deliverable_data["due_date"])
        
        self.deliverables[deliverable_id] = deliverable
        
        # Link to project
        project = self.projects.get(deliverable.project_id)
        if project:
            project.deliverables.append(deliverable_id)
        
        return deliverable
    
    def submit_deliverable(
        self,
        deliverable_id: str,
        file_path: str,
        file_url: str = ""
    ) -> Deliverable:
        """Submit a deliverable for review."""
        deliverable = self.deliverables.get(deliverable_id)
        if not deliverable:
            raise ValueError(f"Deliverable {deliverable_id} not found")
        
        deliverable.file_path = file_path
        deliverable.file_url = file_url
        deliverable.status = "submitted"
        deliverable.delivered_at = datetime.now()
        
        return deliverable
    
    def approve_deliverable(
        self,
        deliverable_id: str,
        approved_by: str
    ) -> Deliverable:
        """Approve a deliverable."""
        deliverable = self.deliverables.get(deliverable_id)
        if not deliverable:
            raise ValueError(f"Deliverable {deliverable_id} not found")
        
        deliverable.approved = True
        deliverable.approved_by = approved_by
        deliverable.approved_at = datetime.now()
        deliverable.status = "approved"
        
        return deliverable
    
    # ==================== Milestone Management ====================
    
    def create_milestone(self, milestone_data: Dict[str, Any]) -> Milestone:
        """Create a new milestone."""
        milestone_id = f"mile_{datetime.now().timestamp()}"
        milestone = Milestone(
            id=milestone_id,
            title=milestone_data.get("title", ""),
            description=milestone_data.get("description", ""),
            project_id=milestone_data.get("project_id", ""),
            due_date=self._parse_date(milestone_data.get("due_date", datetime.now())),
            payment_due=milestone_data.get("payment_due", 0)
        )
        
        self.milestones[milestone_id] = milestone
        
        # Link to project
        project = self.projects.get(milestone.project_id)
        if project:
            project.milestones.append(milestone_id)
        
        return milestone
    
    def complete_milestone(self, milestone_id: str) -> Milestone:
        """Mark a milestone as complete."""
        milestone = self.milestones.get(milestone_id)
        if not milestone:
            raise ValueError(f"Milestone {milestone_id} not found")
        
        milestone.completed = True
        milestone.completed_at = datetime.now()
        
        return milestone
    
    # ==================== Communication ====================
    
    async def send_client_update(
        self,
        project_id: str,
        update_type: str = "progress",
        custom_message: str = ""
    ) -> Dict[str, Any]:
        """Send an update to the client."""
        project = self.projects.get(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")
        
        client = self.clients.get(project.client_id)
        if not client:
            raise ValueError(f"Client not found for project {project_id}")
        
        # Generate update content
        if update_type == "progress":
            content = await self._generate_progress_update(project)
        elif update_type == "milestone":
            content = await self._generate_milestone_update(project)
        elif update_type == "deliverable":
            content = await self._generate_deliverable_update(project)
        else:
            content = custom_message
        
        # Create communication record
        communication = {
            "type": update_type,
            "timestamp": datetime.now().isoformat(),
            "recipient": client.email,
            "subject": f"[{project.name}] {update_type.title()} Update",
            "content": content,
            "sent": True
        }
        
        project.communications.append(communication)
        
        return communication
    
    async def _generate_progress_update(self, project: Project) -> str:
        """Generate a progress update email."""
        tasks = self.get_project_tasks(project.id)
        completed = len([t for t in tasks if t.status == TaskStatus.DONE])
        total = len(tasks)
        progress = (completed / total * 100) if total > 0 else 0
        
        return f"""
Project Update: {project.name}

Progress: {progress:.0f}% complete ({completed}/{total} tasks)

Completed this week:
{self._format_completed_tasks(tasks)}

In Progress:
{self._format_in_progress_tasks(tasks)}

Next Steps:
{self._format_upcoming_tasks(tasks)}

Please let us know if you have any questions or feedback.

Best regards,
SuperMega.dev Team
"""
    
    def _format_completed_tasks(self, tasks: List[Task]) -> str:
        """Format completed tasks for email."""
        completed = [t for t in tasks if t.status == TaskStatus.DONE]
        if not completed:
            return "- No tasks completed this period"
        return "\n".join(f"- {t.title}" for t in completed[:5])
    
    def _format_in_progress_tasks(self, tasks: List[Task]) -> str:
        """Format in-progress tasks for email."""
        in_progress = [t for t in tasks if t.status == TaskStatus.IN_PROGRESS]
        if not in_progress:
            return "- No tasks currently in progress"
        return "\n".join(f"- {t.title}" for t in in_progress[:5])
    
    def _format_upcoming_tasks(self, tasks: List[Task]) -> str:
        """Format upcoming tasks for email."""
        upcoming = [t for t in tasks if t.status == TaskStatus.TODO]
        if not upcoming:
            return "- All tasks completed!"
        return "\n".join(f"- {t.title}" for t in upcoming[:5])
    
    async def _generate_milestone_update(self, project: Project) -> str:
        """Generate a milestone update email."""
        milestones = [self.milestones[m] for m in project.milestones if m in self.milestones]
        completed = [m for m in milestones if m.completed]
        upcoming = [m for m in milestones if not m.completed]
        
        return f"""
Milestone Update: {project.name}

Completed Milestones: {len(completed)}/{len(milestones)}

Recently Completed:
{self._format_milestones(completed[-3:])}

Upcoming Milestones:
{self._format_milestones(upcoming[:3])}

Best regards,
SuperMega.dev Team
"""
    
    def _format_milestones(self, milestones: List[Milestone]) -> str:
        """Format milestones for email."""
        if not milestones:
            return "- None"
        return "\n".join(f"- {m.title} (Due: {m.due_date.strftime('%Y-%m-%d')})" for m in milestones)
    
    async def _generate_deliverable_update(self, project: Project) -> str:
        """Generate a deliverable update email."""
        deliverables = [self.deliverables[d] for d in project.deliverables if d in self.deliverables]
        
        return f"""
Deliverable Update: {project.name}

Total Deliverables: {len(deliverables)}
Approved: {len([d for d in deliverables if d.approved])}
Pending Review: {len([d for d in deliverables if d.status == 'submitted'])}

Recent Submissions:
{self._format_deliverables(deliverables)}

Please review and provide feedback at your earliest convenience.

Best regards,
SuperMega.dev Team
"""
    
    def _format_deliverables(self, deliverables: List[Deliverable]) -> str:
        """Format deliverables for email."""
        if not deliverables:
            return "- No deliverables yet"
        return "\n".join(f"- {d.title} ({d.status})" for d in deliverables[:5])
    
    # ==================== Analytics & Reporting ====================
    
    async def get_project_summary(self, project_id: str) -> Dict[str, Any]:
        """Get comprehensive project summary."""
        project = self.projects.get(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")
        
        tasks = self.get_project_tasks(project_id)
        deliverables = [self.deliverables[d] for d in project.deliverables if d in self.deliverables]
        milestones = [self.milestones[m] for m in project.milestones if m in self.milestones]
        
        # Calculate metrics
        total_tasks = len(tasks)
        completed_tasks = len([t for t in tasks if t.status == TaskStatus.DONE])
        
        total_hours_estimated = sum(t.estimated_hours for t in tasks)
        total_hours_actual = sum(t.actual_hours for t in tasks)
        
        return {
            "project": {
                "id": project.id,
                "name": project.name,
                "status": project.status.value,
                "client_id": project.client_id,
                "budget": project.budget,
                "spent": project.spent
            },
            "progress": {
                "tasks_completed": completed_tasks,
                "tasks_total": total_tasks,
                "percentage": (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0
            },
            "time": {
                "estimated_hours": total_hours_estimated,
                "actual_hours": total_hours_actual,
                "variance": total_hours_actual - total_hours_estimated
            },
            "deliverables": {
                "total": len(deliverables),
                "approved": len([d for d in deliverables if d.approved]),
                "pending": len([d for d in deliverables if not d.approved])
            },
            "milestones": {
                "total": len(milestones),
                "completed": len([m for m in milestones if m.completed]),
                "upcoming": len([m for m in milestones if not m.completed])
            },
            "health": self._calculate_project_health(project, tasks, milestones)
        }
    
    def _calculate_project_health(
        self,
        project: Project,
        tasks: List[Task],
        milestones: List[Milestone]
    ) -> str:
        """Calculate overall project health."""
        issues = []
        
        # Check for overdue tasks
        overdue_tasks = [t for t in tasks if t.due_date and t.due_date < datetime.now() and t.status != TaskStatus.DONE]
        if overdue_tasks:
            issues.append(f"{len(overdue_tasks)} overdue tasks")
        
        # Check for overdue milestones
        overdue_milestones = [m for m in milestones if m.due_date < datetime.now() and not m.completed]
        if overdue_milestones:
            issues.append(f"{len(overdue_milestones)} overdue milestones")
        
        # Check budget
        if project.budget > 0 and project.spent > project.budget * 0.9:
            issues.append("Budget nearly exhausted")
        
        # Check blocked tasks
        blocked = [t for t in tasks if t.status == TaskStatus.BLOCKED]
        if blocked:
            issues.append(f"{len(blocked)} blocked tasks")
        
        if not issues:
            return "healthy"
        elif len(issues) <= 2:
            return "at_risk"
        else:
            return "critical"
    
    async def get_all_projects_summary(self) -> Dict[str, Any]:
        """Get summary of all projects."""
        summaries = []
        for project_id in self.projects:
            try:
                summary = await self.get_project_summary(project_id)
                summaries.append(summary)
            except Exception as e:
                continue
        
        return {
            "total_projects": len(self.projects),
            "by_status": self._count_by_status(),
            "projects": summaries
        }
    
    def _count_by_status(self) -> Dict[str, int]:
        """Count projects by status."""
        counts = {}
        for project in self.projects.values():
            status = project.status.value
            counts[status] = counts.get(status, 0) + 1
        return counts
    
    # ==================== Agent Integration ====================
    
    async def delegate_task_to_agent(
        self,
        task_id: str,
        agent_type: str = ""
    ) -> Dict[str, Any]:
        """Delegate a task to an appropriate agent."""
        task = self.tasks.get(task_id)
        if not task:
            raise ValueError(f"Task {task_id} not found")
        
        # Determine agent if not specified
        if not agent_type:
            agent_type = task.assigned_agent or self._suggest_agent_for_task(task)
        
        # Create delegation record
        delegation = {
            "task_id": task_id,
            "agent_type": agent_type,
            "delegated_at": datetime.now().isoformat(),
            "status": "delegated",
            "instructions": self._generate_task_instructions(task)
        }
        
        # Update task
        task.assigned_agent = agent_type
        task.status = TaskStatus.IN_PROGRESS
        
        return delegation
    
    def _generate_task_instructions(self, task: Task) -> str:
        """Generate instructions for an agent."""
        project = self.projects.get(task.project_id)
        project_context = f"Project: {project.name}" if project else ""
        
        return f"""
Task: {task.title}
{project_context}

Description:
{task.description}

Priority: {task.priority.value}
Due: {task.due_date.strftime('%Y-%m-%d') if task.due_date else 'Not set'}

Requirements:
- Complete the task as described
- Document any decisions or assumptions
- Report completion or blockers

Tags: {', '.join(task.tags)}
"""


# Convenience functions
async def create_project_agent(config: Optional[Dict] = None) -> ProjectAgent:
    """Create and initialize a project agent."""
    return ProjectAgent(config)


async def run_daily_project_routine(agent: ProjectAgent) -> Dict[str, Any]:
    """Run daily project management routine."""
    results = {
        "projects_checked": 0,
        "updates_sent": 0,
        "tasks_delegated": 0,
        "issues_found": []
    }
    
    for project_id, project in agent.projects.items():
        if project.status == ProjectStatus.IN_PROGRESS:
            results["projects_checked"] += 1
            
            # Get summary
            summary = await agent.get_project_summary(project_id)
            
            # Check health
            if summary["health"] in ["at_risk", "critical"]:
                results["issues_found"].append({
                    "project": project.name,
                    "health": summary["health"],
                    "progress": summary["progress"]["percentage"]
                })
            
            # Send weekly update (if it's Monday)
            if datetime.now().weekday() == 0:
                await agent.send_client_update(project_id, "progress")
                results["updates_sent"] += 1
    
    return results
