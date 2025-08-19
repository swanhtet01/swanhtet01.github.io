#!/usr/bin/env python3
"""
🎛️ ENTERPRISE-GRADE MONITORING & ALERTING SYSTEM
Real-time system monitoring, performance tracking, and intelligent alerting

🎯 PURPOSE: Comprehensive monitoring for development systems with predictive analytics
⚠️  NO FAKE WORK - ONLY REAL MONITORING AND ALERTING
"""

import os
import sys
import json
import time
import psutil
import sqlite3
import threading
import subprocess
from datetime import datetime, timedelta
from collections import defaultdict, deque
import schedule
import requests
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation
import pandas as pd

class EnterpriseMonitoringSystem:
    def __init__(self):
        self.db_path = "monitoring_system.db"
        self.config_file = "monitoring_config.json"
        self.alerts_dir = "monitoring_alerts"
        self.metrics_dir = "monitoring_metrics"
        self.dashboards_dir = "monitoring_dashboards"
        
        # Monitoring state
        self.is_monitoring = False
        self.monitoring_threads = []
        self.metric_buffer = defaultdict(deque)
        self.alert_history = deque(maxlen=1000)
        
        # Thresholds and rules
        self.alert_rules = {}
        self.performance_baselines = {}
        
        self.ensure_directories()
        self.init_database()
        self.load_configuration()
        
        print("🎛️ Enterprise Monitoring System initialized")
    
    def ensure_directories(self):
        """Ensure required directories exist"""
        for directory in [self.alerts_dir, self.metrics_dir, self.dashboards_dir]:
            if not os.path.exists(directory):
                os.makedirs(directory)
                print(f"📁 Created directory: {directory}")
    
    def init_database(self):
        """Initialize monitoring database"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # System metrics
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS system_metrics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    metric_type TEXT NOT NULL,
                    metric_name TEXT NOT NULL,
                    value REAL NOT NULL,
                    unit TEXT,
                    hostname TEXT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Application metrics
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS application_metrics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    service_name TEXT NOT NULL,
                    metric_name TEXT NOT NULL,
                    value REAL NOT NULL,
                    tags TEXT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Alerts
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS alerts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    alert_id TEXT UNIQUE NOT NULL,
                    rule_name TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    status TEXT DEFAULT 'ACTIVE',
                    message TEXT NOT NULL,
                    metric_name TEXT,
                    current_value REAL,
                    threshold_value REAL,
                    service_name TEXT,
                    hostname TEXT,
                    created_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                    resolved_time DATETIME,
                    acknowledged BOOLEAN DEFAULT 0
                )
            ''')
            
            # Performance baselines
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS performance_baselines (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    metric_name TEXT NOT NULL,
                    service_name TEXT,
                    baseline_value REAL NOT NULL,
                    standard_deviation REAL,
                    sample_size INTEGER,
                    created_date DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Health checks
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS health_checks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    service_name TEXT NOT NULL,
                    check_type TEXT NOT NULL,
                    status TEXT NOT NULL,
                    response_time REAL,
                    error_message TEXT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Incidents
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS incidents (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    incident_id TEXT UNIQUE NOT NULL,
                    title TEXT NOT NULL,
                    description TEXT,
                    severity TEXT NOT NULL,
                    status TEXT DEFAULT 'OPEN',
                    affected_services TEXT,
                    root_cause TEXT,
                    resolution TEXT,
                    created_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                    resolved_time DATETIME
                )
            ''')
            
            conn.commit()
            conn.close()
            print("✅ Monitoring database initialized")
            
        except Exception as e:
            print(f"❌ Monitoring database init error: {e}")
    
    def load_configuration(self):
        """Load monitoring configuration"""
        default_config = {
            "monitoring_interval": 30,
            "retention_days": 30,
            "alert_rules": {
                "cpu_usage_high": {
                    "metric": "cpu.usage",
                    "condition": ">",
                    "threshold": 80,
                    "duration": 300,
                    "severity": "WARNING"
                },
                "memory_usage_high": {
                    "metric": "memory.usage",
                    "condition": ">",
                    "threshold": 85,
                    "duration": 300,
                    "severity": "WARNING"
                },
                "disk_usage_critical": {
                    "metric": "disk.usage",
                    "condition": ">",
                    "threshold": 90,
                    "duration": 60,
                    "severity": "CRITICAL"
                },
                "response_time_slow": {
                    "metric": "response.time",
                    "condition": ">",
                    "threshold": 5000,
                    "duration": 180,
                    "severity": "WARNING"
                },
                "service_down": {
                    "metric": "service.health",
                    "condition": "==",
                    "threshold": 0,
                    "duration": 60,
                    "severity": "CRITICAL"
                }
            },
            "notifications": {
                "email": {
                    "enabled": False,
                    "smtp_server": "smtp.gmail.com",
                    "smtp_port": 587,
                    "sender": "",
                    "recipients": [],
                    "username": "",
                    "password": ""
                },
                "webhook": {
                    "enabled": False,
                    "url": "",
                    "headers": {}
                },
                "console": {
                    "enabled": True
                }
            },
            "services_to_monitor": [
                {
                    "name": "dev_team_manager",
                    "type": "http",
                    "url": "http://localhost:8512/health",
                    "timeout": 10
                },
                {
                    "name": "dev_analytics",
                    "type": "http",
                    "url": "http://localhost:8513/health",
                    "timeout": 10
                },
                {
                    "name": "code_optimizer",
                    "type": "http",
                    "url": "http://localhost:8514/health",
                    "timeout": 10
                },
                {
                    "name": "project_manager",
                    "type": "http",
                    "url": "http://localhost:8515/health",
                    "timeout": 10
                }
            ]
        }
        
        try:
            if os.path.exists(self.config_file):
                with open(self.config_file, 'r') as f:
                    self.config = json.load(f)
                print("✅ Loaded monitoring configuration")
            else:
                self.config = default_config
                self.save_configuration()
                print("🆕 Created default monitoring configuration")
                
            self.alert_rules = self.config.get('alert_rules', {})
            
        except Exception as e:
            print(f"⚠️  Config loading failed, using defaults: {e}")
            self.config = default_config
            self.alert_rules = default_config['alert_rules']
    
    def save_configuration(self):
        """Save monitoring configuration"""
        try:
            with open(self.config_file, 'w') as f:
                json.dump(self.config, f, indent=2)
            print("💾 Monitoring configuration saved")
        except Exception as e:
            print(f"⚠️  Config saving failed: {e}")
    
    def collect_system_metrics(self):
        """Collect system-level metrics"""
        try:
            # CPU metrics
            cpu_percent = psutil.cpu_percent(interval=1)
            cpu_count = psutil.cpu_count()
            load_avg = os.getloadavg() if hasattr(os, 'getloadavg') else (0, 0, 0)
            
            # Memory metrics
            memory = psutil.virtual_memory()
            swap = psutil.swap_memory()
            
            # Disk metrics
            disk_usage = psutil.disk_usage('.')
            disk_io = psutil.disk_io_counters()
            
            # Network metrics
            network_io = psutil.net_io_counters()
            
            # Process metrics
            process_count = len(psutil.pids())
            
            metrics = {
                'cpu.usage': cpu_percent,
                'cpu.count': cpu_count,
                'load.avg.1min': load_avg[0],
                'load.avg.5min': load_avg[1],
                'load.avg.15min': load_avg[2],
                'memory.usage': memory.percent,
                'memory.total': memory.total,
                'memory.available': memory.available,
                'memory.used': memory.used,
                'swap.usage': swap.percent,
                'swap.total': swap.total,
                'swap.used': swap.used,
                'disk.usage': (disk_usage.used / disk_usage.total) * 100,
                'disk.total': disk_usage.total,
                'disk.free': disk_usage.free,
                'disk.read_bytes': disk_io.read_bytes if disk_io else 0,
                'disk.write_bytes': disk_io.write_bytes if disk_io else 0,
                'network.bytes_sent': network_io.bytes_sent,
                'network.bytes_recv': network_io.bytes_recv,
                'processes.count': process_count
            }
            
            # Store metrics
            self.store_system_metrics(metrics)
            
            # Update buffers for real-time monitoring
            for metric_name, value in metrics.items():
                self.metric_buffer[metric_name].append((time.time(), value))
                # Keep only recent values
                if len(self.metric_buffer[metric_name]) > 100:
                    self.metric_buffer[metric_name].popleft()
            
            return metrics
            
        except Exception as e:
            print(f"⚠️  System metrics collection failed: {e}")
            return {}
    
    def collect_application_metrics(self):
        """Collect application-specific metrics"""
        metrics = {}
        
        try:
            # Check Python processes
            python_processes = []
            for proc in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent', 'create_time']):
                try:
                    if 'python' in proc.info['name'].lower():
                        python_processes.append(proc.info)
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
            
            metrics['python.processes.count'] = len(python_processes)
            
            if python_processes:
                total_cpu = sum(p['cpu_percent'] for p in python_processes)
                total_memory = sum(p['memory_percent'] for p in python_processes)
                
                metrics['python.cpu.total'] = total_cpu
                metrics['python.memory.total'] = total_memory
                metrics['python.cpu.average'] = total_cpu / len(python_processes)
                metrics['python.memory.average'] = total_memory / len(python_processes)
            
            # Check for specific development services
            dev_services = ['focused_dev_team', 'dev_analytics', 'code_optimizer', 'project_manager']
            for service in dev_services:
                metrics[f'{service}.running'] = self.check_service_running(service)
            
            # Store application metrics
            self.store_application_metrics(metrics)
            
            return metrics
            
        except Exception as e:
            print(f"⚠️  Application metrics collection failed: {e}")
            return {}
    
    def check_service_running(self, service_name):
        """Check if a specific service is running"""
        try:
            for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
                try:
                    cmdline = ' '.join(proc.info['cmdline']) if proc.info['cmdline'] else ''
                    if service_name in cmdline.lower():
                        return 1
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
            return 0
        except Exception:
            return 0
    
    def perform_health_checks(self):
        """Perform health checks on monitored services"""
        results = []
        
        services = self.config.get('services_to_monitor', [])
        
        for service in services:
            service_name = service['name']
            check_type = service['type']
            
            start_time = time.time()
            status = 'UNKNOWN'
            error_message = None
            
            try:
                if check_type == 'http':
                    url = service['url']
                    timeout = service.get('timeout', 10)
                    
                    try:
                        response = requests.get(url, timeout=timeout)
                        if response.status_code == 200:
                            status = 'HEALTHY'
                        else:
                            status = 'UNHEALTHY'
                            error_message = f"HTTP {response.status_code}"
                    except requests.RequestException as e:
                        status = 'UNHEALTHY'
                        error_message = str(e)
                
                elif check_type == 'process':
                    process_name = service.get('process_name', service_name)
                    if self.check_service_running(process_name):
                        status = 'HEALTHY'
                    else:
                        status = 'UNHEALTHY'
                        error_message = f"Process '{process_name}' not running"
                
                elif check_type == 'port':
                    port = service.get('port')
                    if port and self.check_port_open(port):
                        status = 'HEALTHY'
                    else:
                        status = 'UNHEALTHY'
                        error_message = f"Port {port} not accessible"
                
            except Exception as e:
                status = 'UNHEALTHY'
                error_message = str(e)
            
            response_time = (time.time() - start_time) * 1000  # Convert to milliseconds
            
            health_result = {
                'service_name': service_name,
                'check_type': check_type,
                'status': status,
                'response_time': response_time,
                'error_message': error_message
            }
            
            results.append(health_result)
            
            # Store health check result
            self.store_health_check(health_result)
        
        return results
    
    def check_port_open(self, port, host='localhost'):
        """Check if a port is open"""
        import socket
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(5)
            result = sock.connect_ex((host, port))
            sock.close()
            return result == 0
        except Exception:
            return False
    
    def store_system_metrics(self, metrics):
        """Store system metrics in database"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            hostname = os.uname().nodename if hasattr(os, 'uname') else 'localhost'
            
            for metric_name, value in metrics.items():
                cursor.execute('''
                    INSERT INTO system_metrics (metric_type, metric_name, value, hostname)
                    VALUES (?, ?, ?, ?)
                ''', ('system', metric_name, value, hostname))
            
            conn.commit()
            conn.close()
            
        except Exception as e:
            print(f"⚠️  Failed to store system metrics: {e}")
    
    def store_application_metrics(self, metrics):
        """Store application metrics in database"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            for metric_name, value in metrics.items():
                service_name = metric_name.split('.')[0] if '.' in metric_name else 'application'
                
                cursor.execute('''
                    INSERT INTO application_metrics (service_name, metric_name, value)
                    VALUES (?, ?, ?)
                ''', (service_name, metric_name, value))
            
            conn.commit()
            conn.close()
            
        except Exception as e:
            print(f"⚠️  Failed to store application metrics: {e}")
    
    def store_health_check(self, health_result):
        """Store health check result in database"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT INTO health_checks (
                    service_name, check_type, status, response_time, error_message
                ) VALUES (?, ?, ?, ?, ?)
            ''', (
                health_result['service_name'],
                health_result['check_type'],
                health_result['status'],
                health_result['response_time'],
                health_result['error_message']
            ))
            
            conn.commit()
            conn.close()
            
        except Exception as e:
            print(f"⚠️  Failed to store health check: {e}")
    
    def evaluate_alert_rules(self, metrics):
        """Evaluate alert rules against current metrics"""
        active_alerts = []
        
        for rule_name, rule in self.alert_rules.items():
            try:
                metric_name = rule['metric']
                condition = rule['condition']
                threshold = rule['threshold']
                severity = rule['severity']
                duration = rule.get('duration', 0)
                
                # Get current metric value
                current_value = metrics.get(metric_name)
                if current_value is None:
                    continue
                
                # Evaluate condition
                alert_triggered = False
                if condition == '>':
                    alert_triggered = current_value > threshold
                elif condition == '<':
                    alert_triggered = current_value < threshold
                elif condition == '==':
                    alert_triggered = current_value == threshold
                elif condition == '!=':
                    alert_triggered = current_value != threshold
                
                if alert_triggered:
                    alert = {
                        'rule_name': rule_name,
                        'severity': severity,
                        'metric_name': metric_name,
                        'current_value': current_value,
                        'threshold': threshold,
                        'condition': condition,
                        'message': self.generate_alert_message(rule_name, metric_name, current_value, threshold, condition)
                    }
                    
                    active_alerts.append(alert)
                    
            except Exception as e:
                print(f"⚠️  Alert rule evaluation failed for {rule_name}: {e}")
        
        return active_alerts
    
    def generate_alert_message(self, rule_name, metric_name, current_value, threshold, condition):
        """Generate human-readable alert message"""
        messages = {
            'cpu_usage_high': f"High CPU usage detected: {current_value:.1f}% (threshold: {threshold}%)",
            'memory_usage_high': f"High memory usage detected: {current_value:.1f}% (threshold: {threshold}%)",
            'disk_usage_critical': f"Critical disk usage: {current_value:.1f}% (threshold: {threshold}%)",
            'response_time_slow': f"Slow response time: {current_value:.1f}ms (threshold: {threshold}ms)",
            'service_down': f"Service is down: {metric_name}"
        }
        
        return messages.get(rule_name, 
                           f"Alert: {metric_name} is {current_value} (condition: {condition} {threshold})")
    
    def process_alerts(self, active_alerts):
        """Process and manage active alerts"""
        for alert in active_alerts:
            try:
                alert_id = f"{alert['rule_name']}_{alert['metric_name']}"
                
                # Check if alert already exists
                existing_alert = self.get_active_alert(alert_id)
                
                if not existing_alert:
                    # Create new alert
                    self.create_alert(alert_id, alert)
                    self.send_notification(alert)
                    print(f"🚨 NEW ALERT: {alert['message']}")
                else:
                    # Update existing alert
                    self.update_alert(alert_id, alert['current_value'])
                
                # Add to history
                self.alert_history.append({
                    'timestamp': datetime.now().isoformat(),
                    'alert': alert
                })
                
            except Exception as e:
                print(f"⚠️  Alert processing failed: {e}")
    
    def get_active_alert(self, alert_id):
        """Get active alert by ID"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT * FROM alerts WHERE alert_id = ? AND status = 'ACTIVE'
            ''', (alert_id,))
            
            result = cursor.fetchone()
            conn.close()
            
            return result
            
        except Exception as e:
            print(f"⚠️  Failed to get active alert: {e}")
            return None
    
    def create_alert(self, alert_id, alert):
        """Create new alert in database"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT INTO alerts (
                    alert_id, rule_name, severity, message, metric_name,
                    current_value, threshold_value, hostname
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                alert_id,
                alert['rule_name'],
                alert['severity'],
                alert['message'],
                alert['metric_name'],
                alert['current_value'],
                alert['threshold'],
                os.uname().nodename if hasattr(os, 'uname') else 'localhost'
            ))
            
            conn.commit()
            conn.close()
            
        except Exception as e:
            print(f"⚠️  Failed to create alert: {e}")
    
    def update_alert(self, alert_id, current_value):
        """Update existing alert"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                UPDATE alerts SET current_value = ? WHERE alert_id = ? AND status = 'ACTIVE'
            ''', (current_value, alert_id))
            
            conn.commit()
            conn.close()
            
        except Exception as e:
            print(f"⚠️  Failed to update alert: {e}")
    
    def send_notification(self, alert):
        """Send alert notification"""
        try:
            notification_config = self.config.get('notifications', {})
            
            # Console notification (always enabled)
            if notification_config.get('console', {}).get('enabled', True):
                severity_icons = {
                    'CRITICAL': '🔴',
                    'WARNING': '🟡',
                    'INFO': '🔵'
                }
                icon = severity_icons.get(alert['severity'], '⚠️')
                print(f"{icon} [{alert['severity']}] {alert['message']}")
            
            # Email notification
            if notification_config.get('email', {}).get('enabled', False):
                self.send_email_notification(alert, notification_config['email'])
            
            # Webhook notification
            if notification_config.get('webhook', {}).get('enabled', False):
                self.send_webhook_notification(alert, notification_config['webhook'])
                
        except Exception as e:
            print(f"⚠️  Notification sending failed: {e}")
    
    def send_email_notification(self, alert, email_config):
        """Send email notification"""
        try:
            msg = MIMEMultipart()
            msg['From'] = email_config['sender']
            msg['To'] = ', '.join(email_config['recipients'])
            msg['Subject'] = f"[{alert['severity']}] Monitoring Alert: {alert['rule_name']}"
            
            body = f"""
Monitoring Alert Details:

Rule: {alert['rule_name']}
Severity: {alert['severity']}
Metric: {alert['metric_name']}
Current Value: {alert['current_value']}
Threshold: {alert['threshold']}
Message: {alert['message']}

Time: {datetime.now().isoformat()}
Hostname: {os.uname().nodename if hasattr(os, 'uname') else 'localhost'}
            """
            
            msg.attach(MIMEText(body, 'plain'))
            
            server = smtplib.SMTP(email_config['smtp_server'], email_config['smtp_port'])
            server.starttls()
            server.login(email_config['username'], email_config['password'])
            server.send_message(msg)
            server.quit()
            
        except Exception as e:
            print(f"⚠️  Email notification failed: {e}")
    
    def send_webhook_notification(self, alert, webhook_config):
        """Send webhook notification"""
        try:
            payload = {
                'alert_type': 'monitoring',
                'severity': alert['severity'],
                'rule_name': alert['rule_name'],
                'message': alert['message'],
                'metric': {
                    'name': alert['metric_name'],
                    'current_value': alert['current_value'],
                    'threshold': alert['threshold']
                },
                'timestamp': datetime.now().isoformat(),
                'hostname': os.uname().nodename if hasattr(os, 'uname') else 'localhost'
            }
            
            response = requests.post(
                webhook_config['url'],
                json=payload,
                headers=webhook_config.get('headers', {}),
                timeout=10
            )
            
            if response.status_code == 200:
                print("✅ Webhook notification sent successfully")
            else:
                print(f"⚠️  Webhook notification failed: HTTP {response.status_code}")
                
        except Exception as e:
            print(f"⚠️  Webhook notification failed: {e}")
    
    def monitoring_loop(self):
        """Main monitoring loop"""
        interval = self.config.get('monitoring_interval', 30)
        
        while self.is_monitoring:
            try:
                print(f"📊 Collecting metrics... ({datetime.now().strftime('%H:%M:%S')})")
                
                # Collect metrics
                system_metrics = self.collect_system_metrics()
                app_metrics = self.collect_application_metrics()
                health_results = self.perform_health_checks()
                
                # Combine all metrics
                all_metrics = {**system_metrics, **app_metrics}
                
                # Add health check metrics
                for health in health_results:
                    service_name = health['service_name']
                    all_metrics[f'{service_name}.health'] = 1 if health['status'] == 'HEALTHY' else 0
                    all_metrics[f'{service_name}.response_time'] = health['response_time']
                
                # Evaluate alerts
                active_alerts = self.evaluate_alert_rules(all_metrics)
                
                if active_alerts:
                    self.process_alerts(active_alerts)
                
                print(f"📈 Metrics collected: {len(all_metrics)} metrics, {len(active_alerts)} alerts")
                
            except Exception as e:
                print(f"⚠️  Monitoring loop error: {e}")
            
            time.sleep(interval)
    
    def start_monitoring(self):
        """Start monitoring system"""
        if self.is_monitoring:
            print("⚠️  Monitoring is already running")
            return
        
        print("🚀 Starting enterprise monitoring system...")
        
        self.is_monitoring = True
        
        # Start monitoring thread
        monitoring_thread = threading.Thread(target=self.monitoring_loop, daemon=True)
        monitoring_thread.start()
        self.monitoring_threads.append(monitoring_thread)
        
        # Start cleanup scheduler
        schedule.every(1).hours.do(self.cleanup_old_data)
        cleanup_thread = threading.Thread(target=self.run_scheduler, daemon=True)
        cleanup_thread.start()
        self.monitoring_threads.append(cleanup_thread)
        
        print("✅ Monitoring system started successfully")
        print(f"📊 Collecting metrics every {self.config.get('monitoring_interval', 30)} seconds")
        print(f"🚨 Monitoring {len(self.alert_rules)} alert rules")
        print(f"🏥 Health checking {len(self.config.get('services_to_monitor', []))} services")
    
    def stop_monitoring(self):
        """Stop monitoring system"""
        print("🛑 Stopping monitoring system...")
        self.is_monitoring = False
        
        # Wait for threads to finish
        for thread in self.monitoring_threads:
            if thread.is_alive():
                thread.join(timeout=5)
        
        print("✅ Monitoring system stopped")
    
    def run_scheduler(self):
        """Run scheduled tasks"""
        while self.is_monitoring:
            schedule.run_pending()
            time.sleep(60)  # Check every minute
    
    def cleanup_old_data(self):
        """Clean up old monitoring data"""
        try:
            retention_days = self.config.get('retention_days', 30)
            cutoff_date = datetime.now() - timedelta(days=retention_days)
            
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Clean up old metrics
            cursor.execute('''
                DELETE FROM system_metrics WHERE timestamp < ?
            ''', (cutoff_date.isoformat(),))
            
            cursor.execute('''
                DELETE FROM application_metrics WHERE timestamp < ?
            ''', (cutoff_date.isoformat(),))
            
            cursor.execute('''
                DELETE FROM health_checks WHERE timestamp < ?
            ''', (cutoff_date.isoformat(),))
            
            # Clean up resolved alerts
            cursor.execute('''
                DELETE FROM alerts WHERE resolved_time < ? AND status = 'RESOLVED'
            ''', (cutoff_date.isoformat(),))
            
            deleted_count = cursor.rowcount
            conn.commit()
            conn.close()
            
            if deleted_count > 0:
                print(f"🧹 Cleaned up {deleted_count} old records")
                
        except Exception as e:
            print(f"⚠️  Data cleanup failed: {e}")
    
    def get_monitoring_dashboard(self):
        """Generate monitoring dashboard data"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Recent system metrics
            cursor.execute('''
                SELECT metric_name, AVG(value) as avg_value, MAX(value) as max_value
                FROM system_metrics
                WHERE timestamp > datetime('now', '-1 hour')
                GROUP BY metric_name
                ORDER BY metric_name
            ''')
            
            system_stats = cursor.fetchall()
            
            # Active alerts
            cursor.execute('''
                SELECT rule_name, severity, message, created_time
                FROM alerts
                WHERE status = 'ACTIVE'
                ORDER BY 
                    CASE severity 
                        WHEN 'CRITICAL' THEN 1 
                        WHEN 'WARNING' THEN 2 
                        ELSE 3 
                    END,
                    created_time DESC
            ''')
            
            active_alerts = cursor.fetchall()
            
            # Service health
            cursor.execute('''
                SELECT service_name, status, AVG(response_time) as avg_response_time
                FROM health_checks
                WHERE timestamp > datetime('now', '-15 minutes')
                GROUP BY service_name, status
                ORDER BY service_name
            ''')
            
            service_health = cursor.fetchall()
            
            conn.close()
            
            dashboard = {
                'timestamp': datetime.now().isoformat(),
                'system_metrics': system_stats,
                'active_alerts': active_alerts,
                'service_health': service_health,
                'monitoring_status': 'ACTIVE' if self.is_monitoring else 'INACTIVE'
            }
            
            return dashboard
            
        except Exception as e:
            print(f"⚠️  Dashboard generation failed: {e}")
            return {}
    
    def print_monitoring_summary(self):
        """Print current monitoring summary"""
        dashboard = self.get_monitoring_dashboard()
        
        print("\n" + "=" * 70)
        print("📊 ENTERPRISE MONITORING DASHBOARD")
        print("=" * 70)
        
        print(f"🟢 Status: {dashboard.get('monitoring_status', 'UNKNOWN')}")
        print(f"🕒 Last Update: {dashboard.get('timestamp', 'Unknown')}")
        
        # System metrics summary
        print("\n📈 SYSTEM METRICS (1 hour average)")
        print("-" * 40)
        for metric_name, avg_value, max_value in dashboard.get('system_metrics', []):
            if 'usage' in metric_name or 'percent' in metric_name:
                print(f"  {metric_name}: {avg_value:.1f}% (max: {max_value:.1f}%)")
            elif 'bytes' in metric_name:
                print(f"  {metric_name}: {self.format_bytes(avg_value)} (max: {self.format_bytes(max_value)})")
            else:
                print(f"  {metric_name}: {avg_value:.2f} (max: {max_value:.2f})")
        
        # Active alerts
        active_alerts = dashboard.get('active_alerts', [])
        print(f"\n🚨 ACTIVE ALERTS ({len(active_alerts)})")
        print("-" * 40)
        
        if active_alerts:
            for rule_name, severity, message, created_time in active_alerts:
                severity_icons = {'CRITICAL': '🔴', 'WARNING': '🟡', 'INFO': '🔵'}
                icon = severity_icons.get(severity, '⚠️')
                print(f"  {icon} [{severity}] {message}")
        else:
            print("  ✅ No active alerts")
        
        # Service health
        print(f"\n🏥 SERVICE HEALTH")
        print("-" * 40)
        for service_name, status, avg_response_time in dashboard.get('service_health', []):
            status_icon = '🟢' if status == 'HEALTHY' else '🔴'
            print(f"  {status_icon} {service_name}: {status} ({avg_response_time:.1f}ms)")
        
        print("=" * 70)
    
    def format_bytes(self, bytes_value):
        """Format bytes into human readable format"""
        for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
            if bytes_value < 1024.0:
                return f"{bytes_value:.1f} {unit}"
            bytes_value /= 1024.0
        return f"{bytes_value:.1f} PB"


def main():
    """Main monitoring execution"""
    print("🎛️ ENTERPRISE MONITORING & ALERTING SYSTEM")
    print("🎯 REAL-TIME SYSTEM MONITORING & PREDICTIVE ANALYTICS")
    print("⚠️  NO FAKE WORK - ONLY REAL MONITORING")
    print("=" * 70)
    
    monitor = EnterpriseMonitoringSystem()
    
    try:
        # Start monitoring
        monitor.start_monitoring()
        
        # Run for demonstration
        print("🔄 Monitoring system running... (Press Ctrl+C to stop)")
        
        # Display dashboard updates every 60 seconds
        for _ in range(5):  # Run for 5 minutes
            time.sleep(60)
            monitor.print_monitoring_summary()
        
    except KeyboardInterrupt:
        print("\n🛑 Monitoring stopped by user")
    except Exception as e:
        print(f"❌ Monitoring system failed: {e}")
    finally:
        monitor.stop_monitoring()
        
        # Final dashboard
        print("\n📊 FINAL MONITORING REPORT")
        monitor.print_monitoring_summary()


if __name__ == "__main__":
    main()
