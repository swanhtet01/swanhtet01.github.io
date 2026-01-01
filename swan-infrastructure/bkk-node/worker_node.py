"""
BKK Node - Distributed Worker
Connects to AWS coordinator and executes assigned tasks
"""
import os
import json
import time
import logging
import httpx
import psutil
import asyncio
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any

# Configuration
AWS_API_URL = os.getenv("AWS_API_URL", "http://swan-aws:8000")
NODE_ID = "bkk"
HEARTBEAT_INTERVAL = 30  # seconds
POLL_INTERVAL = 5  # seconds

# Setup logging
LOG_DIR = Path("C:/SwanAI/logs")
LOG_DIR.mkdir(exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOG_DIR / f"worker_{datetime.now():%Y%m%d}.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("BKK-Worker")

# API Keys
ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY")
GEMINI_KEY = os.getenv("GEMINI_API_KEY")


class BKKWorker:
    def __init__(self):
        self.client = httpx.AsyncClient(timeout=60.0)
        self.active_tasks = 0
        self.data_dir = Path("C:/SwanAI/data")
        self.sync_dir = Path("C:/SwanAI/sync")
        
    async def send_heartbeat(self):
        """Send heartbeat to AWS coordinator"""
        try:
            status = {
                "node_id": NODE_ID,
                "status": "active",
                "last_heartbeat": datetime.now().isoformat(),
                "cpu": psutil.cpu_percent(),
                "memory": psutil.virtual_memory().percent,
                "active_tasks": self.active_tasks
            }
            
            response = await self.client.post(
                f"{AWS_API_URL}/nodes/heartbeat",
                json=status
            )
            
            if response.status_code == 200:
                logger.debug("Heartbeat sent successfully")
            else:
                logger.warning(f"Heartbeat failed: {response.status_code}")
                
        except Exception as e:
            logger.error(f"Heartbeat error: {e}")
    
    async def poll_tasks(self):
        """Poll for pending tasks assigned to this node"""
        try:
            response = await self.client.get(
                f"{AWS_API_URL}/tasks/pending",
                params={"node": NODE_ID}
            )
            
            if response.status_code == 200:
                tasks = response.json()
                return tasks
            return []
            
        except Exception as e:
            logger.error(f"Poll error: {e}")
            return []
    
    async def execute_task(self, task: Dict[str, Any]):
        """Execute a task"""
        task_id = task.get("id")
        task_type = task.get("type")
        payload = task.get("payload", {})
        
        logger.info(f"Executing task {task_id}: {task_type}")
        self.active_tasks += 1
        
        try:
            result = None
            
            if task_type == "process_file":
                result = await self.process_file(payload)
            elif task_type == "generate_report":
                result = await self.generate_report(payload)
            elif task_type == "scrape_url":
                result = await self.scrape_url(payload)
            elif task_type == "ai_chat":
                result = await self.ai_chat(payload)
            else:
                logger.warning(f"Unknown task type: {task_type}")
                result = {"error": f"Unknown task type: {task_type}"}
            
            # Report completion
            await self.report_task_complete(task_id, result)
            
        except Exception as e:
            logger.error(f"Task {task_id} failed: {e}")
            await self.report_task_failed(task_id, str(e))
            
        finally:
            self.active_tasks -= 1
    
    async def process_file(self, payload: Dict) -> Dict:
        """Process a file with AI"""
        file_url = payload.get("file_url")
        processing_type = payload.get("processing_type", "extract")
        
        logger.info(f"Processing file: {file_url}")
        
        # Download file
        response = await self.client.get(file_url)
        file_content = response.content
        
        # Process based on type
        if processing_type == "extract":
            # Use Gemini for vision/document extraction
            import google.generativeai as genai
            genai.configure(api_key=GEMINI_KEY)
            model = genai.GenerativeModel('gemini-1.5-flash')
            
            result = model.generate_content([
                "Extract all data from this document. Return as structured JSON.",
                file_content
            ])
            
            return {"extracted_data": result.text}
        
        return {"status": "processed"}
    
    async def generate_report(self, payload: Dict) -> Dict:
        """Generate a report using Claude"""
        import anthropic
        
        report_type = payload.get("report_type", "summary")
        data = payload.get("data", {})
        
        client = anthropic.Anthropic(api_key=ANTHROPIC_KEY)
        
        response = client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=4096,
            messages=[{
                "role": "user",
                "content": f"""Generate a professional {report_type} report based on this data:
                
{json.dumps(data, indent=2)}

Include:
- Executive summary
- Key findings
- Recommendations
- Data tables where appropriate"""
            }]
        )
        
        return {"report": response.content[0].text}
    
    async def scrape_url(self, payload: Dict) -> Dict:
        """Scrape and analyze a URL"""
        from playwright.async_api import async_playwright
        
        url = payload.get("url")
        analysis_prompt = payload.get("analysis_prompt", "Summarize this page")
        
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()
            await page.goto(url)
            content = await page.content()
            await browser.close()
        
        # Analyze with Claude
        import anthropic
        client = anthropic.Anthropic(api_key=ANTHROPIC_KEY)
        
        response = client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=2048,
            messages=[{
                "role": "user",
                "content": f"{analysis_prompt}\n\nPage content:\n{content[:10000]}"
            }]
        )
        
        return {"analysis": response.content[0].text}
    
    async def ai_chat(self, payload: Dict) -> Dict:
        """Direct AI chat"""
        import anthropic
        
        messages = payload.get("messages", [])
        
        client = anthropic.Anthropic(api_key=ANTHROPIC_KEY)
        
        response = client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=4096,
            messages=messages
        )
        
        return {"response": response.content[0].text}
    
    async def report_task_complete(self, task_id: str, result: Dict):
        """Report task completion to coordinator"""
        try:
            await self.client.post(
                f"{AWS_API_URL}/tasks/{task_id}/complete",
                json={"result": result}
            )
        except Exception as e:
            logger.error(f"Failed to report completion: {e}")
    
    async def report_task_failed(self, task_id: str, error: str):
        """Report task failure to coordinator"""
        try:
            await self.client.post(
                f"{AWS_API_URL}/tasks/{task_id}/failed",
                json={"error": error}
            )
        except Exception as e:
            logger.error(f"Failed to report failure: {e}")
    
    async def run(self):
        """Main worker loop"""
        logger.info(f"BKK Worker starting - connecting to {AWS_API_URL}")
        
        last_heartbeat = 0
        
        while True:
            try:
                # Send heartbeat periodically
                now = time.time()
                if now - last_heartbeat > HEARTBEAT_INTERVAL:
                    await self.send_heartbeat()
                    last_heartbeat = now
                
                # Poll for tasks
                tasks = await self.poll_tasks()
                
                # Execute tasks (one at a time for now)
                for task in tasks[:1]:  # Process one task at a time
                    await self.execute_task(task)
                
                # Wait before next poll
                await asyncio.sleep(POLL_INTERVAL)
                
            except Exception as e:
                logger.error(f"Worker loop error: {e}")
                await asyncio.sleep(10)


async def main():
    worker = BKKWorker()
    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
