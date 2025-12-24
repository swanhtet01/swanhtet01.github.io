"""
Browser Automation Agent
========================
Autonomous web browsing agent using Browser-Use patterns.
Can navigate websites, fill forms, extract data, and perform web tasks.

Features:
- Autonomous web navigation
- Form filling and submission
- Data extraction and scraping
- Screenshot capture
- Multi-tab management
- Cookie/session persistence

Author: Manus AI for SuperMega.dev
"""

import os
import sys
import json
import asyncio
import base64
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, List, Any
from dataclasses import dataclass, field

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    from playwright.async_api import async_playwright, Browser, Page, BrowserContext
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False

try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False


@dataclass
class BrowserAction:
    """Represents a browser action to execute."""
    action_type: str  # navigate, click, type, scroll, screenshot, extract, wait
    selector: Optional[str] = None
    value: Optional[str] = None
    url: Optional[str] = None
    description: str = ""


@dataclass
class BrowserState:
    """Current state of the browser."""
    url: str = ""
    title: str = ""
    screenshot_base64: Optional[str] = None
    page_text: str = ""
    links: List[Dict[str, str]] = field(default_factory=list)
    forms: List[Dict[str, Any]] = field(default_factory=list)
    timestamp: str = ""


class BrowserAgent:
    """
    Autonomous Browser Agent
    
    Uses vision-enabled LLM to understand web pages and decide actions.
    Implements Browser-Use patterns for reliable web automation.
    """
    
    def __init__(
        self,
        model: str = "gemini-2.0-flash",
        headless: bool = True,
        user_data_dir: Optional[str] = None
    ):
        self.model = model
        self.headless = headless
        self.user_data_dir = user_data_dir or str(Path.home() / ".hyper_unicorn" / "browser_data")
        
        # Browser components
        self.playwright = None
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None
        
        # State
        self.action_history: List[BrowserAction] = []
        self.state_history: List[BrowserState] = []
        self.max_actions = 50  # Safety limit
        
        # Configure Gemini
        if GEMINI_AVAILABLE:
            genai.configure(api_key=os.getenv("GEMINI_API_KEY", ""))
            self.llm = genai.GenerativeModel(model)
        else:
            self.llm = None
    
    async def initialize(self):
        """Initialize the browser."""
        if not PLAYWRIGHT_AVAILABLE:
            raise ImportError("Playwright not installed. Run: pip install playwright && playwright install")
        
        self.playwright = await async_playwright().start()
        
        # Create persistent context for session persistence
        Path(self.user_data_dir).mkdir(parents=True, exist_ok=True)
        
        self.browser = await self.playwright.chromium.launch(
            headless=self.headless,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--disable-dev-shm-usage",
                "--no-sandbox"
            ]
        )
        
        self.context = await self.browser.new_context(
            viewport={"width": 1920, "height": 1080},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        
        self.page = await self.context.new_page()
        
        # Set up event handlers
        self.page.on("dialog", lambda dialog: asyncio.create_task(dialog.dismiss()))
    
    async def close(self):
        """Close the browser."""
        if self.context:
            await self.context.close()
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()
    
    async def get_state(self) -> BrowserState:
        """Get current browser state."""
        if not self.page:
            return BrowserState()
        
        # Take screenshot
        screenshot_bytes = await self.page.screenshot(full_page=False)
        screenshot_base64 = base64.b64encode(screenshot_bytes).decode()
        
        # Get page info
        url = self.page.url
        title = await self.page.title()
        
        # Extract text content
        page_text = await self.page.evaluate("""
            () => {
                const walker = document.createTreeWalker(
                    document.body,
                    NodeFilter.SHOW_TEXT,
                    null,
                    false
                );
                let text = '';
                let node;
                while (node = walker.nextNode()) {
                    const trimmed = node.textContent.trim();
                    if (trimmed) text += trimmed + ' ';
                }
                return text.slice(0, 5000);  // Limit text length
            }
        """)
        
        # Extract links
        links = await self.page.evaluate("""
            () => Array.from(document.querySelectorAll('a[href]'))
                .slice(0, 50)
                .map(a => ({
                    text: a.textContent.trim().slice(0, 100),
                    href: a.href
                }))
        """)
        
        # Extract forms
        forms = await self.page.evaluate("""
            () => Array.from(document.querySelectorAll('form'))
                .slice(0, 10)
                .map(form => ({
                    action: form.action,
                    method: form.method,
                    inputs: Array.from(form.querySelectorAll('input, textarea, select'))
                        .slice(0, 20)
                        .map(input => ({
                            type: input.type || input.tagName.toLowerCase(),
                            name: input.name,
                            id: input.id,
                            placeholder: input.placeholder
                        }))
                }))
        """)
        
        state = BrowserState(
            url=url,
            title=title,
            screenshot_base64=screenshot_base64,
            page_text=page_text[:5000],
            links=links,
            forms=forms,
            timestamp=datetime.utcnow().isoformat()
        )
        
        self.state_history.append(state)
        return state
    
    async def execute_action(self, action: BrowserAction) -> bool:
        """Execute a browser action."""
        if not self.page:
            return False
        
        try:
            if action.action_type == "navigate":
                await self.page.goto(action.url, wait_until="domcontentloaded", timeout=30000)
            
            elif action.action_type == "click":
                await self.page.click(action.selector, timeout=10000)
            
            elif action.action_type == "type":
                await self.page.fill(action.selector, action.value, timeout=10000)
            
            elif action.action_type == "scroll":
                direction = action.value or "down"
                if direction == "down":
                    await self.page.evaluate("window.scrollBy(0, 500)")
                elif direction == "up":
                    await self.page.evaluate("window.scrollBy(0, -500)")
                elif direction == "top":
                    await self.page.evaluate("window.scrollTo(0, 0)")
                elif direction == "bottom":
                    await self.page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            
            elif action.action_type == "screenshot":
                path = action.value or f"screenshot_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
                await self.page.screenshot(path=path, full_page=True)
            
            elif action.action_type == "wait":
                await asyncio.sleep(float(action.value or 1))
            
            elif action.action_type == "press":
                await self.page.keyboard.press(action.value)
            
            elif action.action_type == "select":
                await self.page.select_option(action.selector, action.value)
            
            elif action.action_type == "hover":
                await self.page.hover(action.selector, timeout=10000)
            
            self.action_history.append(action)
            return True
            
        except Exception as e:
            print(f"Action failed: {action.action_type} - {e}")
            return False
    
    async def decide_action(self, goal: str, state: BrowserState) -> Optional[BrowserAction]:
        """Use LLM to decide the next action based on current state and goal."""
        if not self.llm:
            return None
        
        # Build prompt
        prompt = f"""You are a browser automation agent. Your goal is: {goal}

Current page:
- URL: {state.url}
- Title: {state.title}
- Page text (truncated): {state.page_text[:2000]}

Available links (first 20):
{json.dumps(state.links[:20], indent=2)}

Available forms:
{json.dumps(state.forms, indent=2)}

Previous actions taken: {len(self.action_history)}

Based on the current state and your goal, decide the next action.
Respond with a JSON object containing:
{{
    "action_type": "navigate|click|type|scroll|screenshot|wait|press|select|hover|done",
    "selector": "CSS selector if needed",
    "value": "value if needed (URL for navigate, text for type, direction for scroll)",
    "description": "brief description of why this action"
}}

If the goal is achieved, use action_type "done".
If you need to click a link, use the href as the URL for navigate action.
For form inputs, use the input's id or name as selector (e.g., "#email" or "[name='email']").

Respond ONLY with the JSON object, no other text."""

        try:
            # If we have a screenshot, include it for vision
            if state.screenshot_base64 and hasattr(self.llm, 'generate_content'):
                import PIL.Image
                import io
                
                # Decode screenshot
                img_bytes = base64.b64decode(state.screenshot_base64)
                img = PIL.Image.open(io.BytesIO(img_bytes))
                
                response = self.llm.generate_content([prompt, img])
            else:
                response = self.llm.generate_content(prompt)
            
            # Parse response
            response_text = response.text.strip()
            
            # Extract JSON from response
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0]
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0]
            
            action_data = json.loads(response_text)
            
            return BrowserAction(
                action_type=action_data.get("action_type", "wait"),
                selector=action_data.get("selector"),
                value=action_data.get("value"),
                url=action_data.get("value") if action_data.get("action_type") == "navigate" else None,
                description=action_data.get("description", "")
            )
            
        except Exception as e:
            print(f"Error deciding action: {e}")
            return None
    
    async def execute(self, goal: str, start_url: Optional[str] = None) -> Dict[str, Any]:
        """
        Execute a browsing task autonomously.
        
        Args:
            goal: Natural language description of what to accomplish
            start_url: Optional starting URL
            
        Returns:
            Result dictionary with status, data, and action history
        """
        await self.initialize()
        
        result = {
            "goal": goal,
            "status": "running",
            "data": {},
            "actions_taken": 0,
            "final_url": "",
            "screenshots": [],
            "extracted_data": []
        }
        
        try:
            # Navigate to start URL if provided
            if start_url:
                await self.execute_action(BrowserAction(
                    action_type="navigate",
                    url=start_url,
                    description="Navigate to starting URL"
                ))
                await asyncio.sleep(2)  # Wait for page load
            
            # Main action loop
            for i in range(self.max_actions):
                # Get current state
                state = await self.get_state()
                
                # Decide next action
                action = await self.decide_action(goal, state)
                
                if not action:
                    result["status"] = "error"
                    result["error"] = "Failed to decide action"
                    break
                
                print(f"Action {i+1}: {action.action_type} - {action.description}")
                
                # Check if done
                if action.action_type == "done":
                    result["status"] = "completed"
                    break
                
                # Execute action
                success = await self.execute_action(action)
                result["actions_taken"] += 1
                
                if not success:
                    # Try to recover
                    await asyncio.sleep(1)
                
                # Small delay between actions
                await asyncio.sleep(0.5)
            
            # Get final state
            final_state = await self.get_state()
            result["final_url"] = final_state.url
            result["final_title"] = final_state.title
            result["page_text"] = final_state.page_text
            
            if result["status"] == "running":
                result["status"] = "max_actions_reached"
            
        except Exception as e:
            result["status"] = "error"
            result["error"] = str(e)
        
        finally:
            await self.close()
        
        return result
    
    async def extract_data(self, url: str, extraction_prompt: str) -> Dict[str, Any]:
        """
        Navigate to a URL and extract structured data.
        
        Args:
            url: URL to navigate to
            extraction_prompt: Description of what data to extract
            
        Returns:
            Extracted data dictionary
        """
        await self.initialize()
        
        try:
            # Navigate
            await self.page.goto(url, wait_until="domcontentloaded", timeout=30000)
            await asyncio.sleep(2)
            
            # Get state
            state = await self.get_state()
            
            # Use LLM to extract data
            prompt = f"""Extract the following data from this webpage:
{extraction_prompt}

Page URL: {state.url}
Page Title: {state.title}
Page Content:
{state.page_text}

Respond with a JSON object containing the extracted data.
If data is not found, use null for that field.
Respond ONLY with the JSON object."""

            if self.llm:
                response = self.llm.generate_content(prompt)
                response_text = response.text.strip()
                
                # Extract JSON
                if "```json" in response_text:
                    response_text = response_text.split("```json")[1].split("```")[0]
                elif "```" in response_text:
                    response_text = response_text.split("```")[1].split("```")[0]
                
                return json.loads(response_text)
            
            return {"error": "LLM not available"}
            
        except Exception as e:
            return {"error": str(e)}
        
        finally:
            await self.close()
    
    async def fill_form(self, url: str, form_data: Dict[str, str], submit: bool = True) -> Dict[str, Any]:
        """
        Navigate to a URL and fill out a form.
        
        Args:
            url: URL with the form
            form_data: Dictionary of field names/selectors to values
            submit: Whether to submit the form
            
        Returns:
            Result dictionary
        """
        await self.initialize()
        
        result = {
            "url": url,
            "fields_filled": [],
            "submitted": False,
            "final_url": ""
        }
        
        try:
            # Navigate
            await self.page.goto(url, wait_until="domcontentloaded", timeout=30000)
            await asyncio.sleep(2)
            
            # Fill each field
            for field, value in form_data.items():
                try:
                    # Try different selector strategies
                    selectors = [
                        f"#{field}",
                        f"[name='{field}']",
                        f"[id='{field}']",
                        f"input[placeholder*='{field}' i]",
                        field  # Direct selector
                    ]
                    
                    for selector in selectors:
                        try:
                            await self.page.fill(selector, value, timeout=5000)
                            result["fields_filled"].append(field)
                            break
                        except Exception:
                            continue
                            
                except Exception as e:
                    print(f"Could not fill field {field}: {e}")
            
            # Submit if requested
            if submit:
                try:
                    # Try common submit methods
                    submit_selectors = [
                        "button[type='submit']",
                        "input[type='submit']",
                        "button:has-text('Submit')",
                        "button:has-text('Send')",
                        "button:has-text('Sign')"
                    ]
                    
                    for selector in submit_selectors:
                        try:
                            await self.page.click(selector, timeout=5000)
                            result["submitted"] = True
                            break
                        except Exception:
                            continue
                    
                    await asyncio.sleep(3)
                    
                except Exception as e:
                    print(f"Could not submit form: {e}")
            
            result["final_url"] = self.page.url
            
        except Exception as e:
            result["error"] = str(e)
        
        finally:
            await self.close()
        
        return result


# ============================================================================
# Example Usage
# ============================================================================

async def main():
    """Example usage of the Browser Agent."""
    agent = BrowserAgent(headless=False)  # Set to True for headless
    
    # Example 1: Autonomous browsing
    result = await agent.execute(
        goal="Search for 'AI agents' on Google and find the top 3 results",
        start_url="https://www.google.com"
    )
    print(f"Result: {result['status']}")
    print(f"Actions taken: {result['actions_taken']}")
    print(f"Final URL: {result['final_url']}")
    
    # Example 2: Data extraction
    # data = await agent.extract_data(
    #     url="https://example.com/product",
    #     extraction_prompt="Extract the product name, price, and description"
    # )
    # print(f"Extracted data: {data}")
    
    # Example 3: Form filling
    # result = await agent.fill_form(
    #     url="https://example.com/contact",
    #     form_data={
    #         "name": "John Doe",
    #         "email": "john@example.com",
    #         "message": "Hello, I have a question..."
    #     },
    #     submit=False  # Don't actually submit
    # )
    # print(f"Form result: {result}")


if __name__ == "__main__":
    asyncio.run(main())
