#!/usr/bin/env python3
"""
DEVELOPMENT TEAM STATUS CHECKER
Real-time monitoring of R&D and development operations
FOR COPILOT/AGENT USE ONLY
"""

import requests
import json
import time
from datetime import datetime
import os
import sqlite3

def check_agent_status(port, name):
    """Check if agent is responding and get its status"""
    try:
        response = requests.get(f'http://localhost:{port}', timeout=5)
        if response.status_code == 200:
            return f"✅ {name}: ACTIVE"
        else:
            return f"❌ {name}: ERROR (HTTP {response.status_code})"
    except Exception as e:
        return f"❌ {name}: DOWN ({str(e)})"

def check_dev_databases():
    """Check SQLite databases for real work output"""
    db_files = [
        'dev_team_agent.db',
        'autonomous_agents.db',
        'codebase_analysis.db'
    ]
    
    db_status = []
    for db_file in db_files:
        if os.path.exists(db_file):
            try:
                conn = sqlite3.connect(db_file)
                cursor = conn.cursor()
                
                # Get table names
                cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
                tables = cursor.fetchall()
                
                db_info = f"📊 {db_file}: {len(tables)} tables"
                
                # Check for recent activity
                for table in tables:
                    table_name = table[0]
                    try:
                        cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
                        count = cursor.fetchone()[0]
                        db_info += f"\n   - {table_name}: {count} records"
                    except:
                        pass
                
                db_status.append(db_info)
                conn.close()
                
            except Exception as e:
                db_status.append(f"❌ {db_file}: ERROR ({str(e)})")
        else:
            db_status.append(f"⚠️  {db_file}: NOT FOUND")
    
    return db_status

def main():
    """Monitor development team status"""
    print("🔧 DEVELOPMENT TEAM STATUS MONITOR")
    print("=" * 50)
    print(f"⏰ Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    # Check agent status
    agents = [
        (8515, "Development Team R&D"),
        (8514, "Quality Assurance"),
        (8513, "Business Intelligence"),
        (8512, "Web Automation")
    ]
    
    print("🤖 AGENT STATUS:")
    for port, name in agents:
        status = check_agent_status(port, name)
        print(f"   {status}")
    
    print()
    
    # Check databases
    print("📊 DATABASE STATUS:")
    db_statuses = check_dev_databases()
    for status in db_statuses:
        print(f"   {status}")
    
    print()
    
    # Check for real work files
    print("📁 REAL WORK OUTPUT:")
    work_files = [
        'code_reviews.log',
        'codebase_metrics.json',
        'improvement_backups',
        'research_reports'
    ]
    
    for file in work_files:
        if os.path.exists(file):
            if os.path.isdir(file):
                count = len(os.listdir(file)) if os.path.isdir(file) else 0
                print(f"   ✅ {file}/: {count} items")
            else:
                size = os.path.getsize(file)
                print(f"   ✅ {file}: {size} bytes")
        else:
            print(f"   ⏳ {file}: Not yet created")
    
    print()
    print("🎯 FOCUS: R&D Operations, Codebase Analysis, Real Testing")
    print("🚀 FOR COPILOT/AGENT MANAGEMENT AND CONFIGURATION")

if __name__ == "__main__":
    main()
