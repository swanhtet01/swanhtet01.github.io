"""
Workflow Templates
===================
Pre-built automation workflows for common tasks.

Features:
- Research workflows
- Content creation workflows
- Development workflows
- Business automation workflows
- Data processing workflows

Author: Manus AI for SuperMega.dev
"""

import os
import json
import asyncio
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any, Callable, Awaitable
from dataclasses import dataclass, field
from enum import Enum
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("workflows")


# ============================================================================
# Data Models
# ============================================================================

class WorkflowStatus(Enum):
    """Workflow execution status."""
    PENDING = "pending"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class StepType(Enum):
    """Types of workflow steps."""
    AGENT = "agent"           # Execute an agent
    TOOL = "tool"             # Execute a tool
    CONDITION = "condition"   # Conditional branching
    PARALLEL = "parallel"     # Parallel execution
    WAIT = "wait"             # Wait for condition/time
    HUMAN = "human"           # Human approval/input
    TRANSFORM = "transform"   # Data transformation


@dataclass
class WorkflowStep:
    """A step in a workflow."""
    step_id: str
    name: str
    step_type: StepType
    config: Dict[str, Any]
    next_steps: List[str] = field(default_factory=list)
    on_error: str = None  # Step to execute on error
    timeout_seconds: int = 300
    retries: int = 0


@dataclass
class WorkflowTemplate:
    """A workflow template."""
    template_id: str
    name: str
    description: str
    category: str
    steps: List[WorkflowStep]
    input_schema: Dict[str, Any]
    output_schema: Dict[str, Any]
    estimated_duration_minutes: int
    tags: List[str] = field(default_factory=list)


@dataclass
class WorkflowExecution:
    """A workflow execution instance."""
    execution_id: str
    template_id: str
    status: WorkflowStatus
    started_at: datetime
    completed_at: Optional[datetime] = None
    current_step: Optional[str] = None
    inputs: Dict[str, Any] = field(default_factory=dict)
    outputs: Dict[str, Any] = field(default_factory=dict)
    step_results: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None


# ============================================================================
# Pre-built Workflow Templates
# ============================================================================

WORKFLOW_TEMPLATES = {
    # -------------------------------------------------------------------------
    # Research Workflows
    # -------------------------------------------------------------------------
    "deep_research": WorkflowTemplate(
        template_id="deep_research",
        name="Deep Research Report",
        description="Comprehensive research on a topic with multi-source analysis",
        category="research",
        steps=[
            WorkflowStep(
                step_id="plan",
                name="Create Research Plan",
                step_type=StepType.AGENT,
                config={
                    "agent": "research_agent",
                    "action": "create_plan",
                    "prompt": "Create a research plan for: {topic}"
                },
                next_steps=["search_web"]
            ),
            WorkflowStep(
                step_id="search_web",
                name="Web Search",
                step_type=StepType.TOOL,
                config={
                    "tool": "tavily_search",
                    "query": "{topic}",
                    "max_results": 10
                },
                next_steps=["search_academic"]
            ),
            WorkflowStep(
                step_id="search_academic",
                name="Academic Search",
                step_type=StepType.TOOL,
                config={
                    "tool": "exa_search",
                    "query": "{topic} research paper",
                    "type": "research"
                },
                next_steps=["analyze"]
            ),
            WorkflowStep(
                step_id="analyze",
                name="Analyze Sources",
                step_type=StepType.AGENT,
                config={
                    "agent": "research_agent",
                    "action": "analyze",
                    "prompt": "Analyze these sources and extract key findings"
                },
                next_steps=["synthesize"]
            ),
            WorkflowStep(
                step_id="synthesize",
                name="Synthesize Report",
                step_type=StepType.AGENT,
                config={
                    "agent": "content_agent",
                    "action": "write_report",
                    "format": "markdown"
                },
                next_steps=["review"]
            ),
            WorkflowStep(
                step_id="review",
                name="Quality Review",
                step_type=StepType.AGENT,
                config={
                    "agent": "research_agent",
                    "action": "review",
                    "criteria": ["accuracy", "completeness", "citations"]
                },
                next_steps=[]
            )
        ],
        input_schema={"topic": "string", "depth": "string"},
        output_schema={"report": "string", "sources": "array"},
        estimated_duration_minutes=30,
        tags=["research", "report", "analysis"]
    ),
    
    "competitor_analysis": WorkflowTemplate(
        template_id="competitor_analysis",
        name="Competitor Analysis",
        description="Analyze competitors and market positioning",
        category="research",
        steps=[
            WorkflowStep(
                step_id="identify",
                name="Identify Competitors",
                step_type=StepType.AGENT,
                config={
                    "agent": "research_agent",
                    "action": "identify_competitors",
                    "prompt": "Identify top competitors for: {company}"
                },
                next_steps=["research_parallel"]
            ),
            WorkflowStep(
                step_id="research_parallel",
                name="Research Each Competitor",
                step_type=StepType.PARALLEL,
                config={
                    "items": "{competitors}",
                    "step_template": {
                        "agent": "research_agent",
                        "action": "research_company"
                    }
                },
                next_steps=["compare"]
            ),
            WorkflowStep(
                step_id="compare",
                name="Comparative Analysis",
                step_type=StepType.AGENT,
                config={
                    "agent": "data_agent",
                    "action": "compare",
                    "metrics": ["pricing", "features", "market_share"]
                },
                next_steps=["visualize"]
            ),
            WorkflowStep(
                step_id="visualize",
                name="Create Visualizations",
                step_type=StepType.TOOL,
                config={
                    "tool": "plotly",
                    "charts": ["comparison_table", "market_map"]
                },
                next_steps=["report"]
            ),
            WorkflowStep(
                step_id="report",
                name="Generate Report",
                step_type=StepType.AGENT,
                config={
                    "agent": "content_agent",
                    "action": "write_report",
                    "template": "competitor_analysis"
                },
                next_steps=[]
            )
        ],
        input_schema={"company": "string", "industry": "string"},
        output_schema={"report": "string", "competitors": "array", "charts": "array"},
        estimated_duration_minutes=45,
        tags=["research", "competitors", "market"]
    ),
    
    # -------------------------------------------------------------------------
    # Content Workflows
    # -------------------------------------------------------------------------
    "blog_post": WorkflowTemplate(
        template_id="blog_post",
        name="Blog Post Creation",
        description="Create a well-researched blog post",
        category="content",
        steps=[
            WorkflowStep(
                step_id="research",
                name="Research Topic",
                step_type=StepType.AGENT,
                config={
                    "agent": "research_agent",
                    "action": "quick_research",
                    "depth": "medium"
                },
                next_steps=["outline"]
            ),
            WorkflowStep(
                step_id="outline",
                name="Create Outline",
                step_type=StepType.AGENT,
                config={
                    "agent": "content_agent",
                    "action": "create_outline",
                    "style": "{style}"
                },
                next_steps=["write"]
            ),
            WorkflowStep(
                step_id="write",
                name="Write Draft",
                step_type=StepType.AGENT,
                config={
                    "agent": "content_agent",
                    "action": "write_draft",
                    "word_count": "{word_count}"
                },
                next_steps=["edit"]
            ),
            WorkflowStep(
                step_id="edit",
                name="Edit and Polish",
                step_type=StepType.AGENT,
                config={
                    "agent": "content_agent",
                    "action": "edit",
                    "focus": ["clarity", "engagement", "seo"]
                },
                next_steps=["seo"]
            ),
            WorkflowStep(
                step_id="seo",
                name="SEO Optimization",
                step_type=StepType.AGENT,
                config={
                    "agent": "content_agent",
                    "action": "optimize_seo",
                    "keywords": "{keywords}"
                },
                next_steps=[]
            )
        ],
        input_schema={
            "topic": "string",
            "style": "string",
            "word_count": "number",
            "keywords": "array"
        },
        output_schema={"post": "string", "meta": "object"},
        estimated_duration_minutes=20,
        tags=["content", "blog", "writing"]
    ),
    
    "social_media_campaign": WorkflowTemplate(
        template_id="social_media_campaign",
        name="Social Media Campaign",
        description="Create a multi-platform social media campaign",
        category="content",
        steps=[
            WorkflowStep(
                step_id="strategy",
                name="Campaign Strategy",
                step_type=StepType.AGENT,
                config={
                    "agent": "content_agent",
                    "action": "create_strategy",
                    "platforms": "{platforms}"
                },
                next_steps=["content_parallel"]
            ),
            WorkflowStep(
                step_id="content_parallel",
                name="Create Platform Content",
                step_type=StepType.PARALLEL,
                config={
                    "items": "{platforms}",
                    "step_template": {
                        "agent": "content_agent",
                        "action": "create_social_post"
                    }
                },
                next_steps=["schedule"]
            ),
            WorkflowStep(
                step_id="schedule",
                name="Create Schedule",
                step_type=StepType.AGENT,
                config={
                    "agent": "content_agent",
                    "action": "create_schedule",
                    "duration_days": "{duration}"
                },
                next_steps=["review"]
            ),
            WorkflowStep(
                step_id="review",
                name="Human Review",
                step_type=StepType.HUMAN,
                config={
                    "action": "approve",
                    "message": "Please review the campaign content"
                },
                next_steps=[]
            )
        ],
        input_schema={
            "campaign_goal": "string",
            "platforms": "array",
            "duration": "number"
        },
        output_schema={"posts": "array", "schedule": "object"},
        estimated_duration_minutes=30,
        tags=["content", "social", "marketing"]
    ),
    
    # -------------------------------------------------------------------------
    # Development Workflows
    # -------------------------------------------------------------------------
    "code_review": WorkflowTemplate(
        template_id="code_review",
        name="Automated Code Review",
        description="Review code for quality, security, and best practices",
        category="development",
        steps=[
            WorkflowStep(
                step_id="fetch",
                name="Fetch Code",
                step_type=StepType.TOOL,
                config={
                    "tool": "github",
                    "action": "get_pr",
                    "pr_url": "{pr_url}"
                },
                next_steps=["analyze_parallel"]
            ),
            WorkflowStep(
                step_id="analyze_parallel",
                name="Multi-aspect Analysis",
                step_type=StepType.PARALLEL,
                config={
                    "items": ["quality", "security", "performance", "style"],
                    "step_template": {
                        "agent": "code_agent",
                        "action": "analyze"
                    }
                },
                next_steps=["synthesize"]
            ),
            WorkflowStep(
                step_id="synthesize",
                name="Synthesize Review",
                step_type=StepType.AGENT,
                config={
                    "agent": "code_agent",
                    "action": "synthesize_review"
                },
                next_steps=["comment"]
            ),
            WorkflowStep(
                step_id="comment",
                name="Post Review Comments",
                step_type=StepType.TOOL,
                config={
                    "tool": "github",
                    "action": "post_review"
                },
                next_steps=[]
            )
        ],
        input_schema={"pr_url": "string"},
        output_schema={"review": "object", "issues": "array"},
        estimated_duration_minutes=10,
        tags=["development", "code", "review"]
    ),
    
    "feature_implementation": WorkflowTemplate(
        template_id="feature_implementation",
        name="Feature Implementation",
        description="Implement a new feature from specification",
        category="development",
        steps=[
            WorkflowStep(
                step_id="analyze",
                name="Analyze Requirements",
                step_type=StepType.AGENT,
                config={
                    "agent": "code_agent",
                    "action": "analyze_requirements",
                    "spec": "{specification}"
                },
                next_steps=["design"]
            ),
            WorkflowStep(
                step_id="design",
                name="Design Solution",
                step_type=StepType.AGENT,
                config={
                    "agent": "code_agent",
                    "action": "design",
                    "output": "architecture_doc"
                },
                next_steps=["implement"]
            ),
            WorkflowStep(
                step_id="implement",
                name="Write Code",
                step_type=StepType.AGENT,
                config={
                    "agent": "code_agent",
                    "action": "implement",
                    "language": "{language}"
                },
                next_steps=["test"]
            ),
            WorkflowStep(
                step_id="test",
                name="Write Tests",
                step_type=StepType.AGENT,
                config={
                    "agent": "code_agent",
                    "action": "write_tests",
                    "coverage_target": 80
                },
                next_steps=["review"]
            ),
            WorkflowStep(
                step_id="review",
                name="Self Review",
                step_type=StepType.AGENT,
                config={
                    "agent": "code_agent",
                    "action": "self_review"
                },
                next_steps=["pr"]
            ),
            WorkflowStep(
                step_id="pr",
                name="Create PR",
                step_type=StepType.TOOL,
                config={
                    "tool": "github",
                    "action": "create_pr"
                },
                next_steps=[]
            )
        ],
        input_schema={
            "specification": "string",
            "language": "string",
            "repo": "string"
        },
        output_schema={"code": "object", "tests": "object", "pr_url": "string"},
        estimated_duration_minutes=60,
        tags=["development", "feature", "implementation"]
    ),
    
    # -------------------------------------------------------------------------
    # Business Workflows
    # -------------------------------------------------------------------------
    "daily_briefing": WorkflowTemplate(
        template_id="daily_briefing",
        name="Daily Executive Briefing",
        description="Generate a daily briefing with news, metrics, and tasks",
        category="business",
        steps=[
            WorkflowStep(
                step_id="news",
                name="Gather Industry News",
                step_type=StepType.TOOL,
                config={
                    "tool": "tavily_search",
                    "query": "{industry} news today",
                    "type": "news"
                },
                next_steps=["metrics"]
            ),
            WorkflowStep(
                step_id="metrics",
                name="Fetch Business Metrics",
                step_type=StepType.TOOL,
                config={
                    "tool": "data_hub",
                    "action": "get_metrics",
                    "sources": "{data_sources}"
                },
                next_steps=["calendar"]
            ),
            WorkflowStep(
                step_id="calendar",
                name="Get Today's Schedule",
                step_type=StepType.TOOL,
                config={
                    "tool": "google_calendar",
                    "action": "get_events",
                    "date": "today"
                },
                next_steps=["tasks"]
            ),
            WorkflowStep(
                step_id="tasks",
                name="Get Priority Tasks",
                step_type=StepType.TOOL,
                config={
                    "tool": "task_manager",
                    "action": "get_priority_tasks"
                },
                next_steps=["synthesize"]
            ),
            WorkflowStep(
                step_id="synthesize",
                name="Create Briefing",
                step_type=StepType.AGENT,
                config={
                    "agent": "content_agent",
                    "action": "create_briefing",
                    "format": "executive_summary"
                },
                next_steps=["deliver"]
            ),
            WorkflowStep(
                step_id="deliver",
                name="Send Briefing",
                step_type=StepType.TOOL,
                config={
                    "tool": "email",
                    "action": "send",
                    "to": "{email}"
                },
                next_steps=[]
            )
        ],
        input_schema={
            "industry": "string",
            "data_sources": "array",
            "email": "string"
        },
        output_schema={"briefing": "string"},
        estimated_duration_minutes=10,
        tags=["business", "briefing", "daily"]
    ),
    
    "lead_qualification": WorkflowTemplate(
        template_id="lead_qualification",
        name="Lead Qualification",
        description="Research and qualify a sales lead",
        category="business",
        steps=[
            WorkflowStep(
                step_id="research_company",
                name="Research Company",
                step_type=StepType.AGENT,
                config={
                    "agent": "research_agent",
                    "action": "research_company",
                    "company": "{company_name}"
                },
                next_steps=["research_contact"]
            ),
            WorkflowStep(
                step_id="research_contact",
                name="Research Contact",
                step_type=StepType.AGENT,
                config={
                    "agent": "research_agent",
                    "action": "research_person",
                    "name": "{contact_name}"
                },
                next_steps=["score"]
            ),
            WorkflowStep(
                step_id="score",
                name="Score Lead",
                step_type=StepType.AGENT,
                config={
                    "agent": "data_agent",
                    "action": "score_lead",
                    "criteria": "{scoring_criteria}"
                },
                next_steps=["recommend"]
            ),
            WorkflowStep(
                step_id="recommend",
                name="Generate Recommendations",
                step_type=StepType.AGENT,
                config={
                    "agent": "content_agent",
                    "action": "create_outreach_plan"
                },
                next_steps=[]
            )
        ],
        input_schema={
            "company_name": "string",
            "contact_name": "string",
            "scoring_criteria": "object"
        },
        output_schema={
            "company_profile": "object",
            "contact_profile": "object",
            "score": "number",
            "recommendations": "array"
        },
        estimated_duration_minutes=15,
        tags=["business", "sales", "leads"]
    ),
    
    # -------------------------------------------------------------------------
    # Data Workflows
    # -------------------------------------------------------------------------
    "data_pipeline": WorkflowTemplate(
        template_id="data_pipeline",
        name="Data Processing Pipeline",
        description="Extract, transform, and analyze data",
        category="data",
        steps=[
            WorkflowStep(
                step_id="extract",
                name="Extract Data",
                step_type=StepType.TOOL,
                config={
                    "tool": "data_hub",
                    "action": "extract",
                    "source": "{data_source}"
                },
                next_steps=["validate"]
            ),
            WorkflowStep(
                step_id="validate",
                name="Validate Data",
                step_type=StepType.AGENT,
                config={
                    "agent": "data_agent",
                    "action": "validate",
                    "rules": "{validation_rules}"
                },
                next_steps=["transform"]
            ),
            WorkflowStep(
                step_id="transform",
                name="Transform Data",
                step_type=StepType.AGENT,
                config={
                    "agent": "data_agent",
                    "action": "transform",
                    "transformations": "{transformations}"
                },
                next_steps=["analyze"]
            ),
            WorkflowStep(
                step_id="analyze",
                name="Analyze Data",
                step_type=StepType.AGENT,
                config={
                    "agent": "data_agent",
                    "action": "analyze",
                    "analysis_type": "{analysis_type}"
                },
                next_steps=["visualize"]
            ),
            WorkflowStep(
                step_id="visualize",
                name="Create Visualizations",
                step_type=StepType.TOOL,
                config={
                    "tool": "plotly",
                    "charts": "{chart_types}"
                },
                next_steps=["report"]
            ),
            WorkflowStep(
                step_id="report",
                name="Generate Report",
                step_type=StepType.AGENT,
                config={
                    "agent": "content_agent",
                    "action": "create_data_report"
                },
                next_steps=[]
            )
        ],
        input_schema={
            "data_source": "string",
            "validation_rules": "object",
            "transformations": "array",
            "analysis_type": "string",
            "chart_types": "array"
        },
        output_schema={
            "data": "object",
            "analysis": "object",
            "charts": "array",
            "report": "string"
        },
        estimated_duration_minutes=30,
        tags=["data", "etl", "analysis"]
    )
}


# ============================================================================
# Workflow Engine
# ============================================================================

class WorkflowEngine:
    """
    Execute workflow templates.
    """
    
    def __init__(self):
        self.templates = WORKFLOW_TEMPLATES
        self.executions: Dict[str, WorkflowExecution] = {}
        self.step_handlers: Dict[StepType, Callable] = {}
        
        # Register default handlers
        self._register_default_handlers()
    
    def _register_default_handlers(self):
        """Register default step handlers."""
        self.step_handlers[StepType.AGENT] = self._handle_agent_step
        self.step_handlers[StepType.TOOL] = self._handle_tool_step
        self.step_handlers[StepType.CONDITION] = self._handle_condition_step
        self.step_handlers[StepType.PARALLEL] = self._handle_parallel_step
        self.step_handlers[StepType.WAIT] = self._handle_wait_step
        self.step_handlers[StepType.HUMAN] = self._handle_human_step
        self.step_handlers[StepType.TRANSFORM] = self._handle_transform_step
    
    async def _handle_agent_step(
        self,
        step: WorkflowStep,
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Handle an agent step."""
        # Placeholder - would integrate with actual agents
        logger.info(f"Executing agent step: {step.name}")
        return {"status": "completed", "result": f"Agent {step.config.get('agent')} executed"}
    
    async def _handle_tool_step(
        self,
        step: WorkflowStep,
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Handle a tool step."""
        logger.info(f"Executing tool step: {step.name}")
        return {"status": "completed", "result": f"Tool {step.config.get('tool')} executed"}
    
    async def _handle_condition_step(
        self,
        step: WorkflowStep,
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Handle a condition step."""
        logger.info(f"Evaluating condition: {step.name}")
        return {"status": "completed", "branch": "default"}
    
    async def _handle_parallel_step(
        self,
        step: WorkflowStep,
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Handle a parallel step."""
        logger.info(f"Executing parallel step: {step.name}")
        items = step.config.get("items", [])
        results = [f"Processed {item}" for item in items]
        return {"status": "completed", "results": results}
    
    async def _handle_wait_step(
        self,
        step: WorkflowStep,
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Handle a wait step."""
        wait_seconds = step.config.get("seconds", 1)
        logger.info(f"Waiting {wait_seconds} seconds")
        await asyncio.sleep(min(wait_seconds, 5))  # Cap at 5 for demo
        return {"status": "completed"}
    
    async def _handle_human_step(
        self,
        step: WorkflowStep,
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Handle a human approval step."""
        logger.info(f"Waiting for human input: {step.name}")
        # In real implementation, would pause and wait for human input
        return {"status": "completed", "approved": True}
    
    async def _handle_transform_step(
        self,
        step: WorkflowStep,
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Handle a data transformation step."""
        logger.info(f"Transforming data: {step.name}")
        return {"status": "completed", "transformed": True}
    
    def get_template(self, template_id: str) -> Optional[WorkflowTemplate]:
        """Get a workflow template."""
        return self.templates.get(template_id)
    
    def list_templates(self, category: str = None) -> List[WorkflowTemplate]:
        """List available templates."""
        templates = list(self.templates.values())
        if category:
            templates = [t for t in templates if t.category == category]
        return templates
    
    async def execute(
        self,
        template_id: str,
        inputs: Dict[str, Any]
    ) -> WorkflowExecution:
        """Execute a workflow."""
        import secrets
        
        template = self.get_template(template_id)
        if not template:
            raise ValueError(f"Template not found: {template_id}")
        
        execution = WorkflowExecution(
            execution_id=f"exec_{secrets.token_hex(8)}",
            template_id=template_id,
            status=WorkflowStatus.RUNNING,
            started_at=datetime.utcnow(),
            inputs=inputs
        )
        
        self.executions[execution.execution_id] = execution
        
        try:
            # Build step map
            step_map = {s.step_id: s for s in template.steps}
            
            # Start with first step
            current_steps = [template.steps[0].step_id]
            
            while current_steps:
                next_steps = []
                
                for step_id in current_steps:
                    step = step_map[step_id]
                    execution.current_step = step_id
                    
                    # Get handler
                    handler = self.step_handlers.get(step.step_type)
                    if not handler:
                        raise ValueError(f"No handler for step type: {step.step_type}")
                    
                    # Execute step
                    context = {**inputs, **execution.step_results}
                    result = await handler(step, context)
                    
                    execution.step_results[step_id] = result
                    
                    # Add next steps
                    next_steps.extend(step.next_steps)
                
                current_steps = next_steps
            
            execution.status = WorkflowStatus.COMPLETED
            execution.completed_at = datetime.utcnow()
            execution.outputs = execution.step_results
            
        except Exception as e:
            execution.status = WorkflowStatus.FAILED
            execution.error = str(e)
            logger.error(f"Workflow failed: {e}")
        
        return execution
    
    def get_execution(self, execution_id: str) -> Optional[WorkflowExecution]:
        """Get a workflow execution."""
        return self.executions.get(execution_id)


# ============================================================================
# Main Entry Point
# ============================================================================

async def main():
    """Demo the Workflow Templates."""
    engine = WorkflowEngine()
    
    print("=== Available Workflow Templates ===\n")
    
    for category in ["research", "content", "development", "business", "data"]:
        templates = engine.list_templates(category)
        print(f"\n{category.upper()}:")
        for t in templates:
            print(f"  - {t.name}: {t.description}")
            print(f"    Duration: ~{t.estimated_duration_minutes} min, Tags: {t.tags}")
    
    print("\n\n=== Executing Deep Research Workflow ===\n")
    
    execution = await engine.execute(
        "deep_research",
        {"topic": "AI agents in enterprise", "depth": "comprehensive"}
    )
    
    print(f"Execution ID: {execution.execution_id}")
    print(f"Status: {execution.status.value}")
    print(f"Duration: {(execution.completed_at - execution.started_at).total_seconds():.1f}s")
    print(f"Steps completed: {len(execution.step_results)}")


if __name__ == "__main__":
    asyncio.run(main())
