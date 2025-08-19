#!/usr/bin/env python3
"""
🚀 SUPERMEGA ULTIMATE PLATFORM LAUNCHER
======================================
Launch, monitor, and coordinate all SuperMega AI services
"""

import streamlit as st
import subprocess
import threading
import time
import requests
import json
import os
import sys
from datetime import datetime
from typing import Dict, List, Any

class SuperMegaUltimateLauncher:
    """Ultimate launcher for all SuperMega services"""
    
    def __init__(self):
        self.services = [
            {
                "id": "services_launcher", 
                "name": "🎛️ Services Launcher",
                "port": 8501,
                "path": "supermega_services_launcher.py",
                "description": "Main control dashboard",
                "category": "Core",
                "status": "stopped",
                "process": None,
                "auto_start": True
            },
            {
                "id": "browser_automation",
                "name": "🌐 Browser Automation", 
                "port": 8504,
                "path": "simple_browser_automation.py",
                "description": "AI-powered browser automation with natural language",
                "category": "Automation",
                "status": "stopped",
                "process": None,
                "auto_start": True
            },
            {
                "id": "media_studio",
                "name": "🎨 Media Studio",
                "port": 8505, 
                "path": "ai_media_studio.py",
                "description": "Image and media editing with AI enhancement",
                "category": "Creative",
                "status": "stopped",
                "process": None,
                "auto_start": True
            },
            {
                "id": "voice_studio",
                "name": "🎤 Voice Studio",
                "port": 8506,
                "path": "ai_voice_studio.py", 
                "description": "Voice cloning and audio processing",
                "category": "Creative",
                "status": "stopped",
                "process": None,
                "auto_start": True
            },
            {
                "id": "cad_studio",
                "name": "📐 CAD Studio",
                "port": 8508,
                "path": "ai_cad_studio.py",
                "description": "3D modeling and CAD design tools",
                "category": "Design", 
                "status": "stopped",
                "process": None,
                "auto_start": True
            },
            {
                "id": "text_studio", 
                "name": "📝 Text Studio",
                "port": 8509,
                "path": "ai_text_studio.py",
                "description": "Advanced text processing and generation",
                "category": "Productivity",
                "status": "stopped", 
                "process": None,
                "auto_start": True
            },
            {
                "id": "video_studio_pro",
                "name": "🎬 Video Studio Pro",
                "port": 8510,
                "path": "ai_video_studio_pro.py",
                "description": "Professional video editing with AI enhancement",
                "category": "Creative",
                "status": "stopped",
                "process": None,
                "auto_start": True
            },
            {
                "id": "autonomous_agents",
                "name": "🤖 Autonomous Agents",
                "port": 8511, 
                "path": "autonomous_agents_v3.py",
                "description": "Self-operating AI agents for task automation",
                "category": "AI",
                "status": "stopped",
                "process": None,
                "auto_start": True
            },
            {
                "id": "next_gen_platform",
                "name": "🧠 Next-Gen AI Platform",
                "port": 8512,
                "path": "next_gen_ai_platform.py", 
                "description": "Advanced AI model integration and management",
                "category": "AI",
                "status": "stopped",
                "process": None,
                "auto_start": True
            },
            {
                "id": "infrastructure_monitor",
                "name": "📊 Infrastructure Monitor", 
                "port": 8513,
                "path": "infrastructure_monitor.py",
                "description": "Real-time system and AWS monitoring",
                "category": "Management",
                "status": "stopped",
                "process": None,
                "auto_start": False
            },
            {
                "id": "orchestrator_ai",
                "name": "🧠 Orchestrator AI",
                "port": 8514,
                "path": "advanced_orchestrator_ai.py",
                "description": "Central AI that navigates and uses all platforms",
                "category": "AI",
                "status": "stopped",
                "process": None,
                "auto_start": True
            },
            {
                "id": "game_changing_infrastructure",
                "name": "🎯 Game-Changing Infrastructure",
                "port": 8515,
                "path": "game_changing_infrastructure.py", 
                "description": "Advanced AI memory, predictive scaling, and auto-recovery",
                "category": "AI",
                "status": "stopped",
                "process": None,
                "auto_start": True
            }
        ]
        
        self.deployment_status = {
            "local": {"status": "ready", "services": 0},
            "docker": {"status": "not_deployed", "containers": 0},
            "aws": {"status": "not_deployed", "instances": 0}
        }
        
    def check_service_health(self, service: Dict[str, Any]) -> bool:
        """Check if a service is healthy"""
        try:
            response = requests.get(
                f"http://localhost:{service['port']}",
                timeout=5
            )
            return response.status_code == 200
        except Exception:
            return False
    
    def start_service(self, service: Dict[str, Any]) -> bool:
        """Start a single service"""
        try:
            if not os.path.exists(service["path"]):
                st.error(f"Service file not found: {service['path']}")
                return False
            
            # Start the service
            cmd = [
                sys.executable, "-m", "streamlit", "run",
                service["path"],
                "--server.port", str(service["port"]),
                "--server.address", "0.0.0.0",
                "--server.headless", "true"
            ]
            
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=os.getcwd()
            )
            
            service["process"] = process
            service["status"] = "starting"
            
            # Wait a moment and check if it started
            time.sleep(3)
            
            if self.check_service_health(service):
                service["status"] = "running"
                st.success(f"✅ Started {service['name']}")
                return True
            else:
                service["status"] = "error"
                st.error(f"❌ Failed to start {service['name']}")
                return False
                
        except Exception as e:
            service["status"] = "error"
            st.error(f"❌ Error starting {service['name']}: {str(e)}")
            return False
    
    def stop_service(self, service: Dict[str, Any]) -> bool:
        """Stop a single service"""
        try:
            if service.get("process"):
                service["process"].terminate()
                service["process"] = None
            
            service["status"] = "stopped"
            st.info(f"🛑 Stopped {service['name']}")
            return True
            
        except Exception as e:
            st.error(f"❌ Error stopping {service['name']}: {str(e)}")
            return False
    
    def start_all_services(self):
        """Start all services that are marked for auto-start"""
        st.info("🚀 Starting all SuperMega services...")
        
        progress_bar = st.progress(0)
        status_text = st.empty()
        
        total_services = len([s for s in self.services if s["auto_start"]])
        started_count = 0
        
        for i, service in enumerate(self.services):
            if service["auto_start"]:
                status_text.text(f"Starting {service['name']}...")
                
                if self.start_service(service):
                    started_count += 1
                
                progress_bar.progress((i + 1) / len(self.services))
                time.sleep(1)
        
        status_text.text(f"✅ Started {started_count}/{total_services} services successfully!")
        
        # Update deployment status
        self.deployment_status["local"]["services"] = started_count
        self.deployment_status["local"]["status"] = "deployed" if started_count > 0 else "failed"
    
    def stop_all_services(self):
        """Stop all running services"""
        st.info("🛑 Stopping all services...")
        
        stopped_count = 0
        for service in self.services:
            if service["status"] == "running":
                if self.stop_service(service):
                    stopped_count += 1
        
        st.success(f"✅ Stopped {stopped_count} services")
        
        # Update deployment status
        self.deployment_status["local"]["services"] = 0
        self.deployment_status["local"]["status"] = "ready"
    
    def update_service_statuses(self):
        """Update the status of all services"""
        for service in self.services:
            if service["status"] in ["running", "starting"]:
                if self.check_service_health(service):
                    service["status"] = "running"
                else:
                    service["status"] = "error"
    
    def deploy_docker(self):
        """Deploy using Docker Compose"""
        try:
            st.info("🐳 Deploying with Docker Compose...")
            
            # Check if docker-compose.yml exists
            if not os.path.exists("docker-compose.yml"):
                st.warning("docker-compose.yml not found, creating basic configuration...")
                self.create_basic_docker_compose()
            
            # Run docker-compose up
            result = subprocess.run(
                ["docker-compose", "up", "-d"],
                capture_output=True,
                text=True
            )
            
            if result.returncode == 0:
                st.success("✅ Docker deployment successful!")
                self.deployment_status["docker"]["status"] = "deployed"
                self.deployment_status["docker"]["containers"] = len(self.services)
            else:
                st.error(f"❌ Docker deployment failed: {result.stderr}")
                self.deployment_status["docker"]["status"] = "failed"
                
        except Exception as e:
            st.error(f"❌ Docker deployment error: {str(e)}")
    
    def deploy_aws(self):
        """Deploy to AWS using the deployment manager"""
        try:
            st.info("☁️ Deploying to AWS...")
            
            # Run AWS deployment
            result = subprocess.run(
                [sys.executable, "aws_deployment_manager.py", "--deploy"],
                capture_output=True,
                text=True
            )
            
            if result.returncode == 0:
                st.success("✅ AWS deployment initiated!")
                st.code(result.stdout)
                self.deployment_status["aws"]["status"] = "deploying"
            else:
                st.error(f"❌ AWS deployment failed: {result.stderr}")
                self.deployment_status["aws"]["status"] = "failed"
                
        except Exception as e:
            st.error(f"❌ AWS deployment error: {str(e)}")
    
    def create_basic_docker_compose(self):
        """Create a basic Docker Compose configuration"""
        compose_config = {
            "version": "3.8",
            "services": {}
        }
        
        for service in self.services:
            if service["auto_start"]:
                compose_config["services"][service["id"]] = {
                    "build": ".",
                    "ports": [f"{service['port']}:{service['port']}"],
                    "environment": [
                        f"STREAMLIT_SERVER_PORT={service['port']}",
                        "STREAMLIT_SERVER_ADDRESS=0.0.0.0"
                    ],
                    "command": f"streamlit run {service['path']} --server.port {service['port']} --server.address 0.0.0.0",
                    "restart": "unless-stopped"
                }
        
        with open("docker-compose.yml", "w") as f:
            import yaml
            yaml.dump(compose_config, f, default_flow_style=False)
        
        st.info("✅ Created basic docker-compose.yml")
    
    def get_service_urls(self) -> List[Dict[str, str]]:
        """Get URLs for all running services"""
        urls = []
        
        for service in self.services:
            if service["status"] == "running":
                urls.append({
                    "name": service["name"],
                    "url": f"http://localhost:{service['port']}",
                    "category": service["category"]
                })
        
        return urls

def main():
    """Main launcher interface"""
    st.set_page_config(
        page_title="SuperMega Ultimate Launcher",
        page_icon="🚀",
        layout="wide"
    )
    
    st.title("🚀 SuperMega Ultimate Platform Launcher")
    st.markdown("**Launch, monitor, and manage your complete AI automation platform**")
    
    # Initialize launcher
    launcher = SuperMegaUltimateLauncher()
    
    # Update service statuses
    launcher.update_service_statuses()
    
    # Sidebar controls
    st.sidebar.title("🎛️ Platform Controls")
    
    # Main action buttons
    col1, col2 = st.sidebar.columns(2)
    
    with col1:
        if st.button("🚀 Start All", type="primary", use_container_width=True):
            launcher.start_all_services()
    
    with col2:
        if st.button("🛑 Stop All", type="secondary", use_container_width=True):
            launcher.stop_all_services()
    
    st.sidebar.markdown("---")
    
    # Deployment options
    st.sidebar.subheader("📦 Deployment Options")
    
    if st.sidebar.button("🐳 Deploy Docker", use_container_width=True):
        launcher.deploy_docker()
    
    if st.sidebar.button("☁️ Deploy AWS", use_container_width=True):
        launcher.deploy_aws()
    
    # Auto-refresh toggle
    st.sidebar.markdown("---")
    auto_refresh = st.sidebar.checkbox("🔄 Auto-refresh (10s)", value=True)
    
    if st.sidebar.button("🔄 Refresh Status"):
        launcher.update_service_statuses()
        st.rerun()
    
    # Main content tabs
    tab1, tab2, tab3, tab4 = st.tabs([
        "🎛️ Service Control",
        "📊 Dashboard",
        "🌐 Quick Access",
        "📋 System Info"
    ])
    
    with tab1:
        st.header("🎛️ Service Control Panel")
        
        # Group services by category
        categories = {}
        for service in launcher.services:
            category = service["category"]
            if category not in categories:
                categories[category] = []
            categories[category].append(service)
        
        # Display services by category
        for category, services in categories.items():
            st.subheader(f"{category} Services")
            
            for service in services:
                with st.container():
                    col1, col2, col3, col4, col5 = st.columns([3, 1, 1, 1, 1])
                    
                    with col1:
                        # Status indicator
                        if service["status"] == "running":
                            status_color = "🟢"
                        elif service["status"] == "starting":
                            status_color = "🟡"
                        elif service["status"] == "error":
                            status_color = "🔴"
                        else:
                            status_color = "⚪"
                        
                        st.markdown(f"{status_color} **{service['name']}**")
                        st.caption(service["description"])
                    
                    with col2:
                        st.text(f"Port: {service['port']}")
                    
                    with col3:
                        st.text(service["status"].title())
                    
                    with col4:
                        if service["status"] != "running":
                            if st.button("▶️", key=f"start_{service['id']}"):
                                launcher.start_service(service)
                                st.rerun()
                        else:
                            st.text("✅")
                    
                    with col5:
                        if service["status"] == "running":
                            if st.button("⏹️", key=f"stop_{service['id']}"):
                                launcher.stop_service(service) 
                                st.rerun()
                        else:
                            st.text("—")
                    
                    # Auto-start toggle
                    service["auto_start"] = st.checkbox(
                        "Auto-start",
                        value=service["auto_start"],
                        key=f"auto_{service['id']}"
                    )
                
                st.markdown("---")
    
    with tab2:
        st.header("📊 Platform Dashboard")
        
        # Deployment status
        col1, col2, col3 = st.columns(3)
        
        with col1:
            local_status = launcher.deployment_status["local"]
            st.metric(
                "🖥️ Local Services",
                local_status["services"],
                f"Status: {local_status['status'].title()}"
            )
        
        with col2:
            docker_status = launcher.deployment_status["docker"]
            st.metric(
                "🐳 Docker Containers",
                docker_status["containers"],
                f"Status: {docker_status['status'].title()}"
            )
        
        with col3:
            aws_status = launcher.deployment_status["aws"]
            st.metric(
                "☁️ AWS Instances",
                aws_status["instances"],
                f"Status: {aws_status['status'].title()}"
            )
        
        # Service statistics
        st.subheader("📈 Service Statistics")
        
        running_services = len([s for s in launcher.services if s["status"] == "running"])
        total_services = len(launcher.services)
        
        # Progress bar
        progress = running_services / total_services if total_services > 0 else 0
        st.progress(progress)
        st.text(f"{running_services}/{total_services} services running ({progress*100:.1f}%)")
        
        # Service status breakdown
        status_counts = {}
        for service in launcher.services:
            status = service["status"]
            status_counts[status] = status_counts.get(status, 0) + 1
        
        col1, col2, col3, col4 = st.columns(4)
        
        with col1:
            st.metric("🟢 Running", status_counts.get("running", 0))
        
        with col2:
            st.metric("🟡 Starting", status_counts.get("starting", 0))
        
        with col3:
            st.metric("🔴 Error", status_counts.get("error", 0))
        
        with col4:
            st.metric("⚪ Stopped", status_counts.get("stopped", 0))
    
    with tab3:
        st.header("🌐 Quick Access Links")
        
        # Get running service URLs
        service_urls = launcher.get_service_urls()
        
        if service_urls:
            # Group by category
            url_categories = {}
            for url_info in service_urls:
                category = url_info["category"]
                if category not in url_categories:
                    url_categories[category] = []
                url_categories[category].append(url_info)
            
            # Display URLs by category
            for category, urls in url_categories.items():
                st.subheader(f"{category} Services")
                
                for url_info in urls:
                    col1, col2 = st.columns([3, 1])
                    
                    with col1:
                        st.markdown(f"**{url_info['name']}**")
                        st.markdown(f"[{url_info['url']}]({url_info['url']})")
                    
                    with col2:
                        if st.button("🔗 Open", key=f"open_{url_info['name']}"):
                            st.markdown(f'<meta http-equiv="refresh" content="0; url={url_info["url"]}">', unsafe_allow_html=True)
                
                st.markdown("---")
        else:
            st.info("No services are currently running. Start some services to see quick access links.")
    
    with tab4:
        st.header("📋 System Information")
        
        # System info
        col1, col2 = st.columns(2)
        
        with col1:
            st.subheader("🖥️ System")
            try:
                import platform
                st.text(f"OS: {platform.system()} {platform.release()}")
                st.text(f"Python: {platform.python_version()}")
                st.text(f"Architecture: {platform.architecture()[0]}")
            except Exception as e:
                st.error(f"Failed to get system info: {str(e)}")
        
        with col2:
            st.subheader("📁 Paths")
            st.text(f"Working Directory: {os.getcwd()}")
            st.text(f"Python Executable: {sys.executable}")
            st.text(f"Platform Directory: {os.path.dirname(__file__)}")
        
        # Service files status
        st.subheader("📄 Service Files Status")
        
        for service in launcher.services:
            file_exists = os.path.exists(service["path"])
            status_icon = "✅" if file_exists else "❌"
            st.text(f"{status_icon} {service['path']}")
        
        # Recent logs (if available)
        st.subheader("📝 Recent Activity")
        st.text(f"Last update: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        st.text(f"Total services configured: {len(launcher.services)}")
        st.text(f"Auto-start services: {len([s for s in launcher.services if s['auto_start']])}")
    
    # Auto-refresh
    if auto_refresh:
        time.sleep(10)
        st.rerun()

if __name__ == "__main__":
    main()
