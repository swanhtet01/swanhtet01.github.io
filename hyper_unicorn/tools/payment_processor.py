"""
Payment Processor Module
========================
Stripe integration for AI agents to handle payments, subscriptions, and invoicing.

Features:
- Customer management
- Payment processing
- Subscription management
- Invoice generation
- Refund handling
- Payment analytics

Author: Manus AI for SuperMega.dev
"""

import os
import sys
import json
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any, Union
from dataclasses import dataclass, field

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    import stripe
    STRIPE_AVAILABLE = True
except ImportError:
    STRIPE_AVAILABLE = False


@dataclass
class Customer:
    """Customer data structure."""
    id: str
    email: str
    name: str = ""
    phone: str = ""
    created: str = ""
    metadata: Dict[str, str] = field(default_factory=dict)
    default_payment_method: Optional[str] = None


@dataclass
class PaymentIntent:
    """Payment intent data structure."""
    id: str
    amount: int  # in cents
    currency: str
    status: str
    customer_id: Optional[str] = None
    description: str = ""
    metadata: Dict[str, str] = field(default_factory=dict)
    client_secret: Optional[str] = None


@dataclass
class Subscription:
    """Subscription data structure."""
    id: str
    customer_id: str
    status: str
    plan_id: str
    current_period_start: str = ""
    current_period_end: str = ""
    cancel_at_period_end: bool = False
    metadata: Dict[str, str] = field(default_factory=dict)


@dataclass
class Invoice:
    """Invoice data structure."""
    id: str
    customer_id: str
    amount_due: int
    amount_paid: int
    status: str
    due_date: Optional[str] = None
    paid_at: Optional[str] = None
    invoice_pdf: Optional[str] = None


class PaymentProcessor:
    """
    Payment Processor using Stripe API.
    
    Handles all payment-related operations for AI agents.
    """
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("STRIPE_SECRET_KEY", "")
        
        if STRIPE_AVAILABLE and self.api_key:
            stripe.api_key = self.api_key
            self.stripe = stripe
        else:
            self.stripe = None
    
    # =========================================================================
    # Customer Management
    # =========================================================================
    
    def create_customer(
        self,
        email: str,
        name: str = "",
        phone: str = "",
        metadata: Dict[str, str] = None
    ) -> Customer:
        """Create a new customer."""
        if not self.stripe:
            return Customer(id="", email=email, name=name)
        
        try:
            customer = self.stripe.Customer.create(
                email=email,
                name=name or None,
                phone=phone or None,
                metadata=metadata or {}
            )
            
            return Customer(
                id=customer.id,
                email=customer.email,
                name=customer.name or "",
                phone=customer.phone or "",
                created=datetime.fromtimestamp(customer.created).isoformat(),
                metadata=dict(customer.metadata) if customer.metadata else {}
            )
        except Exception as e:
            print(f"Error creating customer: {e}")
            return Customer(id="", email=email, name=name)
    
    def get_customer(self, customer_id: str) -> Optional[Customer]:
        """Get a customer by ID."""
        if not self.stripe:
            return None
        
        try:
            customer = self.stripe.Customer.retrieve(customer_id)
            
            return Customer(
                id=customer.id,
                email=customer.email,
                name=customer.name or "",
                phone=customer.phone or "",
                created=datetime.fromtimestamp(customer.created).isoformat(),
                metadata=dict(customer.metadata) if customer.metadata else {},
                default_payment_method=customer.default_source
            )
        except Exception as e:
            print(f"Error getting customer: {e}")
            return None
    
    def search_customers(self, query: str, limit: int = 10) -> List[Customer]:
        """Search for customers."""
        if not self.stripe:
            return []
        
        try:
            # Search by email
            customers = self.stripe.Customer.list(email=query, limit=limit)
            
            return [
                Customer(
                    id=c.id,
                    email=c.email,
                    name=c.name or "",
                    phone=c.phone or "",
                    created=datetime.fromtimestamp(c.created).isoformat()
                )
                for c in customers.data
            ]
        except Exception as e:
            print(f"Error searching customers: {e}")
            return []
    
    def update_customer(
        self,
        customer_id: str,
        email: str = None,
        name: str = None,
        metadata: Dict[str, str] = None
    ) -> Optional[Customer]:
        """Update a customer."""
        if not self.stripe:
            return None
        
        try:
            update_data = {}
            if email:
                update_data["email"] = email
            if name:
                update_data["name"] = name
            if metadata:
                update_data["metadata"] = metadata
            
            customer = self.stripe.Customer.modify(customer_id, **update_data)
            
            return Customer(
                id=customer.id,
                email=customer.email,
                name=customer.name or "",
                phone=customer.phone or ""
            )
        except Exception as e:
            print(f"Error updating customer: {e}")
            return None
    
    # =========================================================================
    # Payment Processing
    # =========================================================================
    
    def create_payment_intent(
        self,
        amount: int,
        currency: str = "usd",
        customer_id: str = None,
        description: str = "",
        metadata: Dict[str, str] = None
    ) -> PaymentIntent:
        """
        Create a payment intent.
        
        Args:
            amount: Amount in cents (e.g., 1000 = $10.00)
            currency: Currency code
            customer_id: Optional customer ID
            description: Payment description
            metadata: Additional metadata
            
        Returns:
            PaymentIntent with client_secret for frontend
        """
        if not self.stripe:
            return PaymentIntent(id="", amount=amount, currency=currency, status="error")
        
        try:
            intent_data = {
                "amount": amount,
                "currency": currency,
                "automatic_payment_methods": {"enabled": True}
            }
            
            if customer_id:
                intent_data["customer"] = customer_id
            if description:
                intent_data["description"] = description
            if metadata:
                intent_data["metadata"] = metadata
            
            intent = self.stripe.PaymentIntent.create(**intent_data)
            
            return PaymentIntent(
                id=intent.id,
                amount=intent.amount,
                currency=intent.currency,
                status=intent.status,
                customer_id=intent.customer,
                description=intent.description or "",
                client_secret=intent.client_secret,
                metadata=dict(intent.metadata) if intent.metadata else {}
            )
        except Exception as e:
            print(f"Error creating payment intent: {e}")
            return PaymentIntent(id="", amount=amount, currency=currency, status="error")
    
    def confirm_payment(self, payment_intent_id: str) -> PaymentIntent:
        """Confirm a payment intent."""
        if not self.stripe:
            return PaymentIntent(id=payment_intent_id, amount=0, currency="usd", status="error")
        
        try:
            intent = self.stripe.PaymentIntent.confirm(payment_intent_id)
            
            return PaymentIntent(
                id=intent.id,
                amount=intent.amount,
                currency=intent.currency,
                status=intent.status,
                customer_id=intent.customer
            )
        except Exception as e:
            print(f"Error confirming payment: {e}")
            return PaymentIntent(id=payment_intent_id, amount=0, currency="usd", status="error")
    
    def get_payment(self, payment_intent_id: str) -> Optional[PaymentIntent]:
        """Get payment intent details."""
        if not self.stripe:
            return None
        
        try:
            intent = self.stripe.PaymentIntent.retrieve(payment_intent_id)
            
            return PaymentIntent(
                id=intent.id,
                amount=intent.amount,
                currency=intent.currency,
                status=intent.status,
                customer_id=intent.customer,
                description=intent.description or ""
            )
        except Exception as e:
            print(f"Error getting payment: {e}")
            return None
    
    def create_refund(
        self,
        payment_intent_id: str,
        amount: int = None,
        reason: str = "requested_by_customer"
    ) -> Dict[str, Any]:
        """
        Create a refund.
        
        Args:
            payment_intent_id: Payment intent to refund
            amount: Amount to refund in cents (None = full refund)
            reason: Refund reason
            
        Returns:
            Refund details
        """
        if not self.stripe:
            return {"error": "Stripe not available"}
        
        try:
            refund_data = {
                "payment_intent": payment_intent_id,
                "reason": reason
            }
            
            if amount:
                refund_data["amount"] = amount
            
            refund = self.stripe.Refund.create(**refund_data)
            
            return {
                "id": refund.id,
                "amount": refund.amount,
                "status": refund.status,
                "reason": refund.reason,
                "created": datetime.fromtimestamp(refund.created).isoformat()
            }
        except Exception as e:
            print(f"Error creating refund: {e}")
            return {"error": str(e)}
    
    # =========================================================================
    # Subscription Management
    # =========================================================================
    
    def create_product(
        self,
        name: str,
        description: str = "",
        metadata: Dict[str, str] = None
    ) -> Dict[str, Any]:
        """Create a product."""
        if not self.stripe:
            return {"error": "Stripe not available"}
        
        try:
            product = self.stripe.Product.create(
                name=name,
                description=description or None,
                metadata=metadata or {}
            )
            
            return {
                "id": product.id,
                "name": product.name,
                "description": product.description,
                "active": product.active
            }
        except Exception as e:
            print(f"Error creating product: {e}")
            return {"error": str(e)}
    
    def create_price(
        self,
        product_id: str,
        amount: int,
        currency: str = "usd",
        interval: str = "month"
    ) -> Dict[str, Any]:
        """
        Create a recurring price.
        
        Args:
            product_id: Product ID
            amount: Amount in cents
            currency: Currency code
            interval: Billing interval (day, week, month, year)
            
        Returns:
            Price details
        """
        if not self.stripe:
            return {"error": "Stripe not available"}
        
        try:
            price = self.stripe.Price.create(
                product=product_id,
                unit_amount=amount,
                currency=currency,
                recurring={"interval": interval}
            )
            
            return {
                "id": price.id,
                "product": price.product,
                "amount": price.unit_amount,
                "currency": price.currency,
                "interval": price.recurring.interval if price.recurring else None
            }
        except Exception as e:
            print(f"Error creating price: {e}")
            return {"error": str(e)}
    
    def create_subscription(
        self,
        customer_id: str,
        price_id: str,
        trial_days: int = 0,
        metadata: Dict[str, str] = None
    ) -> Subscription:
        """Create a subscription."""
        if not self.stripe:
            return Subscription(id="", customer_id=customer_id, status="error", plan_id=price_id)
        
        try:
            sub_data = {
                "customer": customer_id,
                "items": [{"price": price_id}],
                "metadata": metadata or {}
            }
            
            if trial_days > 0:
                sub_data["trial_period_days"] = trial_days
            
            subscription = self.stripe.Subscription.create(**sub_data)
            
            return Subscription(
                id=subscription.id,
                customer_id=subscription.customer,
                status=subscription.status,
                plan_id=subscription.items.data[0].price.id,
                current_period_start=datetime.fromtimestamp(subscription.current_period_start).isoformat(),
                current_period_end=datetime.fromtimestamp(subscription.current_period_end).isoformat(),
                cancel_at_period_end=subscription.cancel_at_period_end
            )
        except Exception as e:
            print(f"Error creating subscription: {e}")
            return Subscription(id="", customer_id=customer_id, status="error", plan_id=price_id)
    
    def cancel_subscription(
        self,
        subscription_id: str,
        at_period_end: bool = True
    ) -> Subscription:
        """Cancel a subscription."""
        if not self.stripe:
            return Subscription(id=subscription_id, customer_id="", status="error", plan_id="")
        
        try:
            if at_period_end:
                subscription = self.stripe.Subscription.modify(
                    subscription_id,
                    cancel_at_period_end=True
                )
            else:
                subscription = self.stripe.Subscription.delete(subscription_id)
            
            return Subscription(
                id=subscription.id,
                customer_id=subscription.customer,
                status=subscription.status,
                plan_id=subscription.items.data[0].price.id if subscription.items.data else "",
                cancel_at_period_end=subscription.cancel_at_period_end
            )
        except Exception as e:
            print(f"Error canceling subscription: {e}")
            return Subscription(id=subscription_id, customer_id="", status="error", plan_id="")
    
    def get_subscription(self, subscription_id: str) -> Optional[Subscription]:
        """Get subscription details."""
        if not self.stripe:
            return None
        
        try:
            subscription = self.stripe.Subscription.retrieve(subscription_id)
            
            return Subscription(
                id=subscription.id,
                customer_id=subscription.customer,
                status=subscription.status,
                plan_id=subscription.items.data[0].price.id,
                current_period_start=datetime.fromtimestamp(subscription.current_period_start).isoformat(),
                current_period_end=datetime.fromtimestamp(subscription.current_period_end).isoformat(),
                cancel_at_period_end=subscription.cancel_at_period_end
            )
        except Exception as e:
            print(f"Error getting subscription: {e}")
            return None
    
    # =========================================================================
    # Invoice Management
    # =========================================================================
    
    def create_invoice(
        self,
        customer_id: str,
        items: List[Dict[str, Any]],
        due_days: int = 30,
        description: str = ""
    ) -> Invoice:
        """
        Create an invoice.
        
        Args:
            customer_id: Customer ID
            items: List of {"description": str, "amount": int, "quantity": int}
            due_days: Days until due
            description: Invoice description
            
        Returns:
            Invoice details
        """
        if not self.stripe:
            return Invoice(id="", customer_id=customer_id, amount_due=0, amount_paid=0, status="error")
        
        try:
            # Create invoice items
            for item in items:
                self.stripe.InvoiceItem.create(
                    customer=customer_id,
                    description=item.get("description", "Item"),
                    unit_amount=item.get("amount", 0),
                    quantity=item.get("quantity", 1),
                    currency="usd"
                )
            
            # Create and finalize invoice
            invoice = self.stripe.Invoice.create(
                customer=customer_id,
                description=description or None,
                days_until_due=due_days,
                auto_advance=True
            )
            
            # Finalize to get PDF
            invoice = self.stripe.Invoice.finalize_invoice(invoice.id)
            
            return Invoice(
                id=invoice.id,
                customer_id=invoice.customer,
                amount_due=invoice.amount_due,
                amount_paid=invoice.amount_paid,
                status=invoice.status,
                due_date=datetime.fromtimestamp(invoice.due_date).isoformat() if invoice.due_date else None,
                invoice_pdf=invoice.invoice_pdf
            )
        except Exception as e:
            print(f"Error creating invoice: {e}")
            return Invoice(id="", customer_id=customer_id, amount_due=0, amount_paid=0, status="error")
    
    def send_invoice(self, invoice_id: str) -> Dict[str, Any]:
        """Send an invoice to the customer."""
        if not self.stripe:
            return {"error": "Stripe not available"}
        
        try:
            invoice = self.stripe.Invoice.send_invoice(invoice_id)
            
            return {
                "id": invoice.id,
                "status": invoice.status,
                "sent": True,
                "hosted_invoice_url": invoice.hosted_invoice_url
            }
        except Exception as e:
            print(f"Error sending invoice: {e}")
            return {"error": str(e)}
    
    def list_invoices(
        self,
        customer_id: str = None,
        status: str = None,
        limit: int = 10
    ) -> List[Invoice]:
        """List invoices."""
        if not self.stripe:
            return []
        
        try:
            params = {"limit": limit}
            if customer_id:
                params["customer"] = customer_id
            if status:
                params["status"] = status
            
            invoices = self.stripe.Invoice.list(**params)
            
            return [
                Invoice(
                    id=inv.id,
                    customer_id=inv.customer,
                    amount_due=inv.amount_due,
                    amount_paid=inv.amount_paid,
                    status=inv.status,
                    due_date=datetime.fromtimestamp(inv.due_date).isoformat() if inv.due_date else None,
                    invoice_pdf=inv.invoice_pdf
                )
                for inv in invoices.data
            ]
        except Exception as e:
            print(f"Error listing invoices: {e}")
            return []
    
    # =========================================================================
    # Analytics
    # =========================================================================
    
    def get_revenue_summary(
        self,
        days: int = 30
    ) -> Dict[str, Any]:
        """Get revenue summary for the past N days."""
        if not self.stripe:
            return {"error": "Stripe not available"}
        
        try:
            # Get successful payments
            start_date = int((datetime.now() - timedelta(days=days)).timestamp())
            
            payments = self.stripe.PaymentIntent.list(
                created={"gte": start_date},
                limit=100
            )
            
            total_revenue = 0
            successful_payments = 0
            failed_payments = 0
            
            for payment in payments.data:
                if payment.status == "succeeded":
                    total_revenue += payment.amount
                    successful_payments += 1
                elif payment.status == "canceled" or payment.status == "requires_payment_method":
                    failed_payments += 1
            
            return {
                "period_days": days,
                "total_revenue_cents": total_revenue,
                "total_revenue_formatted": f"${total_revenue / 100:.2f}",
                "successful_payments": successful_payments,
                "failed_payments": failed_payments,
                "success_rate": successful_payments / (successful_payments + failed_payments) if (successful_payments + failed_payments) > 0 else 0,
                "average_payment": total_revenue / successful_payments if successful_payments > 0 else 0
            }
        except Exception as e:
            print(f"Error getting revenue summary: {e}")
            return {"error": str(e)}
    
    def get_subscription_metrics(self) -> Dict[str, Any]:
        """Get subscription metrics."""
        if not self.stripe:
            return {"error": "Stripe not available"}
        
        try:
            # Get all subscriptions
            subscriptions = self.stripe.Subscription.list(limit=100)
            
            active = 0
            trialing = 0
            canceled = 0
            mrr = 0
            
            for sub in subscriptions.data:
                if sub.status == "active":
                    active += 1
                    # Calculate MRR
                    for item in sub.items.data:
                        if item.price.recurring:
                            amount = item.price.unit_amount * item.quantity
                            interval = item.price.recurring.interval
                            if interval == "year":
                                mrr += amount / 12
                            elif interval == "month":
                                mrr += amount
                            elif interval == "week":
                                mrr += amount * 4
                            elif interval == "day":
                                mrr += amount * 30
                elif sub.status == "trialing":
                    trialing += 1
                elif sub.status == "canceled":
                    canceled += 1
            
            return {
                "active_subscriptions": active,
                "trialing_subscriptions": trialing,
                "canceled_subscriptions": canceled,
                "total_subscriptions": len(subscriptions.data),
                "mrr_cents": int(mrr),
                "mrr_formatted": f"${mrr / 100:.2f}",
                "arr_formatted": f"${(mrr * 12) / 100:.2f}"
            }
        except Exception as e:
            print(f"Error getting subscription metrics: {e}")
            return {"error": str(e)}


# ============================================================================
# Agent Payment Interface
# ============================================================================

class AgentPayments:
    """
    Payment interface for AI agents.
    Simplifies common payment operations.
    """
    
    def __init__(self):
        self.processor = PaymentProcessor()
    
    async def charge_customer(
        self,
        email: str,
        amount: float,
        description: str = "Agent service charge"
    ) -> Dict[str, Any]:
        """
        Charge a customer (creates customer if needed).
        
        Args:
            email: Customer email
            amount: Amount in dollars
            description: Charge description
            
        Returns:
            Payment result
        """
        # Find or create customer
        customers = self.processor.search_customers(email)
        
        if customers:
            customer = customers[0]
        else:
            customer = self.processor.create_customer(email=email)
        
        if not customer.id:
            return {"error": "Could not create customer"}
        
        # Create payment intent
        amount_cents = int(amount * 100)
        intent = self.processor.create_payment_intent(
            amount=amount_cents,
            customer_id=customer.id,
            description=description
        )
        
        return {
            "customer_id": customer.id,
            "payment_intent_id": intent.id,
            "client_secret": intent.client_secret,
            "amount": amount,
            "status": intent.status
        }
    
    async def create_subscription_plan(
        self,
        name: str,
        monthly_price: float,
        description: str = ""
    ) -> Dict[str, Any]:
        """
        Create a subscription plan.
        
        Args:
            name: Plan name
            monthly_price: Monthly price in dollars
            description: Plan description
            
        Returns:
            Plan details
        """
        # Create product
        product = self.processor.create_product(
            name=name,
            description=description
        )
        
        if "error" in product:
            return product
        
        # Create price
        price = self.processor.create_price(
            product_id=product["id"],
            amount=int(monthly_price * 100),
            currency="usd",
            interval="month"
        )
        
        return {
            "product_id": product["id"],
            "price_id": price.get("id"),
            "name": name,
            "monthly_price": monthly_price
        }
    
    async def subscribe_customer(
        self,
        email: str,
        price_id: str,
        trial_days: int = 0
    ) -> Dict[str, Any]:
        """
        Subscribe a customer to a plan.
        
        Args:
            email: Customer email
            price_id: Price ID to subscribe to
            trial_days: Free trial days
            
        Returns:
            Subscription details
        """
        # Find or create customer
        customers = self.processor.search_customers(email)
        
        if customers:
            customer = customers[0]
        else:
            customer = self.processor.create_customer(email=email)
        
        if not customer.id:
            return {"error": "Could not create customer"}
        
        # Create subscription
        subscription = self.processor.create_subscription(
            customer_id=customer.id,
            price_id=price_id,
            trial_days=trial_days
        )
        
        return {
            "subscription_id": subscription.id,
            "customer_id": customer.id,
            "status": subscription.status,
            "current_period_end": subscription.current_period_end
        }
    
    async def get_business_metrics(self) -> Dict[str, Any]:
        """Get comprehensive business metrics."""
        revenue = self.processor.get_revenue_summary(days=30)
        subscriptions = self.processor.get_subscription_metrics()
        
        return {
            "revenue_30d": revenue,
            "subscriptions": subscriptions
        }


# ============================================================================
# Example Usage
# ============================================================================

def main():
    """Example usage of the Payment Processor."""
    processor = PaymentProcessor()
    
    # Example 1: Create a customer
    # customer = processor.create_customer(
    #     email="test@example.com",
    #     name="Test Customer"
    # )
    # print(f"Created customer: {customer.id}")
    
    # Example 2: Create a payment intent
    # intent = processor.create_payment_intent(
    #     amount=1000,  # $10.00
    #     description="Test payment"
    # )
    # print(f"Payment intent: {intent.id}, client_secret: {intent.client_secret}")
    
    # Example 3: Get revenue summary
    revenue = processor.get_revenue_summary(days=30)
    print(f"Revenue summary: {json.dumps(revenue, indent=2)}")
    
    # Example 4: Get subscription metrics
    metrics = processor.get_subscription_metrics()
    print(f"Subscription metrics: {json.dumps(metrics, indent=2)}")


if __name__ == "__main__":
    main()
