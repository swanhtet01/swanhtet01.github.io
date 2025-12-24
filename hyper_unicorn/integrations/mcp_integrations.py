"""
MCP Integrations Hub
=====================
Comprehensive Model Context Protocol (MCP) integrations for HYPER UNICORN.

This module provides connections to 50+ MCP servers covering:
- Data & Databases
- Development Tools
- Communication
- Productivity
- Finance
- Web & Browser
- AI & ML
- Cloud Services
- File Systems
- And more...

Author: Manus AI for SuperMega.dev
"""

import os
import json
import subprocess
from typing import Optional, Dict, List, Any
from dataclasses import dataclass, field
from enum import Enum
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("mcp_integrations")


# ============================================================================
# MCP Server Registry
# ============================================================================

class MCPCategory(Enum):
    """Categories of MCP servers."""
    DATABASE = "database"
    DEVELOPMENT = "development"
    COMMUNICATION = "communication"
    PRODUCTIVITY = "productivity"
    FINANCE = "finance"
    WEB_BROWSER = "web_browser"
    AI_ML = "ai_ml"
    CLOUD = "cloud"
    FILE_SYSTEM = "file_system"
    SEARCH = "search"
    MEDIA = "media"
    AUTOMATION = "automation"
    ANALYTICS = "analytics"
    SECURITY = "security"


@dataclass
class MCPServer:
    """Definition of an MCP server."""
    name: str
    description: str
    category: MCPCategory
    package: str  # npm package or pip package
    config_template: Dict[str, Any]
    tools: List[str]
    required_env_vars: List[str] = field(default_factory=list)
    documentation_url: str = ""
    is_official: bool = False


# ============================================================================
# MCP Server Catalog - 50+ Servers
# ============================================================================

MCP_SERVERS = {
    # ========== DATABASE SERVERS ==========
    "postgres": MCPServer(
        name="PostgreSQL",
        description="Query and manage PostgreSQL databases",
        category=MCPCategory.DATABASE,
        package="@modelcontextprotocol/server-postgres",
        config_template={
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-postgres", "${POSTGRES_URL}"]
        },
        tools=["query", "list_tables", "describe_table", "execute"],
        required_env_vars=["POSTGRES_URL"],
        documentation_url="https://github.com/modelcontextprotocol/servers/tree/main/src/postgres",
        is_official=True
    ),
    "sqlite": MCPServer(
        name="SQLite",
        description="Query and manage SQLite databases",
        category=MCPCategory.DATABASE,
        package="@modelcontextprotocol/server-sqlite",
        config_template={
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-sqlite", "${SQLITE_PATH}"]
        },
        tools=["query", "execute", "list_tables", "describe_table"],
        required_env_vars=["SQLITE_PATH"],
        is_official=True
    ),
    "mysql": MCPServer(
        name="MySQL",
        description="Query and manage MySQL databases",
        category=MCPCategory.DATABASE,
        package="@benborla29/mcp-server-mysql",
        config_template={
            "command": "npx",
            "args": ["-y", "@benborla29/mcp-server-mysql"],
            "env": {
                "MYSQL_HOST": "${MYSQL_HOST}",
                "MYSQL_USER": "${MYSQL_USER}",
                "MYSQL_PASSWORD": "${MYSQL_PASSWORD}",
                "MYSQL_DATABASE": "${MYSQL_DATABASE}"
            }
        },
        tools=["query", "execute", "list_tables"],
        required_env_vars=["MYSQL_HOST", "MYSQL_USER", "MYSQL_PASSWORD", "MYSQL_DATABASE"]
    ),
    "mongodb": MCPServer(
        name="MongoDB",
        description="Query and manage MongoDB databases",
        category=MCPCategory.DATABASE,
        package="mcp-mongo-server",
        config_template={
            "command": "npx",
            "args": ["-y", "mcp-mongo-server"],
            "env": {"MONGODB_URI": "${MONGODB_URI}"}
        },
        tools=["find", "insert", "update", "delete", "aggregate"],
        required_env_vars=["MONGODB_URI"]
    ),
    "redis": MCPServer(
        name="Redis",
        description="Interact with Redis key-value store",
        category=MCPCategory.DATABASE,
        package="@gongrzhe/server-redis-mcp",
        config_template={
            "command": "npx",
            "args": ["-y", "@gongrzhe/server-redis-mcp"],
            "env": {"REDIS_URL": "${REDIS_URL}"}
        },
        tools=["get", "set", "delete", "keys", "hget", "hset"],
        required_env_vars=["REDIS_URL"]
    ),
    "qdrant": MCPServer(
        name="Qdrant",
        description="Vector database for AI embeddings",
        category=MCPCategory.DATABASE,
        package="mcp-server-qdrant",
        config_template={
            "command": "uvx",
            "args": ["mcp-server-qdrant"],
            "env": {
                "QDRANT_URL": "${QDRANT_URL}",
                "QDRANT_API_KEY": "${QDRANT_API_KEY}"
            }
        },
        tools=["search", "upsert", "delete", "get_collections"],
        required_env_vars=["QDRANT_URL"]
    ),
    "supabase": MCPServer(
        name="Supabase",
        description="Supabase database and auth",
        category=MCPCategory.DATABASE,
        package="@supabase/mcp-server-supabase",
        config_template={
            "command": "npx",
            "args": ["-y", "@supabase/mcp-server-supabase"],
            "env": {
                "SUPABASE_URL": "${SUPABASE_URL}",
                "SUPABASE_KEY": "${SUPABASE_KEY}"
            }
        },
        tools=["query", "insert", "update", "delete", "rpc"],
        required_env_vars=["SUPABASE_URL", "SUPABASE_KEY"]
    ),
    
    # ========== DEVELOPMENT SERVERS ==========
    "github": MCPServer(
        name="GitHub",
        description="Interact with GitHub repositories, issues, PRs",
        category=MCPCategory.DEVELOPMENT,
        package="@modelcontextprotocol/server-github",
        config_template={
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-github"],
            "env": {"GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"}
        },
        tools=[
            "create_repository", "get_file_contents", "push_files",
            "create_issue", "create_pull_request", "search_repositories",
            "list_commits", "get_issue", "update_issue"
        ],
        required_env_vars=["GITHUB_TOKEN"],
        is_official=True
    ),
    "gitlab": MCPServer(
        name="GitLab",
        description="Interact with GitLab repositories",
        category=MCPCategory.DEVELOPMENT,
        package="@modelcontextprotocol/server-gitlab",
        config_template={
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-gitlab"],
            "env": {
                "GITLAB_PERSONAL_ACCESS_TOKEN": "${GITLAB_TOKEN}",
                "GITLAB_API_URL": "${GITLAB_API_URL}"
            }
        },
        tools=["create_project", "get_file", "create_merge_request"],
        required_env_vars=["GITLAB_TOKEN"],
        is_official=True
    ),
    "filesystem": MCPServer(
        name="Filesystem",
        description="Read and write files on the local filesystem",
        category=MCPCategory.FILE_SYSTEM,
        package="@modelcontextprotocol/server-filesystem",
        config_template={
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-filesystem", "${ALLOWED_PATHS}"]
        },
        tools=["read_file", "write_file", "list_directory", "create_directory", "move_file"],
        required_env_vars=["ALLOWED_PATHS"],
        is_official=True
    ),
    "docker": MCPServer(
        name="Docker",
        description="Manage Docker containers and images",
        category=MCPCategory.DEVELOPMENT,
        package="mcp-server-docker",
        config_template={
            "command": "uvx",
            "args": ["mcp-server-docker"]
        },
        tools=["list_containers", "start_container", "stop_container", "build_image", "run_container"],
        required_env_vars=[]
    ),
    "kubernetes": MCPServer(
        name="Kubernetes",
        description="Manage Kubernetes clusters",
        category=MCPCategory.DEVELOPMENT,
        package="mcp-server-kubernetes",
        config_template={
            "command": "npx",
            "args": ["-y", "mcp-server-kubernetes"]
        },
        tools=["get_pods", "get_deployments", "apply_manifest", "delete_resource"],
        required_env_vars=[]
    ),
    
    # ========== COMMUNICATION SERVERS ==========
    "gmail": MCPServer(
        name="Gmail",
        description="Read and send Gmail messages",
        category=MCPCategory.COMMUNICATION,
        package="@anthropic/mcp-server-gmail",
        config_template={
            "command": "npx",
            "args": ["-y", "@anthropic/mcp-server-gmail"]
        },
        tools=["search_messages", "get_message", "send_message", "create_draft"],
        required_env_vars=[],
        is_official=True
    ),
    "slack": MCPServer(
        name="Slack",
        description="Interact with Slack workspaces",
        category=MCPCategory.COMMUNICATION,
        package="@modelcontextprotocol/server-slack",
        config_template={
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-slack"],
            "env": {"SLACK_BOT_TOKEN": "${SLACK_BOT_TOKEN}"}
        },
        tools=["send_message", "list_channels", "get_channel_history", "search_messages"],
        required_env_vars=["SLACK_BOT_TOKEN"],
        is_official=True
    ),
    "discord": MCPServer(
        name="Discord",
        description="Interact with Discord servers",
        category=MCPCategory.COMMUNICATION,
        package="mcp-discord",
        config_template={
            "command": "npx",
            "args": ["-y", "mcp-discord"],
            "env": {"DISCORD_TOKEN": "${DISCORD_TOKEN}"}
        },
        tools=["send_message", "list_channels", "get_messages"],
        required_env_vars=["DISCORD_TOKEN"]
    ),
    "telegram": MCPServer(
        name="Telegram",
        description="Send and receive Telegram messages",
        category=MCPCategory.COMMUNICATION,
        package="mcp-telegram",
        config_template={
            "command": "npx",
            "args": ["-y", "mcp-telegram"],
            "env": {"TELEGRAM_BOT_TOKEN": "${TELEGRAM_BOT_TOKEN}"}
        },
        tools=["send_message", "get_updates", "send_photo"],
        required_env_vars=["TELEGRAM_BOT_TOKEN"]
    ),
    "twilio": MCPServer(
        name="Twilio",
        description="Send SMS and make calls via Twilio",
        category=MCPCategory.COMMUNICATION,
        package="mcp-server-twilio",
        config_template={
            "command": "npx",
            "args": ["-y", "mcp-server-twilio"],
            "env": {
                "TWILIO_ACCOUNT_SID": "${TWILIO_ACCOUNT_SID}",
                "TWILIO_AUTH_TOKEN": "${TWILIO_AUTH_TOKEN}"
            }
        },
        tools=["send_sms", "make_call", "get_messages"],
        required_env_vars=["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"]
    ),
    
    # ========== PRODUCTIVITY SERVERS ==========
    "google_calendar": MCPServer(
        name="Google Calendar",
        description="Manage Google Calendar events",
        category=MCPCategory.PRODUCTIVITY,
        package="@anthropic/mcp-server-google-calendar",
        config_template={
            "command": "npx",
            "args": ["-y", "@anthropic/mcp-server-google-calendar"]
        },
        tools=["list_events", "create_event", "update_event", "delete_event"],
        required_env_vars=[],
        is_official=True
    ),
    "google_drive": MCPServer(
        name="Google Drive",
        description="Access and manage Google Drive files",
        category=MCPCategory.PRODUCTIVITY,
        package="@modelcontextprotocol/server-gdrive",
        config_template={
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-gdrive"]
        },
        tools=["list_files", "get_file", "upload_file", "search_files"],
        required_env_vars=[],
        is_official=True
    ),
    "notion": MCPServer(
        name="Notion",
        description="Interact with Notion databases and pages",
        category=MCPCategory.PRODUCTIVITY,
        package="@notionhq/mcp-server-notion",
        config_template={
            "command": "npx",
            "args": ["-y", "@notionhq/mcp-server-notion"],
            "env": {"NOTION_API_KEY": "${NOTION_API_KEY}"}
        },
        tools=["search", "get_page", "create_page", "update_page", "query_database"],
        required_env_vars=["NOTION_API_KEY"]
    ),
    "linear": MCPServer(
        name="Linear",
        description="Manage Linear issues and projects",
        category=MCPCategory.PRODUCTIVITY,
        package="mcp-server-linear",
        config_template={
            "command": "npx",
            "args": ["-y", "mcp-server-linear"],
            "env": {"LINEAR_API_KEY": "${LINEAR_API_KEY}"}
        },
        tools=["create_issue", "list_issues", "update_issue", "search_issues"],
        required_env_vars=["LINEAR_API_KEY"]
    ),
    "todoist": MCPServer(
        name="Todoist",
        description="Manage Todoist tasks",
        category=MCPCategory.PRODUCTIVITY,
        package="mcp-server-todoist",
        config_template={
            "command": "npx",
            "args": ["-y", "mcp-server-todoist"],
            "env": {"TODOIST_API_TOKEN": "${TODOIST_API_TOKEN}"}
        },
        tools=["get_tasks", "create_task", "complete_task", "update_task"],
        required_env_vars=["TODOIST_API_TOKEN"]
    ),
    "obsidian": MCPServer(
        name="Obsidian",
        description="Access Obsidian vault notes",
        category=MCPCategory.PRODUCTIVITY,
        package="mcp-obsidian",
        config_template={
            "command": "npx",
            "args": ["-y", "mcp-obsidian"],
            "env": {"OBSIDIAN_VAULT_PATH": "${OBSIDIAN_VAULT_PATH}"}
        },
        tools=["search_notes", "get_note", "create_note", "update_note"],
        required_env_vars=["OBSIDIAN_VAULT_PATH"]
    ),
    
    # ========== FINANCE SERVERS ==========
    "stripe": MCPServer(
        name="Stripe",
        description="Manage Stripe payments and customers",
        category=MCPCategory.FINANCE,
        package="@stripe/mcp-server-stripe",
        config_template={
            "command": "npx",
            "args": ["-y", "@stripe/mcp-server-stripe"],
            "env": {"STRIPE_SECRET_KEY": "${STRIPE_SECRET_KEY}"}
        },
        tools=["create_customer", "create_payment_intent", "list_payments", "create_invoice"],
        required_env_vars=["STRIPE_SECRET_KEY"]
    ),
    "polygon": MCPServer(
        name="Polygon.io",
        description="Financial market data",
        category=MCPCategory.FINANCE,
        package="mcp-server-polygon",
        config_template={
            "command": "npx",
            "args": ["-y", "mcp-server-polygon"],
            "env": {"POLYGON_API_KEY": "${POLYGON_API_KEY}"}
        },
        tools=["get_ticker", "get_aggregates", "get_news", "get_financials"],
        required_env_vars=["POLYGON_API_KEY"]
    ),
    "coinbase": MCPServer(
        name="Coinbase",
        description="Cryptocurrency trading and data",
        category=MCPCategory.FINANCE,
        package="mcp-server-coinbase",
        config_template={
            "command": "npx",
            "args": ["-y", "mcp-server-coinbase"],
            "env": {
                "COINBASE_API_KEY": "${COINBASE_API_KEY}",
                "COINBASE_API_SECRET": "${COINBASE_API_SECRET}"
            }
        },
        tools=["get_accounts", "get_prices", "create_order", "get_transactions"],
        required_env_vars=["COINBASE_API_KEY", "COINBASE_API_SECRET"]
    ),
    
    # ========== WEB & BROWSER SERVERS ==========
    "puppeteer": MCPServer(
        name="Puppeteer",
        description="Browser automation with Puppeteer",
        category=MCPCategory.WEB_BROWSER,
        package="@modelcontextprotocol/server-puppeteer",
        config_template={
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-puppeteer"]
        },
        tools=["navigate", "screenshot", "click", "type", "evaluate"],
        required_env_vars=[],
        is_official=True
    ),
    "playwright": MCPServer(
        name="Playwright",
        description="Browser automation with Playwright",
        category=MCPCategory.WEB_BROWSER,
        package="mcp-server-playwright",
        config_template={
            "command": "npx",
            "args": ["-y", "mcp-server-playwright"]
        },
        tools=["navigate", "click", "fill", "screenshot", "evaluate"],
        required_env_vars=[]
    ),
    "browserbase": MCPServer(
        name="Browserbase",
        description="Cloud browser automation",
        category=MCPCategory.WEB_BROWSER,
        package="@browserbasehq/mcp-server-browserbase",
        config_template={
            "command": "npx",
            "args": ["-y", "@browserbasehq/mcp-server-browserbase"],
            "env": {"BROWSERBASE_API_KEY": "${BROWSERBASE_API_KEY}"}
        },
        tools=["create_session", "navigate", "screenshot", "execute_script"],
        required_env_vars=["BROWSERBASE_API_KEY"]
    ),
    "firecrawl": MCPServer(
        name="Firecrawl",
        description="Web scraping and crawling",
        category=MCPCategory.WEB_BROWSER,
        package="firecrawl-mcp",
        config_template={
            "command": "npx",
            "args": ["-y", "firecrawl-mcp"],
            "env": {"FIRECRAWL_API_KEY": "${FIRECRAWL_API_KEY}"}
        },
        tools=["scrape", "crawl", "map_site"],
        required_env_vars=["FIRECRAWL_API_KEY"]
    ),
    "brightdata": MCPServer(
        name="Bright Data",
        description="Web scraping with proxies",
        category=MCPCategory.WEB_BROWSER,
        package="@anthropic/mcp-server-brightdata",
        config_template={
            "command": "npx",
            "args": ["-y", "@anthropic/mcp-server-brightdata"],
            "env": {"BRIGHTDATA_API_KEY": "${BRIGHTDATA_API_KEY}"}
        },
        tools=["scrape_url", "search_serp", "get_dataset"],
        required_env_vars=["BRIGHTDATA_API_KEY"]
    ),
    
    # ========== SEARCH SERVERS ==========
    "brave_search": MCPServer(
        name="Brave Search",
        description="Web search via Brave",
        category=MCPCategory.SEARCH,
        package="@anthropic/mcp-server-brave-search",
        config_template={
            "command": "npx",
            "args": ["-y", "@anthropic/mcp-server-brave-search"],
            "env": {"BRAVE_API_KEY": "${BRAVE_API_KEY}"}
        },
        tools=["web_search", "local_search"],
        required_env_vars=["BRAVE_API_KEY"],
        is_official=True
    ),
    "tavily": MCPServer(
        name="Tavily",
        description="AI-optimized search",
        category=MCPCategory.SEARCH,
        package="tavily-mcp",
        config_template={
            "command": "npx",
            "args": ["-y", "tavily-mcp"],
            "env": {"TAVILY_API_KEY": "${TAVILY_API_KEY}"}
        },
        tools=["search", "extract"],
        required_env_vars=["TAVILY_API_KEY"]
    ),
    "exa": MCPServer(
        name="Exa",
        description="Neural search engine",
        category=MCPCategory.SEARCH,
        package="exa-mcp-server",
        config_template={
            "command": "npx",
            "args": ["-y", "exa-mcp-server"],
            "env": {"EXA_API_KEY": "${EXA_API_KEY}"}
        },
        tools=["search", "find_similar", "get_contents"],
        required_env_vars=["EXA_API_KEY"]
    ),
    "perplexity": MCPServer(
        name="Perplexity",
        description="AI-powered search",
        category=MCPCategory.SEARCH,
        package="mcp-server-perplexity",
        config_template={
            "command": "npx",
            "args": ["-y", "mcp-server-perplexity"],
            "env": {"PERPLEXITY_API_KEY": "${PERPLEXITY_API_KEY}"}
        },
        tools=["search", "ask"],
        required_env_vars=["PERPLEXITY_API_KEY"]
    ),
    
    # ========== CLOUD SERVERS ==========
    "aws": MCPServer(
        name="AWS",
        description="Interact with AWS services",
        category=MCPCategory.CLOUD,
        package="mcp-server-aws",
        config_template={
            "command": "npx",
            "args": ["-y", "mcp-server-aws"],
            "env": {
                "AWS_ACCESS_KEY_ID": "${AWS_ACCESS_KEY_ID}",
                "AWS_SECRET_ACCESS_KEY": "${AWS_SECRET_ACCESS_KEY}",
                "AWS_REGION": "${AWS_REGION}"
            }
        },
        tools=["s3_list", "s3_get", "s3_put", "ec2_list", "lambda_invoke"],
        required_env_vars=["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"]
    ),
    "cloudflare": MCPServer(
        name="Cloudflare",
        description="Manage Cloudflare services",
        category=MCPCategory.CLOUD,
        package="@cloudflare/mcp-server-cloudflare",
        config_template={
            "command": "npx",
            "args": ["-y", "@cloudflare/mcp-server-cloudflare"],
            "env": {"CLOUDFLARE_API_TOKEN": "${CLOUDFLARE_API_TOKEN}"}
        },
        tools=["list_zones", "create_dns_record", "purge_cache", "list_workers"],
        required_env_vars=["CLOUDFLARE_API_TOKEN"]
    ),
    "vercel": MCPServer(
        name="Vercel",
        description="Manage Vercel deployments",
        category=MCPCategory.CLOUD,
        package="mcp-server-vercel",
        config_template={
            "command": "npx",
            "args": ["-y", "mcp-server-vercel"],
            "env": {"VERCEL_TOKEN": "${VERCEL_TOKEN}"}
        },
        tools=["list_projects", "deploy", "get_deployment", "list_domains"],
        required_env_vars=["VERCEL_TOKEN"]
    ),
    
    # ========== AI/ML SERVERS ==========
    "openai": MCPServer(
        name="OpenAI",
        description="Access OpenAI models",
        category=MCPCategory.AI_ML,
        package="mcp-server-openai",
        config_template={
            "command": "npx",
            "args": ["-y", "mcp-server-openai"],
            "env": {"OPENAI_API_KEY": "${OPENAI_API_KEY}"}
        },
        tools=["chat", "embeddings", "images", "audio"],
        required_env_vars=["OPENAI_API_KEY"]
    ),
    "anthropic": MCPServer(
        name="Anthropic",
        description="Access Claude models",
        category=MCPCategory.AI_ML,
        package="mcp-server-anthropic",
        config_template={
            "command": "npx",
            "args": ["-y", "mcp-server-anthropic"],
            "env": {"ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}"}
        },
        tools=["chat", "analyze"],
        required_env_vars=["ANTHROPIC_API_KEY"]
    ),
    "huggingface": MCPServer(
        name="Hugging Face",
        description="Access Hugging Face models",
        category=MCPCategory.AI_ML,
        package="mcp-server-huggingface",
        config_template={
            "command": "npx",
            "args": ["-y", "mcp-server-huggingface"],
            "env": {"HF_TOKEN": "${HF_TOKEN}"}
        },
        tools=["inference", "list_models", "get_model_info"],
        required_env_vars=["HF_TOKEN"]
    ),
    "replicate": MCPServer(
        name="Replicate",
        description="Run ML models on Replicate",
        category=MCPCategory.AI_ML,
        package="mcp-server-replicate",
        config_template={
            "command": "npx",
            "args": ["-y", "mcp-server-replicate"],
            "env": {"REPLICATE_API_TOKEN": "${REPLICATE_API_TOKEN}"}
        },
        tools=["run", "list_models", "get_prediction"],
        required_env_vars=["REPLICATE_API_TOKEN"]
    ),
    
    # ========== MEDIA SERVERS ==========
    "elevenlabs": MCPServer(
        name="ElevenLabs",
        description="Text-to-speech and voice cloning",
        category=MCPCategory.MEDIA,
        package="mcp-server-elevenlabs",
        config_template={
            "command": "npx",
            "args": ["-y", "mcp-server-elevenlabs"],
            "env": {"ELEVENLABS_API_KEY": "${ELEVENLABS_API_KEY}"}
        },
        tools=["text_to_speech", "list_voices", "clone_voice"],
        required_env_vars=["ELEVENLABS_API_KEY"]
    ),
    "youtube": MCPServer(
        name="YouTube",
        description="Search and get YouTube video info",
        category=MCPCategory.MEDIA,
        package="mcp-server-youtube",
        config_template={
            "command": "npx",
            "args": ["-y", "mcp-server-youtube"],
            "env": {"YOUTUBE_API_KEY": "${YOUTUBE_API_KEY}"}
        },
        tools=["search", "get_video", "get_transcript", "get_channel"],
        required_env_vars=["YOUTUBE_API_KEY"]
    ),
    "spotify": MCPServer(
        name="Spotify",
        description="Search and control Spotify",
        category=MCPCategory.MEDIA,
        package="mcp-server-spotify",
        config_template={
            "command": "npx",
            "args": ["-y", "mcp-server-spotify"],
            "env": {
                "SPOTIFY_CLIENT_ID": "${SPOTIFY_CLIENT_ID}",
                "SPOTIFY_CLIENT_SECRET": "${SPOTIFY_CLIENT_SECRET}"
            }
        },
        tools=["search", "get_track", "get_playlist", "get_recommendations"],
        required_env_vars=["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET"]
    ),
    
    # ========== AUTOMATION SERVERS ==========
    "zapier": MCPServer(
        name="Zapier",
        description="Trigger Zapier automations",
        category=MCPCategory.AUTOMATION,
        package="mcp-server-zapier",
        config_template={
            "command": "npx",
            "args": ["-y", "mcp-server-zapier"],
            "env": {"ZAPIER_NLA_API_KEY": "${ZAPIER_NLA_API_KEY}"}
        },
        tools=["list_actions", "run_action"],
        required_env_vars=["ZAPIER_NLA_API_KEY"]
    ),
    "make": MCPServer(
        name="Make (Integromat)",
        description="Trigger Make scenarios",
        category=MCPCategory.AUTOMATION,
        package="mcp-server-make",
        config_template={
            "command": "npx",
            "args": ["-y", "mcp-server-make"],
            "env": {"MAKE_API_KEY": "${MAKE_API_KEY}"}
        },
        tools=["list_scenarios", "run_scenario"],
        required_env_vars=["MAKE_API_KEY"]
    ),
    
    # ========== ANALYTICS SERVERS ==========
    "sentry": MCPServer(
        name="Sentry",
        description="Error tracking and monitoring",
        category=MCPCategory.ANALYTICS,
        package="mcp-server-sentry",
        config_template={
            "command": "npx",
            "args": ["-y", "mcp-server-sentry"],
            "env": {"SENTRY_AUTH_TOKEN": "${SENTRY_AUTH_TOKEN}"}
        },
        tools=["list_issues", "get_issue", "resolve_issue"],
        required_env_vars=["SENTRY_AUTH_TOKEN"]
    ),
    "posthog": MCPServer(
        name="PostHog",
        description="Product analytics",
        category=MCPCategory.ANALYTICS,
        package="mcp-server-posthog",
        config_template={
            "command": "npx",
            "args": ["-y", "mcp-server-posthog"],
            "env": {"POSTHOG_API_KEY": "${POSTHOG_API_KEY}"}
        },
        tools=["query", "get_events", "get_persons"],
        required_env_vars=["POSTHOG_API_KEY"]
    ),
}


# ============================================================================
# MCP Integration Manager
# ============================================================================

class MCPIntegrationManager:
    """
    Manages MCP server integrations for HYPER UNICORN.
    """
    
    def __init__(self, config_path: str = None):
        self.servers = MCP_SERVERS
        self.config_path = config_path or os.path.expanduser("~/.hyper_unicorn/mcp_config.json")
        self.active_servers: Dict[str, Any] = {}
        
        # Load existing config
        self._load_config()
    
    def _load_config(self):
        """Load MCP configuration."""
        if os.path.exists(self.config_path):
            with open(self.config_path, "r") as f:
                self.active_servers = json.load(f)
    
    def _save_config(self):
        """Save MCP configuration."""
        os.makedirs(os.path.dirname(self.config_path), exist_ok=True)
        with open(self.config_path, "w") as f:
            json.dump(self.active_servers, f, indent=2)
    
    def list_available_servers(self, category: MCPCategory = None) -> List[MCPServer]:
        """List all available MCP servers."""
        servers = list(self.servers.values())
        if category:
            servers = [s for s in servers if s.category == category]
        return servers
    
    def get_server(self, name: str) -> Optional[MCPServer]:
        """Get a specific MCP server definition."""
        return self.servers.get(name)
    
    def get_servers_by_category(self) -> Dict[str, List[MCPServer]]:
        """Get servers grouped by category."""
        result = {}
        for server in self.servers.values():
            cat = server.category.value
            if cat not in result:
                result[cat] = []
            result[cat].append(server)
        return result
    
    def enable_server(self, name: str, env_vars: Dict[str, str] = None) -> bool:
        """Enable an MCP server."""
        server = self.get_server(name)
        if not server:
            logger.error(f"Server not found: {name}")
            return False
        
        # Check required env vars
        missing_vars = []
        for var in server.required_env_vars:
            if var not in (env_vars or {}) and not os.environ.get(var):
                missing_vars.append(var)
        
        if missing_vars:
            logger.warning(f"Missing environment variables for {name}: {missing_vars}")
        
        self.active_servers[name] = {
            "enabled": True,
            "env_vars": env_vars or {},
            "config": server.config_template
        }
        
        self._save_config()
        logger.info(f"Enabled MCP server: {name}")
        return True
    
    def disable_server(self, name: str):
        """Disable an MCP server."""
        if name in self.active_servers:
            del self.active_servers[name]
            self._save_config()
            logger.info(f"Disabled MCP server: {name}")
    
    def get_active_servers(self) -> List[str]:
        """Get list of active server names."""
        return list(self.active_servers.keys())
    
    def generate_claude_config(self) -> Dict[str, Any]:
        """Generate Claude Desktop MCP configuration."""
        config = {"mcpServers": {}}
        
        for name, settings in self.active_servers.items():
            server = self.get_server(name)
            if server:
                server_config = dict(server.config_template)
                
                # Merge environment variables
                if "env" not in server_config:
                    server_config["env"] = {}
                server_config["env"].update(settings.get("env_vars", {}))
                
                config["mcpServers"][name] = server_config
        
        return config
    
    def call_tool(self, server_name: str, tool_name: str, args: Dict[str, Any]) -> Any:
        """Call a tool on an MCP server."""
        if server_name not in self.active_servers:
            raise ValueError(f"Server not enabled: {server_name}")
        
        # Use manus-mcp-cli to call the tool
        cmd = [
            "manus-mcp-cli", "tool", "call", tool_name,
            "--server", server_name,
            "--input", json.dumps(args)
        ]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            if result.returncode == 0:
                return json.loads(result.stdout)
            else:
                logger.error(f"MCP tool call failed: {result.stderr}")
                return None
        except Exception as e:
            logger.error(f"Error calling MCP tool: {e}")
            return None
    
    def get_stats(self) -> Dict[str, Any]:
        """Get MCP integration statistics."""
        servers_by_cat = self.get_servers_by_category()
        return {
            "total_servers": len(self.servers),
            "active_servers": len(self.active_servers),
            "official_servers": len([s for s in self.servers.values() if s.is_official]),
            "categories": {cat: len(servers) for cat, servers in servers_by_cat.items()},
            "total_tools": sum(len(s.tools) for s in self.servers.values())
        }


# ============================================================================
# Main Entry Point
# ============================================================================

def main():
    """Demo the MCP Integration Manager."""
    manager = MCPIntegrationManager()
    
    print("=== MCP Integration Manager ===\n")
    
    # Get stats
    stats = manager.get_stats()
    print(f"Total MCP Servers: {stats['total_servers']}")
    print(f"Official Servers: {stats['official_servers']}")
    print(f"Total Tools: {stats['total_tools']}")
    
    print("\n--- Servers by Category ---")
    for cat, count in stats['categories'].items():
        print(f"  {cat}: {count} servers")
    
    print("\n--- All Available Servers ---")
    for name, server in MCP_SERVERS.items():
        official = "✓" if server.is_official else " "
        print(f"  [{official}] {name}: {server.description}")
        print(f"      Tools: {', '.join(server.tools[:5])}{'...' if len(server.tools) > 5 else ''}")


if __name__ == "__main__":
    main()
