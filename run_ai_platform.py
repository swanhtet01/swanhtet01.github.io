#!/usr/bin/env python3
"""
AI Platform Launcher - Run all AI products with autonomous agents
Clean UX focused on functionality, not fluff
"""

import os
import sys
import subprocess
import threading
import time
from pathlib import Path

class AIPlatformLauncher:
    def __init__(self):
        self.base_dir = Path(__file__).parent
        self.processes = {}
        
    def launch_product(self, product_name, script_path, port=None):
        """Launch an AI product in a separate process"""
        print(f"🚀 Starting {product_name}...")
        
        try:
            if port:
                env = os.environ.copy()
                env['STREAMLIT_SERVER_PORT'] = str(port)
                process = subprocess.Popen([
                    sys.executable, script_path
                ], env=env, cwd=self.base_dir)
            else:
                process = subprocess.Popen([
                    sys.executable, script_path
                ], cwd=self.base_dir)
                
            self.processes[product_name] = process
            print(f"✅ {product_name} launched successfully")
            
            if port:
                print(f"   Access at: http://localhost:{port}")
                
        except Exception as e:
            print(f"❌ Failed to launch {product_name}: {e}")
    
    def check_dependencies(self):
        """Check if required packages are installed"""
        required = [
            'streamlit', 'ultralytics', 'moviepy', 'opencv-python',
            'scikit-learn', 'pandas', 'plotly', 'requests'
        ]
        
        missing = []
        for package in required:
            try:
                __import__(package.replace('-', '_'))
            except ImportError:
                missing.append(package)
        
        if missing:
            print(f"⚠️  Missing packages: {', '.join(missing)}")
            print("Installing missing packages...")
            subprocess.run([sys.executable, '-m', 'pip', 'install'] + missing)
        else:
            print("✅ All dependencies satisfied")
    
    def run_autonomous_agents(self):
        """Run the autonomous R&D team"""
        print("\n🤖 Starting Autonomous R&D Team...")
        try:
            from autonomous_rd_team import AutonomousRDTeam
            
            rd_team = AutonomousRDTeam()
            
            # Run agent system in background thread
            def run_agents():
                try:
                    # This will run the autonomous product building
                    rd_team.run_autonomous_development()
                except Exception as e:
                    print(f"❌ Agent system error: {e}")
            
            agent_thread = threading.Thread(target=run_agents, daemon=True)
            agent_thread.start()
            print("✅ Autonomous agents running in background")
            
        except Exception as e:
            print(f"❌ Failed to start agents: {e}")
    
    def launch_all_products(self):
        """Launch all AI products with different ports"""
        products = [
            ("AI Video Editor", "ai_video_editor.py", 8501),
            ("LLM Chat Interface", "llm_chat_interface.py", 8502), 
            ("Smart Data Processor", "smart_data_processor.py", 8503),
        ]
        
        print("🚀 Launching AI Platform Products...\n")
        
        for product_name, script, port in products:
            if (self.base_dir / script).exists():
                self.launch_product(product_name, script, port)
                time.sleep(2)  # Brief pause between launches
            else:
                print(f"⚠️  {script} not found, skipping {product_name}")
        
        # Show access URLs
        print("\n📱 Access Your AI Products:")
        print("=" * 50)
        print("🎬 AI Video Editor      → http://localhost:8501")
        print("💬 LLM Chat Interface   → http://localhost:8502") 
        print("📊 Smart Data Processor → http://localhost:8503")
        print("=" * 50)
    
    def monitor_system(self):
        """Monitor running processes"""
        print(f"\n🔄 Monitoring {len(self.processes)} products...")
        print("Press Ctrl+C to shutdown all products\n")
        
        try:
            while True:
                # Check if processes are still running
                active = []
                for name, process in self.processes.items():
                    if process.poll() is None:  # Still running
                        active.append(name)
                    else:
                        print(f"⚠️  {name} stopped unexpectedly")
                
                if not active:
                    print("❌ All products stopped")
                    break
                    
                time.sleep(10)  # Check every 10 seconds
                
        except KeyboardInterrupt:
            print("\n🛑 Shutting down AI Platform...")
            self.shutdown_all()
    
    def shutdown_all(self):
        """Shutdown all running processes"""
        for name, process in self.processes.items():
            try:
                process.terminate()
                print(f"🛑 Stopped {name}")
            except:
                pass

def main():
    """Main function to run the AI platform"""
    launcher = AIPlatformLauncher()
    
    print("🤖 AI Platform - Autonomous Product Development")
    print("=" * 60)
    
    # Check dependencies first
    launcher.check_dependencies()
    
    # Start autonomous agents
    launcher.run_autonomous_agents()
    
    # Launch all products
    launcher.launch_all_products()
    
    # Monitor system
    launcher.monitor_system()

if __name__ == "__main__":
    main()
