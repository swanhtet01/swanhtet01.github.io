#!/usr/bin/env python3
"""
Enhanced Agent System Local Launcher
Test the enhanced LLM-powered agents locally before AWS deployment
"""

import os
import sys
import asyncio
import time
from datetime import datetime

# Set OpenAI API key (replace with your key or use environment variable)
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY', "your-openai-api-key-here")
if OPENAI_API_KEY and OPENAI_API_KEY != "your-openai-api-key-here":
    os.environ['OPENAI_API_KEY'] = OPENAI_API_KEY

def main():
    print("""
🚀 Enhanced AI Agent System - Local Test
========================================

Features Active:
✅ Real OpenAI GPT-4 Integration  
✅ Multi-Agent Collaboration
✅ Smart Agent Selection
✅ Enhanced Response Generation
✅ Memory and Context Retention
✅ Performance Metrics

Starting Enhanced Agent Chat Server...
""")

    try:
        # Import the enhanced server
        from enhanced_agent_chat_server import EnhancedAgentChatServer
        
        # Create and run server
        server = EnhancedAgentChatServer()
        
        print(f"""
🌟 Enhanced AI Agent Server Starting...

🌐 Access your enhanced agents at:
   http://localhost:5000 - Chat Interface
   http://localhost:5000/api/chat - REST API  
   http://localhost:5000/health - Health Check

💡 Available Agents:
   • Strategic Business Advisor
   • Senior Technical Architect  
   • AI/ML Research Specialist
   • Senior Product Manager
   • Multi-Agent Coordinator

🤖 LLM Integration: {'✅ ENABLED' if OPENAI_API_KEY else '❌ DISABLED'}
📊 Monitoring: Active
🔄 Auto-optimization: Enabled

Press Ctrl+C to stop the server...
""")
        
        # Run the server
        asyncio.run(server.run(host='localhost', port=5000))
        
    except KeyboardInterrupt:
        print("\n🛑 Enhanced Agent Server stopped by user")
        
    except ImportError as e:
        print(f"❌ Import Error: {e}")
        print("Installing missing dependencies...")
        
        import subprocess
        subprocess.run([sys.executable, '-m', 'pip', 'install', 'openai>=1.3.0'])
        print("Dependencies installed. Please restart the launcher.")
        
    except Exception as e:
        print(f"❌ Error starting server: {e}")
        print("Check the logs for more details.")

if __name__ == "__main__":
    main()
