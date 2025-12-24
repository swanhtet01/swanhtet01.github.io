"""
Webhook Handlers
================
Receive and process external triggers from various services.

Supported webhooks:
- GitHub (push, PR, issues)
- Stripe (payments, subscriptions)
- n8n (workflow triggers)
- Custom webhooks
- Scheduled triggers

Author: Manus AI for SuperMega.dev
"""

import os
import json
import hmac
import hashlib
import asyncio
from datetime import datetime
from typing import Optional, Dict, List, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
from fastapi import FastAPI, Request, HTTPException, Header, BackgroundTasks
from pydantic import BaseModel
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("webhooks")


# ============================================================================
# Data Models
# ============================================================================

class WebhookSource(Enum):
    """Sources of webhooks."""
    GITHUB = "github"
    STRIPE = "stripe"
    N8N = "n8n"
    SLACK = "slack"
    DISCORD = "discord"
    CUSTOM = "custom"
    SCHEDULED = "scheduled"


@dataclass
class WebhookEvent:
    """A received webhook event."""
    event_id: str
    source: WebhookSource
    event_type: str
    payload: Dict[str, Any]
    headers: Dict[str, str]
    timestamp: datetime = field(default_factory=datetime.utcnow)
    processed: bool = False
    result: Optional[Dict[str, Any]] = None


class WebhookConfig(BaseModel):
    """Configuration for a webhook endpoint."""
    name: str
    source: str
    secret: Optional[str] = None
    enabled: bool = True
    actions: List[str] = []  # Actions to trigger


# ============================================================================
# Webhook Handlers
# ============================================================================

class GitHubWebhookHandler:
    """Handle GitHub webhooks."""
    
    def __init__(self, secret: str = None):
        self.secret = secret or os.getenv("GITHUB_WEBHOOK_SECRET", "")
    
    def verify_signature(self, payload: bytes, signature: str) -> bool:
        """Verify GitHub webhook signature."""
        if not self.secret:
            return True  # No secret configured
        
        expected = "sha256=" + hmac.new(
            self.secret.encode(),
            payload,
            hashlib.sha256
        ).hexdigest()
        
        return hmac.compare_digest(expected, signature)
    
    async def process(self, event: WebhookEvent) -> Dict[str, Any]:
        """Process a GitHub webhook event."""
        event_type = event.event_type
        payload = event.payload
        
        if event_type == "push":
            return await self._handle_push(payload)
        elif event_type == "pull_request":
            return await self._handle_pr(payload)
        elif event_type == "issues":
            return await self._handle_issue(payload)
        elif event_type == "workflow_run":
            return await self._handle_workflow(payload)
        else:
            return {"status": "ignored", "reason": f"Unhandled event: {event_type}"}
    
    async def _handle_push(self, payload: Dict) -> Dict[str, Any]:
        """Handle push events."""
        repo = payload.get("repository", {}).get("full_name", "unknown")
        branch = payload.get("ref", "").replace("refs/heads/", "")
        commits = payload.get("commits", [])
        
        logger.info(f"Push to {repo}/{branch}: {len(commits)} commits")
        
        return {
            "status": "processed",
            "action": "push",
            "repo": repo,
            "branch": branch,
            "commits": len(commits),
            "trigger": "code_review" if branch == "main" else None
        }
    
    async def _handle_pr(self, payload: Dict) -> Dict[str, Any]:
        """Handle pull request events."""
        action = payload.get("action")
        pr = payload.get("pull_request", {})
        repo = payload.get("repository", {}).get("full_name", "unknown")
        
        logger.info(f"PR {action} on {repo}: #{pr.get('number')}")
        
        return {
            "status": "processed",
            "action": f"pr_{action}",
            "repo": repo,
            "pr_number": pr.get("number"),
            "title": pr.get("title"),
            "trigger": "code_review" if action in ["opened", "synchronize"] else None
        }
    
    async def _handle_issue(self, payload: Dict) -> Dict[str, Any]:
        """Handle issue events."""
        action = payload.get("action")
        issue = payload.get("issue", {})
        repo = payload.get("repository", {}).get("full_name", "unknown")
        
        logger.info(f"Issue {action} on {repo}: #{issue.get('number')}")
        
        return {
            "status": "processed",
            "action": f"issue_{action}",
            "repo": repo,
            "issue_number": issue.get("number"),
            "title": issue.get("title"),
            "trigger": "issue_triage" if action == "opened" else None
        }
    
    async def _handle_workflow(self, payload: Dict) -> Dict[str, Any]:
        """Handle workflow run events."""
        action = payload.get("action")
        workflow = payload.get("workflow_run", {})
        
        return {
            "status": "processed",
            "action": f"workflow_{action}",
            "workflow": workflow.get("name"),
            "conclusion": workflow.get("conclusion")
        }


class StripeWebhookHandler:
    """Handle Stripe webhooks."""
    
    def __init__(self, secret: str = None):
        self.secret = secret or os.getenv("STRIPE_WEBHOOK_SECRET", "")
    
    def verify_signature(self, payload: bytes, signature: str) -> bool:
        """Verify Stripe webhook signature."""
        if not self.secret:
            return True
        
        try:
            import stripe
            stripe.Webhook.construct_event(payload, signature, self.secret)
            return True
        except Exception:
            return False
    
    async def process(self, event: WebhookEvent) -> Dict[str, Any]:
        """Process a Stripe webhook event."""
        event_type = event.event_type
        payload = event.payload
        
        data = payload.get("data", {}).get("object", {})
        
        if event_type.startswith("payment_intent"):
            return await self._handle_payment(event_type, data)
        elif event_type.startswith("customer"):
            return await self._handle_customer(event_type, data)
        elif event_type.startswith("subscription"):
            return await self._handle_subscription(event_type, data)
        elif event_type.startswith("invoice"):
            return await self._handle_invoice(event_type, data)
        else:
            return {"status": "ignored", "reason": f"Unhandled event: {event_type}"}
    
    async def _handle_payment(self, event_type: str, data: Dict) -> Dict[str, Any]:
        """Handle payment events."""
        amount = data.get("amount", 0) / 100  # Convert cents to dollars
        currency = data.get("currency", "usd").upper()
        status = data.get("status")
        
        logger.info(f"Payment {event_type}: {amount} {currency} ({status})")
        
        return {
            "status": "processed",
            "action": event_type,
            "amount": amount,
            "currency": currency,
            "payment_status": status,
            "trigger": "payment_notification" if "succeeded" in event_type else None
        }
    
    async def _handle_customer(self, event_type: str, data: Dict) -> Dict[str, Any]:
        """Handle customer events."""
        email = data.get("email")
        
        return {
            "status": "processed",
            "action": event_type,
            "customer_email": email,
            "trigger": "customer_onboarding" if "created" in event_type else None
        }
    
    async def _handle_subscription(self, event_type: str, data: Dict) -> Dict[str, Any]:
        """Handle subscription events."""
        status = data.get("status")
        
        return {
            "status": "processed",
            "action": event_type,
            "subscription_status": status,
            "trigger": "subscription_update"
        }
    
    async def _handle_invoice(self, event_type: str, data: Dict) -> Dict[str, Any]:
        """Handle invoice events."""
        amount = data.get("amount_due", 0) / 100
        
        return {
            "status": "processed",
            "action": event_type,
            "amount": amount,
            "trigger": "invoice_notification" if "paid" in event_type else None
        }


class N8NWebhookHandler:
    """Handle n8n workflow webhooks."""
    
    async def process(self, event: WebhookEvent) -> Dict[str, Any]:
        """Process an n8n webhook event."""
        payload = event.payload
        
        workflow_id = payload.get("workflow_id")
        execution_id = payload.get("execution_id")
        status = payload.get("status")
        
        logger.info(f"n8n workflow {workflow_id}: {status}")
        
        return {
            "status": "processed",
            "action": "workflow_completed",
            "workflow_id": workflow_id,
            "execution_id": execution_id,
            "workflow_status": status,
            "data": payload.get("data", {})
        }


class CustomWebhookHandler:
    """Handle custom webhooks."""
    
    def __init__(self, secret: str = None):
        self.secret = secret
    
    def verify_signature(self, payload: bytes, signature: str) -> bool:
        """Verify custom webhook signature."""
        if not self.secret:
            return True
        
        expected = hmac.new(
            self.secret.encode(),
            payload,
            hashlib.sha256
        ).hexdigest()
        
        return hmac.compare_digest(expected, signature)
    
    async def process(self, event: WebhookEvent) -> Dict[str, Any]:
        """Process a custom webhook event."""
        return {
            "status": "processed",
            "action": event.event_type,
            "data": event.payload
        }


# ============================================================================
# Webhook Manager
# ============================================================================

class WebhookManager:
    """
    Central manager for all webhook handling.
    """
    
    def __init__(self):
        self.handlers: Dict[WebhookSource, Any] = {
            WebhookSource.GITHUB: GitHubWebhookHandler(),
            WebhookSource.STRIPE: StripeWebhookHandler(),
            WebhookSource.N8N: N8NWebhookHandler(),
            WebhookSource.CUSTOM: CustomWebhookHandler()
        }
        
        self.event_history: List[WebhookEvent] = []
        self.action_handlers: Dict[str, Callable] = {}
        self.max_history = 1000
    
    def register_action(self, action_name: str, handler: Callable):
        """Register a handler for a specific action trigger."""
        self.action_handlers[action_name] = handler
        logger.info(f"Registered action handler: {action_name}")
    
    async def process_webhook(
        self,
        source: WebhookSource,
        event_type: str,
        payload: Dict[str, Any],
        headers: Dict[str, str],
        raw_body: bytes = None
    ) -> Dict[str, Any]:
        """Process an incoming webhook."""
        import uuid
        
        # Create event
        event = WebhookEvent(
            event_id=str(uuid.uuid4())[:8],
            source=source,
            event_type=event_type,
            payload=payload,
            headers=headers
        )
        
        # Get handler
        handler = self.handlers.get(source)
        if not handler:
            return {"status": "error", "message": f"No handler for source: {source}"}
        
        # Verify signature if applicable
        if raw_body and hasattr(handler, "verify_signature"):
            signature = headers.get("x-hub-signature-256") or \
                       headers.get("stripe-signature") or \
                       headers.get("x-signature")
            
            if signature and not handler.verify_signature(raw_body, signature):
                raise HTTPException(status_code=401, detail="Invalid signature")
        
        # Process event
        try:
            result = await handler.process(event)
            event.processed = True
            event.result = result
            
            # Store in history
            self.event_history.append(event)
            if len(self.event_history) > self.max_history:
                self.event_history = self.event_history[-self.max_history:]
            
            # Trigger actions
            if result.get("trigger"):
                await self._trigger_action(result["trigger"], event, result)
            
            return result
            
        except Exception as e:
            logger.error(f"Webhook processing error: {e}")
            return {"status": "error", "message": str(e)}
    
    async def _trigger_action(
        self,
        action_name: str,
        event: WebhookEvent,
        result: Dict[str, Any]
    ):
        """Trigger a registered action."""
        if action_name not in self.action_handlers:
            logger.warning(f"No handler for action: {action_name}")
            return
        
        handler = self.action_handlers[action_name]
        
        try:
            if asyncio.iscoroutinefunction(handler):
                await handler(event, result)
            else:
                handler(event, result)
        except Exception as e:
            logger.error(f"Action handler error ({action_name}): {e}")
    
    def get_recent_events(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Get recent webhook events."""
        return [
            {
                "event_id": e.event_id,
                "source": e.source.value,
                "event_type": e.event_type,
                "timestamp": e.timestamp.isoformat(),
                "processed": e.processed,
                "result": e.result
            }
            for e in self.event_history[-limit:]
        ]


# ============================================================================
# FastAPI Routes
# ============================================================================

def create_webhook_routes(app: FastAPI, manager: WebhookManager):
    """Create webhook routes for FastAPI app."""
    
    @app.post("/webhooks/github")
    async def github_webhook(
        request: Request,
        background_tasks: BackgroundTasks,
        x_github_event: str = Header(None),
        x_hub_signature_256: str = Header(None)
    ):
        """Handle GitHub webhooks."""
        body = await request.body()
        payload = await request.json()
        
        result = await manager.process_webhook(
            source=WebhookSource.GITHUB,
            event_type=x_github_event or "unknown",
            payload=payload,
            headers=dict(request.headers),
            raw_body=body
        )
        
        return result
    
    @app.post("/webhooks/stripe")
    async def stripe_webhook(
        request: Request,
        stripe_signature: str = Header(None)
    ):
        """Handle Stripe webhooks."""
        body = await request.body()
        payload = await request.json()
        
        event_type = payload.get("type", "unknown")
        
        result = await manager.process_webhook(
            source=WebhookSource.STRIPE,
            event_type=event_type,
            payload=payload,
            headers=dict(request.headers),
            raw_body=body
        )
        
        return result
    
    @app.post("/webhooks/n8n")
    async def n8n_webhook(request: Request):
        """Handle n8n webhooks."""
        payload = await request.json()
        
        result = await manager.process_webhook(
            source=WebhookSource.N8N,
            event_type="workflow",
            payload=payload,
            headers=dict(request.headers)
        )
        
        return result
    
    @app.post("/webhooks/custom/{event_type}")
    async def custom_webhook(
        request: Request,
        event_type: str,
        x_signature: str = Header(None)
    ):
        """Handle custom webhooks."""
        body = await request.body()
        payload = await request.json()
        
        result = await manager.process_webhook(
            source=WebhookSource.CUSTOM,
            event_type=event_type,
            payload=payload,
            headers=dict(request.headers),
            raw_body=body
        )
        
        return result
    
    @app.get("/webhooks/events")
    async def get_webhook_events(limit: int = 50):
        """Get recent webhook events."""
        return manager.get_recent_events(limit)
    
    return app


# ============================================================================
# Main Entry Point
# ============================================================================

async def main():
    """Demo the Webhook System."""
    manager = WebhookManager()
    
    # Register action handlers
    async def handle_code_review(event, result):
        print(f"Triggering code review for {result.get('repo')}")
    
    manager.register_action("code_review", handle_code_review)
    
    # Simulate a GitHub push webhook
    result = await manager.process_webhook(
        source=WebhookSource.GITHUB,
        event_type="push",
        payload={
            "repository": {"full_name": "supermega/project"},
            "ref": "refs/heads/main",
            "commits": [{"message": "Update README"}]
        },
        headers={}
    )
    
    print(f"Webhook result: {result}")
    
    # Get recent events
    events = manager.get_recent_events()
    print(f"Recent events: {len(events)}")


if __name__ == "__main__":
    asyncio.run(main())
