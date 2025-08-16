"""
Super Mega AI - Full System Demo Launcher
Runs the complete autonomous AI agent development company with visualization
"""

import asyncio
import logging
import os
from datetime import datetime
import json
from pathlib import Path
import websockets
import uvicorn
from fastapi import FastAPI, WebSocket
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

# Import all agents
from team_members.cto_agent.cto_agent import CTOAgent
from team_members.pm_agent.project_manager_agent import ProjectManagerAgent
from team_members.product_agent.product_development_agent import ProductDevelopmentAgent
from team_members.tech_lead_agent.tech_lead_agent import TechnicalLeadAgent
from team_members.senior_dev_agent.senior_developer_agent import SeniorDeveloperAgent
from team_members.qa_agent.qa_engineer_agent import QAEngineerAgent
from team_members.data_agent.data_analyst_agent import DataAnalystAgent
from team_members.research_agent.research_and_learning_agent import ResearchAndLearningAgent

# Import team configuration
from team_members.team_config import (
    TEAM_STRUCTURE,
    COMMUNICATION_CHANNELS,
    PRODUCT_FOCUS
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('super_mega_ai.log'),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger(__name__)

class SuperMegaAI:
    """Main system orchestrator"""
    
    def __init__(self):
        self.agents = {}
        self.agent_tasks = {}
        self.active_products = {}
        self.control_center = None
        self.websocket_clients = set()
        
        # Initialize FastAPI
        self.app = FastAPI(title="Super Mega AI Control Center")
        self.setup_api()
        
    def setup_api(self):
        """Setup FastAPI routes and middleware"""
        self.app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
        
        # Serve static files (Control Center UI)
        self.app.mount("/ui", StaticFiles(directory="control_center/build"), name="ui")
        
        @self.app.websocket("/ws")
        async def websocket_endpoint(websocket: WebSocket):
            await self.handle_websocket(websocket)

    async def initialize_agents(self):
        """Initialize all team agents"""
        logger.info("🚀 Initializing Super Mega AI team...")
        
        # Initialize core team
        self.agents = {
            "cto": CTOAgent(),
            "pm": ProjectManagerAgent(),
            "product": ProductDevelopmentAgent(),
            "tech_lead": TechnicalLeadAgent(),
            "senior_dev": SeniorDeveloperAgent(),
            "qa": QAEngineerAgent(),
            "data": DataAnalystAgent(),
            "research": ResearchAndLearningAgent()
        }
        
        # Initialize agent tasks
        for agent_id, agent in self.agents.items():
            self.agent_tasks[agent_id] = asyncio.create_task(agent.run())
            logger.info(f"✅ Initialized {agent_id} agent")
            
        logger.info("✨ All agents initialized successfully")

    async def start_development(self):
        """Start the autonomous development process"""
        logger.info("🏭 Starting autonomous development process")
        
        # Get product requirements
        requirements = PRODUCT_FOCUS['ai_automation_platform']
        
        # Create initial product development tasks
        initial_tasks = await self.create_initial_tasks(requirements)
        
        # Assign tasks to agents
        await self.assign_tasks(initial_tasks)
        
        # Start monitoring
        await self.start_monitoring()

    async def create_initial_tasks(self, requirements):
        """Create initial development tasks"""
        tasks = []
        
        # Architecture planning tasks
        tasks.extend(await self.agents['cto'].create_architecture_tasks(requirements))
        
        # Product development tasks
        tasks.extend(await self.agents['product'].create_product_tasks(requirements))
        
        # Technical implementation tasks
        tasks.extend(await self.agents['tech_lead'].create_technical_tasks(requirements))
        
        return tasks

    async def handle_websocket(self, websocket: WebSocket):
        """Handle WebSocket connections from Control Center"""
        await websocket.accept()
        self.websocket_clients.add(websocket)
        
        try:
            while True:
                data = await websocket.receive_json()
                await self.handle_control_center_message(websocket, data)
        except:
            self.websocket_clients.remove(websocket)

    async def broadcast_status(self):
        """Broadcast system status to Control Center"""
        while True:
            status = {
                "timestamp": datetime.now().isoformat(),
                "agents": {},
                "products": self.active_products,
                "system_metrics": await self.get_system_metrics()
            }
            
            # Gather agent status
            for agent_id, agent in self.agents.items():
                status["agents"][agent_id] = await agent.get_status()
            
            # Broadcast to all connected clients
            for client in self.websocket_clients:
                try:
                    await client.send_json(status)
                except:
                    self.websocket_clients.remove(client)
            
            await asyncio.sleep(1)  # Update every second

    async def start_monitoring(self):
        """Start system monitoring"""
        logger.info("📊 Starting system monitoring")
        
        monitoring_task = asyncio.create_task(self.broadcast_status())
        self.agent_tasks["monitoring"] = monitoring_task

    async def run(self):
        """Main system execution"""
        logger.info("🌟 Starting Super Mega AI system")
        
        try:
            # Initialize all agents
            await self.initialize_agents()
            
            # Start development process
            await self.start_development()
            
            # Start FastAPI server
            config = uvicorn.Config(
                app=self.app,
                host="0.0.0.0",
                port=8000,
                log_level="info"
            )
            server = uvicorn.Server(config)
            await server.serve()
            
        except Exception as e:
            logger.error(f"System error: {e}")
            # Cleanup
            for task in self.agent_tasks.values():
                task.cancel()

    def demo(self):
        """Run the system in demo mode"""
        logger.info("🎮 Starting Super Mega AI Demo")
        
        print("""
╔════════════════════════════════════════╗
║        SUPER MEGA AI DEMO MODE         ║
╠════════════════════════════════════════╣
║ 1. System is starting up...            ║
║ 2. Agents are being initialized...     ║
║ 3. Control Center will open at:        ║
║    http://localhost:8000/ui            ║
║                                        ║
║ Press Ctrl+C to stop the demo          ║
╚════════════════════════════════════════╝
        """)
        
        # Run the system
        asyncio.run(self.run())

if __name__ == "__main__":
    system = SuperMegaAI()
    system.demo()
