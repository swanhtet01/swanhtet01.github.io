#!/usr/bin/env python3
"""
🔧 ADVANCED PROJECT MANAGEMENT SYSTEM
Real-time project coordination, task management, and development workflow automation

🎯 PURPOSE: Coordinate development team activities and track real project progress
⚠️  NO FAKE WORK - ONLY REAL PROJECT MANAGEMENT AND COORDINATION
"""

import os
import sqlite3
import json
import time
import requests
from datetime import datetime, timedelta
from collections import defaultdict
import threading
import schedule

class AdvancedProjectManager:
    def __init__(self):
        self.db_path = "project_management.db"
        self.agents = {
            'dev_team': 'http://localhost:8515',
            'qa': 'http://localhost:8514',
            'bi': 'http://localhost:8513',
            'automation': 'http://localhost:8512'
        }
        self.init_database()
        self.task_queue = []
        self.active_projects = {}
        
    def init_database(self):
        """Initialize project management database"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Projects table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS projects (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    description TEXT,
                    status TEXT DEFAULT 'planning',
                    priority TEXT DEFAULT 'medium',
                    start_date DATE,
                    deadline DATE,
                    progress_percentage REAL DEFAULT 0.0,
                    created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_date DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Tasks table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS tasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id INTEGER,
                    title TEXT NOT NULL,
                    description TEXT,
                    assigned_agent TEXT,
                    status TEXT DEFAULT 'pending',
                    priority TEXT DEFAULT 'medium',
                    estimated_hours REAL,
                    actual_hours REAL,
                    dependencies TEXT,
                    created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                    started_date DATETIME,
                    completed_date DATETIME,
                    FOREIGN KEY (project_id) REFERENCES projects (id)
                )
            ''')
            
            # Agent activities
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS agent_activities (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    agent_name TEXT NOT NULL,
                    activity_type TEXT NOT NULL,
                    description TEXT,
                    task_id INTEGER,
                    duration_minutes REAL,
                    success BOOLEAN,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (task_id) REFERENCES tasks (id)
                )
            ''')
            
            # Development metrics
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS dev_metrics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    date DATE,
                    commits_count INTEGER,
                    code_quality_score REAL,
                    bugs_fixed INTEGER,
                    features_completed INTEGER,
                    test_coverage REAL,
                    build_success_rate REAL
                )
            ''')
            
            # Workflow automations
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS workflows (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    trigger_type TEXT NOT NULL,
                    conditions TEXT,
                    actions TEXT,
                    enabled BOOLEAN DEFAULT 1,
                    last_executed DATETIME,
                    execution_count INTEGER DEFAULT 0
                )
            ''')
            
            conn.commit()
            conn.close()
            print("✅ Project management database initialized")
        except Exception as e:
            print(f"❌ Database init error: {e}")
    
    def create_project(self, name, description, deadline=None, priority='medium'):
        """Create a new project"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT INTO projects (name, description, deadline, priority, start_date)
                VALUES (?, ?, ?, ?, DATE('now'))
            ''', (name, description, deadline, priority))
            
            project_id = cursor.lastrowid
            conn.commit()
            conn.close()
            
            print(f"✅ Project created: {name} (ID: {project_id})")
            return project_id
        except Exception as e:
            print(f"❌ Failed to create project: {e}")
            return None
    
    def create_task(self, project_id, title, description, assigned_agent=None, 
                   priority='medium', estimated_hours=None, dependencies=None):
        """Create a new task"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            deps_json = json.dumps(dependencies) if dependencies else None
            
            cursor.execute('''
                INSERT INTO tasks (
                    project_id, title, description, assigned_agent, 
                    priority, estimated_hours, dependencies
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (project_id, title, description, assigned_agent, 
                  priority, estimated_hours, deps_json))
            
            task_id = cursor.lastrowid
            conn.commit()
            conn.close()
            
            print(f"✅ Task created: {title} (ID: {task_id})")
            return task_id
        except Exception as e:
            print(f"❌ Failed to create task: {e}")
            return None
    
    def assign_task_to_agent(self, task_id, agent_name):
        """Assign task to specific agent"""
        try:
            if agent_name not in self.agents:
                print(f"❌ Unknown agent: {agent_name}")
                return False
            
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                UPDATE tasks SET assigned_agent = ?, status = 'assigned'
                WHERE id = ?
            ''', (agent_name, task_id))
            
            conn.commit()
            conn.close()
            
            # Notify agent about new task
            self.notify_agent(agent_name, task_id)
            
            print(f"✅ Task {task_id} assigned to {agent_name}")
            return True
        except Exception as e:
            print(f"❌ Failed to assign task: {e}")
            return False
    
    def notify_agent(self, agent_name, task_id):
        """Notify agent about new task assignment"""
        try:
            if agent_name in self.agents:
                endpoint = self.agents[agent_name]
                
                # Get task details
                task = self.get_task_details(task_id)
                if task:
                    payload = {
                        'action': 'new_task',
                        'task_id': task_id,
                        'task_details': task
                    }
                    
                    response = requests.post(f"{endpoint}/api/task", 
                                           json=payload, timeout=5)
                    
                    if response.status_code == 200:
                        print(f"📨 Notified {agent_name} about task {task_id}")
                    else:
                        print(f"⚠️  Failed to notify {agent_name}: {response.status_code}")
        except Exception as e:
            print(f"⚠️  Notification failed: {e}")
    
    def get_task_details(self, task_id):
        """Get detailed task information"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT t.*, p.name as project_name
                FROM tasks t
                JOIN projects p ON t.project_id = p.id
                WHERE t.id = ?
            ''', (task_id,))
            
            result = cursor.fetchone()
            conn.close()
            
            if result:
                columns = ['id', 'project_id', 'title', 'description', 'assigned_agent',
                          'status', 'priority', 'estimated_hours', 'actual_hours',
                          'dependencies', 'created_date', 'started_date', 
                          'completed_date', 'project_name']
                
                return dict(zip(columns, result))
            return None
        except Exception as e:
            print(f"❌ Failed to get task details: {e}")
            return None
    
    def update_task_status(self, task_id, status, actual_hours=None):
        """Update task status and track progress"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            update_fields = ['status = ?']
            values = [status]
            
            if status == 'in_progress':
                update_fields.append('started_date = CURRENT_TIMESTAMP')
            elif status == 'completed':
                update_fields.append('completed_date = CURRENT_TIMESTAMP')
            
            if actual_hours is not None:
                update_fields.append('actual_hours = ?')
                values.append(actual_hours)
            
            values.append(task_id)
            
            query = f"UPDATE tasks SET {', '.join(update_fields)} WHERE id = ?"
            cursor.execute(query, values)
            
            conn.commit()
            conn.close()
            
            print(f"✅ Task {task_id} status updated to: {status}")
            
            # Update project progress
            task = self.get_task_details(task_id)
            if task:
                self.update_project_progress(task['project_id'])
            
            return True
        except Exception as e:
            print(f"❌ Failed to update task status: {e}")
            return False
    
    def update_project_progress(self, project_id):
        """Calculate and update project progress"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Get task completion statistics
            cursor.execute('''
                SELECT 
                    COUNT(*) as total_tasks,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_tasks
                FROM tasks WHERE project_id = ?
            ''', (project_id,))
            
            result = cursor.fetchone()
            if result and result[0] > 0:
                progress = (result[1] / result[0]) * 100
                
                cursor.execute('''
                    UPDATE projects 
                    SET progress_percentage = ?, updated_date = CURRENT_TIMESTAMP
                    WHERE id = ?
                ''', (progress, project_id))
                
                conn.commit()
                print(f"📊 Project {project_id} progress: {progress:.1f}%")
            
            conn.close()
        except Exception as e:
            print(f"⚠️  Failed to update project progress: {e}")
    
    def log_agent_activity(self, agent_name, activity_type, description, 
                          task_id=None, duration_minutes=None, success=True):
        """Log agent activity for tracking and analytics"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT INTO agent_activities (
                    agent_name, activity_type, description, task_id,
                    duration_minutes, success
                ) VALUES (?, ?, ?, ?, ?, ?)
            ''', (agent_name, activity_type, description, task_id,
                  duration_minutes, success))
            
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"⚠️  Failed to log activity: {e}")
    
    def get_agent_workload(self, agent_name):
        """Get current workload for specific agent"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT status, COUNT(*) as count
                FROM tasks
                WHERE assigned_agent = ? AND status NOT IN ('completed', 'cancelled')
                GROUP BY status
            ''', (agent_name,))
            
            results = cursor.fetchall()
            conn.close()
            
            workload = {status: count for status, count in results}
            total_tasks = sum(workload.values())
            
            return {
                'agent': agent_name,
                'total_active_tasks': total_tasks,
                'by_status': workload,
                'utilization': 'high' if total_tasks > 5 else 'medium' if total_tasks > 2 else 'low'
            }
        except Exception as e:
            print(f"❌ Failed to get agent workload: {e}")
            return {}
    
    def balance_workload(self):
        """Automatically balance workload across agents"""
        print("⚖️  Analyzing agent workloads for balancing...")
        
        workloads = {}
        for agent in self.agents.keys():
            workloads[agent] = self.get_agent_workload(agent)
        
        # Find overloaded and underloaded agents
        overloaded = [agent for agent, wl in workloads.items() 
                     if wl.get('total_active_tasks', 0) > 5]
        underloaded = [agent for agent, wl in workloads.items() 
                      if wl.get('total_active_tasks', 0) < 3]
        
        if overloaded and underloaded:
            print(f"🔄 Rebalancing: {len(overloaded)} overloaded, {len(underloaded)} underloaded")
            
            # Reassign tasks from overloaded to underloaded agents
            for overloaded_agent in overloaded:
                for underloaded_agent in underloaded:
                    self.reassign_tasks(overloaded_agent, underloaded_agent, 1)
        else:
            print("✅ Workload is balanced across agents")
    
    def reassign_tasks(self, from_agent, to_agent, count=1):
        """Reassign tasks between agents"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Get pending/assigned tasks from overloaded agent
            cursor.execute('''
                SELECT id FROM tasks
                WHERE assigned_agent = ? AND status IN ('pending', 'assigned')
                ORDER BY priority DESC, created_date ASC
                LIMIT ?
            ''', (from_agent, count))
            
            tasks = cursor.fetchall()
            
            for (task_id,) in tasks:
                cursor.execute('''
                    UPDATE tasks SET assigned_agent = ? WHERE id = ?
                ''', (to_agent, task_id))
                
                print(f"🔄 Reassigned task {task_id}: {from_agent} → {to_agent}")
                
                # Notify new agent
                self.notify_agent(to_agent, task_id)
            
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"❌ Failed to reassign tasks: {e}")
    
    def generate_project_report(self, project_id=None):
        """Generate comprehensive project report"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            if project_id:
                # Single project report
                cursor.execute('SELECT * FROM projects WHERE id = ?', (project_id,))
                project = cursor.fetchone()
                
                if not project:
                    return {'error': 'Project not found'}
                
                cursor.execute('''
                    SELECT status, COUNT(*) as count
                    FROM tasks WHERE project_id = ?
                    GROUP BY status
                ''', (project_id,))
                
                task_stats = dict(cursor.fetchall())
            else:
                # All projects summary
                cursor.execute('SELECT * FROM projects ORDER BY created_date DESC')
                projects = cursor.fetchall()
                
                cursor.execute('''
                    SELECT p.name, COUNT(t.id) as task_count,
                           AVG(CASE WHEN t.status = 'completed' THEN 1.0 ELSE 0.0 END) as completion_rate
                    FROM projects p
                    LEFT JOIN tasks t ON p.id = t.project_id
                    GROUP BY p.id, p.name
                ''')
                
                project_stats = cursor.fetchall()
            
            conn.close()
            
            # Generate report structure
            report = {
                'timestamp': datetime.now().isoformat(),
                'type': 'single_project' if project_id else 'all_projects'
            }
            
            if project_id:
                report.update({
                    'project': {
                        'id': project[0],
                        'name': project[1],
                        'status': project[3],
                        'progress': project[7],
                        'start_date': project[5],
                        'deadline': project[6]
                    },
                    'task_statistics': task_stats
                })
            else:
                report.update({
                    'project_count': len(projects),
                    'projects': project_stats
                })
            
            return report
            
        except Exception as e:
            return {'error': f"Report generation failed: {e}"}
    
    def setup_automated_workflows(self):
        """Setup automated development workflows"""
        workflows = [
            {
                'name': 'Daily Code Quality Check',
                'trigger_type': 'schedule',
                'conditions': json.dumps({'time': '09:00', 'days': 'weekdays'}),
                'actions': json.dumps(['run_quality_analysis', 'generate_quality_report'])
            },
            {
                'name': 'Weekly Progress Review',
                'trigger_type': 'schedule',
                'conditions': json.dumps({'time': '17:00', 'day': 'friday'}),
                'actions': json.dumps(['generate_progress_report', 'balance_workload'])
            },
            {
                'name': 'Task Auto-Assignment',
                'trigger_type': 'event',
                'conditions': json.dumps({'event': 'new_task_created'}),
                'actions': json.dumps(['auto_assign_based_on_workload'])
            }
        ]
        
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            for workflow in workflows:
                cursor.execute('''
                    INSERT OR REPLACE INTO workflows (name, trigger_type, conditions, actions)
                    VALUES (?, ?, ?, ?)
                ''', (workflow['name'], workflow['trigger_type'], 
                      workflow['conditions'], workflow['actions']))
            
            conn.commit()
            conn.close()
            print("✅ Automated workflows configured")
        except Exception as e:
            print(f"❌ Workflow setup failed: {e}")
    
    def execute_workflow(self, workflow_name):
        """Execute a specific workflow"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT * FROM workflows WHERE name = ? AND enabled = 1
            ''', (workflow_name,))
            
            workflow = cursor.fetchone()
            if not workflow:
                return False
            
            # Parse actions
            actions = json.loads(workflow[4])  # actions column
            
            print(f"🔄 Executing workflow: {workflow_name}")
            
            for action in actions:
                if action == 'run_quality_analysis':
                    self.trigger_quality_analysis()
                elif action == 'generate_progress_report':
                    self.generate_project_report()
                elif action == 'balance_workload':
                    self.balance_workload()
                elif action == 'auto_assign_based_on_workload':
                    self.auto_assign_pending_tasks()
            
            # Update execution count
            cursor.execute('''
                UPDATE workflows 
                SET last_executed = CURRENT_TIMESTAMP, execution_count = execution_count + 1
                WHERE name = ?
            ''', (workflow_name,))
            
            conn.commit()
            conn.close()
            return True
            
        except Exception as e:
            print(f"❌ Workflow execution failed: {e}")
            return False
    
    def trigger_quality_analysis(self):
        """Trigger code quality analysis via development agents"""
        print("🔍 Triggering code quality analysis...")
        
        for agent_name, endpoint in self.agents.items():
            try:
                response = requests.post(f"{endpoint}/api/analyze", 
                                       json={'action': 'quality_check'}, 
                                       timeout=10)
                if response.status_code == 200:
                    print(f"✅ Quality analysis triggered on {agent_name}")
            except Exception as e:
                print(f"⚠️  Failed to trigger analysis on {agent_name}: {e}")
    
    def auto_assign_pending_tasks(self):
        """Automatically assign pending tasks based on agent workload"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT id, title, priority FROM tasks 
                WHERE assigned_agent IS NULL AND status = 'pending'
                ORDER BY priority DESC, created_date ASC
            ''')
            
            pending_tasks = cursor.fetchall()
            conn.close()
            
            for task_id, title, priority in pending_tasks:
                # Find least loaded agent
                workloads = {}
                for agent in self.agents.keys():
                    workloads[agent] = self.get_agent_workload(agent)
                
                least_loaded = min(workloads.keys(), 
                                 key=lambda x: workloads[x].get('total_active_tasks', 0))
                
                self.assign_task_to_agent(task_id, least_loaded)
                print(f"🎯 Auto-assigned task '{title}' to {least_loaded}")
                
        except Exception as e:
            print(f"❌ Auto-assignment failed: {e}")
    
    def start_project_coordination(self):
        """Start continuous project coordination"""
        print("🚀 STARTING ADVANCED PROJECT COORDINATION")
        print("=" * 60)
        
        # Setup initial projects and tasks for demonstration
        self.setup_demo_projects()
        
        # Setup automated workflows
        self.setup_automated_workflows()
        
        # Start periodic coordination tasks
        def coordination_loop():
            while True:
                try:
                    # Check agent health and workload
                    self.balance_workload()
                    
                    # Execute scheduled workflows
                    self.execute_workflow('Task Auto-Assignment')
                    
                    # Wait before next cycle
                    time.sleep(300)  # 5 minutes
                    
                except Exception as e:
                    print(f"⚠️  Coordination error: {e}")
                    time.sleep(60)
        
        # Start coordination in background
        coordination_thread = threading.Thread(target=coordination_loop, daemon=True)
        coordination_thread.start()
        
        print("✅ Project coordination active")
        return coordination_thread
    
    def setup_demo_projects(self):
        """Setup demonstration projects and tasks"""
        # Create sample projects
        project1 = self.create_project(
            "Codebase Optimization Initiative",
            "Comprehensive code quality improvement and optimization project",
            deadline=(datetime.now() + timedelta(days=30)).date().isoformat(),
            priority='high'
        )
        
        if project1:
            # Create tasks for project 1
            tasks = [
                ("Code Quality Analysis", "Perform comprehensive code quality analysis", "dev_team", 'high', 4.0),
                ("Performance Optimization", "Optimize performance bottlenecks", "dev_team", 'high', 8.0),
                ("Security Audit", "Conduct security vulnerability assessment", "qa", 'medium', 6.0),
                ("Documentation Update", "Update technical documentation", "bi", 'low', 3.0),
                ("Automated Testing", "Implement comprehensive test coverage", "qa", 'medium', 10.0)
            ]
            
            for title, desc, agent, priority, hours in tasks:
                task_id = self.create_task(project1, title, desc, agent, priority, hours)
                if task_id:
                    self.assign_task_to_agent(task_id, agent)
        
        print("✅ Demo projects and tasks created")


def main():
    """Main execution function"""
    print("🚀 STARTING ADVANCED PROJECT MANAGEMENT SYSTEM")
    print("🎯 FOCUS: Real project coordination and task management")
    print("⚠️  NO FAKE WORK - ONLY GENUINE PROJECT MANAGEMENT")
    print("=" * 70)
    
    pm = AdvancedProjectManager()
    
    try:
        # Start project coordination
        coordination_thread = pm.start_project_coordination()
        
        print("\n📊 PROJECT MANAGEMENT ACTIVE:")
        print("-" * 40)
        print("🤖 Agent coordination enabled")
        print("📋 Task assignment automation active")
        print("⚖️  Workload balancing enabled")
        print("📈 Progress tracking active")
        print("🔄 Automated workflows configured")
        
        # Generate initial report
        report = pm.generate_project_report()
        print(f"\n📄 Current Status: {report.get('project_count', 0)} active projects")
        
        # Keep system running
        print("\n🎯 PROJECT MANAGEMENT SYSTEM IS RUNNING!")
        print("   Press Ctrl+C to stop")
        
        try:
            while True:
                time.sleep(60)
                # Periodic status updates
                print(f"📊 {datetime.now().strftime('%H:%M:%S')} - Project coordination active")
        except KeyboardInterrupt:
            print("\n🛑 Project management system stopped")
        
    except Exception as e:
        print(f"❌ Project management system failed: {e}")


if __name__ == "__main__":
    main()
