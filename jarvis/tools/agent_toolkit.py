"""
Agent Toolkit v1.0
==================
A comprehensive collection of tools for AI agents.
These tools can be used by any agent in the SuperMega.dev infrastructure.

Categories:
- Web Tools: Search, scrape, browse
- Data Tools: Process, analyze, visualize
- Communication Tools: Email, calendar, messaging
- File Tools: Read, write, convert
- Code Tools: Execute, debug, deploy
- AI Tools: LLM calls, embeddings, vision
"""

import os
import json
import asyncio
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
import httpx

logger = logging.getLogger("AgentToolkit")


# ============================================================================
# Tool Registry
# ============================================================================

class ToolRegistry:
    """Registry for all available tools."""
    
    _tools: Dict[str, 'BaseTool'] = {}
    
    @classmethod
    def register(cls, tool: 'BaseTool'):
        """Register a tool."""
        cls._tools[tool.name] = tool
        logger.info(f"Registered tool: {tool.name}")
    
    @classmethod
    def get(cls, name: str) -> Optional['BaseTool']:
        """Get a tool by name."""
        return cls._tools.get(name)
    
    @classmethod
    def list_tools(cls) -> List[Dict]:
        """List all available tools."""
        return [
            {
                "name": tool.name,
                "description": tool.description,
                "category": tool.category,
                "parameters": tool.parameters
            }
            for tool in cls._tools.values()
        ]


# ============================================================================
# Base Tool
# ============================================================================

@dataclass
class BaseTool:
    """Base class for all tools."""
    name: str
    description: str
    category: str
    parameters: Dict[str, Any] = field(default_factory=dict)
    
    async def execute(self, **kwargs) -> Dict:
        """Execute the tool. Override in subclasses."""
        raise NotImplementedError


# ============================================================================
# Web Tools
# ============================================================================

class WebSearchTool(BaseTool):
    """Search the web using various search engines."""
    
    def __init__(self):
        super().__init__(
            name="web_search",
            description="Search the web for information using Google, Bing, or DuckDuckGo",
            category="web",
            parameters={
                "query": {"type": "string", "required": True, "description": "Search query"},
                "engine": {"type": "string", "required": False, "default": "google", "description": "Search engine to use"},
                "num_results": {"type": "integer", "required": False, "default": 10, "description": "Number of results"}
            }
        )
    
    async def execute(self, query: str, engine: str = "google", num_results: int = 10) -> Dict:
        """Execute web search."""
        # Using SerpAPI or similar service
        serp_api_key = os.getenv("SERP_API_KEY", "")
        
        if not serp_api_key:
            # Fallback to DuckDuckGo (no API key needed)
            return await self._duckduckgo_search(query, num_results)
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://serpapi.com/search",
                params={
                    "q": query,
                    "api_key": serp_api_key,
                    "engine": engine,
                    "num": num_results
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                results = data.get("organic_results", [])
                return {
                    "success": True,
                    "query": query,
                    "results": [
                        {
                            "title": r.get("title"),
                            "link": r.get("link"),
                            "snippet": r.get("snippet")
                        }
                        for r in results[:num_results]
                    ]
                }
            
            return {"success": False, "error": "Search failed"}
    
    async def _duckduckgo_search(self, query: str, num_results: int) -> Dict:
        """Fallback search using DuckDuckGo."""
        try:
            from duckduckgo_search import DDGS
            
            with DDGS() as ddgs:
                results = list(ddgs.text(query, max_results=num_results))
                return {
                    "success": True,
                    "query": query,
                    "results": [
                        {
                            "title": r.get("title"),
                            "link": r.get("href"),
                            "snippet": r.get("body")
                        }
                        for r in results
                    ]
                }
        except ImportError:
            return {"success": False, "error": "DuckDuckGo search not available"}


class WebScrapeTool(BaseTool):
    """Scrape content from web pages."""
    
    def __init__(self):
        super().__init__(
            name="web_scrape",
            description="Extract content from a web page",
            category="web",
            parameters={
                "url": {"type": "string", "required": True, "description": "URL to scrape"},
                "selector": {"type": "string", "required": False, "description": "CSS selector to extract"},
                "format": {"type": "string", "required": False, "default": "text", "description": "Output format (text, html, markdown)"}
            }
        )
    
    async def execute(self, url: str, selector: Optional[str] = None, format: str = "text") -> Dict:
        """Scrape a web page."""
        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
                response = await client.get(url, headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                })
                
                if response.status_code != 200:
                    return {"success": False, "error": f"HTTP {response.status_code}"}
                
                from bs4 import BeautifulSoup
                soup = BeautifulSoup(response.text, 'html.parser')
                
                # Remove script and style elements
                for element in soup(['script', 'style', 'nav', 'footer', 'header']):
                    element.decompose()
                
                if selector:
                    elements = soup.select(selector)
                    content = "\n".join(el.get_text(strip=True) for el in elements)
                else:
                    content = soup.get_text(separator='\n', strip=True)
                
                # Convert to markdown if requested
                if format == "markdown":
                    try:
                        import html2text
                        h = html2text.HTML2Text()
                        h.ignore_links = False
                        content = h.handle(str(soup))
                    except ImportError:
                        pass
                
                return {
                    "success": True,
                    "url": url,
                    "content": content[:50000],  # Limit content size
                    "title": soup.title.string if soup.title else ""
                }
                
        except Exception as e:
            return {"success": False, "error": str(e)}


# ============================================================================
# Data Tools
# ============================================================================

class DataAnalysisTool(BaseTool):
    """Analyze data using pandas and numpy."""
    
    def __init__(self):
        super().__init__(
            name="data_analysis",
            description="Analyze data from CSV, JSON, or Excel files",
            category="data",
            parameters={
                "file_path": {"type": "string", "required": True, "description": "Path to data file"},
                "operation": {"type": "string", "required": True, "description": "Analysis operation (describe, corr, groupby, etc.)"},
                "params": {"type": "object", "required": False, "description": "Operation parameters"}
            }
        )
    
    async def execute(self, file_path: str, operation: str, params: Optional[Dict] = None) -> Dict:
        """Execute data analysis."""
        try:
            import pandas as pd
            import numpy as np
            
            # Load data based on file extension
            ext = os.path.splitext(file_path)[1].lower()
            if ext == '.csv':
                df = pd.read_csv(file_path)
            elif ext == '.json':
                df = pd.read_json(file_path)
            elif ext in ['.xlsx', '.xls']:
                df = pd.read_excel(file_path)
            else:
                return {"success": False, "error": f"Unsupported file format: {ext}"}
            
            params = params or {}
            
            if operation == "describe":
                result = df.describe().to_dict()
            elif operation == "info":
                result = {
                    "columns": list(df.columns),
                    "dtypes": df.dtypes.astype(str).to_dict(),
                    "shape": df.shape,
                    "null_counts": df.isnull().sum().to_dict()
                }
            elif operation == "corr":
                result = df.corr().to_dict()
            elif operation == "groupby":
                group_col = params.get("by", df.columns[0])
                agg_col = params.get("column", df.columns[1])
                agg_func = params.get("func", "mean")
                result = df.groupby(group_col)[agg_col].agg(agg_func).to_dict()
            elif operation == "head":
                n = params.get("n", 10)
                result = df.head(n).to_dict(orient="records")
            elif operation == "value_counts":
                column = params.get("column", df.columns[0])
                result = df[column].value_counts().to_dict()
            else:
                return {"success": False, "error": f"Unknown operation: {operation}"}
            
            return {
                "success": True,
                "operation": operation,
                "result": result
            }
            
        except Exception as e:
            return {"success": False, "error": str(e)}


class DataVisualizationTool(BaseTool):
    """Create data visualizations."""
    
    def __init__(self):
        super().__init__(
            name="data_visualization",
            description="Create charts and graphs from data",
            category="data",
            parameters={
                "data": {"type": "object", "required": True, "description": "Data to visualize"},
                "chart_type": {"type": "string", "required": True, "description": "Type of chart (bar, line, pie, scatter, etc.)"},
                "output_path": {"type": "string", "required": True, "description": "Path to save the chart"}
            }
        )
    
    async def execute(self, data: Dict, chart_type: str, output_path: str, **kwargs) -> Dict:
        """Create a visualization."""
        try:
            import matplotlib.pyplot as plt
            import pandas as pd
            
            df = pd.DataFrame(data)
            
            plt.figure(figsize=(10, 6))
            
            if chart_type == "bar":
                df.plot(kind='bar', **kwargs)
            elif chart_type == "line":
                df.plot(kind='line', **kwargs)
            elif chart_type == "pie":
                df.iloc[:, 0].plot(kind='pie', **kwargs)
            elif chart_type == "scatter":
                x_col = kwargs.get('x', df.columns[0])
                y_col = kwargs.get('y', df.columns[1])
                plt.scatter(df[x_col], df[y_col])
            elif chart_type == "histogram":
                df.hist(**kwargs)
            else:
                return {"success": False, "error": f"Unknown chart type: {chart_type}"}
            
            plt.tight_layout()
            plt.savefig(output_path, dpi=150)
            plt.close()
            
            return {
                "success": True,
                "chart_type": chart_type,
                "output_path": output_path
            }
            
        except Exception as e:
            return {"success": False, "error": str(e)}


# ============================================================================
# Communication Tools
# ============================================================================

class EmailTool(BaseTool):
    """Send and read emails."""
    
    def __init__(self):
        super().__init__(
            name="email",
            description="Send emails or read inbox",
            category="communication",
            parameters={
                "action": {"type": "string", "required": True, "description": "Action (send, read, search)"},
                "to": {"type": "string", "required": False, "description": "Recipient email"},
                "subject": {"type": "string", "required": False, "description": "Email subject"},
                "body": {"type": "string", "required": False, "description": "Email body"}
            }
        )
    
    async def execute(self, action: str, **kwargs) -> Dict:
        """Execute email action."""
        # This would integrate with Gmail API or SMTP
        # For now, return a placeholder
        return {
            "success": True,
            "action": action,
            "message": f"Email {action} would be executed here",
            "note": "Integrate with Gmail MCP or SMTP for actual functionality"
        }


class CalendarTool(BaseTool):
    """Manage calendar events."""
    
    def __init__(self):
        super().__init__(
            name="calendar",
            description="Create, read, or update calendar events",
            category="communication",
            parameters={
                "action": {"type": "string", "required": True, "description": "Action (create, list, update, delete)"},
                "title": {"type": "string", "required": False, "description": "Event title"},
                "start_time": {"type": "string", "required": False, "description": "Start time (ISO format)"},
                "end_time": {"type": "string", "required": False, "description": "End time (ISO format)"}
            }
        )
    
    async def execute(self, action: str, **kwargs) -> Dict:
        """Execute calendar action."""
        # This would integrate with Google Calendar API
        return {
            "success": True,
            "action": action,
            "message": f"Calendar {action} would be executed here",
            "note": "Integrate with Google Calendar MCP for actual functionality"
        }


# ============================================================================
# File Tools
# ============================================================================

class FileReadTool(BaseTool):
    """Read files of various formats."""
    
    def __init__(self):
        super().__init__(
            name="file_read",
            description="Read content from files (txt, pdf, docx, etc.)",
            category="file",
            parameters={
                "path": {"type": "string", "required": True, "description": "File path"},
                "encoding": {"type": "string", "required": False, "default": "utf-8", "description": "File encoding"}
            }
        )
    
    async def execute(self, path: str, encoding: str = "utf-8") -> Dict:
        """Read a file."""
        try:
            ext = os.path.splitext(path)[1].lower()
            
            if ext == '.pdf':
                # Read PDF
                try:
                    import PyPDF2
                    with open(path, 'rb') as f:
                        reader = PyPDF2.PdfReader(f)
                        content = "\n".join(page.extract_text() for page in reader.pages)
                except ImportError:
                    return {"success": False, "error": "PyPDF2 not installed"}
            
            elif ext in ['.docx']:
                # Read Word document
                try:
                    from docx import Document
                    doc = Document(path)
                    content = "\n".join(para.text for para in doc.paragraphs)
                except ImportError:
                    return {"success": False, "error": "python-docx not installed"}
            
            elif ext in ['.xlsx', '.xls']:
                # Read Excel
                import pandas as pd
                df = pd.read_excel(path)
                content = df.to_string()
            
            else:
                # Read as text
                with open(path, 'r', encoding=encoding) as f:
                    content = f.read()
            
            return {
                "success": True,
                "path": path,
                "content": content[:100000],  # Limit size
                "size": len(content)
            }
            
        except Exception as e:
            return {"success": False, "error": str(e)}


class FileWriteTool(BaseTool):
    """Write content to files."""
    
    def __init__(self):
        super().__init__(
            name="file_write",
            description="Write content to a file",
            category="file",
            parameters={
                "path": {"type": "string", "required": True, "description": "File path"},
                "content": {"type": "string", "required": True, "description": "Content to write"},
                "mode": {"type": "string", "required": False, "default": "w", "description": "Write mode (w, a)"}
            }
        )
    
    async def execute(self, path: str, content: str, mode: str = "w") -> Dict:
        """Write to a file."""
        try:
            # Ensure directory exists
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
# Code Tools
# ============================================================================

class CodeExecuteTool(BaseTool):
    """Execute code in various languages."""
    
    def __init__(self):
        super().__init__(
            name="code_execute",
            description="Execute code (Python, JavaScript, Shell)",
            category="code",
            parameters={
                "language": {"type": "string", "required": True, "description": "Programming language"},
                "code": {"type": "string", "required": True, "description": "Code to execute"},
                "timeout": {"type": "integer", "required": False, "default": 30, "description": "Timeout in seconds"}
            }
        )
    
    async def execute(self, language: str, code: str, timeout: int = 30) -> Dict:
        """Execute code."""
        import subprocess
        import tempfile
        import sys
        
        try:
            if language == "python":
                with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
                    f.write(code)
                    temp_path = f.name
                
                result = subprocess.run(
                    [sys.executable, temp_path],
                    capture_output=True,
                    text=True,
                    timeout=timeout
                )
                os.unlink(temp_path)
            
            elif language == "javascript":
                with tempfile.NamedTemporaryFile(mode='w', suffix='.js', delete=False) as f:
                    f.write(code)
                    temp_path = f.name
                
                result = subprocess.run(
                    ["node", temp_path],
                    capture_output=True,
                    text=True,
                    timeout=timeout
                )
                os.unlink(temp_path)
            
            elif language == "shell":
                result = subprocess.run(
                    code,
                    shell=True,
                    capture_output=True,
                    text=True,
                    timeout=timeout
                )
            
            else:
                return {"success": False, "error": f"Unsupported language: {language}"}
            
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


class GitTool(BaseTool):
    """Git operations."""
    
    def __init__(self):
        super().__init__(
            name="git",
            description="Execute git commands",
            category="code",
            parameters={
                "command": {"type": "string", "required": True, "description": "Git command (clone, pull, push, commit, etc.)"},
                "repo_path": {"type": "string", "required": False, "description": "Repository path"},
                "args": {"type": "array", "required": False, "description": "Additional arguments"}
            }
        )
    
    async def execute(self, command: str, repo_path: Optional[str] = None, args: Optional[List[str]] = None) -> Dict:
        """Execute git command."""
        import subprocess
        
        try:
            cmd = ["git", command] + (args or [])
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                cwd=repo_path,
                timeout=120
            )
            
            return {
                "success": result.returncode == 0,
                "command": " ".join(cmd),
                "stdout": result.stdout,
                "stderr": result.stderr
            }
            
        except Exception as e:
            return {"success": False, "error": str(e)}


# ============================================================================
# AI Tools
# ============================================================================

class LLMTool(BaseTool):
    """Call various LLM APIs."""
    
    def __init__(self):
        super().__init__(
            name="llm",
            description="Call LLM APIs (Gemini, Claude, OpenAI)",
            category="ai",
            parameters={
                "prompt": {"type": "string", "required": True, "description": "Prompt to send"},
                "model": {"type": "string", "required": False, "default": "gemini", "description": "Model to use"},
                "max_tokens": {"type": "integer", "required": False, "default": 4096, "description": "Max tokens"}
            }
        )
    
    async def execute(self, prompt: str, model: str = "gemini", max_tokens: int = 4096) -> Dict:
        """Call an LLM."""
        async with httpx.AsyncClient(timeout=60.0) as client:
            if model == "gemini":
                api_key = os.getenv("GEMINI_API_KEY", "")
                if not api_key:
                    return {"success": False, "error": "Gemini API key not configured"}
                
                url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key={api_key}"
                payload = {
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {"maxOutputTokens": max_tokens}
                }
                
                response = await client.post(url, json=payload)
                if response.status_code == 200:
                    data = response.json()
                    text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                    return {"success": True, "model": "gemini", "response": text}
            
            elif model == "claude":
                api_key = os.getenv("ANTHROPIC_API_KEY", "")
                if not api_key:
                    return {"success": False, "error": "Anthropic API key not configured"}
                
                url = "https://api.anthropic.com/v1/messages"
                headers = {
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json"
                }
                payload = {
                    "model": "claude-3-5-sonnet-20241022",
                    "max_tokens": max_tokens,
                    "messages": [{"role": "user", "content": prompt}]
                }
                
                response = await client.post(url, json=payload, headers=headers)
                if response.status_code == 200:
                    data = response.json()
                    text = data.get("content", [{}])[0].get("text", "")
                    return {"success": True, "model": "claude", "response": text}
            
            elif model == "openai":
                api_key = os.getenv("OPENAI_API_KEY", "")
                if not api_key:
                    return {"success": False, "error": "OpenAI API key not configured"}
                
                url = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1") + "/chat/completions"
                headers = {"Authorization": f"Bearer {api_key}"}
                payload = {
                    "model": "gpt-4o",
                    "max_tokens": max_tokens,
                    "messages": [{"role": "user", "content": prompt}]
                }
                
                response = await client.post(url, json=payload, headers=headers)
                if response.status_code == 200:
                    data = response.json()
                    text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                    return {"success": True, "model": "openai", "response": text}
            
            return {"success": False, "error": f"Unknown model: {model}"}


class EmbeddingTool(BaseTool):
    """Generate text embeddings."""
    
    def __init__(self):
        super().__init__(
            name="embedding",
            description="Generate text embeddings for semantic search",
            category="ai",
            parameters={
                "text": {"type": "string", "required": True, "description": "Text to embed"},
                "model": {"type": "string", "required": False, "default": "openai", "description": "Embedding model"}
            }
        )
    
    async def execute(self, text: str, model: str = "openai") -> Dict:
        """Generate embeddings."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            if model == "openai":
                api_key = os.getenv("OPENAI_API_KEY", "")
                if not api_key:
                    return {"success": False, "error": "OpenAI API key not configured"}
                
                url = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1") + "/embeddings"
                headers = {"Authorization": f"Bearer {api_key}"}
                payload = {
                    "model": "text-embedding-3-small",
                    "input": text
                }
                
                response = await client.post(url, json=payload, headers=headers)
                if response.status_code == 200:
                    data = response.json()
                    embedding = data.get("data", [{}])[0].get("embedding", [])
                    return {
                        "success": True,
                        "model": "text-embedding-3-small",
                        "embedding": embedding,
                        "dimensions": len(embedding)
                    }
            
            return {"success": False, "error": f"Unknown model: {model}"}


# ============================================================================
# Register All Tools
# ============================================================================

def register_all_tools():
    """Register all available tools."""
    tools = [
        # Web Tools
        WebSearchTool(),
        WebScrapeTool(),
        
        # Data Tools
        DataAnalysisTool(),
        DataVisualizationTool(),
        
        # Communication Tools
        EmailTool(),
        CalendarTool(),
        
        # File Tools
        FileReadTool(),
        FileWriteTool(),
        
        # Code Tools
        CodeExecuteTool(),
        GitTool(),
        
        # AI Tools
        LLMTool(),
        EmbeddingTool(),
    ]
    
    for tool in tools:
        ToolRegistry.register(tool)
    
    logger.info(f"Registered {len(tools)} tools")


# Initialize on import
register_all_tools()


# ============================================================================
# Tool Executor
# ============================================================================

class ToolExecutor:
    """Executes tools by name with given parameters."""
    
    @staticmethod
    async def execute(tool_name: str, **kwargs) -> Dict:
        """Execute a tool by name."""
        tool = ToolRegistry.get(tool_name)
        if not tool:
            return {"success": False, "error": f"Tool not found: {tool_name}"}
        
        try:
            return await tool.execute(**kwargs)
        except Exception as e:
            logger.error(f"Tool execution failed: {e}")
            return {"success": False, "error": str(e)}
    
    @staticmethod
    def list_tools() -> List[Dict]:
        """List all available tools."""
        return ToolRegistry.list_tools()


# ============================================================================
# Export
# ============================================================================

__all__ = [
    'ToolRegistry',
    'BaseTool',
    'ToolExecutor',
    'register_all_tools'
]
