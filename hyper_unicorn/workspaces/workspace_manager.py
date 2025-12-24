"""
Agent Workspace Manager
========================
Dedicated workspaces for each agent type in HYPER UNICORN.

Each agent gets a specialized workspace with:
- Dedicated file storage
- Role-specific tools
- Custom views and interfaces
- Isolated execution environment
- Persistent state and memory

Author: Manus AI for SuperMega.dev
"""

import os
import json
import shutil
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from enum import Enum
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("workspace_manager")


# ============================================================================
# Workspace Definitions
# ============================================================================

class WorkspaceType(Enum):
    """Types of agent workspaces."""
    RESEARCH = "research"
    CODE = "code"
    CONTENT = "content"
    DATA = "data"
    BROWSER = "browser"
    FINANCIAL = "financial"
    COMMUNICATION = "communication"
    CEO = "ceo"
    SHARED = "shared"


@dataclass
class WorkspaceConfig:
    """Configuration for an agent workspace."""
    name: str
    type: WorkspaceType
    description: str
    
    # Directory structure
    directories: List[str] = field(default_factory=list)
    
    # Tools available in this workspace
    tools: List[str] = field(default_factory=list)
    
    # MCP servers available
    mcp_servers: List[str] = field(default_factory=list)
    
    # File types this workspace handles
    file_types: List[str] = field(default_factory=list)
    
    # Views/dashboards available
    views: List[str] = field(default_factory=list)
    
    # Resource limits
    max_storage_gb: float = 10.0
    max_memory_mb: int = 2048
    max_cpu_percent: int = 50
    
    # Permissions
    can_access_internet: bool = True
    can_execute_code: bool = False
    can_access_filesystem: bool = True
    can_send_emails: bool = False
    can_make_payments: bool = False


# ============================================================================
# Workspace Templates
# ============================================================================

WORKSPACE_TEMPLATES: Dict[WorkspaceType, WorkspaceConfig] = {
    WorkspaceType.RESEARCH: WorkspaceConfig(
        name="Research Workspace",
        type=WorkspaceType.RESEARCH,
        description="Deep research, information gathering, and report generation",
        directories=[
            "sources",           # Raw source materials
            "notes",             # Research notes
            "reports",           # Generated reports
            "data",              # Collected data
            "references",        # Citations and references
            "archives",          # Archived research
        ],
        tools=[
            "tavily_search",
            "exa_search",
            "brave_search",
            "perplexity",
            "web_scraper",
            "pdf_reader",
            "document_analyzer",
            "citation_manager",
            "note_taker",
            "report_generator",
        ],
        mcp_servers=[
            "brave_search",
            "tavily",
            "exa",
            "perplexity",
            "firecrawl",
            "puppeteer",
        ],
        file_types=[".pdf", ".docx", ".txt", ".md", ".html", ".json", ".csv"],
        views=[
            "research_dashboard",
            "source_browser",
            "note_editor",
            "report_preview",
        ],
        can_access_internet=True,
        can_execute_code=False,
    ),
    
    WorkspaceType.CODE: WorkspaceConfig(
        name="Code Workspace",
        type=WorkspaceType.CODE,
        description="Software development, code review, and debugging",
        directories=[
            "projects",          # Active projects
            "sandbox",           # Code execution sandbox
            "tests",             # Test files
            "docs",              # Documentation
            "templates",         # Code templates
            "archives",          # Archived projects
        ],
        tools=[
            "code_editor",
            "terminal",
            "git_client",
            "debugger",
            "linter",
            "formatter",
            "test_runner",
            "docker_manager",
            "dependency_manager",
            "code_reviewer",
        ],
        mcp_servers=[
            "github",
            "gitlab",
            "filesystem",
            "docker",
            "kubernetes",
        ],
        file_types=[".py", ".js", ".ts", ".go", ".rs", ".java", ".cpp", ".h", ".json", ".yaml", ".toml", ".md"],
        views=[
            "code_editor",
            "terminal_view",
            "git_history",
            "test_results",
            "pr_review",
        ],
        can_access_internet=True,
        can_execute_code=True,
        max_memory_mb=4096,
        max_cpu_percent=80,
    ),
    
    WorkspaceType.CONTENT: WorkspaceConfig(
        name="Content Workspace",
        type=WorkspaceType.CONTENT,
        description="Content creation, editing, and publishing",
        directories=[
            "drafts",            # Work in progress
            "published",         # Published content
            "assets",            # Images, videos, etc.
            "templates",         # Content templates
            "style_guides",      # Brand guidelines
            "archives",          # Archived content
        ],
        tools=[
            "text_editor",
            "markdown_editor",
            "image_editor",
            "grammar_checker",
            "seo_optimizer",
            "plagiarism_checker",
            "social_scheduler",
            "cms_publisher",
            "analytics_viewer",
        ],
        mcp_servers=[
            "notion",
            "obsidian",
            "google_drive",
            "youtube",
        ],
        file_types=[".md", ".txt", ".html", ".docx", ".png", ".jpg", ".svg", ".mp4"],
        views=[
            "content_editor",
            "asset_library",
            "publishing_queue",
            "analytics_dashboard",
        ],
        can_access_internet=True,
        can_execute_code=False,
    ),
    
    WorkspaceType.DATA: WorkspaceConfig(
        name="Data Workspace",
        type=WorkspaceType.DATA,
        description="Data analysis, visualization, and reporting",
        directories=[
            "raw_data",          # Raw data files
            "processed",         # Cleaned data
            "models",            # ML models
            "visualizations",    # Charts and graphs
            "reports",           # Analysis reports
            "pipelines",         # Data pipelines
        ],
        tools=[
            "pandas",
            "duckdb",
            "plotly",
            "matplotlib",
            "jupyter",
            "sql_client",
            "data_cleaner",
            "feature_engineer",
            "model_trainer",
            "report_builder",
        ],
        mcp_servers=[
            "postgres",
            "mysql",
            "mongodb",
            "sqlite",
            "supabase",
            "qdrant",
        ],
        file_types=[".csv", ".json", ".parquet", ".xlsx", ".sql", ".ipynb", ".pkl"],
        views=[
            "data_explorer",
            "query_editor",
            "visualization_builder",
            "pipeline_monitor",
        ],
        can_access_internet=True,
        can_execute_code=True,
        max_memory_mb=8192,
        max_cpu_percent=90,
    ),
    
    WorkspaceType.BROWSER: WorkspaceConfig(
        name="Browser Workspace",
        type=WorkspaceType.BROWSER,
        description="Web automation, scraping, and testing",
        directories=[
            "screenshots",       # Page screenshots
            "downloads",         # Downloaded files
            "sessions",          # Browser sessions
            "scripts",           # Automation scripts
            "data",              # Scraped data
        ],
        tools=[
            "browser_controller",
            "screenshot_tool",
            "element_inspector",
            "form_filler",
            "cookie_manager",
            "proxy_manager",
            "captcha_solver",
            "data_extractor",
        ],
        mcp_servers=[
            "puppeteer",
            "playwright",
            "browserbase",
            "firecrawl",
            "brightdata",
        ],
        file_types=[".html", ".json", ".png", ".jpg", ".csv", ".pdf"],
        views=[
            "browser_view",
            "element_tree",
            "network_monitor",
            "session_manager",
        ],
        can_access_internet=True,
        can_execute_code=True,
    ),
    
    WorkspaceType.FINANCIAL: WorkspaceConfig(
        name="Financial Workspace",
        type=WorkspaceType.FINANCIAL,
        description="Financial analysis, trading, and reporting",
        directories=[
            "market_data",       # Price data
            "portfolios",        # Portfolio tracking
            "reports",           # Financial reports
            "models",            # Financial models
            "alerts",            # Price alerts
        ],
        tools=[
            "market_data_api",
            "portfolio_tracker",
            "technical_analyzer",
            "fundamental_analyzer",
            "risk_calculator",
            "backtester",
            "alert_manager",
            "report_generator",
        ],
        mcp_servers=[
            "polygon",
            "coinbase",
            "stripe",
        ],
        file_types=[".csv", ".json", ".xlsx", ".pdf"],
        views=[
            "market_dashboard",
            "portfolio_view",
            "chart_analyzer",
            "alert_manager",
        ],
        can_access_internet=True,
        can_execute_code=True,
        can_make_payments=True,
    ),
    
    WorkspaceType.COMMUNICATION: WorkspaceConfig(
        name="Communication Workspace",
        type=WorkspaceType.COMMUNICATION,
        description="Email, messaging, and calendar management",
        directories=[
            "drafts",            # Message drafts
            "templates",         # Email templates
            "contacts",          # Contact lists
            "campaigns",         # Marketing campaigns
            "logs",              # Communication logs
        ],
        tools=[
            "email_client",
            "calendar_manager",
            "contact_manager",
            "template_editor",
            "campaign_manager",
            "analytics_viewer",
            "scheduler",
        ],
        mcp_servers=[
            "gmail",
            "google_calendar",
            "slack",
            "discord",
            "telegram",
            "twilio",
        ],
        file_types=[".eml", ".ics", ".vcf", ".html", ".json"],
        views=[
            "inbox_view",
            "calendar_view",
            "contact_list",
            "campaign_dashboard",
        ],
        can_access_internet=True,
        can_send_emails=True,
    ),
    
    WorkspaceType.CEO: WorkspaceConfig(
        name="CEO Workspace",
        type=WorkspaceType.CEO,
        description="Executive oversight, delegation, and strategic planning",
        directories=[
            "strategy",          # Strategic documents
            "reports",           # Executive reports
            "delegations",       # Task delegations
            "meetings",          # Meeting notes
            "decisions",         # Decision logs
        ],
        tools=[
            "task_delegator",
            "agent_monitor",
            "report_aggregator",
            "decision_tracker",
            "meeting_scheduler",
            "kpi_dashboard",
            "budget_tracker",
        ],
        mcp_servers=[
            "notion",
            "linear",
            "google_calendar",
            "slack",
        ],
        file_types=[".md", ".pdf", ".json", ".xlsx"],
        views=[
            "executive_dashboard",
            "agent_fleet_view",
            "task_board",
            "kpi_tracker",
        ],
        can_access_internet=True,
        can_send_emails=True,
        can_make_payments=True,
    ),
    
    WorkspaceType.SHARED: WorkspaceConfig(
        name="Shared Workspace",
        type=WorkspaceType.SHARED,
        description="Shared resources accessible by all agents",
        directories=[
            "documents",         # Shared documents
            "templates",         # Shared templates
            "assets",            # Shared assets
            "knowledge_base",    # Company knowledge
            "outputs",           # Final outputs
        ],
        tools=[
            "file_manager",
            "search",
            "version_control",
        ],
        mcp_servers=[
            "google_drive",
            "filesystem",
        ],
        file_types=["*"],
        views=[
            "file_browser",
            "search_view",
        ],
        can_access_internet=False,
        can_execute_code=False,
    ),
}


# ============================================================================
# Workspace Manager
# ============================================================================

class WorkspaceManager:
    """
    Manages agent workspaces for HYPER UNICORN.
    """
    
    def __init__(self, base_path: str = None):
        self.base_path = Path(base_path or os.path.expanduser("~/hyper_unicorn/workspaces"))
        self.templates = WORKSPACE_TEMPLATES
        self.active_workspaces: Dict[str, "Workspace"] = {}
        
        # Initialize workspaces
        self._initialize_workspaces()
    
    def _initialize_workspaces(self):
        """Initialize all workspace directories."""
        self.base_path.mkdir(parents=True, exist_ok=True)
        
        for ws_type, config in self.templates.items():
            ws_path = self.base_path / ws_type.value
            ws_path.mkdir(exist_ok=True)
            
            # Create subdirectories
            for subdir in config.directories:
                (ws_path / subdir).mkdir(exist_ok=True)
            
            # Create workspace instance
            self.active_workspaces[ws_type.value] = Workspace(
                path=ws_path,
                config=config,
                manager=self
            )
        
        logger.info(f"Initialized {len(self.active_workspaces)} workspaces at {self.base_path}")
    
    def get_workspace(self, ws_type: WorkspaceType) -> "Workspace":
        """Get a workspace by type."""
        return self.active_workspaces.get(ws_type.value)
    
    def list_workspaces(self) -> List[Dict[str, Any]]:
        """List all workspaces with their status."""
        result = []
        for name, ws in self.active_workspaces.items():
            result.append({
                "name": ws.config.name,
                "type": name,
                "description": ws.config.description,
                "path": str(ws.path),
                "tools": len(ws.config.tools),
                "mcp_servers": len(ws.config.mcp_servers),
                "storage_used": ws.get_storage_used(),
            })
        return result
    
    def get_shared_workspace(self) -> "Workspace":
        """Get the shared workspace."""
        return self.get_workspace(WorkspaceType.SHARED)


# ============================================================================
# Workspace Class
# ============================================================================

class Workspace:
    """
    A dedicated workspace for an agent.
    """
    
    def __init__(self, path: Path, config: WorkspaceConfig, manager: WorkspaceManager):
        self.path = path
        self.config = config
        self.manager = manager
        self.state_file = path / ".workspace_state.json"
        self.state = self._load_state()
    
    def _load_state(self) -> Dict[str, Any]:
        """Load workspace state."""
        if self.state_file.exists():
            with open(self.state_file, "r") as f:
                return json.load(f)
        return {
            "created_at": datetime.now().isoformat(),
            "last_accessed": None,
            "file_count": 0,
            "active_tasks": [],
        }
    
    def _save_state(self):
        """Save workspace state."""
        self.state["last_accessed"] = datetime.now().isoformat()
        with open(self.state_file, "w") as f:
            json.dump(self.state, f, indent=2)
    
    def get_storage_used(self) -> float:
        """Get storage used in MB."""
        total = 0
        for item in self.path.rglob("*"):
            if item.is_file():
                total += item.stat().st_size
        return total / (1024 * 1024)
    
    def list_files(self, subdir: str = None) -> List[Dict[str, Any]]:
        """List files in the workspace."""
        search_path = self.path / subdir if subdir else self.path
        files = []
        for item in search_path.iterdir():
            if item.name.startswith("."):
                continue
            files.append({
                "name": item.name,
                "type": "directory" if item.is_dir() else "file",
                "size": item.stat().st_size if item.is_file() else 0,
                "modified": datetime.fromtimestamp(item.stat().st_mtime).isoformat(),
            })
        return files
    
    def read_file(self, filepath: str) -> str:
        """Read a file from the workspace."""
        full_path = self.path / filepath
        if not full_path.exists():
            raise FileNotFoundError(f"File not found: {filepath}")
        if not full_path.is_relative_to(self.path):
            raise PermissionError("Access denied: path outside workspace")
        return full_path.read_text()
    
    def write_file(self, filepath: str, content: str) -> str:
        """Write a file to the workspace."""
        full_path = self.path / filepath
        if not full_path.is_relative_to(self.path):
            raise PermissionError("Access denied: path outside workspace")
        full_path.parent.mkdir(parents=True, exist_ok=True)
        full_path.write_text(content)
        self._save_state()
        return str(full_path)
    
    def delete_file(self, filepath: str):
        """Delete a file from the workspace."""
        full_path = self.path / filepath
        if not full_path.is_relative_to(self.path):
            raise PermissionError("Access denied: path outside workspace")
        if full_path.is_dir():
            shutil.rmtree(full_path)
        else:
            full_path.unlink()
        self._save_state()
    
    def get_available_tools(self) -> List[str]:
        """Get tools available in this workspace."""
        return self.config.tools
    
    def get_available_mcp_servers(self) -> List[str]:
        """Get MCP servers available in this workspace."""
        return self.config.mcp_servers
    
    def check_permission(self, action: str) -> bool:
        """Check if an action is permitted in this workspace."""
        permissions = {
            "internet": self.config.can_access_internet,
            "execute_code": self.config.can_execute_code,
            "filesystem": self.config.can_access_filesystem,
            "send_email": self.config.can_send_emails,
            "make_payment": self.config.can_make_payments,
        }
        return permissions.get(action, False)
    
    def get_info(self) -> Dict[str, Any]:
        """Get workspace information."""
        return {
            "name": self.config.name,
            "type": self.config.type.value,
            "description": self.config.description,
            "path": str(self.path),
            "directories": self.config.directories,
            "tools": self.config.tools,
            "mcp_servers": self.config.mcp_servers,
            "file_types": self.config.file_types,
            "views": self.config.views,
            "permissions": {
                "internet": self.config.can_access_internet,
                "execute_code": self.config.can_execute_code,
                "filesystem": self.config.can_access_filesystem,
                "send_email": self.config.can_send_emails,
                "make_payment": self.config.can_make_payments,
            },
            "limits": {
                "max_storage_gb": self.config.max_storage_gb,
                "max_memory_mb": self.config.max_memory_mb,
                "max_cpu_percent": self.config.max_cpu_percent,
            },
            "storage_used_mb": self.get_storage_used(),
            "state": self.state,
        }


# ============================================================================
# Workspace Views (Streamlit Components)
# ============================================================================

def render_workspace_selector():
    """Render workspace selector component (for Streamlit)."""
    try:
        import streamlit as st
        
        manager = WorkspaceManager()
        workspaces = manager.list_workspaces()
        
        st.sidebar.header("🗂️ Workspaces")
        
        for ws in workspaces:
            with st.sidebar.expander(f"📁 {ws['name']}"):
                st.write(ws['description'])
                st.caption(f"Tools: {ws['tools']} | MCP: {ws['mcp_servers']}")
                st.caption(f"Storage: {ws['storage_used']:.2f} MB")
                if st.button(f"Open {ws['type']}", key=f"open_{ws['type']}"):
                    st.session_state.active_workspace = ws['type']
    except ImportError:
        pass


def render_workspace_view(ws_type: str):
    """Render workspace view (for Streamlit)."""
    try:
        import streamlit as st
        
        manager = WorkspaceManager()
        ws = manager.get_workspace(WorkspaceType(ws_type))
        
        if not ws:
            st.error(f"Workspace not found: {ws_type}")
            return
        
        info = ws.get_info()
        
        st.header(f"🗂️ {info['name']}")
        st.caption(info['description'])
        
        # Tabs for different views
        tabs = st.tabs(["📁 Files", "🔧 Tools", "🔌 MCP Servers", "⚙️ Settings"])
        
        with tabs[0]:
            # File browser
            st.subheader("Files")
            for subdir in info['directories']:
                with st.expander(f"📂 {subdir}"):
                    files = ws.list_files(subdir)
                    for f in files:
                        icon = "📁" if f['type'] == 'directory' else "📄"
                        st.write(f"{icon} {f['name']} ({f['size']} bytes)")
        
        with tabs[1]:
            # Available tools
            st.subheader("Available Tools")
            cols = st.columns(3)
            for i, tool in enumerate(info['tools']):
                cols[i % 3].button(f"🔧 {tool}", key=f"tool_{tool}")
        
        with tabs[2]:
            # MCP servers
            st.subheader("MCP Servers")
            for server in info['mcp_servers']:
                st.write(f"🔌 {server}")
        
        with tabs[3]:
            # Settings
            st.subheader("Permissions")
            for perm, value in info['permissions'].items():
                st.checkbox(perm.replace("_", " ").title(), value=value, disabled=True)
            
            st.subheader("Resource Limits")
            st.write(f"Max Storage: {info['limits']['max_storage_gb']} GB")
            st.write(f"Max Memory: {info['limits']['max_memory_mb']} MB")
            st.write(f"Max CPU: {info['limits']['max_cpu_percent']}%")
    except ImportError:
        pass


# ============================================================================
# Main Entry Point
# ============================================================================

def main():
    """Demo the Workspace Manager."""
    manager = WorkspaceManager()
    
    print("=== Agent Workspace Manager ===\n")
    
    workspaces = manager.list_workspaces()
    
    print(f"Total Workspaces: {len(workspaces)}\n")
    
    for ws in workspaces:
        print(f"📁 {ws['name']} ({ws['type']})")
        print(f"   {ws['description']}")
        print(f"   Tools: {ws['tools']} | MCP Servers: {ws['mcp_servers']}")
        print(f"   Path: {ws['path']}")
        print()


if __name__ == "__main__":
    main()
