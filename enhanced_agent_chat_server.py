#!/usr/bin/env python3
"""
Enhanced LLM Agent Chat Server
Real AI-powered multi-agent collaboration system

Replaces template responses with genuine LLM-powered agents that:
1. Use real OpenAI API calls
2. Have specialized expertise and memory
3. Collaborate dynamically on complex problems
4. Learn and improve from interactions
"""

import asyncio
import json
import os
import sqlite3
import time
import logging
from datetime import datetime
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, asdict

import openai
import socketio
from aiohttp import web
from aiohttp_cors import setup as cors_setup, ResourceOptions

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# =============================================================================
# ENHANCED AGENT SYSTEM
# =============================================================================

@dataclass
class AgentMemory:
    """Agent's memory system for learning and context retention"""
    conversation_history: List[Dict] = None
    expertise_knowledge: Dict[str, Any] = None
    performance_metrics: Dict[str, float] = None
    learned_patterns: List[str] = None
    
    def __post_init__(self):
        if self.conversation_history is None:
            self.conversation_history = []
        if self.expertise_knowledge is None:
            self.expertise_knowledge = {}
        if self.performance_metrics is None:
            self.performance_metrics = {"response_quality": 0.8, "user_satisfaction": 0.7}
        if self.learned_patterns is None:
            self.learned_patterns = []

class LLMPoweredAgent:
    """Base class for LLM-powered agents with real AI capabilities"""
    
    def __init__(self, name: str, role: str, expertise_areas: List[str], system_prompt: str):
        self.name = name
        self.role = role
        self.expertise_areas = expertise_areas
        self.system_prompt = system_prompt
        self.memory = AgentMemory()
        
        # Initialize OpenAI
        self.api_key = os.getenv('OPENAI_API_KEY')
        if not self.api_key:
            logger.warning(f"No OpenAI API key for {name} - using fallback responses")
            self.llm_enabled = False
        else:
            openai.api_key = self.api_key
            self.llm_enabled = True
            self.model = "gpt-4"
    
    async def generate_response(self, message: str, context: Dict = None, collaboration_context: Dict = None) -> Dict:
        """Generate intelligent response using LLM"""
        
        if not self.llm_enabled:
            return await self._fallback_response(message)
        
        try:
            # Build conversation context
            conversation_context = self._build_conversation_context(message, context, collaboration_context)
            
            # Generate response using OpenAI
            response = await openai.ChatCompletion.acreate(
                model=self.model,
                messages=conversation_context,
                max_tokens=800,
                temperature=0.7,
                presence_penalty=0.1,
                frequency_penalty=0.1
            )
            
            ai_response = response.choices[0].message.content
            
            # Process and enhance response
            enhanced_response = await self._enhance_response(ai_response, message, context)
            
            # Store interaction in memory
            self._store_interaction(message, enhanced_response, context)
            
            return {
                'content': enhanced_response,
                'agent': self.name,
                'timestamp': datetime.now().isoformat(),
                'confidence': 0.9,
                'sources': self._get_knowledge_sources(),
                'suggested_actions': self._extract_actions(enhanced_response)
            }
            
        except Exception as e:
            logger.error(f"LLM response generation failed for {self.name}: {e}")
            return await self._fallback_response(message)
    
    def _build_conversation_context(self, message: str, context: Dict, collaboration_context: Dict) -> List[Dict]:
        """Build comprehensive conversation context for LLM"""
        
        messages = [
            {"role": "system", "content": self.system_prompt}
        ]
        
        # Add relevant conversation history
        if self.memory.conversation_history:
            recent_history = self.memory.conversation_history[-5:]  # Last 5 interactions
            for interaction in recent_history:
                if interaction.get('user_message'):
                    messages.append({"role": "user", "content": interaction['user_message']})
                if interaction.get('agent_response'):
                    messages.append({"role": "assistant", "content": interaction['agent_response']})
        
        # Add context from other agents if collaborating
        if collaboration_context:
            context_summary = f"Other agents have provided: {json.dumps(collaboration_context, indent=2)}"
            messages.append({"role": "system", "content": f"Collaboration context: {context_summary}"})
        
        # Add current user message
        user_context = ""
        if context:
            user_context = f"Additional context: {json.dumps(context, indent=2)}\n"
        
        messages.append({"role": "user", "content": f"{user_context}User request: {message}"})
        
        return messages
    
    async def _enhance_response(self, ai_response: str, original_message: str, context: Dict) -> str:
        """Enhance the AI response with agent-specific formatting and insights"""
        
        # Add agent-specific insights
        insights = await self._generate_specific_insights(original_message, context)
        
        # Format response with role-specific styling
        enhanced = f"""**{self.role} Analysis:**

{ai_response}

**💡 {self.name} Insights:**
{insights}

**⚡ Next Steps Recommended:**
{self._generate_next_steps(ai_response, original_message)}

---
*Analysis by {self.name} | Expertise: {', '.join(self.expertise_areas)}*
"""
        return enhanced
    
    async def _generate_specific_insights(self, message: str, context: Dict) -> str:
        """Generate agent-specific insights based on expertise"""
        
        if not self.llm_enabled:
            return f"Based on my {self.expertise_areas[0]} expertise, this requires further analysis."
        
        try:
            insight_prompt = f"""As a {self.role} with expertise in {', '.join(self.expertise_areas)}, 
            provide 2-3 specific insights about: {message}
            
            Focus on actionable insights that only someone with your expertise would provide.
            Be concise and practical."""
            
            response = await openai.ChatCompletion.acreate(
                model=self.model,
                messages=[{"role": "user", "content": insight_prompt}],
                max_tokens=300,
                temperature=0.6
            )
            
            return response.choices[0].message.content
            
        except Exception as e:
            logger.error(f"Insight generation failed: {e}")
            return f"Specialized {self.role} analysis in progress..."
    
    def _generate_next_steps(self, response: str, original_message: str) -> str:
        """Extract actionable next steps from the response"""
        
        # Simple extraction of action-oriented phrases
        action_keywords = ["should", "need to", "must", "recommend", "suggest", "consider"]
        lines = response.split('\n')
        
        next_steps = []
        for line in lines:
            if any(keyword in line.lower() for keyword in action_keywords):
                next_steps.append(line.strip())
        
        if next_steps:
            return '\n'.join([f"• {step}" for step in next_steps[:3]])
        else:
            return f"• Continue analysis with {self.role} perspective\n• Consider implementation approach\n• Plan resource requirements"
    
    def _extract_actions(self, response: str) -> List[str]:
        """Extract suggested actions from response"""
        
        actions = []
        lines = response.split('\n')
        
        for line in lines:
            if line.strip().startswith('•') or line.strip().startswith('-'):
                actions.append(line.strip())
        
        return actions[:5]  # Return top 5 actions
    
    def _get_knowledge_sources(self) -> List[str]:
        """Return relevant knowledge sources for this agent"""
        
        source_mapping = {
            "Business Strategist": ["Market Analysis", "Financial Modeling", "Strategic Planning"],
            "Technical Architect": ["System Design", "Performance Optimization", "Security Best Practices"],
            "AI Specialist": ["Machine Learning", "Deep Learning", "AI Ethics"],
            "Product Manager": ["User Research", "Feature Prioritization", "Product Analytics"],
            "Copilot Coordinator": ["Multi-Agent Systems", "Task Orchestration", "Decision Synthesis"]
        }
        
        return source_mapping.get(self.role, ["General Knowledge", "Best Practices"])
    
    def _store_interaction(self, message: str, response: str, context: Dict):
        """Store interaction in agent memory"""
        
        interaction = {
            'timestamp': datetime.now().isoformat(),
            'user_message': message,
            'agent_response': response,
            'context': context,
            'agent_name': self.name
        }
        
        self.memory.conversation_history.append(interaction)
        
        # Keep only last 50 interactions to manage memory
        if len(self.memory.conversation_history) > 50:
            self.memory.conversation_history = self.memory.conversation_history[-50:]
    
    async def _fallback_response(self, message: str) -> Dict:
        """Fallback response when LLM is not available"""
        
        fallback_responses = {
            "Business Strategist": f"From a strategic business perspective, I'm analyzing your request about '{message[:50]}...' and will provide insights on market opportunities, revenue impact, and competitive advantages.",
            
            "Technical Architect": f"I'm evaluating the technical requirements for '{message[:50]}...' including architecture design, scalability considerations, and implementation complexity.",
            
            "AI Specialist": f"Analyzing the AI/ML opportunities in your request '{message[:50]}...' including automation potential, intelligent optimization, and predictive capabilities.",
            
            "Product Manager": f"From a product perspective, I'm assessing '{message[:50]}...' for user impact, feature prioritization, and development roadmap implications.",
            
            "Copilot Coordinator": f"Coordinating multi-agent analysis for '{message[:50]}...' to provide comprehensive insights from all specialized perspectives."
        }
        
        return {
            'content': fallback_responses.get(self.role, f"Processing your request as {self.role}..."),
            'agent': self.name,
            'timestamp': datetime.now().isoformat(),
            'confidence': 0.6,
            'sources': ['Fallback System'],
            'suggested_actions': ['Connect OpenAI API for enhanced responses']
        }

class EnhancedAgentOrchestrator:
    """Orchestrates multiple LLM agents for collaborative problem-solving"""
    
    def __init__(self):
        self.agents = self._initialize_agents()
        self.collaboration_history = []
        self._setup_database()
    
    def _initialize_agents(self) -> Dict[str, LLMPoweredAgent]:
        """Initialize all specialized agents"""
        
        agents = {}
        
        # Business Strategist Agent
        agents['business_strategist'] = LLMPoweredAgent(
            name="Strategic Business Advisor",
            role="Business Strategist",
            expertise_areas=["Strategic Planning", "Market Analysis", "Revenue Optimization", "Competitive Intelligence"],
            system_prompt="""You are a Strategic Business Advisor with deep expertise in business strategy, 
            market analysis, and revenue optimization. Analyze requests from a business perspective, focusing on:
            - Revenue and profit implications
            - Market opportunities and risks
            - Competitive advantages
            - Strategic recommendations
            - ROI and business metrics
            
            Provide actionable business insights that drive growth and profitability."""
        )
        
        # Technical Architect Agent  
        agents['technical_architect'] = LLMPoweredAgent(
            name="Senior Technical Architect",
            role="Technical Architect", 
            expertise_areas=["System Architecture", "Scalability", "Performance", "Security", "Cloud Infrastructure"],
            system_prompt="""You are a Senior Technical Architect with expertise in designing scalable, 
            secure, and high-performance systems. Focus on:
            - System architecture and design patterns
            - Scalability and performance optimization
            - Security best practices
            - Technology stack recommendations
            - Implementation complexity and risks
            
            Provide technical solutions that are robust, maintainable, and efficient."""
        )
        
        # AI Specialist Agent
        agents['ai_specialist'] = LLMPoweredAgent(
            name="AI/ML Research Specialist",
            role="AI Specialist",
            expertise_areas=["Machine Learning", "Deep Learning", "AI Automation", "Data Science", "MLOps"],
            system_prompt="""You are an AI/ML Research Specialist with cutting-edge knowledge of artificial 
            intelligence, machine learning, and automation. Focus on:
            - AI/ML solution design and implementation
            - Automation opportunities and optimization
            - Data science and analytics approaches
            - Model selection and performance optimization
            - AI ethics and best practices
            
            Recommend AI-powered solutions that maximize automation and intelligence."""
        )
        
        # Product Manager Agent
        agents['product_manager'] = LLMPoweredAgent(
            name="Senior Product Manager",
            role="Product Manager",
            expertise_areas=["Product Strategy", "User Experience", "Feature Prioritization", "Product Analytics"],
            system_prompt="""You are a Senior Product Manager with expertise in product strategy, user experience, 
            and feature development. Focus on:
            - User needs and experience optimization
            - Feature prioritization and roadmap planning
            - Product metrics and analytics
            - Market fit and user adoption strategies
            - Product-market alignment
            
            Provide product insights that maximize user value and market success."""
        )
        
        # Copilot Coordinator Agent
        agents['copilot_coordinator'] = LLMPoweredAgent(
            name="Multi-Agent Coordinator", 
            role="Copilot Coordinator",
            expertise_areas=["Systems Thinking", "Decision Synthesis", "Project Coordination", "Multi-Agent Orchestration"],
            system_prompt="""You are a Multi-Agent Coordinator responsible for synthesizing insights from multiple 
            specialized agents into coherent, actionable solutions. Focus on:
            - Integrating perspectives from different experts
            - Identifying synergies and conflicts between recommendations
            - Providing clear, actionable synthesis
            - Coordinating complex multi-faceted solutions
            - Ensuring all aspects are considered
            
            Create unified solutions that leverage the best insights from all agents."""
        )
        
        return agents
    
    def _setup_database(self):
        """Setup database for enhanced chat system"""
        
        conn = sqlite3.connect('enhanced_agent_chat.db')
        
        conn.execute('''
            CREATE TABLE IF NOT EXISTS enhanced_chat_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT,
                user_message TEXT,
                agent_responses TEXT,
                collaboration_summary TEXT,
                user_satisfaction INTEGER,
                response_time REAL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        conn.execute('''
            CREATE TABLE IF NOT EXISTS agent_performance (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                agent_name TEXT,
                response_quality REAL,
                response_time REAL,
                user_feedback INTEGER,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        conn.commit()
        conn.close()
    
    async def process_message(self, message: str, session_id: str = None, selected_agents: List[str] = None) -> Dict:
        """Process message with enhanced multi-agent collaboration"""
        
        start_time = time.time()
        
        # Determine which agents to activate
        if selected_agents is None:
            active_agents = await self._determine_relevant_agents(message)
        else:
            active_agents = [name for name in selected_agents if name in self.agents]
        
        if not active_agents:
            active_agents = ['copilot_coordinator']  # Fallback
        
        logger.info(f"Activating agents: {active_agents}")
        
        # Generate responses from each agent
        agent_responses = {}
        
        # First phase: Independent agent responses
        for agent_name in active_agents:
            if agent_name in self.agents:
                agent = self.agents[agent_name]
                response = await agent.generate_response(message)
                agent_responses[agent_name] = response
        
        # Second phase: Coordinator synthesis if multiple agents
        if len(active_agents) > 1 and 'copilot_coordinator' not in active_agents:
            coordinator = self.agents['copilot_coordinator']
            collaboration_context = {
                name: resp['content'] for name, resp in agent_responses.items()
            }
            
            synthesis = await coordinator.generate_response(
                message, 
                collaboration_context=collaboration_context
            )
            
            agent_responses['synthesis'] = synthesis
        
        # Calculate response time
        response_time = time.time() - start_time
        
        # Store session data
        self._store_enhanced_session(session_id, message, agent_responses, response_time)
        
        return {
            'message': message,
            'agent_responses': agent_responses,
            'active_agents': active_agents,
            'response_time': response_time,
            'timestamp': datetime.now().isoformat(),
            'session_id': session_id
        }
    
    async def _determine_relevant_agents(self, message: str) -> List[str]:
        """Intelligently determine which agents are most relevant"""
        
        message_lower = message.lower()
        
        # Keyword-based agent selection (enhanced with LLM in future)
        agent_keywords = {
            'business_strategist': ['revenue', 'profit', 'market', 'business', 'strategy', 'growth', 'roi', 'customer'],
            'technical_architect': ['technical', 'architecture', 'system', 'performance', 'security', 'infrastructure', 'deploy'],
            'ai_specialist': ['ai', 'ml', 'machine learning', 'automation', 'intelligent', 'predict', 'model', 'data'],
            'product_manager': ['product', 'feature', 'user', 'ux', 'roadmap', 'priority', 'analytics'],
            'copilot_coordinator': ['help', 'analyze', 'review', 'comprehensive', 'overall']
        }
        
        relevant_agents = []
        
        for agent, keywords in agent_keywords.items():
            if any(keyword in message_lower for keyword in keywords):
                relevant_agents.append(agent)
        
        # If no specific agents matched, use coordinator + most likely relevant agent
        if not relevant_agents:
            if len(message.split()) > 20:  # Complex query
                relevant_agents = ['business_strategist', 'technical_architect', 'copilot_coordinator']
            else:
                relevant_agents = ['copilot_coordinator']
        
        return relevant_agents
    
    def _store_enhanced_session(self, session_id: str, message: str, responses: Dict, response_time: float):
        """Store enhanced session data"""
        
        conn = sqlite3.connect('enhanced_agent_chat.db')
        
        conn.execute('''
            INSERT INTO enhanced_chat_sessions 
            (session_id, user_message, agent_responses, response_time)
            VALUES (?, ?, ?, ?)
        ''', (
            session_id or f"session_{int(time.time())}",
            message,
            json.dumps(responses),
            response_time
        ))
        
        conn.commit()
        conn.close()

# =============================================================================
# ENHANCED SOCKET.IO SERVER
# =============================================================================

class EnhancedAgentChatServer:
    """Enhanced Socket.IO server with real LLM integration"""
    
    def __init__(self):
        self.orchestrator = EnhancedAgentOrchestrator()
        self.sio = socketio.AsyncServer(
            cors_allowed_origins="*",
            logger=True,
            engineio_logger=True
        )
        self.app = web.Application()
        self.sio.attach(self.app)
        
        self._setup_socket_handlers()
        self._setup_http_routes()
    
    def _setup_socket_handlers(self):
        """Setup Socket.IO event handlers"""
        
        @self.sio.event
        async def connect(sid, environ):
            logger.info(f"Client connected: {sid}")
            await self.sio.emit('status', {
                'message': 'Connected to Enhanced AI Agent System',
                'agents_available': list(self.orchestrator.agents.keys()),
                'llm_enabled': self.orchestrator.agents['business_strategist'].llm_enabled
            }, room=sid)
        
        @self.sio.event
        async def disconnect(sid):
            logger.info(f"Client disconnected: {sid}")
        
        @self.sio.event
        async def chat_message(sid, data):
            """Handle chat messages with enhanced processing"""
            
            try:
                message = data.get('message', '')
                selected_agents = data.get('agents', None)
                
                if not message.strip():
                    await self.sio.emit('error', {'message': 'Empty message received'}, room=sid)
                    return
                
                logger.info(f"Processing message from {sid}: {message[:50]}...")
                
                # Emit processing status
                await self.sio.emit('processing', {
                    'status': 'Analyzing request and activating relevant agents...',
                    'timestamp': datetime.now().isoformat()
                }, room=sid)
                
                # Process with enhanced orchestrator
                result = await self.orchestrator.process_message(
                    message, 
                    session_id=sid,
                    selected_agents=selected_agents
                )
                
                # Send enhanced response
                await self.sio.emit('agent_responses', result, room=sid)
                
                logger.info(f"Sent enhanced response to {sid} in {result['response_time']:.2f}s")
                
            except Exception as e:
                logger.error(f"Error processing message: {e}")
                await self.sio.emit('error', {
                    'message': 'Error processing your request',
                    'error': str(e)
                }, room=sid)
        
        @self.sio.event
        async def get_agent_status(sid, data):
            """Get status of all agents"""
            
            agent_status = {}
            for name, agent in self.orchestrator.agents.items():
                agent_status[name] = {
                    'name': agent.name,
                    'role': agent.role,
                    'expertise': agent.expertise_areas,
                    'llm_enabled': agent.llm_enabled,
                    'memory_size': len(agent.memory.conversation_history)
                }
            
            await self.sio.emit('agent_status', agent_status, room=sid)
    
    def _setup_http_routes(self):
        """Setup HTTP routes"""
        
        async def health_check(request):
            return web.json_response({
                'status': 'healthy',
                'agents': len(self.orchestrator.agents),
                'llm_enabled': os.getenv('OPENAI_API_KEY') is not None,
                'timestamp': datetime.now().isoformat()
            })
        
        async def api_chat(request):
            """REST API endpoint for chat"""
            
            data = await request.json()
            message = data.get('message', '')
            
            if not message:
                return web.json_response({'error': 'Message required'}, status=400)
            
            result = await self.orchestrator.process_message(message)
            return web.json_response(result)
        
        self.app.router.add_get('/health', health_check)
        self.app.router.add_post('/api/chat', api_chat)
        self.app.router.add_get('/', self._serve_chat_interface)
        
        # Setup CORS
        cors_setup(self.app, defaults={
            "*": ResourceOptions(
                allow_credentials=True,
                expose_headers="*",
                allow_headers="*",
                allow_methods="*"
            )
        })
    
    async def _serve_chat_interface(self, request):
        """Serve the enhanced chat interface"""
        
        html_content = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Enhanced AI Agent Chat</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.0.4/socket.io.js"></script>
    <style>
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            margin: 0; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: #333;
        }
        
        .container { 
            max-width: 1200px; 
            margin: 0 auto; 
            padding: 20px; 
        }
        
        .header {
            text-align: center;
            margin-bottom: 30px;
            color: white;
        }
        
        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
        }
        
        .chat-container {
            background: white;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            overflow: hidden;
            height: 70vh;
            display: flex;
            flex-direction: column;
        }
        
        #messages {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
        }
        
        .message {
            margin-bottom: 20px;
            padding: 15px;
            border-radius: 10px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        
        .user-message {
            background: #e3f2fd;
            margin-left: 20%;
        }
        
        .agent-response {
            background: #f5f5f5;
            margin-right: 20%;
            border-left: 4px solid #667eea;
        }
        
        .agent-name {
            font-weight: bold;
            color: #667eea;
            margin-bottom: 10px;
        }
        
        .input-container {
            padding: 20px;
            background: #f8f9fa;
            border-top: 1px solid #dee2e6;
            display: flex;
            gap: 10px;
        }
        
        #messageInput {
            flex: 1;
            padding: 12px;
            border: 2px solid #dee2e6;
            border-radius: 8px;
            font-size: 16px;
        }
        
        button {
            padding: 12px 24px;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 16px;
        }
        
        button:hover {
            background: #5a6fd8;
        }
        
        .processing {
            color: #666;
            font-style: italic;
            padding: 10px;
        }
        
        .response-meta {
            font-size: 0.9em;
            color: #666;
            margin-top: 10px;
            padding-top: 10px;
            border-top: 1px solid #eee;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🤖 Enhanced AI Agent Chat</h1>
            <p>Real LLM-powered multi-agent collaboration system</p>
        </div>
        
        <div class="chat-container">
            <div id="messages"></div>
            <div class="input-container">
                <input type="text" id="messageInput" placeholder="Ask a complex business question and watch multiple AI agents collaborate..." />
                <button onclick="sendMessage()">Send</button>
            </div>
        </div>
    </div>

    <script>
        const socket = io();
        const messagesDiv = document.getElementById('messages');
        const messageInput = document.getElementById('messageInput');
        
        socket.on('connect', function() {
            addMessage('System', 'Connected to Enhanced AI Agent System', 'system');
        });
        
        socket.on('agent_responses', function(data) {
            addMessage('User', data.message, 'user');
            
            // Display each agent response
            for (const [agentName, response] of Object.entries(data.agent_responses)) {
                if (response.content) {
                    addAgentResponse(response);
                }
            }
            
            addMessage('System', `Response completed in ${data.response_time.toFixed(2)}s using agents: ${data.active_agents.join(', ')}`, 'system');
        });
        
        socket.on('processing', function(data) {
            const processingDiv = document.createElement('div');
            processingDiv.className = 'processing';
            processingDiv.textContent = data.status;
            messagesDiv.appendChild(processingDiv);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        });
        
        function addMessage(sender, content, type) {
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${type}-message`;
            messageDiv.innerHTML = `
                <div class="agent-name">${sender}</div>
                <div>${content}</div>
            `;
            messagesDiv.appendChild(messageDiv);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
        
        function addAgentResponse(response) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message agent-response';
            messageDiv.innerHTML = `
                <div class="agent-name">${response.agent}</div>
                <div>${response.content.replace(/\\n/g, '<br>')}</div>
                <div class="response-meta">
                    Confidence: ${(response.confidence * 100).toFixed(0)}% | 
                    Sources: ${response.sources.join(', ')} |
                    Actions: ${response.suggested_actions.length}
                </div>
            `;
            messagesDiv.appendChild(messageDiv);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
        
        function sendMessage() {
            const message = messageInput.value.trim();
            if (message) {
                socket.emit('chat_message', { message: message });
                messageInput.value = '';
            }
        }
        
        messageInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
        
        // Clear processing indicators
        socket.on('agent_responses', function() {
            const processingElements = document.querySelectorAll('.processing');
            processingElements.forEach(el => el.remove());
        });
    </script>
</body>
</html>
        """
        
        return web.Response(text=html_content, content_type='text/html')
    
    async def run(self, host='0.0.0.0', port=5000):
        """Run the enhanced agent chat server"""
        
        logger.info(f"🚀 Starting Enhanced AI Agent Chat Server on {host}:{port}")
        logger.info(f"OpenAI API Status: {'✅ Enabled' if os.getenv('OPENAI_API_KEY') else '❌ Disabled (using fallback)'}")
        
        web.run_app(self.app, host=host, port=port)

# =============================================================================
# MAIN EXECUTION
# =============================================================================

if __name__ == "__main__":
    server = EnhancedAgentChatServer()
    asyncio.run(server.run())
