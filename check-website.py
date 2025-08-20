#!/usr/bin/env python3
import requests
import time
from datetime import datetime

def check_website():
    print("🔍 Checking supermega.dev website status...")
    print("=" * 50)
    
    try:
        # Check the website
        response = requests.get("https://supermega.dev", timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response Time: {response.elapsed.total_seconds():.2f}s")
        print(f"Content Length: {len(response.text)} characters")
        
        # Check if it contains our new content
        if "Made by AI" in response.text:
            print("✅ SUCCESS: Website updated with new design!")
        elif "MEGA Agent OS" in response.text:
            print("❌ ISSUE: Website still showing old content")
        else:
            print("⚠️  WARNING: Unknown content on website")
            
        # Show first few lines of content
        print("\n📄 Website Content Preview:")
        print("-" * 30)
        lines = response.text.split('\n')[:10]
        for line in lines:
            if line.strip():
                print(line.strip()[:80])
                
    except requests.exceptions.RequestException as e:
        print(f"❌ ERROR: Could not reach website - {e}")
    
    print(f"\n🕐 Checked at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 50)

if __name__ == "__main__":
    check_website()
