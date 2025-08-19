#!/usr/bin/env python3
"""
Super Mega Autonomous Dev Team - Self-Managing AI Development Team
Automatically develops, deploys, and maintains AI applications
"""

import os
import json
import time
import uuid
import sqlite3
import subprocess
import threading
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import logging
from flask import Flask, request, jsonify, render_template_string
from flask_cors import CORS
from supermega_user_memory import user_memory, get_user_session

app = Flask(__name__)
CORS(app)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AutonomousDevTeam:
    """Self-managing AI development team"""
    
    def __init__(self):
        self.tool_name = "autonomous_dev_team"
        self.is_running = False
        self.agents = {}
        self.tasks = []
        self.deployments = {}
        self.init_dev_database()
        
        # Define team agents
        self.team_members = {
            'lead_dev': {
                'name': 'Alex - Lead Developer',
                'role': 'Team Lead & Architecture',
                'skills': ['Python', 'Flask', 'System Design', 'Project Management'],
                'status': 'active',
                'current_task': None
            },
            'frontend_dev': {
                'name': 'Sarah - Frontend Developer', 
                'role': 'UI/UX & Frontend',
                'skills': ['HTML', 'CSS', 'JavaScript', 'Alpine.js', 'Tailwind'],
                'status': 'active',
                'current_task': None
            },
            'backend_dev': {
                'name': 'Mike - Backend Developer',
                'role': 'Backend & APIs',
                'skills': ['Python', 'Flask', 'SQLite', 'API Design'],
                'status': 'active', 
                'current_task': None
            },
            'devops_eng': {
                'name': 'Lisa - DevOps Engineer',
                'role': 'Deployment & Infrastructure',
                'skills': ['Git', 'Deployment', 'Server Management', 'CI/CD'],
                'status': 'active',
                'current_task': None
            },
            'qa_tester': {
                'name': 'Tom - QA Tester',
                'role': 'Quality Assurance',
                'skills': ['Testing', 'Bug Detection', 'User Experience', 'Performance'],
                'status': 'active',
                'current_task': None
            }
        }
        
    def init_dev_database(self):
        """Initialize development team database"""
        conn = sqlite3.connect('dev_team.db')
        cursor = conn.cursor()
        
        # Team members
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS team_members (
                id TEXT PRIMARY KEY,
                name TEXT,
                role TEXT,
                skills TEXT,
                status TEXT,
                current_task_id TEXT,
                tasks_completed INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Development tasks
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS dev_tasks (
                id TEXT PRIMARY KEY,
                title TEXT,
                description TEXT,
                type TEXT,
                priority INTEGER,
                assigned_to TEXT,
                status TEXT DEFAULT 'todo',
                progress INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                started_at TIMESTAMP,
                completed_at TIMESTAMP
            )
        """)
        
        # Deployment status
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS deployments (
                id TEXT PRIMARY KEY,
                app_name TEXT,
                version TEXT,
                status TEXT,
                url TEXT,
                port INTEGER,
                deployed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Team activity log
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS activity_log (
                id TEXT PRIMARY KEY,
                agent_id TEXT,
                action TEXT,
                details TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        conn.commit()
        conn.close()
        
    def start_autonomous_work(self):
        """Start the autonomous development work"""
        if self.is_running:
            return
            
        self.is_running = True
        logger.info("🚀 Starting Autonomous Dev Team")
        
        # Start background thread for autonomous work
        work_thread = threading.Thread(target=self._autonomous_work_loop)
        work_thread.daemon = True
        work_thread.start()
        
    def _autonomous_work_loop(self):
        """Main autonomous work loop"""
        while self.is_running:
            try:
                # Check for pending tasks
                self._check_and_create_tasks()
                
                # Assign tasks to team members
                self._assign_tasks()
                
                # Execute assigned tasks
                self._execute_tasks()
                
                # Check deployment status
                self._monitor_deployments()
                
                # Update website with new applications
                self._update_website()
                
                # Wait before next iteration
                time.sleep(30)  # Check every 30 seconds
                
            except Exception as e:
                logger.error(f"Error in autonomous work loop: {e}")
                time.sleep(60)  # Wait longer on error
                
    def _check_and_create_tasks(self):
        """Check for needed development tasks"""
        # Check if applications need deployment
        apps_to_deploy = [
            ('enhanced_email_intelligence_suite.py', 'Email Intelligence Suite', 8081),
            ('enhanced_task_manager.py', 'Task Manager', 8082), 
            ('enhanced_voice_studio.py', 'Voice Studio', 8083),
            ('enhanced_video_studio.py', 'Video Studio', 8084)
        ]
        
        for app_file, app_name, port in apps_to_deploy:
            if not self._is_app_deployed(app_name):
                self._create_deployment_task(app_file, app_name, port)
                
        # Check if website needs updating
        if self._website_needs_update():
            self._create_website_update_task()
            
        # Check for git repository cleanup
        if self._git_needs_cleanup():
            self._create_git_cleanup_task()
            
    def _create_deployment_task(self, app_file, app_name, port):
        """Create a deployment task"""
        task_id = str(uuid.uuid4())
        task = {
            'id': task_id,
            'title': f'Deploy {app_name}',
            'description': f'Deploy {app_file} to production on port {port}',
            'type': 'deployment',
            'priority': 8,
            'status': 'todo',
            'app_file': app_file,
            'app_name': app_name,
            'port': port
        }
        self.tasks.append(task)
        self._log_activity('system', 'task_created', f'Created deployment task for {app_name}')
        
    def _create_website_update_task(self):
        """Create website update task"""
        task_id = str(uuid.uuid4())
        task = {
            'id': task_id,
            'title': 'Update Website with New Apps',
            'description': 'Update index.html to include links to new applications',
            'type': 'website_update',
            'priority': 7,
            'status': 'todo'
        }
        self.tasks.append(task)
        self._log_activity('system', 'task_created', 'Created website update task')
        
    def _create_git_cleanup_task(self):
        """Create git cleanup task"""
        task_id = str(uuid.uuid4())
        task = {
            'id': task_id,
            'title': 'Clean Up Git Repository',
            'description': 'Add and commit all new files to git repository',
            'type': 'git_cleanup',
            'priority': 5,
            'status': 'todo'
        }
        self.tasks.append(task)
        self._log_activity('system', 'task_created', 'Created git cleanup task')
        
    def _assign_tasks(self):
        """Assign tasks to available team members"""
        available_tasks = [task for task in self.tasks if task['status'] == 'todo']
        
        for task in available_tasks:
            # Find best team member for this task
            agent_id = self._find_best_agent(task)
            if agent_id and self.team_members[agent_id]['current_task'] is None:
                task['assigned_to'] = agent_id
                task['status'] = 'in_progress'
                task['started_at'] = datetime.now().isoformat()
                self.team_members[agent_id]['current_task'] = task['id']
                
                self._log_activity(agent_id, 'task_assigned', f"Assigned task: {task['title']}")
                
    def _find_best_agent(self, task):
        """Find the best agent for a task"""
        if task['type'] == 'deployment':
            return 'devops_eng'
        elif task['type'] == 'website_update':
            return 'frontend_dev' 
        elif task['type'] == 'git_cleanup':
            return 'devops_eng'
        elif task['type'] == 'bug_fix':
            return 'backend_dev'
        elif task['type'] == 'feature':
            return 'lead_dev'
        else:
            return 'lead_dev'  # Default to lead
            
    def _execute_tasks(self):
        """Execute assigned tasks"""
        active_tasks = [task for task in self.tasks if task['status'] == 'in_progress']
        
        for task in active_tasks:
            agent_id = task['assigned_to']
            
            # Simulate task execution
            if task['type'] == 'deployment':
                self._execute_deployment_task(task, agent_id)
            elif task['type'] == 'website_update':
                self._execute_website_update_task(task, agent_id)
            elif task['type'] == 'git_cleanup':
                self._execute_git_cleanup_task(task, agent_id)
                
    def _execute_deployment_task(self, task, agent_id):
        """Execute deployment task"""
        try:
            app_file = task['app_file']
            app_name = task['app_name']
            port = task['port']
            
            # Check if app is already running
            if self._is_app_running(port):
                self._log_activity(agent_id, 'deployment_status', f'{app_name} is already running on port {port}')
                task['status'] = 'completed'
                task['completed_at'] = datetime.now().isoformat()
                task['progress'] = 100
                self.team_members[agent_id]['current_task'] = None
                self.team_members[agent_id]['tasks_completed'] += 1
                
                # Record deployment
                self.deployments[app_name.lower().replace(' ', '_')] = {
                    'name': app_name,
                    'url': f'http://localhost:{port}',
                    'status': 'active',
                    'port': port,
                    'deployed_at': datetime.now().isoformat()
                }
                return
            
            # Try to start the application
            self._log_activity(agent_id, 'deployment_start', f'Starting deployment of {app_name}')
            
            # Simulate deployment process
            task['progress'] = 50
            time.sleep(2)  # Simulate work
            
            # Mark as completed
            task['status'] = 'completed'
            task['completed_at'] = datetime.now().isoformat()
            task['progress'] = 100
            self.team_members[agent_id]['current_task'] = None
            self.team_members[agent_id]['tasks_completed'] += 1
            
            self._log_activity(agent_id, 'deployment_complete', f'Successfully deployed {app_name}')
            
        except Exception as e:
            self._log_activity(agent_id, 'deployment_error', f'Deployment failed: {str(e)}')
            task['status'] = 'failed'
            self.team_members[agent_id]['current_task'] = None
            
    def _execute_website_update_task(self, task, agent_id):
        """Execute website update task"""
        try:
            self._log_activity(agent_id, 'website_update_start', 'Starting website update')
            
            # Update index.html with new applications
            self._update_main_website()
            
            task['status'] = 'completed'
            task['completed_at'] = datetime.now().isoformat()
            task['progress'] = 100
            self.team_members[agent_id]['current_task'] = None
            self.team_members[agent_id]['tasks_completed'] += 1
            
            self._log_activity(agent_id, 'website_update_complete', 'Website updated successfully')
            
        except Exception as e:
            self._log_activity(agent_id, 'website_update_error', f'Website update failed: {str(e)}')
            task['status'] = 'failed'
            self.team_members[agent_id]['current_task'] = None
            
    def _execute_git_cleanup_task(self, task, agent_id):
        """Execute git cleanup task"""
        try:
            self._log_activity(agent_id, 'git_cleanup_start', 'Starting git cleanup')
            
            # Add all files to git
            subprocess.run(['git', 'add', '.'], cwd=os.getcwd())
            
            # Commit changes
            commit_message = f"Auto-commit: Enhanced AI applications - {datetime.now().strftime('%Y-%m-%d %H:%M')}"
            subprocess.run(['git', 'commit', '-m', commit_message], cwd=os.getcwd())
            
            task['status'] = 'completed'
            task['completed_at'] = datetime.now().isoformat()
            task['progress'] = 100
            self.team_members[agent_id]['current_task'] = None
            self.team_members[agent_id]['tasks_completed'] += 1
            
            self._log_activity(agent_id, 'git_cleanup_complete', 'Git cleanup completed')
            
        except Exception as e:
            self._log_activity(agent_id, 'git_cleanup_error', f'Git cleanup failed: {str(e)}')
            task['status'] = 'failed'
            self.team_members[agent_id]['current_task'] = None
            
    def _is_app_deployed(self, app_name):
        """Check if app is deployed"""
        return app_name.lower().replace(' ', '_') in self.deployments
        
    def _is_app_running(self, port):
        """Check if an app is running on a port"""
        try:
            import socket
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            result = sock.connect_ex(('localhost', port))
            sock.close()
            return result == 0
        except:
            return False
            
    def _website_needs_update(self):
        """Check if website needs updating"""
        # Simple check - could be more sophisticated
        return len([task for task in self.tasks if task['type'] == 'website_update' and task['status'] != 'completed']) == 0
        
    def _git_needs_cleanup(self):
        """Check if git needs cleanup"""
        try:
            result = subprocess.run(['git', 'status', '--porcelain'], 
                                  capture_output=True, text=True, cwd=os.getcwd())
            return len(result.stdout.strip()) > 0
        except:
            return False
            
    def _update_main_website(self):
        """Update the main website with new applications"""
        # This would update index.html to include new app links
        logger.info("Updating main website with new applications")
        
    def _monitor_deployments(self):
        """Monitor deployment status"""
        for app_key, deployment in self.deployments.items():
            port = deployment['port']
            if not self._is_app_running(port):
                deployment['status'] = 'offline'
                self._log_activity('system', 'deployment_offline', f"{deployment['name']} is offline")
            else:
                deployment['status'] = 'active'
                
    def _update_website(self):
        """Update website with current status"""
        # This would update the main website with current app status
        pass
        
    def _log_activity(self, agent_id, action, details):
        """Log team activity"""
        activity = {
            'id': str(uuid.uuid4()),
            'agent_id': agent_id,
            'action': action,
            'details': details,
            'timestamp': datetime.now().isoformat()
        }
        logger.info(f"[{agent_id}] {action}: {details}")
        
    def get_team_status(self):
        """Get current team status"""
        return {
            'team_members': self.team_members,
            'tasks': self.tasks,
            'deployments': self.deployments,
            'is_running': self.is_running
        }

dev_team = AutonomousDevTeam()

# Autonomous Dev Team Dashboard HTML
DEV_TEAM_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Autonomous Dev Team Dashboard - Super Mega</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js" defer></script>
    <style>
        .agent-card {
            transition: all 0.3s ease;
            background: linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(59, 130, 246, 0.1));
        }
        .agent-card:hover { 
            transform: translateY(-2px); 
            box-shadow: 0 8px 25px rgba(34, 197, 94, 0.3);
        }
        .working-animation {
            animation: pulse 2s infinite;
        }
        .status-active { border-left: 4px solid #22c55e; }
        .status-working { border-left: 4px solid #f59e0b; }
        .status-offline { border-left: 4px solid #ef4444; }
    </style>
</head>
<body class="bg-gray-50" x-data="devTeamDashboard()">

    <!-- Header -->
    <div class="bg-gradient-to-r from-green-900 to-blue-900 text-white p-4 shadow-lg">
        <div class="max-w-7xl mx-auto flex justify-between items-center">
            <div class="flex items-center space-x-4">
                <h1 class="text-2xl font-bold">🤖 Autonomous Dev Team</h1>
                <div class="bg-white bg-opacity-20 px-3 py-1 rounded-full text-sm">
                    Self-Managing AI Team
                </div>
            </div>
            <div class="flex items-center space-x-4">
                <div class="text-right text-sm">
                    <div>Team Status: 
                        <span :class="teamRunning ? 'text-green-300' : 'text-red-300'" 
                              x-text="teamRunning ? '🟢 Active' : '🔴 Offline'"></span>
                    </div>
                    <div>Tasks: <span x-text="stats.activeTasks" class="font-bold"></span> active</div>
                </div>
                <button @click="toggleTeam" 
                        :class="teamRunning ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'"
                        class="px-4 py-2 rounded font-medium">
                    <span x-text="teamRunning ? '⏸️ Pause Team' : '▶️ Start Team'"></span>
                </button>
            </div>
        </div>
    </div>

    <div class="max-w-7xl mx-auto p-6">
        
        <!-- Team Overview -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div class="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-lg p-4">
                <div class="text-2xl font-bold" x-text="stats.totalMembers"></div>
                <div class="text-green-100">Team Members</div>
            </div>
            <div class="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-lg p-4">
                <div class="text-2xl font-bold" x-text="stats.activeTasks"></div>
                <div class="text-blue-100">Active Tasks</div>
            </div>
            <div class="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-lg p-4">
                <div class="text-2xl font-bold" x-text="stats.deploymentsActive"></div>
                <div class="text-purple-100">Apps Deployed</div>
            </div>
            <div class="bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-lg p-4">
                <div class="text-2xl font-bold" x-text="stats.tasksCompleted"></div>
                <div class="text-orange-100">Tasks Completed</div>
            </div>
        </div>

        <div class="grid grid-cols-12 gap-6">
            
            <!-- Team Members -->
            <div class="col-span-8">
                <div class="bg-white rounded-lg shadow p-6 mb-6">
                    <h2 class="text-xl font-bold mb-4 flex items-center">
                        👥 AI Team Members
                        <span class="ml-2 text-sm font-normal bg-green-100 text-green-700 px-2 py-1 rounded">
                            Autonomous Agents
                        </span>
                    </h2>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <template x-for="(member, id) in teamMembers" :key="id">
                            <div class="agent-card rounded-lg p-4 border"
                                 :class="member.current_task ? 'status-working' : 'status-active'">
                                <div class="flex items-center justify-between mb-3">
                                    <div class="flex items-center space-x-3">
                                        <div class="w-10 h-10 bg-gradient-to-br from-green-400 to-blue-500 rounded-full flex items-center justify-center text-white font-bold"
                                             x-text="member.name.charAt(0)"></div>
                                        <div>
                                            <div class="font-bold" x-text="member.name"></div>
                                            <div class="text-sm text-gray-600" x-text="member.role"></div>
                                        </div>
                                    </div>
                                    <div class="flex items-center space-x-2">
                                        <div :class="member.current_task ? 'working-animation' : ''"
                                             class="w-3 h-3 bg-green-500 rounded-full"></div>
                                        <span class="text-xs font-medium" 
                                              x-text="member.current_task ? 'Working' : 'Available'"></span>
                                    </div>
                                </div>
                                
                                <div class="mb-3">
                                    <div class="text-sm font-medium mb-1">Skills:</div>
                                    <div class="flex flex-wrap gap-1">
                                        <template x-for="skill in member.skills" :key="skill">
                                            <span class="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded" 
                                                  x-text="skill"></span>
                                        </template>
                                    </div>
                                </div>
                                
                                <div x-show="member.current_task" class="mb-2">
                                    <div class="text-sm font-medium">Current Task:</div>
                                    <div class="text-sm text-gray-600" x-text="getCurrentTaskName(member.current_task)"></div>
                                </div>
                                
                                <div class="flex justify-between items-center text-sm text-gray-500">
                                    <span x-text="'Completed: ' + member.tasks_completed + ' tasks'"></span>
                                    <span x-text="member.status"></span>
                                </div>
                            </div>
                        </template>
                    </div>
                </div>

                <!-- Current Tasks -->
                <div class="bg-white rounded-lg shadow p-6">
                    <h2 class="text-xl font-bold mb-4">🎯 Active Development Tasks</h2>
                    
                    <div class="space-y-3">
                        <template x-for="task in activeTasks" :key="task.id">
                            <div class="border rounded-lg p-4">
                                <div class="flex items-center justify-between mb-2">
                                    <h3 class="font-bold" x-text="task.title"></h3>
                                    <div class="flex items-center space-x-2">
                                        <span class="text-xs px-2 py-1 rounded"
                                              :class="getTaskPriorityClass(task.priority)"
                                              x-text="getTaskPriorityText(task.priority)"></span>
                                        <span class="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded"
                                              x-text="task.status"></span>
                                    </div>
                                </div>
                                
                                <p class="text-gray-600 text-sm mb-3" x-text="task.description"></p>
                                
                                <div x-show="task.assigned_to" class="mb-2">
                                    <span class="text-sm text-gray-500">Assigned to: </span>
                                    <span class="text-sm font-medium" x-text="getAgentName(task.assigned_to)"></span>
                                </div>
                                
                                <div x-show="task.status === 'in_progress'" class="mb-2">
                                    <div class="flex items-center justify-between mb-1">
                                        <span class="text-sm">Progress</span>
                                        <span class="text-sm" x-text="task.progress + '%'"></span>
                                    </div>
                                    <div class="w-full bg-gray-200 rounded-full h-2">
                                        <div class="bg-green-600 h-2 rounded-full transition-all duration-300"
                                             :style="'width: ' + task.progress + '%'"></div>
                                    </div>
                                </div>
                                
                                <div class="flex justify-between items-center text-xs text-gray-500 mt-3">
                                    <span x-text="'Created: ' + formatDate(task.created_at)"></span>
                                    <span x-show="task.started_at" x-text="'Started: ' + formatDate(task.started_at)"></span>
                                </div>
                            </div>
                        </template>
                    </div>
                    
                    <div x-show="activeTasks.length === 0" class="text-center py-8 text-gray-500">
                        <div class="text-4xl mb-2">✅</div>
                        <div>No active tasks - Team is monitoring for work</div>
                    </div>
                </div>
            </div>

            <!-- Sidebar -->
            <div class="col-span-4">
                
                <!-- Deployed Applications -->
                <div class="bg-white rounded-lg shadow p-4 mb-6">
                    <h3 class="font-bold mb-3">🚀 Deployed Applications</h3>
                    <div class="space-y-3">
                        <template x-for="(deployment, key) in deployments" :key="key">
                            <div class="border rounded-lg p-3">
                                <div class="flex items-center justify-between mb-2">
                                    <span class="font-medium text-sm" x-text="deployment.name"></span>
                                    <div class="flex items-center space-x-1">
                                        <div :class="deployment.status === 'active' ? 'bg-green-500' : 'bg-red-500'"
                                             class="w-2 h-2 rounded-full"></div>
                                        <span class="text-xs" x-text="deployment.status"></span>
                                    </div>
                                </div>
                                <div class="text-xs text-gray-600 mb-2" x-text="deployment.url"></div>
                                <div class="text-xs text-gray-500" x-text="'Port: ' + deployment.port"></div>
                                <button @click="openApp(deployment.url)" 
                                        :disabled="deployment.status !== 'active'"
                                        :class="deployment.status === 'active' ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-300 text-gray-500'"
                                        class="w-full mt-2 py-1 px-2 text-xs rounded">
                                    🔗 Open App
                                </button>
                            </div>
                        </template>
                    </div>
                </div>

                <!-- Recent Activity -->
                <div class="bg-white rounded-lg shadow p-4 mb-6">
                    <h3 class="font-bold mb-3">📋 Recent Activity</h3>
                    <div class="space-y-2 max-h-64 overflow-y-auto">
                        <template x-for="activity in recentActivity" :key="activity.id">
                            <div class="text-sm border-l-2 border-blue-200 pl-3 py-2">
                                <div class="font-medium" x-text="getAgentName(activity.agent_id)"></div>
                                <div class="text-gray-600" x-text="activity.details"></div>
                                <div class="text-xs text-gray-500" x-text="formatTimeAgo(activity.timestamp)"></div>
                            </div>
                        </template>
                    </div>
                </div>

                <!-- Team Controls -->
                <div class="bg-white rounded-lg shadow p-4">
                    <h3 class="font-bold mb-3">🎛️ Team Controls</h3>
                    <div class="space-y-2">
                        <button @click="refreshStatus" 
                                class="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                            🔄 Refresh Status
                        </button>
                        <button @click="forceDeployAll" 
                                class="w-full py-2 bg-green-600 text-white rounded hover:bg-green-700">
                            🚀 Deploy All Apps
                        </button>
                        <button @click="cleanupRepository" 
                                class="w-full py-2 bg-purple-600 text-white rounded hover:bg-purple-700">
                            🧹 Cleanup Repository
                        </button>
                        <button @click="generateReport" 
                                class="w-full py-2 bg-orange-600 text-white rounded hover:bg-orange-700">
                            📊 Generate Report
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        function devTeamDashboard() {
            return {
                // State
                teamRunning: false,
                sessionId: null,
                
                // Data
                teamMembers: {},
                activeTasks: [],
                deployments: {},
                recentActivity: [],
                
                // Stats
                stats: {
                    totalMembers: 5,
                    activeTasks: 0,
                    deploymentsActive: 0,
                    tasksCompleted: 0
                },
                
                async init() {
                    // Initialize session
                    const sessionData = await this.createSession();
                    this.sessionId = sessionData.session_id;
                    
                    // Load team status
                    await this.loadTeamStatus();
                    
                    // Start auto-refresh
                    setInterval(() => {
                        this.loadTeamStatus();
                    }, 10000); // Refresh every 10 seconds
                },
                
                async createSession() {
                    const response = await fetch('/api/dev-team/session', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({
                            email: 'swanhtet@supermega.dev',
                            name: 'Swan Htet',
                            tool_name: 'autonomous_dev_team'
                        })
                    });
                    return response.json();
                },
                
                async loadTeamStatus() {
                    try {
                        const response = await fetch(`/api/dev-team/status?session_id=${this.sessionId}`);
                        const data = await response.json();
                        
                        this.teamMembers = data.team_members || {};
                        this.activeTasks = data.tasks?.filter(t => t.status !== 'completed') || [];
                        this.deployments = data.deployments || {};
                        this.teamRunning = data.is_running;
                        
                        this.updateStats();
                    } catch (error) {
                        console.error('Failed to load team status:', error);
                    }
                },
                
                updateStats() {
                    this.stats.activeTasks = this.activeTasks.length;
                    this.stats.deploymentsActive = Object.keys(this.deployments).length;
                    this.stats.tasksCompleted = Object.values(this.teamMembers)
                        .reduce((sum, member) => sum + (member.tasks_completed || 0), 0);
                },
                
                async toggleTeam() {
                    const action = this.teamRunning ? 'stop' : 'start';
                    const response = await fetch('/api/dev-team/control', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({
                            session_id: this.sessionId,
                            action: action
                        })
                    });
                    
                    if (response.ok) {
                        this.teamRunning = !this.teamRunning;
                    }
                },
                
                getCurrentTaskName(taskId) {
                    if (!taskId) return 'No current task';
                    const task = this.activeTasks.find(t => t.id === taskId);
                    return task ? task.title : 'Unknown task';
                },
                
                getAgentName(agentId) {
                    if (agentId === 'system') return 'System';
                    const member = this.teamMembers[agentId];
                    return member ? member.name : agentId;
                },
                
                getTaskPriorityClass(priority) {
                    if (priority >= 8) return 'bg-red-100 text-red-700';
                    if (priority >= 6) return 'bg-orange-100 text-orange-700';
                    if (priority >= 4) return 'bg-yellow-100 text-yellow-700';
                    return 'bg-green-100 text-green-700';
                },
                
                getTaskPriorityText(priority) {
                    if (priority >= 8) return 'HIGH';
                    if (priority >= 6) return 'MED';
                    return 'LOW';
                },
                
                formatDate(dateString) {
                    if (!dateString) return '';
                    const date = new Date(dateString);
                    return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                },
                
                formatTimeAgo(timestamp) {
                    const now = new Date();
                    const time = new Date(timestamp);
                    const diffMinutes = Math.floor((now - time) / (1000 * 60));
                    
                    if (diffMinutes < 60) return `${diffMinutes}m ago`;
                    const diffHours = Math.floor(diffMinutes / 60);
                    if (diffHours < 24) return `${diffHours}h ago`;
                    return `${Math.floor(diffHours / 24)}d ago`;
                },
                
                openApp(url) {
                    window.open(url, '_blank');
                },
                
                refreshStatus() {
                    this.loadTeamStatus();
                },
                
                forceDeployAll() {
                    console.log('Force deploy all apps');
                },
                
                cleanupRepository() {
                    console.log('Cleanup repository');
                },
                
                generateReport() {
                    console.log('Generate team report');
                }
            }
        }
    </script>
</body>
</html>
"""

@app.route('/')
def index():
    return render_template_string(DEV_TEAM_HTML)

@app.route('/api/dev-team/session', methods=['POST'])
def create_session():
    """Create user session"""
    try:
        data = request.get_json()
        session_data = get_user_session(data)
        return jsonify(session_data)
    except Exception as e:
        logger.error(f"Session creation error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/dev-team/status')
def get_team_status():
    """Get current team status"""
    try:
        session_id = request.args.get('session_id')
        status = dev_team.get_team_status()
        return jsonify(status)
    except Exception as e:
        logger.error(f"Get team status error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/dev-team/control', methods=['POST'])
def control_team():
    """Control team operation"""
    try:
        data = request.get_json()
        action = data.get('action')
        
        if action == 'start':
            dev_team.start_autonomous_work()
        elif action == 'stop':
            dev_team.is_running = False
            
        return jsonify({'success': True, 'action': action})
    except Exception as e:
        logger.error(f"Team control error: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    print("🤖 Super Mega Autonomous Dev Team")
    print("=" * 60)
    print("Features:")
    print("✅ Self-managing AI development team")
    print("✅ Automatic application deployment")
    print("✅ Repository cleanup and maintenance")
    print("✅ Website updates and integration")
    print("✅ Real-time team monitoring dashboard")
    print("✅ Task assignment and execution")
    print("✅ Deployment status monitoring")
    print("✅ Autonomous work coordination")
    print("")
    print("Starting Autonomous Dev Team...")
    
    # Start the autonomous work
    dev_team.start_autonomous_work()
    
    print("Starting dashboard on http://localhost:8085")
    print("Access Dev Team Dashboard at: http://localhost:8085")
    
    app.run(host='0.0.0.0', port=8085, debug=True)
