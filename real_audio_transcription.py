#!/usr/bin/env python3
"""
🎙️ REAL AUDIO TRANSCRIPTION IMPLEMENTATION
OpenAI Whisper for speech-to-text transcription
Business value: Meeting transcription, customer service, accessibility
"""

import whisper
import os
import json
import time
from datetime import datetime
import numpy as np
from pydub import AudioSegment
import io

class RealAudioTranscription:
    """
    Real audio transcription system using OpenAI Whisper
    """
    
    def __init__(self, model_size="base"):
        print(f"🎙️ Loading Whisper {model_size} model...")
        
        # Load Whisper model
        # Available models: tiny, base, small, medium, large
        # tiny: ~39 MB, base: ~74 MB, small: ~244 MB, medium: ~769 MB, large: ~1550 MB
        self.model = whisper.load_model(model_size)
        
        print(f"✅ Whisper {model_size} model loaded successfully!")
        print(f"📊 Model details:")
        print(f"   • Languages: 99+ languages supported")
        print(f"   • Speed: {'Fast' if model_size in ['tiny', 'base'] else 'Accurate'}")
        print(f"   • Use case: {'Real-time' if model_size in ['tiny', 'base'] else 'High-quality'}")
    
    def transcribe_file(self, audio_path):
        """Transcribe an audio file to text"""
        print(f"\n🎵 Transcribing audio file: {audio_path}")
        
        if not os.path.exists(audio_path):
            print(f"❌ Error: Audio file not found: {audio_path}")
            return None
        
        start_time = time.time()
        
        try:
            # Transcribe with Whisper
            result = self.model.transcribe(
                audio_path,
                verbose=False,
                word_timestamps=True  # Get word-level timestamps
            )
            
            processing_time = time.time() - start_time
            
            # Extract key information
            transcript_data = {
                "file": audio_path,
                "language": result["language"],
                "text": result["text"],
                "segments": [],
                "processing_time": round(processing_time, 2),
                "timestamp": datetime.now().isoformat()
            }
            
            # Process segments with timestamps
            for segment in result["segments"]:
                segment_data = {
                    "start": round(segment["start"], 2),
                    "end": round(segment["end"], 2),
                    "text": segment["text"].strip(),
                    "confidence": round(segment.get("avg_logprob", 0), 3)
                }
                transcript_data["segments"].append(segment_data)
            
            # Save transcript
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_file = f"transcript_{timestamp}.json"
            
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(transcript_data, f, indent=2, ensure_ascii=False)
            
            print(f"🎯 Transcription Results:")
            print(f"   📝 Language detected: {result['language']}")
            print(f"   ⏱️  Processing time: {processing_time:.2f} seconds")
            print(f"   📄 Segments: {len(transcript_data['segments'])}")
            print(f"   💾 Saved to: {output_file}")
            print(f"\n📋 Transcript Preview:")
            print(f"   \"{result['text'][:200]}{'...' if len(result['text']) > 200 else ''}\"")
            
            return transcript_data
            
        except Exception as e:
            print(f"❌ Error during transcription: {str(e)}")
            return None
    
    def transcribe_with_speakers(self, audio_path):
        """Advanced transcription with speaker diarization simulation"""
        print(f"\n👥 Advanced transcription with speaker detection: {audio_path}")
        
        result = self.transcribe_file(audio_path)
        if not result:
            return None
        
        # Simple speaker detection based on silence gaps
        # In a real implementation, you'd use speaker diarization models
        speakers = []
        current_speaker = 1
        
        for i, segment in enumerate(result["segments"]):
            # Check for significant pause (speaker change heuristic)
            if i > 0:
                gap = segment["start"] - result["segments"][i-1]["end"]
                if gap > 2.0:  # 2+ second gap might indicate speaker change
                    current_speaker = 2 if current_speaker == 1 else 1
            
            segment["speaker"] = f"Speaker {current_speaker}"
            speakers.append(segment)
        
        # Save speaker-annotated transcript
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        speaker_file = f"transcript_speakers_{timestamp}.json"
        
        with open(speaker_file, 'w', encoding='utf-8') as f:
            json.dump(speakers, f, indent=2, ensure_ascii=False)
        
        print(f"👥 Speaker-annotated transcript saved: {speaker_file}")
        
        # Generate readable transcript
        readable_file = f"transcript_readable_{timestamp}.txt"
        with open(readable_file, 'w', encoding='utf-8') as f:
            f.write(f"Audio Transcript - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"File: {audio_path}\n")
            f.write(f"Language: {result['language']}\n")
            f.write("=" * 60 + "\n\n")
            
            for segment in speakers:
                timestamp = f"[{segment['start']:.1f}s - {segment['end']:.1f}s]"
                f.write(f"{segment['speaker']} {timestamp}:\n")
                f.write(f"{segment['text']}\n\n")
        
        print(f"📖 Readable transcript saved: {readable_file}")
        return speakers
    
    def batch_transcribe(self, audio_directory):
        """Transcribe multiple audio files in a directory"""
        print(f"\n📁 Batch transcribing audio files in: {audio_directory}")
        
        if not os.path.exists(audio_directory):
            print(f"❌ Error: Directory not found: {audio_directory}")
            return
        
        # Find audio files
        audio_extensions = ['.mp3', '.wav', '.m4a', '.flac', '.aac', '.mp4']
        audio_files = []
        
        for file in os.listdir(audio_directory):
            if any(file.lower().endswith(ext) for ext in audio_extensions):
                audio_files.append(os.path.join(audio_directory, file))
        
        if not audio_files:
            print(f"❌ No audio files found in {audio_directory}")
            return
        
        print(f"📂 Found {len(audio_files)} audio files")
        
        # Process each file
        results = []
        for i, audio_file in enumerate(audio_files, 1):
            print(f"\n📍 Processing {i}/{len(audio_files)}: {os.path.basename(audio_file)}")
            result = self.transcribe_file(audio_file)
            if result:
                results.append(result)
        
        # Generate batch report
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        batch_report = f"batch_transcription_report_{timestamp}.json"
        
        batch_data = {
            "directory": audio_directory,
            "total_files": len(audio_files),
            "successful_transcriptions": len(results),
            "failed_transcriptions": len(audio_files) - len(results),
            "total_processing_time": sum(r["processing_time"] for r in results),
            "results": results,
            "timestamp": datetime.now().isoformat()
        }
        
        with open(batch_report, 'w', encoding='utf-8') as f:
            json.dump(batch_data, f, indent=2, ensure_ascii=False)
        
        print(f"\n🎯 Batch Transcription Complete!")
        print(f"   📊 Processed: {len(results)}/{len(audio_files)} files")
        print(f"   ⏱️  Total time: {batch_data['total_processing_time']:.2f} seconds")
        print(f"   📄 Report saved: {batch_report}")
        
        return results
    
    def convert_to_wav(self, input_file, output_file=None):
        """Convert audio file to WAV format for better processing"""
        print(f"🔄 Converting {input_file} to WAV format...")
        
        if not output_file:
            base_name = os.path.splitext(input_file)[0]
            output_file = f"{base_name}_converted.wav"
        
        try:
            # Load audio with pydub
            audio = AudioSegment.from_file(input_file)
            
            # Export as WAV
            audio.export(output_file, format="wav")
            
            print(f"✅ Converted successfully: {output_file}")
            return output_file
            
        except Exception as e:
            print(f"❌ Conversion failed: {str(e)}")
            return None

def demonstrate_real_transcription():
    """Demonstrate real audio transcription capabilities"""
    
    print("🎙️ REAL AUDIO TRANSCRIPTION DEMONSTRATION")
    print("=" * 55)
    
    # Initialize transcriber
    transcriber = RealAudioTranscription(model_size="base")
    
    # Check for sample audio files
    audio_extensions = ['.mp3', '.wav', '.m4a', '.flac', '.aac', '.mp4']
    sample_audio = []
    
    for file in os.listdir('.'):
        if any(file.lower().endswith(ext) for ext in audio_extensions):
            sample_audio.append(file)
    
    if sample_audio:
        print(f"\n📁 Found {len(sample_audio)} audio files:")
        for audio in sample_audio[:3]:  # Show first 3
            print(f"   🎵 {audio}")
            
            # Get file info
            try:
                file_size = os.path.getsize(audio) / (1024 * 1024)  # MB
                print(f"      📊 Size: {file_size:.1f} MB")
            except:
                pass
        
        print(f"\n🎯 Transcription Demo Options:")
        print("1. Basic transcription")
        print("2. Advanced transcription with speaker detection")
        print("3. Batch transcription of all files")
        
        choice = input("\nChoose option (1-3, or 'n' to skip): ").lower()
        
        if choice == '1' and sample_audio:
            result = transcriber.transcribe_file(sample_audio[0])
            if result:
                print(f"✅ Basic transcription completed")
        
        elif choice == '2' and sample_audio:
            result = transcriber.transcribe_with_speakers(sample_audio[0])
            if result:
                print(f"✅ Advanced transcription with speakers completed")
        
        elif choice == '3':
            results = transcriber.batch_transcribe('.')
            print(f"✅ Batch transcription completed: {len(results)} files")
    
    else:
        print("\n📂 No audio files found in current directory")
        print("💡 To test, add some audio files (.mp3, .wav, .m4a, etc.)")
    
    print(f"\n💼 BUSINESS APPLICATIONS:")
    print("🏢 Corporate: Meeting transcription, interview analysis")
    print("📞 Customer Service: Call transcription, sentiment analysis")
    print("🎓 Education: Lecture transcription, accessibility")
    print("⚖️  Legal: Deposition transcription, evidence analysis")
    print("🎥 Media: Subtitle generation, content analysis")
    print("🏥 Healthcare: Medical dictation, patient consultations")
    
    print(f"\n💰 REVENUE OPPORTUNITIES:")
    print("• Transcription service: $0.10-$0.25 per minute")
    print("• Meeting minutes service: $50-$200 per meeting")
    print("• Accessibility compliance: $1000-$5000 per project")
    print("• Content localization: $0.20-$0.50 per word")

if __name__ == "__main__":
    demonstrate_real_transcription()
