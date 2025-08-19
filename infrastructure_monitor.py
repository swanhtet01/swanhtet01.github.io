#!/usr/bin/env python3
"""
📊 SUPERMEGA INFRASTRUCTURE MONITOR
==================================
Real-time monitoring and management dashboard for AWS infrastructure
"""

import streamlit as st
import boto3
import psutil
import docker
import subprocess
import time
import json
import pandas as pd
import plotly.graph_objects as go
import plotly.express as px
from datetime import datetime, timedelta
from typing import Dict, List, Any
import asyncio

class SuperMegaInfrastructureMonitor:
    """Comprehensive infrastructure monitoring and management"""
    
    def __init__(self):
        self.aws_session = None
        self.docker_client = None
        self.services = [
            {"name": "Browser Automation", "port": 8504, "path": "simple_browser_automation.py"},
            {"name": "Media Studio", "port": 8505, "path": "ai_media_studio.py"},
            {"name": "Voice Studio", "port": 8506, "path": "ai_voice_studio.py"},
            {"name": "CAD Studio", "port": 8508, "path": "ai_cad_studio.py"},
            {"name": "Text Studio", "port": 8509, "path": "ai_text_studio.py"},
            {"name": "Video Studio Pro", "port": 8510, "path": "ai_video_studio_pro.py"},
            {"name": "Autonomous Agents", "port": 8511, "path": "autonomous_agents_v3.py"},
            {"name": "Next-Gen Platform", "port": 8512, "path": "next_gen_ai_platform.py"}
        ]
        
        self.initialize_clients()
    
    def initialize_clients(self):
        """Initialize AWS and Docker clients"""
        try:
            # AWS client
            self.aws_session = boto3.Session()
            
            # Docker client
            self.docker_client = docker.from_env()
            
        except Exception as e:
            st.error(f"Failed to initialize clients: {str(e)}")
    
    def get_system_metrics(self) -> Dict[str, Any]:
        """Get current system metrics"""
        try:
            # CPU metrics
            cpu_percent = psutil.cpu_percent(interval=1)
            cpu_count = psutil.cpu_count()
            
            # Memory metrics
            memory = psutil.virtual_memory()
            memory_percent = memory.percent
            memory_used_gb = memory.used / (1024**3)
            memory_total_gb = memory.total / (1024**3)
            
            # Disk metrics
            disk = psutil.disk_usage('/')
            disk_percent = (disk.used / disk.total) * 100
            disk_used_gb = disk.used / (1024**3)
            disk_total_gb = disk.total / (1024**3)
            
            # Network metrics
            network = psutil.net_io_counters()
            
            return {
                "cpu": {
                    "percent": cpu_percent,
                    "count": cpu_count
                },
                "memory": {
                    "percent": memory_percent,
                    "used_gb": memory_used_gb,
                    "total_gb": memory_total_gb
                },
                "disk": {
                    "percent": disk_percent,
                    "used_gb": disk_used_gb,
                    "total_gb": disk_total_gb
                },
                "network": {
                    "bytes_sent": network.bytes_sent,
                    "bytes_recv": network.bytes_recv
                }
            }
        except Exception as e:
            st.error(f"Failed to get system metrics: {str(e)}")
            return {}
    
    def get_service_status(self) -> List[Dict[str, Any]]:
        """Check status of all SuperMega services"""
        service_statuses = []
        
        for service in self.services:
            try:
                import requests
                
                # Check if service is responding
                response = requests.get(
                    f"http://localhost:{service['port']}",
                    timeout=5
                )
                
                status = {
                    "name": service["name"],
                    "port": service["port"],
                    "status": "✅ Running" if response.status_code == 200 else "⚠️ Error",
                    "response_time": response.elapsed.total_seconds(),
                    "last_checked": datetime.now().strftime("%H:%M:%S")
                }
                
            except Exception as e:
                status = {
                    "name": service["name"],
                    "port": service["port"], 
                    "status": "❌ Offline",
                    "response_time": None,
                    "last_checked": datetime.now().strftime("%H:%M:%S"),
                    "error": str(e)
                }
            
            service_statuses.append(status)
        
        return service_statuses
    
    def get_docker_containers(self) -> List[Dict[str, Any]]:
        """Get Docker container information"""
        if not self.docker_client:
            return []
        
        containers = []
        
        try:
            for container in self.docker_client.containers.list(all=True):
                container_info = {
                    "name": container.name,
                    "status": container.status,
                    "image": container.image.tags[0] if container.image.tags else "unknown",
                    "ports": container.ports,
                    "created": container.attrs["Created"][:19],
                    "cpu_usage": self.get_container_cpu_usage(container),
                    "memory_usage": self.get_container_memory_usage(container)
                }
                containers.append(container_info)
                
        except Exception as e:
            st.error(f"Failed to get Docker containers: {str(e)}")
        
        return containers
    
    def get_container_cpu_usage(self, container) -> float:
        """Get CPU usage for a Docker container"""
        try:
            stats = container.stats(stream=False)
            cpu_delta = stats["cpu_stats"]["cpu_usage"]["total_usage"] - \
                       stats["precpu_stats"]["cpu_usage"]["total_usage"]
            system_cpu_delta = stats["cpu_stats"]["system_cpu_usage"] - \
                              stats["precpu_stats"]["system_cpu_usage"]
            
            if system_cpu_delta > 0:
                cpu_usage = (cpu_delta / system_cpu_delta) * 100
                return round(cpu_usage, 2)
            
        except Exception:
            pass
        
        return 0.0
    
    def get_container_memory_usage(self, container) -> Dict[str, float]:
        """Get memory usage for a Docker container"""
        try:
            stats = container.stats(stream=False)
            memory_usage = stats["memory_stats"]["usage"] / (1024**2)  # MB
            memory_limit = stats["memory_stats"]["limit"] / (1024**2)  # MB
            memory_percent = (memory_usage / memory_limit) * 100
            
            return {
                "usage_mb": round(memory_usage, 2),
                "limit_mb": round(memory_limit, 2),
                "percent": round(memory_percent, 2)
            }
            
        except Exception:
            return {"usage_mb": 0, "limit_mb": 0, "percent": 0}
    
    def get_aws_resources(self) -> Dict[str, Any]:
        """Get AWS resource information"""
        if not self.aws_session:
            return {}
        
        resources = {
            "ec2_instances": [],
            "load_balancers": [],
            "auto_scaling_groups": [],
            "cloudformation_stacks": []
        }
        
        try:
            # EC2 instances
            ec2 = self.aws_session.client('ec2')
            instances = ec2.describe_instances()
            
            for reservation in instances['Reservations']:
                for instance in reservation['Instances']:
                    instance_info = {
                        "id": instance['InstanceId'],
                        "type": instance['InstanceType'],
                        "state": instance['State']['Name'],
                        "public_ip": instance.get('PublicIpAddress', 'N/A'),
                        "private_ip": instance.get('PrivateIpAddress', 'N/A'),
                        "launch_time": instance.get('LaunchTime', 'N/A')
                    }
                    resources["ec2_instances"].append(instance_info)
            
            # Load Balancers
            elbv2 = self.aws_session.client('elbv2')
            load_balancers = elbv2.describe_load_balancers()
            
            for lb in load_balancers['LoadBalancers']:
                lb_info = {
                    "name": lb['LoadBalancerName'],
                    "type": lb['Type'],
                    "state": lb['State']['Code'],
                    "dns_name": lb['DNSName'],
                    "scheme": lb['Scheme']
                }
                resources["load_balancers"].append(lb_info)
            
            # Auto Scaling Groups
            autoscaling = self.aws_session.client('autoscaling')
            asgs = autoscaling.describe_auto_scaling_groups()
            
            for asg in asgs['AutoScalingGroups']:
                asg_info = {
                    "name": asg['AutoScalingGroupName'],
                    "desired_capacity": asg['DesiredCapacity'],
                    "min_size": asg['MinSize'],
                    "max_size": asg['MaxSize'],
                    "instances": len(asg['Instances']),
                    "health_check_type": asg['HealthCheckType']
                }
                resources["auto_scaling_groups"].append(asg_info)
            
            # CloudFormation Stacks
            cf = self.aws_session.client('cloudformation')
            stacks = cf.describe_stacks()
            
            for stack in stacks['Stacks']:
                stack_info = {
                    "name": stack['StackName'],
                    "status": stack['StackStatus'],
                    "creation_time": stack['CreationTime'],
                    "description": stack.get('Description', 'N/A')
                }
                resources["cloudformation_stacks"].append(stack_info)
                
        except Exception as e:
            st.error(f"Failed to get AWS resources: {str(e)}")
        
        return resources
    
    def start_service(self, service_name: str, port: int, path: str):
        """Start a SuperMega service"""
        try:
            cmd = [
                "streamlit", "run", path,
                "--server.port", str(port),
                "--server.address", "0.0.0.0"
            ]
            
            process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            st.success(f"Started {service_name} on port {port}")
            
        except Exception as e:
            st.error(f"Failed to start {service_name}: {str(e)}")
    
    def stop_service(self, port: int):
        """Stop a service running on specified port"""
        try:
            # Find process using the port
            cmd = f"netstat -ano | findstr :{port}"
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            
            if result.stdout:
                lines = result.stdout.strip().split('\n')
                for line in lines:
                    if 'LISTENING' in line:
                        pid = line.split()[-1]
                        subprocess.run(f"taskkill /PID {pid} /F", shell=True)
                        st.success(f"Stopped service on port {port}")
                        break
            else:
                st.warning(f"No service found running on port {port}")
                
        except Exception as e:
            st.error(f"Failed to stop service: {str(e)}")
    
    def deploy_to_aws(self):
        """Deploy infrastructure to AWS"""
        try:
            st.info("Starting AWS deployment...")
            
            # Run the deployment script
            result = subprocess.run(
                ["python", "aws_deployment_manager.py", "--deploy"],
                capture_output=True,
                text=True
            )
            
            if result.returncode == 0:
                st.success("AWS deployment successful!")
                st.code(result.stdout)
            else:
                st.error("AWS deployment failed!")
                st.code(result.stderr)
                
        except Exception as e:
            st.error(f"Deployment failed: {str(e)}")
    
    def create_visualizations(self, metrics: Dict[str, Any]):
        """Create monitoring visualizations"""
        
        # System metrics gauges
        col1, col2, col3 = st.columns(3)
        
        with col1:
            fig_cpu = go.Figure(go.Indicator(
                mode = "gauge+number",
                value = metrics.get("cpu", {}).get("percent", 0),
                domain = {'x': [0, 1], 'y': [0, 1]},
                title = {'text': "CPU Usage (%)"},
                gauge = {
                    'axis': {'range': [None, 100]},
                    'bar': {'color': "darkblue"},
                    'steps': [
                        {'range': [0, 50], 'color': "lightgray"},
                        {'range': [50, 80], 'color': "yellow"},
                        {'range': [80, 100], 'color': "red"}
                    ],
                    'threshold': {
                        'line': {'color': "red", 'width': 4},
                        'thickness': 0.75,
                        'value': 90
                    }
                }
            ))
            fig_cpu.update_layout(height=300)
            st.plotly_chart(fig_cpu, use_container_width=True)
        
        with col2:
            memory_percent = metrics.get("memory", {}).get("percent", 0)
            fig_memory = go.Figure(go.Indicator(
                mode = "gauge+number",
                value = memory_percent,
                domain = {'x': [0, 1], 'y': [0, 1]},
                title = {'text': "Memory Usage (%)"},
                gauge = {
                    'axis': {'range': [None, 100]},
                    'bar': {'color': "darkgreen"},
                    'steps': [
                        {'range': [0, 50], 'color': "lightgray"},
                        {'range': [50, 80], 'color': "yellow"},
                        {'range': [80, 100], 'color': "red"}
                    ],
                    'threshold': {
                        'line': {'color': "red", 'width': 4},
                        'thickness': 0.75,
                        'value': 90
                    }
                }
            ))
            fig_memory.update_layout(height=300)
            st.plotly_chart(fig_memory, use_container_width=True)
        
        with col3:
            disk_percent = metrics.get("disk", {}).get("percent", 0)
            fig_disk = go.Figure(go.Indicator(
                mode = "gauge+number",
                value = disk_percent,
                domain = {'x': [0, 1], 'y': [0, 1]},
                title = {'text': "Disk Usage (%)"},
                gauge = {
                    'axis': {'range': [None, 100]},
                    'bar': {'color': "darkorange"},
                    'steps': [
                        {'range': [0, 50], 'color': "lightgray"},
                        {'range': [50, 80], 'color': "yellow"},
                        {'range': [80, 100], 'color': "red"}
                    ],
                    'threshold': {
                        'line': {'color': "red", 'width': 4},
                        'thickness': 0.75,
                        'value': 90
                    }
                }
            ))
            fig_disk.update_layout(height=300)
            st.plotly_chart(fig_disk, use_container_width=True)

def main():
    """Main monitoring dashboard"""
    st.set_page_config(
        page_title="SuperMega Infrastructure Monitor",
        page_icon="📊",
        layout="wide"
    )
    
    st.title("📊 SuperMega Infrastructure Monitor")
    st.markdown("Real-time monitoring and management of your AI platform infrastructure")
    
    # Initialize monitor
    monitor = SuperMegaInfrastructureMonitor()
    
    # Sidebar controls
    st.sidebar.title("🎛️ Controls")
    
    if st.sidebar.button("🔄 Refresh Data"):
        st.rerun()
    
    auto_refresh = st.sidebar.checkbox("Auto-refresh (30s)", value=True)
    
    if st.sidebar.button("🚀 Deploy to AWS"):
        monitor.deploy_to_aws()
    
    # Main dashboard
    tab1, tab2, tab3, tab4, tab5 = st.tabs([
        "📊 System Metrics", 
        "🔧 Services", 
        "🐳 Docker", 
        "☁️ AWS Resources",
        "⚙️ Management"
    ])
    
    with tab1:
        st.header("System Performance Metrics")
        
        # Get current metrics
        metrics = monitor.get_system_metrics()
        
        if metrics:
            # Create visualizations
            monitor.create_visualizations(metrics)
            
            # Detailed metrics
            st.subheader("📈 Detailed Metrics")
            
            col1, col2 = st.columns(2)
            
            with col1:
                st.metric(
                    "CPU Cores",
                    metrics.get("cpu", {}).get("count", 0)
                )
                st.metric(
                    "Memory Used",
                    f"{metrics.get('memory', {}).get('used_gb', 0):.1f} GB",
                    f"of {metrics.get('memory', {}).get('total_gb', 0):.1f} GB"
                )
            
            with col2:
                st.metric(
                    "Disk Used",
                    f"{metrics.get('disk', {}).get('used_gb', 0):.1f} GB",
                    f"of {metrics.get('disk', {}).get('total_gb', 0):.1f} GB"
                )
                network = metrics.get("network", {})
                st.metric(
                    "Network I/O",
                    f"↓ {network.get('bytes_recv', 0)/1024/1024:.1f} MB / ↑ {network.get('bytes_sent', 0)/1024/1024:.1f} MB"
                )
    
    with tab2:
        st.header("🔧 SuperMega Services Status")
        
        # Get service status
        service_statuses = monitor.get_service_status()
        
        if service_statuses:
            # Display services in a table
            df = pd.DataFrame(service_statuses)
            st.dataframe(df, use_container_width=True)
            
            # Service management
            st.subheader("Service Management")
            
            col1, col2 = st.columns(2)
            
            with col1:
                st.write("**Start Service:**")
                service_to_start = st.selectbox(
                    "Select service to start:",
                    [(s["name"], s["port"], s["path"]) for s in monitor.services]
                )
                
                if st.button("Start Service"):
                    name, port, path = service_to_start
                    monitor.start_service(name, port, path)
            
            with col2:
                st.write("**Stop Service:**")
                port_to_stop = st.selectbox(
                    "Select port to stop:",
                    [s["port"] for s in monitor.services]
                )
                
                if st.button("Stop Service"):
                    monitor.stop_service(port_to_stop)
    
    with tab3:
        st.header("🐳 Docker Containers")
        
        # Get Docker containers
        containers = monitor.get_docker_containers()
        
        if containers:
            for container in containers:
                with st.expander(f"📦 {container['name']} - {container['status']}"):
                    col1, col2 = st.columns(2)
                    
                    with col1:
                        st.write(f"**Image:** {container['image']}")
                        st.write(f"**Status:** {container['status']}")
                        st.write(f"**Created:** {container['created']}")
                    
                    with col2:
                        st.write(f"**CPU Usage:** {container['cpu_usage']}%")
                        memory = container['memory_usage']
                        st.write(f"**Memory:** {memory['usage_mb']:.1f}/{memory['limit_mb']:.1f} MB ({memory['percent']:.1f}%)")
                        st.write(f"**Ports:** {container['ports']}")
        else:
            st.info("No Docker containers found or Docker not available.")
    
    with tab4:
        st.header("☁️ AWS Resources")
        
        # Get AWS resources
        aws_resources = monitor.get_aws_resources()
        
        if aws_resources:
            # EC2 Instances
            if aws_resources.get("ec2_instances"):
                st.subheader("🖥️ EC2 Instances")
                df_ec2 = pd.DataFrame(aws_resources["ec2_instances"])
                st.dataframe(df_ec2, use_container_width=True)
            
            # Load Balancers
            if aws_resources.get("load_balancers"):
                st.subheader("⚖️ Load Balancers")
                df_lb = pd.DataFrame(aws_resources["load_balancers"])
                st.dataframe(df_lb, use_container_width=True)
            
            # Auto Scaling Groups
            if aws_resources.get("auto_scaling_groups"):
                st.subheader("📈 Auto Scaling Groups")
                df_asg = pd.DataFrame(aws_resources["auto_scaling_groups"])
                st.dataframe(df_asg, use_container_width=True)
            
            # CloudFormation Stacks
            if aws_resources.get("cloudformation_stacks"):
                st.subheader("📋 CloudFormation Stacks")
                df_cf = pd.DataFrame(aws_resources["cloudformation_stacks"])
                st.dataframe(df_cf, use_container_width=True)
        else:
            st.info("No AWS resources found or AWS credentials not configured.")
    
    with tab5:
        st.header("⚙️ Infrastructure Management")
        
        col1, col2 = st.columns(2)
        
        with col1:
            st.subheader("🚀 Deployment Actions")
            
            if st.button("Deploy CloudFormation Stack", type="primary"):
                monitor.deploy_to_aws()
            
            if st.button("Update Docker Containers"):
                st.info("Updating Docker containers...")
                # Add container update logic
            
            if st.button("Restart All Services"):
                st.info("Restarting all services...")
                # Add service restart logic
        
        with col2:
            st.subheader("📊 Quick Stats")
            
            # System uptime
            try:
                import platform
                st.metric("System", platform.system())
                
                boot_time = psutil.boot_time()
                uptime = datetime.now() - datetime.fromtimestamp(boot_time)
                st.metric("Uptime", f"{uptime.days} days")
                
            except Exception as e:
                st.error(f"Failed to get system stats: {str(e)}")
    
    # Auto-refresh
    if auto_refresh:
        time.sleep(30)
        st.rerun()

if __name__ == "__main__":
    main()
