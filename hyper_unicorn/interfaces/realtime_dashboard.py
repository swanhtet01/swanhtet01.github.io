"""
HYPER UNICORN Real-Time Dashboard
==================================
WebSocket-powered live dashboard for agent monitoring.

Features:
- Real-time task updates via WebSocket
- Live agent status monitoring
- Interactive task submission
- System health visualization
- Activity timeline

Author: Manus AI for SuperMega.dev
"""

import streamlit as st
import asyncio
import json
import requests
import websocket
import threading
import time
from datetime import datetime
from typing import Dict, List, Any, Optional
import plotly.graph_objects as go
import plotly.express as px
from collections import deque

# ============================================================================
# Configuration
# ============================================================================

API_BASE_URL = "http://localhost:8080"
WS_URL = "ws://localhost:8080/ws"

# ============================================================================
# Session State Initialization
# ============================================================================

def init_session_state():
    """Initialize session state variables."""
    if "tasks" not in st.session_state:
        st.session_state.tasks = []
    if "agents" not in st.session_state:
        st.session_state.agents = {}
    if "activity_log" not in st.session_state:
        st.session_state.activity_log = deque(maxlen=100)
    if "ws_connected" not in st.session_state:
        st.session_state.ws_connected = False
    if "metrics_history" not in st.session_state:
        st.session_state.metrics_history = {
            "timestamps": deque(maxlen=60),
            "tasks_completed": deque(maxlen=60),
            "tasks_running": deque(maxlen=60),
            "cpu_usage": deque(maxlen=60),
            "memory_usage": deque(maxlen=60)
        }


# ============================================================================
# API Client
# ============================================================================

class APIClient:
    """Client for HYPER UNICORN API."""
    
    def __init__(self, base_url: str = API_BASE_URL):
        self.base_url = base_url
    
    def get_health(self) -> Dict[str, Any]:
        """Get system health."""
        try:
            response = requests.get(f"{self.base_url}/health", timeout=5)
            return response.json()
        except Exception as e:
            return {"status": "error", "error": str(e)}
    
    def get_tasks(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Get all tasks."""
        try:
            response = requests.get(f"{self.base_url}/tasks?limit={limit}", timeout=5)
            return response.json().get("tasks", [])
        except Exception as e:
            return []
    
    def get_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific task."""
        try:
            response = requests.get(f"{self.base_url}/tasks/{task_id}", timeout=5)
            return response.json()
        except Exception as e:
            return None
    
    def create_task(self, goal: str, agent_type: str = "auto", priority: int = 5) -> Dict[str, Any]:
        """Create a new task."""
        try:
            response = requests.post(
                f"{self.base_url}/tasks",
                json={
                    "goal": goal,
                    "agent_type": agent_type,
                    "priority": priority
                },
                timeout=10
            )
            return response.json()
        except Exception as e:
            return {"error": str(e)}
    
    def get_agents(self) -> List[Dict[str, Any]]:
        """Get all agents."""
        try:
            response = requests.get(f"{self.base_url}/agents", timeout=5)
            return response.json().get("agents", [])
        except Exception as e:
            return []
    
    def quick_action(self, action: str, query: str) -> Dict[str, Any]:
        """Execute a quick action."""
        try:
            response = requests.post(
                f"{self.base_url}/quick/{action}",
                params={"query" if action == "research" else "request" if action == "code" else "action" if action == "email" else "topic": query},
                timeout=10
            )
            return response.json()
        except Exception as e:
            return {"error": str(e)}


# ============================================================================
# Dashboard Components
# ============================================================================

def render_header():
    """Render the dashboard header."""
    col1, col2, col3 = st.columns([2, 1, 1])
    
    with col1:
        st.title("🦄 HYPER UNICORN")
        st.caption("Real-Time Agent Command Center")
    
    with col2:
        if st.session_state.ws_connected:
            st.success("🟢 WebSocket Connected")
        else:
            st.warning("🟡 WebSocket Disconnected")
    
    with col3:
        st.metric("Uptime", "Active")


def render_system_health(client: APIClient):
    """Render system health section."""
    st.subheader("📊 System Health")
    
    health = client.get_health()
    
    if health.get("status") == "error":
        st.error(f"API Error: {health.get('error')}")
        return
    
    # Metrics row
    col1, col2, col3, col4, col5 = st.columns(5)
    
    with col1:
        st.metric(
            "Status",
            health.get("status", "unknown").upper(),
            delta="Healthy" if health.get("status") == "healthy" else None
        )
    
    with col2:
        st.metric("Tasks Queued", health.get("tasks_queued", 0))
    
    with col3:
        st.metric("Tasks Running", health.get("tasks_running", 0))
    
    with col4:
        st.metric("Tasks Completed", health.get("tasks_completed", 0))
    
    with col5:
        st.metric(
            "Memory",
            f"{health.get('memory_usage_mb', 0):.1f} MB"
        )
    
    # Update metrics history
    now = datetime.now().strftime("%H:%M:%S")
    st.session_state.metrics_history["timestamps"].append(now)
    st.session_state.metrics_history["tasks_completed"].append(health.get("tasks_completed", 0))
    st.session_state.metrics_history["tasks_running"].append(health.get("tasks_running", 0))
    st.session_state.metrics_history["cpu_usage"].append(health.get("cpu_usage_percent", 0))
    st.session_state.metrics_history["memory_usage"].append(health.get("memory_usage_mb", 0))


def render_agents(client: APIClient):
    """Render agents section."""
    st.subheader("🤖 Agent Fleet")
    
    agents = client.get_agents()
    
    if not agents:
        st.info("No agents registered yet.")
        return
    
    # Agent cards
    cols = st.columns(3)
    
    agent_icons = {
        "research": "🔍",
        "code": "💻",
        "content": "📝",
        "browser": "🌐",
        "financial": "📈",
        "communication": "📧"
    }
    
    for i, agent in enumerate(agents):
        with cols[i % 3]:
            agent_type = agent.get("agent_type", "unknown")
            status = agent.get("status", "unknown")
            
            status_color = {
                "idle": "🟢",
                "busy": "🟡",
                "error": "🔴"
            }.get(status, "⚪")
            
            with st.container():
                st.markdown(f"""
                <div style="
                    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                    border-radius: 10px;
                    padding: 15px;
                    margin: 5px 0;
                    border: 1px solid #0f3460;
                ">
                    <h4 style="margin: 0; color: #e94560;">
                        {agent_icons.get(agent_type, '🤖')} {agent_type.title()} Agent
                    </h4>
                    <p style="margin: 5px 0; color: #a0a0a0;">
                        {status_color} {status.upper()}
                    </p>
                    <p style="margin: 0; font-size: 12px; color: #666;">
                        Tasks: {agent.get('tasks_completed', 0)} completed
                    </p>
                </div>
                """, unsafe_allow_html=True)


def render_task_submission(client: APIClient):
    """Render task submission form."""
    st.subheader("🚀 Submit Task")
    
    with st.form("task_form"):
        goal = st.text_area(
            "Goal / Objective",
            placeholder="Describe what you want the agent to accomplish...",
            height=100
        )
        
        col1, col2, col3 = st.columns(3)
        
        with col1:
            agent_type = st.selectbox(
                "Agent Type",
                ["auto", "research", "code", "content", "browser", "financial", "communication"]
            )
        
        with col2:
            priority = st.slider("Priority", 1, 10, 5)
        
        with col3:
            st.write("")
            st.write("")
            submitted = st.form_submit_button("🚀 Submit Task", use_container_width=True)
        
        if submitted and goal:
            result = client.create_task(goal, agent_type, priority)
            
            if "error" in result:
                st.error(f"Error: {result['error']}")
            else:
                st.success(f"Task created: {result.get('task_id')}")
                st.session_state.activity_log.appendleft({
                    "time": datetime.now().strftime("%H:%M:%S"),
                    "event": "task_created",
                    "task_id": result.get("task_id"),
                    "goal": goal[:50]
                })


def render_quick_actions(client: APIClient):
    """Render quick action buttons."""
    st.subheader("⚡ Quick Actions")
    
    col1, col2, col3, col4 = st.columns(4)
    
    with col1:
        with st.expander("🔍 Quick Research"):
            query = st.text_input("Research query", key="quick_research")
            if st.button("Research", key="btn_research"):
                if query:
                    result = client.quick_action("research", query)
                    st.info(f"Task started: {result.get('task_id')}")
    
    with col2:
        with st.expander("💻 Quick Code"):
            request = st.text_input("Code request", key="quick_code")
            if st.button("Generate", key="btn_code"):
                if request:
                    result = client.quick_action("code", request)
                    st.info(f"Task started: {result.get('task_id')}")
    
    with col3:
        with st.expander("📧 Quick Email"):
            action = st.text_input("Email action", key="quick_email")
            if st.button("Execute", key="btn_email"):
                if action:
                    result = client.quick_action("email", action)
                    st.info(f"Task started: {result.get('task_id')}")
    
    with col4:
        with st.expander("📈 Quick Analyze"):
            topic = st.text_input("Analysis topic", key="quick_analyze")
            if st.button("Analyze", key="btn_analyze"):
                if topic:
                    result = client.quick_action("analyze", topic)
                    st.info(f"Task started: {result.get('task_id')}")


def render_tasks(client: APIClient):
    """Render tasks section."""
    st.subheader("📋 Tasks")
    
    tasks = client.get_tasks()
    
    if not tasks:
        st.info("No tasks yet. Submit a task to get started!")
        return
    
    # Filter tabs
    tab1, tab2, tab3, tab4 = st.tabs(["All", "Running", "Completed", "Failed"])
    
    def render_task_list(task_list: List[Dict[str, Any]]):
        for task in task_list:
            status = task.get("status", "unknown")
            status_icon = {
                "queued": "⏳",
                "running": "🔄",
                "completed": "✅",
                "failed": "❌",
                "cancelled": "🚫"
            }.get(status, "❓")
            
            with st.expander(f"{status_icon} {task.get('goal', 'No goal')[:60]}..."):
                col1, col2 = st.columns(2)
                with col1:
                    st.write(f"**Task ID:** {task.get('task_id')}")
                    st.write(f"**Agent:** {task.get('agent_type')}")
                with col2:
                    st.write(f"**Status:** {status}")
                    st.write(f"**Created:** {task.get('created_at', 'N/A')}")
    
    with tab1:
        render_task_list(tasks)
    
    with tab2:
        running = [t for t in tasks if t.get("status") == "running"]
        render_task_list(running)
    
    with tab3:
        completed = [t for t in tasks if t.get("status") == "completed"]
        render_task_list(completed)
    
    with tab4:
        failed = [t for t in tasks if t.get("status") == "failed"]
        render_task_list(failed)


def render_activity_timeline():
    """Render activity timeline."""
    st.subheader("📜 Activity Timeline")
    
    if not st.session_state.activity_log:
        st.info("No recent activity.")
        return
    
    for activity in list(st.session_state.activity_log)[:10]:
        event = activity.get("event", "unknown")
        event_icon = {
            "task_created": "🆕",
            "task_started": "▶️",
            "task_completed": "✅",
            "task_failed": "❌",
            "connected": "🔌"
        }.get(event, "📌")
        
        st.markdown(f"""
        <div style="
            padding: 8px 12px;
            margin: 4px 0;
            background: #1a1a2e;
            border-radius: 5px;
            border-left: 3px solid #e94560;
        ">
            <span style="color: #666;">{activity.get('time')}</span>
            <span style="margin-left: 10px;">{event_icon} {event.replace('_', ' ').title()}</span>
            <span style="color: #a0a0a0; margin-left: 10px;">{activity.get('task_id', '')}</span>
        </div>
        """, unsafe_allow_html=True)


def render_metrics_chart():
    """Render real-time metrics chart."""
    st.subheader("📈 Real-Time Metrics")
    
    history = st.session_state.metrics_history
    
    if len(history["timestamps"]) < 2:
        st.info("Collecting metrics data...")
        return
    
    fig = go.Figure()
    
    fig.add_trace(go.Scatter(
        x=list(history["timestamps"]),
        y=list(history["tasks_completed"]),
        mode='lines+markers',
        name='Tasks Completed',
        line=dict(color='#00ff88', width=2)
    ))
    
    fig.add_trace(go.Scatter(
        x=list(history["timestamps"]),
        y=list(history["tasks_running"]),
        mode='lines+markers',
        name='Tasks Running',
        line=dict(color='#ff6b6b', width=2)
    ))
    
    fig.update_layout(
        template="plotly_dark",
        height=300,
        margin=dict(l=0, r=0, t=30, b=0),
        legend=dict(orientation="h", yanchor="bottom", y=1.02),
        xaxis_title="Time",
        yaxis_title="Count"
    )
    
    st.plotly_chart(fig, use_container_width=True)


# ============================================================================
# Main Dashboard
# ============================================================================

def main():
    """Main dashboard entry point."""
    st.set_page_config(
        page_title="HYPER UNICORN Dashboard",
        page_icon="🦄",
        layout="wide",
        initial_sidebar_state="expanded"
    )
    
    # Custom CSS
    st.markdown("""
    <style>
        .stApp {
            background: linear-gradient(180deg, #0a0a0f 0%, #1a1a2e 100%);
        }
        .stMetric {
            background: #1a1a2e;
            padding: 15px;
            border-radius: 10px;
            border: 1px solid #0f3460;
        }
        .stExpander {
            background: #1a1a2e;
            border: 1px solid #0f3460;
        }
        h1, h2, h3 {
            color: #e94560 !important;
        }
    </style>
    """, unsafe_allow_html=True)
    
    # Initialize
    init_session_state()
    client = APIClient()
    
    # Sidebar
    with st.sidebar:
        st.image("https://via.placeholder.com/150x50?text=SUPERMEGA.DEV", width=150)
        st.markdown("---")
        
        st.subheader("🎛️ Controls")
        
        if st.button("🔄 Refresh", use_container_width=True):
            st.rerun()
        
        auto_refresh = st.checkbox("Auto-refresh (5s)", value=False)
        
        st.markdown("---")
        
        st.subheader("📊 Quick Stats")
        health = client.get_health()
        st.write(f"**Status:** {health.get('status', 'unknown')}")
        st.write(f"**Uptime:** {health.get('uptime', 'N/A')}")
        
        st.markdown("---")
        
        st.subheader("🔗 Links")
        st.markdown("[API Docs](/docs)")
        st.markdown("[GitHub](https://github.com/swanhtet01/swanhtet01.github.io)")
    
    # Main content
    render_header()
    st.markdown("---")
    
    # Top row - Health and Agents
    col1, col2 = st.columns([2, 1])
    
    with col1:
        render_system_health(client)
    
    with col2:
        render_metrics_chart()
    
    st.markdown("---")
    
    # Agents
    render_agents(client)
    
    st.markdown("---")
    
    # Task submission and quick actions
    col1, col2 = st.columns([1, 1])
    
    with col1:
        render_task_submission(client)
    
    with col2:
        render_quick_actions(client)
    
    st.markdown("---")
    
    # Tasks and Activity
    col1, col2 = st.columns([2, 1])
    
    with col1:
        render_tasks(client)
    
    with col2:
        render_activity_timeline()
    
    # Auto-refresh
    if auto_refresh:
        time.sleep(5)
        st.rerun()


if __name__ == "__main__":
    main()
