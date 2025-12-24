"""
Voice AI Module
===============
Voice synthesis and speech capabilities using ElevenLabs API.
Enables agents to speak, create podcasts, voice notifications, and more.

Features:
- Text-to-speech with multiple voices
- Voice cloning
- Real-time streaming audio
- Multi-language support
- Audio file generation
- Voice notifications

Author: Manus AI for SuperMega.dev
"""

import os
import sys
import json
import asyncio
import base64
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, List, Any, Union
from dataclasses import dataclass

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    from elevenlabs import ElevenLabs, Voice, VoiceSettings
    from elevenlabs.client import AsyncElevenLabs
    ELEVENLABS_AVAILABLE = True
except ImportError:
    ELEVENLABS_AVAILABLE = False


@dataclass
class VoiceProfile:
    """Voice profile configuration."""
    voice_id: str
    name: str
    description: str = ""
    labels: Dict[str, str] = None
    settings: Dict[str, float] = None
    
    def __post_init__(self):
        if self.labels is None:
            self.labels = {}
        if self.settings is None:
            self.settings = {
                "stability": 0.5,
                "similarity_boost": 0.75,
                "style": 0.0,
                "use_speaker_boost": True
            }


@dataclass
class AudioOutput:
    """Generated audio output."""
    audio_bytes: bytes
    format: str = "mp3"
    duration_seconds: float = 0.0
    voice_id: str = ""
    text: str = ""
    file_path: Optional[str] = None


class VoiceAI:
    """
    Voice AI Module using ElevenLabs
    
    Provides text-to-speech, voice cloning, and audio generation capabilities.
    """
    
    # Pre-defined voice profiles for different use cases
    VOICE_PROFILES = {
        "narrator": VoiceProfile(
            voice_id="21m00Tcm4TlvDq8ikWAM",  # Rachel
            name="Rachel",
            description="Professional female narrator voice",
            labels={"accent": "american", "gender": "female", "use_case": "narration"}
        ),
        "assistant": VoiceProfile(
            voice_id="EXAVITQu4vr4xnSDxMaL",  # Bella
            name="Bella",
            description="Friendly female assistant voice",
            labels={"accent": "american", "gender": "female", "use_case": "assistant"}
        ),
        "professional": VoiceProfile(
            voice_id="ErXwobaYiN019PkySvjV",  # Antoni
            name="Antoni",
            description="Professional male voice",
            labels={"accent": "american", "gender": "male", "use_case": "professional"}
        ),
        "news": VoiceProfile(
            voice_id="VR6AewLTigWG4xSOukaG",  # Arnold
            name="Arnold",
            description="News anchor style voice",
            labels={"accent": "american", "gender": "male", "use_case": "news"}
        ),
        "friendly": VoiceProfile(
            voice_id="pNInz6obpgDQGcFmaJgB",  # Adam
            name="Adam",
            description="Friendly conversational voice",
            labels={"accent": "american", "gender": "male", "use_case": "conversational"}
        )
    }
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        output_dir: Optional[str] = None
    ):
        self.api_key = api_key or os.getenv("ELEVENLABS_API_KEY", "")
        self.output_dir = Path(output_dir or Path.home() / ".hyper_unicorn" / "audio")
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # Initialize client
        if ELEVENLABS_AVAILABLE and self.api_key:
            self.client = ElevenLabs(api_key=self.api_key)
            self.async_client = AsyncElevenLabs(api_key=self.api_key)
        else:
            self.client = None
            self.async_client = None
        
        # Cache for voices
        self._voices_cache: List[Dict] = []
        self._cache_time: Optional[datetime] = None
    
    # =========================================================================
    # Voice Management
    # =========================================================================
    
    def list_voices(self, refresh: bool = False) -> List[Dict[str, Any]]:
        """List all available voices."""
        if not self.client:
            return list(self.VOICE_PROFILES.values())
        
        # Check cache
        if not refresh and self._voices_cache and self._cache_time:
            if (datetime.now() - self._cache_time).seconds < 300:
                return self._voices_cache
        
        try:
            response = self.client.voices.get_all()
            self._voices_cache = [
                {
                    "voice_id": voice.voice_id,
                    "name": voice.name,
                    "category": getattr(voice, 'category', 'unknown'),
                    "labels": getattr(voice, 'labels', {}),
                    "description": getattr(voice, 'description', ''),
                    "preview_url": getattr(voice, 'preview_url', None)
                }
                for voice in response.voices
            ]
            self._cache_time = datetime.now()
            return self._voices_cache
        except Exception as e:
            print(f"Error listing voices: {e}")
            return []
    
    def get_voice(self, voice_id: str) -> Optional[Dict[str, Any]]:
        """Get details for a specific voice."""
        if not self.client:
            return None
        
        try:
            voice = self.client.voices.get(voice_id)
            return {
                "voice_id": voice.voice_id,
                "name": voice.name,
                "category": getattr(voice, 'category', 'unknown'),
                "labels": getattr(voice, 'labels', {}),
                "description": getattr(voice, 'description', ''),
                "settings": getattr(voice, 'settings', None)
            }
        except Exception as e:
            print(f"Error getting voice {voice_id}: {e}")
            return None
    
    def find_voice_by_criteria(
        self,
        gender: Optional[str] = None,
        accent: Optional[str] = None,
        use_case: Optional[str] = None
    ) -> Optional[str]:
        """Find a voice matching the given criteria."""
        voices = self.list_voices()
        
        for voice in voices:
            labels = voice.get("labels", {})
            
            if gender and labels.get("gender", "").lower() != gender.lower():
                continue
            if accent and labels.get("accent", "").lower() != accent.lower():
                continue
            if use_case and labels.get("use_case", "").lower() != use_case.lower():
                continue
            
            return voice["voice_id"]
        
        # Return default if no match
        return self.VOICE_PROFILES["assistant"].voice_id
    
    # =========================================================================
    # Text-to-Speech
    # =========================================================================
    
    def text_to_speech(
        self,
        text: str,
        voice_id: Optional[str] = None,
        voice_profile: Optional[str] = None,
        model: str = "eleven_multilingual_v2",
        output_format: str = "mp3_44100_128",
        save_to_file: bool = True,
        filename: Optional[str] = None
    ) -> AudioOutput:
        """
        Convert text to speech.
        
        Args:
            text: Text to convert
            voice_id: Specific voice ID to use
            voice_profile: Name of pre-defined voice profile
            model: ElevenLabs model to use
            output_format: Audio format
            save_to_file: Whether to save to file
            filename: Custom filename (without extension)
            
        Returns:
            AudioOutput with audio data
        """
        if not self.client:
            return AudioOutput(audio_bytes=b"", text=text)
        
        # Determine voice ID
        if voice_profile and voice_profile in self.VOICE_PROFILES:
            voice_id = self.VOICE_PROFILES[voice_profile].voice_id
        elif not voice_id:
            voice_id = self.VOICE_PROFILES["assistant"].voice_id
        
        try:
            # Generate audio
            audio = self.client.text_to_speech.convert(
                voice_id=voice_id,
                text=text,
                model_id=model,
                output_format=output_format
            )
            
            # Collect audio bytes
            audio_bytes = b"".join(chunk for chunk in audio)
            
            output = AudioOutput(
                audio_bytes=audio_bytes,
                format="mp3",
                voice_id=voice_id,
                text=text
            )
            
            # Save to file if requested
            if save_to_file:
                if not filename:
                    filename = f"tts_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
                
                file_path = self.output_dir / f"{filename}.mp3"
                with open(file_path, "wb") as f:
                    f.write(audio_bytes)
                
                output.file_path = str(file_path)
            
            return output
            
        except Exception as e:
            print(f"Error in text-to-speech: {e}")
            return AudioOutput(audio_bytes=b"", text=text)
    
    async def text_to_speech_async(
        self,
        text: str,
        voice_id: Optional[str] = None,
        voice_profile: Optional[str] = None,
        model: str = "eleven_multilingual_v2"
    ) -> AudioOutput:
        """Async version of text-to-speech."""
        if not self.async_client:
            return AudioOutput(audio_bytes=b"", text=text)
        
        # Determine voice ID
        if voice_profile and voice_profile in self.VOICE_PROFILES:
            voice_id = self.VOICE_PROFILES[voice_profile].voice_id
        elif not voice_id:
            voice_id = self.VOICE_PROFILES["assistant"].voice_id
        
        try:
            audio = await self.async_client.text_to_speech.convert(
                voice_id=voice_id,
                text=text,
                model_id=model
            )
            
            audio_bytes = b"".join([chunk async for chunk in audio])
            
            return AudioOutput(
                audio_bytes=audio_bytes,
                format="mp3",
                voice_id=voice_id,
                text=text
            )
            
        except Exception as e:
            print(f"Error in async text-to-speech: {e}")
            return AudioOutput(audio_bytes=b"", text=text)
    
    # =========================================================================
    # Advanced Features
    # =========================================================================
    
    def generate_podcast(
        self,
        script: List[Dict[str, str]],
        output_filename: str = "podcast"
    ) -> AudioOutput:
        """
        Generate a podcast with multiple speakers.
        
        Args:
            script: List of {"speaker": "name/profile", "text": "dialogue"}
            output_filename: Output filename
            
        Returns:
            Combined audio output
        """
        if not self.client:
            return AudioOutput(audio_bytes=b"", text="")
        
        audio_segments = []
        full_text = []
        
        for entry in script:
            speaker = entry.get("speaker", "assistant")
            text = entry.get("text", "")
            
            if not text:
                continue
            
            # Get voice for speaker
            if speaker in self.VOICE_PROFILES:
                voice_id = self.VOICE_PROFILES[speaker].voice_id
            else:
                voice_id = self.find_voice_by_criteria(use_case=speaker)
            
            # Generate audio for this segment
            output = self.text_to_speech(
                text=text,
                voice_id=voice_id,
                save_to_file=False
            )
            
            if output.audio_bytes:
                audio_segments.append(output.audio_bytes)
                full_text.append(f"{speaker}: {text}")
        
        # Combine audio segments
        combined_audio = b"".join(audio_segments)
        
        # Save combined audio
        file_path = self.output_dir / f"{output_filename}.mp3"
        with open(file_path, "wb") as f:
            f.write(combined_audio)
        
        return AudioOutput(
            audio_bytes=combined_audio,
            format="mp3",
            text="\n".join(full_text),
            file_path=str(file_path)
        )
    
    def generate_notification(
        self,
        message: str,
        urgency: str = "normal"
    ) -> AudioOutput:
        """
        Generate a voice notification.
        
        Args:
            message: Notification message
            urgency: "low", "normal", "high"
            
        Returns:
            Audio output
        """
        # Select voice based on urgency
        voice_profiles = {
            "low": "friendly",
            "normal": "assistant",
            "high": "professional"
        }
        
        profile = voice_profiles.get(urgency, "assistant")
        
        return self.text_to_speech(
            text=message,
            voice_profile=profile,
            filename=f"notification_{urgency}_{datetime.now().strftime('%H%M%S')}"
        )
    
    def generate_report_audio(
        self,
        report_text: str,
        title: str = "Report"
    ) -> AudioOutput:
        """
        Convert a text report to audio narration.
        
        Args:
            report_text: Full report text
            title: Report title
            
        Returns:
            Audio output
        """
        # Add introduction
        full_text = f"This is your {title}. {report_text}"
        
        return self.text_to_speech(
            text=full_text,
            voice_profile="narrator",
            filename=f"report_{title.lower().replace(' ', '_')}_{datetime.now().strftime('%Y%m%d')}"
        )
    
    # =========================================================================
    # Voice Cloning (if available)
    # =========================================================================
    
    def clone_voice(
        self,
        name: str,
        audio_files: List[str],
        description: str = ""
    ) -> Optional[str]:
        """
        Clone a voice from audio samples.
        
        Args:
            name: Name for the cloned voice
            audio_files: List of paths to audio files
            description: Description of the voice
            
        Returns:
            Voice ID of the cloned voice
        """
        if not self.client:
            return None
        
        try:
            # Read audio files
            files = []
            for file_path in audio_files:
                with open(file_path, "rb") as f:
                    files.append(f.read())
            
            # Clone voice
            voice = self.client.clone(
                name=name,
                description=description,
                files=files
            )
            
            return voice.voice_id
            
        except Exception as e:
            print(f"Error cloning voice: {e}")
            return None
    
    # =========================================================================
    # Utility Methods
    # =========================================================================
    
    def get_audio_base64(self, audio_output: AudioOutput) -> str:
        """Convert audio to base64 for embedding."""
        return base64.b64encode(audio_output.audio_bytes).decode()
    
    def estimate_duration(self, text: str) -> float:
        """Estimate audio duration in seconds."""
        # Average speaking rate: ~150 words per minute
        words = len(text.split())
        return (words / 150) * 60
    
    def get_usage(self) -> Dict[str, Any]:
        """Get API usage statistics."""
        if not self.client:
            return {}
        
        try:
            user = self.client.user.get()
            subscription = self.client.user.get_subscription()
            
            return {
                "user_id": user.user_id,
                "character_count": getattr(subscription, 'character_count', 0),
                "character_limit": getattr(subscription, 'character_limit', 0),
                "tier": getattr(subscription, 'tier', 'unknown'),
                "next_reset": getattr(subscription, 'next_character_count_reset_unix', None)
            }
        except Exception as e:
            print(f"Error getting usage: {e}")
            return {}


# ============================================================================
# Agent Voice Interface
# ============================================================================

class AgentVoice:
    """
    Voice interface for AI agents.
    Allows agents to speak their responses.
    """
    
    def __init__(self, voice_profile: str = "assistant"):
        self.voice_ai = VoiceAI()
        self.voice_profile = voice_profile
        self.enabled = ELEVENLABS_AVAILABLE
    
    async def speak(self, text: str) -> Optional[str]:
        """
        Speak text and return file path.
        
        Args:
            text: Text to speak
            
        Returns:
            Path to audio file
        """
        if not self.enabled:
            return None
        
        output = self.voice_ai.text_to_speech(
            text=text,
            voice_profile=self.voice_profile
        )
        
        return output.file_path
    
    async def announce(self, message: str, urgency: str = "normal") -> Optional[str]:
        """
        Make an announcement.
        
        Args:
            message: Announcement message
            urgency: Urgency level
            
        Returns:
            Path to audio file
        """
        if not self.enabled:
            return None
        
        output = self.voice_ai.generate_notification(message, urgency)
        return output.file_path
    
    def set_voice(self, profile: str):
        """Change the voice profile."""
        if profile in VoiceAI.VOICE_PROFILES:
            self.voice_profile = profile


# ============================================================================
# Example Usage
# ============================================================================

def main():
    """Example usage of the Voice AI module."""
    voice = VoiceAI()
    
    # Example 1: Simple text-to-speech
    output = voice.text_to_speech(
        text="Hello! I am your AI assistant. How can I help you today?",
        voice_profile="assistant"
    )
    print(f"Generated audio: {output.file_path}")
    
    # Example 2: Generate a podcast
    # script = [
    #     {"speaker": "narrator", "text": "Welcome to today's market update."},
    #     {"speaker": "professional", "text": "The S&P 500 closed up 1.2% today."},
    #     {"speaker": "narrator", "text": "Thank you for listening."}
    # ]
    # podcast = voice.generate_podcast(script, "market_update")
    # print(f"Generated podcast: {podcast.file_path}")
    
    # Example 3: List available voices
    voices = voice.list_voices()
    print(f"Available voices: {len(voices)}")
    for v in voices[:5]:
        print(f"  - {v['name']} ({v['voice_id']})")


if __name__ == "__main__":
    main()
