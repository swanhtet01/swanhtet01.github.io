"""
Communication Agent
===================
Autonomous email and calendar management agent.
Handles email processing, scheduling, and automated communications.

Features:
- Email reading, searching, and sending
- Calendar management and scheduling
- Meeting scheduling with availability check
- Automated follow-ups
- Email summarization and prioritization
- Smart notifications

Author: Manus AI for SuperMega.dev
"""

import os
import sys
import json
import asyncio
import subprocess
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any, Union
from dataclasses import dataclass, field

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False


@dataclass
class Email:
    """Email data structure."""
    id: str
    thread_id: str = ""
    subject: str = ""
    sender: str = ""
    recipients: List[str] = field(default_factory=list)
    date: str = ""
    body: str = ""
    snippet: str = ""
    labels: List[str] = field(default_factory=list)
    attachments: List[Dict] = field(default_factory=list)
    is_read: bool = True
    is_important: bool = False


@dataclass
class CalendarEvent:
    """Calendar event data structure."""
    id: str
    title: str
    start: str
    end: str
    description: str = ""
    location: str = ""
    attendees: List[str] = field(default_factory=list)
    status: str = "confirmed"
    link: str = ""


@dataclass
class EmailDraft:
    """Email draft for sending."""
    to: List[str]
    subject: str
    body: str
    cc: List[str] = field(default_factory=list)
    bcc: List[str] = field(default_factory=list)
    reply_to: Optional[str] = None


class MCPClient:
    """
    MCP Client for Gmail and Google Calendar.
    Uses manus-mcp-cli to interact with MCP servers.
    """
    
    def __init__(self):
        self.mcp_cli = "manus-mcp-cli"
    
    def _call_tool(self, server: str, tool: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Call an MCP tool and return the result."""
        try:
            cmd = [
                self.mcp_cli, "tool", "call", tool,
                "--server", server,
                "--input", json.dumps(args)
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=60
            )
            
            if result.returncode == 0:
                # Parse the result file path from output
                output = result.stdout.strip()
                if "result_file_path" in output or ".json" in output:
                    # Extract file path and read it
                    import re
                    match = re.search(r'/tmp/manus-mcp/[^\s"]+\.json', output)
                    if match:
                        with open(match.group(), 'r') as f:
                            return json.load(f)
                
                # Try to parse output directly
                try:
                    return json.loads(output)
                except json.JSONDecodeError:
                    return {"raw_output": output}
            else:
                return {"error": result.stderr}
                
        except subprocess.TimeoutExpired:
            return {"error": "Command timed out"}
        except Exception as e:
            return {"error": str(e)}
    
    # =========================================================================
    # Gmail Methods
    # =========================================================================
    
    def search_emails(
        self,
        query: str,
        max_results: int = 10
    ) -> List[Dict[str, Any]]:
        """Search emails using Gmail query syntax."""
        result = self._call_tool(
            server="gmail",
            tool="gmail_search_messages",
            args={"query": query, "maxResults": max_results}
        )
        
        if "error" in result:
            print(f"Error searching emails: {result['error']}")
            return []
        
        return result.get("messages", result.get("content", []))
    
    def get_email(self, message_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific email by ID."""
        result = self._call_tool(
            server="gmail",
            tool="gmail_get_message",
            args={"messageId": message_id}
        )
        
        if "error" in result:
            return None
        
        return result
    
    def send_email(
        self,
        to: List[str],
        subject: str,
        body: str,
        cc: List[str] = None,
        bcc: List[str] = None
    ) -> Dict[str, Any]:
        """Send an email."""
        args = {
            "to": to if isinstance(to, list) else [to],
            "subject": subject,
            "body": body
        }
        
        if cc:
            args["cc"] = cc
        if bcc:
            args["bcc"] = bcc
        
        return self._call_tool(
            server="gmail",
            tool="gmail_send_message",
            args=args
        )
    
    def create_draft(
        self,
        to: List[str],
        subject: str,
        body: str
    ) -> Dict[str, Any]:
        """Create an email draft."""
        return self._call_tool(
            server="gmail",
            tool="gmail_create_draft",
            args={
                "to": to if isinstance(to, list) else [to],
                "subject": subject,
                "body": body
            }
        )
    
    # =========================================================================
    # Calendar Methods
    # =========================================================================
    
    def search_events(
        self,
        query: str,
        time_min: Optional[str] = None,
        time_max: Optional[str] = None,
        max_results: int = 10
    ) -> List[Dict[str, Any]]:
        """Search calendar events."""
        args = {"query": query, "maxResults": max_results}
        
        if time_min:
            args["timeMin"] = time_min
        if time_max:
            args["timeMax"] = time_max
        
        result = self._call_tool(
            server="google-calendar",
            tool="google_calendar_search_events",
            args=args
        )
        
        if "error" in result:
            print(f"Error searching events: {result['error']}")
            return []
        
        return result.get("events", result.get("content", []))
    
    def create_event(
        self,
        summary: str,
        start: str,
        end: str,
        description: str = "",
        location: str = "",
        attendees: List[str] = None
    ) -> Dict[str, Any]:
        """Create a calendar event."""
        args = {
            "summary": summary,
            "start": start,
            "end": end
        }
        
        if description:
            args["description"] = description
        if location:
            args["location"] = location
        if attendees:
            args["attendees"] = attendees
        
        return self._call_tool(
            server="google-calendar",
            tool="google_calendar_create_event",
            args=args
        )
    
    def get_free_busy(
        self,
        time_min: str,
        time_max: str
    ) -> Dict[str, Any]:
        """Get free/busy information."""
        return self._call_tool(
            server="google-calendar",
            tool="google_calendar_get_freebusy",
            args={
                "timeMin": time_min,
                "timeMax": time_max
            }
        )


class CommunicationAgent:
    """
    Autonomous Communication Agent
    
    Manages email and calendar operations with AI-powered intelligence.
    """
    
    def __init__(self, model: str = "gemini-2.0-flash"):
        self.model = model
        self.mcp = MCPClient()
        
        # Initialize Gemini
        if GEMINI_AVAILABLE:
            genai.configure(api_key=os.getenv("GEMINI_API_KEY", ""))
            self.llm = genai.GenerativeModel(model)
        else:
            self.llm = None
    
    # =========================================================================
    # Email Intelligence
    # =========================================================================
    
    async def summarize_inbox(self, max_emails: int = 20) -> Dict[str, Any]:
        """
        Summarize the inbox with AI-powered analysis.
        
        Returns:
            Summary with priorities, action items, and insights
        """
        # Get recent emails
        emails = self.mcp.search_emails("is:inbox", max_results=max_emails)
        
        if not emails:
            return {"summary": "No emails found", "emails": []}
        
        # Build summary prompt
        email_data = json.dumps(emails[:10], indent=2, default=str)
        
        prompt = f"""Analyze these emails and provide an executive summary:

{email_data}

Provide your analysis in JSON format:
{{
    "summary": "2-3 sentence overview of inbox status",
    "urgent_count": number,
    "action_required": [
        {{"subject": "...", "from": "...", "action": "what needs to be done"}}
    ],
    "categories": {{
        "work": count,
        "personal": count,
        "newsletters": count,
        "other": count
    }},
    "key_senders": ["most important senders"],
    "recommended_actions": ["action 1", "action 2"]
}}

Respond ONLY with the JSON object."""

        result = {
            "emails": emails,
            "total_count": len(emails)
        }
        
        if self.llm:
            try:
                response = self.llm.generate_content(prompt)
                response_text = response.text.strip()
                
                if "```json" in response_text:
                    response_text = response_text.split("```json")[1].split("```")[0]
                elif "```" in response_text:
                    response_text = response_text.split("```")[1].split("```")[0]
                
                analysis = json.loads(response_text)
                result.update(analysis)
                
            except Exception as e:
                print(f"Error in AI analysis: {e}")
                result["summary"] = f"Found {len(emails)} emails in inbox"
        
        return result
    
    async def draft_reply(
        self,
        email_id: str,
        instructions: str = "Write a professional reply"
    ) -> EmailDraft:
        """
        Draft a reply to an email using AI.
        
        Args:
            email_id: ID of the email to reply to
            instructions: Instructions for the reply
            
        Returns:
            EmailDraft ready to send
        """
        # Get the original email
        email = self.mcp.get_email(email_id)
        
        if not email:
            return EmailDraft(to=[], subject="", body="Error: Email not found")
        
        prompt = f"""Draft a reply to this email:

Original Email:
From: {email.get('from', 'Unknown')}
Subject: {email.get('subject', 'No subject')}
Body: {email.get('body', email.get('snippet', 'No content'))}

Instructions: {instructions}

Write a professional reply. Respond with JSON:
{{
    "subject": "Re: original subject",
    "body": "the reply body"
}}

Respond ONLY with the JSON object."""

        draft = EmailDraft(
            to=[email.get('from', '')],
            subject=f"Re: {email.get('subject', '')}",
            body=""
        )
        
        if self.llm:
            try:
                response = self.llm.generate_content(prompt)
                response_text = response.text.strip()
                
                if "```json" in response_text:
                    response_text = response_text.split("```json")[1].split("```")[0]
                elif "```" in response_text:
                    response_text = response_text.split("```")[1].split("```")[0]
                
                reply_data = json.loads(response_text)
                draft.subject = reply_data.get("subject", draft.subject)
                draft.body = reply_data.get("body", "")
                
            except Exception as e:
                print(f"Error drafting reply: {e}")
        
        return draft
    
    async def compose_email(
        self,
        recipient: str,
        purpose: str,
        context: str = ""
    ) -> EmailDraft:
        """
        Compose a new email using AI.
        
        Args:
            recipient: Email recipient
            purpose: Purpose of the email
            context: Additional context
            
        Returns:
            EmailDraft ready to send
        """
        prompt = f"""Compose a professional email:

Recipient: {recipient}
Purpose: {purpose}
Context: {context}

Write a professional email. Respond with JSON:
{{
    "subject": "appropriate subject line",
    "body": "the email body"
}}

Respond ONLY with the JSON object."""

        draft = EmailDraft(to=[recipient], subject="", body="")
        
        if self.llm:
            try:
                response = self.llm.generate_content(prompt)
                response_text = response.text.strip()
                
                if "```json" in response_text:
                    response_text = response_text.split("```json")[1].split("```")[0]
                elif "```" in response_text:
                    response_text = response_text.split("```")[1].split("```")[0]
                
                email_data = json.loads(response_text)
                draft.subject = email_data.get("subject", "")
                draft.body = email_data.get("body", "")
                
            except Exception as e:
                print(f"Error composing email: {e}")
        
        return draft
    
    # =========================================================================
    # Calendar Intelligence
    # =========================================================================
    
    async def get_schedule_summary(
        self,
        days: int = 7
    ) -> Dict[str, Any]:
        """
        Get a summary of upcoming schedule.
        
        Args:
            days: Number of days to look ahead
            
        Returns:
            Schedule summary with insights
        """
        now = datetime.utcnow()
        time_min = now.isoformat() + "Z"
        time_max = (now + timedelta(days=days)).isoformat() + "Z"
        
        events = self.mcp.search_events(
            query="",
            time_min=time_min,
            time_max=time_max,
            max_results=50
        )
        
        result = {
            "events": events,
            "total_count": len(events),
            "period": f"Next {days} days"
        }
        
        if not events:
            result["summary"] = "No upcoming events"
            return result
        
        # AI analysis
        if self.llm:
            prompt = f"""Analyze this calendar schedule for the next {days} days:

{json.dumps(events[:20], indent=2, default=str)}

Provide analysis in JSON format:
{{
    "summary": "brief overview of the schedule",
    "busy_days": ["Monday", "Wednesday"],
    "free_slots": ["Tuesday afternoon", "Friday morning"],
    "meeting_count": number,
    "total_hours_booked": number,
    "recommendations": ["suggestion 1", "suggestion 2"]
}}

Respond ONLY with the JSON object."""

            try:
                response = self.llm.generate_content(prompt)
                response_text = response.text.strip()
                
                if "```json" in response_text:
                    response_text = response_text.split("```json")[1].split("```")[0]
                elif "```" in response_text:
                    response_text = response_text.split("```")[1].split("```")[0]
                
                analysis = json.loads(response_text)
                result.update(analysis)
                
            except Exception as e:
                print(f"Error in schedule analysis: {e}")
        
        return result
    
    async def schedule_meeting(
        self,
        title: str,
        duration_minutes: int = 60,
        attendees: List[str] = None,
        preferred_times: str = "business hours",
        description: str = ""
    ) -> Dict[str, Any]:
        """
        Intelligently schedule a meeting.
        
        Args:
            title: Meeting title
            duration_minutes: Duration in minutes
            attendees: List of attendee emails
            preferred_times: Preference for timing
            description: Meeting description
            
        Returns:
            Created event or suggestions
        """
        # Get current schedule
        now = datetime.utcnow()
        time_min = now.isoformat() + "Z"
        time_max = (now + timedelta(days=14)).isoformat() + "Z"
        
        # Check free/busy
        free_busy = self.mcp.get_free_busy(time_min, time_max)
        
        # Find available slot using AI
        if self.llm:
            prompt = f"""Find the best time slot for a meeting:

Meeting: {title}
Duration: {duration_minutes} minutes
Preferred times: {preferred_times}
Current free/busy data: {json.dumps(free_busy, default=str)}

Suggest the best time slot in JSON format:
{{
    "suggested_start": "ISO datetime",
    "suggested_end": "ISO datetime",
    "reasoning": "why this time is good",
    "alternatives": [
        {{"start": "ISO datetime", "end": "ISO datetime"}}
    ]
}}

Use times within the next 14 days. Respond ONLY with the JSON object."""

            try:
                response = self.llm.generate_content(prompt)
                response_text = response.text.strip()
                
                if "```json" in response_text:
                    response_text = response_text.split("```json")[1].split("```")[0]
                elif "```" in response_text:
                    response_text = response_text.split("```")[1].split("```")[0]
                
                suggestion = json.loads(response_text)
                
                # Create the event
                event_result = self.mcp.create_event(
                    summary=title,
                    start=suggestion.get("suggested_start"),
                    end=suggestion.get("suggested_end"),
                    description=description,
                    attendees=attendees or []
                )
                
                return {
                    "status": "created" if "error" not in event_result else "failed",
                    "event": event_result,
                    "suggestion": suggestion
                }
                
            except Exception as e:
                print(f"Error scheduling meeting: {e}")
                return {"status": "error", "error": str(e)}
        
        return {"status": "error", "error": "AI not available"}
    
    # =========================================================================
    # Automated Workflows
    # =========================================================================
    
    async def process_inbox_actions(self) -> Dict[str, Any]:
        """
        Automatically process inbox and take actions.
        
        Returns:
            Summary of actions taken
        """
        actions_taken = []
        
        # Get inbox summary
        summary = await self.summarize_inbox()
        
        # Process action items
        for item in summary.get("action_required", []):
            action = item.get("action", "")
            
            if "reply" in action.lower():
                # Draft a reply
                # Note: Would need email ID to actually draft
                actions_taken.append({
                    "type": "draft_reply",
                    "email": item.get("subject"),
                    "status": "suggested"
                })
            
            elif "schedule" in action.lower() or "meeting" in action.lower():
                # Suggest scheduling
                actions_taken.append({
                    "type": "schedule_meeting",
                    "email": item.get("subject"),
                    "status": "suggested"
                })
        
        return {
            "inbox_summary": summary.get("summary"),
            "actions_taken": actions_taken,
            "recommendations": summary.get("recommended_actions", [])
        }
    
    async def send_daily_digest(self, recipient: str) -> Dict[str, Any]:
        """
        Send a daily digest email.
        
        Args:
            recipient: Email to send digest to
            
        Returns:
            Send result
        """
        # Get inbox summary
        inbox = await self.summarize_inbox()
        
        # Get schedule summary
        schedule = await self.get_schedule_summary(days=1)
        
        # Compose digest
        digest_body = f"""
Good morning!

Here's your daily digest:

📧 INBOX SUMMARY
{inbox.get('summary', 'No summary available')}

Urgent items: {inbox.get('urgent_count', 0)}
Action required: {len(inbox.get('action_required', []))}

📅 TODAY'S SCHEDULE
{schedule.get('summary', 'No events today')}

Meetings: {schedule.get('meeting_count', 0)}

💡 RECOMMENDATIONS
{chr(10).join('• ' + r for r in inbox.get('recommended_actions', ['No recommendations']))}

Have a productive day!
"""
        
        # Send the digest
        result = self.mcp.send_email(
            to=[recipient],
            subject=f"Daily Digest - {datetime.now().strftime('%B %d, %Y')}",
            body=digest_body
        )
        
        return {
            "status": "sent" if "error" not in result else "failed",
            "result": result
        }
    
    # =========================================================================
    # Main Execute Method
    # =========================================================================
    
    async def execute(self, task: str) -> Dict[str, Any]:
        """
        Execute a communication task.
        
        Args:
            task: Natural language description of the task
            
        Returns:
            Result dictionary
        """
        result = {
            "task": task,
            "status": "completed",
            "data": {},
            "timestamp": datetime.utcnow().isoformat()
        }
        
        # Use AI to understand the task
        if self.llm:
            prompt = f"""Parse this communication task:

Task: {task}

Extract in JSON format:
{{
    "action": "summarize_inbox|search_emails|send_email|draft_reply|compose|schedule_meeting|get_schedule|daily_digest",
    "parameters": {{
        "query": "search query if applicable",
        "recipient": "email if applicable",
        "subject": "subject if applicable",
        "body": "body if applicable",
        "title": "meeting title if applicable",
        "duration": minutes if applicable
    }}
}}

Respond ONLY with the JSON object."""

            try:
                response = self.llm.generate_content(prompt)
                response_text = response.text.strip()
                
                if "```json" in response_text:
                    response_text = response_text.split("```json")[1].split("```")[0]
                elif "```" in response_text:
                    response_text = response_text.split("```")[1].split("```")[0]
                
                params = json.loads(response_text)
                action = params.get("action", "")
                p = params.get("parameters", {})
                
                if action == "summarize_inbox":
                    result["data"] = await self.summarize_inbox()
                
                elif action == "search_emails":
                    result["data"]["emails"] = self.mcp.search_emails(
                        p.get("query", "is:inbox")
                    )
                
                elif action == "send_email":
                    result["data"] = self.mcp.send_email(
                        to=[p.get("recipient", "")],
                        subject=p.get("subject", ""),
                        body=p.get("body", "")
                    )
                
                elif action == "compose":
                    draft = await self.compose_email(
                        recipient=p.get("recipient", ""),
                        purpose=task
                    )
                    result["data"] = {
                        "to": draft.to,
                        "subject": draft.subject,
                        "body": draft.body
                    }
                
                elif action == "schedule_meeting":
                    result["data"] = await self.schedule_meeting(
                        title=p.get("title", "Meeting"),
                        duration_minutes=p.get("duration", 60)
                    )
                
                elif action == "get_schedule":
                    result["data"] = await self.get_schedule_summary()
                
                elif action == "daily_digest":
                    result["data"] = await self.send_daily_digest(
                        p.get("recipient", "")
                    )
                
            except Exception as e:
                result["status"] = "error"
                result["error"] = str(e)
        
        return result


# ============================================================================
# Example Usage
# ============================================================================

async def main():
    """Example usage of the Communication Agent."""
    agent = CommunicationAgent()
    
    # Example 1: Summarize inbox
    summary = await agent.summarize_inbox()
    print(json.dumps(summary, indent=2, default=str))
    
    # Example 2: Get schedule
    # schedule = await agent.get_schedule_summary()
    # print(json.dumps(schedule, indent=2, default=str))
    
    # Example 3: Execute natural language task
    # result = await agent.execute("What meetings do I have this week?")
    # print(json.dumps(result, indent=2, default=str))


if __name__ == "__main__":
    asyncio.run(main())
