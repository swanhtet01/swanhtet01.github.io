"""
Social Media Agent
===================
Autonomous agent for social media content creation, scheduling, and engagement.

Capabilities:
- Multi-platform content creation
- Content scheduling and publishing
- Engagement monitoring and response
- Analytics and reporting
- Trend analysis
- Hashtag optimization
"""

import os
import json
import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
from enum import Enum


class Platform(Enum):
    """Supported social media platforms."""
    TWITTER = "twitter"
    LINKEDIN = "linkedin"
    INSTAGRAM = "instagram"
    FACEBOOK = "facebook"
    YOUTUBE = "youtube"
    TIKTOK = "tiktok"
    THREADS = "threads"
    BLUESKY = "bluesky"


class ContentType(Enum):
    """Types of social media content."""
    TEXT = "text"
    IMAGE = "image"
    VIDEO = "video"
    CAROUSEL = "carousel"
    STORY = "story"
    REEL = "reel"
    THREAD = "thread"
    POLL = "poll"
    ARTICLE = "article"


class PostStatus(Enum):
    """Post lifecycle status."""
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    PUBLISHED = "published"
    FAILED = "failed"
    DELETED = "deleted"


@dataclass
class SocialAccount:
    """Represents a connected social media account."""
    id: str
    platform: Platform
    username: str
    display_name: str
    profile_url: str = ""
    followers: int = 0
    following: int = 0
    connected_at: datetime = field(default_factory=datetime.now)
    access_token: str = ""  # Encrypted in production
    refresh_token: str = ""


@dataclass
class Post:
    """Represents a social media post."""
    id: str
    content: str
    platform: Platform
    content_type: ContentType
    status: PostStatus = PostStatus.DRAFT
    media_urls: List[str] = field(default_factory=list)
    hashtags: List[str] = field(default_factory=list)
    mentions: List[str] = field(default_factory=list)
    link: str = ""
    scheduled_for: Optional[datetime] = None
    published_at: Optional[datetime] = None
    post_url: str = ""
    campaign_id: str = ""
    created_at: datetime = field(default_factory=datetime.now)
    
    # Engagement metrics
    likes: int = 0
    comments: int = 0
    shares: int = 0
    impressions: int = 0
    reach: int = 0
    clicks: int = 0
    saves: int = 0


@dataclass
class Campaign:
    """Represents a social media campaign."""
    id: str
    name: str
    description: str
    platforms: List[Platform]
    start_date: datetime
    end_date: datetime
    goals: Dict[str, Any] = field(default_factory=dict)
    posts: List[str] = field(default_factory=list)
    hashtags: List[str] = field(default_factory=list)
    budget: float = 0
    status: str = "draft"
    metrics: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ContentIdea:
    """Represents a content idea."""
    id: str
    title: str
    description: str
    platforms: List[Platform]
    content_types: List[ContentType]
    topics: List[str] = field(default_factory=list)
    hooks: List[str] = field(default_factory=list)
    cta: str = ""
    priority: str = "medium"
    status: str = "idea"
    created_at: datetime = field(default_factory=datetime.now)


class SocialMediaAgent:
    """
    Autonomous Social Media Agent.
    
    Features:
    - Multi-platform content management
    - AI-powered content generation
    - Smart scheduling
    - Engagement automation
    - Analytics and insights
    - Trend monitoring
    """
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self.accounts: Dict[str, SocialAccount] = {}
        self.posts: Dict[str, Post] = {}
        self.campaigns: Dict[str, Campaign] = {}
        self.content_ideas: Dict[str, ContentIdea] = {}
        self.content_calendar: Dict[str, List[str]] = {}  # date -> post_ids
        
        # Platform-specific settings
        self.platform_limits = {
            Platform.TWITTER: {"chars": 280, "images": 4, "video_mins": 2.5},
            Platform.LINKEDIN: {"chars": 3000, "images": 20, "video_mins": 10},
            Platform.INSTAGRAM: {"chars": 2200, "images": 10, "video_mins": 60},
            Platform.FACEBOOK: {"chars": 63206, "images": 10, "video_mins": 240},
            Platform.THREADS: {"chars": 500, "images": 10, "video_mins": 5},
        }
        
        # Best posting times by platform (UTC)
        self.optimal_times = {
            Platform.TWITTER: ["09:00", "12:00", "17:00"],
            Platform.LINKEDIN: ["07:30", "12:00", "17:30"],
            Platform.INSTAGRAM: ["11:00", "14:00", "19:00"],
            Platform.FACEBOOK: ["09:00", "13:00", "16:00"],
        }
        
        # Content templates
        self._init_content_templates()
    
    def _init_content_templates(self):
        """Initialize content templates."""
        self.templates = {
            "thought_leadership": {
                "hook_patterns": [
                    "Here's what most people get wrong about {topic}:",
                    "I spent {time} studying {topic}. Here's what I learned:",
                    "The biggest mistake I see in {topic}:",
                    "Unpopular opinion about {topic}:",
                    "{number} lessons from {experience}:",
                ],
                "cta_patterns": [
                    "What's your take? 👇",
                    "Agree or disagree?",
                    "Follow for more {topic} insights",
                    "Save this for later 🔖",
                    "Share if this resonated",
                ]
            },
            "educational": {
                "hook_patterns": [
                    "How to {action} in {timeframe}:",
                    "{number} ways to {action}:",
                    "The complete guide to {topic}:",
                    "Stop doing {wrong_thing}. Do this instead:",
                    "The secret to {outcome}:",
                ],
                "cta_patterns": [
                    "Which tip will you try first?",
                    "Save this for reference 📌",
                    "Tag someone who needs this",
                    "Follow for daily tips",
                ]
            },
            "promotional": {
                "hook_patterns": [
                    "Introducing {product}:",
                    "We just launched {product}!",
                    "Big news: {announcement}",
                    "For a limited time: {offer}",
                ],
                "cta_patterns": [
                    "Link in bio",
                    "Learn more: {link}",
                    "Get started free: {link}",
                    "Book a demo: {link}",
                ]
            },
            "engagement": {
                "hook_patterns": [
                    "Quick question:",
                    "Let's settle this:",
                    "Hot take:",
                    "Controversial opinion:",
                ],
                "cta_patterns": [
                    "Drop your answer below 👇",
                    "Vote in the poll",
                    "Reply with your thoughts",
                    "Repost with your take",
                ]
            }
        }
    
    # ==================== Account Management ====================
    
    def connect_account(self, account_data: Dict[str, Any]) -> SocialAccount:
        """Connect a social media account."""
        account_id = f"acc_{datetime.now().timestamp()}"
        account = SocialAccount(
            id=account_id,
            platform=Platform(account_data.get("platform")),
            username=account_data.get("username", ""),
            display_name=account_data.get("display_name", ""),
            profile_url=account_data.get("profile_url", ""),
            access_token=account_data.get("access_token", ""),
            refresh_token=account_data.get("refresh_token", "")
        )
        self.accounts[account_id] = account
        return account
    
    # ==================== Content Generation ====================
    
    async def generate_content(
        self,
        topic: str,
        platform: Platform,
        content_type: ContentType = ContentType.TEXT,
        template: str = "thought_leadership",
        tone: str = "professional",
        include_hashtags: bool = True,
        include_cta: bool = True
    ) -> Dict[str, Any]:
        """
        Generate social media content using AI.
        
        Args:
            topic: The topic to write about
            platform: Target platform
            content_type: Type of content
            template: Content template to use
            tone: Writing tone
            include_hashtags: Whether to include hashtags
            include_cta: Whether to include call-to-action
        """
        # Get platform limits
        limits = self.platform_limits.get(platform, {"chars": 2000})
        max_chars = limits["chars"]
        
        # Get template patterns
        template_data = self.templates.get(template, self.templates["thought_leadership"])
        
        # Generate content structure
        content_parts = []
        
        # Hook
        hook = template_data["hook_patterns"][0].format(
            topic=topic,
            time="5 years",
            number="5",
            action="succeed",
            experience="building startups"
        )
        content_parts.append(hook)
        
        # Main content (placeholder - would use AI in production)
        main_content = f"""
Key insights about {topic}:

1. Start with the fundamentals
2. Consistency beats intensity
3. Learn from failures
4. Build in public
5. Network strategically
"""
        content_parts.append(main_content.strip())
        
        # CTA
        if include_cta:
            cta = template_data["cta_patterns"][0].format(topic=topic)
            content_parts.append(cta)
        
        # Combine content
        full_content = "\n\n".join(content_parts)
        
        # Truncate if needed
        if len(full_content) > max_chars:
            full_content = full_content[:max_chars-3] + "..."
        
        # Generate hashtags
        hashtags = []
        if include_hashtags:
            hashtags = await self._generate_hashtags(topic, platform)
        
        return {
            "content": full_content,
            "hashtags": hashtags,
            "platform": platform.value,
            "content_type": content_type.value,
            "char_count": len(full_content),
            "max_chars": max_chars
        }
    
    async def _generate_hashtags(
        self,
        topic: str,
        platform: Platform,
        count: int = 5
    ) -> List[str]:
        """Generate relevant hashtags for content."""
        # Base hashtags (would use AI/API in production)
        base_hashtags = {
            "ai": ["#AI", "#ArtificialIntelligence", "#MachineLearning", "#Tech", "#Innovation"],
            "startup": ["#Startup", "#Entrepreneur", "#Business", "#Founder", "#StartupLife"],
            "productivity": ["#Productivity", "#TimeManagement", "#Success", "#Growth", "#Mindset"],
            "marketing": ["#Marketing", "#DigitalMarketing", "#ContentMarketing", "#SocialMedia", "#Growth"],
            "tech": ["#Tech", "#Technology", "#Innovation", "#Future", "#Digital"],
        }
        
        # Find relevant hashtags
        topic_lower = topic.lower()
        hashtags = []
        for key, tags in base_hashtags.items():
            if key in topic_lower:
                hashtags.extend(tags)
        
        # Add generic hashtags if needed
        if len(hashtags) < count:
            hashtags.extend(["#Tips", "#Insights", "#Learning", "#Growth"])
        
        # Platform-specific adjustments
        if platform == Platform.LINKEDIN:
            hashtags = hashtags[:5]  # LinkedIn prefers fewer hashtags
        elif platform == Platform.INSTAGRAM:
            hashtags = hashtags[:30]  # Instagram allows up to 30
        
        return hashtags[:count]
    
    async def generate_content_calendar(
        self,
        days: int = 7,
        platforms: List[Platform] = None,
        posts_per_day: int = 2,
        topics: List[str] = None
    ) -> Dict[str, List[Dict]]:
        """Generate a content calendar for multiple days."""
        platforms = platforms or [Platform.TWITTER, Platform.LINKEDIN]
        topics = topics or ["AI agents", "automation", "productivity", "startups", "tech"]
        
        calendar = {}
        
        for day in range(days):
            date = datetime.now() + timedelta(days=day)
            date_str = date.strftime("%Y-%m-%d")
            calendar[date_str] = []
            
            for i in range(posts_per_day):
                platform = platforms[i % len(platforms)]
                topic = topics[(day * posts_per_day + i) % len(topics)]
                
                content = await self.generate_content(
                    topic=topic,
                    platform=platform,
                    template="thought_leadership" if i % 2 == 0 else "educational"
                )
                
                # Get optimal time
                times = self.optimal_times.get(platform, ["12:00"])
                time_str = times[i % len(times)]
                
                calendar[date_str].append({
                    "time": time_str,
                    "platform": platform.value,
                    "topic": topic,
                    "content": content["content"],
                    "hashtags": content["hashtags"]
                })
        
        return calendar
    
    # ==================== Post Management ====================
    
    def create_post(self, post_data: Dict[str, Any]) -> Post:
        """Create a new post."""
        post_id = f"post_{datetime.now().timestamp()}"
        post = Post(
            id=post_id,
            content=post_data.get("content", ""),
            platform=Platform(post_data.get("platform")),
            content_type=ContentType(post_data.get("content_type", "text")),
            media_urls=post_data.get("media_urls", []),
            hashtags=post_data.get("hashtags", []),
            mentions=post_data.get("mentions", []),
            link=post_data.get("link", ""),
            campaign_id=post_data.get("campaign_id", "")
        )
        
        if "scheduled_for" in post_data:
            post.scheduled_for = self._parse_datetime(post_data["scheduled_for"])
            post.status = PostStatus.SCHEDULED
        
        self.posts[post_id] = post
        
        # Add to calendar
        if post.scheduled_for:
            date_str = post.scheduled_for.strftime("%Y-%m-%d")
            if date_str not in self.content_calendar:
                self.content_calendar[date_str] = []
            self.content_calendar[date_str].append(post_id)
        
        return post
    
    def _parse_datetime(self, dt_input: Any) -> datetime:
        """Parse datetime from various formats."""
        if isinstance(dt_input, datetime):
            return dt_input
        if isinstance(dt_input, str):
            try:
                return datetime.fromisoformat(dt_input)
            except:
                return datetime.strptime(dt_input, "%Y-%m-%d %H:%M")
        return datetime.now()
    
    async def schedule_post(
        self,
        post_id: str,
        scheduled_time: datetime
    ) -> Post:
        """Schedule a post for publishing."""
        post = self.posts.get(post_id)
        if not post:
            raise ValueError(f"Post {post_id} not found")
        
        post.scheduled_for = scheduled_time
        post.status = PostStatus.SCHEDULED
        
        # Update calendar
        date_str = scheduled_time.strftime("%Y-%m-%d")
        if date_str not in self.content_calendar:
            self.content_calendar[date_str] = []
        if post_id not in self.content_calendar[date_str]:
            self.content_calendar[date_str].append(post_id)
        
        return post
    
    async def publish_post(self, post_id: str) -> Dict[str, Any]:
        """Publish a post to its platform."""
        post = self.posts.get(post_id)
        if not post:
            raise ValueError(f"Post {post_id} not found")
        
        # In production, this would call platform APIs
        # For now, simulate publishing
        
        post.status = PostStatus.PUBLISHED
        post.published_at = datetime.now()
        post.post_url = f"https://{post.platform.value}.com/post/{post_id}"
        
        return {
            "success": True,
            "post_id": post_id,
            "platform": post.platform.value,
            "post_url": post.post_url,
            "published_at": post.published_at.isoformat()
        }
    
    async def publish_scheduled_posts(self) -> List[Dict[str, Any]]:
        """Publish all posts scheduled for now or earlier."""
        results = []
        now = datetime.now()
        
        for post in self.posts.values():
            if (post.status == PostStatus.SCHEDULED and 
                post.scheduled_for and 
                post.scheduled_for <= now):
                try:
                    result = await self.publish_post(post.id)
                    results.append(result)
                except Exception as e:
                    results.append({
                        "success": False,
                        "post_id": post.id,
                        "error": str(e)
                    })
        
        return results
    
    # ==================== Campaign Management ====================
    
    def create_campaign(self, campaign_data: Dict[str, Any]) -> Campaign:
        """Create a new social media campaign."""
        campaign_id = f"camp_{datetime.now().timestamp()}"
        campaign = Campaign(
            id=campaign_id,
            name=campaign_data.get("name", ""),
            description=campaign_data.get("description", ""),
            platforms=[Platform(p) for p in campaign_data.get("platforms", [])],
            start_date=self._parse_datetime(campaign_data.get("start_date", datetime.now())),
            end_date=self._parse_datetime(campaign_data.get("end_date", datetime.now() + timedelta(days=30))),
            goals=campaign_data.get("goals", {}),
            hashtags=campaign_data.get("hashtags", []),
            budget=campaign_data.get("budget", 0)
        )
        self.campaigns[campaign_id] = campaign
        return campaign
    
    async def generate_campaign_content(
        self,
        campaign_id: str,
        posts_count: int = 10
    ) -> List[Post]:
        """Generate content for a campaign."""
        campaign = self.campaigns.get(campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")
        
        posts = []
        days = (campaign.end_date - campaign.start_date).days
        posts_per_day = max(1, posts_count // days)
        
        for i in range(posts_count):
            platform = campaign.platforms[i % len(campaign.platforms)]
            day_offset = i // posts_per_day
            
            # Generate content
            content = await self.generate_content(
                topic=campaign.name,
                platform=platform,
                template="promotional" if i % 3 == 0 else "educational"
            )
            
            # Create post
            scheduled_time = campaign.start_date + timedelta(days=day_offset)
            post = self.create_post({
                "content": content["content"],
                "platform": platform.value,
                "content_type": "text",
                "hashtags": campaign.hashtags + content["hashtags"],
                "campaign_id": campaign_id,
                "scheduled_for": scheduled_time
            })
            
            campaign.posts.append(post.id)
            posts.append(post)
        
        return posts
    
    # ==================== Analytics ====================
    
    async def get_post_analytics(self, post_id: str) -> Dict[str, Any]:
        """Get analytics for a specific post."""
        post = self.posts.get(post_id)
        if not post:
            raise ValueError(f"Post {post_id} not found")
        
        # Calculate engagement rate
        total_engagement = post.likes + post.comments + post.shares + post.saves
        engagement_rate = (total_engagement / post.impressions * 100) if post.impressions > 0 else 0
        
        return {
            "post_id": post_id,
            "platform": post.platform.value,
            "published_at": post.published_at.isoformat() if post.published_at else None,
            "metrics": {
                "likes": post.likes,
                "comments": post.comments,
                "shares": post.shares,
                "saves": post.saves,
                "impressions": post.impressions,
                "reach": post.reach,
                "clicks": post.clicks
            },
            "engagement_rate": round(engagement_rate, 2),
            "performance": self._rate_performance(engagement_rate)
        }
    
    def _rate_performance(self, engagement_rate: float) -> str:
        """Rate post performance based on engagement rate."""
        if engagement_rate >= 5:
            return "excellent"
        elif engagement_rate >= 3:
            return "good"
        elif engagement_rate >= 1:
            return "average"
        else:
            return "below_average"
    
    async def get_account_analytics(
        self,
        account_id: str,
        days: int = 30
    ) -> Dict[str, Any]:
        """Get analytics for a social media account."""
        account = self.accounts.get(account_id)
        if not account:
            raise ValueError(f"Account {account_id} not found")
        
        # Get posts for this account's platform
        cutoff_date = datetime.now() - timedelta(days=days)
        account_posts = [
            p for p in self.posts.values()
            if p.platform == account.platform and 
            p.published_at and p.published_at >= cutoff_date
        ]
        
        # Calculate totals
        total_likes = sum(p.likes for p in account_posts)
        total_comments = sum(p.comments for p in account_posts)
        total_shares = sum(p.shares for p in account_posts)
        total_impressions = sum(p.impressions for p in account_posts)
        
        return {
            "account_id": account_id,
            "platform": account.platform.value,
            "username": account.username,
            "period_days": days,
            "posts_count": len(account_posts),
            "totals": {
                "likes": total_likes,
                "comments": total_comments,
                "shares": total_shares,
                "impressions": total_impressions
            },
            "averages": {
                "likes_per_post": total_likes / len(account_posts) if account_posts else 0,
                "comments_per_post": total_comments / len(account_posts) if account_posts else 0,
                "engagement_rate": ((total_likes + total_comments + total_shares) / total_impressions * 100) if total_impressions > 0 else 0
            },
            "growth": {
                "followers": account.followers,
                "following": account.following
            }
        }
    
    async def get_best_performing_content(
        self,
        platform: Optional[Platform] = None,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Get best performing content."""
        posts = list(self.posts.values())
        
        if platform:
            posts = [p for p in posts if p.platform == platform]
        
        # Filter published posts
        posts = [p for p in posts if p.status == PostStatus.PUBLISHED]
        
        # Sort by engagement
        posts.sort(key=lambda p: p.likes + p.comments + p.shares, reverse=True)
        
        results = []
        for post in posts[:limit]:
            analytics = await self.get_post_analytics(post.id)
            results.append({
                "post_id": post.id,
                "content_preview": post.content[:100] + "..." if len(post.content) > 100 else post.content,
                "platform": post.platform.value,
                "analytics": analytics
            })
        
        return results
    
    # ==================== Content Ideas ====================
    
    def add_content_idea(self, idea_data: Dict[str, Any]) -> ContentIdea:
        """Add a content idea to the backlog."""
        idea_id = f"idea_{datetime.now().timestamp()}"
        idea = ContentIdea(
            id=idea_id,
            title=idea_data.get("title", ""),
            description=idea_data.get("description", ""),
            platforms=[Platform(p) for p in idea_data.get("platforms", ["twitter"])],
            content_types=[ContentType(t) for t in idea_data.get("content_types", ["text"])],
            topics=idea_data.get("topics", []),
            hooks=idea_data.get("hooks", []),
            cta=idea_data.get("cta", ""),
            priority=idea_data.get("priority", "medium")
        )
        self.content_ideas[idea_id] = idea
        return idea
    
    async def get_content_suggestions(
        self,
        platform: Platform,
        count: int = 5
    ) -> List[Dict[str, Any]]:
        """Get AI-generated content suggestions."""
        # In production, this would use AI to generate suggestions
        # based on trending topics, past performance, etc.
        
        suggestions = [
            {
                "type": "trending",
                "topic": "AI agents in business",
                "hook": "The future of work isn't about replacing humans...",
                "reason": "Trending topic in your niche"
            },
            {
                "type": "evergreen",
                "topic": "Productivity tips",
                "hook": "5 habits that 10x'd my productivity:",
                "reason": "High-performing content type"
            },
            {
                "type": "engagement",
                "topic": "Industry debate",
                "hook": "Unpopular opinion: Most automation fails because...",
                "reason": "Drives high engagement"
            },
            {
                "type": "educational",
                "topic": "How-to guide",
                "hook": "How to build your first AI agent (step-by-step):",
                "reason": "Educational content performs well"
            },
            {
                "type": "personal",
                "topic": "Behind the scenes",
                "hook": "What I learned from my biggest failure:",
                "reason": "Personal stories build connection"
            }
        ]
        
        return suggestions[:count]


# Convenience functions
async def create_social_media_agent(config: Optional[Dict] = None) -> SocialMediaAgent:
    """Create and initialize a social media agent."""
    return SocialMediaAgent(config)


async def run_daily_social_routine(agent: SocialMediaAgent) -> Dict[str, Any]:
    """Run daily social media routine."""
    results = {
        "posts_published": 0,
        "posts_scheduled": 0,
        "engagement_checked": 0
    }
    
    # Publish scheduled posts
    published = await agent.publish_scheduled_posts()
    results["posts_published"] = len([p for p in published if p.get("success")])
    
    # Get analytics for recent posts
    for post in list(agent.posts.values())[-10:]:
        if post.status == PostStatus.PUBLISHED:
            await agent.get_post_analytics(post.id)
            results["engagement_checked"] += 1
    
    return results
