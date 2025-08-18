#!/usr/bin/env python3
"""
API TESTER - Test the real extraction API
"""

import requests
import json

def test_extraction_api():
    """Test the real extraction API"""
    
    test_cases = [
        {
            'domain': 'yangontyre.com',
            'expected': 'should_fail',
            'reason': 'Domain does not exist'
        },
        {
            'domain': 'github.com', 
            'expected': 'should_work',
            'reason': 'Real domain with real emails'
        },
        {
            'domain': 'example.com',
            'expected': 'should_work_limited',
            'reason': 'Real domain but limited emails'
        }
    ]
    
    print("🧪 TESTING REAL EMAIL EXTRACTION API")
    print("=" * 50)
    
    for i, test in enumerate(test_cases, 1):
        print(f"\n🔍 TEST {i}: {test['domain']}")
        print(f"Expected: {test['expected']} ({test['reason']})")
        
        try:
            response = requests.post(
                'http://localhost:5001/api/extract_emails_real',
                json={'domain': test['domain']},
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                
                print(f"✅ API Response received")
                print(f"Success: {data.get('success', False)}")
                print(f"Domain: {data.get('domain', 'N/A')}")
                
                if data.get('success'):
                    print(f"Domain IP: {data.get('domain_ip', 'N/A')}")
                    print(f"Website accessible: {data.get('website_accessible', False)}")
                    print(f"Emails found: {data.get('total_found', 0)}")
                    
                    if data.get('emails'):
                        for email_data in data['emails'][:3]:  # Show first 3
                            print(f"  📧 {email_data['email']} ({email_data['verification']['confidence']}%)")
                    
                    print(f"Real verification: {data.get('real_extraction', False)}")
                else:
                    print(f"❌ Error: {data.get('error', 'Unknown error')}")
                    print(f"Real verification: {data.get('real_verification', False)}")
                
            else:
                print(f"❌ HTTP Error: {response.status_code}")
                print(f"Response: {response.text[:200]}")
                
        except requests.exceptions.ConnectionError:
            print("❌ Connection failed - Agent system may not be running")
            print("💡 Start with: python agent_delegation_system.py")
            
        except Exception as e:
            print(f"❌ Test failed: {str(e)}")
            
        print("-" * 40)

if __name__ == "__main__":
    test_extraction_api()
