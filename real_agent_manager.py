#!/usr/bin/env python3
"""
REAL AGENT STARTUP SYSTEM - Launch all real agents locally and on AWS
"""

import subprocess
import time
import threading
import logging
import os
from pathlib import Path
import signal
import sys
from typing import List, Dict
from datetime import datetime

class RealAgentManager:
    def __init__(self):
        self.agents = [
            {
                'name': 'Content Creator Agent',
                'file': 'content_creator_agent.py',
                'port': 8510,
                'process': None
            },
            {
                'name': 'Data Analyst Agent',
                'file': 'data_analyst_agent.py',
                'port': 8511,
                'process': None
            },
            {
                'name': 'Web Automation Agent',
                'file': 'web_automation_agent.py',
                'port': 8512,
                'process': None
            },
            {
                'name': 'Business Intelligence Agent',
                'file': 'business_intel_agent.py',
                'port': 8513,
                'process': None
            },
            {
                'name': 'Quality Assurance Agent',
                'file': 'quality_assurance_agent.py',
                'port': 8514,
                'process': None
            }
        ]
        
        self.running_agents = []
        self.setup_logging()
        
    def setup_logging(self):
        """Setup logging for agent management"""
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler('agent_manager.log'),
                logging.StreamHandler()
            ]
        )
        self.logger = logging.getLogger(__name__)
    
    def launch_agent(self, agent):
        """Launch a single real agent"""
        try:
            if not Path(agent['file']).exists():
                self.logger.error(f"❌ Agent file not found: {agent['file']}")
                return False
            
            # Launch agent with Streamlit
            cmd = [
                'streamlit', 'run', agent['file'],
                '--server.port', str(agent['port']),
                '--server.address', '0.0.0.0',
                '--server.headless', 'true'
            ]
            
            self.logger.info(f"🚀 Launching {agent['name']} on port {agent['port']}...")
            
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            
            agent['process'] = process
            self.running_agents.append(agent)
            
            self.logger.info(f"✅ {agent['name']} launched successfully!")
            return True
            
        except Exception as e:
            self.logger.error(f"❌ Failed to launch {agent['name']}: {str(e)}")
            return False
    
    def launch_all_agents(self):
        """Launch all real agents"""
        print("🚀 LAUNCHING ALL REAL AGENTS - NO SIMULATIONS!")
        print("=" * 60)
        
        success_count = 0
        
        for agent in self.agents:
            if self.launch_agent(agent):
                success_count += 1
                time.sleep(2)  # Stagger launches
            else:
                self.logger.error(f"❌ Failed to launch {agent['name']}")
        
        print(f"\n✅ Successfully launched {success_count}/{len(self.agents)} real agents")
        
        if success_count > 0:
            print("\n📊 REAL AGENT DASHBOARD:")
            print("=" * 60)
            for agent in self.running_agents:
                print(f"🤖 {agent['name']}: http://localhost:{agent['port']}")
            
            print(f"\n🌐 UNIFIED INTERFACE: http://localhost:8531")
            print("\n⚠️  THESE ARE REAL AGENTS DOING ACTUAL WORK!")
            print("   - Content Creator: Real blog posts and content")
            print("   - Data Analyst: Real data analysis and reports")
            print("   - Web Automation: Real web scraping and monitoring")
            print("   - Business Intelligence: Real email automation and metrics")
            print("   - Quality Assurance: Real testing and validation")
            
        return success_count == len(self.agents)
    
    def check_agent_health(self):
        """Check health of all running agents"""
        healthy_agents = []
        
        for agent in self.running_agents:
            if agent['process'] and agent['process'].poll() is None:
                healthy_agents.append(agent)
                self.logger.info(f"✅ {agent['name']} is running (PID: {agent['process'].pid})")
            else:
                self.logger.warning(f"⚠️ {agent['name']} has stopped")
        
        return healthy_agents
    
    def restart_failed_agents(self):
        """Restart any failed agents"""
        for agent in self.agents:
            if agent in self.running_agents:
                if agent['process'].poll() is not None:  # Process has stopped
                    self.logger.warning(f"🔄 Restarting {agent['name']}...")
                    self.running_agents.remove(agent)
                    self.launch_agent(agent)
    
    def stop_all_agents(self):
        """Stop all running agents"""
        self.logger.info("🛑 Stopping all real agents...")
        
        for agent in self.running_agents:
            if agent['process']:
                try:
                    agent['process'].terminate()
                    agent['process'].wait(timeout=5)
                    self.logger.info(f"✅ Stopped {agent['name']}")
                except subprocess.TimeoutExpired:
                    agent['process'].kill()
                    self.logger.info(f"🔥 Force killed {agent['name']}")
                except Exception as e:
                    self.logger.error(f"❌ Error stopping {agent['name']}: {str(e)}")
        
        self.running_agents.clear()
    
    def monitor_agents(self):
        """Monitor agents and restart if needed"""
        self.logger.info("👀 Starting agent monitoring...")
        
        while True:
            try:
                healthy_agents = self.check_agent_health()
                
                if len(healthy_agents) < len(self.running_agents):
                    self.restart_failed_agents()
                
                time.sleep(30)  # Check every 30 seconds
                
            except KeyboardInterrupt:
                self.logger.info("👋 Monitoring stopped by user")
                break
            except Exception as e:
                self.logger.error(f"❌ Monitoring error: {str(e)}")
                time.sleep(10)
    
    def deploy_to_aws(self):
        """Deploy agents to AWS infrastructure"""
        self.logger.info("☁️ Deploying real agents to AWS...")
        
        try:
            # Run AWS deployment
            result = subprocess.run([
                'python', 'aws_cloud_deployment.py', 'deploy-agents'
            ], capture_output=True, text=True, timeout=300)
            
            if result.returncode == 0:
                self.logger.info("✅ AWS deployment successful!")
                print(result.stdout)
            else:
                self.logger.error(f"❌ AWS deployment failed: {result.stderr}")
                
        except subprocess.TimeoutExpired:
            self.logger.error("❌ AWS deployment timed out")
        except Exception as e:
            self.logger.error(f"❌ AWS deployment error: {str(e)}")
    
    def run(self):
        """Main run method"""
        def signal_handler(signum, frame):
            print("\n\n🛑 Shutting down Real Agent Manager...")
            self.stop_all_agents()
            sys.exit(0)
        
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
        
        print("🤖 REAL AGENT MANAGER STARTING...")
        print("⚠️  NO FAKE DATA, NO SIMULATIONS, NO DEMOS!")
        print("✅ REAL WORK ONLY!")
        
        # Launch all agents
        if self.launch_all_agents():
            # Start monitoring in background
            monitor_thread = threading.Thread(target=self.monitor_agents, daemon=True)
            monitor_thread.start()
            
            # Deploy to AWS in background
            aws_thread = threading.Thread(target=self.deploy_to_aws, daemon=True)
            aws_thread.start()
            
            print("\n🎯 REAL AGENTS ARE NOW ACTIVE!")
            print("   Press Ctrl+C to stop all agents")
            
            try:
                while True:
                    time.sleep(1)
            except KeyboardInterrupt:
                pass
        else:
            self.logger.error("❌ Failed to launch agents")
            return False

if __name__ == "__main__":
    manager = RealAgentManager()
    manager.run()
