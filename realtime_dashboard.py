#!/usr/bin/env python3
"""
🔧 REAL-TIME DEVELOPMENT DASHBOARD
Live monitoring and control interface for all development systems

🎯 PURPOSE: Real-time visibility into all development operations and metrics
⚠️  NO FAKE WORK - ONLY REAL DEVELOPMENT MONITORING AND CONTROL
"""

import os
import time
import sqlite3
import json
import requests
from datetime import datetime, timedelta
from collections import defaultdict

class RealTimeDashboard:
    def __init__(self):
        self.agents = {
            'dev_team': 'http://localhost:8515',
            'qa': 'http://localhost:8514', 
            'bi': 'http://localhost:8513',
            'automation': 'http://localhost:8512'
        }
        
        self.databases = {
            'analytics': 'dev_analytics.db',
            'optimization': 'code_optimization.db',
            'projects': 'project_management.db',
            'orchestration': 'orchestration_control.db'
        }
        
        self.metrics_cache = {}
        self.last_update = None
    
    def clear_screen(self):
        """Clear terminal screen"""
        os.system('cls' if os.name == 'nt' else 'clear')
    
    def get_agent_status(self):
        """Get real-time agent status"""
        status = {}
        for agent_name, url in self.agents.items():
            try:
                start_time = time.time()
                response = requests.get(f"{url}/health", timeout=3)
                response_time = (time.time() - start_time) * 1000
                
                if response.status_code == 200:
                    status[agent_name] = {
                        'status': '🟢 ONLINE',
                        'response_time': f"{response_time:.0f}ms",
                        'details': 'Operational'
                    }
                else:
                    status[agent_name] = {
                        'status': '🟡 ISSUES',
                        'response_time': f"{response_time:.0f}ms",
                        'details': f'HTTP {response.status_code}'
                    }
            except Exception as e:
                status[agent_name] = {
                    'status': '🔴 OFFLINE',
                    'response_time': 'N/A',
                    'details': str(e)[:30]
                }
        return status
    
    def get_database_metrics(self):
        """Get metrics from all databases"""
        metrics = {}
        
        # Analytics metrics
        try:
            conn = sqlite3.connect(self.databases['analytics'])
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT COUNT(*) as files_analyzed,
                       AVG(complexity_score) as avg_complexity,
                       AVG(maintainability_index) as avg_maintainability
                FROM code_quality
                WHERE DATE(timestamp) = DATE('now')
            ''')
            
            result = cursor.fetchone()
            if result:
                metrics['analytics'] = {
                    'files_analyzed': result[0],
                    'avg_complexity': round(result[1] or 0, 1),
                    'avg_maintainability': round(result[2] or 0, 1)
                }
            conn.close()
        except Exception as e:
            metrics['analytics'] = {'error': str(e)}
        
        # Optimization metrics
        try:
            conn = sqlite3.connect(self.databases['optimization'])
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT COUNT(*) as optimizations,
                       COUNT(DISTINCT file_path) as files_optimized
                FROM optimizations
                WHERE DATE(applied_date) = DATE('now')
            ''')
            
            result = cursor.fetchone()
            if result:
                metrics['optimization'] = {
                    'optimizations_applied': result[0],
                    'files_optimized': result[1]
                }
            conn.close()
        except Exception as e:
            metrics['optimization'] = {'error': str(e)}
        
        # Project metrics
        try:
            conn = sqlite3.connect(self.databases['projects'])
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT COUNT(*) as total_projects,
                       COUNT(CASE WHEN status = 'active' THEN 1 END) as active_projects,
                       AVG(progress_percentage) as avg_progress
                FROM projects
            ''')
            
            projects_result = cursor.fetchone()
            
            cursor.execute('''
                SELECT COUNT(*) as total_tasks,
                       COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_tasks,
                       COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as active_tasks
                FROM tasks
            ''')
            
            tasks_result = cursor.fetchone()
            
            if projects_result and tasks_result:
                metrics['projects'] = {
                    'total_projects': projects_result[0],
                    'active_projects': projects_result[1],
                    'avg_progress': round(projects_result[2] or 0, 1),
                    'total_tasks': tasks_result[0],
                    'completed_tasks': tasks_result[1],
                    'active_tasks': tasks_result[2]
                }
            conn.close()
        except Exception as e:
            metrics['projects'] = {'error': str(e)}
        
        # Orchestration metrics
        try:
            conn = sqlite3.connect(self.databases['orchestration'])
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT system_name, COUNT(*) as operations
                FROM orchestration_logs
                WHERE DATE(timestamp) = DATE('now')
                GROUP BY system_name
            ''')
            
            operations = dict(cursor.fetchall())
            
            cursor.execute('''
                SELECT COUNT(*) as total_operations,
                       COUNT(CASE WHEN status = 'success' THEN 1 END) as successful_ops
                FROM orchestration_logs
                WHERE DATE(timestamp) = DATE('now')
            ''')
            
            result = cursor.fetchone()
            if result:
                success_rate = (result[1] / max(result[0], 1)) * 100
                metrics['orchestration'] = {
                    'total_operations': result[0],
                    'successful_operations': result[1],
                    'success_rate': round(success_rate, 1),
                    'operations_by_system': operations
                }
            conn.close()
        except Exception as e:
            metrics['orchestration'] = {'error': str(e)}
        
        return metrics
    
    def get_file_system_stats(self):
        """Get file system statistics"""
        stats = {
            'python_files': 0,
            'total_lines': 0,
            'total_size': 0
        }
        
        try:
            for root, dirs, files in os.walk('.'):
                # Skip backup directories
                if 'backup' in root.lower():
                    continue
                    
                for file in files:
                    if file.endswith('.py'):
                        file_path = os.path.join(root, file)
                        try:
                            with open(file_path, 'r', encoding='utf-8') as f:
                                content = f.read()
                                stats['python_files'] += 1
                                stats['total_lines'] += len(content.split('\n'))
                                stats['total_size'] += len(content)
                        except Exception:
                            continue
        except Exception as e:
            stats['error'] = str(e)
        
        return stats
    
    def format_size(self, size_bytes):
        """Format file size in human readable format"""
        if size_bytes < 1024:
            return f"{size_bytes} B"
        elif size_bytes < 1024**2:
            return f"{size_bytes/1024:.1f} KB"
        else:
            return f"{size_bytes/1024**2:.1f} MB"
    
    def display_dashboard(self):
        """Display comprehensive real-time dashboard"""
        self.clear_screen()
        
        # Header
        print("🚀 REAL-TIME DEVELOPMENT DASHBOARD")
        print("🎯 COMPREHENSIVE DEVELOPMENT MONITORING & CONTROL")
        print("⚠️  NO FAKE WORK - ONLY REAL DEVELOPMENT METRICS")
        print("=" * 80)
        
        current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"📅 Last Updated: {current_time}")
        print("-" * 80)
        
        # Agent Status Section
        print("\n🤖 DEVELOPMENT AGENTS STATUS:")
        print("─" * 40)
        agent_status = self.get_agent_status()
        
        for agent_name, status in agent_status.items():
            status_indicator = status['status']
            response_time = status['response_time']
            details = status['details']
            print(f"{status_indicator} {agent_name.upper():15} │ {response_time:>8} │ {details}")
        
        # System Metrics Section
        print(f"\n📊 DEVELOPMENT METRICS:")
        print("─" * 40)
        metrics = self.get_database_metrics()
        
        # Analytics metrics
        if 'analytics' in metrics and 'error' not in metrics['analytics']:
            a = metrics['analytics']
            print(f"🔍 Code Analysis     │ Files: {a['files_analyzed']:>3} │ Complexity: {a['avg_complexity']:>5.1f} │ Maintainability: {a['avg_maintainability']:>5.1f}")
        
        # Optimization metrics  
        if 'optimization' in metrics and 'error' not in metrics['optimization']:
            o = metrics['optimization']
            print(f"🔧 Optimization      │ Applied: {o['optimizations_applied']:>2} │ Files Optimized: {o['files_optimized']:>3}")
        
        # Project metrics
        if 'projects' in metrics and 'error' not in metrics['projects']:
            p = metrics['projects']
            print(f"📋 Project Mgmt      │ Projects: {p['total_projects']:>2} │ Tasks: {p['total_tasks']:>3} │ Progress: {p['avg_progress']:>5.1f}%")
        
        # Orchestration metrics
        if 'orchestration' in metrics and 'error' not in metrics['orchestration']:
            o = metrics['orchestration']
            print(f"🎯 Orchestration     │ Operations: {o['total_operations']:>3} │ Success Rate: {o['success_rate']:>5.1f}%")
        
        # File System Stats
        print(f"\n📁 CODEBASE STATISTICS:")
        print("─" * 40)
        fs_stats = self.get_file_system_stats()
        
        if 'error' not in fs_stats:
            print(f"🐍 Python Files      │ {fs_stats['python_files']:>4} files")
            print(f"📄 Total Lines       │ {fs_stats['total_lines']:>6,} lines")
            print(f"💾 Total Size        │ {self.format_size(fs_stats['total_size']):>10}")
        
        # Activity Summary
        print(f"\n🎯 DEVELOPMENT ACTIVITY SUMMARY:")
        print("─" * 40)
        
        online_agents = sum(1 for status in agent_status.values() 
                          if '🟢' in status['status'])
        
        total_operations = 0
        if 'orchestration' in metrics and 'error' not in metrics['orchestration']:
            total_operations = metrics['orchestration']['total_operations']
        
        print(f"✅ Active Agents: {online_agents}/4")
        print(f"🔄 Operations Today: {total_operations}")
        print(f"📈 System Health: {'EXCELLENT' if online_agents == 4 else 'GOOD' if online_agents >= 3 else 'DEGRADED'}")
        
        # Footer
        print("\n" + "=" * 80)
        print("🔧 REAL DEVELOPMENT OPERATIONS ACTIVE │ Press Ctrl+C to exit")
        print("=" * 80)
    
    def run_dashboard(self, update_interval=30):
        """Run live dashboard with periodic updates"""
        print("🚀 STARTING REAL-TIME DEVELOPMENT DASHBOARD")
        print(f"🔄 Update interval: {update_interval} seconds")
        print("⏸️  Starting dashboard in 3 seconds...")
        time.sleep(3)
        
        try:
            while True:
                self.display_dashboard()
                self.last_update = datetime.now()
                
                # Wait for next update
                time.sleep(update_interval)
                
        except KeyboardInterrupt:
            print(f"\n\n🛑 DASHBOARD STOPPED")
            print("📊 Real-time monitoring session ended")
        except Exception as e:
            print(f"\n❌ Dashboard error: {e}")


def main():
    """Main dashboard execution"""
    print("🚀 REAL-TIME DEVELOPMENT DASHBOARD")
    print("📊 COMPREHENSIVE SYSTEM MONITORING")
    print("🎯 REAL DEVELOPMENT METRICS & CONTROL")
    print("=" * 60)
    
    dashboard = RealTimeDashboard()
    
    try:
        # Display initial dashboard
        dashboard.display_dashboard()
        
        print(f"\n🤖 Dashboard initialized successfully!")
        print(f"📊 All systems monitored and metrics collected")
        print(f"🔄 Starting live updates...")
        
        # Start live dashboard
        dashboard.run_dashboard(update_interval=15)  # Update every 15 seconds
        
    except Exception as e:
        print(f"❌ Dashboard system failed: {e}")


if __name__ == "__main__":
    main()
