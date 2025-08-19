#!/usr/bin/env python3
"""
🧠 CENTRAL NERVOUS SYSTEM (CNS)
==============================
Advanced LLM-powered coordination system for SuperMega AI agents
- Multi-agent orchestration and communication
- Task delegation and resource management  
- Knowledge sharing and learning coordination
- Real-time decision making and optimization
- Agent health monitoring and auto-recovery
"""

import asyncio
import json
import time
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, asdict
from enum import Enum
import redis
import psycopg2
from transformers import AutoTokenizer, AutoModelForCausalLM, pipeline
import torch
import httpx
import websockets
import threading
from concurrent.futures import ThreadPoolExecutor

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class AgentStatus(Enum):
    ACTIVE = "active"
    IDLE = "idle"
    BUSY = "busy"
    ERROR = "error"
    OFFLINE = "offline"

class TaskPriority(Enum):
    CRITICAL = 1
    HIGH = 2
    MEDIUM = 3
    LOW = 4

@dataclass
class Agent:
    id: str
    name: str
    type: str
    capabilities: List[str]
    endpoint: str
    status: AgentStatus
    current_task: Optional[str] = None
    last_heartbeat: Optional[datetime] = None
    performance_score: float = 1.0
    load_factor: float = 0.0

@dataclass
class Task:
    id: str
    type: str
    description: str
    priority: TaskPriority
    required_capabilities: List[str]
    assigned_agent: Optional[str] = None
    status: str = "pending"
    created_at: datetime = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

@dataclass
class KnowledgeEntry:
    id: str
    content: str
    embedding: List[float]
    metadata: Dict[str, Any]
    created_at: datetime
    relevance_score: float = 0.0

class CentralNervousSystem:
    def __init__(self):
        logger.info("🧠 Initializing Central Nervous System...")
        
        # Initialize connections
        self.redis_client = None
        self.postgres_conn = None
        self.llm_pipeline = None
        self.embedding_model = None
        
        # Agent registry
        self.agents: Dict[str, Agent] = {}
        self.task_queue: List[Task] = []
        self.knowledge_base: Dict[str, KnowledgeEntry] = {}
        
        # System state
        self.system_health = {"status": "initializing", "last_check": datetime.now()}
        self.performance_metrics = {"tasks_completed": 0, "avg_response_time": 0.0}
        
        # Event loop and executors
        self.loop = None
        self.executor = ThreadPoolExecutor(max_workers=10)
        self.running = False
        
        # Initialize components
        self.initialize_llm()
        self.initialize_database_connections()
        self.register_default_agents()
        
        logger.info("✅ Central Nervous System initialized")
    
    def initialize_llm(self):
        """Initialize the central LLM for coordination"""
        try:
            logger.info("🤖 Loading central coordination LLM...")
            
            # Use a lightweight but capable model for coordination
            model_name = "microsoft/DialoGPT-medium"
            
            self.tokenizer = AutoTokenizer.from_pretrained(model_name)
            self.llm_model = AutoModelForCausalLM.from_pretrained(model_name)
            
            # Add padding token if missing
            if self.tokenizer.pad_token is None:
                self.tokenizer.pad_token = self.tokenizer.eos_token
            
            # Create text generation pipeline
            self.llm_pipeline = pipeline(
                "text-generation",
                model=self.llm_model,
                tokenizer=self.tokenizer,
                max_length=512,
                do_sample=True,
                temperature=0.7,
                device=0 if torch.cuda.is_available() else -1
            )
            
            # Initialize embedding model for knowledge base
            from sentence_transformers import SentenceTransformer
            self.embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
            
            logger.info("✅ LLM coordination system loaded")
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize LLM: {e}")
            # Fallback to rule-based coordination
            self.llm_pipeline = None
    
    def initialize_database_connections(self):
        """Initialize Redis and PostgreSQL connections"""
        try:
            # Redis for real-time communication and caching
            self.redis_client = redis.Redis(
                host='localhost',  # Will be replaced with ElastiCache endpoint
                port=6379,
                decode_responses=True
            )
            self.redis_client.ping()
            logger.info("✅ Redis connection established")
            
        except Exception as e:
            logger.warning(f"⚠️ Redis not available: {e}")
            self.redis_client = None
        
        try:
            # PostgreSQL for persistent knowledge storage
            self.postgres_conn = psycopg2.connect(
                host='localhost',  # Will be replaced with RDS endpoint
                port=5432,
                database='supermega_knowledge',
                user='supermega_admin',
                password='SuperMega2025!'
            )
            
            # Create knowledge base table
            with self.postgres_conn.cursor() as cur:
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS knowledge_entries (
                        id VARCHAR PRIMARY KEY,
                        content TEXT,
                        embedding FLOAT[],
                        metadata JSONB,
                        created_at TIMESTAMP,
                        relevance_score FLOAT DEFAULT 0.0
                    )
                """)
            self.postgres_conn.commit()
            logger.info("✅ PostgreSQL connection established")
            
        except Exception as e:
            logger.warning(f"⚠️ PostgreSQL not available: {e}")
            self.postgres_conn = None
    
    def register_default_agents(self):
        """Register the SuperMega AI product agents"""
        default_agents = [
            Agent(
                id="universal-content-creator",
                name="Universal Content Creator",
                type="content_creation",
                capabilities=["video_editing", "content_analysis", "voice_control", "ai_effects"],
                endpoint="http://localhost:8503",
                status=AgentStatus.IDLE
            ),
            Agent(
                id="advanced-voice-studio",
                name="Advanced Voice Studio Pro",
                type="voice_synthesis",
                capabilities=["voice_cloning", "synthesis", "quality_analysis", "guided_collection"],
                endpoint="http://localhost:8504",
                status=AgentStatus.IDLE
            ),
            Agent(
                id="enhanced-coding-companion",
                name="Enhanced AI Coding Companion",
                type="development",
                capabilities=["code_analysis", "architecture_design", "voice_programming", "ai_pairing"],
                endpoint="http://localhost:8505",
                status=AgentStatus.IDLE
            ),
            Agent(
                id="business-intelligence",
                name="Business Intelligence Suite",
                type="analytics",
                capabilities=["predictive_analytics", "dashboard_creation", "business_insights", "tool_integration"],
                endpoint="http://localhost:8506",
                status=AgentStatus.IDLE
            ),
            Agent(
                id="research-intelligence",
                name="Research Intelligence Hub",
                type="research",
                capabilities=["literature_analysis", "knowledge_graphs", "collaboration", "research_insights"],
                endpoint="http://localhost:8507",
                status=AgentStatus.IDLE
            ),
            Agent(
                id="creative-design-suite",
                name="Creative Design Suite",
                type="design",
                capabilities=["3d_modeling", "cad_design", "ai_design_assist", "collaborative_design"],
                endpoint="http://localhost:8508",
                status=AgentStatus.IDLE
            )
        ]
        
        for agent in default_agents:
            self.agents[agent.id] = agent
            logger.info(f"📝 Registered agent: {agent.name}")
    
    async def coordinate_agents(self):
        """Main coordination loop"""
        logger.info("🧠 Starting agent coordination...")
        self.running = True
        
        while self.running:
            try:
                # Health check all agents
                await self.health_check_agents()
                
                # Process task queue
                await self.process_task_queue()
                
                # Update knowledge base
                await self.update_knowledge_base()
                
                # Optimize agent performance
                await self.optimize_agent_performance()
                
                # Update system metrics
                self.update_system_metrics()
                
                # Wait before next cycle
                await asyncio.sleep(5)
                
            except Exception as e:
                logger.error(f"❌ Error in coordination loop: {e}")
                await asyncio.sleep(10)
    
    async def health_check_agents(self):
        """Check health and status of all agents"""
        for agent_id, agent in self.agents.items():
            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    response = await client.get(f"{agent.endpoint}/health")
                    
                    if response.status_code == 200:
                        agent.status = AgentStatus.ACTIVE
                        agent.last_heartbeat = datetime.now()
                        
                        # Update load factor from response
                        health_data = response.json()
                        agent.load_factor = health_data.get("load_factor", 0.0)
                        
                    else:
                        agent.status = AgentStatus.ERROR
                        
            except Exception as e:
                agent.status = AgentStatus.OFFLINE
                logger.warning(f"⚠️ Agent {agent.name} is offline: {e}")
    
    async def process_task_queue(self):
        """Process pending tasks and assign to appropriate agents"""
        for task in self.task_queue.copy():
            if task.status == "pending":
                # Find best agent for task
                best_agent = self.find_best_agent(task)
                
                if best_agent:
                    # Assign task to agent
                    await self.assign_task_to_agent(task, best_agent)
                    task.assigned_agent = best_agent.id
                    task.status = "assigned"
                    task.started_at = datetime.now()
                    
                    logger.info(f"📋 Assigned task {task.id} to {best_agent.name}")
                else:
                    logger.warning(f"⚠️ No available agent for task {task.id}")
    
    def find_best_agent(self, task: Task) -> Optional[Agent]:
        """Find the best agent for a given task using LLM reasoning"""
        available_agents = [
            agent for agent in self.agents.values()
            if agent.status in [AgentStatus.ACTIVE, AgentStatus.IDLE] and
            any(cap in agent.capabilities for cap in task.required_capabilities)
        ]
        
        if not available_agents:
            return None
        
        # Use LLM to make intelligent assignment decision
        if self.llm_pipeline:
            decision = self.llm_assisted_agent_selection(task, available_agents)
            if decision:
                return decision
        
        # Fallback to rule-based selection
        # Consider load factor, performance score, and capability match
        scored_agents = []
        for agent in available_agents:
            capability_score = len(set(task.required_capabilities) & set(agent.capabilities))
            load_score = 1.0 - agent.load_factor  # Lower load is better
            performance_score = agent.performance_score
            
            total_score = (capability_score * 0.4 + load_score * 0.3 + performance_score * 0.3)
            scored_agents.append((agent, total_score))
        
        # Return agent with highest score
        if scored_agents:
            return max(scored_agents, key=lambda x: x[1])[0]
        
        return None
    
    def llm_assisted_agent_selection(self, task: Task, agents: List[Agent]) -> Optional[Agent]:
        """Use LLM to make intelligent agent selection decisions"""
        try:
            # Create context for LLM
            context = f"""
Task: {task.description}
Required capabilities: {', '.join(task.required_capabilities)}
Priority: {task.priority.name}

Available agents:
"""
            
            for agent in agents:
                context += f"- {agent.name}: {', '.join(agent.capabilities)} (Load: {agent.load_factor:.2f}, Performance: {agent.performance_score:.2f})\n"
            
            context += "\nWhich agent should handle this task? Consider capabilities, current load, and performance."
            
            # Generate response
            response = self.llm_pipeline(context, max_length=len(context) + 100, num_return_sequences=1)
            decision_text = response[0]['generated_text'][len(context):].strip()
            
            # Parse LLM response to find selected agent
            for agent in agents:
                if agent.name.lower() in decision_text.lower():
                    return agent
            
        except Exception as e:
            logger.warning(f"⚠️ LLM agent selection failed: {e}")
        
        return None
    
    async def assign_task_to_agent(self, task: Task, agent: Agent):
        """Assign a task to a specific agent"""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                task_data = {
                    "task_id": task.id,
                    "type": task.type,
                    "description": task.description,
                    "priority": task.priority.name,
                    "metadata": asdict(task)
                }
                
                response = await client.post(
                    f"{agent.endpoint}/execute_task",
                    json=task_data
                )
                
                if response.status_code == 200:
                    agent.status = AgentStatus.BUSY
                    agent.current_task = task.id
                    logger.info(f"✅ Task {task.id} assigned to {agent.name}")
                else:
                    logger.error(f"❌ Failed to assign task to {agent.name}: {response.status_code}")
                    
        except Exception as e:
            logger.error(f"❌ Error assigning task to {agent.name}: {e}")
    
    async def update_knowledge_base(self):
        """Update the shared knowledge base with learnings from agents"""
        for agent_id, agent in self.agents.items():
            if agent.status == AgentStatus.ACTIVE:
                try:
                    # Request knowledge updates from agent
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        response = await client.get(f"{agent.endpoint}/knowledge_updates")
                        
                        if response.status_code == 200:
                            updates = response.json()
                            await self.process_knowledge_updates(agent_id, updates)
                            
                except Exception as e:
                    logger.warning(f"⚠️ Failed to get knowledge updates from {agent.name}: {e}")
    
    async def process_knowledge_updates(self, agent_id: str, updates: Dict[str, Any]):
        """Process knowledge updates from an agent"""
        for update in updates.get("knowledge_entries", []):
            try:
                # Generate embedding for the knowledge entry
                embedding = self.embedding_model.encode(update["content"]).tolist()
                
                # Create knowledge entry
                entry = KnowledgeEntry(
                    id=f"{agent_id}_{update['id']}",
                    content=update["content"],
                    embedding=embedding,
                    metadata={**update.get("metadata", {}), "source_agent": agent_id},
                    created_at=datetime.now()
                )
                
                # Store in memory
                self.knowledge_base[entry.id] = entry
                
                # Store in database if available
                if self.postgres_conn:
                    with self.postgres_conn.cursor() as cur:
                        cur.execute("""
                            INSERT INTO knowledge_entries 
                            (id, content, embedding, metadata, created_at)
                            VALUES (%s, %s, %s, %s, %s)
                            ON CONFLICT (id) DO UPDATE SET
                            content = EXCLUDED.content,
                            embedding = EXCLUDED.embedding,
                            metadata = EXCLUDED.metadata
                        """, (entry.id, entry.content, entry.embedding, 
                             json.dumps(entry.metadata), entry.created_at))
                    self.postgres_conn.commit()
                
                logger.info(f"📚 Added knowledge entry from {agent_id}")
                
            except Exception as e:
                logger.error(f"❌ Error processing knowledge update: {e}")
    
    async def optimize_agent_performance(self):
        """Optimize agent performance based on metrics and learning"""
        for agent_id, agent in self.agents.items():
            try:
                # Calculate performance metrics
                completed_tasks = self.get_agent_completed_tasks(agent_id)
                avg_completion_time = self.calculate_avg_completion_time(agent_id)
                error_rate = self.calculate_error_rate(agent_id)
                
                # Update performance score
                if completed_tasks > 0:
                    time_factor = max(0.1, min(2.0, 30.0 / avg_completion_time)) if avg_completion_time > 0 else 1.0
                    error_factor = max(0.1, 1.0 - error_rate)
                    agent.performance_score = time_factor * error_factor
                
                # Send optimization suggestions to agent
                if agent.status == AgentStatus.ACTIVE:
                    suggestions = await self.generate_optimization_suggestions(agent)
                    if suggestions:
                        await self.send_optimization_suggestions(agent, suggestions)
                        
            except Exception as e:
                logger.error(f"❌ Error optimizing {agent.name}: {e}")
    
    async def generate_optimization_suggestions(self, agent: Agent) -> List[str]:
        """Generate optimization suggestions for an agent using LLM"""
        if not self.llm_pipeline:
            return []
        
        try:
            context = f"""
Agent: {agent.name}
Type: {agent.type}
Capabilities: {', '.join(agent.capabilities)}
Current load: {agent.load_factor:.2f}
Performance score: {agent.performance_score:.2f}

Generate 3 specific optimization suggestions for this AI agent to improve its performance and efficiency:
1."""
            
            response = self.llm_pipeline(context, max_length=len(context) + 200)
            suggestions_text = response[0]['generated_text'][len(context):].strip()
            
            # Parse suggestions
            suggestions = []
            for line in suggestions_text.split('\n'):
                if line.strip() and any(char.isdigit() for char in line[:3]):
                    suggestions.append(line.strip())
            
            return suggestions[:3]  # Return max 3 suggestions
            
        except Exception as e:
            logger.warning(f"⚠️ Failed to generate optimization suggestions: {e}")
            return []
    
    async def send_optimization_suggestions(self, agent: Agent, suggestions: List[str]):
        """Send optimization suggestions to an agent"""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    f"{agent.endpoint}/optimize",
                    json={"suggestions": suggestions}
                )
                
                if response.status_code == 200:
                    logger.info(f"📈 Sent optimization suggestions to {agent.name}")
                    
        except Exception as e:
            logger.warning(f"⚠️ Failed to send optimization suggestions to {agent.name}: {e}")
    
    def get_agent_completed_tasks(self, agent_id: str) -> int:
        """Get number of completed tasks for an agent"""
        return len([t for t in self.task_queue if t.assigned_agent == agent_id and t.status == "completed"])
    
    def calculate_avg_completion_time(self, agent_id: str) -> float:
        """Calculate average task completion time for an agent"""
        completed_tasks = [
            t for t in self.task_queue 
            if t.assigned_agent == agent_id and t.status == "completed" and 
            t.started_at and t.completed_at
        ]
        
        if not completed_tasks:
            return 0.0
        
        total_time = sum([
            (t.completed_at - t.started_at).total_seconds() 
            for t in completed_tasks
        ])
        
        return total_time / len(completed_tasks)
    
    def calculate_error_rate(self, agent_id: str) -> float:
        """Calculate error rate for an agent"""
        agent_tasks = [t for t in self.task_queue if t.assigned_agent == agent_id]
        if not agent_tasks:
            return 0.0
        
        error_tasks = [t for t in agent_tasks if t.status == "error"]
        return len(error_tasks) / len(agent_tasks)
    
    def update_system_metrics(self):
        """Update overall system performance metrics"""
        completed_tasks = len([t for t in self.task_queue if t.status == "completed"])
        
        if completed_tasks > 0:
            total_time = sum([
                (t.completed_at - t.started_at).total_seconds()
                for t in self.task_queue
                if t.status == "completed" and t.started_at and t.completed_at
            ])
            avg_time = total_time / completed_tasks if completed_tasks > 0 else 0
        else:
            avg_time = 0
        
        self.performance_metrics = {
            "tasks_completed": completed_tasks,
            "avg_response_time": avg_time,
            "active_agents": len([a for a in self.agents.values() if a.status == AgentStatus.ACTIVE]),
            "system_load": sum([a.load_factor for a in self.agents.values()]) / len(self.agents)
        }
        
        self.system_health = {
            "status": "healthy" if completed_tasks > 0 else "idle",
            "last_check": datetime.now()
        }
    
    def add_task(self, task: Task):
        """Add a new task to the coordination queue"""
        if task.created_at is None:
            task.created_at = datetime.now()
        
        self.task_queue.append(task)
        logger.info(f"📋 Added task: {task.description}")
        
        # Store task in Redis for persistence
        if self.redis_client:
            self.redis_client.hset(
                f"task:{task.id}",
                mapping=asdict(task)
            )
    
    def get_system_status(self) -> Dict[str, Any]:
        """Get comprehensive system status"""
        return {
            "system_health": self.system_health,
            "performance_metrics": self.performance_metrics,
            "agents": {
                agent_id: {
                    "name": agent.name,
                    "status": agent.status.value,
                    "load_factor": agent.load_factor,
                    "performance_score": agent.performance_score,
                    "current_task": agent.current_task,
                    "last_heartbeat": agent.last_heartbeat.isoformat() if agent.last_heartbeat else None
                }
                for agent_id, agent in self.agents.items()
            },
            "task_queue": {
                "total_tasks": len(self.task_queue),
                "pending": len([t for t in self.task_queue if t.status == "pending"]),
                "assigned": len([t for t in self.task_queue if t.status == "assigned"]),
                "completed": len([t for t in self.task_queue if t.status == "completed"])
            },
            "knowledge_base": {
                "total_entries": len(self.knowledge_base),
                "recent_entries": len([
                    e for e in self.knowledge_base.values()
                    if e.created_at > datetime.now() - timedelta(hours=24)
                ])
            }
        }

# Global CNS instance
cns_instance = None

async def start_central_nervous_system():
    """Start the Central Nervous System"""
    global cns_instance
    
    logger.info("🧠 Starting SuperMega Central Nervous System...")
    
    cns_instance = CentralNervousSystem()
    await cns_instance.coordinate_agents()

def run_cns():
    """Run the Central Nervous System in event loop"""
    asyncio.run(start_central_nervous_system())

if __name__ == "__main__":
    try:
        run_cns()
    except KeyboardInterrupt:
        logger.info("🛑 Central Nervous System shutdown requested")
        if cns_instance:
            cns_instance.running = False
    except Exception as e:
        logger.error(f"❌ Central Nervous System error: {e}")
        raise
