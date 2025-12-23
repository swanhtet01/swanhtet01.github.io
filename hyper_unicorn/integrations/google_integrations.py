"""
Google Integrations for HYPER UNICORN
=====================================
Provides agents with access to Gmail, Google Calendar, and Google Drive
using the MCP servers and rclone.

Author: Manus AI
Date: December 2025
"""

import subprocess
import json
import os
import logging
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from datetime import datetime, timedelta

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("GoogleIntegrations")


# ============================================================================
# MCP Client Wrapper
# ============================================================================

class MCPClient:
    """Wrapper for the manus-mcp-cli tool."""
    
    def __init__(self, server: str):
        self.server = server
    
    def call_tool(self, tool_name: str, input_data: Dict) -> Dict:
        """Call an MCP tool and return the result."""
        cmd = [
            "manus-mcp-cli", "tool", "call", tool_name,
            "--server", self.server,
            "--input", json.dumps(input_data)
        ]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            if result.returncode != 0:
                logger.error(f"MCP call failed: {result.stderr}")
                return {"error": result.stderr}
            
            # Parse the output (assuming JSON)
            try:
                return json.loads(result.stdout)
            except json.JSONDecodeError:
                return {"raw_output": result.stdout}
        except subprocess.TimeoutExpired:
            return {"error": "MCP call timed out"}
        except Exception as e:
            return {"error": str(e)}
    
    def list_tools(self) -> List[str]:
        """List available tools for this server."""
        cmd = ["manus-mcp-cli", "tool", "list", "--server", self.server]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            if result.returncode != 0:
                return []
            return result.stdout.strip().split('\n')
        except Exception:
            return []


# ============================================================================
# Gmail Integration
# ============================================================================

class GmailIntegration:
    """Gmail integration using MCP server."""
    
    def __init__(self):
        self.mcp = MCPClient("gmail")
    
    def search_messages(
        self, 
        query: str, 
        max_results: int = 10,
        include_spam_trash: bool = False
    ) -> Dict:
        """
        Search Gmail messages.
        
        Args:
            query: Gmail search query (e.g., "from:example@gmail.com", "is:unread")
            max_results: Maximum number of results to return
            include_spam_trash: Whether to include spam and trash
        
        Returns:
            Dict with search results
        """
        return self.mcp.call_tool("gmail_search_messages", {
            "q": query,
            "max_results": max_results,
            "include_spam_trash": include_spam_trash
        })
    
    def read_threads(self, thread_ids: List[str]) -> Dict:
        """
        Read full thread content.
        
        Args:
            thread_ids: List of thread IDs to read
        
        Returns:
            Dict with thread content
        """
        return self.mcp.call_tool("gmail_read_threads", {
            "thread_ids": thread_ids
        })
    
    def send_message(
        self,
        to: List[str],
        subject: str,
        content: str,
        cc: Optional[List[str]] = None,
        bcc: Optional[List[str]] = None,
        is_draft: bool = False
    ) -> Dict:
        """
        Send an email or create a draft.
        
        Args:
            to: List of recipient email addresses
            subject: Email subject
            content: Email body content
            cc: CC recipients
            bcc: BCC recipients
            is_draft: If True, creates a draft instead of sending
        
        Returns:
            Dict with send/draft result
        """
        message = {
            "to": to,
            "subject": subject,
            "content": content
        }
        if cc:
            message["cc"] = cc
        if bcc:
            message["bcc"] = bcc
        
        return self.mcp.call_tool("gmail_send_messages", {
            "messages": [message],
            "is_draft": is_draft
        })
    
    def get_unread_important(self, max_results: int = 10) -> Dict:
        """Get unread important emails."""
        return self.search_messages("is:unread is:important", max_results)
    
    def get_recent_from(self, sender: str, days: int = 7) -> Dict:
        """Get recent emails from a specific sender."""
        date = (datetime.now() - timedelta(days=days)).strftime("%Y/%m/%d")
        return self.search_messages(f"from:{sender} after:{date}")


# ============================================================================
# Google Calendar Integration
# ============================================================================

class CalendarIntegration:
    """Google Calendar integration using MCP server."""
    
    def __init__(self):
        self.mcp = MCPClient("google-calendar")
    
    def search_events(
        self,
        time_min: Optional[str] = None,
        time_max: Optional[str] = None,
        query: Optional[str] = None,
        max_results: int = 10
    ) -> Dict:
        """
        Search calendar events.
        
        Args:
            time_min: Start time (ISO 8601 format)
            time_max: End time (ISO 8601 format)
            query: Text search query
            max_results: Maximum number of results
        
        Returns:
            Dict with event results
        """
        params = {"max_results": max_results}
        if time_min:
            params["time_min"] = time_min
        if time_max:
            params["time_max"] = time_max
        if query:
            params["q"] = query
        
        return self.mcp.call_tool("google_calendar_search_events", params)
    
    def create_event(
        self,
        summary: str,
        start_time: str,
        end_time: str,
        description: Optional[str] = None,
        location: Optional[str] = None,
        attendees: Optional[List[str]] = None
    ) -> Dict:
        """
        Create a calendar event.
        
        Args:
            summary: Event title
            start_time: Start time (ISO 8601 format with timezone)
            end_time: End time (ISO 8601 format with timezone)
            description: Event description
            location: Event location
            attendees: List of attendee email addresses
        
        Returns:
            Dict with created event details
        """
        event = {
            "summary": summary,
            "start_time": start_time,
            "end_time": end_time
        }
        if description:
            event["description"] = description
        if location:
            event["location"] = location
        if attendees:
            event["attendees"] = attendees
        
        return self.mcp.call_tool("google_calendar_create_events", {
            "events": [event]
        })
    
    def get_upcoming_events(self, hours_ahead: int = 24) -> Dict:
        """Get upcoming events within the specified hours."""
        now = datetime.utcnow()
        time_min = now.isoformat() + "Z"
        time_max = (now + timedelta(hours=hours_ahead)).isoformat() + "Z"
        return self.search_events(time_min=time_min, time_max=time_max)
    
    def get_today_events(self) -> Dict:
        """Get all events for today."""
        now = datetime.utcnow()
        start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end_of_day = start_of_day + timedelta(days=1)
        return self.search_events(
            time_min=start_of_day.isoformat() + "Z",
            time_max=end_of_day.isoformat() + "Z"
        )
    
    def schedule_agent_task(
        self,
        task_name: str,
        start_time: str,
        duration_minutes: int = 60,
        task_details: Optional[str] = None
    ) -> Dict:
        """
        Schedule an agent task as a calendar event.
        Events with [AGENT] prefix are recognized by the system.
        
        Args:
            task_name: Name of the task
            start_time: When to run the task (ISO 8601)
            duration_minutes: Expected task duration
            task_details: JSON string with task parameters
        
        Returns:
            Dict with created event
        """
        start = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
        end = start + timedelta(minutes=duration_minutes)
        
        description = f"[AGENT] Automated task\n\n"
        if task_details:
            description += f"Task Details:\n{task_details}"
        
        return self.create_event(
            summary=f"[AGENT] {task_name}",
            start_time=start.isoformat(),
            end_time=end.isoformat(),
            description=description
        )


# ============================================================================
# Google Drive Integration
# ============================================================================

class DriveIntegration:
    """Google Drive integration using rclone."""
    
    def __init__(self):
        self.config_path = "/home/ubuntu/.gdrive-rclone.ini"
        self.remote_name = "manus_google_drive"
    
    def _run_rclone(self, args: List[str]) -> Dict:
        """Run an rclone command."""
        cmd = ["rclone"] + args + ["--config", self.config_path]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            if result.returncode != 0:
                return {"error": result.stderr, "success": False}
            return {"output": result.stdout, "success": True}
        except subprocess.TimeoutExpired:
            return {"error": "Rclone command timed out", "success": False}
        except Exception as e:
            return {"error": str(e), "success": False}
    
    def list_folders(self, path: str = "") -> Dict:
        """List folders in a directory."""
        remote_path = f"{self.remote_name}:{path}"
        return self._run_rclone(["lsd", remote_path])
    
    def list_files(self, path: str = "") -> Dict:
        """List files in a directory."""
        remote_path = f"{self.remote_name}:{path}"
        return self._run_rclone(["ls", remote_path])
    
    def download_file(self, remote_path: str, local_path: str) -> Dict:
        """Download a file from Google Drive."""
        full_remote = f"{self.remote_name}:{remote_path}"
        return self._run_rclone(["copy", full_remote, local_path])
    
    def upload_file(self, local_path: str, remote_path: str) -> Dict:
        """Upload a file to Google Drive."""
        full_remote = f"{self.remote_name}:{remote_path}"
        return self._run_rclone(["copy", local_path, full_remote])
    
    def sync_folder(self, local_path: str, remote_path: str) -> Dict:
        """Sync a local folder to Google Drive."""
        full_remote = f"{self.remote_name}:{remote_path}"
        return self._run_rclone(["sync", local_path, full_remote])
    
    def get_shareable_link(self, remote_path: str) -> Dict:
        """Get a shareable link for a file."""
        full_remote = f"{self.remote_name}:{remote_path}"
        return self._run_rclone(["link", full_remote])
    
    def search_files(self, query: str, path: str = "") -> Dict:
        """Search for files matching a pattern."""
        remote_path = f"{self.remote_name}:{path}"
        return self._run_rclone(["ls", remote_path, "--include", f"*{query}*"])


# ============================================================================
# Unified Google Integration
# ============================================================================

class GoogleIntegrations:
    """Unified interface for all Google integrations."""
    
    def __init__(self):
        self.gmail = GmailIntegration()
        self.calendar = CalendarIntegration()
        self.drive = DriveIntegration()
    
    def get_daily_briefing(self) -> Dict:
        """
        Get a daily briefing with:
        - Unread important emails
        - Today's calendar events
        - Recent Drive activity
        """
        briefing = {
            "timestamp": datetime.utcnow().isoformat(),
            "emails": self.gmail.get_unread_important(max_results=5),
            "events": self.calendar.get_today_events(),
            "drive_folders": self.drive.list_folders()
        }
        return briefing
    
    def schedule_and_notify(
        self,
        task_name: str,
        start_time: str,
        notify_email: str,
        task_details: str
    ) -> Dict:
        """
        Schedule an agent task and send an email notification.
        
        Args:
            task_name: Name of the task
            start_time: When to run (ISO 8601)
            notify_email: Email to notify
            task_details: Task description
        
        Returns:
            Dict with results of both operations
        """
        # Schedule the task
        calendar_result = self.calendar.schedule_agent_task(
            task_name=task_name,
            start_time=start_time,
            task_details=task_details
        )
        
        # Send notification email
        email_result = self.gmail.send_message(
            to=[notify_email],
            subject=f"[HYPER UNICORN] Task Scheduled: {task_name}",
            content=f"""
A new agent task has been scheduled:

Task: {task_name}
Scheduled Time: {start_time}

Details:
{task_details}

This is an automated notification from the HYPER UNICORN system.
            """
        )
        
        return {
            "calendar": calendar_result,
            "email": email_result
        }
    
    def save_report_to_drive(
        self,
        report_content: str,
        filename: str,
        folder: str = "HYPER_UNICORN_Reports"
    ) -> Dict:
        """
        Save a report to Google Drive and get a shareable link.
        
        Args:
            report_content: The report content (markdown or text)
            filename: Name for the file
            folder: Drive folder to save to
        
        Returns:
            Dict with upload result and shareable link
        """
        import tempfile
        
        # Save to temp file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.md', delete=False) as f:
            f.write(report_content)
            temp_path = f.name
        
        try:
            # Upload to Drive
            upload_result = self.drive.upload_file(temp_path, folder)
            
            if upload_result.get("success"):
                # Get shareable link
                link_result = self.drive.get_shareable_link(f"{folder}/{filename}")
                return {
                    "success": True,
                    "upload": upload_result,
                    "link": link_result.get("output", "").strip()
                }
            else:
                return upload_result
        finally:
            os.unlink(temp_path)


# ============================================================================
# Example Usage
# ============================================================================

def main():
    """Example usage of Google integrations."""
    google = GoogleIntegrations()
    
    print("=== Google Integrations Demo ===\n")
    
    # 1. Get daily briefing
    print("1. Getting daily briefing...")
    briefing = google.get_daily_briefing()
    print(f"   Emails: {briefing.get('emails', {})}")
    print(f"   Events: {briefing.get('events', {})}")
    print()
    
    # 2. List Drive folders
    print("2. Listing Drive folders...")
    folders = google.drive.list_folders()
    print(f"   Folders: {folders.get('output', 'No output')[:500]}")
    print()
    
    # 3. Search calendar
    print("3. Getting upcoming events...")
    events = google.calendar.get_upcoming_events(hours_ahead=48)
    print(f"   Events: {events}")
    print()
    
    print("=== Demo Complete ===")


if __name__ == "__main__":
    main()
