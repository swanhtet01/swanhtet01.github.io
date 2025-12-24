"""
Agent Workspaces Module
========================
Dedicated workspaces for each agent type.
"""

from .workspace_manager import (
    WorkspaceManager,
    Workspace,
    WorkspaceType,
    WorkspaceConfig,
    WORKSPACE_TEMPLATES,
    render_workspace_selector,
    render_workspace_view,
)

__all__ = [
    "WorkspaceManager",
    "Workspace",
    "WorkspaceType",
    "WorkspaceConfig",
    "WORKSPACE_TEMPLATES",
    "render_workspace_selector",
    "render_workspace_view",
]
