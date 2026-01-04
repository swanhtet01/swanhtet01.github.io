"""
Voice Interface for HYPER UNICORN
==================================
Talk to your AI agents using natural speech.

Features:
- Text-to-Speech (ElevenLabs)
- Speech-to-Text (Whisper)
- Voice commands
- Conversational AI
- Voice notifications
- Multi-voice support for different agents
"""

import os
import json
import asyncio
import tempfile
from datetime import datetime
from typing import Dict, List, Any, Optional, Callable
from dataclasses import dataclass, field
from enum import Enum
import base64
import wave
import io

# ElevenLabs for TTS
try:
    from elevenlabs import ElevenLabs, Voice, VoiceSettings
    ELEVENLABS_AVAILABLE = True
except ImportError:
    ELEVENLABS_AVAILABLE = False

# OpenAI for STT (Whisper)
try:
    from openai import OpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False


class VoiceType(Enum):
    """Voice types for different agent personalities."""
    PROFESSIONAL = "professional"  # Business-like, clear
    FRIENDLY = "friendly"  # Warm, approachable
    AUTHORITATIVE = "authoritative"  # CEO-like, commanding
    TECHNICAL = "technical"  # Precise, analytical
    CREATIVE = "creative"  # Expressive, dynamic


@dataclass
class VoiceProfile:
    """Voice profile for an agent."""
    agent_id: str
    voice_id: str  # ElevenLabs voice ID
    voice_type: VoiceType
    stability: float = 0.5
    similarity_boost: float = 0.75
    style: float = 0.0
    use_speaker_boost: bool = True
    

@dataclass
class VoiceCommand:
    """A voice command from the user."""
    id: str
    text: str
    audio_data: Optional[bytes] = None
    timestamp: datetime = field(default_factory=datetime.now)
    confidence: float = 1.0
    intent: Optional[str] = None
    entities: Dict[str, Any] = field(default_factory=dict)


@dataclass
class VoiceResponse:
    """A voice response from an agent."""
    id: str
    agent_id: str
    text: str
    audio_data: Optional[bytes] = None
    audio_url: Optional[str] = None
    timestamp: datetime = field(default_factory=datetime.now)
    duration_seconds: float = 0


# Default voice mappings for agent types
DEFAULT_VOICE_MAPPINGS = {
    "ceo": {
        "voice_id": "pNInz6obpgDQGcFmaJgB",  # Adam - authoritative
        "voice_type": VoiceType.AUTHORITATIVE
    },
    "research": {
        "voice_id": "21m00Tcm4TlvDq8ikWAM",  # Rachel - professional
        "voice_type": VoiceType.PROFESSIONAL
    },
    "code": {
        "voice_id": "AZnzlk1XvdvUeBnXmlld",  # Domi - technical
        "voice_type": VoiceType.TECHNICAL
    },
    "content": {
        "voice_id": "EXAVITQu4vr4xnSDxMaL",  # Bella - creative
        "voice_type": VoiceType.CREATIVE
    },
    "sales": {
        "voice_id": "ErXwobaYiN019PkySvjV",  # Antoni - friendly
        "voice_type": VoiceType.FRIENDLY
    },
    "default": {
        "voice_id": "21m00Tcm4TlvDq8ikWAM",  # Rachel
        "voice_type": VoiceType.PROFESSIONAL
    }
}


class VoiceInterface:
    """
    Voice interface for interacting with AI agents.
    
    Features:
    - Speech-to-text transcription
    - Text-to-speech synthesis
    - Voice command recognition
    - Agent voice personalities
    - Notification sounds
    """
    
    def __init__(
        self,
        elevenlabs_api_key: str = None,
        openai_api_key: str = None
    ):
        self.elevenlabs_api_key = elevenlabs_api_key or os.getenv("ELEVENLABS_API_KEY")
        self.openai_api_key = openai_api_key or os.getenv("OPENAI_API_KEY")
        
        # Initialize clients
        self.elevenlabs_client = None
        self.openai_client = None
        
        if ELEVENLABS_AVAILABLE and self.elevenlabs_api_key:
            self.elevenlabs_client = ElevenLabs(api_key=self.elevenlabs_api_key)
        
        if OPENAI_AVAILABLE and self.openai_api_key:
            self.openai_client = OpenAI(api_key=self.openai_api_key)
        
        # Voice profiles for agents
        self.voice_profiles: Dict[str, VoiceProfile] = {}
        
        # Command handlers
        self.command_handlers: Dict[str, Callable] = {}
        
        # Conversation history
        self.conversation_history: List[Dict[str, Any]] = []
        
        # Available voices cache
        self._available_voices: List[Dict[str, Any]] = []
    
    # ==================== Text-to-Speech ====================
    
    async def speak(
        self,
        text: str,
        agent_id: str = "default",
        save_path: str = None
    ) -> VoiceResponse:
        """Convert text to speech using the agent's voice."""
        if not self.elevenlabs_client:
            return VoiceResponse(
                id=f"voice_{datetime.now().timestamp()}",
                agent_id=agent_id,
                text=text,
                audio_data=None
            )
        
        # Get voice profile
        profile = self.voice_profiles.get(agent_id)
        if not profile:
            # Use default based on agent type
            agent_type = agent_id.split("_")[0] if "_" in agent_id else "default"
            voice_config = DEFAULT_VOICE_MAPPINGS.get(agent_type, DEFAULT_VOICE_MAPPINGS["default"])
            profile = VoiceProfile(
                agent_id=agent_id,
                voice_id=voice_config["voice_id"],
                voice_type=voice_config["voice_type"]
            )
        
        try:
            # Generate audio
            audio = self.elevenlabs_client.text_to_speech.convert(
                voice_id=profile.voice_id,
                text=text,
                model_id="eleven_turbo_v2_5",
                voice_settings={
                    "stability": profile.stability,
                    "similarity_boost": profile.similarity_boost,
                    "style": profile.style,
                    "use_speaker_boost": profile.use_speaker_boost
                }
            )
            
            # Collect audio bytes
            audio_bytes = b""
            for chunk in audio:
                audio_bytes += chunk
            
            # Save if path provided
            if save_path:
                with open(save_path, "wb") as f:
                    f.write(audio_bytes)
            
            return VoiceResponse(
                id=f"voice_{datetime.now().timestamp()}",
                agent_id=agent_id,
                text=text,
                audio_data=audio_bytes,
                duration_seconds=len(audio_bytes) / 24000  # Approximate
            )
            
        except Exception as e:
            print(f"TTS Error: {e}")
            return VoiceResponse(
                id=f"voice_{datetime.now().timestamp()}",
                agent_id=agent_id,
                text=text,
                audio_data=None
            )
    
    async def speak_notification(
        self,
        message: str,
        notification_type: str = "info"
    ) -> VoiceResponse:
        """Speak a notification with appropriate tone."""
        # Prefix based on type
        prefixes = {
            "info": "Hey, just so you know: ",
            "success": "Great news! ",
            "warning": "Heads up: ",
            "error": "Uh oh, there's a problem: ",
            "urgent": "This is urgent! "
        }
        
        full_message = prefixes.get(notification_type, "") + message
        return await self.speak(full_message, agent_id="default")
    
    # ==================== Speech-to-Text ====================
    
    async def transcribe(
        self,
        audio_data: bytes = None,
        audio_path: str = None
    ) -> VoiceCommand:
        """Transcribe audio to text using Whisper."""
        if not self.openai_client:
            return VoiceCommand(
                id=f"cmd_{datetime.now().timestamp()}",
                text="",
                confidence=0
            )
        
        try:
            # Prepare audio file
            if audio_path:
                audio_file = open(audio_path, "rb")
            elif audio_data:
                audio_file = io.BytesIO(audio_data)
                audio_file.name = "audio.wav"
            else:
                raise ValueError("Either audio_data or audio_path required")
            
            # Transcribe
            transcript = self.openai_client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                response_format="verbose_json"
            )
            
            return VoiceCommand(
                id=f"cmd_{datetime.now().timestamp()}",
                text=transcript.text,
                audio_data=audio_data,
                confidence=getattr(transcript, 'confidence', 1.0)
            )
            
        except Exception as e:
            print(f"STT Error: {e}")
            return VoiceCommand(
                id=f"cmd_{datetime.now().timestamp()}",
                text="",
                confidence=0
            )
    
    # ==================== Voice Commands ====================
    
    def register_command(
        self,
        trigger: str,
        handler: Callable,
        description: str = ""
    ):
        """Register a voice command handler."""
        self.command_handlers[trigger.lower()] = {
            "handler": handler,
            "description": description
        }
    
    async def process_command(
        self,
        command: VoiceCommand
    ) -> Dict[str, Any]:
        """Process a voice command and execute appropriate action."""
        text = command.text.lower().strip()
        
        # Check for registered commands
        for trigger, config in self.command_handlers.items():
            if trigger in text:
                try:
                    result = await config["handler"](command)
                    return {
                        "success": True,
                        "trigger": trigger,
                        "result": result
                    }
                except Exception as e:
                    return {
                        "success": False,
                        "trigger": trigger,
                        "error": str(e)
                    }
        
        # Parse intent if no direct match
        intent = self._parse_intent(text)
        command.intent = intent["intent"]
        command.entities = intent["entities"]
        
        return {
            "success": True,
            "intent": intent,
            "requires_processing": True
        }
    
    def _parse_intent(self, text: str) -> Dict[str, Any]:
        """Parse the intent from voice command text."""
        text_lower = text.lower()
        
        # Intent patterns
        intents = {
            "research": ["research", "find out", "look up", "search for", "investigate"],
            "create": ["create", "make", "generate", "write", "draft"],
            "send": ["send", "email", "message", "notify"],
            "schedule": ["schedule", "book", "set up", "arrange"],
            "analyze": ["analyze", "review", "check", "examine"],
            "status": ["status", "how is", "what's the", "update on"],
            "help": ["help", "how do i", "what can you"],
            "stop": ["stop", "cancel", "abort", "halt"]
        }
        
        detected_intent = "unknown"
        for intent, patterns in intents.items():
            if any(p in text_lower for p in patterns):
                detected_intent = intent
                break
        
        # Extract entities (simplified)
        entities = {}
        
        # Look for agent mentions
        agent_types = ["research", "code", "content", "sales", "ceo", "billing", "project"]
        for agent in agent_types:
            if agent in text_lower:
                entities["target_agent"] = agent
                break
        
        return {
            "intent": detected_intent,
            "entities": entities,
            "raw_text": text
        }
    
    # ==================== Voice Profiles ====================
    
    def set_voice_profile(
        self,
        agent_id: str,
        voice_id: str,
        voice_type: VoiceType = VoiceType.PROFESSIONAL,
        **settings
    ):
        """Set a custom voice profile for an agent."""
        self.voice_profiles[agent_id] = VoiceProfile(
            agent_id=agent_id,
            voice_id=voice_id,
            voice_type=voice_type,
            stability=settings.get("stability", 0.5),
            similarity_boost=settings.get("similarity_boost", 0.75),
            style=settings.get("style", 0.0),
            use_speaker_boost=settings.get("use_speaker_boost", True)
        )
    
    async def list_available_voices(self) -> List[Dict[str, Any]]:
        """List all available ElevenLabs voices."""
        if not self.elevenlabs_client:
            return []
        
        if self._available_voices:
            return self._available_voices
        
        try:
            voices = self.elevenlabs_client.voices.get_all()
            self._available_voices = [
                {
                    "voice_id": v.voice_id,
                    "name": v.name,
                    "category": v.category,
                    "labels": v.labels
                }
                for v in voices.voices
            ]
            return self._available_voices
        except Exception as e:
            print(f"Error listing voices: {e}")
            return []
    
    # ==================== Conversation Mode ====================
    
    async def start_conversation(
        self,
        agent_id: str = "default",
        greeting: str = None
    ) -> VoiceResponse:
        """Start a voice conversation with an agent."""
        if not greeting:
            greetings = {
                "ceo": "Hello, I'm your CEO agent. How can I help drive the business forward today?",
                "research": "Hi there! I'm ready to help you research anything. What would you like to know?",
                "code": "Hey! I'm your coding assistant. What should we build today?",
                "content": "Hello! Ready to create some amazing content. What's on your mind?",
                "sales": "Hi! Let's grow that pipeline. What leads should we pursue?",
                "default": "Hello! I'm your AI assistant. How can I help you today?"
            }
            agent_type = agent_id.split("_")[0] if "_" in agent_id else agent_id
            greeting = greetings.get(agent_type, greetings["default"])
        
        self.conversation_history = [{
            "role": "assistant",
            "content": greeting,
            "agent_id": agent_id,
            "timestamp": datetime.now().isoformat()
        }]
        
        return await self.speak(greeting, agent_id)
    
    async def continue_conversation(
        self,
        user_input: str,
        agent_id: str = "default"
    ) -> VoiceResponse:
        """Continue a voice conversation."""
        # Add user input to history
        self.conversation_history.append({
            "role": "user",
            "content": user_input,
            "timestamp": datetime.now().isoformat()
        })
        
        # Generate response (would integrate with actual agent in production)
        response_text = await self._generate_conversational_response(user_input, agent_id)
        
        # Add to history
        self.conversation_history.append({
            "role": "assistant",
            "content": response_text,
            "agent_id": agent_id,
            "timestamp": datetime.now().isoformat()
        })
        
        return await self.speak(response_text, agent_id)
    
    async def _generate_conversational_response(
        self,
        user_input: str,
        agent_id: str
    ) -> str:
        """Generate a conversational response (placeholder for agent integration)."""
        # In production, this would call the actual agent
        # For now, return acknowledgment
        intent = self._parse_intent(user_input)
        
        responses = {
            "research": f"I'll research that for you. Give me a moment to gather information about: {user_input}",
            "create": f"I'll create that for you. Starting work on: {user_input}",
            "send": f"I'll send that message for you. Preparing to: {user_input}",
            "schedule": f"I'll schedule that. Setting up: {user_input}",
            "analyze": f"I'll analyze that. Looking into: {user_input}",
            "status": f"Let me check on that status for you.",
            "help": "I can help you with research, creating content, sending messages, scheduling, and analyzing data. What would you like to do?",
            "stop": "Understood. I'll stop that task.",
            "unknown": f"I understand you want me to help with: {user_input}. Let me work on that."
        }
        
        return responses.get(intent["intent"], responses["unknown"])
    
    def end_conversation(self) -> Dict[str, Any]:
        """End the current conversation and return summary."""
        summary = {
            "duration": len(self.conversation_history),
            "messages": self.conversation_history,
            "ended_at": datetime.now().isoformat()
        }
        self.conversation_history = []
        return summary
    
    # ==================== Utility Methods ====================
    
    async def clone_voice(
        self,
        name: str,
        audio_files: List[str],
        description: str = ""
    ) -> Optional[str]:
        """Clone a voice from audio samples."""
        if not self.elevenlabs_client:
            return None
        
        try:
            # Read audio files
            files = []
            for path in audio_files:
                with open(path, "rb") as f:
                    files.append(f.read())
            
            # Create voice clone
            voice = self.elevenlabs_client.clone(
                name=name,
                description=description,
                files=files
            )
            
            return voice.voice_id
            
        except Exception as e:
            print(f"Voice cloning error: {e}")
            return None
    
    def get_voice_stats(self) -> Dict[str, Any]:
        """Get voice interface usage statistics."""
        return {
            "elevenlabs_available": ELEVENLABS_AVAILABLE and self.elevenlabs_client is not None,
            "openai_available": OPENAI_AVAILABLE and self.openai_client is not None,
            "registered_commands": len(self.command_handlers),
            "voice_profiles": len(self.voice_profiles),
            "conversation_length": len(self.conversation_history)
        }


# Global instance
_voice_interface: Optional[VoiceInterface] = None


def get_voice_interface() -> VoiceInterface:
    """Get the global voice interface instance."""
    global _voice_interface
    if _voice_interface is None:
        _voice_interface = VoiceInterface()
    return _voice_interface


# Convenience functions
async def say(text: str, agent_id: str = "default") -> VoiceResponse:
    """Quick text-to-speech."""
    interface = get_voice_interface()
    return await interface.speak(text, agent_id)


async def listen(audio_path: str) -> VoiceCommand:
    """Quick speech-to-text."""
    interface = get_voice_interface()
    return await interface.transcribe(audio_path=audio_path)


async def notify(message: str, notification_type: str = "info") -> VoiceResponse:
    """Quick voice notification."""
    interface = get_voice_interface()
    return await interface.speak_notification(message, notification_type)
