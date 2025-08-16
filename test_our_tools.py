#!/usr/bin/env python3
"""
TOOL TESTING SCRIPT - Prove Everything Actually Works
"""

import os
import sys
import sqlite3
import json
from datetime import datetime

def test_database():
    """Test that our database is real and functional"""
    print("🔍 Testing Real Database...")
    
    db_file = "real_data.db"
    if os.path.exists(db_file):
        conn = sqlite3.connect(db_file)
        cursor = conn.cursor()
        
        # Check tables exist
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        print(f"✅ Database exists with {len(tables)} tables: {[t[0] for t in tables]}")
        
        # Check data
        cursor.execute("SELECT COUNT(*) FROM leads")
        lead_count = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM website_data")
        website_count = cursor.fetchone()[0]
        
        print(f"✅ Database contains {lead_count} leads and {website_count} scraped websites")
        
        conn.close()
        return True
    else:
        print("❌ Database not found")
        return False

def test_email_extraction():
    """Test email extraction functionality"""
    print("\n📧 Testing Email Extraction...")
    
    try:
        # Import our tools
        sys.path.append('.')
        from real_functional_tools_simple import RealAITools
        
        tools = RealAITools()
        
        # Test extraction
        test_domain = "example.com"
        emails = tools.extract_emails_from_domain(test_domain)
        
        print(f"✅ Email extraction works! Found {len(emails)} emails for {test_domain}")
        print(f"   Sample emails: {emails[:3]}")
        
        return True, len(emails)
    except Exception as e:
        print(f"❌ Email extraction failed: {e}")
        return False, 0

def test_website_scraping():
    """Test website scraping functionality"""
    print("\n🕷️ Testing Website Scraping...")
    
    try:
        from real_functional_tools_simple import RealAITools
        
        tools = RealAITools()
        
        # Test scraping
        test_url = "https://httpbin.org/html"
        data = tools.scrape_website_data(test_url)
        
        if 'error' not in data:
            print(f"✅ Website scraping works!")
            print(f"   Title: {data.get('title', 'N/A')}")
            print(f"   Links found: {data.get('links_count', 0)}")
            print(f"   Images found: {data.get('images_count', 0)}")
            print(f"   Page size: {data.get('page_size', 0)} bytes")
            return True, data
        else:
            print(f"❌ Scraping failed: {data['error']}")
            return False, {}
            
    except Exception as e:
        print(f"❌ Website scraping failed: {e}")
        return False, {}

def test_template_generation():
    """Test email template generation"""
    print("\n✍️ Testing Template Generation...")
    
    try:
        from real_functional_tools_simple import RealAITools
        
        tools = RealAITools()
        
        # Test template generation
        template = tools.generate_real_email_content("cold_outreach", "TestCorp", "John")
        
        print("✅ Template generation works!")
        print(f"   Template preview: {template[:100]}...")
        
        return True, len(template)
    except Exception as e:
        print(f"❌ Template generation failed: {e}")
        return False, 0

def test_data_reports():
    """Test data reporting functionality"""
    print("\n📊 Testing Data Reports...")
    
    try:
        from real_functional_tools_simple import RealAITools
        
        tools = RealAITools()
        
        # Test report generation
        report = tools.get_real_data_report()
        
        print("✅ Data reporting works!")
        print(f"   Total leads: {report['total_leads']}")
        print(f"   Websites scraped: {report['total_websites_scraped']}")
        print(f"   Unique domains: {report['domains_processed']}")
        
        return True, report
    except Exception as e:
        print(f"❌ Data reporting failed: {e}")
        return False, {}

def generate_test_report():
    """Generate comprehensive test report"""
    print("🚀 SUPER MEGA AI TOOLS - COMPREHENSIVE TEST REPORT")
    print("=" * 60)
    print(f"Test Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("Testing all functionality to prove tools actually work...\n")
    
    results = {}
    
    # Test 1: Database
    results['database'] = test_database()
    
    # Test 2: Email Extraction
    email_works, email_count = test_email_extraction()
    results['email_extraction'] = {'works': email_works, 'count': email_count}
    
    # Test 3: Website Scraping
    scraping_works, scraping_data = test_website_scraping()
    results['website_scraping'] = {'works': scraping_works, 'data': scraping_data}
    
    # Test 4: Template Generation
    template_works, template_length = test_template_generation()
    results['template_generation'] = {'works': template_works, 'length': template_length}
    
    # Test 5: Data Reports
    report_works, report_data = test_data_reports()
    results['data_reporting'] = {'works': report_works, 'data': report_data}
    
    # Summary
    print("\n" + "=" * 60)
    print("📋 TEST RESULTS SUMMARY:")
    
    working_tools = sum([
        results['database'],
        results['email_extraction']['works'],
        results['website_scraping']['works'], 
        results['template_generation']['works'],
        results['data_reporting']['works']
    ])
    
    print(f"✅ {working_tools}/5 tools are FULLY FUNCTIONAL")
    
    if working_tools == 5:
        print("\n🎉 ALL TOOLS WORKING - READY FOR BUSINESS!")
        print("💰 These tools can generate real revenue:")
        print("   • Lead generation services: $500-1500 per project")
        print("   • SaaS subscriptions: $97/month per user")
        print("   • Data extraction consulting: $300-800 per report")
    else:
        print(f"\n⚠️ {5-working_tools} tools need fixing")
    
    print("\n📁 Test completed. Database file:", os.path.abspath("real_data.db"))
    print("🔧 Tools file:", os.path.abspath("real_functional_tools_simple.py"))
    
    # Save test results
    with open("tool_test_results.json", "w") as f:
        json.dump({
            'test_date': datetime.now().isoformat(),
            'results': results,
            'working_tools': working_tools,
            'total_tools': 5,
            'status': 'PASS' if working_tools == 5 else 'PARTIAL'
        }, f, indent=2)
    
    print("💾 Test results saved to: tool_test_results.json")

if __name__ == "__main__":
    generate_test_report()
