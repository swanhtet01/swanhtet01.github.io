"""
Alfred Dashboard v2.0
=====================
The human-AI interface for the HYPER UNICORN architecture.
Provides real-time oversight and control of the AI workforce.

Author: Manus AI
Date: December 2025
"""

import streamlit as st
import requests
import json
import time
from datetime import datetime
import plotly.express as px
import plotly.graph_objects as go
import pandas as pd
import os

# Configuration
MCA_URL = os.getenv("MCA_URL", "http://localhost:8080")
BANGKOK_NODE_IP = os.getenv("BANGKOK_NODE_IP", "100.113.30.52")

# Page config
st.set_page_config(
    page_title="Alfred Dashboard | HYPER UNICORN",
    page_icon="🦄",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom CSS
st.markdown("""
<style>
    .main-header {
        font-size: 2.5rem;
        font-weight: 700;
        background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        margin-bottom: 0;
    }
    .sub-header {
        font-size: 1rem;
        color: #666;
        margin-top: 0;
    }
    .metric-card {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        padding: 1.5rem;
        border-radius: 1rem;
        color: white;
    }
    .agent-card {
        background: #f8f9fa;
        padding: 1rem;
        border-radius: 0.5rem;
        border-left: 4px solid #667eea;
        margin-bottom: 0.5rem;
    }
    .status-online {
        color: #28a745;
        font-weight: bold;
    }
    .status-offline {
        color: #dc3545;
        font-weight: bold;
    }
    .task-success {
        background: #d4edda;
        padding: 0.5rem;
        border-radius: 0.25rem;
    }
    .task-failed {
        background: #f8d7da;
        padding: 0.5rem;
        border-radius: 0.25rem;
    }
</style>
""", unsafe_allow_html=True)


# ============================================================================
# Helper Functions
# ============================================================================

def get_mca_status():
    """Get status from MCA."""
    try:
        response = requests.get(f"{MCA_URL}/status", timeout=5)
        if response.status_code == 200:
            return response.json()
    except:
        pass
    return None


def get_agents():
    """Get agent list from MCA."""
    try:
        response = requests.get(f"{MCA_URL}/agents", timeout=5)
        if response.status_code == 200:
            return response.json()
    except:
        pass
    return {}


def submit_goal(goal: str, priority: str = "normal"):
    """Submit a goal to MCA."""
    try:
        response = requests.post(
            f"{MCA_URL}/goal",
            json={"goal": goal, "priority": priority},
            timeout=300  # 5 minute timeout for complex tasks
        )
        if response.status_code == 200:
            return response.json()
    except Exception as e:
        return {"success": False, "error": str(e)}
    return {"success": False, "error": "Unknown error"}


def get_active_tasks():
    """Get active tasks from MCA."""
    try:
        response = requests.get(f"{MCA_URL}/tasks/active", timeout=5)
        if response.status_code == 200:
            return response.json()
    except:
        pass
    return {}


def get_completed_tasks(limit: int = 10):
    """Get completed tasks from MCA."""
    try:
        response = requests.get(f"{MCA_URL}/tasks/completed?limit={limit}", timeout=5)
        if response.status_code == 200:
            return response.json()
    except:
        pass
    return []


# ============================================================================
# Sidebar
# ============================================================================

with st.sidebar:
    st.markdown("### 🦄 HYPER UNICORN")
    st.markdown("##### SuperMega.dev Agent OS")
    st.divider()
    
    # System Status
    st.markdown("### System Status")
    
    status = get_mca_status()
    if status:
        st.markdown('<span class="status-online">● MCA Online</span>', unsafe_allow_html=True)
        
        col1, col2 = st.columns(2)
        with col1:
            st.metric("Active Tasks", status.get("active_tasks", 0))
        with col2:
            st.metric("Completed", status.get("completed_tasks", 0))
    else:
        st.markdown('<span class="status-offline">● MCA Offline</span>', unsafe_allow_html=True)
        st.warning("Cannot connect to Master Control Agent")
    
    st.divider()
    
    # Bangkok Node Status
    st.markdown("### Bangkok Node")
    st.text(f"IP: {BANGKOK_NODE_IP}")
    
    # Quick Actions
    st.divider()
    st.markdown("### Quick Actions")
    
    if st.button("🔄 Refresh Status"):
        st.rerun()
    
    if st.button("📊 View Analytics"):
        st.session_state.page = "analytics"
    
    if st.button("🤖 Manage Agents"):
        st.session_state.page = "agents"


# ============================================================================
# Main Content
# ============================================================================

# Header
st.markdown('<h1 class="main-header">Alfred Dashboard</h1>', unsafe_allow_html=True)
st.markdown('<p class="sub-header">Command Center for Your AI Workforce</p>', unsafe_allow_html=True)

# Tabs
tab1, tab2, tab3, tab4 = st.tabs(["🎯 Command Center", "🤖 Agent Workforce", "📊 Analytics", "⚙️ Settings"])

# ============================================================================
# Tab 1: Command Center
# ============================================================================

with tab1:
    st.markdown("### Submit a Goal")
    st.markdown("Enter a high-level goal and the AI workforce will plan and execute it.")
    
    col1, col2 = st.columns([4, 1])
    
    with col1:
        goal_input = st.text_area(
            "Goal",
            placeholder="Example: Research the top 5 AI agent frameworks and create a comparison report",
            height=100,
            label_visibility="collapsed"
        )
    
    with col2:
        priority = st.selectbox(
            "Priority",
            ["normal", "low", "high", "critical"],
            index=0
        )
        
        submit_button = st.button("🚀 Execute", type="primary", use_container_width=True)
    
    if submit_button and goal_input:
        with st.spinner("Processing goal..."):
            result = submit_goal(goal_input, priority)
            
            if result.get("success"):
                st.success("Goal completed successfully!")
                
                task = result.get("task", {})
                
                # Show subtasks
                st.markdown("#### Execution Summary")
                
                subtasks = task.get("subtasks", [])
                for i, subtask in enumerate(subtasks):
                    status_icon = "✅" if subtask.get("status") == "completed" else "❌"
                    with st.expander(f"{status_icon} Subtask {i+1}: {subtask.get('goal', 'Unknown')[:50]}..."):
                        st.markdown(f"**Agent:** {subtask.get('assigned_agent', 'Auto')}")
                        st.markdown(f"**Status:** {subtask.get('status', 'Unknown')}")
                        if subtask.get("result"):
                            st.markdown("**Result:**")
                            st.markdown(subtask.get("result", "")[:2000])
                        if subtask.get("error"):
                            st.error(subtask.get("error"))
            else:
                st.error(f"Failed: {result.get('error', 'Unknown error')}")
    
    st.divider()
    
    # Active Tasks
    st.markdown("### Active Tasks")
    
    active_tasks = get_active_tasks()
    if active_tasks:
        for task_id, task in active_tasks.items():
            with st.container():
                col1, col2, col3 = st.columns([3, 1, 1])
                with col1:
                    st.markdown(f"**{task.get('goal', 'Unknown')[:60]}...**")
                with col2:
                    st.markdown(f"Agent: `{task.get('assigned_agent', 'Auto')}`")
                with col3:
                    st.markdown(f"Status: `{task.get('status', 'Unknown')}`")
    else:
        st.info("No active tasks")
    
    st.divider()
    
    # Recent Completed Tasks
    st.markdown("### Recent Completed Tasks")
    
    completed_tasks = get_completed_tasks(5)
    if completed_tasks:
        for task in completed_tasks:
            status_class = "task-success" if task.get("status") == "completed" else "task-failed"
            st.markdown(f"""
            <div class="{status_class}">
                <strong>{task.get('goal', 'Unknown')[:60]}...</strong><br>
                <small>Completed: {task.get('completed_at', 'Unknown')}</small>
            </div>
            """, unsafe_allow_html=True)
    else:
        st.info("No completed tasks yet")


# ============================================================================
# Tab 2: Agent Workforce
# ============================================================================

with tab2:
    st.markdown("### Agent Constellation")
    st.markdown("Your AI workforce, ready to execute any task.")
    
    agents = get_agents()
    
    if agents:
        cols = st.columns(3)
        
        for i, (agent_id, agent) in enumerate(agents.items()):
            with cols[i % 3]:
                availability = "🟢 Available" if agent.get("available", False) else "🔴 Busy"
                
                st.markdown(f"""
                <div class="agent-card">
                    <h4>{agent.get('name', agent_id)}</h4>
                    <p><strong>Role:</strong> {agent.get('role', 'Unknown')}</p>
                    <p><strong>Status:</strong> {availability}</p>
                    <p><strong>Capabilities:</strong></p>
                    <small>{', '.join(agent.get('capabilities', [])[:3])}</small>
                </div>
                """, unsafe_allow_html=True)
    else:
        st.warning("Could not load agent information")
    
    st.divider()
    
    # Agent Performance
    st.markdown("### Agent Performance")
    
    if status:
        agent_data = status.get("agents", {})
        if agent_data:
            df = pd.DataFrame([
                {
                    "Agent": data.get("name", agent_id),
                    "Current Tasks": data.get("current_tasks", 0),
                    "Performance": data.get("performance", 1.0)
                }
                for agent_id, data in agent_data.items()
            ])
            
            fig = px.bar(
                df,
                x="Agent",
                y="Performance",
                color="Performance",
                color_continuous_scale="Viridis"
            )
            fig.update_layout(showlegend=False)
            st.plotly_chart(fig, use_container_width=True)


# ============================================================================
# Tab 3: Analytics
# ============================================================================

with tab3:
    st.markdown("### System Analytics")
    
    if status:
        # Intelligence Stats
        intel_stats = status.get("intelligence_stats", {})
        
        col1, col2, col3, col4 = st.columns(4)
        
        with col1:
            st.metric("Total API Calls", intel_stats.get("total_calls", 0))
        with col2:
            st.metric("Total Cost", f"${intel_stats.get('total_cost', 0):.4f}")
        with col3:
            st.metric("Avg Latency", f"{intel_stats.get('avg_latency_ms', 0):.0f}ms")
        with col4:
            st.metric("Completed Tasks", status.get("completed_tasks", 0))
        
        st.divider()
        
        # Model Usage
        st.markdown("### Model Usage")
        
        calls_by_model = intel_stats.get("calls_by_model", {})
        if calls_by_model:
            df = pd.DataFrame([
                {"Model": model, "Calls": calls}
                for model, calls in calls_by_model.items()
            ])
            
            fig = px.pie(df, values="Calls", names="Model", title="API Calls by Model")
            st.plotly_chart(fig, use_container_width=True)
        
        # Task Types
        st.markdown("### Task Distribution")
        
        calls_by_task = intel_stats.get("calls_by_task_type", {})
        if calls_by_task:
            df = pd.DataFrame([
                {"Task Type": task, "Count": count}
                for task, count in calls_by_task.items()
            ])
            
            fig = px.bar(df, x="Task Type", y="Count", color="Task Type")
            st.plotly_chart(fig, use_container_width=True)
    else:
        st.warning("Analytics unavailable - MCA offline")


# ============================================================================
# Tab 4: Settings
# ============================================================================

with tab4:
    st.markdown("### System Configuration")
    
    col1, col2 = st.columns(2)
    
    with col1:
        st.markdown("#### MCA Connection")
        new_mca_url = st.text_input("MCA URL", value=MCA_URL)
        
        st.markdown("#### Bangkok Node")
        new_bangkok_ip = st.text_input("Bangkok Node IP", value=BANGKOK_NODE_IP)
    
    with col2:
        st.markdown("#### API Keys")
        st.text_input("Gemini API Key", type="password", placeholder="sk-...")
        st.text_input("Anthropic API Key", type="password", placeholder="sk-ant-...")
        st.text_input("OpenAI API Key", type="password", placeholder="sk-...")
    
    st.divider()
    
    st.markdown("#### System Info")
    st.json({
        "version": "2.0.0",
        "architecture": "HYPER UNICORN",
        "mca_url": MCA_URL,
        "bangkok_node": BANGKOK_NODE_IP,
        "timestamp": datetime.now().isoformat()
    })
    
    if st.button("💾 Save Configuration"):
        st.success("Configuration saved!")


# ============================================================================
# Footer
# ============================================================================

st.divider()
st.markdown("""
<div style="text-align: center; color: #666; font-size: 0.8rem;">
    <p>HYPER UNICORN v2.0 | SuperMega.dev | Powered by Manus AI</p>
    <p>Bangkok Node: {bangkok_ip} | Last Updated: {timestamp}</p>
</div>
""".format(
    bangkok_ip=BANGKOK_NODE_IP,
    timestamp=datetime.now().strftime("%Y-%m-%d %H:%M:%S")
), unsafe_allow_html=True)
