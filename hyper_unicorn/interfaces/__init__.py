"""
HYPER UNICORN Interfaces
========================
User interfaces for interacting with the system.
"""

from .alfred_dashboard import AlfredDashboard
from .realtime_dashboard import RealtimeDashboard
from .natural_language import NaturalLanguageInterface
from .voice_interface import VoiceInterface, get_voice_interface, say, listen, notify

__all__ = [
    "AlfredDashboard",
    "RealtimeDashboard",
    "NaturalLanguageInterface",
    "VoiceInterface",
    "get_voice_interface",
    "say",
    "listen",
    "notify"
]
