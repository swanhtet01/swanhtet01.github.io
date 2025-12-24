"""
CEO Proxy Agent
===============
Strategic high-level delegation agent for SuperMega.dev.

This agent represents the "Manus-level" strategic function and:
- Delegates complex tasks to specialized agents
- Manages the agent workforce
- Makes autonomous decisions
- Ensures continuous productive utilization

Author: Manus AI for SuperMega.dev
"""

import os
import sys
import json
import asyncio
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any, Tuple
from dataclasses import dataclass, field
from enum import Enum
import logging

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ceo_agent")


# ============================================================================
# Data Models
# ============================================================================

class TaskPriority(Enum):
    """Task priority levels."""
    CRITICAL = 1
    HIGH = 2
    MEDIUM = 3
    LOW = 4
    BACKGROUND = 5


class AgentStatus(Enum):
    """Agent status."""
    IDLE = "idle"
    BUSY = "busy"
    OFFLINE = "offline"


@dataclass
class StrategicGoal:
    """A strategic goal to be achieved."""
    goal_id: str
    title: str
    description: str
    priority: TaskPriority
    deadline: Optional[datetime] = None
    subtasks: List[str] = field(default_factory=list)
    assigned_agents: List[str] = field(default_factory=list)
    status: str = "pending"
    progress: float = 0.0
    created_at: datetime = field(default_factory=datetime.utcnow)


@dataclass
class AgentCapability:
    """Capability profile of an agent."""
    agent_type: str
    name: str
    skills: List[str]
    max_concurrent_tasks: int = 3
    avg_task_duration_minutes: int = 30
    success_rate: float = 0.95


# ============================================================================
# Agent Workforce Registry
# ============================================================================

class AgentWorkforce:
    """
    Registry and manager for the agent workforce.
    """
    
    AGENTS = {
        "research": AgentCapability(
            agent_type="research",
            name="Research Analyst",
            skills=["web_search", "data_analysis", "report_writing", "fact_checking"],
            max_concurrent_tasks=5,
            avg_task_duration_minutes=45
        ),
        "code": AgentCapability(
            agent_type="code",
            name="Software Developer",
            skills=["coding", "debugging", "testing", "documentation", "git"],
            max_concurrent_tasks=3,
            avg_task_duration_minutes=60
        ),
        "content": AgentCapability(
            agent_type="content",
            name="Content Writer",
            skills=["writing", "editing", "seo", "formatting", "proofreading"],
            max_concurrent_tasks=4,
            avg_task_duration_minutes=30
        ),
        "browser": AgentCapability(
            agent_type="browser",
            name="Web Automation Specialist",
            skills=["web_scraping", "form_filling", "navigation", "data_extraction"],
            max_concurrent_tasks=2,
            avg_task_duration_minutes=20
        ),
        "financial": AgentCapability(
            agent_type="financial",
            name="Financial Analyst",
            skills=["stock_analysis", "portfolio_management", "risk_assessment", "reporting"],
            max_concurrent_tasks=3,
            avg_task_duration_minutes=40
        ),
        "communication": AgentCapability(
            agent_type="communication",
            name="Communication Manager",
            skills=["email", "calendar", "scheduling", "notifications"],
            max_concurrent_tasks=10,
            avg_task_duration_minutes=10
        ),
        "data": AgentCapability(
            agent_type="data",
            name="Data Analyst",
            skills=["sql", "visualization", "statistics", "machine_learning", "etl"],
            max_concurrent_tasks=3,
            avg_task_duration_minutes=50
        )
    }
    
    def __init__(self):
        self.agent_status: Dict[str, AgentStatus] = {
            agent_type: AgentStatus.IDLE for agent_type in self.AGENTS
        }
        self.current_tasks: Dict[str, List[str]] = {
            agent_type: [] for agent_type in self.AGENTS
        }
    
    def get_agent(self, agent_type: str) -> Optional[AgentCapability]:
        """Get an agent by type."""
        return self.AGENTS.get(agent_type)
    
    def get_available_agents(self) -> List[str]:
        """Get list of available (not fully busy) agents."""
        available = []
        for agent_type, capability in self.AGENTS.items():
            current_load = len(self.current_tasks.get(agent_type, []))
            if current_load < capability.max_concurrent_tasks:
                available.append(agent_type)
        return available
    
    def assign_task(self, agent_type: str, task_id: str) -> bool:
        """Assign a task to an agent."""
        capability = self.get_agent(agent_type)
        if not capability:
            return False
        
        current_load = len(self.current_tasks.get(agent_type, []))
        if current_load >= capability.max_concurrent_tasks:
            return False
        
        self.current_tasks[agent_type].append(task_id)
        self.agent_status[agent_type] = AgentStatus.BUSY
        
        return True
    
    def complete_task(self, agent_type: str, task_id: str):
        """Mark a task as complete."""
        if task_id in self.current_tasks.get(agent_type, []):
            self.current_tasks[agent_type].remove(task_id)
        
        if not self.current_tasks.get(agent_type):
            self.agent_status[agent_type] = AgentStatus.IDLE
    
    def get_best_agent_for_task(self, required_skills: List[str]) -> Optional[str]:
        """Find the best available agent for a task based on required skills."""
        best_match = None
        best_score = 0
        
        for agent_type in self.get_available_agents():
            capability = self.AGENTS[agent_type]
            
            # Calculate skill match score
            matching_skills = set(required_skills) & set(capability.skills)
            score = len(matching_skills) / len(required_skills) if required_skills else 0
            
            # Factor in success rate
            score *= capability.success_rate
            
            if score > best_score:
                best_score = score
                best_match = agent_type
        
        return best_match


# ============================================================================
# CEO Agent
# ============================================================================

class CEOAgent:
    """
    The CEO Proxy Agent - strategic orchestrator for the agent workforce.
    
    Responsibilities:
    1. Break down complex goals into subtasks
    2. Delegate tasks to the best available agents
    3. Monitor progress and adjust strategy
    4. Make autonomous decisions
    5. Ensure continuous productive utilization
    """
    
    def __init__(self):
        self.workforce = AgentWorkforce()
        self.goals: Dict[str, StrategicGoal] = {}
        self.task_queue: List[Tuple[TaskPriority, str, Dict]] = []
        self.completed_tasks: List[Dict] = []
        self.intelligence = None  # Will be set to IntelligenceFabric
    
    async def initialize(self):
        """Initialize the CEO Agent with AI capabilities."""
        try:
            from core.intelligence_fabric import IntelligenceFabric
            self.intelligence = IntelligenceFabric()
            logger.info("CEO Agent initialized with Intelligence Fabric")
        except Exception as e:
            logger.warning(f"Could not initialize Intelligence Fabric: {e}")
    
    # ========================================================================
    # Strategic Planning
    # ========================================================================
    
    async def create_strategic_goal(
        self,
        title: str,
        description: str,
        priority: TaskPriority = TaskPriority.MEDIUM,
        deadline: Optional[datetime] = None
    ) -> StrategicGoal:
        """Create a new strategic goal and break it down into subtasks."""
        import uuid
        goal_id = str(uuid.uuid4())[:8]
        
        goal = StrategicGoal(
            goal_id=goal_id,
            title=title,
            description=description,
            priority=priority,
            deadline=deadline
        )
        
        # Use AI to break down the goal into subtasks
        subtasks = await self._decompose_goal(goal)
        goal.subtasks = subtasks
        
        # Assign agents to subtasks
        for subtask in subtasks:
            best_agent = await self._select_agent_for_subtask(subtask)
            if best_agent:
                goal.assigned_agents.append(best_agent)
        
        self.goals[goal_id] = goal
        
        logger.info(f"Created strategic goal: {goal_id} - {title}")
        logger.info(f"Decomposed into {len(subtasks)} subtasks")
        
        return goal
    
    async def _decompose_goal(self, goal: StrategicGoal) -> List[str]:
        """Use AI to decompose a goal into subtasks."""
        if not self.intelligence:
            # Fallback: simple decomposition
            return [f"Execute: {goal.description}"]
        
        prompt = f"""
        You are a strategic planner. Break down this goal into specific, actionable subtasks.
        
        Goal: {goal.title}
        Description: {goal.description}
        Priority: {goal.priority.name}
        Deadline: {goal.deadline or 'No specific deadline'}
        
        Available agent types and their skills:
        {json.dumps({k: v.skills for k, v in self.workforce.AGENTS.items()}, indent=2)}
        
        Return a JSON array of subtasks, each with:
        - task: Description of the subtask
        - required_skills: List of skills needed
        - estimated_minutes: Estimated time to complete
        - dependencies: List of subtask indices this depends on (empty if none)
        
        Example:
        [
            {{"task": "Research competitors", "required_skills": ["web_search", "data_analysis"], "estimated_minutes": 30, "dependencies": []}},
            {{"task": "Write report", "required_skills": ["writing", "formatting"], "estimated_minutes": 45, "dependencies": [0]}}
        ]
        """
        
        try:
            response = await self.intelligence.complete(prompt)
            
            # Parse JSON from response
            import re
            json_match = re.search(r'\[.*\]', response, re.DOTALL)
            if json_match:
                subtasks = json.loads(json_match.group())
                return [st.get("task", str(st)) for st in subtasks]
        except Exception as e:
            logger.error(f"Error decomposing goal: {e}")
        
        return [f"Execute: {goal.description}"]
    
    async def _select_agent_for_subtask(self, subtask: str) -> Optional[str]:
        """Select the best agent for a subtask."""
        # Extract required skills from subtask description
        skill_keywords = {
            "research": ["research", "search", "find", "analyze", "investigate"],
            "code": ["code", "program", "develop", "debug", "test", "implement"],
            "content": ["write", "create", "draft", "edit", "document"],
            "browser": ["scrape", "navigate", "browse", "extract", "automate"],
            "financial": ["stock", "market", "portfolio", "financial", "invest"],
            "communication": ["email", "schedule", "calendar", "notify", "message"],
            "data": ["data", "sql", "visualize", "chart", "statistics"]
        }
        
        subtask_lower = subtask.lower()
        required_skills = []
        
        for agent_type, keywords in skill_keywords.items():
            if any(kw in subtask_lower for kw in keywords):
                capability = self.workforce.get_agent(agent_type)
                if capability:
                    required_skills.extend(capability.skills[:2])
        
        if not required_skills:
            required_skills = ["general"]
        
        return self.workforce.get_best_agent_for_task(required_skills)
    
    # ========================================================================
    # Task Delegation
    # ========================================================================
    
    async def delegate_task(
        self,
        task_description: str,
        priority: TaskPriority = TaskPriority.MEDIUM,
        context: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """
        Autonomously delegate a task to the best available agent.
        """
        # Determine best agent
        best_agent = await self._select_agent_for_subtask(task_description)
        
        if not best_agent:
            # Queue the task for later
            self.task_queue.append((priority, task_description, context or {}))
            return {
                "status": "queued",
                "message": "All agents busy, task queued",
                "queue_position": len(self.task_queue)
            }
        
        # Assign task
        import uuid
        task_id = str(uuid.uuid4())[:8]
        
        if not self.workforce.assign_task(best_agent, task_id):
            self.task_queue.append((priority, task_description, context or {}))
            return {
                "status": "queued",
                "message": f"Agent {best_agent} at capacity, task queued"
            }
        
        # Execute the task
        result = await self._execute_delegated_task(
            task_id=task_id,
            agent_type=best_agent,
            task_description=task_description,
            context=context or {}
        )
        
        # Complete the task
        self.workforce.complete_task(best_agent, task_id)
        
        return {
            "status": "completed",
            "task_id": task_id,
            "agent": best_agent,
            "result": result
        }
    
    async def _execute_delegated_task(
        self,
        task_id: str,
        agent_type: str,
        task_description: str,
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Execute a delegated task using the appropriate agent."""
        logger.info(f"Executing task {task_id} with {agent_type} agent")
        
        try:
            if agent_type == "research":
                from agents.research_agent import ResearchAgent
                agent = ResearchAgent()
                return await agent.execute(task_description)
            
            elif agent_type == "code":
                from agents.code_agent import CodeAgent
                agent = CodeAgent()
                return await agent.execute(task_description)
            
            elif agent_type == "content":
                from agents.content_agent import ContentAgent
                agent = ContentAgent()
                return await agent.execute(task_description)
            
            elif agent_type == "browser":
                from agents.browser_agent import BrowserAgent
                agent = BrowserAgent()
                return await agent.execute(task_description)
            
            elif agent_type == "financial":
                from agents.financial_agent import FinancialAgent
                agent = FinancialAgent()
                return await agent.execute(task_description)
            
            elif agent_type == "communication":
                from agents.communication_agent import CommunicationAgent
                agent = CommunicationAgent()
                return await agent.execute(task_description)
            
            else:
                # Default: use intelligence fabric directly
                if self.intelligence:
                    response = await self.intelligence.complete(
                        f"Execute this task: {task_description}\nContext: {json.dumps(context)}"
                    )
                    return {"response": response}
                
                return {"error": f"Unknown agent type: {agent_type}"}
        
        except Exception as e:
            logger.error(f"Error executing task {task_id}: {e}")
            return {"error": str(e)}
    
    # ========================================================================
    # Autonomous Decision Making
    # ========================================================================
    
    async def make_decision(self, situation: str, options: List[str]) -> Dict[str, Any]:
        """
        Make an autonomous decision based on a situation.
        """
        if not self.intelligence:
            # Fallback: choose first option
            return {
                "decision": options[0] if options else "No action",
                "reasoning": "Default choice (AI not available)"
            }
        
        prompt = f"""
        You are the CEO of an AI agent company. Make a strategic decision.
        
        Situation: {situation}
        
        Options:
        {chr(10).join(f"{i+1}. {opt}" for i, opt in enumerate(options))}
        
        Consider:
        - Business impact
        - Resource efficiency
        - Risk assessment
        - Long-term value
        
        Respond with JSON:
        {{
            "decision": "The chosen option",
            "reasoning": "Why this decision was made",
            "confidence": 0.0-1.0,
            "risks": ["potential risks"],
            "next_steps": ["recommended follow-up actions"]
        }}
        """
        
        try:
            response = await self.intelligence.complete(prompt)
            
            # Parse JSON from response
            import re
            json_match = re.search(r'\{.*\}', response, re.DOTALL)
            if json_match:
                return json.loads(json_match.group())
        except Exception as e:
            logger.error(f"Error making decision: {e}")
        
        return {
            "decision": options[0] if options else "No action",
            "reasoning": "Fallback decision"
        }
    
    # ========================================================================
    # Workforce Optimization
    # ========================================================================
    
    async def optimize_workforce(self) -> Dict[str, Any]:
        """
        Analyze and optimize workforce utilization.
        """
        analysis = {
            "timestamp": datetime.utcnow().isoformat(),
            "agent_status": {},
            "utilization": {},
            "recommendations": []
        }
        
        total_capacity = 0
        total_load = 0
        
        for agent_type, capability in self.workforce.AGENTS.items():
            current_load = len(self.workforce.current_tasks.get(agent_type, []))
            capacity = capability.max_concurrent_tasks
            utilization = current_load / capacity if capacity > 0 else 0
            
            analysis["agent_status"][agent_type] = {
                "status": self.workforce.agent_status[agent_type].value,
                "current_tasks": current_load,
                "capacity": capacity,
                "utilization": f"{utilization:.1%}"
            }
            
            analysis["utilization"][agent_type] = utilization
            total_capacity += capacity
            total_load += current_load
        
        # Overall utilization
        overall_utilization = total_load / total_capacity if total_capacity > 0 else 0
        analysis["overall_utilization"] = f"{overall_utilization:.1%}"
        
        # Generate recommendations
        if overall_utilization < 0.3:
            analysis["recommendations"].append(
                "Low utilization - consider taking on more tasks or reducing agent capacity"
            )
        elif overall_utilization > 0.8:
            analysis["recommendations"].append(
                "High utilization - consider scaling up agent capacity"
            )
        
        # Check for idle agents
        idle_agents = [
            agent_type for agent_type, status in self.workforce.agent_status.items()
            if status == AgentStatus.IDLE
        ]
        if idle_agents:
            analysis["recommendations"].append(
                f"Idle agents available: {', '.join(idle_agents)} - assign tasks to maximize productivity"
            )
        
        # Check task queue
        if self.task_queue:
            analysis["recommendations"].append(
                f"{len(self.task_queue)} tasks in queue - prioritize processing"
            )
        
        return analysis
    
    # ========================================================================
    # Continuous Operation
    # ========================================================================
    
    async def run_continuous(self):
        """
        Run the CEO Agent in continuous mode.
        Monitors, delegates, and optimizes autonomously.
        """
        logger.info("CEO Agent starting continuous operation...")
        
        while True:
            try:
                # Process queued tasks
                await self._process_task_queue()
                
                # Check goal progress
                await self._check_goal_progress()
                
                # Optimize workforce
                optimization = await self.optimize_workforce()
                
                if optimization.get("recommendations"):
                    logger.info(f"Workforce recommendations: {optimization['recommendations']}")
                
                # Sleep before next cycle
                await asyncio.sleep(60)  # Check every minute
                
            except Exception as e:
                logger.error(f"Error in continuous operation: {e}")
                await asyncio.sleep(30)
    
    async def _process_task_queue(self):
        """Process queued tasks."""
        if not self.task_queue:
            return
        
        # Sort by priority
        self.task_queue.sort(key=lambda x: x[0].value)
        
        # Try to assign queued tasks
        processed = []
        for i, (priority, task_desc, context) in enumerate(self.task_queue):
            best_agent = await self._select_agent_for_subtask(task_desc)
            
            if best_agent and best_agent in self.workforce.get_available_agents():
                # Execute the task
                result = await self.delegate_task(task_desc, priority, context)
                
                if result.get("status") == "completed":
                    processed.append(i)
                    logger.info(f"Processed queued task: {task_desc[:50]}...")
        
        # Remove processed tasks
        for i in reversed(processed):
            self.task_queue.pop(i)
    
    async def _check_goal_progress(self):
        """Check and update progress on strategic goals."""
        for goal_id, goal in self.goals.items():
            if goal.status == "completed":
                continue
            
            # Calculate progress based on completed subtasks
            # (In a real implementation, this would track actual subtask completion)
            
            # Check deadline
            if goal.deadline and datetime.utcnow() > goal.deadline:
                logger.warning(f"Goal {goal_id} is past deadline!")


# ============================================================================
# Main Entry Point
# ============================================================================

async def main():
    """Demo the CEO Agent."""
    ceo = CEOAgent()
    await ceo.initialize()
    
    # Create a strategic goal
    goal = await ceo.create_strategic_goal(
        title="Launch New Product Feature",
        description="Research market needs, develop the feature, create documentation, and announce to users",
        priority=TaskPriority.HIGH,
        deadline=datetime.utcnow() + timedelta(days=7)
    )
    
    print(f"Created goal: {goal.goal_id}")
    print(f"Subtasks: {goal.subtasks}")
    print(f"Assigned agents: {goal.assigned_agents}")
    
    # Delegate a task
    result = await ceo.delegate_task(
        "Research the top 5 competitors in the AI agent market",
        priority=TaskPriority.HIGH
    )
    
    print(f"Task result: {result}")
    
    # Optimize workforce
    optimization = await ceo.optimize_workforce()
    print(f"Workforce optimization: {json.dumps(optimization, indent=2)}")


if __name__ == "__main__":
    asyncio.run(main())
