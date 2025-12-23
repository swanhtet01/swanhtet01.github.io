"""
JARVIS Alfred Dashboard v2.0
============================
The central control interface for the SuperMega.dev AI Agent Infrastructure.
Designed to run on AWS (24/7 Operations Center) and accessed via Tailscale.

Features:
- System health monitoring (Bangkok Node + AWS)
- Agent fleet management
- Task queue visualization
- Operating mode control
- Real-time logs and metrics
"""

import streamlit as st
import requests
import json
import os
from datetime import datetime
from typing import Dict, List, Optional
import time

# Configuration
st.set_page_config(
    page_title="JARVIS - Alfred Dashboard",
    page_icon="🤖",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Environment Variables
BANGKOK_NODE_IP = os.getenv("BANGKOK_NODE_IP", "100.113.30.52")
AWS_MCA_URL = os.getenv("AWS_MCA_URL", "http://localhost:8080")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

# Custom CSS
st.markdown("""
<style>
    .main-header {
        font-size: 2.5rem;
        font-weight: bold;
        background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        margin-bottom: 1rem;
    }
    .status-card {
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border-radius: 10px;
        padding: 1.5rem;
        margin: 0.5rem 0;
        border: 1px solid #0f3460;
    }
    .metric-value {
        font-size: 2rem;
        font-weight: bold;
        color: #00d4ff;
    }
    .status-online { color: #00ff88; }
    .status-offline { color: #ff4757; }
    .status-busy { color: #ffa502; }
    .agent-card {
        background: #1e1e2e;
        border-radius: 8px;
        padding: 1rem;
        margin: 0.5rem 0;
        border-left: 4px solid #667eea;
    }
</style>
""", unsafe_allow_html=True)


class SystemMonitor:
    """Monitors system health across all nodes."""
    
    @staticmethod
    def get_bangkok_node_status() -> Dict:
        """Get status from Bangkok Node via Tailscale."""
        try:
            # In production, this would ping the actual Bangkok Node
            # For now, return simulated data
            return {
                "online": True,
                "ip": BANGKOK_NODE_IP,
                "cpu_usage": 23.5,
                "gpu_usage": 15.2,
                "ram_usage": 45.8,
                "gpu_vram": 2.1,  # GB used out of 8GB
                "operating_mode": "autonomous",
                "active_processes": ["Agent S2", "Docker", "Tailscale"],
                "moonlight_active": False,
                "last_heartbeat": datetime.now().isoformat()
            }
        except Exception as e:
            return {"online": False, "error": str(e)}
    
    @staticmethod
    def get_aws_status() -> Dict:
        """Get status from AWS Operations Center."""
        try:
            return {
                "online": True,
                "mca_status": "running",
                "active_agents": 9,
                "tasks_queued": 12,
                "tasks_completed_today": 47,
                "memory_db_size": "2.3 GB",
                "api_calls_today": {
                    "gemini": 234,
                    "claude": 89,
                    "openai": 156
                },
                "uptime": "99.995%"
            }
        except Exception as e:
            return {"online": False, "error": str(e)}


class AgentFleet:
    """Manages the AI agent workforce."""
    
    AGENT_TYPES = [
        {"name": "Research Analyst", "icon": "🔍", "status": "active", "tasks": 5},
        {"name": "Software Developer", "icon": "💻", "status": "active", "tasks": 3},
        {"name": "Content Writer", "icon": "✍️", "status": "idle", "tasks": 0},
        {"name": "Data Analyst", "icon": "📊", "status": "active", "tasks": 2},
        {"name": "Sales Prospector", "icon": "🎯", "status": "active", "tasks": 8},
        {"name": "DevOps Engineer", "icon": "🔧", "status": "idle", "tasks": 0},
        {"name": "Finance Auditor", "icon": "💰", "status": "active", "tasks": 1},
        {"name": "Customer Support", "icon": "🎧", "status": "idle", "tasks": 0},
        {"name": "Computer Use Agent", "icon": "🖥️", "status": "standby", "tasks": 0},
    ]
    
    @classmethod
    def get_agents(cls) -> List[Dict]:
        return cls.AGENT_TYPES
    
    @staticmethod
    def spawn_agent(agent_type: str, task: str) -> Dict:
        """Spawn a new agent instance with a task."""
        return {
            "success": True,
            "agent_id": f"{agent_type.lower().replace(' ', '_')}_{int(time.time())}",
            "task": task,
            "status": "initializing"
        }


class TaskQueue:
    """Manages the task queue for agents."""
    
    SAMPLE_TASKS = [
        {"id": 1, "type": "research", "description": "Find 50 fintech leads in Europe", "priority": "high", "status": "in_progress", "agent": "Sales Prospector"},
        {"id": 2, "type": "code", "description": "Fix authentication bug in API", "priority": "high", "status": "queued", "agent": "Software Developer"},
        {"id": 3, "type": "content", "description": "Write blog post on AI agents", "priority": "medium", "status": "queued", "agent": "Content Writer"},
        {"id": 4, "type": "analysis", "description": "Analyze Q4 sales data", "priority": "medium", "status": "in_progress", "agent": "Data Analyst"},
        {"id": 5, "type": "audit", "description": "Reconcile supplier invoices", "priority": "low", "status": "completed", "agent": "Finance Auditor"},
    ]
    
    @classmethod
    def get_tasks(cls) -> List[Dict]:
        return cls.SAMPLE_TASKS


def render_sidebar():
    """Render the sidebar with navigation and quick actions."""
    with st.sidebar:
        st.markdown("## 🤖 JARVIS Control")
        st.markdown("---")
        
        # Operating Mode Selector
        st.markdown("### Operating Mode")
        mode = st.selectbox(
            "Bangkok Node Mode",
            ["Autonomous", "Hybrid", "Powerhouse (Gaming)"],
            index=0,
            help="Control how the Bangkok Node allocates resources"
        )
        
        if mode == "Powerhouse (Gaming)":
            st.warning("⚠️ Agent tasks will be paused")
        
        st.markdown("---")
        
        # Quick Actions
        st.markdown("### Quick Actions")
        if st.button("🚀 Deploy New Agent", use_container_width=True):
            st.session_state.show_deploy_modal = True
        
        if st.button("📊 Generate Report", use_container_width=True):
            st.info("Generating daily report...")
        
        if st.button("🔄 Sync Memory", use_container_width=True):
            st.success("Memory synced with Qdrant")
        
        st.markdown("---")
        
        # API Status
        st.markdown("### API Connections")
        apis = [
            ("Gemini", bool(GEMINI_API_KEY)),
            ("Claude", bool(ANTHROPIC_API_KEY)),
            ("OpenAI", bool(OPENAI_API_KEY)),
        ]
        for api_name, connected in apis:
            status = "🟢" if connected else "🔴"
            st.markdown(f"{status} {api_name}")


def render_system_health():
    """Render the system health overview."""
    st.markdown('<p class="main-header">🏠 System Health</p>', unsafe_allow_html=True)
    
    col1, col2 = st.columns(2)
    
    # Bangkok Node Status
    with col1:
        st.markdown("### Bangkok Node (Execution Powerhouse)")
        bkk = SystemMonitor.get_bangkok_node_status()
        
        if bkk["online"]:
            st.success(f"🟢 Online - {bkk['ip']}")
            
            metrics_col1, metrics_col2, metrics_col3 = st.columns(3)
            with metrics_col1:
                st.metric("CPU", f"{bkk['cpu_usage']}%")
            with metrics_col2:
                st.metric("GPU", f"{bkk['gpu_usage']}%")
            with metrics_col3:
                st.metric("RAM", f"{bkk['ram_usage']}%")
            
            st.metric("GPU VRAM", f"{bkk['gpu_vram']} / 8 GB")
            st.info(f"Mode: **{bkk['operating_mode'].upper()}**")
            
            if bkk["moonlight_active"]:
                st.warning("🎮 Moonlight session active - Agents paused")
        else:
            st.error("🔴 Offline")
    
    # AWS Status
    with col2:
        st.markdown("### AWS (24/7 Operations Center)")
        aws = SystemMonitor.get_aws_status()
        
        if aws["online"]:
            st.success(f"🟢 Online - MCA {aws['mca_status']}")
            
            metrics_col1, metrics_col2, metrics_col3 = st.columns(3)
            with metrics_col1:
                st.metric("Active Agents", aws["active_agents"])
            with metrics_col2:
                st.metric("Tasks Queued", aws["tasks_queued"])
            with metrics_col3:
                st.metric("Completed Today", aws["tasks_completed_today"])
            
            st.metric("Memory DB", aws["memory_db_size"])
            st.metric("Uptime", aws["uptime"])
        else:
            st.error("🔴 Offline")


def render_agent_fleet():
    """Render the agent fleet overview."""
    st.markdown("---")
    st.markdown('<p class="main-header">👥 Agent Fleet</p>', unsafe_allow_html=True)
    
    agents = AgentFleet.get_agents()
    
    # Create a grid of agent cards
    cols = st.columns(3)
    for idx, agent in enumerate(agents):
        with cols[idx % 3]:
            status_color = {
                "active": "status-online",
                "idle": "status-offline",
                "standby": "status-busy"
            }.get(agent["status"], "")
            
            st.markdown(f"""
            <div class="agent-card">
                <h4>{agent['icon']} {agent['name']}</h4>
                <p class="{status_color}">● {agent['status'].upper()}</p>
                <p>Tasks: {agent['tasks']}</p>
            </div>
            """, unsafe_allow_html=True)


def render_task_queue():
    """Render the task queue."""
    st.markdown("---")
    st.markdown('<p class="main-header">📋 Task Queue</p>', unsafe_allow_html=True)
    
    tasks = TaskQueue.get_tasks()
    
    # Filter options
    col1, col2 = st.columns([1, 3])
    with col1:
        status_filter = st.selectbox("Filter by Status", ["All", "In Progress", "Queued", "Completed"])
    
    # Task table
    for task in tasks:
        if status_filter != "All" and task["status"].replace("_", " ").title() != status_filter:
            continue
        
        priority_emoji = {"high": "🔴", "medium": "🟡", "low": "🟢"}.get(task["priority"], "⚪")
        status_emoji = {"in_progress": "⏳", "queued": "📥", "completed": "✅"}.get(task["status"], "❓")
        
        with st.expander(f"{priority_emoji} {task['description'][:50]}... - {status_emoji} {task['status'].replace('_', ' ').title()}"):
            st.write(f"**Agent:** {task['agent']}")
            st.write(f"**Type:** {task['type']}")
            st.write(f"**Priority:** {task['priority']}")
            
            col1, col2, col3 = st.columns(3)
            with col1:
                if st.button("View Details", key=f"view_{task['id']}"):
                    st.info("Task details would appear here")
            with col2:
                if st.button("Reassign", key=f"reassign_{task['id']}"):
                    st.info("Reassignment modal would appear")
            with col3:
                if st.button("Cancel", key=f"cancel_{task['id']}"):
                    st.warning("Task cancellation requested")


def render_command_center():
    """Render the command input center."""
    st.markdown("---")
    st.markdown('<p class="main-header">🎯 Command Center</p>', unsafe_allow_html=True)
    
    st.markdown("Send high-level goals to your AI workforce:")
    
    goal = st.text_area(
        "Enter your goal",
        placeholder="Example: Find 50 qualified leads in the European fintech sector and create a detailed report with contact information.",
        height=100
    )
    
    col1, col2, col3 = st.columns([1, 1, 2])
    with col1:
        priority = st.selectbox("Priority", ["High", "Medium", "Low"])
    with col2:
        target_agent = st.selectbox("Target Agent", ["Auto-assign", "Research Analyst", "Sales Prospector", "Software Developer"])
    
    if st.button("🚀 Execute Goal", type="primary", use_container_width=True):
        if goal:
            with st.spinner("Analyzing goal and creating task plan..."):
                time.sleep(2)
            st.success("✅ Goal accepted! Task plan created and dispatched to agent fleet.")
            st.json({
                "goal_id": f"GOAL-{int(time.time())}",
                "status": "dispatched",
                "estimated_completion": "2 hours",
                "assigned_agents": ["Sales Prospector", "Research Analyst"],
                "subtasks_created": 5
            })
        else:
            st.error("Please enter a goal")


def main():
    """Main application entry point."""
    render_sidebar()
    
    # Main content
    st.markdown('<p class="main-header">🤖 JARVIS - Alfred Dashboard</p>', unsafe_allow_html=True)
    st.markdown("*SuperMega.dev AI Agent Infrastructure Control Center*")
    
    # Tabs for different views
    tab1, tab2, tab3, tab4 = st.tabs(["📊 Overview", "👥 Agents", "📋 Tasks", "🎯 Command"])
    
    with tab1:
        render_system_health()
    
    with tab2:
        render_agent_fleet()
    
    with tab3:
        render_task_queue()
    
    with tab4:
        render_command_center()
    
    # Footer
    st.markdown("---")
    st.markdown(
        f"*Last updated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | "
        f"Bangkok Node: {BANGKOK_NODE_IP} | "
        f"[Documentation](https://supermega.dev/docs)*"
    )


if __name__ == "__main__":
    main()
