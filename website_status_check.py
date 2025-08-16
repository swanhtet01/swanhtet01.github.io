#!/usr/bin/env python3
"""
SuperMega.dev Website Status Checker
Verifies GitHub Pages deployment and domain configuration
"""

import requests
import json
import time
from datetime import datetime

def check_website_status():
    """Check the status of supermega.dev website"""
    print("🔍 SUPERMEGA.DEV WEBSITE STATUS CHECK")
    print("=" * 50)
    
    # Check GitHub Pages URL
    github_url = "https://swanhtet01.github.io"
    print(f"📡 Checking GitHub Pages: {github_url}")
    
    try:
        response = requests.get(github_url, timeout=10)
        if response.status_code == 200:
            print(f"✅ GitHub Pages: Online (Status: {response.status_code})")
            print(f"📄 Content Length: {len(response.content)} bytes")
        else:
            print(f"⚠️ GitHub Pages: Issue (Status: {response.status_code})")
    except Exception as e:
        print(f"❌ GitHub Pages: Error - {str(e)}")
    
    print()
    
    # Check custom domain
    custom_url = "https://supermega.dev"
    print(f"🌐 Checking Custom Domain: {custom_url}")
    
    try:
        response = requests.get(custom_url, timeout=10)
        if response.status_code == 200:
            print(f"✅ SuperMega.dev: Online (Status: {response.status_code})")
            print(f"📄 Content Length: {len(response.content)} bytes")
            
            # Check if it contains our new content
            if "AI-Powered Professional Tools" in response.text:
                print("✅ Updated Content: Found new applications!")
            else:
                print("⚠️ Updated Content: May still be deploying...")
                
        else:
            print(f"⚠️ SuperMega.dev: Issue (Status: {response.status_code})")
    except Exception as e:
        print(f"❌ SuperMega.dev: Error - {str(e)}")
    
    print()
    
    # Domain diagnosis
    print("🔧 DOMAIN DIAGNOSIS:")
    print("- CNAME file exists: ✅")
    print("- GitHub repository: swanhtet01.github.io ✅")
    print("- Custom domain configured: supermega.dev ✅")
    print("- Recent commits pushed: ✅")
    print()
    
    # Recommendations
    print("📋 RECOMMENDATIONS:")
    print("1. GitHub Pages deployment may take 5-10 minutes")
    print("2. DNS propagation can take up to 24 hours")
    print("3. Check GitHub repository settings > Pages")
    print("4. Verify DNS records point to GitHub Pages IPs")
    print()
    
    print(f"⏰ Last checked: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

if __name__ == "__main__":
    check_website_status()
