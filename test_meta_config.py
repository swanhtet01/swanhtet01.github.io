#!/usr/bin/env python3
"""
Meta API Configuration Tester
Tests Facebook and Instagram API connectivity for Super Mega Social AI
"""

import os
import sys
import json
import requests
from datetime import datetime

def load_meta_config():
    """Load Meta configuration from .env.meta file"""
    config = {}
    env_file = '.env.meta'
    
    if not os.path.exists(env_file):
        print("❌ .env.meta file not found!")
        print("Please create .env.meta with your Meta API credentials")
        return None
    
    with open(env_file, 'r') as f:
        for line in f:
            if '=' in line and not line.startswith('#'):
                key, value = line.strip().split('=', 1)
                config[key] = value
    
    return config

def test_facebook_api(config):
    """Test Facebook API connectivity"""
    print("🔵 Testing Facebook API...")
    
    access_token = config.get('FACEBOOK_ACCESS_TOKEN')
    page_id = config.get('FACEBOOK_PAGE_ID')
    
    if not access_token or not page_id:
        print("   ❌ Missing Facebook credentials")
        return False
    
    try:
        # Test 1: Verify access token
        url = f"https://graph.facebook.com/me?access_token={access_token}"
        response = requests.get(url, timeout=10)
        
        if response.status_code != 200:
            print(f"   ❌ Token validation failed: {response.status_code}")
            return False
        
        print("   ✅ Access token valid")
        
        # Test 2: Check page access
        url = f"https://graph.facebook.com/{page_id}?access_token={access_token}"
        response = requests.get(url, timeout=10)
        
        if response.status_code == 200:
            page_data = response.json()
            print(f"   ✅ Page access confirmed: {page_data.get('name', 'Unknown')}")
            return True
        else:
            print(f"   ❌ Page access failed: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"   ❌ Facebook API error: {e}")
        return False

def test_instagram_api(config):
    """Test Instagram API connectivity"""
    print("📷 Testing Instagram API...")
    
    access_token = config.get('INSTAGRAM_ACCESS_TOKEN')
    account_id = config.get('INSTAGRAM_ACCOUNT_ID')
    
    if not access_token or not account_id:
        print("   ❌ Missing Instagram credentials")
        return False
    
    try:
        # Test Instagram Business account access
        url = f"https://graph.facebook.com/{account_id}?fields=name,username&access_token={access_token}"
        response = requests.get(url, timeout=10)
        
        if response.status_code == 200:
            account_data = response.json()
            print(f"   ✅ Instagram account access confirmed: @{account_data.get('username', 'Unknown')}")
            return True
        else:
            print(f"   ❌ Instagram API access failed: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"   ❌ Instagram API error: {e}")
        return False

def test_content_generation():
    """Test content generation capabilities"""
    print("🎨 Testing content generation...")
    
    try:
        # Import our Meta content generator
        sys.path.append('.')
        from meta_auto_dev_team import MetaAIContentGenerator
        
        generator = MetaAIContentGenerator()
        
        # Test Facebook content generation
        fb_content = generator.generate_facebook_content()
        print(f"   ✅ Facebook content generated: {fb_content.title[:50]}...")
        
        # Test Instagram content generation  
        ig_content = generator.generate_instagram_content()
        print(f"   ✅ Instagram content generated: {ig_content.title[:50]}...")
        
        return True
        
    except Exception as e:
        print(f"   ❌ Content generation error: {e}")
        return False

def test_database_connection():
    """Test analytics database"""
    print("💾 Testing database connection...")
    
    try:
        import sqlite3
        
        # Test database creation and connection
        conn = sqlite3.connect('test_meta_analytics.db')
        cursor = conn.cursor()
        
        cursor.execute('CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY)')
        cursor.execute('INSERT INTO test DEFAULT VALUES')
        cursor.execute('SELECT COUNT(*) FROM test')
        
        result = cursor.fetchone()[0]
        conn.close()
        
        # Clean up test database
        os.remove('test_meta_analytics.db')
        
        print(f"   ✅ Database operations successful")
        return True
        
    except Exception as e:
        print(f"   ❌ Database error: {e}")
        return False

def generate_test_report(results):
    """Generate test report"""
    report = {
        'timestamp': datetime.now().isoformat(),
        'test_results': results,
        'overall_status': 'PASS' if all(results.values()) else 'FAIL',
        'recommendations': []
    }
    
    # Add recommendations based on failures
    if not results.get('facebook_api'):
        report['recommendations'].append("Configure Facebook API credentials in .env.meta")
    
    if not results.get('instagram_api'):
        report['recommendations'].append("Configure Instagram API credentials in .env.meta")
    
    if not results.get('content_generation'):
        report['recommendations'].append("Check meta_auto_dev_team.py for content generation issues")
    
    if not results.get('database'):
        report['recommendations'].append("Verify database permissions and sqlite3 installation")
    
    # Save report
    with open('meta_api_test_report.json', 'w') as f:
        json.dump(report, f, indent=2)
    
    return report

def main():
    print("🚀 Super Mega Meta API Configuration Tester")
    print("=" * 50)
    print()
    
    # Load configuration
    config = load_meta_config()
    if not config:
        return
    
    print("📋 Configuration loaded successfully")
    print(f"   Company: {config.get('COMPANY_NAME', 'Not set')}")
    print(f"   Website: {config.get('WEBSITE_URL', 'Not set')}")
    print()
    
    # Run tests
    results = {}
    
    results['facebook_api'] = test_facebook_api(config)
    print()
    
    results['instagram_api'] = test_instagram_api(config)
    print()
    
    results['content_generation'] = test_content_generation()
    print()
    
    results['database'] = test_database_connection()
    print()
    
    # Generate report
    report = generate_test_report(results)
    
    # Display results
    print("📊 TEST RESULTS")
    print("=" * 30)
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{test_name.replace('_', ' ').title():<20} {status}")
    
    print()
    print(f"Overall Status: {'🟢 READY TO GO' if report['overall_status'] == 'PASS' else '🔴 NEEDS SETUP'}")
    
    if report['recommendations']:
        print("\n📝 RECOMMENDATIONS:")
        for rec in report['recommendations']:
            print(f"   • {rec}")
    
    print(f"\n📄 Detailed report saved to: meta_api_test_report.json")
    
    if report['overall_status'] == 'PASS':
        print("\n🎉 Everything looks good! You can now run:")
        print("   START_META_AUTO_DEV.bat")
    else:
        print("\n⚠️  Please fix the issues above before starting the Meta Auto Dev Team")

if __name__ == "__main__":
    main()
