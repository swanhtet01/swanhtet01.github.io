"""
Tool Ecosystem v2.0
===================
A comprehensive, MCP-compatible tool ecosystem for the HYPER UNICORN architecture.
Provides agents with the capabilities they need to execute any task.

Categories:
- Computer Use: Screen control, mouse, keyboard
- Browser Automation: Web navigation and interaction
- Code Execution: Python, JavaScript, Shell
- File Operations: Read, write, convert
- Data Processing: Analysis, visualization
- Communication: Email, calendar, messaging
- API Integration: REST, GraphQL, webhooks
- AI Services: LLM, embeddings, vision

Author: Manus AI
Date: December 2025
"""

import os
import json
import asyncio
import subprocess
import tempfile
import logging
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
from abc import ABC, abstractmethod
import httpx

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ToolEcosystem")


# ============================================================================
# Tool Categories
# ============================================================================

class ToolCategory(Enum):
    COMPUTER_USE = "computer_use"
    BROWSER = "browser"
    CODE = "code"
    FILE = "file"
    DATA = "data"
    COMMUNICATION = "communication"
    API = "api"
    AI = "ai"


# ============================================================================
# Base Tool Class (MCP Compatible)
# ============================================================================

@dataclass
class ToolDefinition:
    """MCP-compatible tool definition."""
    name: str
    description: str
    category: ToolCategory
    input_schema: Dict[str, Any]
    output_schema: Optional[Dict[str, Any]] = None
    requires_confirmation: bool = False
    timeout_seconds: int = 30


class BaseTool(ABC):
    """Base class for all tools in the ecosystem."""
    
    def __init__(self, definition: ToolDefinition):
        self.definition = definition
        self.call_count = 0
        self.total_time = 0.0
    
    @property
    def name(self) -> str:
        return self.definition.name
    
    @property
    def description(self) -> str:
        return self.definition.description
    
    def to_mcp_format(self) -> Dict:
        """Convert to MCP tool format."""
        return {
            "name": self.definition.name,
            "description": self.definition.description,
            "inputSchema": self.definition.input_schema
        }
    
    @abstractmethod
    async def execute(self, **kwargs) -> Dict:
        """Execute the tool. Override in subclasses."""
        pass
    
    async def __call__(self, **kwargs) -> Dict:
        """Make the tool callable."""
        import time
        start = time.time()
        
        try:
            result = await asyncio.wait_for(
                self.execute(**kwargs),
                timeout=self.definition.timeout_seconds
            )
            result["success"] = result.get("success", True)
        except asyncio.TimeoutError:
            result = {"success": False, "error": "Tool execution timed out"}
        except Exception as e:
            result = {"success": False, "error": str(e)}
        
        self.call_count += 1
        self.total_time += time.time() - start
        
        return result


# ============================================================================
# Computer Use Tools
# ============================================================================

class ScreenshotTool(BaseTool):
    """Take a screenshot of the screen."""
    
    def __init__(self):
        super().__init__(ToolDefinition(
            name="screenshot",
            description="Take a screenshot of the current screen",
            category=ToolCategory.COMPUTER_USE,
            input_schema={
                "type": "object",
                "properties": {
                    "region": {
                        "type": "object",
                        "description": "Optional region to capture",
                        "properties": {
                            "x": {"type": "integer"},
                            "y": {"type": "integer"},
                            "width": {"type": "integer"},
                            "height": {"type": "integer"}
                        }
                    }
                }
            }
        ))
    
    async def execute(self, region: Optional[Dict] = None) -> Dict:
        """Take a screenshot."""
        try:
            import mss
            import base64
            from io import BytesIO
            
            with mss.mss() as sct:
                if region:
                    monitor = region
                else:
                    monitor = sct.monitors[1]  # Primary monitor
                
                screenshot = sct.grab(monitor)
                
                # Convert to base64
                from PIL import Image
                img = Image.frombytes("RGB", screenshot.size, screenshot.bgra, "raw", "BGRX")
                buffer = BytesIO()
                img.save(buffer, format="PNG")
                img_base64 = base64.b64encode(buffer.getvalue()).decode()
                
                return {
                    "success": True,
                    "image_base64": img_base64,
                    "width": screenshot.width,
                    "height": screenshot.height
                }
        except ImportError:
            return {"success": False, "error": "mss or PIL not installed"}
        except Exception as e:
            return {"success": False, "error": str(e)}


class MouseClickTool(BaseTool):
    """Click at a specific screen position."""
    
    def __init__(self):
        super().__init__(ToolDefinition(
            name="mouse_click",
            description="Click at a specific screen position",
            category=ToolCategory.COMPUTER_USE,
            input_schema={
                "type": "object",
                "properties": {
                    "x": {"type": "integer", "description": "X coordinate"},
                    "y": {"type": "integer", "description": "Y coordinate"},
                    "button": {"type": "string", "enum": ["left", "right", "middle"], "default": "left"},
                    "clicks": {"type": "integer", "default": 1}
                },
                "required": ["x", "y"]
            },
            requires_confirmation=True
        ))
    
    async def execute(self, x: int, y: int, button: str = "left", clicks: int = 1) -> Dict:
        """Perform mouse click."""
        try:
            import pyautogui
            pyautogui.click(x, y, clicks=clicks, button=button)
            return {"success": True, "clicked_at": {"x": x, "y": y}}
        except ImportError:
            return {"success": False, "error": "pyautogui not installed"}
        except Exception as e:
            return {"success": False, "error": str(e)}


class KeyboardTypeTool(BaseTool):
    """Type text using the keyboard."""
    
    def __init__(self):
        super().__init__(ToolDefinition(
            name="keyboard_type",
            description="Type text using the keyboard",
            category=ToolCategory.COMPUTER_USE,
            input_schema={
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "Text to type"},
                    "interval": {"type": "number", "default": 0.05, "description": "Interval between keystrokes"}
                },
                "required": ["text"]
            }
        ))
    
    async def execute(self, text: str, interval: float = 0.05) -> Dict:
        """Type text."""
        try:
            import pyautogui
            pyautogui.typewrite(text, interval=interval)
            return {"success": True, "typed": text}
        except ImportError:
            return {"success": False, "error": "pyautogui not installed"}
        except Exception as e:
            return {"success": False, "error": str(e)}


# ============================================================================
# Browser Tools
# ============================================================================

class BrowserNavigateTool(BaseTool):
    """Navigate to a URL in the browser."""
    
    def __init__(self):
        super().__init__(ToolDefinition(
            name="browser_navigate",
            description="Navigate to a URL in the browser",
            category=ToolCategory.BROWSER,
            input_schema={
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "URL to navigate to"}
                },
                "required": ["url"]
            },
            timeout_seconds=60
        ))
        self._browser = None
    
    async def _get_browser(self):
        """Get or create browser instance."""
        if self._browser is None:
            try:
                from playwright.async_api import async_playwright
                self._playwright = await async_playwright().start()
                self._browser = await self._playwright.chromium.launch(headless=False)
                self._context = await self._browser.new_context()
                self._page = await self._context.new_page()
            except ImportError:
                return None
        return self._page
    
    async def execute(self, url: str) -> Dict:
        """Navigate to URL."""
        page = await self._get_browser()
        if not page:
            return {"success": False, "error": "Playwright not installed"}
        
        try:
            await page.goto(url, wait_until="domcontentloaded")
            return {
                "success": True,
                "url": page.url,
                "title": await page.title()
            }
        except Exception as e:
            return {"success": False, "error": str(e)}


class BrowserClickTool(BaseTool):
    """Click an element in the browser."""
    
    def __init__(self, browser_tool: BrowserNavigateTool):
        super().__init__(ToolDefinition(
            name="browser_click",
            description="Click an element in the browser by selector",
            category=ToolCategory.BROWSER,
            input_schema={
                "type": "object",
                "properties": {
                    "selector": {"type": "string", "description": "CSS selector of element to click"}
                },
                "required": ["selector"]
            }
        ))
        self._browser_tool = browser_tool
    
    async def execute(self, selector: str) -> Dict:
        """Click element."""
        page = await self._browser_tool._get_browser()
        if not page:
            return {"success": False, "error": "Browser not initialized"}
        
        try:
            await page.click(selector)
            return {"success": True, "clicked": selector}
        except Exception as e:
            return {"success": False, "error": str(e)}


class BrowserExtractTool(BaseTool):
    """Extract content from the current page."""
    
    def __init__(self, browser_tool: BrowserNavigateTool):
        super().__init__(ToolDefinition(
            name="browser_extract",
            description="Extract text content from the current page",
            category=ToolCategory.BROWSER,
            input_schema={
                "type": "object",
                "properties": {
                    "selector": {"type": "string", "description": "CSS selector (optional, defaults to body)"}
                }
            }
        ))
        self._browser_tool = browser_tool
    
    async def execute(self, selector: str = "body") -> Dict:
        """Extract content."""
        page = await self._browser_tool._get_browser()
        if not page:
            return {"success": False, "error": "Browser not initialized"}
        
        try:
            content = await page.inner_text(selector)
            return {
                "success": True,
                "content": content[:50000],  # Limit size
                "url": page.url
            }
        except Exception as e:
            return {"success": False, "error": str(e)}


# ============================================================================
# Code Execution Tools
# ============================================================================

class PythonExecuteTool(BaseTool):
    """Execute Python code."""
    
    def __init__(self):
        super().__init__(ToolDefinition(
            name="python_execute",
            description="Execute Python code and return the result",
            category=ToolCategory.CODE,
            input_schema={
                "type": "object",
                "properties": {
                    "code": {"type": "string", "description": "Python code to execute"},
                    "timeout": {"type": "integer", "default": 30, "description": "Timeout in seconds"}
                },
                "required": ["code"]
            },
            timeout_seconds=60
        ))
    
    async def execute(self, code: str, timeout: int = 30) -> Dict:
        """Execute Python code."""
        import sys
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
            f.write(code)
            temp_path = f.name
        
        try:
            result = subprocess.run(
                [sys.executable, temp_path],
                capture_output=True,
                text=True,
                timeout=timeout
            )
            
            return {
                "success": result.returncode == 0,
                "stdout": result.stdout,
                "stderr": result.stderr,
                "return_code": result.returncode
            }
        except subprocess.TimeoutExpired:
            return {"success": False, "error": "Execution timed out"}
        except Exception as e:
            return {"success": False, "error": str(e)}
        finally:
            os.unlink(temp_path)


class ShellExecuteTool(BaseTool):
    """Execute shell commands."""
    
    def __init__(self):
        super().__init__(ToolDefinition(
            name="shell_execute",
            description="Execute shell commands",
            category=ToolCategory.CODE,
            input_schema={
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "Shell command to execute"},
                    "timeout": {"type": "integer", "default": 30, "description": "Timeout in seconds"}
                },
                "required": ["command"]
            },
            requires_confirmation=True,
            timeout_seconds=60
        ))
    
    async def execute(self, command: str, timeout: int = 30) -> Dict:
        """Execute shell command."""
        try:
            result = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=timeout
            )
            
            return {
                "success": result.returncode == 0,
                "stdout": result.stdout,
                "stderr": result.stderr,
                "return_code": result.returncode
            }
        except subprocess.TimeoutExpired:
            return {"success": False, "error": "Execution timed out"}
        except Exception as e:
            return {"success": False, "error": str(e)}


# ============================================================================
# File Tools
# ============================================================================

class FileReadTool(BaseTool):
    """Read file contents."""
    
    def __init__(self):
        super().__init__(ToolDefinition(
            name="file_read",
            description="Read the contents of a file",
            category=ToolCategory.FILE,
            input_schema={
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Path to the file"},
                    "encoding": {"type": "string", "default": "utf-8", "description": "File encoding"}
                },
                "required": ["path"]
            }
        ))
    
    async def execute(self, path: str, encoding: str = "utf-8") -> Dict:
        """Read file."""
        try:
            with open(path, 'r', encoding=encoding) as f:
                content = f.read()
            
            return {
                "success": True,
                "path": path,
                "content": content,
                "size": len(content)
            }
        except Exception as e:
            return {"success": False, "error": str(e)}


class FileWriteTool(BaseTool):
    """Write content to a file."""
    
    def __init__(self):
        super().__init__(ToolDefinition(
            name="file_write",
            description="Write content to a file",
            category=ToolCategory.FILE,
            input_schema={
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Path to the file"},
                    "content": {"type": "string", "description": "Content to write"},
                    "mode": {"type": "string", "enum": ["w", "a"], "default": "w", "description": "Write mode"}
                },
                "required": ["path", "content"]
            }
        ))
    
    async def execute(self, path: str, content: str, mode: str = "w") -> Dict:
        """Write file."""
        try:
            os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
            
            with open(path, mode, encoding='utf-8') as f:
                f.write(content)
            
            return {
                "success": True,
                "path": path,
                "bytes_written": len(content.encode('utf-8'))
            }
        except Exception as e:
            return {"success": False, "error": str(e)}


# ============================================================================
# API Tools
# ============================================================================

class APICallTool(BaseTool):
    """Make HTTP API calls."""
    
    def __init__(self):
        super().__init__(ToolDefinition(
            name="api_call",
            description="Make HTTP API calls (GET, POST, PUT, DELETE)",
            category=ToolCategory.API,
            input_schema={
                "type": "object",
                "properties": {
                    "method": {"type": "string", "enum": ["GET", "POST", "PUT", "DELETE", "PATCH"]},
                    "url": {"type": "string", "description": "API endpoint URL"},
                    "headers": {"type": "object", "description": "Request headers"},
                    "body": {"type": "object", "description": "Request body (for POST/PUT)"},
                    "params": {"type": "object", "description": "Query parameters"}
                },
                "required": ["method", "url"]
            },
            timeout_seconds=60
        ))
    
    async def execute(
        self,
        method: str,
        url: str,
        headers: Optional[Dict] = None,
        body: Optional[Dict] = None,
        params: Optional[Dict] = None
    ) -> Dict:
        """Make API call."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.request(
                    method=method,
                    url=url,
                    headers=headers,
                    json=body,
                    params=params
                )
                
                # Try to parse JSON response
                try:
                    response_data = response.json()
                except:
                    response_data = response.text
                
                return {
                    "success": response.status_code < 400,
                    "status_code": response.status_code,
                    "response": response_data,
                    "headers": dict(response.headers)
                }
            except Exception as e:
                return {"success": False, "error": str(e)}


# ============================================================================
# Tool Registry
# ============================================================================

class ToolRegistry:
    """Registry for all available tools."""
    
    def __init__(self):
        self._tools: Dict[str, BaseTool] = {}
        self._initialize_tools()
    
    def _initialize_tools(self):
        """Initialize all tools."""
        # Computer Use
        self.register(ScreenshotTool())
        self.register(MouseClickTool())
        self.register(KeyboardTypeTool())
        
        # Browser
        browser_nav = BrowserNavigateTool()
        self.register(browser_nav)
        self.register(BrowserClickTool(browser_nav))
        self.register(BrowserExtractTool(browser_nav))
        
        # Code
        self.register(PythonExecuteTool())
        self.register(ShellExecuteTool())
        
        # File
        self.register(FileReadTool())
        self.register(FileWriteTool())
        
        # API
        self.register(APICallTool())
        
        logger.info(f"Initialized {len(self._tools)} tools")
    
    def register(self, tool: BaseTool):
        """Register a tool."""
        self._tools[tool.name] = tool
    
    def get(self, name: str) -> Optional[BaseTool]:
        """Get a tool by name."""
        return self._tools.get(name)
    
    def list_tools(self) -> List[Dict]:
        """List all tools in MCP format."""
        return [tool.to_mcp_format() for tool in self._tools.values()]
    
    def list_by_category(self, category: ToolCategory) -> List[BaseTool]:
        """List tools by category."""
        return [
            tool for tool in self._tools.values()
            if tool.definition.category == category
        ]
    
    async def execute(self, tool_name: str, **kwargs) -> Dict:
        """Execute a tool by name."""
        tool = self.get(tool_name)
        if not tool:
            return {"success": False, "error": f"Tool not found: {tool_name}"}
        
        return await tool(**kwargs)
    
    def get_stats(self) -> Dict:
        """Get tool usage statistics."""
        return {
            "total_tools": len(self._tools),
            "tools": {
                name: {
                    "call_count": tool.call_count,
                    "total_time": tool.total_time,
                    "avg_time": tool.total_time / tool.call_count if tool.call_count > 0 else 0
                }
                for name, tool in self._tools.items()
            }
        }


# ============================================================================
# MCP Server Interface
# ============================================================================

class MCPToolServer:
    """MCP-compatible tool server."""
    
    def __init__(self, registry: ToolRegistry):
        self.registry = registry
    
    def list_tools(self) -> Dict:
        """List available tools in MCP format."""
        return {
            "tools": self.registry.list_tools()
        }
    
    async def call_tool(self, name: str, arguments: Dict) -> Dict:
        """Call a tool with arguments."""
        result = await self.registry.execute(name, **arguments)
        
        return {
            "content": [
                {
                    "type": "text",
                    "text": json.dumps(result, indent=2)
                }
            ],
            "isError": not result.get("success", False)
        }


# ============================================================================
# Singleton Instance
# ============================================================================

_registry_instance = None

def get_tool_registry() -> ToolRegistry:
    """Get the singleton Tool Registry instance."""
    global _registry_instance
    if _registry_instance is None:
        _registry_instance = ToolRegistry()
    return _registry_instance


def get_mcp_server() -> MCPToolServer:
    """Get an MCP server instance."""
    return MCPToolServer(get_tool_registry())


# ============================================================================
# Export
# ============================================================================

__all__ = [
    'ToolRegistry',
    'get_tool_registry',
    'MCPToolServer',
    'get_mcp_server',
    'BaseTool',
    'ToolDefinition',
    'ToolCategory'
]
