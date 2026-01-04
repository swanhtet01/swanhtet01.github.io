"""
Invoice & Billing Agent
========================
Autonomous agent for managing invoices, payments, and billing with Stripe.

Capabilities:
- Invoice generation and sending
- Payment tracking and reminders
- Subscription management
- Revenue reporting
- Expense tracking
- Financial forecasting
"""

import os
import json
import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
from enum import Enum
from decimal import Decimal


class InvoiceStatus(Enum):
    """Invoice lifecycle status."""
    DRAFT = "draft"
    SENT = "sent"
    VIEWED = "viewed"
    PAID = "paid"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"
    REFUNDED = "refunded"


class PaymentMethod(Enum):
    """Supported payment methods."""
    CARD = "card"
    BANK_TRANSFER = "bank_transfer"
    CRYPTO = "crypto"
    PAYPAL = "paypal"
    CHECK = "check"


class SubscriptionStatus(Enum):
    """Subscription status."""
    ACTIVE = "active"
    PAST_DUE = "past_due"
    CANCELLED = "cancelled"
    PAUSED = "paused"
    TRIALING = "trialing"


@dataclass
class LineItem:
    """Represents an invoice line item."""
    description: str
    quantity: float
    unit_price: float
    tax_rate: float = 0
    discount: float = 0
    
    @property
    def subtotal(self) -> float:
        return self.quantity * self.unit_price
    
    @property
    def tax_amount(self) -> float:
        return self.subtotal * (self.tax_rate / 100)
    
    @property
    def discount_amount(self) -> float:
        return self.subtotal * (self.discount / 100)
    
    @property
    def total(self) -> float:
        return self.subtotal + self.tax_amount - self.discount_amount


@dataclass
class Invoice:
    """Represents an invoice."""
    id: str
    client_id: str
    client_name: str
    client_email: str
    invoice_number: str
    status: InvoiceStatus = InvoiceStatus.DRAFT
    line_items: List[LineItem] = field(default_factory=list)
    currency: str = "USD"
    due_date: Optional[datetime] = None
    issued_date: datetime = field(default_factory=datetime.now)
    paid_date: Optional[datetime] = None
    notes: str = ""
    terms: str = "Payment due within 30 days"
    stripe_invoice_id: str = ""
    stripe_payment_intent: str = ""
    payment_link: str = ""
    reminders_sent: int = 0
    last_reminder: Optional[datetime] = None
    
    @property
    def subtotal(self) -> float:
        return sum(item.subtotal for item in self.line_items)
    
    @property
    def tax_total(self) -> float:
        return sum(item.tax_amount for item in self.line_items)
    
    @property
    def discount_total(self) -> float:
        return sum(item.discount_amount for item in self.line_items)
    
    @property
    def total(self) -> float:
        return sum(item.total for item in self.line_items)


@dataclass
class Subscription:
    """Represents a subscription."""
    id: str
    client_id: str
    client_name: str
    plan_name: str
    amount: float
    currency: str = "USD"
    interval: str = "month"  # month, year
    status: SubscriptionStatus = SubscriptionStatus.ACTIVE
    start_date: datetime = field(default_factory=datetime.now)
    current_period_start: datetime = field(default_factory=datetime.now)
    current_period_end: Optional[datetime] = None
    cancel_at_period_end: bool = False
    stripe_subscription_id: str = ""
    stripe_customer_id: str = ""


@dataclass
class Payment:
    """Represents a payment."""
    id: str
    invoice_id: str
    amount: float
    currency: str = "USD"
    method: PaymentMethod = PaymentMethod.CARD
    status: str = "succeeded"
    stripe_payment_id: str = ""
    received_at: datetime = field(default_factory=datetime.now)
    fees: float = 0
    net_amount: float = 0


class BillingAgent:
    """
    Autonomous Invoice & Billing Agent.
    
    Features:
    - Stripe integration for payments
    - Automated invoice generation
    - Payment reminders
    - Subscription management
    - Revenue analytics
    - Financial reporting
    """
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self.invoices: Dict[str, Invoice] = {}
        self.subscriptions: Dict[str, Subscription] = {}
        self.payments: Dict[str, Payment] = {}
        
        # Stripe client (would be initialized with API key)
        self.stripe = None
        self._init_stripe()
        
        # Invoice settings
        self.company_info = {
            "name": "SuperMega.dev",
            "address": "123 AI Street, Tech City",
            "email": "billing@supermega.dev",
            "phone": "+1-555-0123",
            "tax_id": "XX-XXXXXXX"
        }
        
        # Invoice numbering
        self.invoice_counter = 1000
        
        # Reminder schedule (days after due date)
        self.reminder_schedule = [1, 7, 14, 30]
    
    def _init_stripe(self):
        """Initialize Stripe client."""
        try:
            import stripe
            stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")
            self.stripe = stripe
        except ImportError:
            self.stripe = None
    
    # ==================== Invoice Management ====================
    
    def create_invoice(self, invoice_data: Dict[str, Any]) -> Invoice:
        """Create a new invoice."""
        self.invoice_counter += 1
        invoice_id = f"inv_{datetime.now().timestamp()}"
        invoice_number = f"INV-{self.invoice_counter:05d}"
        
        # Parse line items
        line_items = []
        for item_data in invoice_data.get("line_items", []):
            line_item = LineItem(
                description=item_data.get("description", ""),
                quantity=item_data.get("quantity", 1),
                unit_price=item_data.get("unit_price", 0),
                tax_rate=item_data.get("tax_rate", 0),
                discount=item_data.get("discount", 0)
            )
            line_items.append(line_item)
        
        # Calculate due date
        due_days = invoice_data.get("due_days", 30)
        due_date = datetime.now() + timedelta(days=due_days)
        
        invoice = Invoice(
            id=invoice_id,
            client_id=invoice_data.get("client_id", ""),
            client_name=invoice_data.get("client_name", ""),
            client_email=invoice_data.get("client_email", ""),
            invoice_number=invoice_number,
            line_items=line_items,
            currency=invoice_data.get("currency", "USD"),
            due_date=due_date,
            notes=invoice_data.get("notes", ""),
            terms=invoice_data.get("terms", "Payment due within 30 days")
        )
        
        self.invoices[invoice_id] = invoice
        return invoice
    
    async def send_invoice(self, invoice_id: str) -> Dict[str, Any]:
        """Send an invoice to the client."""
        invoice = self.invoices.get(invoice_id)
        if not invoice:
            raise ValueError(f"Invoice {invoice_id} not found")
        
        # Create Stripe invoice if available
        if self.stripe:
            try:
                stripe_invoice = await self._create_stripe_invoice(invoice)
                invoice.stripe_invoice_id = stripe_invoice.get("id", "")
                invoice.payment_link = stripe_invoice.get("hosted_invoice_url", "")
            except Exception as e:
                pass  # Continue without Stripe
        
        # Generate payment link if not from Stripe
        if not invoice.payment_link:
            invoice.payment_link = f"https://supermega.dev/pay/{invoice.id}"
        
        # Send email (would use Gmail API)
        email_result = await self._send_invoice_email(invoice)
        
        invoice.status = InvoiceStatus.SENT
        
        return {
            "success": True,
            "invoice_id": invoice.id,
            "invoice_number": invoice.invoice_number,
            "payment_link": invoice.payment_link,
            "email_sent": email_result.get("success", False)
        }
    
    async def _create_stripe_invoice(self, invoice: Invoice) -> Dict[str, Any]:
        """Create a Stripe invoice."""
        if not self.stripe:
            return {}
        
        try:
            # Create or get customer
            customer = self.stripe.Customer.create(
                email=invoice.client_email,
                name=invoice.client_name
            )
            
            # Create invoice
            stripe_invoice = self.stripe.Invoice.create(
                customer=customer.id,
                collection_method="send_invoice",
                days_until_due=30
            )
            
            # Add line items
            for item in invoice.line_items:
                self.stripe.InvoiceItem.create(
                    customer=customer.id,
                    invoice=stripe_invoice.id,
                    description=item.description,
                    quantity=int(item.quantity),
                    unit_amount=int(item.unit_price * 100),  # Convert to cents
                    currency=invoice.currency.lower()
                )
            
            # Finalize and send
            stripe_invoice = self.stripe.Invoice.finalize_invoice(stripe_invoice.id)
            self.stripe.Invoice.send_invoice(stripe_invoice.id)
            
            return {
                "id": stripe_invoice.id,
                "hosted_invoice_url": stripe_invoice.hosted_invoice_url
            }
        except Exception as e:
            return {"error": str(e)}
    
    async def _send_invoice_email(self, invoice: Invoice) -> Dict[str, Any]:
        """Send invoice email to client."""
        subject = f"Invoice {invoice.invoice_number} from {self.company_info['name']}"
        
        body = f"""
Dear {invoice.client_name},

Please find attached invoice {invoice.invoice_number} for ${invoice.total:,.2f}.

Invoice Details:
- Invoice Number: {invoice.invoice_number}
- Amount Due: ${invoice.total:,.2f} {invoice.currency}
- Due Date: {invoice.due_date.strftime('%B %d, %Y') if invoice.due_date else 'Upon receipt'}

Pay Online: {invoice.payment_link}

{invoice.notes}

{invoice.terms}

Thank you for your business!

Best regards,
{self.company_info['name']}
{self.company_info['email']}
"""
        
        # In production, would send via Gmail API
        return {"success": True, "recipient": invoice.client_email}
    
    async def mark_invoice_paid(
        self,
        invoice_id: str,
        payment_method: PaymentMethod = PaymentMethod.CARD,
        stripe_payment_id: str = ""
    ) -> Invoice:
        """Mark an invoice as paid."""
        invoice = self.invoices.get(invoice_id)
        if not invoice:
            raise ValueError(f"Invoice {invoice_id} not found")
        
        invoice.status = InvoiceStatus.PAID
        invoice.paid_date = datetime.now()
        
        # Record payment
        payment = Payment(
            id=f"pay_{datetime.now().timestamp()}",
            invoice_id=invoice_id,
            amount=invoice.total,
            currency=invoice.currency,
            method=payment_method,
            stripe_payment_id=stripe_payment_id,
            fees=invoice.total * 0.029 + 0.30,  # Stripe fees estimate
            net_amount=invoice.total - (invoice.total * 0.029 + 0.30)
        )
        self.payments[payment.id] = payment
        
        # Send receipt
        await self._send_payment_receipt(invoice, payment)
        
        return invoice
    
    async def _send_payment_receipt(self, invoice: Invoice, payment: Payment) -> Dict[str, Any]:
        """Send payment receipt to client."""
        subject = f"Payment Received - Invoice {invoice.invoice_number}"
        
        body = f"""
Dear {invoice.client_name},

Thank you for your payment!

Payment Details:
- Invoice Number: {invoice.invoice_number}
- Amount Paid: ${payment.amount:,.2f} {payment.currency}
- Payment Method: {payment.method.value}
- Date: {payment.received_at.strftime('%B %d, %Y')}

This email serves as your receipt.

Thank you for your business!

Best regards,
{self.company_info['name']}
"""
        
        return {"success": True, "recipient": invoice.client_email}
    
    # ==================== Payment Reminders ====================
    
    async def check_overdue_invoices(self) -> List[Dict[str, Any]]:
        """Check for overdue invoices and send reminders."""
        results = []
        now = datetime.now()
        
        for invoice in self.invoices.values():
            if invoice.status not in [InvoiceStatus.SENT, InvoiceStatus.VIEWED, InvoiceStatus.OVERDUE]:
                continue
            
            if not invoice.due_date:
                continue
            
            days_overdue = (now - invoice.due_date).days
            
            if days_overdue > 0:
                invoice.status = InvoiceStatus.OVERDUE
                
                # Check if reminder is due
                should_remind = False
                for reminder_day in self.reminder_schedule:
                    if days_overdue >= reminder_day:
                        if invoice.reminders_sent < self.reminder_schedule.index(reminder_day) + 1:
                            should_remind = True
                            break
                
                if should_remind:
                    result = await self._send_payment_reminder(invoice, days_overdue)
                    results.append(result)
        
        return results
    
    async def _send_payment_reminder(self, invoice: Invoice, days_overdue: int) -> Dict[str, Any]:
        """Send payment reminder for overdue invoice."""
        urgency = "gentle" if days_overdue <= 7 else "firm" if days_overdue <= 14 else "urgent"
        
        subjects = {
            "gentle": f"Friendly Reminder: Invoice {invoice.invoice_number} is past due",
            "firm": f"Payment Required: Invoice {invoice.invoice_number} is {days_overdue} days overdue",
            "urgent": f"URGENT: Invoice {invoice.invoice_number} requires immediate attention"
        }
        
        body = f"""
Dear {invoice.client_name},

This is a reminder that invoice {invoice.invoice_number} for ${invoice.total:,.2f} is now {days_overdue} days past due.

Invoice Details:
- Invoice Number: {invoice.invoice_number}
- Amount Due: ${invoice.total:,.2f} {invoice.currency}
- Original Due Date: {invoice.due_date.strftime('%B %d, %Y') if invoice.due_date else 'N/A'}
- Days Overdue: {days_overdue}

Pay Now: {invoice.payment_link}

If you have already sent payment, please disregard this notice.

If you have any questions or need to discuss payment arrangements, please contact us.

Best regards,
{self.company_info['name']}
{self.company_info['email']}
"""
        
        invoice.reminders_sent += 1
        invoice.last_reminder = datetime.now()
        
        return {
            "invoice_id": invoice.id,
            "invoice_number": invoice.invoice_number,
            "days_overdue": days_overdue,
            "reminder_number": invoice.reminders_sent,
            "urgency": urgency
        }
    
    # ==================== Subscription Management ====================
    
    def create_subscription(self, subscription_data: Dict[str, Any]) -> Subscription:
        """Create a new subscription."""
        sub_id = f"sub_{datetime.now().timestamp()}"
        
        interval = subscription_data.get("interval", "month")
        period_end = datetime.now() + timedelta(days=30 if interval == "month" else 365)
        
        subscription = Subscription(
            id=sub_id,
            client_id=subscription_data.get("client_id", ""),
            client_name=subscription_data.get("client_name", ""),
            plan_name=subscription_data.get("plan_name", ""),
            amount=subscription_data.get("amount", 0),
            currency=subscription_data.get("currency", "USD"),
            interval=interval,
            current_period_end=period_end
        )
        
        self.subscriptions[sub_id] = subscription
        return subscription
    
    async def process_subscription_renewals(self) -> List[Dict[str, Any]]:
        """Process subscription renewals."""
        results = []
        now = datetime.now()
        
        for sub in self.subscriptions.values():
            if sub.status != SubscriptionStatus.ACTIVE:
                continue
            
            if sub.current_period_end and sub.current_period_end <= now:
                if sub.cancel_at_period_end:
                    sub.status = SubscriptionStatus.CANCELLED
                    results.append({
                        "subscription_id": sub.id,
                        "action": "cancelled",
                        "client": sub.client_name
                    })
                else:
                    # Create renewal invoice
                    invoice = self.create_invoice({
                        "client_id": sub.client_id,
                        "client_name": sub.client_name,
                        "client_email": "",  # Would get from client data
                        "line_items": [{
                            "description": f"{sub.plan_name} - {sub.interval}ly subscription",
                            "quantity": 1,
                            "unit_price": sub.amount
                        }]
                    })
                    
                    # Update period
                    sub.current_period_start = now
                    sub.current_period_end = now + timedelta(
                        days=30 if sub.interval == "month" else 365
                    )
                    
                    results.append({
                        "subscription_id": sub.id,
                        "action": "renewed",
                        "invoice_id": invoice.id,
                        "amount": sub.amount
                    })
        
        return results
    
    async def cancel_subscription(
        self,
        subscription_id: str,
        at_period_end: bool = True
    ) -> Subscription:
        """Cancel a subscription."""
        sub = self.subscriptions.get(subscription_id)
        if not sub:
            raise ValueError(f"Subscription {subscription_id} not found")
        
        if at_period_end:
            sub.cancel_at_period_end = True
        else:
            sub.status = SubscriptionStatus.CANCELLED
        
        return sub
    
    # ==================== Analytics & Reporting ====================
    
    async def get_revenue_report(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """Generate revenue report."""
        if not start_date:
            start_date = datetime.now().replace(day=1)  # Start of month
        if not end_date:
            end_date = datetime.now()
        
        # Filter payments in date range
        period_payments = [
            p for p in self.payments.values()
            if start_date <= p.received_at <= end_date
        ]
        
        # Calculate totals
        gross_revenue = sum(p.amount for p in period_payments)
        total_fees = sum(p.fees for p in period_payments)
        net_revenue = sum(p.net_amount for p in period_payments)
        
        # Revenue by method
        by_method = {}
        for payment in period_payments:
            method = payment.method.value
            by_method[method] = by_method.get(method, 0) + payment.amount
        
        # Outstanding invoices
        outstanding = [
            inv for inv in self.invoices.values()
            if inv.status in [InvoiceStatus.SENT, InvoiceStatus.VIEWED, InvoiceStatus.OVERDUE]
        ]
        outstanding_amount = sum(inv.total for inv in outstanding)
        
        return {
            "period": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat()
            },
            "revenue": {
                "gross": round(gross_revenue, 2),
                "fees": round(total_fees, 2),
                "net": round(net_revenue, 2)
            },
            "payments": {
                "count": len(period_payments),
                "by_method": by_method
            },
            "outstanding": {
                "count": len(outstanding),
                "amount": round(outstanding_amount, 2)
            },
            "subscriptions": {
                "active": len([s for s in self.subscriptions.values() if s.status == SubscriptionStatus.ACTIVE]),
                "mrr": sum(s.amount for s in self.subscriptions.values() if s.status == SubscriptionStatus.ACTIVE and s.interval == "month"),
                "arr": sum(s.amount * 12 if s.interval == "month" else s.amount for s in self.subscriptions.values() if s.status == SubscriptionStatus.ACTIVE)
            }
        }
    
    async def get_client_billing_summary(self, client_id: str) -> Dict[str, Any]:
        """Get billing summary for a specific client."""
        client_invoices = [inv for inv in self.invoices.values() if inv.client_id == client_id]
        client_payments = [p for p in self.payments.values() if self.invoices.get(p.invoice_id, Invoice("", "", "", "", "")).client_id == client_id]
        client_subs = [s for s in self.subscriptions.values() if s.client_id == client_id]
        
        return {
            "client_id": client_id,
            "invoices": {
                "total": len(client_invoices),
                "paid": len([i for i in client_invoices if i.status == InvoiceStatus.PAID]),
                "outstanding": len([i for i in client_invoices if i.status in [InvoiceStatus.SENT, InvoiceStatus.OVERDUE]]),
                "total_invoiced": sum(i.total for i in client_invoices),
                "total_paid": sum(p.amount for p in client_payments)
            },
            "subscriptions": {
                "active": len([s for s in client_subs if s.status == SubscriptionStatus.ACTIVE]),
                "monthly_value": sum(s.amount for s in client_subs if s.status == SubscriptionStatus.ACTIVE)
            }
        }
    
    async def forecast_revenue(self, months: int = 3) -> Dict[str, Any]:
        """Forecast revenue for upcoming months."""
        forecasts = []
        
        # Calculate MRR from subscriptions
        mrr = sum(
            s.amount for s in self.subscriptions.values()
            if s.status == SubscriptionStatus.ACTIVE and s.interval == "month"
        )
        
        # Add annual subscriptions (monthly equivalent)
        mrr += sum(
            s.amount / 12 for s in self.subscriptions.values()
            if s.status == SubscriptionStatus.ACTIVE and s.interval == "year"
        )
        
        # Project forward
        for i in range(months):
            month_date = datetime.now() + timedelta(days=30 * (i + 1))
            
            # Simple projection (could be more sophisticated)
            projected = mrr * (1 + 0.05 * i)  # 5% growth assumption
            
            forecasts.append({
                "month": month_date.strftime("%B %Y"),
                "projected_mrr": round(projected, 2),
                "projected_arr": round(projected * 12, 2)
            })
        
        return {
            "current_mrr": round(mrr, 2),
            "current_arr": round(mrr * 12, 2),
            "forecasts": forecasts
        }


# Convenience functions
async def create_billing_agent(config: Optional[Dict] = None) -> BillingAgent:
    """Create and initialize a billing agent."""
    return BillingAgent(config)


async def run_daily_billing_routine(agent: BillingAgent) -> Dict[str, Any]:
    """Run daily billing routine."""
    results = {
        "reminders_sent": 0,
        "renewals_processed": 0,
        "revenue_today": 0
    }
    
    # Check overdue invoices
    reminders = await agent.check_overdue_invoices()
    results["reminders_sent"] = len(reminders)
    
    # Process subscription renewals
    renewals = await agent.process_subscription_renewals()
    results["renewals_processed"] = len(renewals)
    
    # Get today's revenue
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    report = await agent.get_revenue_report(today, datetime.now())
    results["revenue_today"] = report["revenue"]["gross"]
    
    return results
