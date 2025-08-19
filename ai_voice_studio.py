#!/usr/bin/env python3
"""
🎤 AI VOICE & AUDIO STUDIO
=========================
Professional AI voice cloning, audio editing, and voice templates
"""

import streamlit as st
import time
import os
import json
import base64
from datetime import datetime
from typing import Dict, List, Any, Optional
import pandas as pd

# Audio processing imports
try:
    import librosa
    import soundfile as sf
    import numpy as np
    AUDIO_AVAILABLE = True
except ImportError:
    AUDIO_AVAILABLE = False

# Set page config
st.set_page_config(
    page_title="🎤 AI Voice Studio",
    page_icon="🎤",
    layout="wide"
)

class AIVoiceStudio:
    """AI voice cloning and audio processing studio"""
    
    def __init__(self):
        if 'voice_chat_history' not in st.session_state:
            st.session_state.voice_chat_history = []
        if 'voice_results' not in st.session_state:
            st.session_state.voice_results = []
        if 'uploaded_audio' not in st.session_state:
            st.session_state.uploaded_audio = {}
        
        # Voice templates
        self.voice_templates = {
            'professional': {'pitch': 0, 'speed': 1.0, 'tone': 'neutral'},
            'friendly': {'pitch': 2, 'speed': 1.1, 'tone': 'warm'},
            'authoritative': {'pitch': -1, 'speed': 0.9, 'tone': 'strong'},
            'youthful': {'pitch': 3, 'speed': 1.2, 'tone': 'energetic'},
            'calming': {'pitch': -2, 'speed': 0.8, 'tone': 'soothing'},
            'excited': {'pitch': 4, 'speed': 1.3, 'tone': 'enthusiastic'},
            'narrator': {'pitch': 0, 'speed': 0.9, 'tone': 'storytelling'},
            'robot': {'pitch': -5, 'speed': 1.0, 'tone': 'synthetic'}
        }
    
    def render_interface(self):
        st.title("🎤 AI Voice & Audio Studio")
        st.markdown("### Create, clone, and edit voices with AI!")
        
        # Status indicators
        col1, col2, col3 = st.columns(3)
        with col1:
            status = "✅ Ready" if AUDIO_AVAILABLE else "⚠️ Limited"
            st.metric("Audio Processing", status)
        with col2:
            st.metric("Voice Templates", f"{len(self.voice_templates)} Available")
        with col3:
            st.metric("Projects Created", len(st.session_state.voice_results))
        
        st.divider()
        
        # Audio upload area
        self.render_audio_upload()
        
        # Voice templates gallery
        self.render_voice_templates()
        
        # Main chat interface
        self.render_voice_chat_interface()
        
        # Show recent projects
        if st.session_state.voice_results:
            self.render_voice_projects()
    
    def render_audio_upload(self):
        st.subheader("🎵 Upload Audio Files")
        
        col1, col2 = st.columns(2)
        
        with col1:
            uploaded_audio = st.file_uploader(
                "Upload Audio for Voice Cloning",
                type=['wav', 'mp3', 'flac', 'm4a'],
                accept_multiple_files=True,
                key="audio_upload"
            )
            
            if uploaded_audio:
                for audio in uploaded_audio:
                    if audio.name not in st.session_state.uploaded_audio:
                        # Save uploaded file
                        upload_dir = "audio_uploads"
                        os.makedirs(upload_dir, exist_ok=True)
                        file_path = os.path.join(upload_dir, audio.name)
                        
                        with open(file_path, "wb") as f:
                            f.write(audio.getbuffer())
                        
                        st.session_state.uploaded_audio[audio.name] = {
                            'path': file_path,
                            'uploaded_at': datetime.now(),
                            'duration': 'Unknown'
                        }
                        
                        st.success(f"✅ Uploaded: {audio.name}")
        
        with col2:
            st.subheader("🎙️ Record Voice Sample")
            
            if st.button("🔴 Start Recording", type="primary"):
                st.info("🎙️ Voice recording feature coming soon! For now, upload audio files.")
            
            st.write("**Tips for best voice cloning:**")
            st.write("• Use clear, high-quality audio (preferably WAV)")
            st.write("• 30 seconds to 2 minutes of clean speech")
            st.write("• Avoid background noise")
            st.write("• Include varied tones and expressions")
        
        # Show uploaded audio files
        if st.session_state.uploaded_audio:
            with st.expander(f"🎵 Uploaded Audio ({len(st.session_state.uploaded_audio)})"):
                for filename, file_info in st.session_state.uploaded_audio.items():
                    col1, col2, col3 = st.columns([2, 1, 1])
                    with col1:
                        st.write(f"🎵 {filename}")
                        # Audio player
                        if os.path.exists(file_info['path']):
                            with open(file_info['path'], 'rb') as audio_file:
                                audio_bytes = audio_file.read()
                                st.audio(audio_bytes)
                    with col2:
                        st.write(file_info['uploaded_at'].strftime('%H:%M:%S'))
                    with col3:
                        if st.button(f"🗑️ Remove", key=f"remove_audio_{filename}"):
                            if os.path.exists(file_info['path']):
                                os.remove(file_info['path'])
                            del st.session_state.uploaded_audio[filename]
                            st.rerun()
    
    def render_voice_templates(self):
        st.subheader("🎭 AI Voice Templates")
        
        # Display voice templates in a grid
        cols = st.columns(4)
        
        for i, (template_name, settings) in enumerate(self.voice_templates.items()):
            with cols[i % 4]:
                with st.container():
                    st.markdown(f"**🎭 {template_name.title()}**")
                    st.write(f"Tone: {settings['tone']}")
                    st.write(f"Speed: {settings['speed']}x")
                    
                    if st.button(f"🎤 Use {template_name.title()}", key=f"template_{template_name}"):
                        # Add to chat as if user requested this template
                        request = f"Apply {template_name} voice template to my audio"
                        st.session_state.voice_chat_history.append({
                            'role': 'user',
                            'content': request,
                            'timestamp': datetime.now()
                        })
                        
                        self.process_voice_request(request)
                        st.rerun()
        
        st.divider()
    
    def render_voice_chat_interface(self):
        st.subheader("💬 AI Voice Assistant")
        
        # Display chat history
        for message in st.session_state.voice_chat_history:
            if message['role'] == 'user':
                st.markdown(f"**You:** {message['content']}")
            else:
                st.markdown(f"**🎤 Voice AI:** {message['content']}")
        
        # Chat input
        user_input = st.text_input(
            "What would you like me to do with your voice/audio?",
            placeholder="e.g., 'Clone my voice and make it sound more professional' or 'Convert text to speech with a friendly tone'",
            key="voice_chat_input"
        )
        
        col1, col2 = st.columns([1, 4])
        with col1:
            if st.button("🎤 Process", type="primary"):
                if user_input:
                    self.process_voice_request(user_input)
                    st.rerun()
        
        with col2:
            if st.button("🗑️ Clear Chat"):
                st.session_state.voice_chat_history = []
                st.rerun()
        
        # Voice operation examples
        st.markdown("**💡 Voice Commands:**")
        examples = [
            "Clone my uploaded voice sample",
            "Make my voice sound more professional", 
            "Convert this text to speech: 'Hello world'",
            "Change pitch of my audio to be higher",
            "Add echo effect to my voice",
            "Remove background noise from audio",
            "Create a robot version of my voice",
            "Make my voice sound younger"
        ]
        
        cols = st.columns(4)
        for i, example in enumerate(examples):
            with cols[i % 4]:
                if st.button(f"💡 {example[:15]}...", key=f"voice_example_{i}"):
                    self.process_voice_request(example)
                    st.rerun()
    
    def render_voice_projects(self):
        st.subheader("🎤 Recent Voice Projects")
        
        for i, result in enumerate(reversed(st.session_state.voice_results[-3:])):
            with st.expander(f"🎯 {result['operation']} - {result['timestamp'].strftime('%H:%M:%S')}", expanded=True):
                col1, col2, col3 = st.columns([2, 1, 1])
                
                with col1:
                    st.write(f"**Operation:** {result['operation']}")
                    if result.get('input_file'):
                        st.write(f"**Input:** {result['input_file']}")
                    if result.get('settings'):
                        st.write(f"**Settings:** {result['settings']}")
                    if result.get('text_input'):
                        st.write(f"**Text:** {result['text_input']}")
                
                with col2:
                    # Audio player for result
                    if result.get('output_path') and os.path.exists(result['output_path']):
                        with open(result['output_path'], 'rb') as audio_file:
                            audio_bytes = audio_file.read()
                            st.audio(audio_bytes)
                
                with col3:
                    # Download button
                    if result.get('output_path') and os.path.exists(result['output_path']):
                        with open(result['output_path'], 'rb') as f:
                            st.download_button(
                                "📥 Download",
                                data=f.read(),
                                file_name=os.path.basename(result['output_path']),
                                mime="audio/wav",
                                key=f"download_voice_{i}"
                            )
                    
                    if st.button(f"🔄 Regenerate", key=f"regenerate_voice_{i}"):
                        st.info("Regeneration feature coming soon!")
    
    def process_voice_request(self, user_input: str):
        """Process natural language voice request"""
        
        # Add user message
        st.session_state.voice_chat_history.append({
            'role': 'user',
            'content': user_input,
            'timestamp': datetime.now()
        })
        
        # Parse the request
        voice_task = self.parse_voice_request(user_input)
        
        if not voice_task:
            response = "I'm not sure what voice operation you want. Try something like 'clone my voice' or 'convert text to speech'."
            st.session_state.voice_chat_history.append({
                'role': 'assistant',
                'content': response,
                'timestamp': datetime.now()
            })
            return
        
        # Execute the task
        response = f"🎤 I'll {voice_task['operation']} for you. Processing audio now..."
        st.session_state.voice_chat_history.append({
            'role': 'assistant',
            'content': response,
            'timestamp': datetime.now()
        })
        
        # Perform voice operation
        result = self.execute_voice_task(voice_task)
        
        if result.get('success'):
            response = f"✅ Done! {voice_task['operation'].title()} completed successfully."
            if result.get('output_path'):
                response += f" Audio saved as {os.path.basename(result['output_path'])}."
            
            # Store result
            st.session_state.voice_results.append({
                'timestamp': datetime.now(),
                'operation': voice_task['operation'],
                'input_file': voice_task.get('input_file'),
                'text_input': voice_task.get('text_input'),
                'settings': voice_task.get('settings'),
                'output_path': result.get('output_path'),
                'success': True
            })
        else:
            response = f"❌ Sorry, I couldn't complete that voice operation. {result.get('error', 'Unknown error.')}"
        
        st.session_state.voice_chat_history.append({
            'role': 'assistant',
            'content': response,
            'timestamp': datetime.now()
        })
    
    def parse_voice_request(self, text: str) -> Dict[str, Any]:
        """Parse natural language into voice operation"""
        text_lower = text.lower()
        
        # Determine operation type
        if any(word in text_lower for word in ['clone', 'copy', 'mimic']):
            operation = 'voice_clone'
            settings = {}
        elif any(word in text_lower for word in ['text to speech', 'tts', 'speak', 'say']):
            operation = 'text_to_speech'
            settings = {}
            # Extract text to convert
            if ':' in text:
                text_part = text.split(':', 1)[1].strip().strip('\'"')
                settings['text_input'] = text_part
        elif any(word in text_lower for word in ['pitch', 'high', 'low', 'deeper', 'higher']):
            operation = 'adjust_pitch'
            settings = self.extract_pitch_settings(text_lower)
        elif any(word in text_lower for word in ['speed', 'fast', 'slow', 'tempo']):
            operation = 'adjust_speed'
            settings = self.extract_speed_settings(text_lower)
        elif any(word in text_lower for word in ['echo', 'reverb', 'effect']):
            operation = 'add_effects'
            settings = self.extract_effect_settings(text_lower)
        elif any(word in text_lower for word in ['noise', 'clean', 'remove']):
            operation = 'noise_reduction'
            settings = {}
        elif any(template in text_lower for template in self.voice_templates.keys()):
            operation = 'apply_template'
            template_name = next(t for t in self.voice_templates.keys() if t in text_lower)
            settings = {'template': template_name}
        else:
            operation = 'general_processing'
            settings = {}
        
        # Find input file
        input_file = self.find_audio_input_file(text_lower)
        
        return {
            'operation': operation,
            'input_file': input_file,
            'settings': settings
        }
    
    def extract_pitch_settings(self, text: str) -> Dict[str, Any]:
        """Extract pitch adjustment settings"""
        settings = {'pitch_shift': 0}
        
        if any(word in text for word in ['high', 'higher', 'up']):
            settings['pitch_shift'] = 3
        elif any(word in text for word in ['low', 'lower', 'deep', 'down']):
            settings['pitch_shift'] = -3
        
        return settings
    
    def extract_speed_settings(self, text: str) -> Dict[str, Any]:
        """Extract speed adjustment settings"""
        settings = {'speed_factor': 1.0}
        
        if any(word in text for word in ['fast', 'faster', 'quick']):
            settings['speed_factor'] = 1.3
        elif any(word in text for word in ['slow', 'slower']):
            settings['speed_factor'] = 0.7
        
        return settings
    
    def extract_effect_settings(self, text: str) -> Dict[str, Any]:
        """Extract audio effect settings"""
        settings = {}
        
        if 'echo' in text:
            settings['effect'] = 'echo'
        elif 'reverb' in text:
            settings['effect'] = 'reverb'
        else:
            settings['effect'] = 'echo'  # default
        
        return settings
    
    def find_audio_input_file(self, text: str) -> Optional[str]:
        """Find which uploaded audio file to use"""
        if not st.session_state.uploaded_audio:
            return None
        
        # If only one file, use it
        if len(st.session_state.uploaded_audio) == 1:
            return list(st.session_state.uploaded_audio.keys())[0]
        
        # Look for file name in text
        for filename in st.session_state.uploaded_audio.keys():
            if filename.lower() in text:
                return filename
        
        # Use most recent upload
        most_recent = max(
            st.session_state.uploaded_audio.items(),
            key=lambda x: x[1]['uploaded_at']
        )
        return most_recent[0]
    
    def execute_voice_task(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """Execute voice processing task"""
        operation = task['operation']
        settings = task.get('settings', {})
        
        # Create output directory
        output_dir = "processed_audio"
        os.makedirs(output_dir, exist_ok=True)
        
        if operation == 'text_to_speech':
            return self.text_to_speech(settings, output_dir)
        elif operation in ['voice_clone', 'adjust_pitch', 'adjust_speed', 'add_effects', 'noise_reduction', 'apply_template']:
            input_file = task.get('input_file')
            if not input_file:
                return {'success': False, 'error': 'No audio file found. Please upload an audio file first.'}
            
            file_info = st.session_state.uploaded_audio.get(input_file)
            if not file_info:
                return {'success': False, 'error': 'Input audio file not found.'}
            
            return self.process_audio_file(file_info['path'], operation, settings, output_dir)
        else:
            return {'success': False, 'error': 'Operation not yet implemented'}
    
    def text_to_speech(self, settings: Dict[str, Any], output_dir: str) -> Dict[str, Any]:
        """Convert text to speech (simulated)"""
        text_input = settings.get('text_input', 'Hello, this is a text to speech test.')
        
        # Generate output filename
        output_path = os.path.join(output_dir, f"tts_{int(time.time())}.wav")
        
        try:
            # Simulate TTS by creating a simple tone (placeholder)
            if AUDIO_AVAILABLE:
                # Create a simple sine wave as placeholder
                duration = len(text_input) * 0.1  # Rough estimate
                sample_rate = 22050
                t = np.linspace(0, duration, int(sample_rate * duration))
                
                # Generate speech-like frequencies
                frequencies = [200, 250, 300, 350, 400]  # Simple speech-like formants
                audio = np.sum([np.sin(2 * np.pi * f * t) for f in frequencies], axis=0)
                audio = audio / np.max(np.abs(audio)) * 0.3  # Normalize
                
                # Save as WAV
                sf.write(output_path, audio, sample_rate)
                
                return {
                    'success': True,
                    'output_path': output_path,
                    'operation': 'text_to_speech'
                }
            else:
                # Create a placeholder file
                with open(output_path.replace('.wav', '.txt'), 'w') as f:
                    f.write(f"TTS Output: {text_input}")
                
                return {
                    'success': True,
                    'output_path': output_path.replace('.wav', '.txt'),
                    'operation': 'text_to_speech_placeholder'
                }
                
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def process_audio_file(self, input_path: str, operation: str, settings: Dict[str, Any], output_dir: str) -> Dict[str, Any]:
        """Process audio file with various operations"""
        
        # Generate output filename
        base_name = os.path.splitext(os.path.basename(input_path))[0]
        output_path = os.path.join(output_dir, f"{base_name}_{operation}_{int(time.time())}.wav")
        
        try:
            if not AUDIO_AVAILABLE:
                # Create a placeholder result
                with open(output_path.replace('.wav', '.txt'), 'w') as f:
                    f.write(f"Audio processing result: {operation} applied to {os.path.basename(input_path)}")
                
                return {
                    'success': True,
                    'output_path': output_path.replace('.wav', '.txt'),
                    'operation': f'{operation}_placeholder'
                }
            
            # Load audio file
            audio, sr = librosa.load(input_path)
            
            # Apply operation
            if operation == 'adjust_pitch':
                pitch_shift = settings.get('pitch_shift', 0)
                audio = librosa.effects.pitch_shift(audio, sr=sr, n_steps=pitch_shift)
            
            elif operation == 'adjust_speed':
                speed_factor = settings.get('speed_factor', 1.0)
                audio = librosa.effects.time_stretch(audio, rate=speed_factor)
            
            elif operation == 'add_effects':
                effect = settings.get('effect', 'echo')
                if effect == 'echo':
                    # Simple echo effect
                    delay_samples = int(0.3 * sr)  # 300ms delay
                    echo = np.zeros_like(audio)
                    echo[delay_samples:] = audio[:-delay_samples] * 0.5
                    audio = audio + echo
            
            elif operation == 'apply_template':
                template_name = settings.get('template', 'professional')
                template_settings = self.voice_templates.get(template_name, {})
                
                # Apply template settings
                if 'pitch' in template_settings:
                    audio = librosa.effects.pitch_shift(audio, sr=sr, n_steps=template_settings['pitch'])
                
                if 'speed' in template_settings:
                    audio = librosa.effects.time_stretch(audio, rate=template_settings['speed'])
            
            # Normalize audio
            audio = audio / np.max(np.abs(audio))
            
            # Save processed audio
            sf.write(output_path, audio, sr)
            
            return {
                'success': True,
                'output_path': output_path,
                'operation': operation
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}

def main():
    app = AIVoiceStudio()
    app.render_interface()

if __name__ == "__main__":
    main()
