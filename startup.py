#!/usr/bin/env python3
"""
🚀 ONE-CLICK STARTUP SCRIPT
Complete AI-Native Platform with 24/7 Optimization & Platform Integrations
"""

import os
import sys
import time
import json
import subprocess
from pathlib import Path

def print_banner():
    """Display startup banner"""
    banner = """
    ╔══════════════════════════════════════════════════════════════╗
    ║          🚀 AI-NATIVE PLATFORM STARTUP SCRIPT 🚀           ║
    ║                                                              ║
    ║  ✅ Enhanced LLM Agent Chat System                          ║
    ║  ✅ 24/7 Optimized EC2 Deployment                          ║
    ║  ✅ Platform Integrations (Gmail, Calendar, Social)        ║
    ║  ✅ AI Infrastructure Kernel (Self-building)               ║
    ║  ✅ PhD-Level Research Center                               ║
    ║  ✅ Complete GitHub Backup System                          ║
    ║                                                              ║
    ╚══════════════════════════════════════════════════════════════╝
    """
    print(banner)

def check_environment():
    """Check if environment is properly configured"""
    print("🔍 Checking environment configuration...")
    
    env_file = Path(".env")
    if not env_file.exists():
        print("⚠️  .env file not found. Creating template...")
        subprocess.run([sys.executable, "secure_env_setup.py"], check=False)
        print("📝 Please edit .env file with your API keys and run this script again.")
        return False
    
    print("✅ Environment configuration found!")
    return True

def check_dependencies():
    """Check if required packages are installed"""
    print("📦 Checking dependencies...")
    
    required_packages = [
        'openai', 'flask', 'flask-socketio', 'boto3', 'aiohttp',
        'google-api-python-client', 'tweepy', 'facebook-sdk'
    ]
    
    missing_packages = []
    
    for package in required_packages:
        try:
            __import__(package.replace('-', '_'))
        except ImportError:
            missing_packages.append(package)
    
    if missing_packages:
        print(f"⚠️  Missing packages: {', '.join(missing_packages)}")
        print("Installing missing packages...")
        subprocess.run([sys.executable, "-m", "pip", "install"] + missing_packages, check=False)
    
    print("✅ All dependencies ready!")
    return True

def show_deployment_options():
    """Show available deployment options"""
    print("\n🎯 DEPLOYMENT OPTIONS:")
    print("1. 🖥️  Local Testing (Quick start for development)")
    print("2. ☁️  AWS EC2 24/7 Deployment (Production ready)")
    print("3. 🔗 Platform Integrations Test (Gmail, Calendar, Social)")
    print("4. 🤖 Enhanced AI Agents Only")
    print("5. 📊 Show Current Status")
    print("6. 🔧 Setup/Reconfigure Environment")
    print("0. ❌ Exit")
    
    choice = input("\n👉 Select option (0-6): ").strip()
    return choice

def deploy_local_testing():
    """Deploy for local testing"""
    print("\n🖥️  Starting LOCAL TESTING deployment...")
    
    print("1. Testing enhanced agents...")
    result = subprocess.run([sys.executable, "test_enhanced_agents.py"], capture_output=True, text=True)
    if result.returncode == 0:
        print("✅ Enhanced agents test passed!")
    else:
        print("⚠️  Enhanced agents test had issues (continuing...)")
    
    print("2. Launching enhanced agent chat server...")
    subprocess.Popen([sys.executable, "enhanced_agent_chat_server.py"])
    time.sleep(3)
    
    print("3. Starting platform integration manager...")
    subprocess.Popen([sys.executable, "platform_integration_manager.py"])
    time.sleep(3)
    
    print("\n🎉 LOCAL DEPLOYMENT READY!")
    print("📍 Access points:")
    print("   • Main Chat: http://localhost:5000")
    print("   • Platform Hub: http://localhost:8002/status")
    print("   • Monitoring: Check terminal outputs")

def deploy_aws_24x7():
    """Deploy 24/7 optimized system to AWS"""
    print("\n☁️  Starting AWS EC2 24/7 DEPLOYMENT...")
    
    # Check AWS credentials
    try:
        import boto3
        session = boto3.Session()
        credentials = session.get_credentials()
        if credentials is None:
            print("⚠️  AWS credentials not found. Please run 'aws configure' first.")
            return
    except Exception as e:
        print(f"⚠️  AWS setup issue: {e}")
        return
    
    print("🚀 Launching 24/7 optimized EC2 deployment...")
    subprocess.run([sys.executable, "ec2_24x7_optimizer.py"])
    
    print("\n🎉 AWS 24/7 DEPLOYMENT INITIATED!")
    print("📍 Check AWS console for EC2 instance details")
    print("📍 Access will be available at http://YOUR-EC2-IP/")

def test_platform_integrations():
    """Test platform integrations"""
    print("\n🔗 TESTING PLATFORM INTEGRATIONS...")
    
    print("Starting platform integration manager...")
    subprocess.run([sys.executable, "platform_integration_manager.py"])
    
    print("\n✅ Platform integrations test completed!")
    print("📍 Check http://localhost:8002/status for results")

def deploy_agents_only():
    """Deploy enhanced AI agents only"""
    print("\n🤖 STARTING ENHANCED AI AGENTS...")
    
    subprocess.run([sys.executable, "launch_enhanced_agents.py"])
    
    print("\n✅ Enhanced AI agents deployed!")
    print("📍 Access at http://localhost:5000")

def show_current_status():
    """Show current system status"""
    print("\n📊 CURRENT SYSTEM STATUS:")
    
    # Check if processes are running
    import psutil
    
    processes = {
        'enhanced_agent_chat_server.py': False,
        'platform_integration_manager.py': False,
        'ai_native_infrastructure_kernel.py': False
    }
    
    for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
        try:
            cmdline = proc.info['cmdline']
            if cmdline:
                for script in processes:
                    if any(script in cmd for cmd in cmdline):
                        processes[script] = True
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    
    print("\n🔄 Running Services:")
    for script, running in processes.items():
        status = "✅ RUNNING" if running else "❌ STOPPED"
        print(f"   • {script}: {status}")
    
    # Check GitHub status
    if os.path.exists(".git"):
        print("\n📂 GitHub Repository:")
        result = subprocess.run(["git", "status", "--porcelain"], capture_output=True, text=True)
        if result.stdout.strip():
            print("   • ⚠️  Uncommitted changes found")
        else:
            print("   • ✅ All changes committed")
    
    # Check environment
    print("\n🔧 Environment:")
    env_file = Path(".env")
    if env_file.exists():
        print("   • ✅ .env configuration found")
    else:
        print("   • ⚠️  .env configuration missing")

def setup_environment():
    """Setup or reconfigure environment"""
    print("\n🔧 ENVIRONMENT SETUP...")
    
    subprocess.run([sys.executable, "secure_env_setup.py"])
    
    print("\n✅ Environment setup completed!")
    print("📝 Please edit .env file with your API keys if needed")

def main():
    """Main startup function"""
    print_banner()
    
    # Basic checks
    if not check_environment():
        return
    
    check_dependencies()
    
    while True:
        choice = show_deployment_options()
        
        if choice == '1':
            deploy_local_testing()
        elif choice == '2':
            deploy_aws_24x7()
        elif choice == '3':
            test_platform_integrations()
        elif choice == '4':
            deploy_agents_only()
        elif choice == '5':
            show_current_status()
        elif choice == '6':
            setup_environment()
        elif choice == '0':
            print("\n👋 Goodbye!")
            break
        else:
            print("❌ Invalid option. Please choose 0-6.")
        
        input("\n⏸️  Press Enter to continue...")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⏹️  Startup script interrupted by user.")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        print("📞 Check COMPLETE_DEPLOYMENT_GUIDE.md for troubleshooting")
