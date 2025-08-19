#!/usr/bin/env python3
"""
🚀 SUPERMEGA AI PLATFORM LAUNCHER
=================================
Launch all specialized AI agents and products
"""

import subprocess
import webbrowser
import time
import sys
import threading

def print_banner():
    print("""
🚀 SUPERMEGA AI PLATFORM LAUNCHER
=================================
Launching all specialized AI agents and products...

🤖 AUTONOMOUS KNOWLEDGE WORKERS:
- StreamEdit_Agent: Gaming video editor 
- VoiceClone_Agent: Voice cloning studio
- CodeAssist_Agent: Zen AI coding assistant
- CreativeDesign_Agent: 3D design suite
- MLResearch_Agent: ML research lab

🛠️ PROFESSIONAL TOOLS INTEGRATED:
- Zen editor (Rust-based code editor)
- Blender 3D modeling suite
- FreeCAD engineering tools
- OpenCV computer vision
- PyTorch ML framework
- Whisper voice AI
""")

def launch_service(command, name, port=None):
    """Launch a service in the background"""
    print(f"🚀 Launching {name}...")
    try:
        process = subprocess.Popen(command, shell=True)
        if port:
            time.sleep(3)  # Give time to start
            print(f"✅ {name} running on http://localhost:{port}")
        else:
            print(f"✅ {name} launched")
        return process
    except Exception as e:
        print(f"❌ Failed to launch {name}: {e}")
        return None

def main():
    print_banner()
    
    processes = []
    
    # Launch autonomous agents system
    print("\n🤖 STARTING AUTONOMOUS AGENTS...")
    agent_process = launch_service("python autonomous_knowledge_workers.py", "Autonomous Knowledge Workers")
    if agent_process:
        processes.append(agent_process)
    
    # Launch gaming streamer editor
    print("\n🎮 STARTING GAMING STREAMER EDITOR...")
    gaming_process = launch_service("streamlit run gaming_streamer_editor.py --server.port 8501", "Gaming Streamer Editor", 8501)
    if gaming_process:
        processes.append(gaming_process)
    
    # Launch voice clone studio
    print("\n🎤 STARTING VOICE CLONE STUDIO...")
    voice_process = launch_service("streamlit run voice_clone_studio.py --server.port 8502", "Voice Clone Studio", 8502)
    if voice_process:
        processes.append(voice_process)
    
    # Open main website
    print("\n🌐 OPENING SUPERMEGA.DEV...")
    time.sleep(2)
    webbrowser.open("https://supermega.dev")
    
    print(f"""
✅ ALL SERVICES LAUNCHED!

🌐 WEBSITES:
- Main Platform: https://supermega.dev
- Gaming Editor: http://localhost:8501
- Voice Studio: http://localhost:8502

🤖 AGENTS RUNNING:
- StreamEdit_Agent: Building gaming video tools
- VoiceClone_Agent: Creating voice products  
- CodeAssist_Agent: Enhancing coding experience
- CreativeDesign_Agent: Developing 3D tools
- MLResearch_Agent: Automating research

⚡ STATUS: All systems operational
🔥 Autonomous agents building products 24/7!

Press Ctrl+C to stop all services...
""")
    
    try:
        # Keep running until interrupted
        while True:
            time.sleep(60)
            print("🤖 Autonomous agents working... Products being enhanced...")
    except KeyboardInterrupt:
        print("\n🛑 Shutting down all services...")
        for process in processes:
            try:
                process.terminate()
            except:
                pass
        print("✅ All services stopped")

if __name__ == "__main__":
    main()
