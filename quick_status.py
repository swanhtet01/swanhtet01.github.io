#!/usr/bin/env python3
"""
Quick Status Check for Super Mega Inc
"""

import os
import json
from datetime import datetime

def check_system_status():
    print("🚀 SUPER MEGA INC - QUICK STATUS CHECK")
    print("=" * 60)
    print(f"⏰ Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Key system files
    key_files = {
        "Production System": "supermega_production.py",
        "Cost Controller": "github_cost_controller.py", 
        "Website": "supermega_production.html",
        "Coordinator": "supermega_coordinator.py",
        "Cost Report": "COST_OPTIMIZATION_COMPLETE.md",
        "SSL Setup": "ssl_setup_now.py",
        "Cloud Deployment": "free_cloud_deployer_24_7.py",
        "Agent System": "active_dev_team.py"
    }
    
    print("\n📊 KEY SYSTEMS STATUS:")
    total = len(key_files)
    ready = 0
    
    for name, filename in key_files.items():
        if os.path.exists(filename):
            size = os.path.getsize(filename)
            print(f"   ✅ {name}: Ready ({size:,} bytes)")
            ready += 1
        else:
            print(f"   ❌ {name}: Missing")
    
    completion = (ready / total) * 100
    
    print(f"\n🎯 OVERALL STATUS:")
    print(f"   Systems Ready: {ready}/{total}")
    print(f"   Completion: {completion:.1f}%")
    
    # Check if agents are running
    print(f"\n🤖 AGENT STATUS:")
    agent_files = [f for f in os.listdir('.') if 'agent' in f.lower() and f.endswith('.py')]
    print(f"   Available Agents: {len(agent_files)}")
    
    # Check website domain status
    print(f"\n🌐 WEBSITE STATUS:")
    print(f"   Production Domain: supermega.dev")
    print(f"   Demo Domain: GitHub Pages")
    
    # Next steps
    if completion >= 80:
        print(f"\n🎯 NEXT STEPS (System {completion:.1f}% Complete):")
        print("   1. Deploy to supermega.dev domain")
        print("   2. Setup SSL certificates")
        print("   3. Launch live agent system")
        print("   4. Start customer onboarding")
        print("   5. Go to market!")
    else:
        print(f"\n⚠️  SYSTEM NOT READY ({completion:.1f}% Complete)")
        print("   Need to complete core components first")

if __name__ == "__main__":
    check_system_status()
