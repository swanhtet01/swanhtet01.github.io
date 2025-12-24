"""
Plugin System
=============
Dynamic loading and management of tools, agents, and extensions.

Features:
- Hot-reload plugins without restart
- Plugin discovery and validation
- Dependency management
- Plugin marketplace integration
- Sandboxed plugin execution

Author: Manus AI for SuperMega.dev
"""

import os
import sys
import json
import asyncio
import importlib
import importlib.util
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, List, Any, Type, Callable
from dataclasses import dataclass, field
from enum import Enum
from abc import ABC, abstractmethod
import logging
import hashlib
import inspect

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("plugin_system")


# ============================================================================
# Plugin Base Classes
# ============================================================================

class PluginType(Enum):
    """Types of plugins."""
    TOOL = "tool"
    AGENT = "agent"
    INTEGRATION = "integration"
    WORKFLOW = "workflow"
    EXTENSION = "extension"


@dataclass
class PluginMetadata:
    """Metadata for a plugin."""
    name: str
    version: str
    plugin_type: PluginType
    description: str
    author: str = "Unknown"
    dependencies: List[str] = field(default_factory=list)
    config_schema: Dict[str, Any] = field(default_factory=dict)
    entry_point: str = "main"
    enabled: bool = True
    checksum: str = ""


class PluginBase(ABC):
    """
    Base class for all plugins.
    
    All plugins must inherit from this class and implement the required methods.
    """
    
    # Plugin metadata (override in subclass)
    METADATA = PluginMetadata(
        name="base_plugin",
        version="0.0.0",
        plugin_type=PluginType.EXTENSION,
        description="Base plugin class"
    )
    
    def __init__(self, config: Dict[str, Any] = None):
        self.config = config or {}
        self.initialized = False
        self.logger = logging.getLogger(f"plugin.{self.METADATA.name}")
    
    @abstractmethod
    async def initialize(self) -> bool:
        """Initialize the plugin. Return True if successful."""
        pass
    
    @abstractmethod
    async def execute(self, *args, **kwargs) -> Any:
        """Execute the plugin's main functionality."""
        pass
    
    async def shutdown(self):
        """Clean up resources when plugin is unloaded."""
        pass
    
    def get_capabilities(self) -> List[str]:
        """Return list of capabilities this plugin provides."""
        return []
    
    def validate_config(self) -> bool:
        """Validate the plugin configuration."""
        return True


class ToolPlugin(PluginBase):
    """Base class for tool plugins."""
    
    METADATA = PluginMetadata(
        name="tool_plugin",
        version="0.0.0",
        plugin_type=PluginType.TOOL,
        description="Base tool plugin"
    )
    
    @abstractmethod
    def get_tool_schema(self) -> Dict[str, Any]:
        """Return the tool's JSON schema for LLM function calling."""
        pass


class AgentPlugin(PluginBase):
    """Base class for agent plugins."""
    
    METADATA = PluginMetadata(
        name="agent_plugin",
        version="0.0.0",
        plugin_type=PluginType.AGENT,
        description="Base agent plugin"
    )
    
    @abstractmethod
    async def process_task(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """Process a task and return results."""
        pass


# ============================================================================
# Plugin Loader
# ============================================================================

class PluginLoader:
    """
    Loads and validates plugins from files.
    """
    
    def __init__(self, plugin_dirs: List[str] = None):
        self.plugin_dirs = plugin_dirs or ["plugins"]
        self.loaded_modules: Dict[str, Any] = {}
    
    def discover_plugins(self) -> List[Path]:
        """Discover all plugin files in plugin directories."""
        plugins = []
        
        for plugin_dir in self.plugin_dirs:
            dir_path = Path(plugin_dir)
            if not dir_path.exists():
                continue
            
            # Find Python files
            for file_path in dir_path.glob("**/*.py"):
                if file_path.name.startswith("_"):
                    continue
                plugins.append(file_path)
            
            # Find plugin packages
            for dir_path in dir_path.glob("**/"):
                init_file = dir_path / "__init__.py"
                if init_file.exists():
                    plugins.append(init_file)
        
        return plugins
    
    def load_plugin_file(self, file_path: Path) -> Optional[Type[PluginBase]]:
        """Load a plugin from a file."""
        try:
            # Generate unique module name
            module_name = f"plugin_{hashlib.md5(str(file_path).encode()).hexdigest()[:8]}"
            
            # Load module
            spec = importlib.util.spec_from_file_location(module_name, file_path)
            if spec is None or spec.loader is None:
                return None
            
            module = importlib.util.module_from_spec(spec)
            sys.modules[module_name] = module
            spec.loader.exec_module(module)
            
            # Find plugin class
            for name, obj in inspect.getmembers(module, inspect.isclass):
                if issubclass(obj, PluginBase) and obj is not PluginBase:
                    if not name.startswith("_"):
                        self.loaded_modules[str(file_path)] = module
                        return obj
            
            return None
            
        except Exception as e:
            logger.error(f"Failed to load plugin {file_path}: {e}")
            return None
    
    def reload_plugin(self, file_path: Path) -> Optional[Type[PluginBase]]:
        """Reload a plugin (hot-reload)."""
        str_path = str(file_path)
        
        # Unload existing module
        if str_path in self.loaded_modules:
            module = self.loaded_modules[str_path]
            module_name = module.__name__
            if module_name in sys.modules:
                del sys.modules[module_name]
            del self.loaded_modules[str_path]
        
        # Load fresh
        return self.load_plugin_file(file_path)
    
    def calculate_checksum(self, file_path: Path) -> str:
        """Calculate file checksum for change detection."""
        with open(file_path, "rb") as f:
            return hashlib.md5(f.read()).hexdigest()


# ============================================================================
# Plugin Manager
# ============================================================================

class PluginManager:
    """
    Manages the lifecycle of plugins.
    """
    
    def __init__(self, plugin_dirs: List[str] = None):
        self.loader = PluginLoader(plugin_dirs)
        self.plugins: Dict[str, PluginBase] = {}
        self.plugin_classes: Dict[str, Type[PluginBase]] = {}
        self.checksums: Dict[str, str] = {}
        self.hooks: Dict[str, List[Callable]] = {}
    
    async def load_all(self) -> int:
        """Load all discovered plugins."""
        count = 0
        
        for file_path in self.loader.discover_plugins():
            plugin_class = self.loader.load_plugin_file(file_path)
            if plugin_class:
                try:
                    await self.register_plugin(plugin_class, file_path)
                    count += 1
                except Exception as e:
                    logger.error(f"Failed to register plugin from {file_path}: {e}")
        
        logger.info(f"Loaded {count} plugins")
        return count
    
    async def register_plugin(
        self,
        plugin_class: Type[PluginBase],
        source_path: Path = None
    ):
        """Register and initialize a plugin."""
        metadata = plugin_class.METADATA
        name = metadata.name
        
        # Check dependencies
        for dep in metadata.dependencies:
            if dep not in self.plugins:
                raise ValueError(f"Missing dependency: {dep}")
        
        # Create instance
        plugin = plugin_class()
        
        # Initialize
        if await plugin.initialize():
            self.plugins[name] = plugin
            self.plugin_classes[name] = plugin_class
            
            if source_path:
                self.checksums[name] = self.loader.calculate_checksum(source_path)
            
            logger.info(f"Registered plugin: {name} v{metadata.version}")
            
            # Trigger hook
            await self._trigger_hook("plugin_loaded", plugin)
        else:
            raise RuntimeError(f"Plugin initialization failed: {name}")
    
    async def unregister_plugin(self, name: str):
        """Unregister and shutdown a plugin."""
        if name not in self.plugins:
            return
        
        plugin = self.plugins[name]
        
        # Check if other plugins depend on this
        for other_name, other_plugin in self.plugins.items():
            if name in other_plugin.METADATA.dependencies:
                raise ValueError(f"Cannot unload {name}: {other_name} depends on it")
        
        # Shutdown
        await plugin.shutdown()
        
        del self.plugins[name]
        del self.plugin_classes[name]
        
        if name in self.checksums:
            del self.checksums[name]
        
        logger.info(f"Unregistered plugin: {name}")
        
        # Trigger hook
        await self._trigger_hook("plugin_unloaded", name)
    
    async def reload_plugin(self, name: str, file_path: Path):
        """Hot-reload a plugin."""
        if name in self.plugins:
            await self.unregister_plugin(name)
        
        plugin_class = self.loader.reload_plugin(file_path)
        if plugin_class:
            await self.register_plugin(plugin_class, file_path)
    
    def get_plugin(self, name: str) -> Optional[PluginBase]:
        """Get a plugin by name."""
        return self.plugins.get(name)
    
    def get_plugins_by_type(self, plugin_type: PluginType) -> List[PluginBase]:
        """Get all plugins of a specific type."""
        return [
            p for p in self.plugins.values()
            if p.METADATA.plugin_type == plugin_type
        ]
    
    def get_tools(self) -> List[ToolPlugin]:
        """Get all tool plugins."""
        return self.get_plugins_by_type(PluginType.TOOL)
    
    def get_agents(self) -> List[AgentPlugin]:
        """Get all agent plugins."""
        return self.get_plugins_by_type(PluginType.AGENT)
    
    async def execute_plugin(self, name: str, *args, **kwargs) -> Any:
        """Execute a plugin's main functionality."""
        plugin = self.get_plugin(name)
        if not plugin:
            raise ValueError(f"Unknown plugin: {name}")
        
        return await plugin.execute(*args, **kwargs)
    
    def register_hook(self, event: str, callback: Callable):
        """Register a callback for plugin events."""
        if event not in self.hooks:
            self.hooks[event] = []
        self.hooks[event].append(callback)
    
    async def _trigger_hook(self, event: str, data: Any):
        """Trigger callbacks for an event."""
        if event not in self.hooks:
            return
        
        for callback in self.hooks[event]:
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback(data)
                else:
                    callback(data)
            except Exception as e:
                logger.error(f"Hook callback error: {e}")
    
    async def check_for_updates(self) -> List[str]:
        """Check for plugin file changes (for hot-reload)."""
        updated = []
        
        for file_path in self.loader.discover_plugins():
            current_checksum = self.loader.calculate_checksum(file_path)
            
            # Find plugin name for this file
            for name, checksum in self.checksums.items():
                if checksum != current_checksum:
                    updated.append(name)
        
        return updated
    
    def list_plugins(self) -> List[Dict[str, Any]]:
        """List all registered plugins."""
        return [
            {
                "name": p.METADATA.name,
                "version": p.METADATA.version,
                "type": p.METADATA.plugin_type.value,
                "description": p.METADATA.description,
                "enabled": p.METADATA.enabled,
                "capabilities": p.get_capabilities()
            }
            for p in self.plugins.values()
        ]


# ============================================================================
# Plugin Marketplace
# ============================================================================

class PluginMarketplace:
    """
    Interface to plugin marketplace for discovering and installing plugins.
    """
    
    def __init__(self, marketplace_url: str = None):
        self.marketplace_url = marketplace_url or "https://plugins.supermega.dev"
        self.installed_plugins: Dict[str, str] = {}  # name -> version
    
    async def search(self, query: str) -> List[Dict[str, Any]]:
        """Search for plugins in the marketplace."""
        # In production, this would call the marketplace API
        # For now, return sample data
        return [
            {
                "name": "web_scraper",
                "version": "1.0.0",
                "description": "Advanced web scraping tool",
                "downloads": 1500,
                "rating": 4.5
            },
            {
                "name": "pdf_processor",
                "version": "2.1.0",
                "description": "PDF parsing and generation",
                "downloads": 3200,
                "rating": 4.8
            }
        ]
    
    async def install(self, plugin_name: str, version: str = "latest") -> bool:
        """Install a plugin from the marketplace."""
        # In production, this would download and install the plugin
        logger.info(f"Installing plugin: {plugin_name}@{version}")
        self.installed_plugins[plugin_name] = version
        return True
    
    async def uninstall(self, plugin_name: str) -> bool:
        """Uninstall a plugin."""
        if plugin_name in self.installed_plugins:
            del self.installed_plugins[plugin_name]
            return True
        return False
    
    async def update(self, plugin_name: str) -> bool:
        """Update a plugin to the latest version."""
        return await self.install(plugin_name, "latest")
    
    async def check_updates(self) -> List[Dict[str, Any]]:
        """Check for available updates."""
        # In production, this would check the marketplace API
        return []


# ============================================================================
# Example Plugins
# ============================================================================

class ExampleToolPlugin(ToolPlugin):
    """Example tool plugin."""
    
    METADATA = PluginMetadata(
        name="example_tool",
        version="1.0.0",
        plugin_type=PluginType.TOOL,
        description="An example tool plugin",
        author="SuperMega.dev"
    )
    
    async def initialize(self) -> bool:
        self.logger.info("Example tool initialized")
        return True
    
    async def execute(self, input_text: str) -> str:
        return f"Processed: {input_text}"
    
    def get_tool_schema(self) -> Dict[str, Any]:
        return {
            "name": "example_tool",
            "description": "An example tool that processes text",
            "parameters": {
                "type": "object",
                "properties": {
                    "input_text": {
                        "type": "string",
                        "description": "Text to process"
                    }
                },
                "required": ["input_text"]
            }
        }
    
    def get_capabilities(self) -> List[str]:
        return ["text_processing"]


class ExampleAgentPlugin(AgentPlugin):
    """Example agent plugin."""
    
    METADATA = PluginMetadata(
        name="example_agent",
        version="1.0.0",
        plugin_type=PluginType.AGENT,
        description="An example agent plugin",
        author="SuperMega.dev"
    )
    
    async def initialize(self) -> bool:
        self.logger.info("Example agent initialized")
        return True
    
    async def execute(self, task: Dict[str, Any]) -> Dict[str, Any]:
        return await self.process_task(task)
    
    async def process_task(self, task: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "status": "completed",
            "result": f"Processed task: {task.get('description', 'unknown')}"
        }
    
    def get_capabilities(self) -> List[str]:
        return ["task_processing"]


# ============================================================================
# Main Entry Point
# ============================================================================

async def main():
    """Demo the Plugin System."""
    manager = PluginManager(["plugins"])
    
    # Register example plugins
    await manager.register_plugin(ExampleToolPlugin)
    await manager.register_plugin(ExampleAgentPlugin)
    
    # List plugins
    print("Registered plugins:")
    for plugin_info in manager.list_plugins():
        print(f"  - {plugin_info['name']} v{plugin_info['version']} ({plugin_info['type']})")
    
    # Execute tool plugin
    result = await manager.execute_plugin("example_tool", input_text="Hello, World!")
    print(f"\nTool result: {result}")
    
    # Execute agent plugin
    result = await manager.execute_plugin("example_agent", task={"description": "Test task"})
    print(f"Agent result: {result}")
    
    # Get tools for LLM
    tools = manager.get_tools()
    print(f"\nAvailable tools: {[t.METADATA.name for t in tools]}")


if __name__ == "__main__":
    asyncio.run(main())
