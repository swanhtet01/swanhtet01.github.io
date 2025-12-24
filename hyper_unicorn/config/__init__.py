"""
HYPER UNICORN Configuration
===========================
Centralized configuration and template system.
"""

from .agent_config import (
    ConfigManager,
    AgentTemplate,
    ModelConfig,
    ToolConfig,
    WorkspaceConfig,
    SystemConfig,
    AgentRole,
    ModelProvider,
    DEFAULT_MODELS,
    DEFAULT_TOOLS,
    DEFAULT_WORKSPACES,
    DEFAULT_AGENT_TEMPLATES
)

__all__ = [
    "ConfigManager",
    "AgentTemplate",
    "ModelConfig",
    "ToolConfig",
    "WorkspaceConfig",
    "SystemConfig",
    "AgentRole",
    "ModelProvider",
    "DEFAULT_MODELS",
    "DEFAULT_TOOLS",
    "DEFAULT_WORKSPACES",
    "DEFAULT_AGENT_TEMPLATES"
]
