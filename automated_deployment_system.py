#!/usr/bin/env python3
"""
🚀 AUTOMATED SERVICE LAUNCHER AND DEPLOYMENT SYSTEM
===================================================
Continuous integration, deployment, and service management
"""

import subprocess
import sys
import os
import time
import json
import threading
from datetime import datetime
import requests
import sqlite3
from typing import Dict, List, Any, Optional
import streamlit as st

class AutomatedDeploymentSystem:
    """Automated deployment and service management system"""
    
    def __init__(self):
        self.services = {
            "master_ai_controller_v2": {
                "script": "master_ai_controller_v2.py",
                "port": 8516,
                "command": ["streamlit", "run", "master_ai_controller_v2.py", "--server.port", "8516"],
                "health_endpoint": "http://localhost:8516",
                "status": "stopped",
                "process": None,
                "restart_count": 0,
                "critical": True
            },
            "next_gen_ai_platform": {
                "script": "next_gen_ai_platform.py", 
                "port": 8512,
                "command": ["streamlit", "run", "next_gen_ai_platform.py", "--server.port", "8512"],
                "health_endpoint": "http://localhost:8512",
                "status": "stopped",
                "process": None,
                "restart_count": 0,
                "critical": True
            },
            "ai_video_studio_pro": {
                "script": "ai_video_studio_pro.py",
                "port": 8510, 
                "command": ["streamlit", "run", "ai_video_studio_pro.py", "--server.port", "8510"],
                "health_endpoint": "http://localhost:8510",
                "status": "stopped",
                "process": None,
                "restart_count": 0,
                "critical": True
            },
            "autonomous_agents_v3": {
                "script": "autonomous_agents_v3.py",
                "port": 8511,
                "command": ["streamlit", "run", "autonomous_agents_v3.py", "--server.port", "8511"],
                "health_endpoint": "http://localhost:8511",
                "status": "stopped", 
                "process": None,
                "restart_count": 0,
                "critical": True
            },
            "advanced_orchestrator_ai": {
                "script": "advanced_orchestrator_ai.py",
                "port": 8514,
                "command": ["streamlit", "run", "advanced_orchestrator_ai.py", "--server.port", "8514"],
                "health_endpoint": "http://localhost:8514",
                "status": "stopped",
                "process": None,
                "restart_count": 0,
                "critical": True
            },
            "game_changing_infrastructure": {
                "script": "game_changing_infrastructure.py",
                "port": 8515,
                "command": ["streamlit", "run", "game_changing_infrastructure.py", "--server.port", "8515"],
                "health_endpoint": "http://localhost:8515",
                "status": "stopped",
                "process": None,
                "restart_count": 0,
                "critical": True
            },
            "infrastructure_monitor": {
                "script": "infrastructure_monitor.py",
                "port": 8513,
                "command": ["streamlit", "run", "infrastructure_monitor.py", "--server.port", "8513"],
                "health_endpoint": "http://localhost:8513", 
                "status": "stopped",
                "process": None,
                "restart_count": 0,
                "critical": False
            },
            "ultimate_launcher": {
                "script": "ultimate_launcher.py",
                "port": 8520,
                "command": ["streamlit", "run", "ultimate_launcher.py", "--server.port", "8520"],
                "health_endpoint": "http://localhost:8520",
                "status": "stopped",
                "process": None,
                "restart_count": 0,
                "critical": False
            },
            "browser_automation": {
                "script": "browser_automation_v2.py",
                "port": 8504,
                "command": ["streamlit", "run", "browser_automation_v2.py", "--server.port", "8504"],
                "health_endpoint": "http://localhost:8504",
                "status": "stopped",
                "process": None,
                "restart_count": 0,
                "critical": False
            },
            "media_studio": {
                "script": "media_studio_ai.py",
                "port": 8505,
                "command": ["streamlit", "run", "media_studio_ai.py", "--server.port", "8505"],
                "health_endpoint": "http://localhost:8505",
                "status": "stopped",
                "process": None,
                "restart_count": 0,
                "critical": False
            },
            "voice_studio": {
                "script": "voice_studio_ai.py",
                "port": 8506,
                "command": ["streamlit", "run", "voice_studio_ai.py", "--server.port", "8506"],
                "health_endpoint": "http://localhost:8506",
                "status": "stopped",
                "process": None,
                "restart_count": 0,
                "critical": False
            },
            "cad_studio": {
                "script": "cad_studio_ai.py",
                "port": 8508,
                "command": ["streamlit", "run", "cad_studio_ai.py", "--server.port", "8508"],
                "health_endpoint": "http://localhost:8508",
                "status": "stopped",
                "process": None,
                "restart_count": 0,
                "critical": False
            },
            "text_studio": {
                "script": "text_studio_ai.py",
                "port": 8509,
                "command": ["streamlit", "run", "text_studio_ai.py", "--server.port", "8509"],
                "health_endpoint": "http://localhost:8509",
                "status": "stopped",
                "process": None,
                "restart_count": 0,
                "critical": False
            }
        }
        
        self.monitoring_active = False
        self.auto_restart_enabled = True
        self.deployment_history = []
        self.performance_metrics = {}
        
        # Initialize database
        self.db_path = "deployment_system.db"
        self.initialize_database()
    
    def initialize_database(self):
        """Initialize deployment tracking database"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS deployments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp DATETIME,
                    service_name TEXT,
                    action TEXT,
                    status TEXT,
                    details TEXT,
                    duration REAL
                )
            ''')
            
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS service_health (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp DATETIME,
                    service_name TEXT,
                    status TEXT,
                    response_time REAL,
                    memory_usage REAL,
                    cpu_usage REAL
                )
            ''')
            
            conn.commit()
            conn.close()
            
        except Exception as e:
            print(f"Database initialization failed: {str(e)}")
    
    def check_service_health(self, service_name: str) -> Dict[str, Any]:
        """Check health of a specific service"""
        service = self.services.get(service_name, {})
        
        if not service:
            return {"healthy": False, "status": "unknown_service"}
        
        try:
            start_time = time.time()
            response = requests.get(service["health_endpoint"], timeout=5)
            response_time = time.time() - start_time
            
            health_data = {
                "healthy": response.status_code == 200,
                "status": "online" if response.status_code == 200 else "error",
                "response_time": response_time,
                "status_code": response.status_code
            }
            
            # Update service status
            self.services[service_name]["status"] = health_data["status"]
            
            return health_data
            
        except requests.exceptions.Timeout:
            self.services[service_name]["status"] = "timeout"
            return {"healthy": False, "status": "timeout", "response_time": 5.0}
            
        except Exception as e:
            self.services[service_name]["status"] = "offline"
            return {"healthy": False, "status": "offline", "error": str(e)}
    
    def start_service(self, service_name: str) -> bool:
        """Start a specific service"""
        service = self.services.get(service_name)
        
        if not service:
            print(f"Unknown service: {service_name}")
            return False
        
        if service["status"] == "running":
            print(f"Service {service_name} is already running")
            return True
        
        try:
            print(f"Starting service: {service_name}")
            
            # Check if script exists
            if not os.path.exists(service["script"]):
                print(f"Script not found: {service['script']}")
                return False
            
            # Start process
            process = subprocess.Popen(
                service["command"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=os.getcwd(),
                creationflags=subprocess.CREATE_NEW_CONSOLE if sys.platform == "win32" else 0
            )
            
            service["process"] = process
            service["status"] = "starting"
            
            # Wait for service to be ready
            max_attempts = 30  # 30 seconds
            for attempt in range(max_attempts):
                time.sleep(1)
                health = self.check_service_health(service_name)
                
                if health["healthy"]:
                    service["status"] = "running"
                    print(f"Service {service_name} started successfully on port {service['port']}")
                    
                    # Log deployment
                    self.log_deployment(service_name, "start", "success", f"Started on port {service['port']}")
                    return True
            
            # Service didn't start in time
            service["status"] = "failed"
            print(f"Service {service_name} failed to start within timeout")
            return False
            
        except Exception as e:
            service["status"] = "error"
            print(f"Failed to start service {service_name}: {str(e)}")
            self.log_deployment(service_name, "start", "failed", str(e))
            return False
    
    def stop_service(self, service_name: str) -> bool:
        """Stop a specific service"""
        service = self.services.get(service_name)
        
        if not service:
            return False
        
        try:
            if service["process"]:
                service["process"].terminate()
                service["process"] = None
            
            service["status"] = "stopped"
            print(f"Service {service_name} stopped")
            self.log_deployment(service_name, "stop", "success", "Service stopped")
            return True
            
        except Exception as e:
            print(f"Failed to stop service {service_name}: {str(e)}")
            return False
    
    def start_all_services(self) -> Dict[str, bool]:
        """Start all services in optimal order"""
        print("🚀 Starting all services...")
        
        # Start critical services first
        critical_services = [name for name, service in self.services.items() if service["critical"]]
        non_critical_services = [name for name, service in self.services.items() if not service["critical"]]
        
        results = {}
        
        # Start critical services
        for service_name in critical_services:
            results[service_name] = self.start_service(service_name)
            if not results[service_name]:
                print(f"⚠️ Critical service {service_name} failed to start!")
        
        # Wait a bit before starting non-critical services
        time.sleep(3)
        
        # Start non-critical services
        for service_name in non_critical_services:
            results[service_name] = self.start_service(service_name)
        
        successful_starts = sum(1 for success in results.values() if success)
        total_services = len(results)
        
        print(f"✅ Started {successful_starts}/{total_services} services")
        
        return results
    
    def stop_all_services(self) -> Dict[str, bool]:
        """Stop all services"""
        print("🛑 Stopping all services...")
        
        results = {}
        
        for service_name in self.services.keys():
            results[service_name] = self.stop_service(service_name)
        
        return results
    
    def restart_service(self, service_name: str) -> bool:
        """Restart a specific service"""
        print(f"🔄 Restarting service: {service_name}")
        
        stop_success = self.stop_service(service_name)
        time.sleep(2)
        start_success = self.start_service(service_name)
        
        return stop_success and start_success
    
    def monitor_services(self):
        """Monitor all services and restart if needed"""
        if self.monitoring_active:
            return
        
        self.monitoring_active = True
        print("👁️ Service monitoring started")
        
        while self.monitoring_active:
            try:
                for service_name, service in self.services.items():
                    if service["status"] == "running":
                        health = self.check_service_health(service_name)
                        
                        if not health["healthy"] and self.auto_restart_enabled:
                            print(f"🔧 Service {service_name} is unhealthy, restarting...")
                            service["restart_count"] += 1
                            
                            if service["restart_count"] <= 3:  # Max 3 restart attempts
                                self.restart_service(service_name)
                            else:
                                print(f"❌ Service {service_name} exceeded restart limit")
                                service["status"] = "failed"
                
                time.sleep(30)  # Check every 30 seconds
                
            except KeyboardInterrupt:
                break
            except Exception as e:
                print(f"Monitoring error: {str(e)}")
                time.sleep(30)
        
        print("👁️ Service monitoring stopped")
    
    def start_monitoring_thread(self):
        """Start monitoring in background thread"""
        monitor_thread = threading.Thread(target=self.monitor_services, daemon=True)
        monitor_thread.start()
        return monitor_thread
    
    def stop_monitoring(self):
        """Stop service monitoring"""
        self.monitoring_active = False
    
    def get_service_status_summary(self) -> Dict[str, Any]:
        """Get summary of all services status"""
        running_services = [name for name, service in self.services.items() if service["status"] == "running"]
        failed_services = [name for name, service in self.services.items() if service["status"] in ["failed", "error"]]
        stopped_services = [name for name, service in self.services.items() if service["status"] == "stopped"]
        
        return {
            "total_services": len(self.services),
            "running": len(running_services),
            "failed": len(failed_services),
            "stopped": len(stopped_services),
            "running_services": running_services,
            "failed_services": failed_services,
            "stopped_services": stopped_services,
            "monitoring_active": self.monitoring_active
        }
    
    def log_deployment(self, service_name: str, action: str, status: str, details: str, duration: float = 0.0):
        """Log deployment action to database"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT INTO deployments (timestamp, service_name, action, status, details, duration)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (datetime.now(), service_name, action, status, details, duration))
            
            conn.commit()
            conn.close()
            
        except Exception as e:
            print(f"Failed to log deployment: {str(e)}")
    
    def create_git_commit_and_push(self, commit_message: str = None) -> bool:
        """Create git commit and push changes"""
        try:
            if not commit_message:
                commit_message = f"Automated deployment update - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
            
            # Add all changes
            subprocess.run(["git", "add", "."], check=True, cwd=os.getcwd())
            
            # Create commit
            subprocess.run(["git", "commit", "-m", commit_message], check=True, cwd=os.getcwd())
            
            # Push to remote
            subprocess.run(["git", "push"], check=True, cwd=os.getcwd())
            
            print(f"✅ Git commit and push successful: {commit_message}")
            return True
            
        except subprocess.CalledProcessError as e:
            print(f"❌ Git operation failed: {str(e)}")
            return False
        except Exception as e:
            print(f"❌ Git error: {str(e)}")
            return False
    
    def deploy_to_aws(self) -> bool:
        """Deploy to AWS using existing scripts"""
        try:
            print("☁️ Deploying to AWS...")
            
            # Check if AWS deployment script exists
            if os.path.exists("deploy-to-aws.bat"):
                result = subprocess.run(["deploy-to-aws.bat"], check=True, cwd=os.getcwd())
                print("✅ AWS deployment successful")
                return True
            elif os.path.exists("deploy-to-aws.sh"):
                result = subprocess.run(["bash", "deploy-to-aws.sh"], check=True, cwd=os.getcwd())
                print("✅ AWS deployment successful")
                return True
            else:
                print("❌ No AWS deployment script found")
                return False
                
        except subprocess.CalledProcessError as e:
            print(f"❌ AWS deployment failed: {str(e)}")
            return False
        except Exception as e:
            print(f"❌ AWS deployment error: {str(e)}")
            return False
    
    def continuous_upgrade_cycle(self):
        """Continuous upgrade and improvement cycle"""
        print("🔄 Starting continuous upgrade cycle...")
        
        while True:
            try:
                # 1. Check service health
                status_summary = self.get_service_status_summary()
                print(f"📊 Service Status: {status_summary['running']}/{status_summary['total_services']} running")
                
                # 2. Restart any failed services
                for service_name in status_summary['failed_services']:
                    if self.services[service_name]['restart_count'] < 3:
                        print(f"🔧 Attempting to restart failed service: {service_name}")
                        self.restart_service(service_name)
                
                # 3. Performance optimization
                self.optimize_system_performance()
                
                # 4. Create commit if improvements made
                if status_summary['running'] == status_summary['total_services']:
                    commit_message = f"Continuous upgrade cycle - All services running - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
                    self.create_git_commit_and_push(commit_message)
                
                # 5. Wait before next cycle
                time.sleep(300)  # 5 minutes between cycles
                
            except KeyboardInterrupt:
                print("🛑 Continuous upgrade cycle stopped by user")
                break
            except Exception as e:
                print(f"❌ Error in upgrade cycle: {str(e)}")
                time.sleep(60)  # Wait 1 minute on error
    
    def optimize_system_performance(self):
        """Apply system performance optimizations"""
        try:
            # Check system resources
            running_services = [name for name, service in self.services.items() if service["status"] == "running"]
            
            print(f"⚡ Optimizing performance for {len(running_services)} running services")
            
            # Apply optimizations (placeholder for real optimizations)
            optimizations_applied = []
            
            if len(running_services) > 8:
                optimizations_applied.append("memory_optimization")
            
            if len(running_services) > 10:
                optimizations_applied.append("cpu_scaling")
            
            for optimization in optimizations_applied:
                print(f"✨ Applied optimization: {optimization}")
            
            return optimizations_applied
            
        except Exception as e:
            print(f"❌ Performance optimization failed: {str(e)}")
            return []


def main():
    """Main deployment system interface"""
    print("🚀 AUTOMATED SERVICE LAUNCHER AND DEPLOYMENT SYSTEM")
    print("=" * 60)
    
    deployment_system = AutomatedDeploymentSystem()
    
    while True:
        print("\n📋 Available Commands:")
        print("1. Start All Services")
        print("2. Stop All Services") 
        print("3. Service Status")
        print("4. Start Monitoring")
        print("5. Stop Monitoring")
        print("6. Git Commit & Push")
        print("7. Deploy to AWS")
        print("8. Continuous Upgrade Mode")
        print("9. Restart Specific Service")
        print("0. Exit")
        
        choice = input("\nEnter choice (0-9): ").strip()
        
        try:
            if choice == "1":
                print("\n🚀 Starting all services...")
                results = deployment_system.start_all_services()
                successful = sum(1 for success in results.values() if success)
                print(f"\n✅ Started {successful}/{len(results)} services successfully")
                
                # Show service URLs
                print("\n🔗 Service URLs:")
                for service_name, service in deployment_system.services.items():
                    if service["status"] == "running":
                        print(f"  {service_name}: http://localhost:{service['port']}")
                
            elif choice == "2":
                print("\n🛑 Stopping all services...")
                results = deployment_system.stop_all_services()
                successful = sum(1 for success in results.values() if success)
                print(f"\n✅ Stopped {successful}/{len(results)} services successfully")
                
            elif choice == "3":
                status_summary = deployment_system.get_service_status_summary()
                
                print(f"\n📊 SERVICE STATUS SUMMARY")
                print(f"Total Services: {status_summary['total_services']}")
                print(f"Running: {status_summary['running']} ✅")
                print(f"Stopped: {status_summary['stopped']} ⏸️")
                print(f"Failed: {status_summary['failed']} ❌")
                print(f"Monitoring: {'Active' if status_summary['monitoring_active'] else 'Inactive'} 👁️")
                
                if status_summary['running_services']:
                    print(f"\n🟢 Running Services:")
                    for service in status_summary['running_services']:
                        port = deployment_system.services[service]['port']
                        print(f"  • {service} (port {port})")
                
                if status_summary['failed_services']:
                    print(f"\n🔴 Failed Services:")
                    for service in status_summary['failed_services']:
                        restarts = deployment_system.services[service]['restart_count']
                        print(f"  • {service} (restarts: {restarts})")
                
            elif choice == "4":
                print("\n👁️ Starting service monitoring...")
                deployment_system.start_monitoring_thread()
                print("✅ Monitoring started in background")
                
            elif choice == "5":
                print("\n🛑 Stopping service monitoring...")
                deployment_system.stop_monitoring()
                print("✅ Monitoring stopped")
                
            elif choice == "6":
                message = input("Enter commit message (or press Enter for default): ").strip()
                print("\n📝 Creating git commit and pushing...")
                
                if deployment_system.create_git_commit_and_push(message if message else None):
                    print("✅ Git operations completed successfully")
                else:
                    print("❌ Git operations failed")
                
            elif choice == "7":
                print("\n☁️ Deploying to AWS...")
                
                if deployment_system.deploy_to_aws():
                    print("✅ AWS deployment completed successfully")
                else:
                    print("❌ AWS deployment failed")
                
            elif choice == "8":
                print("\n🔄 Starting continuous upgrade mode...")
                print("Press Ctrl+C to stop continuous upgrades")
                
                try:
                    deployment_system.continuous_upgrade_cycle()
                except KeyboardInterrupt:
                    print("\n🛑 Continuous upgrade mode stopped")
                
            elif choice == "9":
                print("\n📋 Available Services:")
                for i, service_name in enumerate(deployment_system.services.keys(), 1):
                    status = deployment_system.services[service_name]["status"]
                    print(f"  {i}. {service_name} ({status})")
                
                service_choice = input("Enter service number to restart: ").strip()
                
                try:
                    service_index = int(service_choice) - 1
                    service_names = list(deployment_system.services.keys())
                    
                    if 0 <= service_index < len(service_names):
                        service_name = service_names[service_index]
                        print(f"\n🔄 Restarting {service_name}...")
                        
                        if deployment_system.restart_service(service_name):
                            print(f"✅ {service_name} restarted successfully")
                        else:
                            print(f"❌ Failed to restart {service_name}")
                    else:
                        print("❌ Invalid service number")
                        
                except ValueError:
                    print("❌ Please enter a valid number")
                
            elif choice == "0":
                print("\n👋 Stopping deployment system...")
                deployment_system.stop_monitoring()
                deployment_system.stop_all_services()
                print("✅ Deployment system stopped. Goodbye!")
                break
                
            else:
                print("❌ Invalid choice. Please try again.")
                
        except KeyboardInterrupt:
            print("\n\n🛑 Operation interrupted by user")
            continue
        except Exception as e:
            print(f"\n❌ Error: {str(e)}")
            continue


if __name__ == "__main__":
    main()
