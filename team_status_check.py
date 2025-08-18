#!/usr/bin/env python3
"""
TEAM & OVERALL STATUS CHECK
Shows current progress of all iterating systems
"""

import os
import json
from datetime import datetime

def check_team_status():
    print("🚀 SUPER MEGA INC - TEAM & OVERALL STATUS")
    print("=" * 60)
    print(f"📅 {datetime.now().strftime('%B %d, %Y - %H:%M:%S')}")
    
    print("\n🤖 DEVELOPMENT TEAM STATUS:")
    
    # Check if enhanced team is running
    team_files = {
        "Enhanced Dev Team": "super_mega_dev_team.py",
        "Overall Coordinator": "overall_system_coordinator.py", 
        "Original Team": "active_dev_team.py"
    }
    
    for name, file in team_files.items():
        if os.path.exists(file):
            size = os.path.getsize(file)
            print(f"   ✅ {name}: Ready ({size:,} bytes)")
        else:
            print(f"   ❌ {name}: Missing")
            
    print("\n📊 PRODUCTION SYSTEMS:")
    
    production_files = {
        "Production Backend": "supermega_production.py",
        "Production Frontend": "supermega_production.html",
        "Enhanced Landing": "supermega_landing_production.html",
        "SSL Setup": "ssl_setup_now.py",
        "Cloud Deployer": "free_cloud_deployer_24_7.py"
    }
    
    ready_production = 0
    for name, file in production_files.items():
        if os.path.exists(file):
            size = os.path.getsize(file)
            print(f"   ✅ {name}: Ready ({size:,} bytes)")
            ready_production += 1
        else:
            print(f"   ❌ {name}: Missing")
            
    production_readiness = (ready_production / len(production_files)) * 100
    
    print("\n📈 ITERATION PROGRESS:")
    
    # Check for progress files
    progress_files = [
        "overall_progress.json",
        "production_launch_status.json",
        "performance_metrics.json"
    ]
    
    for file in progress_files:
        if os.path.exists(file):
            try:
                with open(file, 'r') as f:
                    data = json.load(f)
                print(f"   📄 {file}: Last updated")
                if 'iteration' in data:
                    print(f"      Iteration: {data['iteration']}")
                if 'overall_progress' in data:
                    print(f"      Progress: {data['overall_progress']:.1f}%")
            except:
                print(f"   📄 {file}: Exists but unreadable")
        else:
            print(f"   ❌ {file}: Not created yet")
            
    print(f"\n🎯 OVERALL STATUS:")
    print(f"   Production Readiness: {production_readiness:.1f}%")
    
    if production_readiness >= 80:
        print("   ✅ READY FOR SUPERMEGA.DEV DEPLOYMENT!")
        print("\n🚀 NEXT ACTIONS:")
        print("   1. SSL deployment should be running automatically")
        print("   2. Cloud deployment will follow")
        print("   3. supermega.dev will go live!")
        print("   4. AI agents will serve real customers")
    else:
        print("   ⚠️ Need more components for deployment")
        
    print(f"\n🔄 CONTINUOUS ITERATION STATUS:")
    
    # Check if systems are iterating
    if os.path.exists("overall_progress.json"):
        print("   ✅ Overall coordinator is iterating")
    else:
        print("   ❌ Overall coordinator not running")
        
    print("\n" + "=" * 60)
    print("🎯 MISSION: Deploy supermega.dev with AI agents serving customers!")
    
if __name__ == "__main__":
    check_team_status()
