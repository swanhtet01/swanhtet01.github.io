"""
HYPER UNICORN Core
==================
Core components for the AI agent infrastructure.
"""

from .intelligence_fabric import IntelligenceFabric
from .master_control_agent import MasterControlAgent
from .collaboration import CollaborationOrchestrator, MessageBus, SharedMemory, CollaborationPatterns
from .plugin_system import PluginManager, PluginBase, ToolPlugin, AgentPlugin, PluginMarketplace

__all__ = [
    "IntelligenceFabric",
    "MasterControlAgent",
    "CollaborationOrchestrator",
    "MessageBus",
    "SharedMemory",
    "CollaborationPatterns",
    "PluginManager",
    "PluginBase",
    "ToolPlugin",
    "AgentPlugin",
    "PluginMarketplace"
]
