"""
Computer Use Agent v1.0
========================
A Task Execution Agent (TEA) that runs on the Bangkok Node.
Controls the desktop environment to execute tasks using mouse, keyboard, and applications.

This agent is designed to:
- Receive tasks from the Master Control Agent (MCA)
- Control the Windows desktop via pyautogui
- Use browser automation via Playwright
- Execute code and scripts
- Report results back to MCA
"""

import os
import sys
import json
import asyncio
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
import base64
import io

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("ComputerUseAgent")


# ============================================================================
# Configuration
# ============================================================================

@dataclass
class AgentConfig:
    """Computer Use Agent Configuration"""
    mca_url: str = field(default_factory=lambda: os.getenv("MCA_URL", "http://localhost:8080"))
    gemini_api_key: str = field(default_factory=lambda: os.getenv("GEMINI_API_KEY", ""))
    anthropic_api_key: str = field(default_factory=lambda: os.getenv("ANTHROPIC_API_KEY", ""))
    screenshot_dir: str = field(default_factory=lambda: os.getenv("SCREENSHOT_DIR", "./screenshots"))
    workspace_dir: str = field(default_factory=lambda: os.getenv("WORKSPACE_DIR", "./workspace"))
    headless: bool = False
    max_retries: int = 3


# ============================================================================
# Screen Controller
# ============================================================================

class ScreenController:
    """Controls the screen - captures screenshots and performs actions."""
    
    def __init__(self, config: AgentConfig):
        self.config = config
        self._ensure_dirs()
    
    def _ensure_dirs(self):
        """Ensure required directories exist."""
        os.makedirs(self.config.screenshot_dir, exist_ok=True)
        os.makedirs(self.config.workspace_dir, exist_ok=True)
    
    def capture_screenshot(self) -> Optional[str]:
        """Capture a screenshot and return the base64 encoded image."""
        try:
            import pyautogui
            from PIL import Image
            
            screenshot = pyautogui.screenshot()
            
            # Save to file
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filepath = os.path.join(self.config.screenshot_dir, f"screen_{timestamp}.png")
            screenshot.save(filepath)
            
            # Convert to base64
            buffer = io.BytesIO()
            screenshot.save(buffer, format="PNG")
            base64_image = base64.b64encode(buffer.getvalue()).decode("utf-8")
            
            logger.info(f"Screenshot captured: {filepath}")
            return base64_image
            
        except ImportError:
            logger.warning("pyautogui not available - screenshot disabled")
            return None
        except Exception as e:
            logger.error(f"Screenshot failed: {e}")
            return None
    
    def click(self, x: int, y: int, button: str = "left") -> bool:
        """Click at the specified coordinates."""
        try:
            import pyautogui
            pyautogui.click(x, y, button=button)
            logger.info(f"Clicked at ({x}, {y}) with {button} button")
            return True
        except Exception as e:
            logger.error(f"Click failed: {e}")
            return False
    
    def type_text(self, text: str, interval: float = 0.05) -> bool:
        """Type text using the keyboard."""
        try:
            import pyautogui
            pyautogui.typewrite(text, interval=interval)
            logger.info(f"Typed: {text[:50]}...")
            return True
        except Exception as e:
            logger.error(f"Type failed: {e}")
            return False
    
    def press_key(self, key: str) -> bool:
        """Press a keyboard key."""
        try:
            import pyautogui
            pyautogui.press(key)
            logger.info(f"Pressed key: {key}")
            return True
        except Exception as e:
            logger.error(f"Key press failed: {e}")
            return False
    
    def hotkey(self, *keys) -> bool:
        """Press a keyboard hotkey combination."""
        try:
            import pyautogui
            pyautogui.hotkey(*keys)
            logger.info(f"Hotkey: {'+'.join(keys)}")
            return True
        except Exception as e:
            logger.error(f"Hotkey failed: {e}")
            return False


# ============================================================================
# Browser Controller
# ============================================================================

class BrowserController:
    """Controls a browser instance using Playwright."""
    
    def __init__(self, config: AgentConfig):
        self.config = config
        self.browser = None
        self.page = None
    
    async def start(self):
        """Start the browser."""
        try:
            from playwright.async_api import async_playwright
            
            self.playwright = await async_playwright().start()
            self.browser = await self.playwright.chromium.launch(
                headless=self.config.headless
            )
            self.page = await self.browser.new_page()
            logger.info("Browser started")
            
        except ImportError:
            logger.warning("Playwright not available - browser control disabled")
        except Exception as e:
            logger.error(f"Browser start failed: {e}")
    
    async def stop(self):
        """Stop the browser."""
        if self.browser:
            await self.browser.close()
        if hasattr(self, 'playwright'):
            await self.playwright.stop()
        logger.info("Browser stopped")
    
    async def navigate(self, url: str) -> bool:
        """Navigate to a URL."""
        if not self.page:
            return False
        try:
            await self.page.goto(url, wait_until="networkidle")
            logger.info(f"Navigated to: {url}")
            return True
        except Exception as e:
            logger.error(f"Navigation failed: {e}")
            return False
    
    async def get_page_content(self) -> str:
        """Get the current page content."""
        if not self.page:
            return ""
        try:
            return await self.page.content()
        except Exception as e:
            logger.error(f"Get content failed: {e}")
            return ""
    
    async def screenshot(self) -> Optional[str]:
        """Take a screenshot of the browser."""
        if not self.page:
            return None
        try:
            screenshot_bytes = await self.page.screenshot()
            return base64.b64encode(screenshot_bytes).decode("utf-8")
        except Exception as e:
            logger.error(f"Browser screenshot failed: {e}")
            return None
    
    async def click_element(self, selector: str) -> bool:
        """Click an element by selector."""
        if not self.page:
            return False
        try:
            await self.page.click(selector)
            logger.info(f"Clicked element: {selector}")
            return True
        except Exception as e:
            logger.error(f"Click element failed: {e}")
            return False
    
    async def fill_input(self, selector: str, text: str) -> bool:
        """Fill an input field."""
        if not self.page:
            return False
        try:
            await self.page.fill(selector, text)
            logger.info(f"Filled input: {selector}")
            return True
        except Exception as e:
            logger.error(f"Fill input failed: {e}")
            return False


# ============================================================================
# Code Executor
# ============================================================================

class CodeExecutor:
    """Executes code in a sandboxed environment."""
    
    def __init__(self, config: AgentConfig):
        self.config = config
    
    def execute_python(self, code: str, timeout: int = 30) -> Dict:
        """Execute Python code and return the result."""
        import subprocess
        import tempfile
        
        # Write code to temp file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
            f.write(code)
            temp_path = f.name
        
        try:
            result = subprocess.run(
                [sys.executable, temp_path],
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=self.config.workspace_dir
            )
            
            return {
                "success": result.returncode == 0,
                "stdout": result.stdout,
                "stderr": result.stderr,
                "return_code": result.returncode
            }
            
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "error": "Execution timed out",
                "return_code": -1
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "return_code": -1
            }
        finally:
            os.unlink(temp_path)
    
    def execute_shell(self, command: str, timeout: int = 30) -> Dict:
        """Execute a shell command."""
        import subprocess
        
        try:
            result = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=self.config.workspace_dir
            )
            
            return {
                "success": result.returncode == 0,
                "stdout": result.stdout,
                "stderr": result.stderr,
                "return_code": result.returncode
            }
            
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "error": "Execution timed out",
                "return_code": -1
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "return_code": -1
            }


# ============================================================================
# Vision Analyzer
# ============================================================================

class VisionAnalyzer:
    """Analyzes screenshots using vision-capable AI models."""
    
    def __init__(self, config: AgentConfig):
        self.config = config
    
    async def analyze_screenshot(self, screenshot_base64: str, prompt: str) -> Dict:
        """Analyze a screenshot using Gemini Vision."""
        import httpx
        
        if not self.config.gemini_api_key:
            return {"error": "Gemini API key not configured"}
        
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key={self.config.gemini_api_key}"
        
        payload = {
            "contents": [{
                "parts": [
                    {"text": prompt},
                    {
                        "inline_data": {
                            "mime_type": "image/png",
                            "data": screenshot_base64
                        }
                    }
                ]
            }],
            "generationConfig": {
                "maxOutputTokens": 4096,
                "temperature": 0.4
            }
        }
        
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(url, json=payload)
                response.raise_for_status()
                data = response.json()
                
                text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                return {
                    "success": True,
                    "analysis": text
                }
        except Exception as e:
            logger.error(f"Vision analysis failed: {e}")
            return {"success": False, "error": str(e)}


# ============================================================================
# Computer Use Agent
# ============================================================================

class ComputerUseAgent:
    """
    The main Computer Use Agent.
    Orchestrates screen control, browser automation, and code execution.
    """
    
    def __init__(self, config: Optional[AgentConfig] = None):
        self.config = config or AgentConfig()
        self.screen = ScreenController(self.config)
        self.browser = BrowserController(self.config)
        self.code_executor = CodeExecutor(self.config)
        self.vision = VisionAnalyzer(self.config)
        
        self.current_task = None
        self.task_history: List[Dict] = []
        
        logger.info("Computer Use Agent initialized")
    
    async def start(self):
        """Start the agent and its components."""
        await self.browser.start()
        logger.info("Computer Use Agent started")
    
    async def stop(self):
        """Stop the agent and cleanup."""
        await self.browser.stop()
        logger.info("Computer Use Agent stopped")
    
    async def execute_task(self, task: Dict) -> Dict:
        """
        Execute a task received from the MCA.
        
        The task should contain:
        - description: What to do
        - type: The type of task (browse, code, desktop, etc.)
        - parameters: Task-specific parameters
        """
        
        self.current_task = task
        task_id = task.get("id", "unknown")
        task_type = task.get("type", "general")
        description = task.get("description", "")
        
        logger.info(f"Executing task {task_id}: {description[:100]}...")
        
        try:
            if task_type == "browse":
                result = await self._execute_browse_task(task)
            elif task_type == "code":
                result = await self._execute_code_task(task)
            elif task_type == "desktop":
                result = await self._execute_desktop_task(task)
            else:
                result = await self._execute_general_task(task)
            
            # Record in history
            self.task_history.append({
                "task_id": task_id,
                "type": task_type,
                "description": description,
                "result": result,
                "timestamp": datetime.now().isoformat()
            })
            
            return result
            
        except Exception as e:
            logger.error(f"Task execution failed: {e}")
            return {
                "success": False,
                "error": str(e),
                "task_id": task_id
            }
        finally:
            self.current_task = None
    
    async def _execute_browse_task(self, task: Dict) -> Dict:
        """Execute a browser-based task."""
        params = task.get("parameters", {})
        url = params.get("url", "")
        action = params.get("action", "navigate")
        
        if action == "navigate" and url:
            success = await self.browser.navigate(url)
            screenshot = await self.browser.screenshot()
            
            # Analyze the page if needed
            if params.get("analyze", False) and screenshot:
                analysis = await self.vision.analyze_screenshot(
                    screenshot,
                    f"Analyze this webpage. Task: {task.get('description', '')}"
                )
                return {
                    "success": success,
                    "action": "navigate",
                    "url": url,
                    "screenshot": screenshot[:100] + "...",  # Truncate for logging
                    "analysis": analysis
                }
            
            return {
                "success": success,
                "action": "navigate",
                "url": url
            }
        
        elif action == "click":
            selector = params.get("selector", "")
            success = await self.browser.click_element(selector)
            return {"success": success, "action": "click", "selector": selector}
        
        elif action == "fill":
            selector = params.get("selector", "")
            text = params.get("text", "")
            success = await self.browser.fill_input(selector, text)
            return {"success": success, "action": "fill", "selector": selector}
        
        return {"success": False, "error": "Unknown browse action"}
    
    async def _execute_code_task(self, task: Dict) -> Dict:
        """Execute a code-based task."""
        params = task.get("parameters", {})
        language = params.get("language", "python")
        code = params.get("code", "")
        
        if language == "python":
            result = self.code_executor.execute_python(code)
        elif language == "shell":
            result = self.code_executor.execute_shell(code)
        else:
            return {"success": False, "error": f"Unsupported language: {language}"}
        
        return {
            "success": result.get("success", False),
            "action": "execute_code",
            "language": language,
            "output": result.get("stdout", ""),
            "error": result.get("stderr", "") or result.get("error", "")
        }
    
    async def _execute_desktop_task(self, task: Dict) -> Dict:
        """Execute a desktop automation task."""
        params = task.get("parameters", {})
        action = params.get("action", "screenshot")
        
        if action == "screenshot":
            screenshot = self.screen.capture_screenshot()
            
            if params.get("analyze", False) and screenshot:
                analysis = await self.vision.analyze_screenshot(
                    screenshot,
                    f"Analyze this desktop screenshot. Task: {task.get('description', '')}"
                )
                return {
                    "success": True,
                    "action": "screenshot",
                    "analysis": analysis
                }
            
            return {"success": screenshot is not None, "action": "screenshot"}
        
        elif action == "click":
            x = params.get("x", 0)
            y = params.get("y", 0)
            button = params.get("button", "left")
            success = self.screen.click(x, y, button)
            return {"success": success, "action": "click", "x": x, "y": y}
        
        elif action == "type":
            text = params.get("text", "")
            success = self.screen.type_text(text)
            return {"success": success, "action": "type"}
        
        elif action == "hotkey":
            keys = params.get("keys", [])
            success = self.screen.hotkey(*keys)
            return {"success": success, "action": "hotkey", "keys": keys}
        
        return {"success": False, "error": "Unknown desktop action"}
    
    async def _execute_general_task(self, task: Dict) -> Dict:
        """Execute a general task using AI reasoning."""
        description = task.get("description", "")
        
        # Take a screenshot to understand current state
        screenshot = self.screen.capture_screenshot()
        
        if screenshot:
            # Use vision to understand what to do
            analysis = await self.vision.analyze_screenshot(
                screenshot,
                f"""You are a computer use agent. Analyze this screenshot and determine the next action to complete this task:

TASK: {description}

Respond with a JSON object containing:
{{
    "understanding": "What you see on screen",
    "next_action": "click|type|navigate|code|complete",
    "parameters": {{...}},
    "reasoning": "Why this action"
}}
"""
            )
            
            return {
                "success": True,
                "action": "analyze",
                "analysis": analysis
            }
        
        return {"success": False, "error": "Could not capture screenshot"}
    
    def get_status(self) -> Dict:
        """Get the current status of the agent."""
        return {
            "status": "active" if self.current_task else "idle",
            "current_task": self.current_task.get("id") if self.current_task else None,
            "tasks_completed": len(self.task_history),
            "browser_active": self.browser.page is not None,
            "timestamp": datetime.now().isoformat()
        }


# ============================================================================
# FastAPI Server for Bangkok Node
# ============================================================================

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(
    title="JARVIS Computer Use Agent",
    description="Task Execution Agent for the Bangkok Node",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global agent instance
agent: Optional[ComputerUseAgent] = None


class TaskRequest(BaseModel):
    id: str
    type: str = "general"
    description: str
    parameters: Optional[Dict] = None


@app.on_event("startup")
async def startup():
    global agent
    agent = ComputerUseAgent()
    await agent.start()
    logger.info("Computer Use Agent API started")


@app.on_event("shutdown")
async def shutdown():
    if agent:
        await agent.stop()


@app.get("/")
async def root():
    return {"service": "JARVIS Computer Use Agent", "status": "online"}


@app.get("/health")
async def health():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}


@app.get("/status")
async def get_status():
    if not agent:
        raise HTTPException(status_code=503, detail="Agent not initialized")
    return agent.get_status()


@app.post("/tasks/execute")
async def execute_task(request: TaskRequest):
    if not agent:
        raise HTTPException(status_code=503, detail="Agent not initialized")
    
    task = {
        "id": request.id,
        "type": request.type,
        "description": request.description,
        "parameters": request.parameters or {}
    }
    
    result = await agent.execute_task(task)
    return result


@app.get("/history")
async def get_history():
    if not agent:
        raise HTTPException(status_code=503, detail="Agent not initialized")
    return {"history": agent.task_history[-50:]}  # Last 50 tasks


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8501)
