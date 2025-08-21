#!/usr/bin/env python3
"""
AI WORK OS - MANAGER SUITE
Complete management professional toolkit
Focus: Project management, team coordination, business intelligence, operations
"""

import os
import json
import asyncio
import logging
from datetime import datetime, timedelta
from flask import Flask, jsonify, request, render_template_string
from flask_cors import CORS
import sqlite3
import calendar

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

class ManagerSuite:
    """Complete Management Professional Suite"""
    
    def __init__(self):
        self.version = "1.0"
        self.suite_name = "AI Manager Suite"
        self.tools = {}
        self.projects = {}
        self.teams = {}
        
        # Initialize management tools
        self.init_management_tools()
        self.init_database()
        
        logger.info(f"👔 {self.suite_name} v{self.version} initialized")
    
    def init_database(self):
        """Initialize management database"""
        conn = sqlite3.connect('manager_suite.db')
        cursor = conn.cursor()
        
        # Projects table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY,
                project_name TEXT NOT NULL,
                description TEXT,
                status TEXT DEFAULT 'active',
                priority TEXT DEFAULT 'medium',
                start_date DATE,
                end_date DATE,
                budget REAL,
                progress INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Team members table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS team_members (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                role TEXT,
                department TEXT,
                email TEXT,
                skills TEXT,
                performance_score INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Tasks table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY,
                project_id INTEGER,
                task_name TEXT NOT NULL,
                description TEXT,
                assigned_to INTEGER,
                status TEXT DEFAULT 'todo',
                priority TEXT DEFAULT 'medium',
                due_date DATE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects (id),
                FOREIGN KEY (assigned_to) REFERENCES team_members (id)
            )
        ''')
        
        # Meetings table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS meetings (
                id INTEGER PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT,
                start_time TIMESTAMP,
                duration INTEGER,
                attendees TEXT,
                agenda TEXT,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        conn.commit()
        conn.close()
    
    def init_management_tools(self):
        """Initialize all management tools"""
        self.tools = {
            'project_manager': {
                'name': 'AI Project Manager',
                'description': 'Comprehensive project planning and tracking',
                'features': [
                    'Project planning',
                    'Task management',
                    'Timeline tracking',
                    'Resource allocation',
                    'Budget monitoring',
                    'Risk assessment',
                    'Progress reporting',
                    'Milestone tracking'
                ],
                'status': 'active'
            },
            'team_coordinator': {
                'name': 'Team Coordination Hub',
                'description': 'Team management and collaboration',
                'features': [
                    'Team scheduling',
                    'Performance tracking',
                    'Skill assessment',
                    'Workload balancing',
                    'Communication center',
                    'Meeting planning',
                    '1-on-1 tracking',
                    'Goal alignment'
                ],
                'status': 'active'
            },
            'strategy_advisor': {
                'name': 'Strategic Planning AI',
                'description': 'Business strategy and decision support',
                'features': [
                    'SWOT analysis',
                    'Market research',
                    'Competitive analysis',
                    'Strategic planning',
                    'OKR management',
                    'Decision frameworks',
                    'Scenario planning',
                    'Growth strategies'
                ],
                'status': 'active'
            },
            'operations_optimizer': {
                'name': 'Operations Optimizer',
                'description': 'Process improvement and optimization',
                'features': [
                    'Process mapping',
                    'Workflow optimization',
                    'Efficiency analysis',
                    'Cost reduction',
                    'Quality management',
                    'Automation recommendations',
                    'Performance metrics',
                    'Continuous improvement'
                ],
                'status': 'active'
            },
            'budget_controller': {
                'name': 'Budget Controller',
                'description': 'Financial planning and budget management',
                'features': [
                    'Budget planning',
                    'Expense tracking',
                    'Cost analysis',
                    'Financial forecasting',
                    'ROI calculations',
                    'Variance analysis',
                    'Approval workflows',
                    'Financial reporting'
                ],
                'status': 'active'
            },
            'meeting_assistant': {
                'name': 'Meeting Assistant AI',
                'description': 'Meeting management and coordination',
                'features': [
                    'Meeting scheduling',
                    'Agenda creation',
                    'Attendee management',
                    'Meeting notes',
                    'Action item tracking',
                    'Follow-up automation',
                    'Calendar integration',
                    'Meeting analytics'
                ],
                'status': 'active'
            }
        }

# Initialize the Manager Suite
manager_suite = ManagerSuite()

# Web interface for Manager Suite
MANAGER_SUITE_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Manager Suite - Professional Management Tools</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js" defer></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <style>
        .gradient-bg { background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%); }
        .tool-card { transition: all 0.3s ease; }
        .tool-card:hover { transform: translateY(-4px); box-shadow: 0 10px 25px rgba(0,0,0,0.15); }
        .gantt-bar { height: 20px; border-radius: 10px; }
    </style>
</head>
<body class="bg-gray-100 min-h-screen" x-data="managerSuite()">
    
    <!-- Header -->
    <header class="gradient-bg text-white shadow-xl">
        <div class="max-w-7xl mx-auto px-4 py-6">
            <div class="flex items-center justify-between">
                <div class="flex items-center">
                    <i class="fas fa-users-cog text-3xl mr-3"></i>
                    <div>
                        <h1 class="text-3xl font-bold">AI Manager Suite</h1>
                        <p class="text-purple-200">Professional Management Platform</p>
                    </div>
                </div>
                <div class="flex items-center space-x-4">
                    <div class="text-right">
                        <p class="text-sm text-purple-200">Contact</p>
                        <p class="font-semibold">swanhtet@supermega.dev</p>
                    </div>
                    <div class="w-12 h-12 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                        <i class="fas fa-user text-xl"></i>
                    </div>
                </div>
            </div>
        </div>
    </header>

    <!-- Quick Actions Bar -->
    <div class="bg-white shadow-sm border-b">
        <div class="max-w-7xl mx-auto px-4 py-4">
            <div class="flex flex-wrap gap-3">
                <button @click="quickAction('new-project')" 
                        class="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors">
                    <i class="fas fa-plus mr-2"></i>New Project
                </button>
                <button @click="quickAction('schedule-meeting')" 
                        class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                    <i class="fas fa-calendar mr-2"></i>Schedule Meeting
                </button>
                <button @click="quickAction('team-review')" 
                        class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors">
                    <i class="fas fa-users mr-2"></i>Team Review
                </button>
                <button @click="quickAction('budget-analysis')" 
                        class="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors">
                    <i class="fas fa-dollar-sign mr-2"></i>Budget Analysis
                </button>
                <button @click="quickAction('strategy-planning')" 
                        class="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors">
                    <i class="fas fa-chess mr-2"></i>Strategy Planning
                </button>
            </div>
        </div>
    </div>

    <!-- Main Dashboard -->
    <div class="max-w-7xl mx-auto px-4 py-8">
        
        <!-- Executive Overview -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div class="bg-white rounded-xl p-6 shadow-sm">
                <div class="flex items-center">
                    <div class="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                        <i class="fas fa-project-diagram text-purple-600 text-xl"></i>
                    </div>
                    <div class="ml-4">
                        <p class="text-sm text-gray-600">Active Projects</p>
                        <p class="text-2xl font-bold text-gray-900" x-text="stats.activeProjects"></p>
                    </div>
                </div>
            </div>
            <div class="bg-white rounded-xl p-6 shadow-sm">
                <div class="flex items-center">
                    <div class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                        <i class="fas fa-users text-blue-600 text-xl"></i>
                    </div>
                    <div class="ml-4">
                        <p class="text-sm text-gray-600">Team Members</p>
                        <p class="text-2xl font-bold text-gray-900" x-text="stats.teamMembers"></p>
                    </div>
                </div>
            </div>
            <div class="bg-white rounded-xl p-6 shadow-sm">
                <div class="flex items-center">
                    <div class="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                        <i class="fas fa-chart-line text-green-600 text-xl"></i>
                    </div>
                    <div class="ml-4">
                        <p class="text-sm text-gray-600">Budget Utilization</p>
                        <p class="text-2xl font-bold text-gray-900" x-text="stats.budgetUtilization + '%'"></p>
                    </div>
                </div>
            </div>
            <div class="bg-white rounded-xl p-6 shadow-sm">
                <div class="flex items-center">
                    <div class="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                        <i class="fas fa-calendar-check text-yellow-600 text-xl"></i>
                    </div>
                    <div class="ml-4">
                        <p class="text-sm text-gray-600">Meetings This Week</p>
                        <p class="text-2xl font-bold text-gray-900" x-text="stats.weeklyMeetings"></p>
                    </div>
                </div>
            </div>
        </div>

        <!-- Project Timeline -->
        <div class="bg-white rounded-xl p-6 shadow-sm mb-8">
            <h3 class="text-xl font-bold text-gray-900 mb-6">Project Timeline</h3>
            <div class="space-y-4">
                <template x-for="project in projectTimeline" :key="project.id">
                    <div class="flex items-center space-x-4">
                        <div class="w-32 text-sm font-medium text-gray-700" x-text="project.name"></div>
                        <div class="flex-1 relative">
                            <div class="w-full bg-gray-200 rounded-full h-5">
                                <div class="gantt-bar bg-gradient-to-r from-purple-500 to-purple-600 flex items-center justify-center text-white text-xs font-medium"
                                     :style="`width: ${project.progress}%`"
                                     x-text="project.progress + '%'">
                                </div>
                            </div>
                        </div>
                        <div class="w-24 text-sm text-gray-600" x-text="project.deadline"></div>
                        <div class="w-20">
                            <span class="px-2 py-1 text-xs rounded-full"
                                  :class="project.status === 'on-track' ? 'bg-green-100 text-green-800' : 
                                         project.status === 'delayed' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'"
                                  x-text="project.status.replace('-', ' ')"></span>
                        </div>
                    </div>
                </template>
            </div>
        </div>

        <!-- Management Tools Grid -->
        <div class="mb-8">
            <h2 class="text-2xl font-bold text-gray-900 mb-6">Management Tools</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <template x-for="tool in tools" :key="tool.name">
                    <div class="tool-card bg-white rounded-xl p-6 shadow-sm border border-gray-200 cursor-pointer"
                         @click="launchTool(tool)">
                        <div class="flex items-center mb-4">
                            <div class="w-14 h-14 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center">
                                <i class="fas fa-cogs text-white text-xl"></i>
                            </div>
                            <div class="ml-4">
                                <h3 class="text-lg font-bold text-gray-900" x-text="tool.name"></h3>
                                <p class="text-gray-600 text-sm" x-text="tool.description"></p>
                            </div>
                        </div>
                        <div class="space-y-2">
                            <template x-for="feature in tool.features.slice(0, 4)" :key="feature">
                                <div class="flex items-center text-sm text-gray-600">
                                    <i class="fas fa-check text-green-500 mr-2 text-xs"></i>
                                    <span x-text="feature"></span>
                                </div>
                            </template>
                        </div>
                        <div class="mt-4 pt-4 border-t border-gray-100">
                            <button class="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-2 rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all">
                                Launch Tool
                            </button>
                        </div>
                    </div>
                </template>
            </div>
        </div>

        <!-- Team Performance & Upcoming Meetings -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Team Performance -->
            <div class="bg-white rounded-xl p-6 shadow-sm">
                <h3 class="text-xl font-bold text-gray-900 mb-6">Team Performance</h3>
                <div class="space-y-4">
                    <template x-for="member in teamPerformance" :key="member.id">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center">
                                <div class="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                                    <i class="fas fa-user text-purple-600"></i>
                                </div>
                                <div class="ml-3">
                                    <p class="font-medium text-gray-900" x-text="member.name"></p>
                                    <p class="text-sm text-gray-600" x-text="member.role"></p>
                                </div>
                            </div>
                            <div class="flex items-center space-x-3">
                                <div class="text-right">
                                    <p class="text-sm font-medium" x-text="member.tasks + ' tasks'"></p>
                                    <p class="text-xs text-gray-600" x-text="member.completion + '% complete'"></p>
                                </div>
                                <div class="w-16 bg-gray-200 rounded-full h-2">
                                    <div class="bg-purple-600 h-2 rounded-full" 
                                         :style="`width: ${member.completion}%`"></div>
                                </div>
                            </div>
                        </div>
                    </template>
                </div>
            </div>

            <!-- Upcoming Meetings -->
            <div class="bg-white rounded-xl p-6 shadow-sm">
                <h3 class="text-xl font-bold text-gray-900 mb-6">Upcoming Meetings</h3>
                <div class="space-y-4">
                    <template x-for="meeting in upcomingMeetings" :key="meeting.id">
                        <div class="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                            <div class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                                <i class="fas fa-calendar text-blue-600"></i>
                            </div>
                            <div class="flex-1">
                                <p class="font-medium text-gray-900" x-text="meeting.title"></p>
                                <p class="text-sm text-gray-600" x-text="meeting.time"></p>
                                <p class="text-xs text-gray-500 mt-1" x-text="meeting.attendees + ' attendees'"></p>
                            </div>
                            <button class="text-blue-600 hover:text-blue-800">
                                <i class="fas fa-external-link-alt"></i>
                            </button>
                        </div>
                    </template>
                </div>
            </div>
        </div>
    </div>

    <!-- Tool Modal -->
    <div x-show="selectedTool" class="fixed inset-0 bg-black bg-opacity-50 z-50" x-cloak>
        <div class="min-h-screen flex items-center justify-center p-4">
            <div class="bg-white rounded-xl max-w-4xl w-full max-h-screen overflow-y-auto">
                <div class="p-6 border-b border-gray-200">
                    <div class="flex justify-between items-center">
                        <div>
                            <h3 class="text-2xl font-bold text-gray-900" x-text="selectedTool?.name"></h3>
                            <p class="text-gray-600" x-text="selectedTool?.description"></p>
                        </div>
                        <button @click="selectedTool = null" class="text-gray-400 hover:text-gray-600">
                            <i class="fas fa-times text-xl"></i>
                        </button>
                    </div>
                </div>
                <div class="p-6">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <h4 class="font-bold text-gray-900 mb-4">Management Features</h4>
                            <div class="space-y-2">
                                <template x-for="feature in selectedTool?.features || []" :key="feature">
                                    <div class="flex items-center">
                                        <i class="fas fa-check text-green-500 mr-3"></i>
                                        <span x-text="feature"></span>
                                    </div>
                                </template>
                            </div>
                        </div>
                        <div>
                            <h4 class="font-bold text-gray-900 mb-4">Quick Actions</h4>
                            <div class="space-y-3">
                                <button class="w-full text-left p-3 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors">
                                    <i class="fas fa-plus text-purple-600 mr-3"></i>
                                    Start New Initiative
                                </button>
                                <button class="w-full text-left p-3 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors">
                                    <i class="fas fa-chart-bar text-blue-600 mr-3"></i>
                                    View Analytics
                                </button>
                                <button class="w-full text-left p-3 bg-green-50 hover:bg-green-100 rounded-lg transition-colors">
                                    <i class="fas fa-history text-green-600 mr-3"></i>
                                    Recent Activity
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="mt-6 flex space-x-4">
                        <button @click="startUsingTool(selectedTool)" 
                                class="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-3 rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all">
                            Launch Manager Tool
                        </button>
                        <button @click="selectedTool = null" 
                                class="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        function managerSuite() {
            return {
                stats: {
                    activeProjects: 8,
                    teamMembers: 15,
                    budgetUtilization: 73,
                    weeklyMeetings: 12
                },
                tools: [],
                selectedTool: null,
                projectTimeline: [
                    { id: 1, name: 'Product Launch', progress: 75, deadline: 'Mar 15', status: 'on-track' },
                    { id: 2, name: 'Website Redesign', progress: 45, deadline: 'Apr 10', status: 'delayed' },
                    { id: 3, name: 'Marketing Campaign', progress: 90, deadline: 'Feb 28', status: 'on-track' },
                    { id: 4, name: 'Team Expansion', progress: 30, deadline: 'May 20', status: 'at-risk' }
                ],
                teamPerformance: [
                    { id: 1, name: 'Sarah Johnson', role: 'Project Manager', tasks: 8, completion: 92 },
                    { id: 2, name: 'Mike Chen', role: 'Developer', tasks: 12, completion: 85 },
                    { id: 3, name: 'Lisa Wong', role: 'Designer', tasks: 6, completion: 98 },
                    { id: 4, name: 'Alex Kumar', role: 'Analyst', tasks: 9, completion: 78 }
                ],
                upcomingMeetings: [
                    { id: 1, title: 'Weekly Team Standup', time: 'Today, 9:00 AM', attendees: 8 },
                    { id: 2, title: 'Client Review Meeting', time: 'Tomorrow, 2:00 PM', attendees: 5 },
                    { id: 3, title: 'Budget Planning Session', time: 'Friday, 10:00 AM', attendees: 6 },
                    { id: 4, title: 'Quarterly Review', time: 'Next Mon, 1:00 PM', attendees: 12 }
                ],

                async init() {
                    await this.loadTools();
                    setInterval(() => this.updateStats(), 30000);
                },

                async loadTools() {
                    try {
                        const response = await fetch('/api/management-tools');
                        const data = await response.json();
                        this.tools = data.tools || [];
                    } catch (error) {
                        console.error('Failed to load tools:', error);
                        // Fallback data
                        this.tools = [
                            {
                                name: 'AI Project Manager',
                                description: 'Comprehensive project planning and tracking',
                                features: ['Project planning', 'Task management', 'Timeline tracking', 'Resource allocation', 'Budget monitoring', 'Risk assessment', 'Progress reporting', 'Milestone tracking']
                            },
                            {
                                name: 'Team Coordination Hub',
                                description: 'Team management and collaboration',
                                features: ['Team scheduling', 'Performance tracking', 'Skill assessment', 'Workload balancing', 'Communication center', 'Meeting planning', '1-on-1 tracking', 'Goal alignment']
                            },
                            {
                                name: 'Strategic Planning AI',
                                description: 'Business strategy and decision support',
                                features: ['SWOT analysis', 'Market research', 'Competitive analysis', 'Strategic planning', 'OKR management', 'Decision frameworks', 'Scenario planning', 'Growth strategies']
                            },
                            {
                                name: 'Operations Optimizer',
                                description: 'Process improvement and optimization',
                                features: ['Process mapping', 'Workflow optimization', 'Efficiency analysis', 'Cost reduction', 'Quality management', 'Automation recommendations', 'Performance metrics', 'Continuous improvement']
                            },
                            {
                                name: 'Budget Controller',
                                description: 'Financial planning and budget management',
                                features: ['Budget planning', 'Expense tracking', 'Cost analysis', 'Financial forecasting', 'ROI calculations', 'Variance analysis', 'Approval workflows', 'Financial reporting']
                            },
                            {
                                name: 'Meeting Assistant AI',
                                description: 'Meeting management and coordination',
                                features: ['Meeting scheduling', 'Agenda creation', 'Attendee management', 'Meeting notes', 'Action item tracking', 'Follow-up automation', 'Calendar integration', 'Meeting analytics']
                            }
                        ];
                    }
                },

                quickAction(action) {
                    switch(action) {
                        case 'new-project':
                            this.createNewProject();
                            break;
                        case 'schedule-meeting':
                            this.scheduleMeeting();
                            break;
                        case 'team-review':
                            this.teamReview();
                            break;
                        case 'budget-analysis':
                            this.budgetAnalysis();
                            break;
                        case 'strategy-planning':
                            this.strategyPlanning();
                            break;
                    }
                },

                launchTool(tool) {
                    this.selectedTool = tool;
                },

                startUsingTool(tool) {
                    console.log('Launching tool:', tool.name);
                    this.selectedTool = null;
                },

                createNewProject() {
                    console.log('Creating new project...');
                },

                scheduleMeeting() {
                    console.log('Scheduling meeting...');
                },

                teamReview() {
                    console.log('Starting team review...');
                },

                budgetAnalysis() {
                    console.log('Running budget analysis...');
                },

                strategyPlanning() {
                    console.log('Opening strategy planning...');
                },

                updateStats() {
                    // Update statistics periodically
                    if (Math.random() > 0.7) {
                        this.stats.budgetUtilization += Math.floor(Math.random() * 3);
                        this.stats.weeklyMeetings += Math.floor(Math.random() * 2);
                    }
                }
            }
        }
    </script>
</body>
</html>
"""

@app.route('/')
def manager_dashboard():
    """Manager Suite dashboard"""
    return render_template_string(MANAGER_SUITE_HTML)

@app.route('/api/management-tools')
def get_management_tools():
    """Get all management tools"""
    return jsonify({
        'tools': list(manager_suite.tools.values())
    })

@app.route('/api/project', methods=['POST'])
def create_project():
    """Create new project endpoint"""
    data = request.json
    project_name = data.get('name', '')
    description = data.get('description', '')
    budget = data.get('budget', 0)
    start_date = data.get('start_date', datetime.now().date())
    end_date = data.get('end_date', None)
    
    # Store in database
    conn = sqlite3.connect('manager_suite.db')
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO projects (project_name, description, budget, start_date, end_date)
        VALUES (?, ?, ?, ?, ?)
    ''', (project_name, description, budget, start_date, end_date))
    project_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return jsonify({
        'success': True,
        'project_id': project_id,
        'message': f'Project "{project_name}" created successfully',
        'timestamp': datetime.now().isoformat()
    })

@app.route('/api/meeting', methods=['POST'])
def schedule_meeting():
    """Schedule meeting endpoint"""
    data = request.json
    title = data.get('title', '')
    description = data.get('description', '')
    start_time = data.get('start_time', datetime.now())
    duration = data.get('duration', 60)
    attendees = data.get('attendees', [])
    
    # Store in database
    conn = sqlite3.connect('manager_suite.db')
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO meetings (title, description, start_time, duration, attendees)
        VALUES (?, ?, ?, ?, ?)
    ''', (title, description, start_time, duration, ','.join(attendees)))
    meeting_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return jsonify({
        'success': True,
        'meeting_id': meeting_id,
        'message': f'Meeting "{title}" scheduled successfully',
        'timestamp': datetime.now().isoformat()
    })

@app.route('/api/team-analysis', methods=['GET'])
def team_analysis():
    """Team performance analysis endpoint"""
    # Simulate team analysis
    analysis = {
        'success': True,
        'team_metrics': {
            'total_members': 15,
            'active_projects': 8,
            'avg_productivity': 87,
            'satisfaction_score': 92
        },
        'insights': [
            'Team productivity has increased by 15% this quarter',
            'Project completion rate is above industry average',
            '3 team members ready for promotion',
            'Workload distribution is optimal'
        ],
        'recommendations': [
            'Consider expanding team by 2-3 members',
            'Implement cross-training program',
            'Schedule quarterly team building activities'
        ],
        'timestamp': datetime.now().isoformat()
    }
    
    return jsonify(analysis)

@app.route('/api/budget-report', methods=['GET'])
def budget_report():
    """Budget analysis report endpoint"""
    # Simulate budget report
    report = {
        'success': True,
        'budget_summary': {
            'total_budget': 500000,
            'spent': 365000,
            'remaining': 135000,
            'utilization_rate': 73
        },
        'categories': [
            {'name': 'Personnel', 'budget': 300000, 'spent': 245000, 'percentage': 82},
            {'name': 'Technology', 'budget': 100000, 'spent': 75000, 'percentage': 75},
            {'name': 'Marketing', 'budget': 50000, 'spent': 35000, 'percentage': 70},
            {'name': 'Operations', 'budget': 50000, 'spent': 10000, 'percentage': 20}
        ],
        'variance_analysis': {
            'over_budget': ['Personnel'],
            'under_budget': ['Operations'],
            'on_track': ['Technology', 'Marketing']
        },
        'timestamp': datetime.now().isoformat()
    }
    
    return jsonify(report)

@app.route('/health')
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'suite': manager_suite.suite_name,
        'version': manager_suite.version,
        'timestamp': datetime.now().isoformat(),
        'active_tools': len(manager_suite.tools)
    })

if __name__ == '__main__':
    print("👔 AI MANAGER SUITE - Starting...")
    print("=" * 50)
    print(f"Suite: {manager_suite.suite_name} v{manager_suite.version}")
    print(f"Management Tools: {len(manager_suite.tools)}")
    print("=" * 50)
    print("🌐 Manager Suite available at: http://localhost:5003")
    print("🎯 Dashboard: http://localhost:5003")
    print("🔍 Health Check: http://localhost:5003/health")
    print("=" * 50)
    
    app.run(host='0.0.0.0', port=5003, debug=False)
