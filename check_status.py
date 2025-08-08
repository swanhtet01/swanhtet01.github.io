#!/usr/bin/env python3
"""
Quick status checker for Super Mega Social AI Tool
"""

import requests
import json
import subprocess
from datetime import datetime

def check_website():
    """Check if website is accessible"""
    try:
        response = requests.get('https://swanhtet01.github.io/', timeout=10)
        return {
            'status': 'UP' if response.status_code == 200 else 'DOWN',
            'status_code': response.status_code,
            'response_time': f"{response.elapsed.total_seconds():.2f}s",
            'title_found': 'Super Mega Social AI Tool' in response.text
        }
    except Exception as e:
        return {
            'status': 'ERROR',
            'error': str(e)
        }

def check_git():
    """Check git status"""
    try:
        # Get current branch
        branch_result = subprocess.run(['git', 'branch', '--show-current'], 
                                     capture_output=True, text=True)
        current_branch = branch_result.stdout.strip()
        
        # Check for uncommitted changes
        status_result = subprocess.run(['git', 'status', '--porcelain'], 
                                     capture_output=True, text=True)
        has_changes = bool(status_result.stdout.strip())
        
        # Get remote URL
        remote_result = subprocess.run(['git', 'remote', 'get-url', 'origin'], 
                                     capture_output=True, text=True)
        remote_url = remote_result.stdout.strip()
        
        return {
            'branch': current_branch,
            'has_changes': has_changes,
            'remote': remote_url,
            'correct_remote': 'swanhtet01.github.io' in remote_url
        }
    except Exception as e:
        return {'error': str(e)}

def main():
    print("🚀 Super Mega Social AI Tool - Status Check")
    print("=" * 50)
    
    # Check website
    print("\n🌐 Website Status:")
    website_status = check_website()
    for key, value in website_status.items():
        print(f"   {key}: {value}")
    
    # Check git
    print("\n📝 Git Repository Status:")  
    git_status = check_git()
    for key, value in git_status.items():
        print(f"   {key}: {value}")
    
    # Overall status
    print("\n📊 Overall Status:")
    website_ok = website_status.get('status') == 'UP'
    git_ok = git_status.get('correct_remote', False)
    
    if website_ok and git_ok:
        print("   ✅ EVERYTHING IS WORKING PERFECTLY!")
        print("   🎉 Your Social AI Tool website is live and ready!")
        print(f"   🌐 Visit: https://swanhtet01.github.io/")
    else:
        print("   ⚠️  Some issues detected:")
        if not website_ok:
            print("      - Website is not accessible")
        if not git_ok:
            print("      - Git remote is not correctly configured")
    
    # Save status report
    status_report = {
        'timestamp': datetime.now().isoformat(),
        'website': website_status,
        'git': git_status,
        'overall_status': 'OK' if website_ok and git_ok else 'ISSUES'
    }
    
    with open('status_check_report.json', 'w') as f:
        json.dump(status_report, f, indent=2)
    
    print(f"\n📄 Status report saved to: status_check_report.json")

if __name__ == "__main__":
    main()
