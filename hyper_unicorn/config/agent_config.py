"""
Agent Configuration System
==========================
Centralized configuration and template system for HYPER UNICORN agents.

Features:
- Agent templates for common use cases
- Dynamic configuration loading
- Environment-based settings
- Workspace definitions

Author: Manus AI for SuperMega.dev
"""

import os
import json
import yaml
from pathlib import Path
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field, asdict
from enum import Enum


class AgentRole(Enum):
    """Predefined agent roles."""
    RESEARCHER = "researcher"
    DEVELOPER = "developer"
    WRITER = "writer"
    ANALYST = "analyst"
    ASSISTANT = "assistant"
    ORCHESTRATOR = "orchestrator"
    MONITOR = "monitor"
    CUSTOM = "custom"


class ModelProvider(Enum):
    """Supported AI model providers."""
    GEMINI = "gemini"
    ANTHROPIC = "anthropic"
    OPENAI = "openai"
    LOCAL = "local"


@dataclass
class ModelConfig:
    """Configuration for an AI model."""
    provider: str
    model_name: str
    api_key_env: str  # Environment variable name
    max_tokens: int = 4096
    temperature: float = 0.7
    timeout_seconds: int = 120
    cost_per_1k_input: float = 0.0
    cost_per_1k_output: float = 0.0


@dataclass
class ToolConfig:
    """Configuration for a tool."""
    name: str
    enabled: bool = True
    api_key_env: Optional[str] = None
    endpoint: Optional[str] = None
    rate_limit: Optional[int] = None  # requests per minute
    settings: Dict = field(default_factory=dict)


@dataclass
class WorkspaceConfig:
    """Configuration for an agent workspace."""
    name: str
    description: str
    tools: List[str]  # Tool names
    views: List[str]  # Dashboard views
    memory_enabled: bool = True
    sandbox_enabled: bool = True
    max_concurrent_tasks: int = 5


@dataclass
class AgentTemplate:
    """Template for creating agents."""
    name: str
    role: str
    description: str
    system_prompt: str
    models: List[str]  # Model names in priority order
    tools: List[str]
    workspace: str
    capabilities: List[str]
    constraints: List[str]
    default_settings: Dict = field(default_factory=dict)


@dataclass
class SystemConfig:
    """System-wide configuration."""
    instance_name: str = "HYPER UNICORN"
    environment: str = "development"  # development, staging, production
    log_level: str = "INFO"
    
    # Infrastructure
    redis_url: str = "redis://localhost:6379"
    qdrant_url: str = "http://localhost:6333"
    
    # API settings
    api_host: str = "0.0.0.0"
    api_port: int = 8080
    dashboard_port: int = 8501
    monitor_port: int = 8081
    
    # Limits
    max_agents: int = 20
    max_tasks_per_agent: int = 10
    task_timeout_seconds: int = 300
    
    # Cost controls
    daily_budget_usd: float = 50.0
    alert_at_percent: float = 80.0


# =============================================================================
# Default Configurations
# =============================================================================

DEFAULT_MODELS: Dict[str, ModelConfig] = {
    "gemini-flash": ModelConfig(
        provider="gemini",
        model_name="gemini-1.5-flash",
        api_key_env="GEMINI_API_KEY",
        max_tokens=8192,
        temperature=0.7,
        cost_per_1k_input=0.000075,
        cost_per_1k_output=0.0003
    ),
    "gemini-pro": ModelConfig(
        provider="gemini",
        model_name="gemini-1.5-pro",
        api_key_env="GEMINI_API_KEY",
        max_tokens=8192,
        temperature=0.7,
        cost_per_1k_input=0.00125,
        cost_per_1k_output=0.005
    ),
    "claude-haiku": ModelConfig(
        provider="anthropic",
        model_name="claude-3-haiku-20240307",
        api_key_env="ANTHROPIC_API_KEY",
        max_tokens=4096,
        temperature=0.7,
        cost_per_1k_input=0.00025,
        cost_per_1k_output=0.00125
    ),
    "claude-sonnet": ModelConfig(
        provider="anthropic",
        model_name="claude-3-5-sonnet-20241022",
        api_key_env="ANTHROPIC_API_KEY",
        max_tokens=8192,
        temperature=0.7,
        cost_per_1k_input=0.003,
        cost_per_1k_output=0.015
    ),
    "gpt-4-turbo": ModelConfig(
        provider="openai",
        model_name="gpt-4-turbo-preview",
        api_key_env="OPENAI_API_KEY",
        max_tokens=4096,
        temperature=0.7,
        cost_per_1k_input=0.01,
        cost_per_1k_output=0.03
    ),
    "gpt-3.5": ModelConfig(
        provider="openai",
        model_name="gpt-3.5-turbo",
        api_key_env="OPENAI_API_KEY",
        max_tokens=4096,
        temperature=0.7,
        cost_per_1k_input=0.0005,
        cost_per_1k_output=0.0015
    )
}

DEFAULT_TOOLS: Dict[str, ToolConfig] = {
    "tavily": ToolConfig(
        name="tavily",
        api_key_env="TAVILY_API_KEY",
        endpoint="https://api.tavily.com",
        rate_limit=100
    ),
    "exa": ToolConfig(
        name="exa",
        api_key_env="EXA_API_KEY",
        endpoint="https://api.exa.ai",
        rate_limit=100
    ),
    "browser": ToolConfig(
        name="browser",
        settings={"headless": True, "timeout": 30000}
    ),
    "code_sandbox": ToolConfig(
        name="code_sandbox",
        api_key_env="E2B_API_KEY",
        endpoint="https://api.e2b.dev"
    ),
    "github": ToolConfig(
        name="github",
        api_key_env="GITHUB_TOKEN",
        endpoint="https://api.github.com"
    ),
    "gmail": ToolConfig(
        name="gmail",
        settings={"mcp_server": "gmail"}
    ),
    "calendar": ToolConfig(
        name="calendar",
        settings={"mcp_server": "google-calendar"}
    ),
    "drive": ToolConfig(
        name="drive",
        settings={"rclone_config": "/home/ubuntu/.gdrive-rclone.ini"}
    ),
    "polygon": ToolConfig(
        name="polygon",
        api_key_env="POLYGON_API_KEY",
        endpoint="https://api.polygon.io"
    ),
    "elevenlabs": ToolConfig(
        name="elevenlabs",
        api_key_env="ELEVENLABS_API_KEY",
        endpoint="https://api.elevenlabs.io"
    ),
    "stripe": ToolConfig(
        name="stripe",
        api_key_env="STRIPE_SECRET_KEY",
        endpoint="https://api.stripe.com"
    )
}

DEFAULT_WORKSPACES: Dict[str, WorkspaceConfig] = {
    "research": WorkspaceConfig(
        name="research",
        description="Research and analysis workspace",
        tools=["tavily", "exa", "browser", "drive"],
        views=["search_results", "source_analysis", "report_builder"],
        memory_enabled=True
    ),
    "development": WorkspaceConfig(
        name="development",
        description="Software development workspace",
        tools=["code_sandbox", "github", "browser"],
        views=["code_editor", "terminal", "git_history"],
        memory_enabled=True,
        sandbox_enabled=True
    ),
    "content": WorkspaceConfig(
        name="content",
        description="Content creation workspace",
        tools=["browser", "drive", "elevenlabs"],
        views=["document_editor", "media_library", "publish_queue"],
        memory_enabled=True
    ),
    "communication": WorkspaceConfig(
        name="communication",
        description="Communication and scheduling workspace",
        tools=["gmail", "calendar", "drive"],
        views=["inbox", "calendar_view", "contacts"],
        memory_enabled=True
    ),
    "analytics": WorkspaceConfig(
        name="analytics",
        description="Data analysis workspace",
        tools=["polygon", "browser", "drive"],
        views=["data_explorer", "chart_builder", "dashboard"],
        memory_enabled=True
    ),
    "orchestration": WorkspaceConfig(
        name="orchestration",
        description="Agent orchestration workspace",
        tools=["gmail", "calendar", "drive", "github"],
        views=["agent_status", "task_queue", "metrics"],
        memory_enabled=True,
        max_concurrent_tasks=20
    )
}

DEFAULT_AGENT_TEMPLATES: Dict[str, AgentTemplate] = {
    "research_analyst": AgentTemplate(
        name="Research Analyst",
        role="researcher",
        description="Conducts deep research, analyzes information, and produces comprehensive reports.",
        system_prompt="""You are a Research Analyst agent. Your role is to:
1. Conduct thorough research on assigned topics
2. Analyze information from multiple sources
3. Synthesize findings into clear, actionable insights
4. Produce well-structured reports with citations

Always verify information from multiple sources. Be objective and highlight uncertainties.
When researching, use the available search tools systematically.""",
        models=["gemini-flash", "claude-haiku"],
        tools=["tavily", "exa", "browser", "drive"],
        workspace="research",
        capabilities=[
            "web_search",
            "content_extraction",
            "report_generation",
            "fact_verification"
        ],
        constraints=[
            "Always cite sources",
            "Verify claims from multiple sources",
            "Flag uncertain information"
        ]
    ),
    "software_developer": AgentTemplate(
        name="Software Developer",
        role="developer",
        description="Writes, reviews, and debugs code across multiple languages.",
        system_prompt="""You are a Software Developer agent. Your role is to:
1. Write clean, efficient, and well-documented code
2. Review code for bugs, security issues, and improvements
3. Debug and fix issues in existing code
4. Generate tests and documentation

Follow best practices for the target language. Prioritize readability and maintainability.
Always test code before considering it complete.""",
        models=["claude-sonnet", "gpt-4-turbo"],
        tools=["code_sandbox", "github", "browser"],
        workspace="development",
        capabilities=[
            "code_generation",
            "code_review",
            "debugging",
            "test_generation",
            "documentation"
        ],
        constraints=[
            "Follow language best practices",
            "Include error handling",
            "Write tests for new code",
            "Document public APIs"
        ]
    ),
    "content_writer": AgentTemplate(
        name="Content Writer",
        role="writer",
        description="Creates high-quality written content for various purposes.",
        system_prompt="""You are a Content Writer agent. Your role is to:
1. Create engaging, well-structured content
2. Adapt tone and style for different audiences
3. Optimize content for SEO when appropriate
4. Edit and improve existing content

Write with clarity and purpose. Understand the target audience and adjust accordingly.
Use active voice and concrete examples.""",
        models=["gemini-flash", "claude-haiku"],
        tools=["browser", "drive"],
        workspace="content",
        capabilities=[
            "article_writing",
            "copywriting",
            "editing",
            "seo_optimization"
        ],
        constraints=[
            "Match requested tone",
            "Avoid plagiarism",
            "Cite sources when appropriate"
        ]
    ),
    "data_analyst": AgentTemplate(
        name="Data Analyst",
        role="analyst",
        description="Analyzes data, creates visualizations, and provides insights.",
        system_prompt="""You are a Data Analyst agent. Your role is to:
1. Analyze structured and unstructured data
2. Create clear visualizations
3. Identify patterns and trends
4. Provide actionable insights

Be rigorous in your analysis. Clearly state assumptions and limitations.
Use appropriate statistical methods and visualizations.""",
        models=["gemini-pro", "claude-sonnet"],
        tools=["polygon", "browser", "drive", "code_sandbox"],
        workspace="analytics",
        capabilities=[
            "data_analysis",
            "visualization",
            "statistical_analysis",
            "trend_identification"
        ],
        constraints=[
            "State assumptions clearly",
            "Use appropriate methods",
            "Validate data quality"
        ]
    ),
    "executive_assistant": AgentTemplate(
        name="Executive Assistant",
        role="assistant",
        description="Manages communications, scheduling, and administrative tasks.",
        system_prompt="""You are an Executive Assistant agent. Your role is to:
1. Manage email communications
2. Schedule meetings and events
3. Organize files and documents
4. Handle administrative tasks

Be proactive and anticipate needs. Maintain confidentiality.
Communicate clearly and professionally.""",
        models=["gemini-flash", "gpt-3.5"],
        tools=["gmail", "calendar", "drive"],
        workspace="communication",
        capabilities=[
            "email_management",
            "scheduling",
            "file_organization",
            "task_management"
        ],
        constraints=[
            "Maintain confidentiality",
            "Confirm before sending",
            "Follow communication protocols"
        ]
    ),
    "master_orchestrator": AgentTemplate(
        name="Master Orchestrator",
        role="orchestrator",
        description="Coordinates other agents, manages workflows, and ensures task completion.",
        system_prompt="""You are the Master Orchestrator agent. Your role is to:
1. Break down complex tasks into subtasks
2. Assign tasks to appropriate specialized agents
3. Monitor progress and handle failures
4. Synthesize results from multiple agents

Think strategically about task decomposition. Monitor agent performance.
Ensure quality and completeness of final outputs.""",
        models=["claude-sonnet", "gemini-pro"],
        tools=["gmail", "calendar", "drive", "github"],
        workspace="orchestration",
        capabilities=[
            "task_decomposition",
            "agent_coordination",
            "workflow_management",
            "quality_assurance"
        ],
        constraints=[
            "Verify task completion",
            "Handle failures gracefully",
            "Optimize resource usage"
        ],
        default_settings={
            "max_retries": 3,
            "parallel_tasks": True,
            "auto_escalate": True
        }
    )
}


# =============================================================================
# Configuration Manager
# =============================================================================

class ConfigManager:
    """Manages all configurations for the HYPER UNICORN system."""
    
    def __init__(self, config_dir: Optional[str] = None):
        self.config_dir = Path(config_dir) if config_dir else Path.home() / ".hyper_unicorn"
        self.config_dir.mkdir(parents=True, exist_ok=True)
        
        # Load or initialize configs
        self.system = self._load_system_config()
        self.models = self._load_models()
        self.tools = self._load_tools()
        self.workspaces = self._load_workspaces()
        self.templates = self._load_templates()
    
    def _load_system_config(self) -> SystemConfig:
        """Load system configuration."""
        config_file = self.config_dir / "system.yaml"
        if config_file.exists():
            with open(config_file) as f:
                data = yaml.safe_load(f)
                return SystemConfig(**data)
        return SystemConfig()
    
    def _load_models(self) -> Dict[str, ModelConfig]:
        """Load model configurations."""
        config_file = self.config_dir / "models.yaml"
        if config_file.exists():
            with open(config_file) as f:
                data = yaml.safe_load(f)
                return {k: ModelConfig(**v) for k, v in data.items()}
        return DEFAULT_MODELS.copy()
    
    def _load_tools(self) -> Dict[str, ToolConfig]:
        """Load tool configurations."""
        config_file = self.config_dir / "tools.yaml"
        if config_file.exists():
            with open(config_file) as f:
                data = yaml.safe_load(f)
                return {k: ToolConfig(**v) for k, v in data.items()}
        return DEFAULT_TOOLS.copy()
    
    def _load_workspaces(self) -> Dict[str, WorkspaceConfig]:
        """Load workspace configurations."""
        config_file = self.config_dir / "workspaces.yaml"
        if config_file.exists():
            with open(config_file) as f:
                data = yaml.safe_load(f)
                return {k: WorkspaceConfig(**v) for k, v in data.items()}
        return DEFAULT_WORKSPACES.copy()
    
    def _load_templates(self) -> Dict[str, AgentTemplate]:
        """Load agent templates."""
        config_file = self.config_dir / "templates.yaml"
        if config_file.exists():
            with open(config_file) as f:
                data = yaml.safe_load(f)
                return {k: AgentTemplate(**v) for k, v in data.items()}
        return DEFAULT_AGENT_TEMPLATES.copy()
    
    def save_all(self):
        """Save all configurations to files."""
        # System config
        with open(self.config_dir / "system.yaml", "w") as f:
            yaml.dump(asdict(self.system), f, default_flow_style=False)
        
        # Models
        with open(self.config_dir / "models.yaml", "w") as f:
            yaml.dump({k: asdict(v) for k, v in self.models.items()}, f, default_flow_style=False)
        
        # Tools
        with open(self.config_dir / "tools.yaml", "w") as f:
            yaml.dump({k: asdict(v) for k, v in self.tools.items()}, f, default_flow_style=False)
        
        # Workspaces
        with open(self.config_dir / "workspaces.yaml", "w") as f:
            yaml.dump({k: asdict(v) for k, v in self.workspaces.items()}, f, default_flow_style=False)
        
        # Templates
        with open(self.config_dir / "templates.yaml", "w") as f:
            yaml.dump({k: asdict(v) for k, v in self.templates.items()}, f, default_flow_style=False)
    
    def get_model(self, name: str) -> Optional[ModelConfig]:
        """Get a model configuration by name."""
        return self.models.get(name)
    
    def get_tool(self, name: str) -> Optional[ToolConfig]:
        """Get a tool configuration by name."""
        return self.tools.get(name)
    
    def get_workspace(self, name: str) -> Optional[WorkspaceConfig]:
        """Get a workspace configuration by name."""
        return self.workspaces.get(name)
    
    def get_template(self, name: str) -> Optional[AgentTemplate]:
        """Get an agent template by name."""
        return self.templates.get(name)
    
    def create_agent_from_template(
        self,
        template_name: str,
        agent_id: str,
        custom_settings: Optional[Dict] = None
    ) -> Dict:
        """Create an agent configuration from a template."""
        template = self.get_template(template_name)
        if not template:
            raise ValueError(f"Unknown template: {template_name}")
        
        # Build agent config
        config = {
            "agent_id": agent_id,
            "name": template.name,
            "role": template.role,
            "description": template.description,
            "system_prompt": template.system_prompt,
            "models": [asdict(self.get_model(m)) for m in template.models if self.get_model(m)],
            "tools": [asdict(self.get_tool(t)) for t in template.tools if self.get_tool(t)],
            "workspace": asdict(self.get_workspace(template.workspace)) if self.get_workspace(template.workspace) else None,
            "capabilities": template.capabilities,
            "constraints": template.constraints,
            "settings": {**template.default_settings, **(custom_settings or {})}
        }
        
        return config
    
    def list_templates(self) -> List[Dict]:
        """List all available templates."""
        return [
            {
                "name": k,
                "role": v.role,
                "description": v.description,
                "capabilities": v.capabilities
            }
            for k, v in self.templates.items()
        ]
    
    def export_config(self) -> Dict:
        """Export all configurations as a dictionary."""
        return {
            "system": asdict(self.system),
            "models": {k: asdict(v) for k, v in self.models.items()},
            "tools": {k: asdict(v) for k, v in self.tools.items()},
            "workspaces": {k: asdict(v) for k, v in self.workspaces.items()},
            "templates": {k: asdict(v) for k, v in self.templates.items()}
        }


# =============================================================================
# CLI
# =============================================================================

if __name__ == "__main__":
    import sys
    
    config = ConfigManager()
    
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python agent_config.py list-templates")
        print("  python agent_config.py show-template <name>")
        print("  python agent_config.py create-agent <template> <agent_id>")
        print("  python agent_config.py export")
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "list-templates":
        templates = config.list_templates()
        print("\nAvailable Agent Templates:")
        print("-" * 50)
        for t in templates:
            print(f"\n{t['name']} ({t['role']})")
            print(f"  {t['description']}")
            print(f"  Capabilities: {', '.join(t['capabilities'])}")
    
    elif command == "show-template":
        name = sys.argv[2]
        template = config.get_template(name)
        if template:
            print(json.dumps(asdict(template), indent=2))
        else:
            print(f"Template not found: {name}")
    
    elif command == "create-agent":
        template_name = sys.argv[2]
        agent_id = sys.argv[3]
        agent_config = config.create_agent_from_template(template_name, agent_id)
        print(json.dumps(agent_config, indent=2))
    
    elif command == "export":
        print(json.dumps(config.export_config(), indent=2))
    
    else:
        print(f"Unknown command: {command}")
