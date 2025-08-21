#!/usr/bin/env python3
"""
AI WORK OS - SUITE LAUNCHER
Central hub for managing all three professional suites
Coordinates Creative, Data, and Manager suites
"""

import os
import sys
import json
import logging
import subprocess
import time
import requests
from datetime import datetime
from flask import Flask, jsonify, request, render_template_string
from flask_cors import CORS
import threading

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

class SuiteLauncher:
    """Central launcher for all professional suites"""
    
    def __init__(self):
        self.version = "1.0"
        self.name = "AI Work OS Suite Launcher"
        self.suites = {
            'creative': {
                'name': 'Creative Suite',
                'description': 'Content creation, design, marketing, social media',
                'port': 5001,
                'script': 'creative_suite.py',
                'status': 'stopped',
                'process': None,
                'color': 'purple',
                'icon': 'palette'
            },
            'data': {
                'name': 'Data Suite', 
                'description': 'Analytics, insights, reporting, ML models',
                'port': 5002,
                'script': 'data_suite.py',
                'status': 'stopped',
                'process': None,
                'color': 'blue',
                'icon': 'chart-line'
            },
            'manager': {
                'name': 'Manager Suite',
                'description': 'Project management, team coordination, strategy',
                'port': 5003,
                'script': 'manager_suite.py', 
                'status': 'stopped',
                'process': None,
                'color': 'indigo',
                'icon': 'users-cog'
            }
        }
        
        logger.info(f"🚀 {self.name} v{self.version} initialized")
    
    def start_suite(self, suite_id):
        """Start a specific suite"""
        if suite_id not in self.suites:
            return False, f"Suite '{suite_id}' not found"
        
        suite = self.suites[suite_id]
        
        if suite['status'] == 'running':
            return True, f"{suite['name']} is already running"
        
        try:
            # Start the suite process
            script_path = os.path.join(os.getcwd(), suite['script'])
            if not os.path.exists(script_path):
                return False, f"Suite script not found: {script_path}"
            
            suite['process'] = subprocess.Popen(
                [sys.executable, script_path],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            
            # Wait a moment for startup
            time.sleep(3)
            
            # Check if suite is responding
            if self.check_suite_health(suite_id):
                suite['status'] = 'running'
                return True, f"{suite['name']} started successfully"
            else:
                suite['status'] = 'error'
                return False, f"Failed to start {suite['name']}"
                
        except Exception as e:
            suite['status'] = 'error'
            return False, f"Error starting {suite['name']}: {str(e)}"
    
    def stop_suite(self, suite_id):
        """Stop a specific suite"""
        if suite_id not in self.suites:
            return False, f"Suite '{suite_id}' not found"
        
        suite = self.suites[suite_id]
        
        if suite['status'] == 'stopped':
            return True, f"{suite['name']} is already stopped"
        
        try:
            if suite['process']:
                suite['process'].terminate()
                suite['process'].wait(timeout=10)
                suite['process'] = None
            
            suite['status'] = 'stopped'
            return True, f"{suite['name']} stopped successfully"
            
        except Exception as e:
            return False, f"Error stopping {suite['name']}: {str(e)}"
    
    def check_suite_health(self, suite_id):
        """Check if a suite is responding"""
        if suite_id not in self.suites:
            return False
        
        suite = self.suites[suite_id]
        try:
            response = requests.get(f"http://localhost:{suite['port']}/health", timeout=5)
            return response.status_code == 200
        except:
            return False
    
    def get_suite_status(self, suite_id):
        """Get detailed status of a suite"""
        if suite_id not in self.suites:
            return None
        
        suite = self.suites[suite_id]
        health = self.check_suite_health(suite_id)
        
        return {
            'id': suite_id,
            'name': suite['name'],
            'description': suite['description'],
            'port': suite['port'],
            'status': 'running' if health else ('stopped' if suite['status'] == 'stopped' else 'error'),
            'url': f"http://localhost:{suite['port']}",
            'healthy': health,
            'color': suite['color'],
            'icon': suite['icon']
        }
    
    def start_all_suites(self):
        """Start all suites"""
        results = {}
        for suite_id in self.suites.keys():
            success, message = self.start_suite(suite_id)
            results[suite_id] = {'success': success, 'message': message}
        return results
    
    def stop_all_suites(self):
        """Stop all suites"""
        results = {}
        for suite_id in self.suites.keys():
            success, message = self.stop_suite(suite_id)
            results[suite_id] = {'success': success, 'message': message}
        return results

# Initialize the Suite Launcher
launcher = SuiteLauncher()

# Web interface for Suite Launcher
LAUNCHER_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Work OS - Professional Suite Launcher</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js" defer></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <style>
        .gradient-bg { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
        .suite-card { transition: all 0.3s ease; }
        .suite-card:hover { transform: translateY(-4px); box-shadow: 0 10px 25px rgba(0,0,0,0.15); }
        .pulse-dot { animation: pulse 2s infinite; }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
    </style>
</head>
<body class="bg-gray-100 min-h-screen" x-data="suiteLauncher()">
    
    <!-- Header -->
    <header class="gradient-bg text-white shadow-xl">
        <div class="max-w-7xl mx-auto px-4 py-6">
            <div class="flex items-center justify-between">
                <div class="flex items-center">
                    <i class="fas fa-rocket text-3xl mr-3"></i>
                    <div>
                        <h1 class="text-3xl font-bold">AI Work OS</h1>
                        <p class="text-indigo-200">Professional Suite Launcher</p>
                    </div>
                </div>
                <div class="flex items-center space-x-4">
                    <div class="text-right">
                        <p class="text-sm text-indigo-200">Contact</p>
                        <p class="font-semibold">swanhtet@supermega.dev</p>
                    </div>
                    <div class="w-12 h-12 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                        <i class="fas fa-user text-xl"></i>
                    </div>
                </div>
            </div>
        </div>
    </header>

    <!-- Control Panel -->
    <div class="bg-white shadow-sm border-b">
        <div class="max-w-7xl mx-auto px-4 py-4">
            <div class="flex flex-wrap items-center justify-between gap-4">
                <div class="flex items-center space-x-4">
                    <button @click="startAllSuites()" 
                            class="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors">
                        <i class="fas fa-play mr-2"></i>Start All Suites
                    </button>
                    <button @click="stopAllSuites()" 
                            class="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700 transition-colors">
                        <i class="fas fa-stop mr-2"></i>Stop All Suites
                    </button>
                    <button @click="refreshStatus()" 
                            class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                        <i class="fas fa-sync mr-2"></i>Refresh Status
                    </button>
                </div>
                <div class="flex items-center space-x-2">
                    <div class="flex items-center">
                        <div class="w-3 h-3 rounded-full mr-2"
                             :class="systemStatus === 'healthy' ? 'bg-green-500 pulse-dot' : 'bg-red-500'"></div>
                        <span class="text-sm font-medium" x-text="systemStatus"></span>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Main Dashboard -->
    <div class="max-w-7xl mx-auto px-4 py-8">
        
        <!-- System Overview -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div class="bg-white rounded-xl p-6 shadow-sm">
                <div class="flex items-center">
                    <div class="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                        <i class="fas fa-server text-green-600 text-xl"></i>
                    </div>
                    <div class="ml-4">
                        <p class="text-sm text-gray-600">Running Suites</p>
                        <p class="text-2xl font-bold text-gray-900" x-text="stats.running"></p>
                    </div>
                </div>
            </div>
            <div class="bg-white rounded-xl p-6 shadow-sm">
                <div class="flex items-center">
                    <div class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                        <i class="fas fa-tools text-blue-600 text-xl"></i>
                    </div>
                    <div class="ml-4">
                        <p class="text-sm text-gray-600">Total Tools</p>
                        <p class="text-2xl font-bold text-gray-900" x-text="stats.totalTools"></p>
                    </div>
                </div>
            </div>
            <div class="bg-white rounded-xl p-6 shadow-sm">
                <div class="flex items-center">
                    <div class="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                        <i class="fas fa-clock text-purple-600 text-xl"></i>
                    </div>
                    <div class="ml-4">
                        <p class="text-sm text-gray-600">Uptime</p>
                        <p class="text-2xl font-bold text-gray-900" x-text="stats.uptime"></p>
                    </div>
                </div>
            </div>
        </div>

        <!-- Professional Suites -->
        <div class="mb-8">
            <h2 class="text-2xl font-bold text-gray-900 mb-6">Professional Work Suites</h2>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                <!-- Creative Suite -->
                <div class="suite-card bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                    <div class="flex items-center justify-between mb-4">
                        <div class="flex items-center">
                            <div class="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center">
                                <i class="fas fa-palette text-white text-xl"></i>
                            </div>
                            <div class="ml-4">
                                <h3 class="text-lg font-bold text-gray-900">Creative Suite</h3>
                                <p class="text-gray-600 text-sm">Content & Design Tools</p>
                            </div>
                        </div>
                        <div class="flex items-center">
                            <div class="w-3 h-3 rounded-full mr-2"
                                 :class="suites.creative?.status === 'running' ? 'bg-green-500 pulse-dot' : 'bg-gray-400'"></div>
                            <span class="text-xs font-medium" x-text="suites.creative?.status || 'stopped'"></span>
                        </div>
                    </div>
                    
                    <p class="text-gray-600 mb-4">Professional tools for content creation, graphic design, social media management, and brand strategy.</p>
                    
                    <div class="space-y-2 mb-4">
                        <div class="flex items-center text-sm text-gray-600">
                            <i class="fas fa-check text-green-500 mr-2 text-xs"></i>
                            <span>AI Content Writer</span>
                        </div>
                        <div class="flex items-center text-sm text-gray-600">
                            <i class="fas fa-check text-green-500 mr-2 text-xs"></i>
                            <span>Social Media Manager</span>
                        </div>
                        <div class="flex items-center text-sm text-gray-600">
                            <i class="fas fa-check text-green-500 mr-2 text-xs"></i>
                            <span>Graphic Designer AI</span>
                        </div>
                        <div class="flex items-center text-sm text-gray-600">
                            <i class="fas fa-check text-green-500 mr-2 text-xs"></i>
                            <span>Brand Strategy Tools</span>
                        </div>
                    </div>
                    
                    <div class="flex space-x-2">
                        <button @click="toggleSuite('creative')" 
                                :class="suites.creative?.status === 'running' ? 'bg-red-600 hover:bg-red-700' : 'bg-purple-600 hover:bg-purple-700'"
                                class="flex-1 text-white py-2 rounded-lg transition-colors">
                            <i :class="suites.creative?.status === 'running' ? 'fas fa-stop' : 'fas fa-play'" class="mr-2"></i>
                            <span x-text="suites.creative?.status === 'running' ? 'Stop' : 'Start'"></span>
                        </button>
                        <button @click="openSuite('creative')" 
                                :disabled="suites.creative?.status !== 'running'"
                                :class="suites.creative?.status === 'running' ? 'bg-gray-100 hover:bg-gray-200' : 'bg-gray-100 cursor-not-allowed'"
                                class="px-4 py-2 text-gray-700 rounded-lg transition-colors">
                            <i class="fas fa-external-link-alt"></i>
                        </button>
                    </div>
                </div>

                <!-- Data Suite -->
                <div class="suite-card bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                    <div class="flex items-center justify-between mb-4">
                        <div class="flex items-center">
                            <div class="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
                                <i class="fas fa-chart-line text-white text-xl"></i>
                            </div>
                            <div class="ml-4">
                                <h3 class="text-lg font-bold text-gray-900">Data Suite</h3>
                                <p class="text-gray-600 text-sm">Analytics & ML Tools</p>
                            </div>
                        </div>
                        <div class="flex items-center">
                            <div class="w-3 h-3 rounded-full mr-2"
                                 :class="suites.data?.status === 'running' ? 'bg-green-500 pulse-dot' : 'bg-gray-400'"></div>
                            <span class="text-xs font-medium" x-text="suites.data?.status || 'stopped'"></span>
                        </div>
                    </div>
                    
                    <p class="text-gray-600 mb-4">Advanced data analytics, machine learning models, reporting, and business intelligence tools.</p>
                    
                    <div class="space-y-2 mb-4">
                        <div class="flex items-center text-sm text-gray-600">
                            <i class="fas fa-check text-green-500 mr-2 text-xs"></i>
                            <span>Smart Data Analyzer</span>
                        </div>
                        <div class="flex items-center text-sm text-gray-600">
                            <i class="fas fa-check text-green-500 mr-2 text-xs"></i>
                            <span>ML Model Builder</span>
                        </div>
                        <div class="flex items-center text-sm text-gray-600">
                            <i class="fas fa-check text-green-500 mr-2 text-xs"></i>
                            <span>Report Generator</span>
                        </div>
                        <div class="flex items-center text-sm text-gray-600">
                            <i class="fas fa-check text-green-500 mr-2 text-xs"></i>
                            <span>Forecast Engine</span>
                        </div>
                    </div>
                    
                    <div class="flex space-x-2">
                        <button @click="toggleSuite('data')" 
                                :class="suites.data?.status === 'running' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'"
                                class="flex-1 text-white py-2 rounded-lg transition-colors">
                            <i :class="suites.data?.status === 'running' ? 'fas fa-stop' : 'fas fa-play'" class="mr-2"></i>
                            <span x-text="suites.data?.status === 'running' ? 'Stop' : 'Start'"></span>
                        </button>
                        <button @click="openSuite('data')" 
                                :disabled="suites.data?.status !== 'running'"
                                :class="suites.data?.status === 'running' ? 'bg-gray-100 hover:bg-gray-200' : 'bg-gray-100 cursor-not-allowed'"
                                class="px-4 py-2 text-gray-700 rounded-lg transition-colors">
                            <i class="fas fa-external-link-alt"></i>
                        </button>
                    </div>
                </div>

                <!-- Manager Suite -->
                <div class="suite-card bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                    <div class="flex items-center justify-between mb-4">
                        <div class="flex items-center">
                            <div class="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
                                <i class="fas fa-users-cog text-white text-xl"></i>
                            </div>
                            <div class="ml-4">
                                <h3 class="text-lg font-bold text-gray-900">Manager Suite</h3>
                                <p class="text-gray-600 text-sm">Management Tools</p>
                            </div>
                        </div>
                        <div class="flex items-center">
                            <div class="w-3 h-3 rounded-full mr-2"
                                 :class="suites.manager?.status === 'running' ? 'bg-green-500 pulse-dot' : 'bg-gray-400'"></div>
                            <span class="text-xs font-medium" x-text="suites.manager?.status || 'stopped'"></span>
                        </div>
                    </div>
                    
                    <p class="text-gray-600 mb-4">Comprehensive project management, team coordination, strategic planning, and operations tools.</p>
                    
                    <div class="space-y-2 mb-4">
                        <div class="flex items-center text-sm text-gray-600">
                            <i class="fas fa-check text-green-500 mr-2 text-xs"></i>
                            <span>AI Project Manager</span>
                        </div>
                        <div class="flex items-center text-sm text-gray-600">
                            <i class="fas fa-check text-green-500 mr-2 text-xs"></i>
                            <span>Team Coordinator</span>
                        </div>
                        <div class="flex items-center text-sm text-gray-600">
                            <i class="fas fa-check text-green-500 mr-2 text-xs"></i>
                            <span>Strategy Advisor</span>
                        </div>
                        <div class="flex items-center text-sm text-gray-600">
                            <i class="fas fa-check text-green-500 mr-2 text-xs"></i>
                            <span>Budget Controller</span>
                        </div>
                    </div>
                    
                    <div class="flex space-x-2">
                        <button @click="toggleSuite('manager')" 
                                :class="suites.manager?.status === 'running' ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'"
                                class="flex-1 text-white py-2 rounded-lg transition-colors">
                            <i :class="suites.manager?.status === 'running' ? 'fas fa-stop' : 'fas fa-play'" class="mr-2"></i>
                            <span x-text="suites.manager?.status === 'running' ? 'Stop' : 'Start'"></span>
                        </button>
                        <button @click="openSuite('manager')" 
                                :disabled="suites.manager?.status !== 'running'"
                                :class="suites.manager?.status === 'running' ? 'bg-gray-100 hover:bg-gray-200' : 'bg-gray-100 cursor-not-allowed'"
                                class="px-4 py-2 text-gray-700 rounded-lg transition-colors">
                            <i class="fas fa-external-link-alt"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- System Status -->
        <div class="bg-white rounded-xl p-6 shadow-sm">
            <h3 class="text-xl font-bold text-gray-900 mb-4">System Status</h3>
            <div class="space-y-3">
                <template x-for="(suite, id) in suites" :key="id">
                    <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div class="flex items-center">
                            <i :class="suite.status === 'running' ? 'fas fa-check-circle text-green-500' : 'fas fa-times-circle text-red-500'" class="mr-3"></i>
                            <span class="font-medium" x-text="suite.name"></span>
                            <span class="text-sm text-gray-600 ml-2" x-text="'(Port ' + suite.port + ')'"></span>
                        </div>
                        <div class="flex items-center space-x-3">
                            <span :class="suite.status === 'running' ? 'text-green-600' : 'text-red-600'" 
                                  class="text-sm font-medium capitalize" x-text="suite.status"></span>
                            <a :href="suite.url" target="_blank" 
                               :class="suite.status === 'running' ? '' : 'pointer-events-none opacity-50'"
                               class="text-blue-600 hover:text-blue-800">
                                <i class="fas fa-external-link-alt"></i>
                            </a>
                        </div>
                    </div>
                </template>
            </div>
        </div>
    </div>

    <script>
        function suiteLauncher() {
            return {
                suites: {},
                stats: {
                    running: 0,
                    totalTools: 18,
                    uptime: '0h 0m'
                },
                systemStatus: 'checking',
                startTime: Date.now(),

                async init() {
                    await this.refreshStatus();
                    this.updateUptime();
                    setInterval(() => {
                        this.refreshStatus();
                        this.updateUptime();
                    }, 10000);
                },

                async refreshStatus() {
                    try {
                        const response = await fetch('/api/status');
                        const data = await response.json();
                        this.suites = data.suites;
                        this.stats.running = Object.values(this.suites).filter(s => s.status === 'running').length;
                        this.systemStatus = this.stats.running > 0 ? 'healthy' : 'idle';
                    } catch (error) {
                        console.error('Failed to refresh status:', error);
                        this.systemStatus = 'error';
                    }
                },

                async toggleSuite(suiteId) {
                    const suite = this.suites[suiteId];
                    const action = suite?.status === 'running' ? 'stop' : 'start';
                    
                    try {
                        const response = await fetch(`/api/suite/${suiteId}/${action}`, { method: 'POST' });
                        const result = await response.json();
                        
                        if (result.success) {
                            await this.refreshStatus();
                        } else {
                            alert(`Failed to ${action} ${suite?.name}: ${result.message}`);
                        }
                    } catch (error) {
                        console.error(`Failed to ${action} suite:`, error);
                        alert(`Error: ${error.message}`);
                    }
                },

                openSuite(suiteId) {
                    const suite = this.suites[suiteId];
                    if (suite?.status === 'running') {
                        window.open(suite.url, '_blank');
                    }
                },

                async startAllSuites() {
                    try {
                        const response = await fetch('/api/start-all', { method: 'POST' });
                        const result = await response.json();
                        await this.refreshStatus();
                    } catch (error) {
                        console.error('Failed to start all suites:', error);
                    }
                },

                async stopAllSuites() {
                    try {
                        const response = await fetch('/api/stop-all', { method: 'POST' });
                        const result = await response.json();
                        await this.refreshStatus();
                    } catch (error) {
                        console.error('Failed to stop all suites:', error);
                    }
                },

                updateUptime() {
                    const uptime = Date.now() - this.startTime;
                    const hours = Math.floor(uptime / (1000 * 60 * 60));
                    const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
                    this.stats.uptime = `${hours}h ${minutes}m`;
                }
            }
        }
    </script>
</body>
</html>
"""

@app.route('/')
def main_launcher():
    """Suite Launcher main interface"""
    return render_template_string(LAUNCHER_HTML)

@app.route('/api/status')
def get_status():
    """Get status of all suites"""
    suite_statuses = {}
    for suite_id in launcher.suites.keys():
        suite_statuses[suite_id] = launcher.get_suite_status(suite_id)
    
    return jsonify({
        'suites': suite_statuses,
        'system': {
            'version': launcher.version,
            'running_count': sum(1 for s in suite_statuses.values() if s['status'] == 'running'),
            'total_suites': len(suite_statuses)
        }
    })

@app.route('/api/suite/<suite_id>/start', methods=['POST'])
def start_suite(suite_id):
    """Start a specific suite"""
    success, message = launcher.start_suite(suite_id)
    return jsonify({
        'success': success,
        'message': message,
        'suite_id': suite_id,
        'timestamp': datetime.now().isoformat()
    })

@app.route('/api/suite/<suite_id>/stop', methods=['POST'])
def stop_suite(suite_id):
    """Stop a specific suite"""
    success, message = launcher.stop_suite(suite_id)
    return jsonify({
        'success': success,
        'message': message,
        'suite_id': suite_id,
        'timestamp': datetime.now().isoformat()
    })

@app.route('/api/start-all', methods=['POST'])
def start_all():
    """Start all suites"""
    results = launcher.start_all_suites()
    return jsonify({
        'success': True,
        'results': results,
        'timestamp': datetime.now().isoformat()
    })

@app.route('/api/stop-all', methods=['POST'])
def stop_all():
    """Stop all suites"""
    results = launcher.stop_all_suites()
    return jsonify({
        'success': True,
        'results': results,
        'timestamp': datetime.now().isoformat()
    })

@app.route('/health')
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'name': launcher.name,
        'version': launcher.version,
        'timestamp': datetime.now().isoformat()
    })

if __name__ == '__main__':
    print("🚀 AI WORK OS SUITE LAUNCHER - Starting...")
    print("=" * 60)
    print(f"System: {launcher.name} v{launcher.version}")
    print("Available Suites:")
    for suite_id, suite in launcher.suites.items():
        print(f"  • {suite['name']} - Port {suite['port']} - {suite['description']}")
    print("=" * 60)
    print("🌐 Suite Launcher available at: http://localhost:5000")
    print("🎯 Main Dashboard: http://localhost:5000")
    print("🔍 Health Check: http://localhost:5000/health")
    print("=" * 60)
    print("\n✨ Launch individual suites from the web interface")
    print("   or use the API endpoints to control them programmatically")
    print("\n📧 Contact: swanhtet@supermega.dev")
    print("=" * 60)
    
    app.run(host='0.0.0.0', port=5000, debug=False)
