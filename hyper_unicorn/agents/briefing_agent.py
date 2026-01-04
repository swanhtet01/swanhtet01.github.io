"""
Daily Briefing Agent
=====================
Autonomous agent for generating and delivering daily briefings.

Capabilities:
- Morning briefing generation
- Task and priority summaries
- Metric dashboards
- Calendar integration
- Email delivery
- Voice briefing (ElevenLabs)
"""

import os
import json
import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
from enum import Enum


class BriefingType(Enum):
    """Types of briefings."""
    MORNING = "morning"
    EVENING = "evening"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    CUSTOM = "custom"


class DeliveryMethod(Enum):
    """Briefing delivery methods."""
    EMAIL = "email"
    VOICE = "voice"
    DASHBOARD = "dashboard"
    SLACK = "slack"
    SMS = "sms"


@dataclass
class BriefingSection:
    """A section of a briefing."""
    title: str
    content: str
    priority: int = 0  # Higher = more important
    data: Dict[str, Any] = field(default_factory=dict)
    charts: List[str] = field(default_factory=list)


@dataclass
class Briefing:
    """Represents a complete briefing."""
    id: str
    type: BriefingType
    date: datetime
    recipient: str
    sections: List[BriefingSection] = field(default_factory=list)
    summary: str = ""
    audio_url: str = ""
    delivered: bool = False
    delivered_at: Optional[datetime] = None
    delivery_method: DeliveryMethod = DeliveryMethod.EMAIL


class DailyBriefingAgent:
    """
    Autonomous Daily Briefing Agent.
    
    Features:
    - Aggregates data from all agents
    - Generates personalized briefings
    - Delivers via email, voice, or dashboard
    - Tracks KPIs and metrics
    - Highlights priorities and blockers
    """
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self.briefings: Dict[str, Briefing] = {}
        
        # Data sources (would be connected to other agents)
        self.data_sources = {
            "projects": None,  # ProjectAgent
            "sales": None,  # SalesAgent
            "social": None,  # SocialMediaAgent
            "financial": None,  # FinancialAgent
            "calendar": None,  # CalendarIntegration
        }
        
        # Briefing templates
        self.templates = {
            BriefingType.MORNING: [
                "calendar_today",
                "priority_tasks",
                "metrics_snapshot",
                "opportunities",
                "blockers"
            ],
            BriefingType.EVENING: [
                "day_summary",
                "completed_tasks",
                "pending_items",
                "tomorrow_preview"
            ],
            BriefingType.WEEKLY: [
                "week_summary",
                "metrics_comparison",
                "project_status",
                "team_performance",
                "next_week_priorities"
            ]
        }
    
    # ==================== Briefing Generation ====================
    
    async def generate_briefing(
        self,
        briefing_type: BriefingType = BriefingType.MORNING,
        recipient: str = "ceo@supermega.dev",
        custom_sections: List[str] = None
    ) -> Briefing:
        """Generate a complete briefing."""
        briefing_id = f"brief_{datetime.now().timestamp()}"
        
        briefing = Briefing(
            id=briefing_id,
            type=briefing_type,
            date=datetime.now(),
            recipient=recipient
        )
        
        # Get sections to include
        sections_to_generate = custom_sections or self.templates.get(
            briefing_type, 
            self.templates[BriefingType.MORNING]
        )
        
        # Generate each section
        for section_name in sections_to_generate:
            section = await self._generate_section(section_name)
            if section:
                briefing.sections.append(section)
        
        # Sort by priority
        briefing.sections.sort(key=lambda s: s.priority, reverse=True)
        
        # Generate summary
        briefing.summary = await self._generate_summary(briefing)
        
        self.briefings[briefing_id] = briefing
        return briefing
    
    async def _generate_section(self, section_name: str) -> Optional[BriefingSection]:
        """Generate a specific briefing section."""
        generators = {
            "calendar_today": self._generate_calendar_section,
            "priority_tasks": self._generate_tasks_section,
            "metrics_snapshot": self._generate_metrics_section,
            "opportunities": self._generate_opportunities_section,
            "blockers": self._generate_blockers_section,
            "day_summary": self._generate_day_summary_section,
            "completed_tasks": self._generate_completed_section,
            "pending_items": self._generate_pending_section,
            "tomorrow_preview": self._generate_tomorrow_section,
            "week_summary": self._generate_week_summary_section,
            "metrics_comparison": self._generate_metrics_comparison_section,
            "project_status": self._generate_project_status_section,
            "team_performance": self._generate_team_performance_section,
            "next_week_priorities": self._generate_next_week_section,
        }
        
        generator = generators.get(section_name)
        if generator:
            return await generator()
        return None
    
    async def _generate_calendar_section(self) -> BriefingSection:
        """Generate calendar section for today."""
        # In production, would pull from Google Calendar
        today = datetime.now().strftime("%A, %B %d, %Y")
        
        events = [
            {"time": "09:00", "title": "Team Standup", "duration": "30 min"},
            {"time": "11:00", "title": "Client Call - Project Alpha", "duration": "1 hour"},
            {"time": "14:00", "title": "Sprint Planning", "duration": "2 hours"},
            {"time": "16:30", "title": "1:1 with Developer", "duration": "30 min"},
        ]
        
        content = f"📅 **Today's Schedule** ({today})\n\n"
        for event in events:
            content += f"• {event['time']} - {event['title']} ({event['duration']})\n"
        
        return BriefingSection(
            title="Today's Calendar",
            content=content,
            priority=10,
            data={"events": events}
        )
    
    async def _generate_tasks_section(self) -> BriefingSection:
        """Generate priority tasks section."""
        tasks = [
            {"title": "Review client proposal", "priority": "high", "due": "Today"},
            {"title": "Deploy agent updates", "priority": "high", "due": "Today"},
            {"title": "Respond to investor email", "priority": "medium", "due": "Today"},
            {"title": "Update documentation", "priority": "low", "due": "Tomorrow"},
        ]
        
        content = "🎯 **Priority Tasks**\n\n"
        
        high_priority = [t for t in tasks if t["priority"] == "high"]
        if high_priority:
            content += "**🔴 High Priority:**\n"
            for task in high_priority:
                content += f"• {task['title']} (Due: {task['due']})\n"
        
        medium_priority = [t for t in tasks if t["priority"] == "medium"]
        if medium_priority:
            content += "\n**🟡 Medium Priority:**\n"
            for task in medium_priority:
                content += f"• {task['title']} (Due: {task['due']})\n"
        
        return BriefingSection(
            title="Priority Tasks",
            content=content,
            priority=9,
            data={"tasks": tasks}
        )
    
    async def _generate_metrics_section(self) -> BriefingSection:
        """Generate metrics snapshot section."""
        metrics = {
            "revenue_mtd": {"value": 15420, "change": 12.5, "unit": "$"},
            "active_projects": {"value": 8, "change": 2, "unit": ""},
            "leads_this_week": {"value": 23, "change": -5, "unit": ""},
            "agent_tasks_completed": {"value": 156, "change": 34, "unit": ""},
            "social_engagement": {"value": 2.4, "change": 0.3, "unit": "%"},
        }
        
        content = "📊 **Metrics Snapshot**\n\n"
        
        for name, data in metrics.items():
            display_name = name.replace("_", " ").title()
            change_icon = "📈" if data["change"] > 0 else "📉" if data["change"] < 0 else "➡️"
            change_str = f"+{data['change']}" if data['change'] > 0 else str(data['change'])
            
            content += f"• **{display_name}:** {data['unit']}{data['value']} {change_icon} ({change_str})\n"
        
        return BriefingSection(
            title="Metrics Snapshot",
            content=content,
            priority=8,
            data={"metrics": metrics}
        )
    
    async def _generate_opportunities_section(self) -> BriefingSection:
        """Generate opportunities section."""
        opportunities = [
            {
                "type": "lead",
                "title": "Enterprise lead from LinkedIn",
                "value": "$50,000",
                "action": "Schedule discovery call"
            },
            {
                "type": "upsell",
                "title": "Client X interested in additional services",
                "value": "$10,000",
                "action": "Send proposal"
            },
            {
                "type": "partnership",
                "title": "Integration partnership with ToolY",
                "value": "Strategic",
                "action": "Review partnership terms"
            },
        ]
        
        content = "💰 **Opportunities**\n\n"
        for opp in opportunities:
            content += f"• **{opp['title']}**\n"
            content += f"  Value: {opp['value']} | Action: {opp['action']}\n\n"
        
        return BriefingSection(
            title="Opportunities",
            content=content,
            priority=7,
            data={"opportunities": opportunities}
        )
    
    async def _generate_blockers_section(self) -> BriefingSection:
        """Generate blockers section."""
        blockers = [
            {
                "project": "Project Alpha",
                "issue": "Waiting for client feedback on designs",
                "days_blocked": 3,
                "action": "Send follow-up email"
            },
            {
                "project": "Internal Tools",
                "issue": "API rate limit reached",
                "days_blocked": 1,
                "action": "Upgrade API plan"
            },
        ]
        
        if not blockers:
            content = "✅ **No Blockers** - All systems running smoothly!"
        else:
            content = "🚧 **Blockers & Issues**\n\n"
            for blocker in blockers:
                content += f"• **{blocker['project']}:** {blocker['issue']}\n"
                content += f"  Blocked: {blocker['days_blocked']} days | Action: {blocker['action']}\n\n"
        
        return BriefingSection(
            title="Blockers",
            content=content,
            priority=10 if blockers else 1,
            data={"blockers": blockers}
        )
    
    async def _generate_day_summary_section(self) -> BriefingSection:
        """Generate end-of-day summary."""
        summary = {
            "tasks_completed": 12,
            "tasks_started": 5,
            "meetings_attended": 4,
            "emails_sent": 23,
            "agent_actions": 89,
        }
        
        content = "📝 **Day Summary**\n\n"
        content += f"• Tasks Completed: {summary['tasks_completed']}\n"
        content += f"• Tasks Started: {summary['tasks_started']}\n"
        content += f"• Meetings: {summary['meetings_attended']}\n"
        content += f"• Emails Sent: {summary['emails_sent']}\n"
        content += f"• Agent Actions: {summary['agent_actions']}\n"
        
        return BriefingSection(
            title="Day Summary",
            content=content,
            priority=8,
            data=summary
        )
    
    async def _generate_completed_section(self) -> BriefingSection:
        """Generate completed tasks section."""
        completed = [
            "Deployed v1.5 agent updates",
            "Sent client proposal for Project Beta",
            "Reviewed and merged 5 PRs",
            "Updated documentation",
            "Processed 3 invoices",
        ]
        
        content = "✅ **Completed Today**\n\n"
        for item in completed:
            content += f"• {item}\n"
        
        return BriefingSection(
            title="Completed Tasks",
            content=content,
            priority=5,
            data={"completed": completed}
        )
    
    async def _generate_pending_section(self) -> BriefingSection:
        """Generate pending items section."""
        pending = [
            {"task": "Finalize Q1 report", "reason": "Waiting for financial data"},
            {"task": "Client onboarding", "reason": "Scheduled for tomorrow"},
        ]
        
        content = "⏳ **Pending Items**\n\n"
        for item in pending:
            content += f"• {item['task']}\n  Reason: {item['reason']}\n\n"
        
        return BriefingSection(
            title="Pending Items",
            content=content,
            priority=4,
            data={"pending": pending}
        )
    
    async def _generate_tomorrow_section(self) -> BriefingSection:
        """Generate tomorrow preview section."""
        tomorrow = datetime.now() + timedelta(days=1)
        
        preview = {
            "meetings": 3,
            "deadlines": ["Project Alpha milestone", "Invoice payment"],
            "priorities": ["Client presentation prep", "Sprint review"],
        }
        
        content = f"🔮 **Tomorrow Preview** ({tomorrow.strftime('%A, %B %d')})\n\n"
        content += f"• Meetings: {preview['meetings']}\n"
        content += f"• Deadlines: {', '.join(preview['deadlines'])}\n"
        content += f"• Priorities: {', '.join(preview['priorities'])}\n"
        
        return BriefingSection(
            title="Tomorrow Preview",
            content=content,
            priority=3,
            data=preview
        )
    
    async def _generate_week_summary_section(self) -> BriefingSection:
        """Generate weekly summary section."""
        summary = {
            "tasks_completed": 67,
            "revenue_generated": 8500,
            "new_leads": 15,
            "projects_delivered": 2,
            "agent_uptime": 99.8,
        }
        
        content = "📊 **Week Summary**\n\n"
        content += f"• Tasks Completed: {summary['tasks_completed']}\n"
        content += f"• Revenue Generated: ${summary['revenue_generated']:,}\n"
        content += f"• New Leads: {summary['new_leads']}\n"
        content += f"• Projects Delivered: {summary['projects_delivered']}\n"
        content += f"• Agent Uptime: {summary['agent_uptime']}%\n"
        
        return BriefingSection(
            title="Week Summary",
            content=content,
            priority=10,
            data=summary
        )
    
    async def _generate_metrics_comparison_section(self) -> BriefingSection:
        """Generate metrics comparison section."""
        comparison = {
            "revenue": {"this_week": 8500, "last_week": 7200, "change": 18.1},
            "leads": {"this_week": 15, "last_week": 12, "change": 25.0},
            "tasks": {"this_week": 67, "last_week": 54, "change": 24.1},
        }
        
        content = "📈 **Week-over-Week Comparison**\n\n"
        for metric, data in comparison.items():
            icon = "📈" if data["change"] > 0 else "📉"
            content += f"• **{metric.title()}:** {data['this_week']} vs {data['last_week']} ({icon} {data['change']:+.1f}%)\n"
        
        return BriefingSection(
            title="Metrics Comparison",
            content=content,
            priority=8,
            data=comparison
        )
    
    async def _generate_project_status_section(self) -> BriefingSection:
        """Generate project status section."""
        projects = [
            {"name": "Project Alpha", "progress": 75, "status": "on_track", "deadline": "Jan 15"},
            {"name": "Project Beta", "progress": 40, "status": "at_risk", "deadline": "Jan 20"},
            {"name": "Internal Tools", "progress": 90, "status": "on_track", "deadline": "Jan 10"},
        ]
        
        content = "📋 **Project Status**\n\n"
        for proj in projects:
            status_icon = "✅" if proj["status"] == "on_track" else "⚠️" if proj["status"] == "at_risk" else "🔴"
            content += f"• **{proj['name']}** {status_icon}\n"
            content += f"  Progress: {proj['progress']}% | Deadline: {proj['deadline']}\n\n"
        
        return BriefingSection(
            title="Project Status",
            content=content,
            priority=9,
            data={"projects": projects}
        )
    
    async def _generate_team_performance_section(self) -> BriefingSection:
        """Generate team/agent performance section."""
        agents = [
            {"name": "Research Agent", "tasks": 45, "success_rate": 98.2},
            {"name": "Code Agent", "tasks": 32, "success_rate": 95.5},
            {"name": "Content Agent", "tasks": 28, "success_rate": 97.8},
            {"name": "Sales Agent", "tasks": 19, "success_rate": 89.5},
        ]
        
        content = "🤖 **Agent Performance**\n\n"
        for agent in agents:
            content += f"• **{agent['name']}:** {agent['tasks']} tasks | {agent['success_rate']}% success\n"
        
        return BriefingSection(
            title="Agent Performance",
            content=content,
            priority=6,
            data={"agents": agents}
        )
    
    async def _generate_next_week_section(self) -> BriefingSection:
        """Generate next week priorities section."""
        priorities = [
            {"title": "Launch Project Alpha", "owner": "Code Agent", "deadline": "Monday"},
            {"title": "Close 3 new deals", "owner": "Sales Agent", "deadline": "Friday"},
            {"title": "Publish 5 blog posts", "owner": "Content Agent", "deadline": "Throughout week"},
            {"title": "Complete Q1 planning", "owner": "CEO", "deadline": "Wednesday"},
        ]
        
        content = "🎯 **Next Week Priorities**\n\n"
        for priority in priorities:
            content += f"• **{priority['title']}**\n"
            content += f"  Owner: {priority['owner']} | Deadline: {priority['deadline']}\n\n"
        
        return BriefingSection(
            title="Next Week Priorities",
            content=content,
            priority=7,
            data={"priorities": priorities}
        )
    
    async def _generate_summary(self, briefing: Briefing) -> str:
        """Generate executive summary for briefing."""
        # Count key items
        high_priority_count = 0
        blockers_count = 0
        opportunities_count = 0
        
        for section in briefing.sections:
            if section.title == "Priority Tasks":
                tasks = section.data.get("tasks", [])
                high_priority_count = len([t for t in tasks if t.get("priority") == "high"])
            elif section.title == "Blockers":
                blockers_count = len(section.data.get("blockers", []))
            elif section.title == "Opportunities":
                opportunities_count = len(section.data.get("opportunities", []))
        
        summary = f"Good morning! Here's your {briefing.type.value} briefing for {briefing.date.strftime('%A, %B %d')}.\n\n"
        
        if high_priority_count > 0:
            summary += f"You have {high_priority_count} high-priority tasks today. "
        
        if blockers_count > 0:
            summary += f"There are {blockers_count} blockers requiring attention. "
        
        if opportunities_count > 0:
            summary += f"You have {opportunities_count} opportunities to review. "
        
        summary += "\n\nLet's make it a productive day!"
        
        return summary
    
    # ==================== Delivery ====================
    
    async def deliver_briefing(
        self,
        briefing_id: str,
        method: DeliveryMethod = DeliveryMethod.EMAIL
    ) -> Dict[str, Any]:
        """Deliver a briefing via specified method."""
        briefing = self.briefings.get(briefing_id)
        if not briefing:
            raise ValueError(f"Briefing {briefing_id} not found")
        
        if method == DeliveryMethod.EMAIL:
            result = await self._deliver_via_email(briefing)
        elif method == DeliveryMethod.VOICE:
            result = await self._deliver_via_voice(briefing)
        elif method == DeliveryMethod.DASHBOARD:
            result = await self._deliver_via_dashboard(briefing)
        else:
            result = {"success": False, "error": f"Unsupported delivery method: {method}"}
        
        if result.get("success"):
            briefing.delivered = True
            briefing.delivered_at = datetime.now()
            briefing.delivery_method = method
        
        return result
    
    async def _deliver_via_email(self, briefing: Briefing) -> Dict[str, Any]:
        """Deliver briefing via email."""
        # Format briefing as email
        subject = f"🦄 {briefing.type.value.title()} Briefing - {briefing.date.strftime('%B %d, %Y')}"
        
        body = f"{briefing.summary}\n\n"
        body += "=" * 50 + "\n\n"
        
        for section in briefing.sections:
            body += f"{section.content}\n\n"
            body += "-" * 30 + "\n\n"
        
        body += "\n\n---\nGenerated by HYPER UNICORN 🦄\nSuperMega.dev"
        
        # In production, would send via Gmail API
        return {
            "success": True,
            "method": "email",
            "recipient": briefing.recipient,
            "subject": subject,
            "body_length": len(body)
        }
    
    async def _deliver_via_voice(self, briefing: Briefing) -> Dict[str, Any]:
        """Deliver briefing via voice (ElevenLabs)."""
        # Convert briefing to speech-friendly text
        speech_text = self._convert_to_speech_text(briefing)
        
        # In production, would use ElevenLabs API
        # from elevenlabs import generate, save
        # audio = generate(text=speech_text, voice="Rachel")
        # save(audio, f"briefing_{briefing.id}.mp3")
        
        return {
            "success": True,
            "method": "voice",
            "text_length": len(speech_text),
            "audio_url": f"https://supermega.dev/briefings/{briefing.id}.mp3"
        }
    
    def _convert_to_speech_text(self, briefing: Briefing) -> str:
        """Convert briefing to speech-friendly text."""
        text = briefing.summary.replace("**", "").replace("•", "").replace("#", "")
        
        for section in briefing.sections[:5]:  # Limit for voice
            section_text = section.content.replace("**", "").replace("•", "").replace("#", "")
            text += f"\n\n{section_text}"
        
        return text
    
    async def _deliver_via_dashboard(self, briefing: Briefing) -> Dict[str, Any]:
        """Make briefing available on dashboard."""
        return {
            "success": True,
            "method": "dashboard",
            "url": f"https://supermega.dev/dashboard/briefings/{briefing.id}"
        }
    
    # ==================== Scheduling ====================
    
    async def schedule_daily_briefings(
        self,
        recipient: str,
        morning_time: str = "07:00",
        evening_time: str = "18:00",
        delivery_method: DeliveryMethod = DeliveryMethod.EMAIL
    ) -> Dict[str, Any]:
        """Schedule daily briefings."""
        schedule = {
            "recipient": recipient,
            "morning": {
                "time": morning_time,
                "type": BriefingType.MORNING,
                "delivery": delivery_method.value
            },
            "evening": {
                "time": evening_time,
                "type": BriefingType.EVENING,
                "delivery": delivery_method.value
            }
        }
        
        return {
            "success": True,
            "schedule": schedule,
            "message": f"Daily briefings scheduled for {recipient}"
        }


# Convenience functions
async def create_briefing_agent(config: Optional[Dict] = None) -> DailyBriefingAgent:
    """Create and initialize a briefing agent."""
    return DailyBriefingAgent(config)


async def generate_and_send_morning_briefing(
    agent: DailyBriefingAgent,
    recipient: str
) -> Dict[str, Any]:
    """Generate and send morning briefing."""
    briefing = await agent.generate_briefing(
        briefing_type=BriefingType.MORNING,
        recipient=recipient
    )
    
    result = await agent.deliver_briefing(briefing.id, DeliveryMethod.EMAIL)
    
    return {
        "briefing_id": briefing.id,
        "sections": len(briefing.sections),
        "delivery": result
    }
