#!/usr/bin/env python3
"""
🚀 SUPERMEGA AI SERVICES LAUNCHER
===============================
Professional AI automation platform - Service orchestrator
"""

import streamlit as st
import subprocess
import time
import os
import json
import requests
from datetime import datetime
from typing import Dict, List, Any, Optional
import threading

# Set page config
st.set_page_config(
    page_title="🚀 SuperMega AI Services",
    page_icon="🚀",
    layout="wide"
)

class SuperMegaServiceManager:
    """Manage and monitor all SuperMega AI services"""
    
    def __init__(self):
        self.services = {
            'browser_automation': {
                'name': '🤖 AI Browser Automation',
                'description': 'Natural language web automation with AI chatbot interface',
                'port': 8504,
                'file': 'simple_browser_automation.py',
                'status': 'unknown',
                'url': 'http://localhost:8504'
            },
            'media_studio': {
                'name': '🎨 AI Media Studio',
                'description': 'Image and video editing with AI processing',
                'port': 8505,
                'file': 'ai_media_studio.py',
                'status': 'unknown',
                'url': 'http://localhost:8505'
            },
            'voice_studio': {
                'name': '🎤 AI Voice Studio',
                'description': 'Voice cloning and audio processing studio',
                'port': 8506,
                'file': 'ai_voice_studio.py',
                'status': 'unknown',
                'url': 'http://localhost:8506'
            },
            'central_nervous_system': {
                'name': '🧠 Central Nervous System',
                'description': 'Multi-agent coordination and intelligence hub',
                'port': 8507,
                'file': 'central_nervous_system.py',
                'status': 'unknown',
                'url': 'http://localhost:8507'
            },
            'cad_studio': {
                'name': '🏗️ AI CAD Studio',
                'description': '3D modeling and CAD design tools',
                'port': 8508,
                'file': 'ai_cad_studio.py',
                'status': 'unknown',
                'url': 'http://localhost:8508'
            },
            'text_studio': {
                'name': '📄 AI Text Studio',
                'description': 'Document analysis and text processing',
                'port': 8509,
                'file': 'ai_text_studio.py',
                'status': 'unknown',
                'url': 'http://localhost:8509'
            }
        }
        
        if 'service_logs' not in st.session_state:
            st.session_state.service_logs = []
        
        if 'auto_refresh' not in st.session_state:
            st.session_state.auto_refresh = False
    
    def check_service_status(self, service_id: str) -> str:
        """Check if a service is running"""
        try:
            service = self.services[service_id]
            response = requests.get(service['url'], timeout=2)
            return 'running' if response.status_code == 200 else 'error'
        except requests.exceptions.RequestException:
            return 'stopped'
        except Exception:
            return 'unknown'
    
    def update_all_statuses(self):
        """Update status for all services"""
        for service_id in self.services:
            self.services[service_id]['status'] = self.check_service_status(service_id)
    
    def render_interface(self):
        st.title("🚀 SuperMega AI Services")
        st.markdown("### Professional AI Automation Platform")
        
        # Auto-refresh toggle
        col1, col2, col3 = st.columns([2, 1, 1])
        with col1:
            st.markdown("**Service Management Dashboard**")
        with col2:
            if st.button("🔄 Refresh Status"):
                self.update_all_statuses()
                st.rerun()
        with col3:
            auto_refresh = st.checkbox("Auto-refresh", value=st.session_state.auto_refresh)
            if auto_refresh != st.session_state.auto_refresh:
                st.session_state.auto_refresh = auto_refresh
        
        # Update statuses
        self.update_all_statuses()
        
        st.divider()
        
        # Services overview
        col1, col2, col3 = st.columns(3)
        
        running_count = len([s for s in self.services.values() if s['status'] == 'running'])
        total_count = len(self.services)
        
        with col1:
            st.metric("Services Running", f"{running_count}/{total_count}")
        with col2:
            st.metric("Platform Status", "🟢 Operational" if running_count > 0 else "🔴 Offline")
        with col3:
            st.metric("Last Updated", datetime.now().strftime("%H:%M:%S"))
        
        st.divider()
        
        # Main tabs
        tab1, tab2, tab3 = st.tabs(["🎛️ Service Control", "📊 System Monitor", "🚀 Quick Launch"])
        
        with tab1:
            self.render_service_control()
        
        with tab2:
            self.render_system_monitor()
        
        with tab3:
            self.render_quick_launch()
    
    def render_service_control(self):
        st.subheader("🎛️ Service Control Panel")
        
        for service_id, service in self.services.items():
            with st.container():
                col1, col2, col3, col4 = st.columns([3, 1, 1, 1])
                
                with col1:
                    st.subheader(service['name'])
                    st.write(service['description'])
                    st.write(f"**Port:** {service['port']} | **URL:** {service['url']}")
                
                with col2:
                    # Status indicator
                    status = service['status']
                    if status == 'running':
                        st.success("🟢 Running")
                    elif status == 'stopped':
                        st.error("🔴 Stopped")
                    elif status == 'error':
                        st.warning("🟡 Error")
                    else:
                        st.info("⚪ Unknown")
                
                with col3:
                    # Control buttons
                    if status == 'running':
                        if st.button(f"🔗 Open", key=f"open_{service_id}"):
                            st.markdown(f'<meta http-equiv="refresh" content="0;URL={service["url"]}" target="_blank">', unsafe_allow_html=True)
                            st.success(f"Opening {service['name']}...")
                    else:
                        if st.button(f"▶️ Start", key=f"start_{service_id}"):
                            self.start_service(service_id)
                            time.sleep(2)  # Give service time to start
                            st.rerun()
                
                with col4:
                    if status == 'running':
                        if st.button(f"⏹️ Stop", key=f"stop_{service_id}"):
                            self.stop_service(service_id)
                            time.sleep(1)
                            st.rerun()
                    else:
                        st.button(f"⏹️ Stop", key=f"stop_{service_id}", disabled=True)
                
                st.divider()
        
        # Global controls
        st.subheader("🔧 Global Controls")
        col1, col2, col3, col4 = st.columns(4)
        
        with col1:
            if st.button("🚀 Start All Services", type="primary"):
                self.start_all_services()
        
        with col2:
            if st.button("⏹️ Stop All Services"):
                self.stop_all_services()
        
        with col3:
            if st.button("🔄 Restart All"):
                self.restart_all_services()
        
        with col4:
            if st.button("📋 Export Config"):
                config = self.export_configuration()
                st.download_button(
                    "💾 Download Config",
                    data=json.dumps(config, indent=2),
                    file_name="supermega_config.json",
                    mime="application/json"
                )
    
    def render_system_monitor(self):
        st.subheader("📊 System Monitoring")
        
        # Service status chart
        st.subheader("📈 Service Status Overview")
        
        status_data = []
        for service_id, service in self.services.items():
            status_data.append({
                'Service': service['name'],
                'Status': service['status'].title(),
                'Port': service['port'],
                'URL': service['url']
            })
        
        st.table(status_data)
        
        # System logs
        st.subheader("📜 System Logs")
        
        log_level = st.selectbox("Log Level", ["All", "Info", "Warning", "Error"])
        
        if st.session_state.service_logs:
            filtered_logs = st.session_state.service_logs
            if log_level != "All":
                filtered_logs = [log for log in st.session_state.service_logs if log['level'] == log_level.lower()]
            
            for log in reversed(filtered_logs[-50:]):  # Show last 50 logs
                timestamp = log['timestamp'].strftime("%H:%M:%S")
                if log['level'] == 'error':
                    st.error(f"[{timestamp}] {log['message']}")
                elif log['level'] == 'warning':
                    st.warning(f"[{timestamp}] {log['message']}")
                else:
                    st.info(f"[{timestamp}] {log['message']}")
        else:
            st.info("No logs available yet.")
        
        # Clear logs button
        if st.button("🗑️ Clear Logs"):
            st.session_state.service_logs = []
            st.rerun()
    
    def render_quick_launch(self):
        st.subheader("🚀 Quick Launch Center")
        
        col1, col2 = st.columns(2)
        
        with col1:
            st.subheader("🎯 Quick Actions")
            
            if st.button("🤖 Launch AI Browser Automation", type="primary"):
                self.ensure_service_running('browser_automation')
                st.success("AI Browser Automation is starting...")
                st.markdown(f"[🔗 Open AI Browser Automation](http://localhost:8504)")
            
            if st.button("🧠 Launch Central Nervous System", type="primary"):
                self.ensure_service_running('central_nervous_system')
                st.success("Central Nervous System is starting...")
                st.markdown(f"[🔗 Open Central System](http://localhost:8507)")
        
        with col2:
            st.subheader("📋 Service URLs")
            
            for service_id, service in self.services.items():
                status_icon = "🟢" if service['status'] == 'running' else "🔴"
                st.write(f"{status_icon} **{service['name']}**")
                st.write(f"   ↳ {service['url']}")
                st.write("")
        
        # One-click full platform launch
        st.divider()
        st.subheader("🚀 Full Platform Launch")
        
        if st.button("🌟 Launch Complete SuperMega AI Platform", type="primary"):
            with st.spinner("Starting all services..."):
                self.start_all_services()
                time.sleep(5)  # Give services time to start
                self.update_all_statuses()
            
            st.success("🎉 SuperMega AI Platform is launching!")
            
            # Show launch status
            for service_id, service in self.services.items():
                if service['status'] == 'running':
                    st.success(f"✅ {service['name']} - [Open]({service['url']})")
                else:
                    st.warning(f"⚠️ {service['name']} - Starting...")
    
    def start_service(self, service_id: str):
        """Start a specific service"""
        service = self.services[service_id]
        try:
            # Use PowerShell to start service in background
            cmd = f'Start-Process powershell -ArgumentList "-Command", "python -m streamlit run {service["file"]} --server.port={service["port"]}" -WindowStyle Hidden'
            subprocess.Popen(['powershell', '-Command', cmd], shell=True)
            
            self.log_message(f"Starting {service['name']} on port {service['port']}", 'info')
            
        except Exception as e:
            self.log_message(f"Failed to start {service['name']}: {str(e)}", 'error')
    
    def stop_service(self, service_id: str):
        """Stop a specific service"""
        service = self.services[service_id]
        try:
            # Find and kill processes on the specific port
            cmd = f'Get-NetTCPConnection -LocalPort {service["port"]} | Select-Object -ExpandProperty OwningProcess | ForEach-Object {{ Stop-Process -Id $_ -Force }}'
            subprocess.run(['powershell', '-Command', cmd], shell=True)
            
            self.log_message(f"Stopped {service['name']}", 'info')
            
        except Exception as e:
            self.log_message(f"Failed to stop {service['name']}: {str(e)}", 'error')
    
    def start_all_services(self):
        """Start all services"""
        for service_id in self.services:
            if self.services[service_id]['status'] != 'running':
                self.start_service(service_id)
                time.sleep(1)  # Stagger starts
        
        self.log_message("Starting all SuperMega AI services", 'info')
    
    def stop_all_services(self):
        """Stop all services"""
        for service_id in self.services:
            if self.services[service_id]['status'] == 'running':
                self.stop_service(service_id)
        
        self.log_message("Stopped all SuperMega AI services", 'info')
    
    def restart_all_services(self):
        """Restart all services"""
        self.stop_all_services()
        time.sleep(3)
        self.start_all_services()
        
        self.log_message("Restarted all SuperMega AI services", 'info')
    
    def ensure_service_running(self, service_id: str):
        """Ensure a service is running"""
        if self.check_service_status(service_id) != 'running':
            self.start_service(service_id)
    
    def export_configuration(self) -> Dict[str, Any]:
        """Export current configuration"""
        config = {
            'services': self.services,
            'export_time': datetime.now().isoformat(),
            'platform_version': '1.0.0'
        }
        return config
    
    def log_message(self, message: str, level: str = 'info'):
        """Add a log message"""
        log_entry = {
            'timestamp': datetime.now(),
            'message': message,
            'level': level
        }
        st.session_state.service_logs.append(log_entry)
        
        # Keep only last 1000 log entries
        if len(st.session_state.service_logs) > 1000:
            st.session_state.service_logs = st.session_state.service_logs[-1000:]

def main():
    manager = SuperMegaServiceManager()
    manager.render_interface()
    
    # Auto-refresh functionality
    if st.session_state.auto_refresh:
        time.sleep(5)
        st.rerun()

if __name__ == "__main__":
    main()
