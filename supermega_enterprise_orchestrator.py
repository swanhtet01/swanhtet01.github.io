#!/usr/bin/env python3
"""
SuperMega Enterprise Application Suite
Complete business automation platform with advanced AI capabilities
Orchestrates: Email Analytics, Browser Automation, File Analysis, and more
"""

import os
import sys
import json
import time
import sqlite3
import threading
import multiprocessing
import subprocess
from datetime import datetime, timedelta
from flask import Flask, render_template, request, jsonify, session
from flask_cors import CORS
import psutil
import requests
from typing import Dict, List, Any, Optional
import logging

# Import our enhanced applications
sys.path.append('applications')

class SuperMegaEnterpriseOrchestrator:
    """Main orchestrator for all SuperMega applications"""
    
    def __init__(self):
        self.app = Flask(__name__, template_folder='templates', static_folder='static')
        self.app.secret_key = 'supermega_enterprise_2025'
        CORS(self.app)
        
        # Application services
        self.services = {
            'email_analytics': {
                'port': 5001,
                'status': 'stopped',
                'process': None,
                'health_url': 'http://localhost:5001/health',
                'description': 'Advanced Email Analytics Platform (Gmail/Outlook Replacement)'
            },
            'browser_automation': {
                'port': 5002,
                'status': 'stopped',
                'process': None,
                'health_url': 'http://localhost:5002/health',
                'description': 'Browser Automation with Visual Progress Tracking'
            },
            'file_analysis': {
                'port': 5003,
                'status': 'stopped',
                'process': None,
                'health_url': 'http://localhost:5003/health',
                'description': 'Advanced File Analysis & Processing Platform'
            },
            'main_production': {
                'port': 5000,
                'status': 'running',
                'process': None,
                'health_url': 'http://localhost:5000/health',
                'description': 'Main SuperMega Production System'
            }
        }
        
        self.database_path = 'supermega_orchestrator.db'
        self.init_database()
        self.setup_routes()
        
        # Performance monitoring
        self.system_metrics = {}
        self.service_metrics = {}
        
        # Start monitoring thread
        self.monitoring_thread = threading.Thread(target=self._monitor_services, daemon=True)
        self.monitoring_thread.start()
    
    def init_database(self):
        """Initialize orchestrator database"""
        conn = sqlite3.connect(self.database_path)
        cursor = conn.cursor()
        
        # Service status table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS service_status (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                service_name TEXT NOT NULL,
                status TEXT NOT NULL,
                port INTEGER,
                start_time TIMESTAMP,
                last_health_check TIMESTAMP,
                uptime_seconds INTEGER,
                restart_count INTEGER DEFAULT 0
            )
        ''')
        
        # System metrics table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS system_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TIMESTAMP,
                cpu_usage REAL,
                memory_usage REAL,
                disk_usage REAL,
                active_services INTEGER,
                total_requests INTEGER
            )
        ''')
        
        # Usage analytics table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS usage_analytics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date DATE,
                service_name TEXT,
                requests_count INTEGER,
                avg_response_time REAL,
                success_rate REAL,
                data_processed INTEGER
            )
        ''')
        
        conn.commit()
        conn.close()
    
    def start_service(self, service_name: str) -> Dict[str, Any]:
        """Start a specific service"""
        
        if service_name not in self.services:
            return {'success': False, 'error': f'Unknown service: {service_name}'}
        
        service = self.services[service_name]
        
        if service['status'] == 'running':
            return {'success': False, 'error': f'Service {service_name} is already running'}
        
        try:
            # Determine script path
            script_path = f"applications/supermega_{service_name.replace('_', '_')}.py"
            
            if service_name == 'main_production':
                script_path = 'supermega_production.py'
            
            # Start the service process
            process = subprocess.Popen([
                sys.executable, script_path
            ], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            
            # Update service info
            service['process'] = process
            service['status'] = 'starting'
            
            # Wait a moment and check if it started successfully
            time.sleep(3)
            
            if self._check_service_health(service_name):
                service['status'] = 'running'
                
                # Update database
                self._update_service_status(service_name, 'running', service['port'])
                
                return {
                    'success': True,
                    'message': f'Service {service_name} started successfully',
                    'port': service['port'],
                    'description': service['description']
                }
            else:
                service['status'] = 'error'
                return {'success': False, 'error': f'Service {service_name} failed to start properly'}
            
        except Exception as e:
            service['status'] = 'error'
            return {'success': False, 'error': f'Failed to start {service_name}: {str(e)}'}
    
    def stop_service(self, service_name: str) -> Dict[str, Any]:
        """Stop a specific service"""
        
        if service_name not in self.services:
            return {'success': False, 'error': f'Unknown service: {service_name}'}
        
        service = self.services[service_name]
        
        if service['status'] != 'running':
            return {'success': False, 'error': f'Service {service_name} is not running'}
        
        try:
            if service['process']:
                service['process'].terminate()
                service['process'].wait(timeout=10)
            
            service['status'] = 'stopped'
            service['process'] = None
            
            # Update database
            self._update_service_status(service_name, 'stopped', service['port'])
            
            return {
                'success': True,
                'message': f'Service {service_name} stopped successfully'
            }
            
        except Exception as e:
            return {'success': False, 'error': f'Failed to stop {service_name}: {str(e)}'}
    
    def restart_service(self, service_name: str) -> Dict[str, Any]:
        """Restart a specific service"""
        
        # Stop the service first
        stop_result = self.stop_service(service_name)
        if not stop_result['success'] and 'not running' not in stop_result['error']:
            return stop_result
        
        # Wait a moment
        time.sleep(2)
        
        # Start the service
        return self.start_service(service_name)
    
    def start_all_services(self) -> Dict[str, Any]:
        """Start all available services"""
        
        results = {}
        
        for service_name in self.services:
            if service_name != 'main_production':  # Skip main production as it's already running
                result = self.start_service(service_name)
                results[service_name] = result
                
                # Brief delay between service starts
                time.sleep(2)
        
        successful = sum(1 for r in results.values() if r['success'])
        total = len(results)
        
        return {
            'success': successful == total,
            'message': f'Started {successful}/{total} services successfully',
            'results': results
        }
    
    def _check_service_health(self, service_name: str) -> bool:
        """Check if a service is healthy"""
        service = self.services[service_name]
        health_url = service['health_url']
        
        try:
            response = requests.get(health_url, timeout=5)
            return response.status_code == 200
        except:
            return False
    
    def _monitor_services(self):
        """Background monitoring of all services"""
        while True:
            try:
                # Check service health
                for service_name, service in self.services.items():
                    if service['status'] == 'running':
                        is_healthy = self._check_service_health(service_name)
                        if not is_healthy:
                            service['status'] = 'unhealthy'
                            # Auto-restart unhealthy services
                            self.restart_service(service_name)
                
                # Collect system metrics
                self.system_metrics = {
                    'timestamp': datetime.now().isoformat(),
                    'cpu_usage': psutil.cpu_percent(interval=1),
                    'memory_usage': psutil.virtual_memory().percent,
                    'disk_usage': psutil.disk_usage('/').percent,
                    'active_services': len([s for s in self.services.values() if s['status'] == 'running']),
                    'network_connections': len(psutil.net_connections())
                }
                
                # Store metrics in database
                self._store_system_metrics()
                
                # Wait before next check
                time.sleep(30)
                
            except Exception as e:
                print(f"Monitoring error: {e}")
                time.sleep(60)
    
    def _update_service_status(self, service_name: str, status: str, port: int):
        """Update service status in database"""
        try:
            conn = sqlite3.connect(self.database_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT OR REPLACE INTO service_status 
                (service_name, status, port, start_time, last_health_check)
                VALUES (?, ?, ?, ?, ?)
            ''', (service_name, status, port, datetime.now(), datetime.now()))
            
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"Database update error: {e}")
    
    def _store_system_metrics(self):
        """Store system metrics in database"""
        try:
            conn = sqlite3.connect(self.database_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT INTO system_metrics 
                (timestamp, cpu_usage, memory_usage, disk_usage, active_services)
                VALUES (?, ?, ?, ?, ?)
            ''', (datetime.now(), self.system_metrics['cpu_usage'],
                  self.system_metrics['memory_usage'], self.system_metrics['disk_usage'],
                  self.system_metrics['active_services']))
            
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"Metrics storage error: {e}")
    
    def get_dashboard_data(self) -> Dict[str, Any]:
        """Get comprehensive dashboard data"""
        
        # Service status summary
        service_summary = {}
        for service_name, service in self.services.items():
            service_summary[service_name] = {
                'status': service['status'],
                'port': service['port'],
                'description': service['description'],
                'healthy': self._check_service_health(service_name) if service['status'] == 'running' else False
            }
        
        # Recent metrics
        conn = sqlite3.connect(self.database_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT * FROM system_metrics 
            ORDER BY timestamp DESC LIMIT 10
        ''')
        recent_metrics = cursor.fetchall()
        
        conn.close()
        
        return {
            'services': service_summary,
            'system_metrics': self.system_metrics,
            'recent_metrics': recent_metrics,
            'total_services': len(self.services),
            'running_services': len([s for s in self.services.values() if s['status'] == 'running']),
            'last_updated': datetime.now().isoformat()
        }
    
    def setup_routes(self):
        """Setup Flask routes for orchestrator"""
        
        @self.app.route('/')
        def dashboard():
            return render_template('orchestrator_dashboard.html')
        
        @self.app.route('/api/services')
        def list_services():
            return jsonify(self.get_dashboard_data())
        
        @self.app.route('/api/service/<service_name>/start', methods=['POST'])
        def start_service_endpoint(service_name):
            result = self.start_service(service_name)
            return jsonify(result)
        
        @self.app.route('/api/service/<service_name>/stop', methods=['POST'])
        def stop_service_endpoint(service_name):
            result = self.stop_service(service_name)
            return jsonify(result)
        
        @self.app.route('/api/service/<service_name>/restart', methods=['POST'])
        def restart_service_endpoint(service_name):
            result = self.restart_service(service_name)
            return jsonify(result)
        
        @self.app.route('/api/services/start-all', methods=['POST'])
        def start_all_services_endpoint():
            result = self.start_all_services()
            return jsonify(result)
        
        @self.app.route('/api/system-metrics')
        def get_system_metrics():
            return jsonify(self.system_metrics)
        
        @self.app.route('/api/service/<service_name>/proxy/<path:path>')
        def service_proxy(service_name, path):
            """Proxy requests to individual services"""
            if service_name not in self.services:
                return jsonify({'error': 'Service not found'}), 404
            
            service = self.services[service_name]
            if service['status'] != 'running':
                return jsonify({'error': 'Service not running'}), 503
            
            # Forward request to service
            target_url = f"http://localhost:{service['port']}/{path}"
            try:
                if request.method == 'GET':
                    response = requests.get(target_url, params=request.args)
                elif request.method == 'POST':
                    response = requests.post(target_url, json=request.json)
                else:
                    return jsonify({'error': 'Method not supported'}), 405
                
                return jsonify(response.json()), response.status_code
            except Exception as e:
                return jsonify({'error': f'Proxy error: {str(e)}'}), 502
        
        @self.app.route('/health')
        def health():
            return jsonify({
                'status': 'healthy',
                'service': 'SuperMega Enterprise Orchestrator',
                'version': '2.0.0',
                'services': {name: service['status'] for name, service in self.services.items()},
                'timestamp': datetime.now().isoformat()
            })
    
    def run_orchestrator(self, host='0.0.0.0', port=5010):
        """Run the orchestrator server"""
        print("🚀 SuperMega Enterprise Orchestrator Starting...")
        print("🎯 Advanced Application Suite Manager")
        print("⚡ Service Health Monitoring & Auto-Recovery")
        print("📊 Real-time System Metrics")
        print(f"🌐 Orchestrator: http://{host}:{port}")
        print("\n📋 Available Services:")
        
        for service_name, service in self.services.items():
            print(f"  • {service_name}: {service['description']} (Port {service['port']})")
        
        print("\n🔧 Management Commands:")
        print("  • Start All: POST /api/services/start-all")
        print("  • Service Control: /api/service/{name}/{start|stop|restart}")
        print("  • Service Proxy: /api/service/{name}/proxy/{path}")
        print("  • System Health: /health")
        
        self.app.run(host=host, port=port, debug=False, threaded=True)

def main():
    """Main entry point"""
    orchestrator = SuperMegaEnterpriseOrchestrator()
    orchestrator.run_orchestrator()

if __name__ == "__main__":
    main()
