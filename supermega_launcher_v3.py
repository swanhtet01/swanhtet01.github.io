#!/usr/bin/env python3
"""
🌟 SUPERMEGA ULTIMATE LAUNCHER V3
================================
The ultimate launcher for all SuperMega platforms with continuous upgrades
"""

import streamlit as st
import subprocess
import sys
import os
import time
import json
import threading
from datetime import datetime
import requests
from typing import Dict, List, Any, Optional
import plotly.graph_objects as go
import plotly.express as px

class SuperMegaLauncher:
    """Ultimate SuperMega platform launcher and coordinator"""
    
    def __init__(self):
        self.platforms = {
            "master_ai_controller_v2": {
                "name": "👑 Master AI Controller V2",
                "description": "Enhanced LLM chatbot with integrated agents",
                "script": "master_ai_controller_v2.py",
                "port": 8516,
                "category": "core",
                "status": "stopped",
                "priority": 1
            },
            "next_gen_ai_platform": {
                "name": "🧠 Next-Gen AI Platform",
                "description": "6 AI model providers integration",
                "script": "next_gen_ai_platform.py",
                "port": 8512,
                "category": "ai",
                "status": "stopped",
                "priority": 2
            },
            "ai_video_studio_pro": {
                "name": "🎬 Video Studio Pro",
                "description": "Professional video editing with AI",
                "script": "ai_video_studio_pro.py",
                "port": 8510,
                "category": "creative",
                "status": "stopped",
                "priority": 3
            },
            "autonomous_agents_v3": {
                "name": "🤖 Autonomous Agents V3",
                "description": "5 specialized AI agents",
                "script": "autonomous_agents_v3.py",
                "port": 8511,
                "category": "automation",
                "status": "stopped",
                "priority": 4
            },
            "advanced_orchestrator_ai": {
                "name": "🧠 Orchestrator AI",
                "description": "Platform coordination system",
                "script": "advanced_orchestrator_ai.py",
                "port": 8514,
                "category": "core",
                "status": "stopped",
                "priority": 5
            },
            "game_changing_infrastructure": {
                "name": "🎯 Game-Changing Infrastructure",
                "description": "AI memory and predictive scaling",
                "script": "game_changing_infrastructure.py",
                "port": 8515,
                "category": "infrastructure",
                "status": "stopped",
                "priority": 6
            },
            "continuous_upgrade_system": {
                "name": "🎯 Continuous Upgrade System",
                "description": "Automated improvements and agent coordination",
                "script": "continuous_upgrade_system.py", 
                "port": 8517,
                "category": "automation",
                "status": "stopped",
                "priority": 7
            },
            "infrastructure_monitor": {
                "name": "📊 Infrastructure Monitor",
                "description": "Real-time system monitoring",
                "script": "infrastructure_monitor.py",
                "port": 8513,
                "category": "monitoring",
                "status": "stopped",
                "priority": 8
            },
            "browser_automation_v2": {
                "name": "🌐 Browser Automation V2",
                "description": "Advanced web automation",
                "script": "browser_automation_v2.py",
                "port": 8504,
                "category": "automation",
                "status": "stopped",
                "priority": 9
            },
            "media_studio_ai": {
                "name": "🎨 Media Studio AI",
                "description": "AI-powered media creation",
                "script": "media_studio_ai.py",
                "port": 8505,
                "category": "creative",
                "status": "stopped",
                "priority": 10
            },
            "voice_studio_ai": {
                "name": "🎤 Voice Studio AI",
                "description": "Voice cloning and audio processing",
                "script": "voice_studio_ai.py",
                "port": 8506,
                "category": "creative",
                "status": "stopped",
                "priority": 11
            },
            "cad_studio_ai": {
                "name": "📐 CAD Studio AI",
                "description": "3D modeling and CAD design",
                "script": "cad_studio_ai.py",
                "port": 8508,
                "category": "design",
                "status": "stopped",
                "priority": 12
            },
            "text_studio_ai": {
                "name": "📝 Text Studio AI",
                "description": "Advanced text processing",
                "script": "text_studio_ai.py",
                "port": 8509,
                "category": "creative",
                "status": "stopped",
                "priority": 13
            }
        }
        
        self.processes = {}
        self.monitoring_active = False
        self.auto_restart = True
        self.launch_sequence_active = False
        
        # Categories for organization
        self.categories = {
            "core": {"name": "🎯 Core Systems", "color": "#FF6B6B"},
            "ai": {"name": "🧠 AI Platforms", "color": "#4ECDC4"},
            "creative": {"name": "🎨 Creative Studios", "color": "#45B7D1"},
            "automation": {"name": "🤖 Automation", "color": "#96CEB4"},
            "infrastructure": {"name": "🏗️ Infrastructure", "color": "#FFEAA7"},
            "monitoring": {"name": "📊 Monitoring", "color": "#DDA0DD"},
            "design": {"name": "📐 Design Tools", "color": "#98D8C8"}
        }
    
    def check_platform_status(self, platform_id: str) -> Dict[str, Any]:
        """Check if platform is running and healthy"""
        platform = self.platforms.get(platform_id)
        if not platform:
            return {"status": "unknown", "healthy": False}
        
        try:
            response = requests.get(f"http://localhost:{platform['port']}", timeout=3)
            if response.status_code == 200:
                self.platforms[platform_id]["status"] = "running"
                return {"status": "running", "healthy": True, "response_time": response.elapsed.total_seconds()}
            else:
                self.platforms[platform_id]["status"] = "error"
                return {"status": "error", "healthy": False}
                
        except requests.exceptions.ConnectionError:
            self.platforms[platform_id]["status"] = "stopped"
            return {"status": "stopped", "healthy": False}
        except Exception as e:
            self.platforms[platform_id]["status"] = "error"
            return {"status": "error", "healthy": False, "error": str(e)}
    
    def launch_platform(self, platform_id: str) -> bool:
        """Launch a specific platform"""
        platform = self.platforms.get(platform_id)
        if not platform:
            return False
        
        # Check if already running
        status = self.check_platform_status(platform_id)
        if status["healthy"]:
            st.info(f"{platform['name']} is already running")
            return True
        
        try:
            # Check if script exists
            if not os.path.exists(platform["script"]):
                st.error(f"Script not found: {platform['script']}")
                return False
            
            st.info(f"🚀 Launching {platform['name']} on port {platform['port']}...")
            
            # Launch with streamlit
            command = [
                sys.executable, "-m", "streamlit", "run",
                platform["script"],
                "--server.port", str(platform["port"]),
                "--server.headless", "true"
            ]
            
            process = subprocess.Popen(
                command,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=os.getcwd()
            )
            
            self.processes[platform_id] = process
            self.platforms[platform_id]["status"] = "starting"
            
            # Wait for startup
            max_attempts = 20
            for attempt in range(max_attempts):
                time.sleep(1)
                status = self.check_platform_status(platform_id)
                if status["healthy"]:
                    st.success(f"✅ {platform['name']} launched successfully!")
                    return True
            
            st.warning(f"⚠️ {platform['name']} may not have started properly")
            return False
            
        except Exception as e:
            st.error(f"❌ Failed to launch {platform['name']}: {str(e)}")
            return False
    
    def stop_platform(self, platform_id: str) -> bool:
        """Stop a specific platform"""
        platform = self.platforms.get(platform_id)
        if not platform:
            return False
        
        try:
            if platform_id in self.processes:
                process = self.processes[platform_id]
                process.terminate()
                del self.processes[platform_id]
            
            self.platforms[platform_id]["status"] = "stopped"
            st.info(f"🛑 {platform['name']} stopped")
            return True
            
        except Exception as e:
            st.error(f"Failed to stop {platform['name']}: {str(e)}")
            return False
    
    def launch_all_platforms(self) -> Dict[str, bool]:
        """Launch all platforms in priority order"""
        if self.launch_sequence_active:
            st.warning("Launch sequence already in progress!")
            return {}
        
        self.launch_sequence_active = True
        
        st.markdown("## 🚀 SuperMega Launch Sequence Initiated!")
        
        # Sort by priority
        sorted_platforms = sorted(
            self.platforms.items(),
            key=lambda x: x[1]["priority"]
        )
        
        results = {}
        progress_bar = st.progress(0)
        status_text = st.empty()
        
        try:
            for i, (platform_id, platform) in enumerate(sorted_platforms):
                progress = (i + 1) / len(sorted_platforms)
                progress_bar.progress(progress)
                status_text.text(f"Launching {platform['name']}...")
                
                results[platform_id] = self.launch_platform(platform_id)
                
                # Small delay between launches
                time.sleep(2)
            
            successful = sum(1 for result in results.values() if result)
            total = len(results)
            
            if successful == total:
                st.success(f"🎉 All {total} platforms launched successfully!")
                st.balloons()
            else:
                st.warning(f"⚠️ {successful}/{total} platforms launched successfully")
            
        finally:
            self.launch_sequence_active = False
            progress_bar.empty()
            status_text.empty()
        
        return results
    
    def stop_all_platforms(self) -> Dict[str, bool]:
        """Stop all platforms"""
        results = {}
        
        for platform_id in self.platforms.keys():
            results[platform_id] = self.stop_platform(platform_id)
        
        return results
    
    def get_system_overview(self) -> Dict[str, Any]:
        """Get comprehensive system overview"""
        overview = {
            "total_platforms": len(self.platforms),
            "running": 0,
            "stopped": 0,
            "error": 0,
            "categories": {},
            "platform_status": {}
        }
        
        # Check all platform statuses
        for platform_id, platform in self.platforms.items():
            status = self.check_platform_status(platform_id)
            overview["platform_status"][platform_id] = status
            
            # Count by status
            if status["status"] == "running":
                overview["running"] += 1
            elif status["status"] == "stopped":
                overview["stopped"] += 1
            else:
                overview["error"] += 1
            
            # Count by category
            category = platform["category"]
            if category not in overview["categories"]:
                overview["categories"][category] = {"running": 0, "total": 0}
            
            overview["categories"][category]["total"] += 1
            if status["status"] == "running":
                overview["categories"][category]["running"] += 1
        
        overview["health_percentage"] = (overview["running"] / overview["total_platforms"]) * 100
        
        return overview
    
    def monitor_platforms(self):
        """Monitor platforms and restart if needed"""
        while self.monitoring_active:
            try:
                for platform_id, platform in self.platforms.items():
                    if platform["status"] == "running":
                        status = self.check_platform_status(platform_id)
                        
                        if not status["healthy"] and self.auto_restart:
                            st.warning(f"🔧 Restarting {platform['name']}...")
                            self.launch_platform(platform_id)
                
                time.sleep(30)  # Check every 30 seconds
                
            except Exception as e:
                st.error(f"Monitoring error: {str(e)}")
                time.sleep(60)
    
    def start_monitoring(self):
        """Start platform monitoring"""
        if not self.monitoring_active:
            self.monitoring_active = True
            monitor_thread = threading.Thread(target=self.monitor_platforms, daemon=True)
            monitor_thread.start()
            return True
        return False
    
    def stop_monitoring(self):
        """Stop platform monitoring"""
        self.monitoring_active = False


def main():
    """Main SuperMega Launcher interface"""
    st.set_page_config(
        page_title="SuperMega Ultimate Launcher V3",
        page_icon="🌟",
        layout="wide",
        initial_sidebar_state="expanded"
    )
    
    # Custom CSS
    st.markdown("""
    <style>
    .main-header {
        background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
        padding: 1rem;
        border-radius: 10px;
        color: white;
        text-align: center;
        margin-bottom: 2rem;
    }
    
    .platform-card {
        background: #f8f9fa;
        padding: 1rem;
        border-radius: 8px;
        border-left: 4px solid;
        margin: 0.5rem 0;
        transition: transform 0.2s;
    }
    
    .platform-card:hover {
        transform: translateY(-2px);
    }
    
    .running { border-left-color: #28a745; }
    .stopped { border-left-color: #6c757d; }
    .error { border-left-color: #dc3545; }
    
    .metric-card {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 1rem;
        border-radius: 10px;
        text-align: center;
    }
    </style>
    """, unsafe_allow_html=True)
    
    # Header
    st.markdown("""
    <div class="main-header">
        <h1>🌟 SuperMega Ultimate Launcher V3</h1>
        <p>The ultimate launcher for all SuperMega platforms with continuous upgrades</p>
    </div>
    """, unsafe_allow_html=True)
    
    # Initialize launcher
    if "launcher" not in st.session_state:
        st.session_state.launcher = SuperMegaLauncher()
    
    launcher = st.session_state.launcher
    
    # Sidebar controls
    with st.sidebar:
        st.title("🎛️ Control Center")
        
        st.subheader("🚀 Launch Controls")
        
        col1, col2 = st.columns(2)
        with col1:
            if st.button("🚀 Launch All", type="primary", use_container_width=True):
                with st.spinner("Launching all platforms..."):
                    launcher.launch_all_platforms()
        
        with col2:
            if st.button("🛑 Stop All", use_container_width=True):
                with st.spinner("Stopping all platforms..."):
                    launcher.stop_all_platforms()
                    st.success("All platforms stopped!")
        
        st.subheader("👁️ Monitoring")
        
        col1, col2 = st.columns(2)
        with col1:
            if st.button("👁️ Start Monitor", use_container_width=True):
                if launcher.start_monitoring():
                    st.success("Monitoring started!")
                else:
                    st.info("Already monitoring!")
        
        with col2:
            if st.button("⏸️ Stop Monitor", use_container_width=True):
                launcher.stop_monitoring()
                st.info("Monitoring stopped!")
        
        st.markdown("---")
        
        # Quick actions
        st.subheader("⚡ Quick Actions")
        
        if st.button("🔄 Refresh Status", use_container_width=True):
            st.rerun()
        
        if st.button("📊 System Health", use_container_width=True):
            overview = launcher.get_system_overview()
            st.metric("System Health", f"{overview['health_percentage']:.1f}%")
        
        st.toggle("🔄 Auto-restart", key="auto_restart", value=launcher.auto_restart)
        launcher.auto_restart = st.session_state.auto_restart
    
    # Main dashboard
    overview = launcher.get_system_overview()
    
    # System overview metrics
    col1, col2, col3, col4 = st.columns(4)
    
    with col1:
        st.markdown(f"""
        <div class="metric-card">
            <h3>{overview['running']}</h3>
            <p>Running Platforms</p>
        </div>
        """, unsafe_allow_html=True)
    
    with col2:
        st.markdown(f"""
        <div class="metric-card">
            <h3>{overview['total_platforms']}</h3>
            <p>Total Platforms</p>
        </div>
        """, unsafe_allow_html=True)
    
    with col3:
        st.markdown(f"""
        <div class="metric-card">
            <h3>{overview['health_percentage']:.1f}%</h3>
            <p>System Health</p>
        </div>
        """, unsafe_allow_html=True)
    
    with col4:
        monitoring_status = "Active" if launcher.monitoring_active else "Inactive"
        st.markdown(f"""
        <div class="metric-card">
            <h3>{monitoring_status}</h3>
            <p>Monitoring</p>
        </div>
        """, unsafe_allow_html=True)
    
    # Platform categories
    st.subheader("🎯 Platform Categories")
    
    # Create tabs for each category
    category_tabs = st.tabs([self.categories[cat_id]["name"] for cat_id in launcher.categories.keys()])
    
    for i, (cat_id, cat_info) in enumerate(launcher.categories.items()):
        with category_tabs[i]:
            # Get platforms in this category
            category_platforms = {
                pid: platform for pid, platform in launcher.platforms.items()
                if platform["category"] == cat_id
            }
            
            if category_platforms:
                cols = st.columns(min(3, len(category_platforms)))
                
                for j, (platform_id, platform) in enumerate(category_platforms.items()):
                    with cols[j % 3]:
                        status = launcher.check_platform_status(platform_id)
                        status_class = status["status"]
                        status_icon = {"running": "🟢", "stopped": "⚪", "error": "🔴"}.get(status["status"], "⚪")
                        
                        st.markdown(f"""
                        <div class="platform-card {status_class}">
                            <h4>{status_icon} {platform['name']}</h4>
                            <p><strong>Port:</strong> {platform['port']}</p>
                            <p><small>{platform['description']}</small></p>
                        </div>
                        """, unsafe_allow_html=True)
                        
                        col1, col2 = st.columns(2)
                        
                        with col1:
                            if status["status"] == "running":
                                if st.button(f"🛑 Stop", key=f"stop_{platform_id}"):
                                    launcher.stop_platform(platform_id)
                                    st.rerun()
                            else:
                                if st.button(f"🚀 Launch", key=f"start_{platform_id}"):
                                    launcher.launch_platform(platform_id)
                                    st.rerun()
                        
                        with col2:
                            if status["status"] == "running":
                                if st.button(f"🔗 Open", key=f"open_{platform_id}"):
                                    st.markdown(f'[Open in new tab](http://localhost:{platform["port"]})', unsafe_allow_html=True)
    
    # System statistics
    st.subheader("📊 System Statistics")
    
    # Create pie chart of platform statuses
    labels = ["Running", "Stopped", "Error"]
    values = [overview["running"], overview["stopped"], overview["error"]]
    colors = ["#28a745", "#6c757d", "#dc3545"]
    
    fig = go.Figure(data=[go.Pie(
        labels=labels,
        values=values,
        marker_colors=colors,
        hole=0.3
    )])
    
    fig.update_layout(
        title="Platform Status Distribution",
        showlegend=True,
        height=400
    )
    
    col1, col2 = st.columns(2)
    
    with col1:
        st.plotly_chart(fig, use_container_width=True)
    
    with col2:
        st.subheader("🔗 Quick Access")
        
        # Show running platforms with direct links
        running_platforms = [
            (pid, platform) for pid, platform in launcher.platforms.items()
            if overview["platform_status"][pid]["status"] == "running"
        ]
        
        if running_platforms:
            for platform_id, platform in running_platforms:
                st.markdown(f"""
                **{platform['name']}**  
                [http://localhost:{platform['port']}](http://localhost:{platform['port']})
                """)
        else:
            st.info("No platforms currently running")
    
    # Auto-refresh for live updates
    if launcher.monitoring_active:
        time.sleep(5)
        st.rerun()


if __name__ == "__main__":
    main()
