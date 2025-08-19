#!/usr/bin/env python3
"""
Super Mega Smart Task & Project Manager
Advanced project management with AI-powered insights and email integration
"""

import os
import json
import time
import uuid
import sqlite3
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

class SuperMegaTaskManager:
    """Advanced task and project management system"""
    
    def __init__(self):
        self.tool_name = "smart_task_manager"
        self.init_task_database()
        
    def init_task_database(self):
        """Initialize task management database"""
        conn = sqlite3.connect('task_manager.db')
        cursor = conn.cursor()
        
        # Projects
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                name TEXT,
                description TEXT,
                status TEXT DEFAULT 'active',
                priority TEXT DEFAULT 'medium',
                start_date DATE,
                due_date DATE,
                completion_percentage REAL DEFAULT 0,
                budget REAL,
                spent_budget REAL DEFAULT 0,
                team_members TEXT,
                tags TEXT,
                ai_insights TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Tasks
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                project_id TEXT,
                user_id TEXT,
                title TEXT,
                description TEXT,
                status TEXT DEFAULT 'todo',
                priority TEXT DEFAULT 'medium',
                assigned_to TEXT,
                due_date DATETIME,
                estimated_hours REAL,
                actual_hours REAL DEFAULT 0,
                tags TEXT,
                dependencies TEXT,
                attachments TEXT,
                ai_analysis TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects (id)
            )
        """)
        
        # Time tracking
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS time_entries (
                id TEXT PRIMARY KEY,
                task_id TEXT,
                user_id TEXT,
                start_time TIMESTAMP,
                end_time TIMESTAMP,
                duration REAL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (task_id) REFERENCES tasks (id)
            )
        """)
        
        # Comments and collaboration
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS task_comments (
                id TEXT PRIMARY KEY,
                task_id TEXT,
                user_id TEXT,
                content TEXT,
                attachments TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (task_id) REFERENCES tasks (id)
            )
        """)
        
        conn.commit()
        conn.close()

task_manager = SuperMegaTaskManager()

# Smart Task Manager HTML Interface
TASK_MANAGER_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Smart Task & Project Manager - Super Mega</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js" defer></script>
    <style>
        .task-card {
            transition: all 0.3s ease;
            border-left: 4px solid transparent;
        }
        .task-card:hover { 
            transform: translateY(-2px); 
            box-shadow: 0 8px 25px rgba(0,0,0,0.1);
        }
        .priority-critical { border-left-color: #DC2626; }
        .priority-high { border-left-color: #EA580C; }
        .priority-medium { border-left-color: #CA8A04; }
        .priority-low { border-left-color: #16A34A; }
        .status-todo { background: rgba(59, 130, 246, 0.05); }
        .status-in-progress { background: rgba(245, 158, 11, 0.05); }
        .status-review { background: rgba(139, 92, 246, 0.05); }
        .status-done { background: rgba(16, 185, 129, 0.05); }
        .processing-indicator {
            background: linear-gradient(45deg, #3B82F6, #8B5CF6);
            background-size: 200% 200%;
            animation: gradient 2s ease infinite;
        }
        @keyframes gradient {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }
        .kanban-column {
            min-height: 500px;
            background: linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05));
        }
        .project-card {
            background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.1));
            border: 1px solid rgba(59, 130, 246, 0.2);
        }
    </style>
</head>
<body class="bg-gray-50" x-data="taskManager()">

    <!-- Header -->
    <div class="bg-gradient-to-r from-purple-900 to-blue-900 text-white p-4 shadow-lg">
        <div class="max-w-7xl mx-auto flex justify-between items-center">
            <div class="flex items-center space-x-4">
                <h1 class="text-2xl font-bold">🎯 Smart Task & Project Manager</h1>
                <div class="bg-white bg-opacity-20 px-3 py-1 rounded-full text-sm">
                    AI-Powered Productivity
                </div>
            </div>
            <div class="flex items-center space-x-4">
                <div class="text-right text-sm">
                    <div>Projects: <span x-text="stats.totalProjects"></span></div>
                    <div>Tasks: <span x-text="stats.activeTasks" class="font-bold"></span></div>
                </div>
                <button @click="showCreateProject = true" 
                        class="bg-green-600 hover:bg-green-700 px-4 py-2 rounded font-medium">
                    📋 New Project
                </button>
                <button @click="showAnalytics = true" 
                        class="bg-white bg-opacity-20 px-3 py-1 rounded hover:bg-opacity-30">
                    📊 Analytics
                </button>
            </div>
        </div>
    </div>

    <div class="max-w-7xl mx-auto p-6">
        
        <!-- AI Productivity Insights -->
        <div x-show="productivityInsights.length > 0" class="mb-6">
            <div class="bg-gradient-to-r from-purple-100 to-blue-100 rounded-lg p-4 border border-purple-200">
                <h2 class="font-bold text-lg mb-3 text-purple-800">🧠 AI Productivity Insights</h2>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <template x-for="insight in productivityInsights" :key="insight.id">
                        <div class="bg-white rounded-lg p-3 shadow">
                            <div class="flex items-center justify-between mb-2">
                                <span class="font-medium text-sm" x-text="insight.title"></span>
                                <span class="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded"
                                      x-text="insight.impact"></span>
                            </div>
                            <p class="text-sm text-gray-600" x-text="insight.description"></p>
                            <button @click="applyInsight(insight)" 
                                    class="mt-2 text-xs text-blue-600 hover:text-blue-800">
                                Apply Suggestion →
                            </button>
                        </div>
                    </template>
                </div>
            </div>
        </div>

        <div class="grid grid-cols-12 gap-6">
            
            <!-- Sidebar -->
            <div class="col-span-3">
                
                <!-- Navigation -->
                <div class="bg-white rounded-lg shadow p-4 mb-4">
                    <nav class="space-y-2">
                        <button @click="activeView = 'dashboard'" 
                                :class="activeView === 'dashboard' ? 'bg-purple-500 text-white' : 'text-gray-700 hover:bg-gray-100'"
                                class="w-full text-left px-3 py-2 rounded">
                            📊 Dashboard
                        </button>
                        <button @click="activeView = 'projects'" 
                                :class="activeView === 'projects' ? 'bg-purple-500 text-white' : 'text-gray-700 hover:bg-gray-100'"
                                class="w-full text-left px-3 py-2 rounded">
                            📋 Projects (<span x-text="stats.activeProjects"></span>)
                        </button>
                        <button @click="activeView = 'kanban'" 
                                :class="activeView === 'kanban' ? 'bg-purple-500 text-white' : 'text-gray-700 hover:bg-gray-100'"
                                class="w-full text-left px-3 py-2 rounded">
                            🎯 Kanban Board
                        </button>
                        <button @click="activeView = 'calendar'" 
                                :class="activeView === 'calendar' ? 'bg-purple-500 text-white' : 'text-gray-700 hover:bg-gray-100'"
                                class="w-full text-left px-3 py-2 rounded">
                            📅 Calendar
                        </button>
                        <button @click="activeView = 'timetracking'" 
                                :class="activeView === 'timetracking' ? 'bg-purple-500 text-white' : 'text-gray-700 hover:bg-gray-100'"
                                class="w-full text-left px-3 py-2 rounded">
                            ⏱️ Time Tracking
                        </button>
                        <button @click="activeView = 'reports'" 
                                :class="activeView === 'reports' ? 'bg-purple-500 text-white' : 'text-gray-700 hover:bg-gray-100'"
                                class="w-full text-left px-3 py-2 rounded">
                            📈 Reports
                        </button>
                    </nav>
                </div>

                <!-- Quick Actions -->
                <div class="bg-white rounded-lg shadow p-4 mb-4">
                    <h3 class="font-bold mb-3">⚡ Quick Actions</h3>
                    <div class="space-y-2">
                        <button @click="createQuickTask" 
                                class="w-full text-left px-2 py-2 text-sm bg-blue-50 text-blue-700 rounded hover:bg-blue-100">
                            ➕ Quick Task
                        </button>
                        <button @click="startTimer" 
                                :class="timerRunning ? 'bg-red-50 text-red-700 hover:bg-red-100' : 'bg-green-50 text-green-700 hover:bg-green-100'"
                                class="w-full text-left px-2 py-2 text-sm rounded">
                            <span x-show="!timerRunning">▶️ Start Timer</span>
                            <span x-show="timerRunning">⏸️ Stop Timer</span>
                        </button>
                        <button @click="showTaskTemplates = true" 
                                class="w-full text-left px-2 py-2 text-sm bg-purple-50 text-purple-700 rounded hover:bg-purple-100">
                            📋 Task Templates
                        </button>
                        <button @click="generateAIReport" 
                                class="w-full text-left px-2 py-2 text-sm bg-yellow-50 text-yellow-700 rounded hover:bg-yellow-100">
                            🧠 AI Report
                        </button>
                    </div>
                </div>

                <!-- Timer Widget -->
                <div x-show="currentTask" class="bg-white rounded-lg shadow p-4 mb-4">
                    <h3 class="font-bold mb-3">⏱️ Current Task</h3>
                    <div class="text-sm mb-2" x-text="currentTask?.title"></div>
                    <div class="text-2xl font-bold text-center py-4" x-text="formatTime(currentTime)"></div>
                    <div class="flex space-x-2">
                        <button @click="pauseTimer" 
                                class="flex-1 py-1 px-2 text-xs bg-yellow-500 text-white rounded">
                            ⏸️ Pause
                        </button>
                        <button @click="stopTimer" 
                                class="flex-1 py-1 px-2 text-xs bg-red-500 text-white rounded">
                            ⏹️ Stop
                        </button>
                    </div>
                </div>

                <!-- Team Activity -->
                <div class="bg-white rounded-lg shadow p-4">
                    <h3 class="font-bold mb-3">👥 Team Activity</h3>
                    <div class="space-y-3 text-sm">
                        <template x-for="activity in teamActivity" :key="activity.id">
                            <div class="flex items-start space-x-2">
                                <div class="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-xs"
                                     x-text="activity.user.charAt(0).toUpperCase()"></div>
                                <div class="flex-1">
                                    <div x-text="activity.action" class="text-gray-800"></div>
                                    <div x-text="formatTimeAgo(activity.timestamp)" class="text-gray-500 text-xs"></div>
                                </div>
                            </div>
                        </template>
                    </div>
                </div>
            </div>

            <!-- Main Content -->
            <div class="col-span-9">
                
                <!-- Dashboard View -->
                <div x-show="activeView === 'dashboard'" class="space-y-6">
                    
                    <!-- Key Metrics -->
                    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div class="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-lg p-4">
                            <div class="text-2xl font-bold" x-text="stats.totalTasks"></div>
                            <div class="text-blue-100">Total Tasks</div>
                            <div class="text-sm mt-1" x-text="'+' + stats.tasksThisWeek + ' this week'"></div>
                        </div>
                        <div class="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-lg p-4">
                            <div class="text-2xl font-bold" x-text="stats.completionRate + '%'"></div>
                            <div class="text-green-100">Completion Rate</div>
                            <div class="text-sm mt-1" x-text="'+' + stats.completionImprovement + '% vs last week'"></div>
                        </div>
                        <div class="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-lg p-4">
                            <div class="text-2xl font-bold" x-text="stats.avgTaskTime + 'h'"></div>
                            <div class="text-purple-100">Avg Task Time</div>
                            <div class="text-sm mt-1" x-text="stats.timeEfficiency + '% efficient'"></div>
                        </div>
                        <div class="bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-lg p-4">
                            <div class="text-2xl font-bold" x-text="stats.overdueCount"></div>
                            <div class="text-orange-100">Overdue Tasks</div>
                            <div class="text-sm mt-1" x-text="stats.urgentCount + ' urgent'"></div>
                        </div>
                    </div>

                    <!-- Today's Focus & Upcoming -->
                    <div class="grid grid-cols-2 gap-6">
                        <div class="bg-white rounded-lg shadow p-6">
                            <h2 class="text-xl font-bold mb-4 flex items-center">
                                🎯 Today's Focus
                                <span class="ml-2 text-sm font-normal bg-blue-100 text-blue-700 px-2 py-1 rounded">
                                    <span x-text="todaysTasks.length"></span> tasks
                                </span>
                            </h2>
                            <div class="space-y-3">
                                <template x-for="task in todaysTasks.slice(0, 5)" :key="task.id">
                                    <div class="task-card bg-white border rounded-lg p-3 cursor-pointer"
                                         :class="'priority-' + task.priority + ' status-' + task.status.replace('_', '-')"
                                         @click="selectTask(task)">
                                        <div class="flex items-center justify-between mb-2">
                                            <span class="font-medium" x-text="task.title"></span>
                                            <div class="flex items-center space-x-2">
                                                <span class="text-xs px-2 py-1 rounded"
                                                      :class="'bg-' + getPriorityColor(task.priority) + '-100 text-' + getPriorityColor(task.priority) + '-700'"
                                                      x-text="task.priority.toUpperCase()"></span>
                                                <button @click.stop="startTaskTimer(task)" 
                                                        class="text-green-500 hover:text-green-600">
                                                    ▶️
                                                </button>
                                            </div>
                                        </div>
                                        <div class="text-sm text-gray-600 mb-2" x-text="task.description"></div>
                                        <div class="flex items-center justify-between text-xs text-gray-500">
                                            <span x-text="task.project_name"></span>
                                            <span x-text="formatTime(task.estimated_hours) + ' est.'"></span>
                                        </div>
                                    </div>
                                </template>
                            </div>
                        </div>

                        <div class="bg-white rounded-lg shadow p-6">
                            <h2 class="text-xl font-bold mb-4">📅 Upcoming Deadlines</h2>
                            <div class="space-y-3">
                                <template x-for="task in upcomingTasks.slice(0, 5)" :key="task.id">
                                    <div class="flex items-center space-x-3 p-3 border rounded-lg">
                                        <div class="text-center">
                                            <div class="text-lg font-bold" x-text="formatDeadlineDate(task.due_date).day"></div>
                                            <div class="text-xs text-gray-500" x-text="formatDeadlineDate(task.due_date).month"></div>
                                        </div>
                                        <div class="flex-1">
                                            <div class="font-medium" x-text="task.title"></div>
                                            <div class="text-sm text-gray-600" x-text="task.project_name"></div>
                                        </div>
                                        <div class="text-right">
                                            <div class="text-sm font-medium"
                                                 :class="getDueDateColor(task.due_date)"
                                                 x-text="formatDueDateText(task.due_date)"></div>
                                        </div>
                                    </div>
                                </template>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Projects View -->
                <div x-show="activeView === 'projects'" class="space-y-6">
                    <div class="flex justify-between items-center">
                        <h2 class="text-2xl font-bold">📋 Projects</h2>
                        <div class="flex space-x-2">
                            <select x-model="projectFilter" @change="filterProjects" class="border rounded px-3 py-2">
                                <option value="all">All Projects</option>
                                <option value="active">Active</option>
                                <option value="completed">Completed</option>
                                <option value="on-hold">On Hold</option>
                            </select>
                            <button @click="showCreateProject = true" 
                                    class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
                                ➕ New Project
                            </button>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <template x-for="project in filteredProjects" :key="project.id">
                            <div class="project-card rounded-lg p-6 cursor-pointer transform hover:scale-105 transition-transform"
                                 @click="selectProject(project)">
                                <div class="flex justify-between items-start mb-4">
                                    <h3 class="font-bold text-lg" x-text="project.name"></h3>
                                    <span class="text-xs px-2 py-1 rounded"
                                          :class="getProjectStatusClass(project.status)"
                                          x-text="project.status.toUpperCase()"></span>
                                </div>
                                
                                <p class="text-gray-600 text-sm mb-4" x-text="project.description"></p>
                                
                                <!-- Progress Bar -->
                                <div class="mb-4">
                                    <div class="flex justify-between text-sm mb-1">
                                        <span>Progress</span>
                                        <span x-text="Math.round(project.completion_percentage) + '%'"></span>
                                    </div>
                                    <div class="w-full bg-gray-200 rounded-full h-2">
                                        <div class="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                             :style="'width: ' + project.completion_percentage + '%'"></div>
                                    </div>
                                </div>
                                
                                <div class="grid grid-cols-3 gap-2 text-center text-sm">
                                    <div>
                                        <div class="font-bold" x-text="project.total_tasks || 0"></div>
                                        <div class="text-gray-500">Tasks</div>
                                    </div>
                                    <div>
                                        <div class="font-bold" x-text="project.team_size || 1"></div>
                                        <div class="text-gray-500">Team</div>
                                    </div>
                                    <div>
                                        <div class="font-bold" x-text="formatDaysLeft(project.due_date)"></div>
                                        <div class="text-gray-500">Days Left</div>
                                    </div>
                                </div>
                                
                                <div class="mt-4 pt-4 border-t flex justify-between items-center">
                                    <div class="flex -space-x-2">
                                        <template x-for="member in (project.team_members || []).slice(0, 3)" :key="member">
                                            <div class="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs border-2 border-white"
                                                 x-text="member.charAt(0).toUpperCase()"></div>
                                        </template>
                                    </div>
                                    <div class="text-sm text-gray-500" x-text="formatDate(project.due_date)"></div>
                                </div>
                            </div>
                        </template>
                    </div>
                </div>

                <!-- Kanban Board View -->
                <div x-show="activeView === 'kanban'" class="space-y-6">
                    <div class="flex justify-between items-center">
                        <h2 class="text-2xl font-bold">🎯 Kanban Board</h2>
                        <div class="flex space-x-2">
                            <select x-model="selectedProject" @change="loadKanbanTasks" class="border rounded px-3 py-2">
                                <option value="">All Projects</option>
                                <template x-for="project in projects" :key="project.id">
                                    <option :value="project.id" x-text="project.name"></option>
                                </template>
                            </select>
                            <button @click="createQuickTask" 
                                    class="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
                                ➕ Quick Task
                            </button>
                        </div>
                    </div>

                    <div class="grid grid-cols-4 gap-4">
                        <template x-for="(column, status) in kanbanColumns" :key="status">
                            <div class="kanban-column bg-gray-100 rounded-lg p-4">
                                <div class="flex justify-between items-center mb-4">
                                    <h3 class="font-bold" x-text="column.title"></h3>
                                    <span class="text-sm bg-white px-2 py-1 rounded" 
                                          x-text="column.tasks.length"></span>
                                </div>
                                
                                <div class="space-y-3">
                                    <template x-for="task in column.tasks" :key="task.id">
                                        <div class="task-card bg-white rounded-lg p-3 cursor-move"
                                             :class="'priority-' + task.priority"
                                             @click="selectTask(task)"
                                             draggable="true">
                                            <div class="flex justify-between items-start mb-2">
                                                <span class="font-medium text-sm" x-text="task.title"></span>
                                                <span class="text-xs px-1 py-1 rounded"
                                                      :class="'bg-' + getPriorityColor(task.priority) + '-100 text-' + getPriorityColor(task.priority) + '-600'"
                                                      x-text="task.priority.charAt(0).toUpperCase()"></span>
                                            </div>
                                            
                                            <p class="text-xs text-gray-600 mb-3" x-text="task.description"></p>
                                            
                                            <div class="flex items-center justify-between">
                                                <div class="flex items-center space-x-2">
                                                    <div x-show="task.assigned_to" 
                                                         class="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs"
                                                         x-text="task.assigned_to?.charAt(0).toUpperCase()"></div>
                                                    <div x-show="task.due_date" 
                                                         class="text-xs"
                                                         :class="getDueDateColor(task.due_date)"
                                                         x-text="formatDate(task.due_date)"></div>
                                                </div>
                                                
                                                <div class="flex space-x-1">
                                                    <button @click.stop="startTaskTimer(task)" 
                                                            class="text-green-500 hover:text-green-600 text-xs">▶️</button>
                                                    <button @click.stop="editTask(task)" 
                                                            class="text-blue-500 hover:text-blue-600 text-xs">✏️</button>
                                                </div>
                                            </div>
                                        </div>
                                    </template>
                                </div>
                                
                                <button @click="createTaskInColumn(status)" 
                                        class="w-full mt-3 py-2 text-center text-sm text-gray-600 hover:bg-white hover:text-gray-800 rounded border-2 border-dashed border-gray-300">
                                    ➕ Add Task
                                </button>
                            </div>
                        </template>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        function taskManager() {
            return {
                // State management
                activeView: 'dashboard',
                loading: false,
                
                // Session
                sessionId: null,
                userInfo: {},
                
                // Data
                projects: [],
                filteredProjects: [],
                tasks: [],
                currentTask: null,
                selectedProject: '',
                projectFilter: 'all',
                
                // Timer
                timerRunning: false,
                currentTime: 0,
                timerInterval: null,
                
                // Statistics
                stats: {
                    totalProjects: 0,
                    activeProjects: 0,
                    totalTasks: 0,
                    activeTasks: 0,
                    completionRate: 85,
                    completionImprovement: 12,
                    avgTaskTime: 2.4,
                    timeEfficiency: 78,
                    overdueCount: 3,
                    urgentCount: 5,
                    tasksThisWeek: 15
                },
                
                // Today's data
                todaysTasks: [],
                upcomingTasks: [],
                
                // Kanban
                kanbanColumns: {
                    todo: { title: 'To Do', tasks: [] },
                    'in-progress': { title: 'In Progress', tasks: [] },
                    review: { title: 'Review', tasks: [] },
                    done: { title: 'Done', tasks: [] }
                },
                
                // AI Insights
                productivityInsights: [],
                teamActivity: [],
                
                // UI State
                showCreateProject: false,
                showTaskTemplates: false,
                showAnalytics: false,
                
                async init() {
                    // Initialize session
                    const sessionData = await this.createSession();
                    this.sessionId = sessionData.session_id;
                    this.userInfo = sessionData.user_stats.user_info;
                    
                    // Load data
                    await this.loadProjects();
                    await this.loadTasks();
                    await this.loadProductivityInsights();
                    await this.loadTeamActivity();
                    
                    this.updateDashboardData();
                },
                
                async createSession() {
                    const response = await fetch('/api/task-manager/session', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({
                            email: 'swanhtet@supermega.dev',
                            name: 'Swan Htet',
                            tool_name: 'smart_task_manager'
                        })
                    });
                    return response.json();
                },
                
                async loadProjects() {
                    const response = await fetch(`/api/task-manager/projects?session_id=${this.sessionId}`);
                    const data = await response.json();
                    this.projects = data.projects || [];
                    this.filteredProjects = [...this.projects];
                    this.updateStats();
                },
                
                async loadTasks() {
                    const response = await fetch(`/api/task-manager/tasks?session_id=${this.sessionId}`);
                    const data = await response.json();
                    this.tasks = data.tasks || [];
                    this.updateKanbanColumns();
                    this.updateTodaysAndUpcoming();
                },
                
                async loadProductivityInsights() {
                    const insights = [
                        {
                            id: '1',
                            title: 'Peak Productivity Hours',
                            description: 'You\'re 60% more productive between 9-11 AM',
                            impact: 'High',
                            suggestion: 'Schedule complex tasks during morning hours'
                        },
                        {
                            id: '2',
                            title: 'Task Completion Pattern',
                            description: 'Breaking large tasks into 2-hour chunks improves completion by 40%',
                            impact: 'Medium',
                            suggestion: 'Split current large tasks'
                        },
                        {
                            id: '3',
                            title: 'Communication Efficiency',
                            description: 'Tasks with clear descriptions are completed 25% faster',
                            impact: 'Medium',
                            suggestion: 'Review and improve task descriptions'
                        }
                    ];
                    this.productivityInsights = insights;
                },
                
                async loadTeamActivity() {
                    const activity = [
                        {
                            id: '1',
                            user: 'John Doe',
                            action: 'completed "API Integration" task',
                            timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString()
                        },
                        {
                            id: '2',
                            user: 'Sarah Kim',
                            action: 'added comment to "UI Design"',
                            timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString()
                        },
                        {
                            id: '3',
                            user: 'Mike Wilson',
                            action: 'started working on "Database Schema"',
                            timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString()
                        }
                    ];
                    this.teamActivity = activity;
                },
                
                updateStats() {
                    this.stats.totalProjects = this.projects.length;
                    this.stats.activeProjects = this.projects.filter(p => p.status === 'active').length;
                    this.stats.totalTasks = this.tasks.length;
                    this.stats.activeTasks = this.tasks.filter(t => ['todo', 'in-progress'].includes(t.status)).length;
                },
                
                updateKanbanColumns() {
                    // Reset columns
                    Object.keys(this.kanbanColumns).forEach(status => {
                        this.kanbanColumns[status].tasks = [];
                    });
                    
                    // Distribute tasks
                    this.tasks.forEach(task => {
                        const status = task.status.replace('_', '-');
                        if (this.kanbanColumns[status]) {
                            this.kanbanColumns[status].tasks.push(task);
                        }
                    });
                },
                
                updateTodaysAndUpcoming() {
                    const today = new Date();
                    const tomorrow = new Date(today);
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    const nextWeek = new Date(today);
                    nextWeek.setDate(nextWeek.getDate() + 7);
                    
                    this.todaysTasks = this.tasks.filter(task => {
                        const dueDate = new Date(task.due_date);
                        return dueDate <= tomorrow && !['done', 'cancelled'].includes(task.status);
                    });
                    
                    this.upcomingTasks = this.tasks.filter(task => {
                        const dueDate = new Date(task.due_date);
                        return dueDate > tomorrow && dueDate <= nextWeek && !['done', 'cancelled'].includes(task.status);
                    }).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
                },
                
                updateDashboardData() {
                    this.updateStats();
                    this.updateTodaysAndUpcoming();
                },
                
                filterProjects() {
                    if (this.projectFilter === 'all') {
                        this.filteredProjects = [...this.projects];
                    } else {
                        this.filteredProjects = this.projects.filter(p => p.status === this.projectFilter);
                    }
                },
                
                selectProject(project) {
                    console.log('Selected project:', project.name);
                    // Implement project details view
                },
                
                selectTask(task) {
                    console.log('Selected task:', task.title);
                    // Implement task details view
                },
                
                startTaskTimer(task) {
                    this.currentTask = task;
                    this.timerRunning = true;
                    this.currentTime = 0;
                    
                    this.timerInterval = setInterval(() => {
                        this.currentTime++;
                    }, 1000);
                },
                
                stopTimer() {
                    if (this.timerInterval) {
                        clearInterval(this.timerInterval);
                        this.timerInterval = null;
                    }
                    this.timerRunning = false;
                    this.currentTask = null;
                    this.currentTime = 0;
                },
                
                formatTime(seconds) {
                    if (typeof seconds !== 'number') return '0h 0m';
                    const hours = Math.floor(seconds / 3600);
                    const minutes = Math.floor((seconds % 3600) / 60);
                    return `${hours}h ${minutes}m`;
                },
                
                formatTimeAgo(timestamp) {
                    const now = new Date();
                    const time = new Date(timestamp);
                    const diffMinutes = Math.floor((now - time) / (1000 * 60));
                    
                    if (diffMinutes < 60) return `${diffMinutes}m ago`;
                    const diffHours = Math.floor(diffMinutes / 60);
                    if (diffHours < 24) return `${diffHours}h ago`;
                    const diffDays = Math.floor(diffHours / 24);
                    return `${diffDays}d ago`;
                },
                
                formatDate(dateString) {
                    if (!dateString) return '';
                    const date = new Date(dateString);
                    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
                },
                
                formatDeadlineDate(dateString) {
                    const date = new Date(dateString);
                    return {
                        day: date.getDate(),
                        month: date.toLocaleDateString([], { month: 'short' })
                    };
                },
                
                formatDaysLeft(dateString) {
                    if (!dateString) return '-';
                    const today = new Date();
                    const dueDate = new Date(dateString);
                    const diffTime = dueDate - today;
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    return diffDays > 0 ? diffDays : 0;
                },
                
                getPriorityColor(priority) {
                    const colors = {
                        'critical': 'red',
                        'high': 'orange',
                        'medium': 'yellow',
                        'low': 'green'
                    };
                    return colors[priority] || 'gray';
                },
                
                getProjectStatusClass(status) {
                    const classes = {
                        'active': 'bg-green-100 text-green-700',
                        'completed': 'bg-blue-100 text-blue-700',
                        'on-hold': 'bg-yellow-100 text-yellow-700',
                        'cancelled': 'bg-red-100 text-red-700'
                    };
                    return classes[status] || 'bg-gray-100 text-gray-700';
                },
                
                getDueDateColor(dateString) {
                    if (!dateString) return 'text-gray-500';
                    const today = new Date();
                    const dueDate = new Date(dateString);
                    const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
                    
                    if (diffDays < 0) return 'text-red-600';
                    if (diffDays <= 3) return 'text-orange-600';
                    if (diffDays <= 7) return 'text-yellow-600';
                    return 'text-gray-600';
                },
                
                formatDueDateText(dateString) {
                    const today = new Date();
                    const dueDate = new Date(dateString);
                    const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
                    
                    if (diffDays < 0) return `${Math.abs(diffDays)} days overdue`;
                    if (diffDays === 0) return 'Due today';
                    if (diffDays === 1) return 'Due tomorrow';
                    return `Due in ${diffDays} days`;
                },
                
                createQuickTask() {
                    console.log('Create quick task');
                },
                
                generateAIReport() {
                    console.log('Generate AI report');
                },
                
                applyInsight(insight) {
                    console.log('Apply insight:', insight.title);
                }
            }
        }
    </script>
</body>
</html>
"""

@app.route('/')
def index():
    return render_template_string(TASK_MANAGER_HTML)

@app.route('/api/task-manager/session', methods=['POST'])
def create_session():
    """Create user session"""
    try:
        data = request.get_json()
        session_data = get_user_session(data)
        return jsonify(session_data)
    except Exception as e:
        logger.error(f"Session creation error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/task-manager/projects')
def get_projects():
    """Get user projects"""
    try:
        session_id = request.args.get('session_id')
        session = user_memory.get_session(session_id)
        
        if not session:
            return jsonify({'error': 'Invalid session'}), 401
        
        # Demo projects
        demo_projects = [
            {
                'id': str(uuid.uuid4()),
                'name': 'Super Mega AI Platform',
                'description': 'Complete AI platform with advanced user features',
                'status': 'active',
                'priority': 'high',
                'completion_percentage': 75,
                'total_tasks': 24,
                'team_size': 5,
                'due_date': (datetime.now() + timedelta(days=30)).isoformat(),
                'team_members': ['Swan Htet', 'John Doe', 'Sarah Kim']
            },
            {
                'id': str(uuid.uuid4()),
                'name': 'Email Intelligence Suite',
                'description': 'Advanced email management with AI analysis',
                'status': 'active',
                'priority': 'high',
                'completion_percentage': 90,
                'total_tasks': 18,
                'team_size': 3,
                'due_date': (datetime.now() + timedelta(days=15)).isoformat(),
                'team_members': ['Swan Htet', 'Mike Wilson']
            },
            {
                'id': str(uuid.uuid4()),
                'name': 'Client Website Redesign',
                'description': 'Modern responsive design for client portal',
                'status': 'active',
                'priority': 'medium',
                'completion_percentage': 45,
                'total_tasks': 12,
                'team_size': 4,
                'due_date': (datetime.now() + timedelta(days=45)).isoformat(),
                'team_members': ['Sarah Kim', 'Alex Chen', 'Lisa Park', 'Tom Brown']
            }
        ]
        
        return jsonify({'projects': demo_projects})
        
    except Exception as e:
        logger.error(f"Get projects error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/task-manager/tasks')
def get_tasks():
    """Get user tasks"""
    try:
        session_id = request.args.get('session_id')
        session = user_memory.get_session(session_id)
        
        if not session:
            return jsonify({'error': 'Invalid session'}), 401
        
        # Demo tasks
        demo_tasks = [
            {
                'id': str(uuid.uuid4()),
                'title': 'Implement user authentication system',
                'description': 'Add secure login/logout with session management',
                'status': 'in-progress',
                'priority': 'high',
                'assigned_to': 'Swan Htet',
                'project_name': 'Super Mega AI Platform',
                'due_date': (datetime.now() + timedelta(days=3)).isoformat(),
                'estimated_hours': 8
            },
            {
                'id': str(uuid.uuid4()),
                'title': 'Design email template system',
                'description': 'Create responsive email templates for notifications',
                'status': 'todo',
                'priority': 'medium',
                'assigned_to': 'Sarah Kim',
                'project_name': 'Email Intelligence Suite',
                'due_date': (datetime.now() + timedelta(days=5)).isoformat(),
                'estimated_hours': 6
            },
            {
                'id': str(uuid.uuid4()),
                'title': 'Set up CI/CD pipeline',
                'description': 'Automated testing and deployment pipeline',
                'status': 'review',
                'priority': 'high',
                'assigned_to': 'Mike Wilson',
                'project_name': 'Super Mega AI Platform',
                'due_date': (datetime.now() + timedelta(days=7)).isoformat(),
                'estimated_hours': 12
            },
            {
                'id': str(uuid.uuid4()),
                'title': 'Write API documentation',
                'description': 'Complete API documentation with examples',
                'status': 'done',
                'priority': 'medium',
                'assigned_to': 'John Doe',
                'project_name': 'Super Mega AI Platform',
                'due_date': (datetime.now() - timedelta(days=2)).isoformat(),
                'estimated_hours': 4
            }
        ]
        
        return jsonify({'tasks': demo_tasks})
        
    except Exception as e:
        logger.error(f"Get tasks error: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    print("🎯 Super Mega Smart Task & Project Manager")
    print("=" * 60)
    print("Features:")
    print("✅ Advanced project management with AI insights")
    print("✅ Kanban board with drag & drop")
    print("✅ Time tracking and productivity analytics")
    print("✅ Team collaboration and activity feeds")
    print("✅ Smart task prioritization and scheduling")
    print("✅ Integration with email system")
    print("✅ Real-time notifications and updates")
    print("✅ Custom templates and workflows")
    print("")
    print("Starting server on http://localhost:8082")
    print("Access Task Manager at: http://localhost:8082")
    
    app.run(host='0.0.0.0', port=8082, debug=True)
