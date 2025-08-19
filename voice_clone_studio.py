#!/usr/bin/env python3
"""
🎤 VOICE CLONE STUDIO
====================
AI-powered custom voice creation and cloning studio
- Create custom voices from samples
- Real-time voice conversion
- Voice quality analysis
- Professional voice synthesis
"""

import streamlit as st
import numpy as np
import librosa
import soundfile as sf
import tempfile
import os
import time
from pathlib import Path
import json
import matplotlib.pyplot as plt
import plotly.graph_objects as go
import plotly.express as px

# Configure Streamlit
st.set_page_config(
    page_title="Voice Clone Studio - AI Agent",
    page_icon="🎤",
    layout="wide"
)

class VoiceCloneEngine:
    def __init__(self):
        print("🎤 Loading Voice Clone Studio...")
        self.sample_rate = 22050
        self.voice_models = {}
        self.quality_threshold = 0.85
        
    def analyze_voice_sample(self, audio_file_path):
        """Analyze voice characteristics from audio sample"""
        print("📊 Analyzing voice characteristics...")
        
        try:
            # Load audio
            audio, sr = librosa.load(audio_file_path, sr=self.sample_rate)
            
            # Extract voice features
            features = {}
            
            # Pitch analysis
            pitches, magnitudes = librosa.piptrack(y=audio, sr=sr)
            pitch_values = []
            for t in range(pitches.shape[1]):
                index = magnitudes[:, t].argmax()
                pitch = pitches[index, t]
                if pitch > 0:
                    pitch_values.append(pitch)
            
            if pitch_values:
                features['fundamental_freq'] = np.mean(pitch_values)
                features['pitch_range'] = np.max(pitch_values) - np.min(pitch_values)
            else:
                features['fundamental_freq'] = 200  # Default
                features['pitch_range'] = 50
            
            # Spectral features
            spectral_centroids = librosa.feature.spectral_centroid(y=audio, sr=sr)[0]
            features['spectral_centroid'] = np.mean(spectral_centroids)
            
            # MFCC features (voice fingerprint)
            mfcc = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=13)
            features['mfcc_mean'] = np.mean(mfcc, axis=1)
            features['mfcc_std'] = np.std(mfcc, axis=1)
            
            # Voice quality metrics
            features['duration'] = len(audio) / sr
            features['energy'] = np.mean(librosa.feature.rms(y=audio)[0])
            
            # Classify voice characteristics
            features['voice_type'] = self.classify_voice_type(features)
            features['quality_score'] = self.calculate_voice_quality(audio, features)
            
            print("✅ Voice analysis complete")
            return features
            
        except Exception as e:
            print(f"❌ Voice analysis failed: {e}")
            return None
    
    def classify_voice_type(self, features):
        """Classify voice type based on features"""
        fundamental_freq = features['fundamental_freq']
        
        if fundamental_freq < 150:
            return "Deep/Bass"
        elif fundamental_freq < 200:
            return "Medium/Baritone"
        elif fundamental_freq < 250:
            return "Light/Tenor"
        else:
            return "High/Soprano"
    
    def calculate_voice_quality(self, audio, features):
        """Calculate voice quality score"""
        # Simple quality metrics
        snr = self.calculate_snr(audio)
        clarity = features['energy'] * 0.5
        consistency = 1.0 - (np.std(features['mfcc_mean']) / np.mean(features['mfcc_mean']))
        
        # Combine metrics (0-1 score)
        quality = (snr * 0.4 + clarity * 0.3 + consistency * 0.3)
        return min(max(quality, 0.0), 1.0)
    
    def calculate_snr(self, audio):
        """Calculate signal-to-noise ratio"""
        # Simple SNR estimation
        signal_power = np.mean(audio ** 2)
        noise_power = np.var(audio) * 0.1  # Rough noise estimate
        if noise_power > 0:
            snr = 10 * np.log10(signal_power / noise_power)
            return min(max(snr / 30, 0), 1)  # Normalize to 0-1
        return 0.8  # Default decent quality
    
    def create_voice_model(self, voice_samples, voice_name):
        """Create custom voice model from samples"""
        print(f"🧠 Training voice model: {voice_name}")
        
        if not voice_samples:
            return None
        
        # Analyze all samples
        combined_features = []
        quality_scores = []
        
        for sample_path in voice_samples:
            features = self.analyze_voice_sample(sample_path)
            if features:
                combined_features.append(features)
                quality_scores.append(features['quality_score'])
        
        if not combined_features:
            return None
        
        # Create voice profile
        voice_model = {
            "name": voice_name,
            "created_at": time.time(),
            "sample_count": len(combined_features),
            "quality_score": np.mean(quality_scores),
            "voice_profile": self.create_voice_profile(combined_features),
            "ready": np.mean(quality_scores) >= self.quality_threshold
        }
        
        # Store model
        self.voice_models[voice_name] = voice_model
        
        print(f"✅ Voice model created with quality: {voice_model['quality_score']:.2f}")
        return voice_model
    
    def create_voice_profile(self, features_list):
        """Create averaged voice profile from samples"""
        profile = {}
        
        # Average all features
        all_fundamental_freq = [f['fundamental_freq'] for f in features_list]
        all_spectral_centroids = [f['spectral_centroid'] for f in features_list]
        all_energies = [f['energy'] for f in features_list]
        
        profile['avg_fundamental_freq'] = np.mean(all_fundamental_freq)
        profile['avg_spectral_centroid'] = np.mean(all_spectral_centroids)
        profile['avg_energy'] = np.mean(all_energies)
        
        # Most common voice type
        voice_types = [f['voice_type'] for f in features_list]
        profile['dominant_voice_type'] = max(set(voice_types), key=voice_types.count)
        
        return profile
    
    def synthesize_speech(self, text, voice_model_name):
        """Synthesize speech using custom voice model"""
        print(f"🎵 Synthesizing speech with {voice_model_name}...")
        
        if voice_model_name not in self.voice_models:
            return None
        
        # In production, this would use TTS models like Tacotron2/WaveGlow
        # For demo, we'll simulate the process
        
        # Generate basic synthetic audio (placeholder)
        duration = len(text) * 0.1  # ~10 chars per second
        t = np.linspace(0, duration, int(duration * self.sample_rate))
        
        # Create synthetic waveform based on voice profile
        voice_profile = self.voice_models[voice_model_name]['voice_profile']
        base_freq = voice_profile['avg_fundamental_freq']
        
        # Simple synthesis (in production would be much more sophisticated)
        synthetic_audio = np.sin(2 * np.pi * base_freq * t) * 0.3
        synthetic_audio += np.random.normal(0, 0.05, len(synthetic_audio))  # Add texture
        
        # Apply voice characteristics
        synthetic_audio *= voice_profile['avg_energy']
        
        print("✅ Speech synthesis complete")
        return synthetic_audio
    
    def voice_conversion(self, source_audio_path, target_voice_model):
        """Convert source audio to target voice"""
        print("🔄 Performing voice conversion...")
        
        # Load source audio
        source_audio, sr = librosa.load(source_audio_path, sr=self.sample_rate)
        
        # In production, this would use voice conversion models
        # For demo, apply basic voice characteristics
        
        if target_voice_model not in self.voice_models:
            return source_audio
        
        target_profile = self.voice_models[target_voice_model]['voice_profile']
        
        # Apply pitch shifting (simplified)
        pitch_shift = target_profile['avg_fundamental_freq'] / 200  # Normalize to base
        converted_audio = librosa.effects.pitch_shift(source_audio, sr, n_steps=pitch_shift-1)
        
        # Apply energy scaling
        converted_audio *= target_profile['avg_energy'] / np.mean(np.abs(converted_audio))
        
        print("✅ Voice conversion complete")
        return converted_audio
    
    def export_voice_model(self, voice_model_name):
        """Export voice model for use"""
        if voice_model_name in self.voice_models:
            model_data = self.voice_models[voice_model_name]
            return json.dumps(model_data, indent=2)
        return None

def create_voice_visualization(features):
    """Create visualizations for voice analysis"""
    if not features:
        return None, None
    
    # Voice characteristics chart
    fig1 = go.Figure()
    
    categories = ['Pitch', 'Energy', 'Clarity', 'Quality']
    values = [
        features['fundamental_freq'] / 400,  # Normalize
        features['energy'] * 2,
        features.get('quality_score', 0.5),
        features.get('quality_score', 0.5)
    ]
    
    fig1.add_trace(go.Scatterpolar(
        r=values,
        theta=categories,
        fill='toself',
        name='Voice Profile'
    ))
    
    fig1.update_layout(
        polar=dict(
            radialaxis=dict(
                visible=True,
                range=[0, 1]
            )),
        title="Voice Characteristics Profile"
    )
    
    # Frequency analysis
    fig2 = px.bar(
        x=['Fundamental Frequency', 'Spectral Centroid', 'Energy Level'],
        y=[features['fundamental_freq'], features['spectral_centroid'], features['energy'] * 1000],
        title="Voice Frequency Analysis"
    )
    
    return fig1, fig2

def main():
    st.title("🎤 Voice Clone Studio")
    st.markdown("**AI-powered custom voice creation and cloning**")
    
    # Initialize engine
    if 'voice_engine' not in st.session_state:
        with st.spinner("🎤 Loading Voice Clone AI..."):
            st.session_state.voice_engine = VoiceCloneEngine()
    
    engine = st.session_state.voice_engine
    
    # Main interface
    tab1, tab2, tab3, tab4 = st.tabs(["🎙️ Voice Analysis", "🧠 Model Training", "🎵 Speech Synthesis", "🔄 Voice Conversion"])
    
    with tab1:
        st.header("🎙️ Voice Sample Analysis")
        st.markdown("Upload voice samples to analyze characteristics")
        
        uploaded_audio = st.file_uploader(
            "Upload Voice Sample",
            type=['wav', 'mp3', 'flac', 'm4a'],
            help="Upload clear voice recordings for analysis"
        )
        
        if uploaded_audio and st.button("🔍 Analyze Voice"):
            with st.spinner("🎤 Analyzing voice characteristics..."):
                # Save uploaded file
                temp_audio = tempfile.NamedTemporaryFile(delete=False, suffix='.wav')
                temp_audio.write(uploaded_audio.read())
                temp_audio.close()
                
                try:
                    # Analyze voice
                    features = engine.analyze_voice_sample(temp_audio.name)
                    
                    if features:
                        st.success("✅ Voice analysis complete!")
                        
                        # Display results
                        col1, col2 = st.columns(2)
                        
                        with col1:
                            st.subheader("📊 Voice Characteristics")
                            st.metric("Voice Type", features['voice_type'])
                            st.metric("Fundamental Frequency", f"{features['fundamental_freq']:.1f} Hz")
                            st.metric("Quality Score", f"{features['quality_score']:.0%}")
                            st.metric("Sample Duration", f"{features['duration']:.1f}s")
                        
                        with col2:
                            # Create visualizations
                            fig1, fig2 = create_voice_visualization(features)
                            if fig1:
                                st.plotly_chart(fig1, use_container_width=True)
                        
                        # Detailed analysis
                        with st.expander("🔬 Detailed Analysis"):
                            st.json(features)
                            
                    else:
                        st.error("❌ Voice analysis failed")
                        
                except Exception as e:
                    st.error(f"❌ Analysis error: {e}")
                finally:
                    os.unlink(temp_audio.name)
    
    with tab2:
        st.header("🧠 Voice Model Training")
        st.markdown("Create custom voice models from multiple samples")
        
        voice_name = st.text_input("Voice Model Name", placeholder="My Custom Voice")
        
        uploaded_samples = st.file_uploader(
            "Upload Voice Samples (Multiple)",
            type=['wav', 'mp3', 'flac', 'm4a'],
            accept_multiple_files=True,
            help="Upload 3-10 voice samples for best results"
        )
        
        if st.button("🚀 Train Voice Model") and voice_name and uploaded_samples:
            with st.spinner("🧠 Training custom voice model..."):
                # Save uploaded samples
                sample_paths = []
                for i, sample in enumerate(uploaded_samples):
                    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.wav')
                    temp_file.write(sample.read())
                    temp_file.close()
                    sample_paths.append(temp_file.name)
                
                try:
                    # Train model
                    voice_model = engine.create_voice_model(sample_paths, voice_name)
                    
                    if voice_model and voice_model['ready']:
                        st.success(f"✅ Voice model '{voice_name}' created successfully!")
                        
                        col1, col2, col3 = st.columns(3)
                        with col1:
                            st.metric("Quality Score", f"{voice_model['quality_score']:.0%}")
                        with col2:
                            st.metric("Sample Count", voice_model['sample_count'])
                        with col3:
                            st.metric("Status", "✅ Ready" if voice_model['ready'] else "⚠️ Needs More Data")
                        
                        # Export model
                        model_json = engine.export_voice_model(voice_name)
                        if model_json:
                            st.download_button(
                                "📥 Download Voice Model",
                                model_json,
                                file_name=f"{voice_name}_model.json",
                                mime="application/json"
                            )
                    
                    elif voice_model:
                        st.warning(f"⚠️ Voice model created but quality is low ({voice_model['quality_score']:.0%}). Upload more/better samples.")
                    else:
                        st.error("❌ Voice model training failed")
                
                except Exception as e:
                    st.error(f"❌ Training error: {e}")
                finally:
                    # Cleanup
                    for path in sample_paths:
                        if os.path.exists(path):
                            os.unlink(path)
    
    with tab3:
        st.header("🎵 Speech Synthesis")
        st.markdown("Generate speech using custom voice models")
        
        # Select voice model
        if engine.voice_models:
            selected_model = st.selectbox(
                "Select Voice Model",
                list(engine.voice_models.keys())
            )
            
            # Text input
            text_to_speak = st.text_area(
                "Text to Synthesize",
                placeholder="Enter text to convert to speech...",
                height=100
            )
            
            if st.button("🎤 Generate Speech") and text_to_speak and selected_model:
                with st.spinner("🎵 Synthesizing speech..."):
                    try:
                        # Generate speech
                        synthetic_audio = engine.synthesize_speech(text_to_speak, selected_model)
                        
                        if synthetic_audio is not None:
                            # Save audio
                            output_path = tempfile.mktemp(suffix='.wav')
                            sf.write(output_path, synthetic_audio, engine.sample_rate)
                            
                            st.success("✅ Speech generated!")
                            
                            # Play audio
                            with open(output_path, 'rb') as f:
                                st.audio(f.read(), format='audio/wav')
                            
                            # Download button
                            with open(output_path, 'rb') as f:
                                st.download_button(
                                    "📥 Download Speech",
                                    f.read(),
                                    file_name=f"speech_{selected_model}_{int(time.time())}.wav",
                                    mime="audio/wav"
                                )
                            
                            # Cleanup
                            if os.path.exists(output_path):
                                os.unlink(output_path)
                        else:
                            st.error("❌ Speech generation failed")
                            
                    except Exception as e:
                        st.error(f"❌ Synthesis error: {e}")
        else:
            st.info("👆 Create a voice model first in the Model Training tab")
    
    with tab4:
        st.header("🔄 Voice Conversion")
        st.markdown("Convert existing audio to different voices")
        
        # Select target voice
        if engine.voice_models:
            target_voice = st.selectbox(
                "Target Voice Model",
                list(engine.voice_models.keys()),
                key="conversion_voice"
            )
            
            # Upload source audio
            source_audio = st.file_uploader(
                "Upload Source Audio",
                type=['wav', 'mp3', 'flac', 'm4a'],
                key="conversion_audio",
                help="Audio to convert to the target voice"
            )
            
            if st.button("🔄 Convert Voice") and source_audio and target_voice:
                with st.spinner("🔄 Converting voice..."):
                    # Save source audio
                    temp_source = tempfile.NamedTemporaryFile(delete=False, suffix='.wav')
                    temp_source.write(source_audio.read())
                    temp_source.close()
                    
                    try:
                        # Convert voice
                        converted_audio = engine.voice_conversion(temp_source.name, target_voice)
                        
                        if converted_audio is not None:
                            # Save converted audio
                            output_path = tempfile.mktemp(suffix='.wav')
                            sf.write(output_path, converted_audio, engine.sample_rate)
                            
                            st.success("✅ Voice conversion complete!")
                            
                            col1, col2 = st.columns(2)
                            
                            with col1:
                                st.subheader("🎤 Original")
                                with open(temp_source.name, 'rb') as f:
                                    st.audio(f.read(), format='audio/wav')
                            
                            with col2:
                                st.subheader(f"🎵 Converted to {target_voice}")
                                with open(output_path, 'rb') as f:
                                    st.audio(f.read(), format='audio/wav')
                                
                                # Download button
                                with open(output_path, 'rb') as f:
                                    st.download_button(
                                        "📥 Download Converted Audio",
                                        f.read(),
                                        file_name=f"converted_{target_voice}_{int(time.time())}.wav",
                                        mime="audio/wav"
                                    )
                            
                            # Cleanup
                            if os.path.exists(output_path):
                                os.unlink(output_path)
                        else:
                            st.error("❌ Voice conversion failed")
                            
                    except Exception as e:
                        st.error(f"❌ Conversion error: {e}")
                    finally:
                        if os.path.exists(temp_source.name):
                            os.unlink(temp_source.name)
        else:
            st.info("👆 Create a voice model first in the Model Training tab")
    
    # Sidebar info
    st.sidebar.markdown("## 🎤 Voice Clone Studio")
    st.sidebar.markdown("**Current Models:**")
    
    if engine.voice_models:
        for name, model in engine.voice_models.items():
            status = "✅ Ready" if model['ready'] else "⚠️ Training"
            quality = f"{model['quality_score']:.0%}"
            st.sidebar.markdown(f"🎵 **{name}**\n- Status: {status}\n- Quality: {quality}")
    else:
        st.sidebar.info("No voice models created yet")
    
    st.sidebar.markdown("## 🤖 Agent Status")
    st.sidebar.success("✅ VoiceClone_Agent: Active")
    st.sidebar.info("🎤 Voice AI: Loaded")
    st.sidebar.info("🧠 Training: Ready")
    st.sidebar.info("🎵 Synthesis: Online")

if __name__ == "__main__":
    main()
