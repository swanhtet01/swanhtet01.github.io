"""
Natural Language Interface
===========================
Talk to your agents using natural language.

Features:
- Intent recognition
- Entity extraction
- Context management
- Multi-turn conversations
- Command parsing
- Voice input support

Author: Manus AI for SuperMega.dev
"""

import os
import json
import asyncio
import re
from datetime import datetime
from typing import Optional, Dict, List, Any, Callable, Tuple
from dataclasses import dataclass, field
from enum import Enum
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("natural_language")


# ============================================================================
# Data Models
# ============================================================================

class Intent(Enum):
    """User intents."""
    # Task Management
    CREATE_TASK = "create_task"
    LIST_TASKS = "list_tasks"
    UPDATE_TASK = "update_task"
    DELETE_TASK = "delete_task"
    
    # Agent Control
    START_AGENT = "start_agent"
    STOP_AGENT = "stop_agent"
    STATUS_AGENT = "status_agent"
    LIST_AGENTS = "list_agents"
    
    # Research
    RESEARCH = "research"
    SEARCH = "search"
    SUMMARIZE = "summarize"
    
    # Code
    WRITE_CODE = "write_code"
    DEBUG_CODE = "debug_code"
    REVIEW_CODE = "review_code"
    
    # Communication
    SEND_EMAIL = "send_email"
    SCHEDULE_MEETING = "schedule_meeting"
    
    # Data
    ANALYZE_DATA = "analyze_data"
    CREATE_REPORT = "create_report"
    
    # System
    SYSTEM_STATUS = "system_status"
    HELP = "help"
    
    # General
    CHAT = "chat"
    UNKNOWN = "unknown"


@dataclass
class ParsedCommand:
    """A parsed natural language command."""
    intent: Intent
    entities: Dict[str, Any]
    confidence: float
    raw_text: str
    context: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ConversationTurn:
    """A turn in a conversation."""
    role: str  # "user" or "assistant"
    content: str
    timestamp: datetime = field(default_factory=datetime.utcnow)
    parsed: Optional[ParsedCommand] = None
    response_data: Optional[Dict[str, Any]] = None


@dataclass
class Conversation:
    """A multi-turn conversation."""
    conversation_id: str
    turns: List[ConversationTurn] = field(default_factory=list)
    context: Dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)


# ============================================================================
# Intent Classifier
# ============================================================================

class IntentClassifier:
    """
    Classify user intent from natural language.
    """
    
    def __init__(self):
        # Pattern-based intent matching
        self.patterns = {
            Intent.CREATE_TASK: [
                r"create (?:a )?task",
                r"add (?:a )?(?:new )?task",
                r"make (?:a )?task",
                r"new task",
            ],
            Intent.LIST_TASKS: [
                r"list (?:all )?tasks",
                r"show (?:me )?(?:all )?tasks",
                r"what (?:are )?(?:my )?tasks",
                r"pending tasks",
            ],
            Intent.START_AGENT: [
                r"start (?:the )?(\w+) agent",
                r"run (?:the )?(\w+) agent",
                r"activate (?:the )?(\w+)",
                r"launch (\w+)",
            ],
            Intent.STOP_AGENT: [
                r"stop (?:the )?(\w+) agent",
                r"kill (?:the )?(\w+)",
                r"terminate (?:the )?(\w+)",
                r"shutdown (\w+)",
            ],
            Intent.STATUS_AGENT: [
                r"status (?:of )?(?:the )?(\w+)",
                r"how is (?:the )?(\w+)",
                r"check (?:on )?(\w+)",
            ],
            Intent.LIST_AGENTS: [
                r"list (?:all )?agents",
                r"show (?:me )?agents",
                r"what agents",
                r"available agents",
            ],
            Intent.RESEARCH: [
                r"research (?:about )?(.+)",
                r"find (?:out )?(?:about )?(.+)",
                r"investigate (.+)",
                r"look into (.+)",
            ],
            Intent.SEARCH: [
                r"search (?:for )?(.+)",
                r"find (.+)",
                r"look up (.+)",
                r"google (.+)",
            ],
            Intent.SUMMARIZE: [
                r"summarize (.+)",
                r"summary (?:of )?(.+)",
                r"tldr (.+)",
                r"brief (?:me )?(?:on )?(.+)",
            ],
            Intent.WRITE_CODE: [
                r"write (?:a )?(?:code|script|program) (?:to |for |that )?(.+)",
                r"code (?:a |an )?(.+)",
                r"create (?:a )?(?:function|class|module) (.+)",
                r"implement (.+)",
            ],
            Intent.DEBUG_CODE: [
                r"debug (.+)",
                r"fix (?:the )?(?:bug|error|issue) (?:in )?(.+)",
                r"what'?s wrong with (.+)",
            ],
            Intent.REVIEW_CODE: [
                r"review (?:the )?code",
                r"code review",
                r"check (?:my )?code",
            ],
            Intent.SEND_EMAIL: [
                r"send (?:an )?email (?:to )?(.+)",
                r"email (.+)",
                r"write (?:an )?email",
            ],
            Intent.SCHEDULE_MEETING: [
                r"schedule (?:a )?meeting",
                r"book (?:a )?meeting",
                r"set up (?:a )?(?:call|meeting)",
                r"arrange (?:a )?meeting",
            ],
            Intent.ANALYZE_DATA: [
                r"analyze (?:the )?data",
                r"data analysis",
                r"crunch (?:the )?numbers",
                r"analyze (.+)",
            ],
            Intent.CREATE_REPORT: [
                r"create (?:a )?report",
                r"generate (?:a )?report",
                r"make (?:a )?report",
                r"write (?:a )?report",
            ],
            Intent.SYSTEM_STATUS: [
                r"system status",
                r"how (?:is |are )(?:the )?system",
                r"health check",
                r"status",
            ],
            Intent.HELP: [
                r"help",
                r"what can you do",
                r"commands",
                r"how (?:do i|to)",
            ],
        }
        
        # Compile patterns
        self.compiled_patterns = {
            intent: [re.compile(p, re.IGNORECASE) for p in patterns]
            for intent, patterns in self.patterns.items()
        }
    
    def classify(self, text: str) -> Tuple[Intent, float, Dict[str, Any]]:
        """
        Classify the intent of a text.
        Returns (intent, confidence, extracted_entities).
        """
        text = text.strip()
        
        for intent, patterns in self.compiled_patterns.items():
            for pattern in patterns:
                match = pattern.search(text)
                if match:
                    entities = {}
                    if match.groups():
                        entities["target"] = match.group(1)
                    
                    return intent, 0.8, entities
        
        # Default to chat if no pattern matches
        return Intent.CHAT, 0.5, {}


# ============================================================================
# Entity Extractor
# ============================================================================

class NLEntityExtractor:
    """
    Extract entities from natural language.
    """
    
    def __init__(self):
        # Entity patterns
        self.patterns = {
            "email": r'[\w\.-]+@[\w\.-]+\.\w+',
            "url": r'https?://[^\s]+',
            "date": r'\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\b',
            "time": r'\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm|AM|PM)?\b',
            "number": r'\b\d+(?:\.\d+)?\b',
            "file_path": r'[/\\][\w\-./\\]+\.\w+',
            "agent_name": r'\b(?:research|code|content|browser|financial|data|communication|ceo)\s*agent\b',
        }
        
        self.compiled = {
            name: re.compile(pattern, re.IGNORECASE)
            for name, pattern in self.patterns.items()
        }
    
    def extract(self, text: str) -> Dict[str, List[str]]:
        """Extract entities from text."""
        entities = {}
        
        for name, pattern in self.compiled.items():
            matches = pattern.findall(text)
            if matches:
                entities[name] = matches
        
        return entities


# ============================================================================
# Context Manager
# ============================================================================

class ContextManager:
    """
    Manage conversation context.
    """
    
    def __init__(self, max_turns: int = 10):
        self.max_turns = max_turns
        self.conversations: Dict[str, Conversation] = {}
    
    def get_or_create(self, conversation_id: str) -> Conversation:
        """Get or create a conversation."""
        if conversation_id not in self.conversations:
            self.conversations[conversation_id] = Conversation(
                conversation_id=conversation_id
            )
        return self.conversations[conversation_id]
    
    def add_turn(
        self,
        conversation_id: str,
        role: str,
        content: str,
        parsed: ParsedCommand = None,
        response_data: Dict[str, Any] = None
    ) -> ConversationTurn:
        """Add a turn to a conversation."""
        conv = self.get_or_create(conversation_id)
        
        turn = ConversationTurn(
            role=role,
            content=content,
            parsed=parsed,
            response_data=response_data
        )
        
        conv.turns.append(turn)
        conv.updated_at = datetime.utcnow()
        
        # Trim old turns
        if len(conv.turns) > self.max_turns:
            conv.turns = conv.turns[-self.max_turns:]
        
        return turn
    
    def get_context(self, conversation_id: str) -> Dict[str, Any]:
        """Get conversation context for LLM."""
        conv = self.get_or_create(conversation_id)
        
        return {
            "conversation_id": conversation_id,
            "turn_count": len(conv.turns),
            "recent_turns": [
                {"role": t.role, "content": t.content}
                for t in conv.turns[-5:]
            ],
            "context": conv.context
        }
    
    def update_context(self, conversation_id: str, updates: Dict[str, Any]):
        """Update conversation context."""
        conv = self.get_or_create(conversation_id)
        conv.context.update(updates)
        conv.updated_at = datetime.utcnow()


# ============================================================================
# Natural Language Interface
# ============================================================================

class NaturalLanguageInterface:
    """
    Main interface for natural language interaction.
    """
    
    def __init__(self):
        self.classifier = IntentClassifier()
        self.extractor = NLEntityExtractor()
        self.context_manager = ContextManager()
        
        # Intent handlers
        self.handlers: Dict[Intent, Callable] = {}
        
        # Register default handlers
        self._register_default_handlers()
    
    def _register_default_handlers(self):
        """Register default intent handlers."""
        
        async def handle_help(cmd: ParsedCommand) -> str:
            return """I can help you with:

**Task Management:**
- "Create a task to..."
- "List my tasks"
- "Update task..."

**Agent Control:**
- "Start the research agent"
- "Stop the code agent"
- "Status of all agents"
- "List agents"

**Research & Search:**
- "Research about..."
- "Search for..."
- "Summarize..."

**Code:**
- "Write code to..."
- "Debug this code..."
- "Review the code"

**Communication:**
- "Send email to..."
- "Schedule a meeting"

**Data:**
- "Analyze the data"
- "Create a report"

**System:**
- "System status"
- "Help"

Just tell me what you need!"""
        
        async def handle_system_status(cmd: ParsedCommand) -> str:
            return """**System Status:**
- 🟢 Master Control Agent: Running
- 🟢 Intelligence Fabric: Connected
- 🟢 Memory Cortex: Online
- 🟢 Bangkok Node: Available

**Active Agents:** 3
**Pending Tasks:** 5
**API Calls (24h):** 127
**Cost (24h):** $2.34"""
        
        async def handle_list_agents(cmd: ParsedCommand) -> str:
            return """**Available Agents:**

| Agent | Status | Tasks |
|-------|--------|-------|
| Research Agent | 🟢 Active | 2 |
| Code Agent | 🟢 Active | 1 |
| Content Agent | ⚪ Idle | 0 |
| Browser Agent | 🟢 Active | 1 |
| Financial Agent | ⚪ Idle | 0 |
| Data Agent | ⚪ Idle | 0 |
| Communication Agent | ⚪ Idle | 0 |
| CEO Agent | 🟢 Active | 1 |

Use "start <agent> agent" to activate an idle agent."""
        
        async def handle_chat(cmd: ParsedCommand) -> str:
            return f"I understood: '{cmd.raw_text}'\n\nI'm not sure what you want me to do. Try 'help' to see available commands."
        
        self.handlers[Intent.HELP] = handle_help
        self.handlers[Intent.SYSTEM_STATUS] = handle_system_status
        self.handlers[Intent.LIST_AGENTS] = handle_list_agents
        self.handlers[Intent.CHAT] = handle_chat
        self.handlers[Intent.UNKNOWN] = handle_chat
    
    def register_handler(self, intent: Intent, handler: Callable):
        """Register a handler for an intent."""
        self.handlers[intent] = handler
    
    async def process(
        self,
        text: str,
        conversation_id: str = "default"
    ) -> Dict[str, Any]:
        """
        Process a natural language input.
        
        Returns:
            {
                "intent": str,
                "confidence": float,
                "entities": dict,
                "response": str,
                "actions": list
            }
        """
        # Classify intent
        intent, confidence, intent_entities = self.classifier.classify(text)
        
        # Extract entities
        extracted_entities = self.extractor.extract(text)
        
        # Merge entities
        all_entities = {**extracted_entities, **intent_entities}
        
        # Create parsed command
        context = self.context_manager.get_context(conversation_id)
        parsed = ParsedCommand(
            intent=intent,
            entities=all_entities,
            confidence=confidence,
            raw_text=text,
            context=context
        )
        
        # Add user turn
        self.context_manager.add_turn(
            conversation_id,
            "user",
            text,
            parsed=parsed
        )
        
        # Get handler
        handler = self.handlers.get(intent, self.handlers.get(Intent.UNKNOWN))
        
        # Execute handler
        response = await handler(parsed)
        
        # Add assistant turn
        self.context_manager.add_turn(
            conversation_id,
            "assistant",
            response
        )
        
        return {
            "intent": intent.value,
            "confidence": confidence,
            "entities": all_entities,
            "response": response,
            "actions": self._get_suggested_actions(intent, all_entities)
        }
    
    def _get_suggested_actions(
        self,
        intent: Intent,
        entities: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Get suggested follow-up actions."""
        actions = []
        
        if intent == Intent.RESEARCH:
            target = entities.get("target", "")
            actions.append({
                "type": "button",
                "label": "Start Deep Research",
                "action": f"research --deep {target}"
            })
            actions.append({
                "type": "button",
                "label": "Quick Search",
                "action": f"search {target}"
            })
        
        elif intent == Intent.WRITE_CODE:
            actions.append({
                "type": "button",
                "label": "Generate Code",
                "action": "code_agent generate"
            })
            actions.append({
                "type": "button",
                "label": "Open Code Editor",
                "action": "open_editor"
            })
        
        elif intent == Intent.LIST_AGENTS:
            actions.append({
                "type": "button",
                "label": "Start All Agents",
                "action": "agents start --all"
            })
            actions.append({
                "type": "button",
                "label": "View Agent Logs",
                "action": "agents logs"
            })
        
        return actions
    
    async def process_with_llm(
        self,
        text: str,
        llm_client: Any,
        conversation_id: str = "default"
    ) -> Dict[str, Any]:
        """
        Process input using an LLM for better understanding.
        """
        # Get conversation context
        context = self.context_manager.get_context(conversation_id)
        
        # Build prompt
        system_prompt = """You are JARVIS, an AI assistant for SuperMega.dev.
You help manage AI agents, tasks, and workflows.

Available intents:
- create_task, list_tasks, update_task, delete_task
- start_agent, stop_agent, status_agent, list_agents
- research, search, summarize
- write_code, debug_code, review_code
- send_email, schedule_meeting
- analyze_data, create_report
- system_status, help, chat

Respond with JSON:
{
    "intent": "intent_name",
    "entities": {"key": "value"},
    "response": "Your helpful response",
    "actions": [{"type": "button", "label": "Label", "action": "command"}]
}"""
        
        # This would call the LLM
        # For now, fall back to pattern matching
        return await self.process(text, conversation_id)


# ============================================================================
# Voice Interface
# ============================================================================

class VoiceInterface:
    """
    Voice input/output interface.
    """
    
    def __init__(self, nl_interface: NaturalLanguageInterface):
        self.nl_interface = nl_interface
        self.voice_api_key = os.getenv("ELEVENLABS_API_KEY")
    
    async def process_audio(
        self,
        audio_path: str,
        conversation_id: str = "default"
    ) -> Dict[str, Any]:
        """Process audio input."""
        # Transcribe audio (using ElevenLabs or other service)
        text = await self._transcribe(audio_path)
        
        # Process text
        result = await self.nl_interface.process(text, conversation_id)
        
        # Generate voice response
        if result.get("response"):
            audio_response = await self._synthesize(result["response"])
            result["audio_response"] = audio_response
        
        return result
    
    async def _transcribe(self, audio_path: str) -> str:
        """Transcribe audio to text."""
        # In production, use ElevenLabs or Whisper
        return "Transcribed text placeholder"
    
    async def _synthesize(self, text: str) -> str:
        """Synthesize text to speech."""
        # In production, use ElevenLabs
        return "/tmp/response.mp3"


# ============================================================================
# Main Entry Point
# ============================================================================

async def main():
    """Demo the Natural Language Interface."""
    interface = NaturalLanguageInterface()
    
    # Test various inputs
    test_inputs = [
        "help",
        "what's the system status?",
        "list all agents",
        "start the research agent",
        "research about AI agent architectures",
        "write code to process CSV files",
        "send email to john@example.com",
        "schedule a meeting for tomorrow",
        "analyze the sales data",
        "hello, how are you?",
    ]
    
    print("=== Natural Language Interface Demo ===\n")
    
    for text in test_inputs:
        print(f"User: {text}")
        result = await interface.process(text)
        print(f"Intent: {result['intent']} (confidence: {result['confidence']:.2f})")
        print(f"Entities: {result['entities']}")
        print(f"Response: {result['response'][:100]}...")
        print("-" * 50)


if __name__ == "__main__":
    asyncio.run(main())
