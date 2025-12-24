"""
Agent Marketplace
==================
Share, discover, and install agents.

Features:
- Agent registry
- Version management
- Ratings and reviews
- Installation and updates
- Revenue sharing

Author: Manus AI for SuperMega.dev
"""

import os
import json
from datetime import datetime
from typing import Optional, Dict, List, Any
from dataclasses import dataclass, field
from enum import Enum
import logging
import secrets

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("marketplace")


# ============================================================================
# Data Models
# ============================================================================

class AgentCategory(Enum):
    """Agent categories."""
    RESEARCH = "research"
    DEVELOPMENT = "development"
    CONTENT = "content"
    DATA = "data"
    AUTOMATION = "automation"
    COMMUNICATION = "communication"
    FINANCE = "finance"
    SALES = "sales"
    SUPPORT = "support"
    CUSTOM = "custom"


class AgentVisibility(Enum):
    """Agent visibility."""
    PUBLIC = "public"
    PRIVATE = "private"
    UNLISTED = "unlisted"  # Accessible by link only


class PricingModel(Enum):
    """Agent pricing models."""
    FREE = "free"
    ONE_TIME = "one_time"
    SUBSCRIPTION = "subscription"
    USAGE_BASED = "usage_based"


@dataclass
class AgentVersion:
    """A version of an agent."""
    version: str
    release_date: datetime
    changelog: str
    min_system_version: str = "1.0.0"
    download_url: str = ""
    checksum: str = ""
    downloads: int = 0


@dataclass
class AgentReview:
    """A review for an agent."""
    review_id: str
    user_id: str
    rating: int  # 1-5
    title: str
    content: str
    created_at: datetime
    helpful_count: int = 0
    verified_purchase: bool = False


@dataclass
class AgentPricing:
    """Pricing for an agent."""
    model: PricingModel
    price_usd: float = 0.0
    subscription_period_days: int = 30
    usage_rate_per_call: float = 0.0
    free_tier_calls: int = 0


@dataclass
class MarketplaceAgent:
    """An agent in the marketplace."""
    agent_id: str
    name: str
    description: str
    long_description: str
    category: AgentCategory
    visibility: AgentVisibility
    author_id: str
    author_name: str
    created_at: datetime
    updated_at: datetime
    versions: List[AgentVersion]
    current_version: str
    pricing: AgentPricing
    tags: List[str] = field(default_factory=list)
    icon_url: str = ""
    screenshots: List[str] = field(default_factory=list)
    documentation_url: str = ""
    support_email: str = ""
    total_downloads: int = 0
    total_installs: int = 0
    average_rating: float = 0.0
    review_count: int = 0
    reviews: List[AgentReview] = field(default_factory=list)
    capabilities: List[str] = field(default_factory=list)
    required_tools: List[str] = field(default_factory=list)
    required_models: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class InstalledAgent:
    """An installed agent for a tenant."""
    install_id: str
    agent_id: str
    tenant_id: str
    installed_version: str
    installed_at: datetime
    last_used: Optional[datetime] = None
    usage_count: int = 0
    auto_update: bool = True
    license_key: str = ""
    expires_at: Optional[datetime] = None


# ============================================================================
# Agent Marketplace
# ============================================================================

class AgentMarketplace:
    """
    Marketplace for sharing and discovering agents.
    """
    
    def __init__(self, storage_path: str = None):
        self.agents: Dict[str, MarketplaceAgent] = {}
        self.installations: Dict[str, List[InstalledAgent]] = {}  # tenant_id -> installs
        self.storage_path = storage_path
        
        # Initialize with some built-in agents
        self._init_builtin_agents()
        
        if storage_path and os.path.exists(storage_path):
            self._load()
    
    def _init_builtin_agents(self):
        """Initialize built-in agents."""
        builtin_agents = [
            MarketplaceAgent(
                agent_id="builtin_research",
                name="Research Agent",
                description="Deep research and report generation",
                long_description="""
The Research Agent is a powerful tool for conducting comprehensive research on any topic.
It can search the web, analyze academic papers, synthesize findings, and generate detailed reports.

Features:
- Multi-source search (web, academic, news)
- Automatic source verification
- Citation management
- Report generation in multiple formats
                """,
                category=AgentCategory.RESEARCH,
                visibility=AgentVisibility.PUBLIC,
                author_id="supermega",
                author_name="SuperMega.dev",
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
                versions=[AgentVersion("1.0.0", datetime.utcnow(), "Initial release")],
                current_version="1.0.0",
                pricing=AgentPricing(PricingModel.FREE),
                tags=["research", "reports", "analysis"],
                capabilities=["web_search", "document_analysis", "report_generation"],
                required_tools=["tavily_search", "exa_search"],
                required_models=["gemini-pro", "gpt-4o"]
            ),
            MarketplaceAgent(
                agent_id="builtin_code",
                name="Code Agent",
                description="Software development and debugging",
                long_description="""
The Code Agent helps with all aspects of software development.
It can write code, debug issues, review pull requests, and explain complex codebases.

Features:
- Multi-language support
- Code generation and completion
- Bug detection and fixing
- Code review and optimization
- Documentation generation
                """,
                category=AgentCategory.DEVELOPMENT,
                visibility=AgentVisibility.PUBLIC,
                author_id="supermega",
                author_name="SuperMega.dev",
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
                versions=[AgentVersion("1.0.0", datetime.utcnow(), "Initial release")],
                current_version="1.0.0",
                pricing=AgentPricing(PricingModel.FREE),
                tags=["coding", "development", "debugging"],
                capabilities=["code_generation", "code_review", "debugging"],
                required_tools=["code_execution", "github"],
                required_models=["claude-sonnet", "gpt-4o"]
            ),
            MarketplaceAgent(
                agent_id="builtin_content",
                name="Content Agent",
                description="Content creation and editing",
                long_description="""
The Content Agent is your AI writing assistant.
It can create blog posts, social media content, marketing copy, and more.

Features:
- Multiple content formats
- SEO optimization
- Tone and style customization
- Multi-language support
- Brand voice consistency
                """,
                category=AgentCategory.CONTENT,
                visibility=AgentVisibility.PUBLIC,
                author_id="supermega",
                author_name="SuperMega.dev",
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
                versions=[AgentVersion("1.0.0", datetime.utcnow(), "Initial release")],
                current_version="1.0.0",
                pricing=AgentPricing(PricingModel.FREE),
                tags=["content", "writing", "marketing"],
                capabilities=["content_generation", "editing", "seo"],
                required_tools=["search"],
                required_models=["gemini-pro", "claude-sonnet"]
            ),
            MarketplaceAgent(
                agent_id="builtin_data",
                name="Data Agent",
                description="Data analysis and visualization",
                long_description="""
The Data Agent helps you make sense of your data.
It can analyze datasets, create visualizations, and generate insights.

Features:
- SQL query generation
- Statistical analysis
- Interactive visualizations
- Automated reporting
- Data cleaning and transformation
                """,
                category=AgentCategory.DATA,
                visibility=AgentVisibility.PUBLIC,
                author_id="supermega",
                author_name="SuperMega.dev",
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
                versions=[AgentVersion("1.0.0", datetime.utcnow(), "Initial release")],
                current_version="1.0.0",
                pricing=AgentPricing(PricingModel.FREE),
                tags=["data", "analytics", "visualization"],
                capabilities=["data_analysis", "visualization", "sql"],
                required_tools=["duckdb", "plotly"],
                required_models=["gemini-pro"]
            ),
            MarketplaceAgent(
                agent_id="builtin_browser",
                name="Browser Agent",
                description="Web automation and scraping",
                long_description="""
The Browser Agent can interact with websites on your behalf.
It can fill forms, extract data, and automate repetitive web tasks.

Features:
- Intelligent navigation
- Form filling
- Data extraction
- Screenshot capture
- Multi-step workflows
                """,
                category=AgentCategory.AUTOMATION,
                visibility=AgentVisibility.PUBLIC,
                author_id="supermega",
                author_name="SuperMega.dev",
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
                versions=[AgentVersion("1.0.0", datetime.utcnow(), "Initial release")],
                current_version="1.0.0",
                pricing=AgentPricing(PricingModel.FREE),
                tags=["browser", "automation", "scraping"],
                capabilities=["web_navigation", "form_filling", "data_extraction"],
                required_tools=["playwright", "browser_use"],
                required_models=["gemini-pro", "gpt-4o"]
            ),
            MarketplaceAgent(
                agent_id="builtin_financial",
                name="Financial Analyst Agent",
                description="Financial analysis and market research",
                long_description="""
The Financial Analyst Agent provides market intelligence and financial analysis.
It can analyze stocks, track portfolios, and generate investment insights.

Features:
- Real-time market data
- Technical analysis
- Portfolio tracking
- News sentiment analysis
- Risk assessment
                """,
                category=AgentCategory.FINANCE,
                visibility=AgentVisibility.PUBLIC,
                author_id="supermega",
                author_name="SuperMega.dev",
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
                versions=[AgentVersion("1.0.0", datetime.utcnow(), "Initial release")],
                current_version="1.0.0",
                pricing=AgentPricing(PricingModel.FREE),
                tags=["finance", "stocks", "analysis"],
                capabilities=["market_analysis", "portfolio_tracking", "news_analysis"],
                required_tools=["polygon_api"],
                required_models=["gemini-pro"]
            )
        ]
        
        for agent in builtin_agents:
            self.agents[agent.agent_id] = agent
    
    def publish_agent(
        self,
        name: str,
        description: str,
        long_description: str,
        category: AgentCategory,
        author_id: str,
        author_name: str,
        capabilities: List[str],
        required_tools: List[str] = None,
        required_models: List[str] = None,
        pricing: AgentPricing = None,
        tags: List[str] = None,
        visibility: AgentVisibility = AgentVisibility.PUBLIC
    ) -> MarketplaceAgent:
        """Publish a new agent to the marketplace."""
        agent_id = f"agent_{secrets.token_hex(8)}"
        
        agent = MarketplaceAgent(
            agent_id=agent_id,
            name=name,
            description=description,
            long_description=long_description,
            category=category,
            visibility=visibility,
            author_id=author_id,
            author_name=author_name,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            versions=[AgentVersion("1.0.0", datetime.utcnow(), "Initial release")],
            current_version="1.0.0",
            pricing=pricing or AgentPricing(PricingModel.FREE),
            tags=tags or [],
            capabilities=capabilities,
            required_tools=required_tools or [],
            required_models=required_models or []
        )
        
        self.agents[agent_id] = agent
        self._save()
        
        logger.info(f"Published agent {agent_id}: {name}")
        return agent
    
    def get_agent(self, agent_id: str) -> Optional[MarketplaceAgent]:
        """Get an agent by ID."""
        return self.agents.get(agent_id)
    
    def search_agents(
        self,
        query: str = None,
        category: AgentCategory = None,
        tags: List[str] = None,
        pricing_model: PricingModel = None,
        min_rating: float = None,
        sort_by: str = "downloads"  # downloads, rating, newest
    ) -> List[MarketplaceAgent]:
        """Search for agents."""
        results = [
            a for a in self.agents.values()
            if a.visibility == AgentVisibility.PUBLIC
        ]
        
        if query:
            query_lower = query.lower()
            results = [
                a for a in results
                if query_lower in a.name.lower()
                or query_lower in a.description.lower()
                or any(query_lower in tag.lower() for tag in a.tags)
            ]
        
        if category:
            results = [a for a in results if a.category == category]
        
        if tags:
            results = [
                a for a in results
                if any(tag in a.tags for tag in tags)
            ]
        
        if pricing_model:
            results = [a for a in results if a.pricing.model == pricing_model]
        
        if min_rating:
            results = [a for a in results if a.average_rating >= min_rating]
        
        # Sort
        if sort_by == "downloads":
            results.sort(key=lambda a: a.total_downloads, reverse=True)
        elif sort_by == "rating":
            results.sort(key=lambda a: a.average_rating, reverse=True)
        elif sort_by == "newest":
            results.sort(key=lambda a: a.created_at, reverse=True)
        
        return results
    
    def get_featured_agents(self, limit: int = 10) -> List[MarketplaceAgent]:
        """Get featured agents."""
        return self.search_agents(sort_by="downloads")[:limit]
    
    def get_agents_by_category(self, category: AgentCategory) -> List[MarketplaceAgent]:
        """Get agents by category."""
        return self.search_agents(category=category)
    
    def install_agent(
        self,
        agent_id: str,
        tenant_id: str,
        license_key: str = None
    ) -> InstalledAgent:
        """Install an agent for a tenant."""
        agent = self.get_agent(agent_id)
        if not agent:
            raise ValueError(f"Agent not found: {agent_id}")
        
        install_id = f"install_{secrets.token_hex(8)}"
        
        installed = InstalledAgent(
            install_id=install_id,
            agent_id=agent_id,
            tenant_id=tenant_id,
            installed_version=agent.current_version,
            installed_at=datetime.utcnow(),
            license_key=license_key or ""
        )
        
        if tenant_id not in self.installations:
            self.installations[tenant_id] = []
        
        self.installations[tenant_id].append(installed)
        
        # Update agent stats
        agent.total_installs += 1
        
        self._save()
        logger.info(f"Installed agent {agent_id} for tenant {tenant_id}")
        
        return installed
    
    def uninstall_agent(self, tenant_id: str, agent_id: str):
        """Uninstall an agent for a tenant."""
        if tenant_id in self.installations:
            self.installations[tenant_id] = [
                i for i in self.installations[tenant_id]
                if i.agent_id != agent_id
            ]
            self._save()
    
    def get_installed_agents(self, tenant_id: str) -> List[InstalledAgent]:
        """Get installed agents for a tenant."""
        return self.installations.get(tenant_id, [])
    
    def is_agent_installed(self, tenant_id: str, agent_id: str) -> bool:
        """Check if an agent is installed for a tenant."""
        installs = self.get_installed_agents(tenant_id)
        return any(i.agent_id == agent_id for i in installs)
    
    def add_review(
        self,
        agent_id: str,
        user_id: str,
        rating: int,
        title: str,
        content: str,
        verified_purchase: bool = False
    ) -> AgentReview:
        """Add a review for an agent."""
        agent = self.get_agent(agent_id)
        if not agent:
            raise ValueError(f"Agent not found: {agent_id}")
        
        if not 1 <= rating <= 5:
            raise ValueError("Rating must be between 1 and 5")
        
        review = AgentReview(
            review_id=f"review_{secrets.token_hex(8)}",
            user_id=user_id,
            rating=rating,
            title=title,
            content=content,
            created_at=datetime.utcnow(),
            verified_purchase=verified_purchase
        )
        
        agent.reviews.append(review)
        agent.review_count = len(agent.reviews)
        agent.average_rating = sum(r.rating for r in agent.reviews) / len(agent.reviews)
        
        self._save()
        return review
    
    def publish_version(
        self,
        agent_id: str,
        version: str,
        changelog: str,
        download_url: str = ""
    ) -> AgentVersion:
        """Publish a new version of an agent."""
        agent = self.get_agent(agent_id)
        if not agent:
            raise ValueError(f"Agent not found: {agent_id}")
        
        new_version = AgentVersion(
            version=version,
            release_date=datetime.utcnow(),
            changelog=changelog,
            download_url=download_url
        )
        
        agent.versions.append(new_version)
        agent.current_version = version
        agent.updated_at = datetime.utcnow()
        
        self._save()
        logger.info(f"Published version {version} for agent {agent_id}")
        
        return new_version
    
    def get_stats(self) -> Dict[str, Any]:
        """Get marketplace statistics."""
        agents = list(self.agents.values())
        public_agents = [a for a in agents if a.visibility == AgentVisibility.PUBLIC]
        
        return {
            "total_agents": len(agents),
            "public_agents": len(public_agents),
            "total_downloads": sum(a.total_downloads for a in agents),
            "total_installs": sum(a.total_installs for a in agents),
            "categories": {
                cat.value: len([a for a in public_agents if a.category == cat])
                for cat in AgentCategory
            },
            "pricing_models": {
                pm.value: len([a for a in public_agents if a.pricing.model == pm])
                for pm in PricingModel
            },
            "average_rating": (
                sum(a.average_rating for a in public_agents if a.review_count > 0) /
                max(1, len([a for a in public_agents if a.review_count > 0]))
            )
        }
    
    def _save(self):
        """Save marketplace data."""
        if not self.storage_path:
            return
        
        # Simplified save - in production would use a database
        data = {
            "agents_count": len(self.agents),
            "installations_count": sum(len(i) for i in self.installations.values())
        }
        
        with open(self.storage_path, "w") as f:
            json.dump(data, f, indent=2)
    
    def _load(self):
        """Load marketplace data."""
        # In production, would load from database
        pass


# ============================================================================
# Main Entry Point
# ============================================================================

def main():
    """Demo the Agent Marketplace."""
    marketplace = AgentMarketplace()
    
    print("=== Agent Marketplace Demo ===\n")
    
    # Get stats
    stats = marketplace.get_stats()
    print(f"Total Agents: {stats['total_agents']}")
    print(f"Public Agents: {stats['public_agents']}")
    
    # Search agents
    print("\n--- Featured Agents ---")
    featured = marketplace.get_featured_agents(5)
    for agent in featured:
        print(f"  {agent.name}: {agent.description}")
        print(f"    Category: {agent.category.value}, Rating: {agent.average_rating:.1f}")
    
    # Search by category
    print("\n--- Research Agents ---")
    research_agents = marketplace.get_agents_by_category(AgentCategory.RESEARCH)
    for agent in research_agents:
        print(f"  {agent.name}: {agent.description}")
    
    # Install an agent
    print("\n--- Installing Agent ---")
    installed = marketplace.install_agent("builtin_research", "tenant_123")
    print(f"Installed: {installed.agent_id} v{installed.installed_version}")
    
    # Add a review
    print("\n--- Adding Review ---")
    review = marketplace.add_review(
        "builtin_research",
        "user_123",
        5,
        "Excellent research agent!",
        "This agent saved me hours of research time.",
        verified_purchase=True
    )
    print(f"Review added: {review.title} ({review.rating}/5)")
    
    # Publish a custom agent
    print("\n--- Publishing Custom Agent ---")
    custom = marketplace.publish_agent(
        name="SEO Optimizer Agent",
        description="Optimize content for search engines",
        long_description="A powerful SEO agent that analyzes and optimizes your content.",
        category=AgentCategory.CONTENT,
        author_id="user_456",
        author_name="SEO Expert",
        capabilities=["seo_analysis", "keyword_research", "content_optimization"],
        tags=["seo", "marketing", "content"]
    )
    print(f"Published: {custom.name} ({custom.agent_id})")
    
    # Final stats
    print("\n--- Updated Stats ---")
    stats = marketplace.get_stats()
    print(f"Total Agents: {stats['total_agents']}")
    print(f"Total Installs: {stats['total_installs']}")


if __name__ == "__main__":
    main()
