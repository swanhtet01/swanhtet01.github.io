"""
Sales & Lead Generation Agent
==============================
Autonomous agent for finding leads, qualifying prospects, and conducting outreach.

Capabilities:
- Lead discovery from multiple sources
- Lead scoring and qualification
- Personalized email outreach
- Follow-up automation
- CRM integration
- Pipeline management
"""

import os
import json
import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
from enum import Enum


class LeadSource(Enum):
    """Sources for lead discovery."""
    LINKEDIN = "linkedin"
    WEBSITE = "website"
    REFERRAL = "referral"
    COLD_OUTREACH = "cold_outreach"
    INBOUND = "inbound"
    EVENT = "event"
    CONTENT = "content"
    PARTNERSHIP = "partnership"


class LeadStatus(Enum):
    """Lead pipeline stages."""
    NEW = "new"
    CONTACTED = "contacted"
    QUALIFIED = "qualified"
    PROPOSAL_SENT = "proposal_sent"
    NEGOTIATION = "negotiation"
    WON = "won"
    LOST = "lost"
    NURTURING = "nurturing"


class LeadScore(Enum):
    """Lead quality scores."""
    HOT = "hot"          # 80-100 points
    WARM = "warm"        # 50-79 points
    COLD = "cold"        # 20-49 points
    UNQUALIFIED = "unqualified"  # 0-19 points


@dataclass
class Lead:
    """Represents a sales lead."""
    id: str
    name: str
    email: str
    company: str
    title: str = ""
    source: LeadSource = LeadSource.COLD_OUTREACH
    status: LeadStatus = LeadStatus.NEW
    score: int = 0
    score_label: LeadScore = LeadScore.COLD
    phone: str = ""
    linkedin_url: str = ""
    website: str = ""
    industry: str = ""
    company_size: str = ""
    budget: str = ""
    timeline: str = ""
    pain_points: List[str] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)
    interactions: List[Dict[str, Any]] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.now)
    last_contacted: Optional[datetime] = None
    next_followup: Optional[datetime] = None
    tags: List[str] = field(default_factory=list)
    custom_fields: Dict[str, Any] = field(default_factory=dict)


@dataclass
class EmailTemplate:
    """Email template for outreach."""
    id: str
    name: str
    subject: str
    body: str
    category: str  # cold_outreach, followup, proposal, etc.
    variables: List[str] = field(default_factory=list)
    performance: Dict[str, float] = field(default_factory=dict)  # open_rate, reply_rate


class SalesAgent:
    """
    Autonomous Sales & Lead Generation Agent.
    
    Features:
    - Multi-source lead discovery
    - AI-powered lead scoring
    - Personalized email generation
    - Automated follow-up sequences
    - Pipeline management
    - Performance analytics
    """
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self.leads: Dict[str, Lead] = {}
        self.templates: Dict[str, EmailTemplate] = {}
        self.sequences: Dict[str, List[Dict]] = {}
        self.daily_limits = {
            "emails": 50,
            "linkedin_connections": 25,
            "calls": 10
        }
        self.sent_today = {"emails": 0, "linkedin_connections": 0, "calls": 0}
        
        # Initialize default templates
        self._init_default_templates()
        self._init_default_sequences()
    
    def _init_default_templates(self):
        """Initialize default email templates."""
        self.templates = {
            "cold_intro": EmailTemplate(
                id="cold_intro",
                name="Cold Introduction",
                subject="Quick question about {company}'s {pain_point}",
                body="""Hi {first_name},

I noticed {company} is {observation}. Many companies in {industry} face similar challenges with {pain_point}.

We've helped companies like {similar_company} achieve {result} by {solution_brief}.

Would you be open to a 15-minute call this week to explore if we could help {company} achieve similar results?

Best,
{sender_name}
{sender_title}
{company_name}""",
                category="cold_outreach",
                variables=["first_name", "company", "observation", "industry", "pain_point", 
                          "similar_company", "result", "solution_brief", "sender_name", 
                          "sender_title", "company_name"]
            ),
            "followup_1": EmailTemplate(
                id="followup_1",
                name="First Follow-up",
                subject="Re: Quick question about {company}'s {pain_point}",
                body="""Hi {first_name},

I wanted to follow up on my previous email. I understand you're busy, so I'll keep this brief.

{value_add}

Would a quick 10-minute call work better for your schedule?

Best,
{sender_name}""",
                category="followup",
                variables=["first_name", "company", "pain_point", "value_add", "sender_name"]
            ),
            "followup_2": EmailTemplate(
                id="followup_2",
                name="Second Follow-up",
                subject="One last thing, {first_name}",
                body="""Hi {first_name},

I don't want to be a pest, so this will be my last email.

I put together a quick {resource_type} that shows how {similar_company} solved their {pain_point} challenge: {resource_link}

If timing isn't right now, no worries at all. Feel free to reach out whenever it makes sense.

Best,
{sender_name}""",
                category="followup",
                variables=["first_name", "resource_type", "similar_company", "pain_point", 
                          "resource_link", "sender_name"]
            ),
            "proposal": EmailTemplate(
                id="proposal",
                name="Proposal Email",
                subject="Proposal for {company} - {project_name}",
                body="""Hi {first_name},

Thank you for taking the time to discuss {company}'s needs. As promised, I've put together a proposal outlining how we can help you {main_goal}.

**Proposal Summary:**
- Project: {project_name}
- Timeline: {timeline}
- Investment: {price}

**What's Included:**
{deliverables}

**Next Steps:**
1. Review the attached proposal
2. Let me know if you have any questions
3. Sign and return to get started

I'm available for a call if you'd like to discuss any details.

Best,
{sender_name}
{sender_title}""",
                category="proposal",
                variables=["first_name", "company", "project_name", "main_goal", "timeline",
                          "price", "deliverables", "sender_name", "sender_title"]
            ),
            "meeting_request": EmailTemplate(
                id="meeting_request",
                name="Meeting Request",
                subject="Let's schedule a call, {first_name}",
                body="""Hi {first_name},

I'd love to learn more about {company}'s goals for {topic}.

Here are a few times that work for me:
{available_times}

Or feel free to grab a time that works for you: {calendar_link}

Looking forward to connecting!

Best,
{sender_name}""",
                category="meeting",
                variables=["first_name", "company", "topic", "available_times", 
                          "calendar_link", "sender_name"]
            )
        }
    
    def _init_default_sequences(self):
        """Initialize default email sequences."""
        self.sequences = {
            "cold_outreach": [
                {"template": "cold_intro", "delay_days": 0},
                {"template": "followup_1", "delay_days": 3},
                {"template": "followup_2", "delay_days": 7},
            ],
            "warm_lead": [
                {"template": "meeting_request", "delay_days": 0},
                {"template": "followup_1", "delay_days": 2},
            ],
            "post_meeting": [
                {"template": "proposal", "delay_days": 1},
                {"template": "followup_1", "delay_days": 4},
            ]
        }
    
    async def discover_leads(
        self,
        criteria: Dict[str, Any],
        sources: List[LeadSource] = None,
        limit: int = 50
    ) -> List[Lead]:
        """
        Discover leads based on criteria.
        
        Args:
            criteria: Search criteria (industry, company_size, location, etc.)
            sources: Which sources to search
            limit: Maximum leads to return
        """
        sources = sources or [LeadSource.LINKEDIN, LeadSource.WEBSITE]
        discovered_leads = []
        
        for source in sources:
            if source == LeadSource.LINKEDIN:
                leads = await self._search_linkedin(criteria, limit // len(sources))
                discovered_leads.extend(leads)
            elif source == LeadSource.WEBSITE:
                leads = await self._search_websites(criteria, limit // len(sources))
                discovered_leads.extend(leads)
        
        # Score and store leads
        for lead in discovered_leads:
            lead.score = self._calculate_lead_score(lead, criteria)
            lead.score_label = self._get_score_label(lead.score)
            self.leads[lead.id] = lead
        
        return discovered_leads
    
    async def _search_linkedin(self, criteria: Dict, limit: int) -> List[Lead]:
        """Search LinkedIn for leads (placeholder for actual implementation)."""
        # In production, this would use LinkedIn API or scraping
        # For now, return structure for demonstration
        return []
    
    async def _search_websites(self, criteria: Dict, limit: int) -> List[Lead]:
        """Search websites for leads using web scraping."""
        # In production, this would use Firecrawl or similar
        return []
    
    def _calculate_lead_score(self, lead: Lead, criteria: Dict) -> int:
        """Calculate lead score based on fit criteria."""
        score = 0
        
        # Company size match (0-20 points)
        if lead.company_size:
            target_sizes = criteria.get("company_sizes", [])
            if lead.company_size in target_sizes:
                score += 20
        
        # Industry match (0-20 points)
        if lead.industry:
            target_industries = criteria.get("industries", [])
            if lead.industry in target_industries:
                score += 20
        
        # Title/role match (0-20 points)
        target_titles = criteria.get("titles", [])
        for title in target_titles:
            if title.lower() in lead.title.lower():
                score += 20
                break
        
        # Has email (0-15 points)
        if lead.email:
            score += 15
        
        # Has LinkedIn (0-10 points)
        if lead.linkedin_url:
            score += 10
        
        # Has phone (0-10 points)
        if lead.phone:
            score += 10
        
        # Budget indicated (0-5 points)
        if lead.budget:
            score += 5
        
        return min(score, 100)
    
    def _get_score_label(self, score: int) -> LeadScore:
        """Convert numeric score to label."""
        if score >= 80:
            return LeadScore.HOT
        elif score >= 50:
            return LeadScore.WARM
        elif score >= 20:
            return LeadScore.COLD
        else:
            return LeadScore.UNQUALIFIED
    
    async def qualify_lead(self, lead_id: str, qualification_data: Dict) -> Lead:
        """
        Qualify a lead with additional information.
        
        Args:
            lead_id: Lead identifier
            qualification_data: BANT data (Budget, Authority, Need, Timeline)
        """
        lead = self.leads.get(lead_id)
        if not lead:
            raise ValueError(f"Lead {lead_id} not found")
        
        # Update lead with qualification data
        if "budget" in qualification_data:
            lead.budget = qualification_data["budget"]
        if "timeline" in qualification_data:
            lead.timeline = qualification_data["timeline"]
        if "pain_points" in qualification_data:
            lead.pain_points = qualification_data["pain_points"]
        if "notes" in qualification_data:
            lead.notes.append(qualification_data["notes"])
        
        # Recalculate score
        lead.score = self._calculate_lead_score(lead, {})
        lead.score_label = self._get_score_label(lead.score)
        
        # Update status
        lead.status = LeadStatus.QUALIFIED
        
        return lead
    
    async def generate_personalized_email(
        self,
        lead_id: str,
        template_id: str,
        custom_variables: Optional[Dict[str, str]] = None,
        use_ai: bool = True
    ) -> Dict[str, str]:
        """
        Generate a personalized email for a lead.
        
        Args:
            lead_id: Lead identifier
            template_id: Email template to use
            custom_variables: Override template variables
            use_ai: Whether to use AI for personalization
        """
        lead = self.leads.get(lead_id)
        template = self.templates.get(template_id)
        
        if not lead:
            raise ValueError(f"Lead {lead_id} not found")
        if not template:
            raise ValueError(f"Template {template_id} not found")
        
        # Build variables
        variables = {
            "first_name": lead.name.split()[0] if lead.name else "there",
            "company": lead.company,
            "title": lead.title,
            "industry": lead.industry,
            "pain_point": lead.pain_points[0] if lead.pain_points else "growth challenges",
        }
        
        # Add custom variables
        if custom_variables:
            variables.update(custom_variables)
        
        # Generate email
        subject = template.subject
        body = template.body
        
        for var, value in variables.items():
            subject = subject.replace("{" + var + "}", str(value))
            body = body.replace("{" + var + "}", str(value))
        
        # Use AI for additional personalization if enabled
        if use_ai:
            email_content = await self._ai_personalize_email(lead, subject, body)
            subject = email_content.get("subject", subject)
            body = email_content.get("body", body)
        
        return {
            "to": lead.email,
            "subject": subject,
            "body": body,
            "lead_id": lead_id,
            "template_id": template_id
        }
    
    async def _ai_personalize_email(
        self,
        lead: Lead,
        subject: str,
        body: str
    ) -> Dict[str, str]:
        """Use AI to further personalize the email."""
        # In production, this would call the Intelligence Fabric
        # For now, return the original content
        return {"subject": subject, "body": body}
    
    async def send_email(
        self,
        email: Dict[str, str],
        track: bool = True
    ) -> Dict[str, Any]:
        """
        Send an email to a lead.
        
        Args:
            email: Email content (to, subject, body)
            track: Whether to track opens/clicks
        """
        # Check daily limits
        if self.sent_today["emails"] >= self.daily_limits["emails"]:
            return {
                "success": False,
                "error": "Daily email limit reached",
                "retry_after": "tomorrow"
            }
        
        lead_id = email.get("lead_id")
        lead = self.leads.get(lead_id) if lead_id else None
        
        # In production, this would use Gmail MCP or SMTP
        # For now, return success structure
        result = {
            "success": True,
            "message_id": f"msg_{datetime.now().timestamp()}",
            "sent_at": datetime.now().isoformat(),
            "to": email["to"],
            "subject": email["subject"]
        }
        
        # Update lead record
        if lead:
            lead.last_contacted = datetime.now()
            lead.interactions.append({
                "type": "email_sent",
                "timestamp": datetime.now().isoformat(),
                "subject": email["subject"],
                "message_id": result["message_id"]
            })
            if lead.status == LeadStatus.NEW:
                lead.status = LeadStatus.CONTACTED
        
        self.sent_today["emails"] += 1
        
        return result
    
    async def start_sequence(
        self,
        lead_id: str,
        sequence_id: str
    ) -> Dict[str, Any]:
        """
        Start an email sequence for a lead.
        
        Args:
            lead_id: Lead identifier
            sequence_id: Sequence to start
        """
        lead = self.leads.get(lead_id)
        sequence = self.sequences.get(sequence_id)
        
        if not lead:
            raise ValueError(f"Lead {lead_id} not found")
        if not sequence:
            raise ValueError(f"Sequence {sequence_id} not found")
        
        # Schedule sequence emails
        scheduled = []
        for i, step in enumerate(sequence):
            send_date = datetime.now() + timedelta(days=step["delay_days"])
            scheduled.append({
                "step": i + 1,
                "template": step["template"],
                "scheduled_for": send_date.isoformat(),
                "status": "pending"
            })
        
        # Store sequence state on lead
        lead.custom_fields["active_sequence"] = {
            "sequence_id": sequence_id,
            "started_at": datetime.now().isoformat(),
            "steps": scheduled
        }
        
        # Send first email immediately if delay is 0
        if sequence[0]["delay_days"] == 0:
            email = await self.generate_personalized_email(lead_id, sequence[0]["template"])
            await self.send_email(email)
            scheduled[0]["status"] = "sent"
        
        return {
            "lead_id": lead_id,
            "sequence_id": sequence_id,
            "scheduled_emails": scheduled
        }
    
    async def get_pipeline_summary(self) -> Dict[str, Any]:
        """Get summary of the sales pipeline."""
        summary = {
            "total_leads": len(self.leads),
            "by_status": {},
            "by_score": {},
            "by_source": {},
            "recent_activity": [],
            "follow_ups_due": []
        }
        
        for lead in self.leads.values():
            # Count by status
            status = lead.status.value
            summary["by_status"][status] = summary["by_status"].get(status, 0) + 1
            
            # Count by score
            score = lead.score_label.value
            summary["by_score"][score] = summary["by_score"].get(score, 0) + 1
            
            # Count by source
            source = lead.source.value
            summary["by_source"][source] = summary["by_source"].get(source, 0) + 1
            
            # Check for due follow-ups
            if lead.next_followup and lead.next_followup <= datetime.now():
                summary["follow_ups_due"].append({
                    "lead_id": lead.id,
                    "name": lead.name,
                    "company": lead.company,
                    "due": lead.next_followup.isoformat()
                })
        
        return summary
    
    async def get_daily_tasks(self) -> Dict[str, Any]:
        """Get prioritized daily tasks for sales activities."""
        tasks = {
            "high_priority": [],
            "medium_priority": [],
            "low_priority": []
        }
        
        for lead in self.leads.values():
            # Hot leads need immediate attention
            if lead.score_label == LeadScore.HOT and lead.status in [LeadStatus.NEW, LeadStatus.CONTACTED]:
                tasks["high_priority"].append({
                    "action": "follow_up",
                    "lead_id": lead.id,
                    "name": lead.name,
                    "company": lead.company,
                    "reason": "Hot lead needs attention"
                })
            
            # Proposals pending response
            elif lead.status == LeadStatus.PROPOSAL_SENT:
                days_since = (datetime.now() - lead.last_contacted).days if lead.last_contacted else 0
                if days_since >= 3:
                    tasks["medium_priority"].append({
                        "action": "follow_up_proposal",
                        "lead_id": lead.id,
                        "name": lead.name,
                        "company": lead.company,
                        "reason": f"Proposal sent {days_since} days ago"
                    })
            
            # Warm leads to nurture
            elif lead.score_label == LeadScore.WARM and lead.status == LeadStatus.NURTURING:
                tasks["low_priority"].append({
                    "action": "nurture",
                    "lead_id": lead.id,
                    "name": lead.name,
                    "company": lead.company,
                    "reason": "Warm lead in nurturing"
                })
        
        return tasks
    
    def add_lead(self, lead_data: Dict[str, Any]) -> Lead:
        """Manually add a lead."""
        lead_id = f"lead_{datetime.now().timestamp()}"
        lead = Lead(
            id=lead_id,
            name=lead_data.get("name", ""),
            email=lead_data.get("email", ""),
            company=lead_data.get("company", ""),
            title=lead_data.get("title", ""),
            source=LeadSource(lead_data.get("source", "cold_outreach")),
            phone=lead_data.get("phone", ""),
            linkedin_url=lead_data.get("linkedin_url", ""),
            website=lead_data.get("website", ""),
            industry=lead_data.get("industry", ""),
            company_size=lead_data.get("company_size", ""),
            pain_points=lead_data.get("pain_points", []),
            tags=lead_data.get("tags", [])
        )
        
        lead.score = self._calculate_lead_score(lead, {})
        lead.score_label = self._get_score_label(lead.score)
        
        self.leads[lead_id] = lead
        return lead
    
    def update_lead_status(self, lead_id: str, status: LeadStatus) -> Lead:
        """Update a lead's status."""
        lead = self.leads.get(lead_id)
        if not lead:
            raise ValueError(f"Lead {lead_id} not found")
        
        lead.status = status
        lead.interactions.append({
            "type": "status_change",
            "timestamp": datetime.now().isoformat(),
            "new_status": status.value
        })
        
        return lead
    
    async def export_leads(self, format: str = "json") -> str:
        """Export leads to file."""
        leads_data = []
        for lead in self.leads.values():
            leads_data.append({
                "id": lead.id,
                "name": lead.name,
                "email": lead.email,
                "company": lead.company,
                "title": lead.title,
                "status": lead.status.value,
                "score": lead.score,
                "source": lead.source.value,
                "created_at": lead.created_at.isoformat()
            })
        
        if format == "json":
            return json.dumps(leads_data, indent=2)
        elif format == "csv":
            # Simple CSV export
            headers = ["id", "name", "email", "company", "title", "status", "score", "source", "created_at"]
            lines = [",".join(headers)]
            for lead in leads_data:
                lines.append(",".join(str(lead.get(h, "")) for h in headers))
            return "\n".join(lines)
        
        return json.dumps(leads_data)


# Convenience functions for external use
async def create_sales_agent(config: Optional[Dict] = None) -> SalesAgent:
    """Create and initialize a sales agent."""
    agent = SalesAgent(config)
    return agent


async def run_daily_sales_routine(agent: SalesAgent) -> Dict[str, Any]:
    """Run the daily sales routine."""
    results = {
        "pipeline_summary": await agent.get_pipeline_summary(),
        "daily_tasks": await agent.get_daily_tasks(),
        "emails_sent": 0,
        "follow_ups_completed": 0
    }
    
    # Process high priority tasks
    tasks = results["daily_tasks"]
    for task in tasks.get("high_priority", [])[:10]:  # Limit to 10
        if task["action"] == "follow_up":
            try:
                email = await agent.generate_personalized_email(
                    task["lead_id"],
                    "followup_1"
                )
                await agent.send_email(email)
                results["emails_sent"] += 1
                results["follow_ups_completed"] += 1
            except Exception as e:
                results.setdefault("errors", []).append(str(e))
    
    return results
