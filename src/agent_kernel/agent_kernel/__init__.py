"""Agent Kernel package: minimal, replicable orchestration core.

Components:
- Task model & registry
- Runner (sync + scheduled)
- Adapter layer (LLM, Social APIs, etc.)
- Simple event bus (in-process)

Design Goals:
- Zero heavy deps by default
- Extensible via entry-point style registry (here: explicit dicts)
- Safe secret loading from environment only
"""
from .kernel import AgentKernel, TaskContext
__all__ = ["AgentKernel", "TaskContext"]
