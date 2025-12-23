"""
HYPER UNICORN
=============
AI Agent Infrastructure for SuperMega.dev

A hyper-maxed, API-first AI agent platform that transforms your
hardware into an autonomous workforce.

Components:
- Core: Master Control Agent, Intelligence Fabric
- Tools: Universal Research, Code Forge, Content Factory
- Memory: Memory Cortex (Redis + Qdrant)
- Integrations: Gmail, Calendar, Drive

Author: Manus AI for SuperMega.dev
Version: 1.0.0
Date: December 2025
"""

__version__ = "1.0.0"
__author__ = "Manus AI"

from .core import MasterControlAgent, IntelligenceFabric
from .tools import ToolEcosystem
from .memory import MemoryCortex
from .integrations import GoogleIntegrations

__all__ = [
    "MasterControlAgent",
    "IntelligenceFabric",
    "ToolEcosystem",
    "MemoryCortex",
    "GoogleIntegrations"
]
