#!/usr/bin/env python3
"""
Revenue-Focused Prospect Outreach System
Target: 4 clients x $500 = $2000/month in 30 days
"""

import sqlite3
import json
from datetime import datetime, timedelta
from typing import List, Dict
import smtplib
from email.mime.text import MimeText
from email.mime.multipart import MimeMultipart

class ProspectManager:
    def __init__(self):
        self.db_path = "revenue_prospects.db"
        self.init_database()
    
    def init_database(self):
        """Initialize prospect tracking database"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Create prospects table
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS prospects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT,
            linkedin TEXT,
            company TEXT,
            industry TEXT,
            pain_point TEXT,
            status TEXT DEFAULT 'new',
            contact_date DATE,
            last_followup DATE,
            response TEXT,
            conversion_probability INTEGER DEFAULT 0,
            deal_size INTEGER DEFAULT 500,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        ''')
        
        # Create outreach tracking
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS outreach (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prospect_id INTEGER,
            channel TEXT,
            message_type TEXT,
            sent_date DATE,
            responded BOOLEAN DEFAULT 0,
            response_date DATE,
            notes TEXT,
            FOREIGN KEY (prospect_id) REFERENCES prospects (id)
        )
        ''')
        
        conn.commit()
        conn.close()
    
    def add_prospect(self, prospect_data: Dict) -> int:
        """Add new prospect to database"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
        INSERT INTO prospects (name, email, linkedin, company, industry, pain_point)
        VALUES (?, ?, ?, ?, ?, ?)
        ''', (
            prospect_data['name'],
            prospect_data.get('email', ''),
            prospect_data.get('linkedin', ''),
            prospect_data['company'],
            prospect_data['industry'],
            prospect_data.get('pain_point', '')
        ))
        
        prospect_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        return prospect_id
    
    def get_daily_targets(self) -> List[Dict]:
        """Get prospects to contact today"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Get new prospects + follow-ups due
        today = datetime.now().date()
        followup_date = today - timedelta(days=3)  # Follow up every 3 days
        
        cursor.execute('''
        SELECT * FROM prospects 
        WHERE (status = 'new' OR (status = 'contacted' AND last_followup <= ?))
        AND status != 'converted'
        AND status != 'dead'
        LIMIT 10
        ''', (followup_date,))
        
        prospects = cursor.fetchall()
        conn.close()
        
        # Convert to dict format
        columns = ['id', 'name', 'email', 'linkedin', 'company', 'industry', 
                  'pain_point', 'status', 'contact_date', 'last_followup', 
                  'response', 'conversion_probability', 'deal_size', 'notes', 'created_at']
        
        return [dict(zip(columns, prospect)) for prospect in prospects]

class OutreachTemplates:
    """Revenue-focused outreach templates"""
    
    @staticmethod
    def get_linkedin_message(industry: str, company: str) -> str:
        """Get personalized LinkedIn message"""
        templates = {
            'real-estate': f"""Hi! Saw you're with {company}. Quick question - how much time do you spend weekly finding homeowner leads?

Most agents spend 10+ hours or pay $1000s for tools like ZoomInfo.

I have AI tools that find 500 qualified homeowner contacts in 24 hours for $500.

Want to see a free sample of 20 leads in your area?

Takes me 10 minutes, could save you hours weekly.""",
            
            'recruiting': f"""Hi! Saw you're recruiting for {company}. How much time do you spend finding candidate contact info?

Most recruiters spend 15+ hours weekly or pay big $ for sourcing tools.

I can find 500 qualified candidate contacts in 24 hours for $500.

Want a free sample of 20 candidates in your niche?

Quick 10-minute task that could save you hours.""",
            
            'marketing': f"""Hi! Saw {company}'s marketing work. Quick question - do you help clients with lead generation?

Many agencies struggle with expensive data tools or time-consuming manual research.

I have AI tools that find 500 qualified leads in 24 hours for $500.

Interested in white-labeling this service for your clients?

Could be a new revenue stream.""",
            
            'default': f"""Hi! Saw you work with {company}. Quick question - how much do you spend monthly on lead generation tools?

Most businesses pay $1000s for ZoomInfo or spend hours on manual research.

I have AI tools that find 500 qualified prospects in 24 hours for $500.

Want to see a free sample of 20 leads for your industry?

Takes 10 minutes, could save you significant time/money."""
        }
        
        return templates.get(industry, templates['default'])
    
    @staticmethod
    def get_email_template(industry: str, company: str, name: str) -> str:
        """Get personalized email template"""
        subject_lines = {
            'real-estate': f"500 qualified homeowner leads for {company} - 24 hours",
            'recruiting': f"500 candidate contacts for {company} - 24 hours", 
            'marketing': f"White-label lead generation service for {company}",
            'default': f"500 qualified leads for {company} - 24 hours"
        }
        
        email_body = f"""Hi {name},

Are you spending too much time or money on lead generation?

I can find 500 qualified prospects with contact info in 24 hours for $500.

Here's what you get:
• Verified email addresses
• Phone numbers when available  
• Company information
• Ready-to-import CSV format

Example for your industry:
• {industry.replace('-', ' ').title()} professionals in your target market
• Decision makers with 10-50 employee companies
• Contacts verified within the last 30 days

Interested in seeing a FREE sample of 20 leads to check the quality?

Takes me 10 minutes to generate, could save you hours of manual work.

Best regards,
[Your Name]

P.S. - No subscriptions or ongoing costs. One-time service with guaranteed delivery.
"""
        
        return email_body
    
    @staticmethod
    def get_followup_template(days_since: int) -> str:
        """Get follow-up message based on days since last contact"""
        if days_since <= 3:
            return """Hi again! Just following up on the free lead sample I offered.

Did you have a chance to review the 20 leads I sent?

If the quality looks good, I can generate the full 500-lead list within 24 hours.

Let me know if you have any questions!"""
        
        elif days_since <= 7:
            return """Hi! Last follow-up from me on the lead generation service.

To recap: 500 qualified leads in 24 hours for $500 (vs $15K/year for ZoomInfo).

If lead generation isn't a priority right now, no worries at all.

But if it is, happy to send that free sample of 20 leads to show you the quality.

Best!"""
        
        else:
            return """Hi! Hope business is going well at [Company].

I know lead generation tools can be expensive and time-consuming.

If you ever need a quick batch of qualified prospects (500 leads in 24hrs for $500), just let me know.

Always happy to send a free sample first to show quality.

Best of luck with everything!"""

class RevenueTracker:
    """Track progress toward $2000/month goal"""
    
    def __init__(self):
        self.db_path = "revenue_prospects.db"
    
    def get_monthly_stats(self) -> Dict:
        """Get current month's progress"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Get this month's data
        current_month = datetime.now().strftime('%Y-%m')
        
        cursor.execute('''
        SELECT 
            COUNT(*) as total_prospects,
            COUNT(CASE WHEN status = 'contacted' THEN 1 END) as contacted,
            COUNT(CASE WHEN status = 'responded' THEN 1 END) as responded,
            COUNT(CASE WHEN status = 'converted' THEN 1 END) as converted,
            SUM(CASE WHEN status = 'converted' THEN deal_size ELSE 0 END) as revenue
        FROM prospects 
        WHERE created_at LIKE ?
        ''', (f'{current_month}%',))
        
        stats = cursor.fetchone()
        conn.close()
        
        return {
            'total_prospects': stats[0],
            'contacted': stats[1],
            'responded': stats[2], 
            'converted': stats[3],
            'revenue': stats[4] or 0,
            'response_rate': (stats[2] / max(stats[1], 1)) * 100,
            'conversion_rate': (stats[3] / max(stats[2], 1)) * 100,
            'goal_progress': (stats[4] or 0) / 2000 * 100
        }
    
    def print_dashboard(self):
        """Print revenue dashboard"""
        stats = self.get_monthly_stats()
        
        print("\n🎯 REVENUE DASHBOARD - 30-DAY GOAL: $2,000")
        print("=" * 50)
        print(f"💰 Current Revenue: ${stats['revenue']:,}")
        print(f"📈 Goal Progress: {stats['goal_progress']:.1f}%")
        print(f"🔥 Converted Clients: {stats['converted']}/4")
        print()
        print("📊 FUNNEL METRICS:")
        print(f"   Prospects Added: {stats['total_prospects']}")
        print(f"   Contacted: {stats['contacted']}")
        print(f"   Responded: {stats['responded']}")
        print(f"   Response Rate: {stats['response_rate']:.1f}%")
        print(f"   Conversion Rate: {stats['conversion_rate']:.1f}%")
        print()
        
        remaining = 2000 - stats['revenue']
        if remaining > 0:
            clients_needed = remaining / 500
            print(f"🎯 TO REACH GOAL:")
            print(f"   Revenue Needed: ${remaining:,}")
            print(f"   Clients Needed: {clients_needed:.1f}")
        else:
            print("🏆 GOAL ACHIEVED! Time to scale to $5K/month!")

def setup_initial_prospects():
    """Add initial prospect list for real estate and recruiting"""
    pm = ProspectManager()
    
    # Sample prospects (replace with real data)
    prospects = [
        {
            'name': 'Sarah Johnson',
            'email': 'sarah@premiumrealty.com',
            'linkedin': 'linkedin.com/in/sarahjohnson-realestate',
            'company': 'Premium Realty Group',
            'industry': 'real-estate',
            'pain_point': 'Spending 15 hours/week finding homeowner leads'
        },
        {
            'name': 'Mike Chen', 
            'email': 'mike@techrecruiter.com',
            'company': 'TechTalent Recruiting',
            'industry': 'recruiting',
            'pain_point': 'High cost of sourcing tools, manual candidate research'
        },
        {
            'name': 'Jessica Martinez',
            'email': 'jessica@growthmarketing.com',
            'company': 'Growth Marketing Agency',
            'industry': 'marketing',
            'pain_point': 'Clients need lead generation but tools are expensive'
        }
    ]
    
    for prospect in prospects:
        pm.add_prospect(prospect)
    
    print(f"✅ Added {len(prospects)} initial prospects")

def daily_outreach_routine():
    """Execute daily outreach routine"""
    pm = ProspectManager()
    templates = OutreachTemplates()
    tracker = RevenueTracker()
    
    # Show dashboard
    tracker.print_dashboard()
    
    # Get today's targets
    targets = pm.get_daily_targets()
    
    if not targets:
        print("\n✅ No outreach targets for today. Add more prospects!")
        return
    
    print(f"\n🎯 TODAY'S OUTREACH TARGETS: {len(targets)} prospects")
    print("=" * 50)
    
    for prospect in targets:
        print(f"\n👤 {prospect['name']} - {prospect['company']}")
        print(f"   Industry: {prospect['industry']}")
        print(f"   Status: {prospect['status']}")
        
        # Generate LinkedIn message
        linkedin_msg = templates.get_linkedin_message(
            prospect['industry'], 
            prospect['company']
        )
        
        print(f"\n📱 LinkedIn Message:")
        print(linkedin_msg)
        
        # Generate email
        if prospect['email']:
            email_msg = templates.get_email_template(
                prospect['industry'],
                prospect['company'], 
                prospect['name']
            )
            
            print(f"\n📧 Email Template:")
            print(f"Subject: 500 qualified leads for {prospect['company']} - 24 hours")
            print(email_msg)
        
        print("\n" + "—" * 50)

if __name__ == "__main__":
    print("🚀 REVENUE-FOCUSED PROSPECT OUTREACH SYSTEM")
    print("Goal: 4 clients x $500 = $2,000/month in 30 days")
    
    # Setup (run once)
    setup_initial_prospects()
    
    # Daily routine
    daily_outreach_routine()
    
    print("\n💡 NEXT STEPS:")
    print("1. Copy LinkedIn messages and send to prospects")
    print("2. Send personalized emails to prospects with email addresses")
    print("3. Track responses and update prospect status")
    print("4. Follow up with non-responders after 3 days")
    print("5. Run this script daily for consistent outreach")
    print("\n🎯 Remember: You only need 4 clients to hit $2,000/month!")
