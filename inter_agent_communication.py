#!/usr/bin/env python3
"""
🚀 ADVANCED INTER-AGENT COMMUNICATION SYSTEM
Real-time coordination, task distribution, and intelligent collaboration

🎯 PURPOSE: Enable seamless communication and coordination between all development agents
⚠️  NO FAKE WORK - ONLY REAL INTER-AGENT COORDINATION
"""

import os
import sys
import json
import time
import sqlite3
import threading
import queue
from datetime import datetime
from collections import defaultdict, deque
import requests
from flask import Flask, request, jsonify
import uuid
import asyncio
import websockets
import logging

class InterAgentCommunicationSystem:
    def __init__(self):
        self.db_path = "inter_agent_communication.db"
        self.workspace_path = "."
        self.communication_port = 9000
        self.websocket_port = 9001
        
        # Agent registry
        self.registered_agents = {}
        self.agent_capabilities = {}
        self.communication_channels = defaultdict(queue.Queue)
        self.message_history = deque(maxlen=1000)
        
        # Task coordination
        self.active_tasks = {}
        self.task_assignments = {}
        self.collaboration_sessions = {}
        
        # Communication protocols
        self.message_types = {
            'TASK_REQUEST': 'Request task execution from another agent',
            'TASK_RESPONSE': 'Response to task request',
            'STATUS_UPDATE': 'Status update from agent',
            'COORDINATION': 'Coordination between agents',
            'RESOURCE_SHARE': 'Share resources between agents',
            'HEALTH_CHECK': 'Health check ping',
            'CAPABILITY_BROADCAST': 'Broadcast agent capabilities'
        }
        
        self.init_database()
        self.setup_communication_server()
        
        print("🚀 Inter-Agent Communication System initialized")
    
    def init_database(self):
        """Initialize communication database"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Agent registry
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS agent_registry (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    agent_id TEXT UNIQUE NOT NULL,
                    agent_name TEXT NOT NULL,
                    agent_type TEXT NOT NULL,
                    endpoint_url TEXT NOT NULL,
                    capabilities TEXT,
                    status TEXT DEFAULT 'ONLINE',
                    last_heartbeat DATETIME DEFAULT CURRENT_TIMESTAMP,
                    registered_date DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Message history
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS message_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    message_id TEXT UNIQUE NOT NULL,
                    sender_id TEXT NOT NULL,
                    receiver_id TEXT,
                    message_type TEXT NOT NULL,
                    content TEXT,
                    priority INTEGER DEFAULT 1,
                    status TEXT DEFAULT 'SENT',
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    processed_time DATETIME
                )
            ''')
            
            # Task coordination
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS task_coordination (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_id TEXT UNIQUE NOT NULL,
                    task_type TEXT NOT NULL,
                    requester_id TEXT NOT NULL,
                    assigned_agent_id TEXT,
                    task_description TEXT,
                    task_data TEXT,
                    priority INTEGER DEFAULT 1,
                    status TEXT DEFAULT 'PENDING',
                    created_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                    assigned_time DATETIME,
                    completed_time DATETIME,
                    result_data TEXT
                )
            ''')
            
            # Collaboration sessions
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS collaboration_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT UNIQUE NOT NULL,
                    session_name TEXT NOT NULL,
                    participants TEXT NOT NULL,
                    session_type TEXT NOT NULL,
                    status TEXT DEFAULT 'ACTIVE',
                    created_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                    ended_time DATETIME,
                    session_data TEXT
                )
            ''')
            
            # Performance metrics
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS communication_metrics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    metric_type TEXT NOT NULL,
                    agent_id TEXT,
                    metric_value REAL NOT NULL,
                    metric_unit TEXT,
                    measurement_time DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            conn.commit()
            conn.close()
            print("✅ Inter-agent communication database initialized")
            
        except Exception as e:
            print(f"❌ Communication database init error: {e}")
    
    def setup_communication_server(self):
        """Setup Flask server for REST API communication"""
        self.app = Flask(__name__)
        self.app.logger.setLevel(logging.ERROR)
        
        # REST API endpoints
        @self.app.route('/register', methods=['POST'])
        def register_agent():
            return self.register_agent_endpoint()
        
        @self.app.route('/send_message', methods=['POST'])
        def send_message():
            return self.send_message_endpoint()
        
        @self.app.route('/get_messages/<agent_id>', methods=['GET'])
        def get_messages(agent_id):
            return self.get_messages_endpoint(agent_id)
        
        @self.app.route('/request_task', methods=['POST'])
        def request_task():
            return self.request_task_endpoint()
        
        @self.app.route('/submit_result', methods=['POST'])
        def submit_result():
            return self.submit_result_endpoint()
        
        @self.app.route('/heartbeat/<agent_id>', methods=['POST'])
        def heartbeat(agent_id):
            return self.heartbeat_endpoint(agent_id)
        
        @self.app.route('/status', methods=['GET'])
        def status():
            return self.get_system_status()
        
        print("✅ Communication server endpoints configured")
    
    def register_agent_endpoint(self):
        """Register a new agent"""
        try:
            data = request.get_json()
            agent_id = data.get('agent_id')
            agent_name = data.get('agent_name')
            agent_type = data.get('agent_type')
            endpoint_url = data.get('endpoint_url')
            capabilities = data.get('capabilities', [])
            
            if not all([agent_id, agent_name, agent_type, endpoint_url]):
                return jsonify({'error': 'Missing required fields'}), 400
            
            # Store in database
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT OR REPLACE INTO agent_registry (
                    agent_id, agent_name, agent_type, endpoint_url, capabilities
                ) VALUES (?, ?, ?, ?, ?)
            ''', (agent_id, agent_name, agent_type, endpoint_url, json.dumps(capabilities)))
            
            conn.commit()
            conn.close()
            
            # Store in memory
            self.registered_agents[agent_id] = {
                'name': agent_name,
                'type': agent_type,
                'endpoint': endpoint_url,
                'status': 'ONLINE',
                'last_heartbeat': datetime.now().isoformat()
            }
            
            self.agent_capabilities[agent_id] = capabilities
            
            print(f"✅ Agent registered: {agent_name} ({agent_id})")
            return jsonify({'status': 'success', 'message': 'Agent registered successfully'})
            
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    def send_message_endpoint(self):
        """Send message between agents"""
        try:
            data = request.get_json()
            sender_id = data.get('sender_id')
            receiver_id = data.get('receiver_id')
            message_type = data.get('message_type')
            content = data.get('content')
            priority = data.get('priority', 1)
            
            if not all([sender_id, message_type, content]):
                return jsonify({'error': 'Missing required fields'}), 400
            
            message_id = str(uuid.uuid4())
            
            # Store message
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT INTO message_history (
                    message_id, sender_id, receiver_id, message_type, content, priority
                ) VALUES (?, ?, ?, ?, ?, ?)
            ''', (message_id, sender_id, receiver_id, message_type, json.dumps(content), priority))
            
            conn.commit()
            conn.close()
            
            # Add to message queue
            if receiver_id:
                self.communication_channels[receiver_id].put({
                    'message_id': message_id,
                    'sender_id': sender_id,
                    'message_type': message_type,
                    'content': content,
                    'timestamp': datetime.now().isoformat(),
                    'priority': priority
                })
            else:
                # Broadcast message
                for agent_id in self.registered_agents:
                    if agent_id != sender_id:
                        self.communication_channels[agent_id].put({
                            'message_id': message_id,
                            'sender_id': sender_id,
                            'message_type': message_type,
                            'content': content,
                            'timestamp': datetime.now().isoformat(),
                            'priority': priority
                        })
            
            return jsonify({'status': 'success', 'message_id': message_id})
            
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    def get_messages_endpoint(self, agent_id):
        """Get pending messages for agent"""
        try:
            messages = []
            
            # Get messages from queue
            while not self.communication_channels[agent_id].empty():
                try:
                    message = self.communication_channels[agent_id].get_nowait()
                    messages.append(message)
                except queue.Empty:
                    break
            
            return jsonify({'messages': messages})
            
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    def request_task_endpoint(self):
        """Request task execution from another agent"""
        try:
            data = request.get_json()
            requester_id = data.get('requester_id')
            task_type = data.get('task_type')
            task_description = data.get('task_description')
            task_data = data.get('task_data', {})
            priority = data.get('priority', 1)
            preferred_agent = data.get('preferred_agent')
            
            if not all([requester_id, task_type, task_description]):
                return jsonify({'error': 'Missing required fields'}), 400
            
            task_id = str(uuid.uuid4())
            
            # Find best agent for task
            assigned_agent = self.find_best_agent_for_task(task_type, preferred_agent)
            
            if not assigned_agent:
                return jsonify({'error': 'No suitable agent available'}), 404
            
            # Store task
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT INTO task_coordination (
                    task_id, task_type, requester_id, assigned_agent_id,
                    task_description, task_data, priority, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ASSIGNED')
            ''', (task_id, task_type, requester_id, assigned_agent,
                  task_description, json.dumps(task_data), priority))
            
            conn.commit()
            conn.close()
            
            # Send task to assigned agent
            task_message = {
                'task_id': task_id,
                'task_type': task_type,
                'description': task_description,
                'data': task_data,
                'priority': priority,
                'requester': requester_id
            }
            
            self.communication_channels[assigned_agent].put({
                'message_id': str(uuid.uuid4()),
                'sender_id': 'SYSTEM',
                'message_type': 'TASK_REQUEST',
                'content': task_message,
                'timestamp': datetime.now().isoformat(),
                'priority': priority
            })
            
            return jsonify({
                'status': 'success',
                'task_id': task_id,
                'assigned_agent': assigned_agent
            })
            
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    def submit_result_endpoint(self):
        """Submit task result"""
        try:
            data = request.get_json()
            task_id = data.get('task_id')
            agent_id = data.get('agent_id')
            result_data = data.get('result_data')
            status = data.get('status', 'COMPLETED')
            
            if not all([task_id, agent_id, result_data]):
                return jsonify({'error': 'Missing required fields'}), 400
            
            # Update task
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                UPDATE task_coordination SET
                    status = ?,
                    completed_time = ?,
                    result_data = ?
                WHERE task_id = ? AND assigned_agent_id = ?
            ''', (status, datetime.now().isoformat(), json.dumps(result_data), task_id, agent_id))
            
            conn.commit()
            conn.close()
            
            # Notify requester
            cursor.execute('SELECT requester_id FROM task_coordination WHERE task_id = ?', (task_id,))
            requester = cursor.fetchone()
            
            if requester:
                self.communication_channels[requester[0]].put({
                    'message_id': str(uuid.uuid4()),
                    'sender_id': agent_id,
                    'message_type': 'TASK_RESPONSE',
                    'content': {
                        'task_id': task_id,
                        'status': status,
                        'result': result_data
                    },
                    'timestamp': datetime.now().isoformat(),
                    'priority': 1
                })
            
            return jsonify({'status': 'success', 'message': 'Result submitted successfully'})
            
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    def heartbeat_endpoint(self, agent_id):
        """Process agent heartbeat"""
        try:
            if agent_id in self.registered_agents:
                self.registered_agents[agent_id]['last_heartbeat'] = datetime.now().isoformat()
                self.registered_agents[agent_id]['status'] = 'ONLINE'
                
                # Update database
                conn = sqlite3.connect(self.db_path)
                cursor = conn.cursor()
                
                cursor.execute('''
                    UPDATE agent_registry SET
                        status = 'ONLINE',
                        last_heartbeat = ?
                    WHERE agent_id = ?
                ''', (datetime.now().isoformat(), agent_id))
                
                conn.commit()
                conn.close()
                
                return jsonify({'status': 'success', 'message': 'Heartbeat received'})
            else:
                return jsonify({'error': 'Agent not registered'}), 404
                
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    def find_best_agent_for_task(self, task_type, preferred_agent=None):
        """Find the best agent for a specific task"""
        if preferred_agent and preferred_agent in self.registered_agents:
            if self.registered_agents[preferred_agent]['status'] == 'ONLINE':
                return preferred_agent
        
        # Find agents with matching capabilities
        suitable_agents = []
        
        for agent_id, capabilities in self.agent_capabilities.items():
            if agent_id in self.registered_agents:
                if self.registered_agents[agent_id]['status'] == 'ONLINE':
                    # Check if agent has required capability
                    if any(task_type.lower() in cap.lower() for cap in capabilities):
                        suitable_agents.append(agent_id)
        
        # Return first suitable agent (can be enhanced with load balancing)
        return suitable_agents[0] if suitable_agents else None
    
    def get_system_status(self):
        """Get communication system status"""
        try:
            status = {
                'system_status': 'ACTIVE',
                'total_agents': len(self.registered_agents),
                'online_agents': sum(1 for agent in self.registered_agents.values() 
                                   if agent['status'] == 'ONLINE'),
                'total_messages': len(self.message_history),
                'active_tasks': len([t for t in self.active_tasks.values() 
                                   if t.get('status') != 'COMPLETED']),
                'registered_agents': list(self.registered_agents.keys()),
                'message_queues': {agent_id: queue.qsize() 
                                 for agent_id, queue in self.communication_channels.items()},
                'timestamp': datetime.now().isoformat()
            }
            
            return jsonify(status)
            
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    def start_communication_server(self):
        """Start the communication server"""
        def run_server():
            try:
                self.app.run(host='0.0.0.0', port=self.communication_port, 
                           debug=False, threaded=True)
            except Exception as e:
                print(f"❌ Communication server error: {e}")
        
        server_thread = threading.Thread(target=run_server, daemon=True)
        server_thread.start()
        
        print(f"✅ Inter-agent communication server started on port {self.communication_port}")
        return server_thread
    
    def monitor_agent_health(self):
        """Monitor agent health and mark offline agents"""
        while True:
            try:
                current_time = datetime.now()
                
                for agent_id, agent_info in self.registered_agents.items():
                    last_heartbeat = datetime.fromisoformat(agent_info['last_heartbeat'])
                    time_diff = (current_time - last_heartbeat).seconds
                    
                    # Mark as offline if no heartbeat for 60 seconds
                    if time_diff > 60 and agent_info['status'] != 'OFFLINE':
                        agent_info['status'] = 'OFFLINE'
                        print(f"⚠️  Agent {agent_id} marked as OFFLINE")
                        
                        # Update database
                        conn = sqlite3.connect(self.db_path)
                        cursor = conn.cursor()
                        
                        cursor.execute('''
                            UPDATE agent_registry SET status = 'OFFLINE' WHERE agent_id = ?
                        ''', (agent_id,))
                        
                        conn.commit()
                        conn.close()
                
                time.sleep(30)  # Check every 30 seconds
                
            except Exception as e:
                print(f"⚠️  Health monitoring error: {e}")
                time.sleep(30)
    
    def start_monitoring(self):
        """Start agent health monitoring"""
        monitoring_thread = threading.Thread(target=self.monitor_agent_health, daemon=True)
        monitoring_thread.start()
        print("✅ Agent health monitoring started")
        return monitoring_thread
    
    def create_collaboration_session(self, session_name, participants, session_type):
        """Create a collaboration session between agents"""
        try:
            session_id = str(uuid.uuid4())
            
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT INTO collaboration_sessions (
                    session_id, session_name, participants, session_type
                ) VALUES (?, ?, ?, ?)
            ''', (session_id, session_name, json.dumps(participants), session_type))
            
            conn.commit()
            conn.close()
            
            # Notify all participants
            for participant in participants:
                if participant in self.registered_agents:
                    self.communication_channels[participant].put({
                        'message_id': str(uuid.uuid4()),
                        'sender_id': 'SYSTEM',
                        'message_type': 'COORDINATION',
                        'content': {
                            'session_id': session_id,
                            'session_name': session_name,
                            'participants': participants,
                            'type': 'COLLABORATION_INVITE'
                        },
                        'timestamp': datetime.now().isoformat(),
                        'priority': 2
                    })
            
            self.collaboration_sessions[session_id] = {
                'name': session_name,
                'participants': participants,
                'type': session_type,
                'created': datetime.now().isoformat()
            }
            
            return session_id
            
        except Exception as e:
            print(f"❌ Collaboration session creation failed: {e}")
            return None
    
    def execute_coordinated_task(self, task_name, task_data, participating_agents):
        """Execute a task requiring coordination between multiple agents"""
        try:
            coordination_id = str(uuid.uuid4())
            
            print(f"🤝 Starting coordinated task: {task_name}")
            print(f"   Participants: {', '.join(participating_agents)}")
            
            # Create coordination message
            coordination_message = {
                'coordination_id': coordination_id,
                'task_name': task_name,
                'task_data': task_data,
                'participants': participating_agents,
                'coordinator': 'SYSTEM'
            }
            
            # Send to all participants
            for agent_id in participating_agents:
                if agent_id in self.registered_agents:
                    self.communication_channels[agent_id].put({
                        'message_id': str(uuid.uuid4()),
                        'sender_id': 'SYSTEM',
                        'message_type': 'COORDINATION',
                        'content': coordination_message,
                        'timestamp': datetime.now().isoformat(),
                        'priority': 3
                    })
            
            print(f"✅ Coordination messages sent for task: {task_name}")
            return coordination_id
            
        except Exception as e:
            print(f"❌ Coordinated task execution failed: {e}")
            return None
    
    def get_communication_analytics(self):
        """Get communication system analytics"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Message statistics
            cursor.execute('''
                SELECT message_type, COUNT(*) as count
                FROM message_history
                WHERE DATE(timestamp) = DATE('now')
                GROUP BY message_type
            ''')
            
            today_messages = dict(cursor.fetchall())
            
            # Task statistics
            cursor.execute('''
                SELECT status, COUNT(*) as count
                FROM task_coordination
                WHERE DATE(created_time) = DATE('now')
                GROUP BY status
            ''')
            
            today_tasks = dict(cursor.fetchall())
            
            # Active agents
            cursor.execute('''
                SELECT COUNT(*) FROM agent_registry WHERE status = 'ONLINE'
            ''')
            
            active_agents = cursor.fetchone()[0]
            
            conn.close()
            
            analytics = {
                'active_agents': active_agents,
                'total_registered_agents': len(self.registered_agents),
                'messages_today': today_messages,
                'tasks_today': today_tasks,
                'collaboration_sessions': len(self.collaboration_sessions),
                'message_queues_status': {
                    agent_id: {
                        'pending_messages': queue.qsize(),
                        'agent_status': self.registered_agents.get(agent_id, {}).get('status', 'UNKNOWN')
                    }
                    for agent_id, queue in self.communication_channels.items()
                }
            }
            
            return analytics
            
        except Exception as e:
            print(f"❌ Analytics generation failed: {e}")
            return {}


def main():
    """Main inter-agent communication execution"""
    print("🚀 ADVANCED INTER-AGENT COMMUNICATION SYSTEM")
    print("🎯 REAL-TIME COORDINATION & INTELLIGENT COLLABORATION")
    print("⚠️  NO FAKE WORK - ONLY REAL INTER-AGENT COMMUNICATION")
    print("=" * 80)
    
    comm_system = InterAgentCommunicationSystem()
    
    try:
        # Start communication server
        server_thread = comm_system.start_communication_server()
        
        # Start health monitoring
        monitoring_thread = comm_system.start_monitoring()
        
        print(f"\n✅ INTER-AGENT COMMUNICATION SYSTEM ACTIVE!")
        print(f"📡 REST API Server: http://localhost:{comm_system.communication_port}")
        print(f"🏥 Health Monitoring: Active")
        print(f"🤝 Coordination Services: Ready")
        
        print(f"\n🔌 AVAILABLE ENDPOINTS:")
        print(f"   POST /register - Register new agent")
        print(f"   POST /send_message - Send message between agents")
        print(f"   GET /get_messages/<agent_id> - Get pending messages")
        print(f"   POST /request_task - Request task execution")
        print(f"   POST /submit_result - Submit task results")
        print(f"   POST /heartbeat/<agent_id> - Send heartbeat")
        print(f"   GET /status - Get system status")
        
        # Demo coordination tasks
        print(f"\n🎯 INITIATING COORDINATION EXAMPLES...")
        
        # Example: Request codebase analysis coordination
        coordination_id = comm_system.execute_coordinated_task(
            "Comprehensive Codebase Analysis",
            {
                "target_directory": ".",
                "analysis_types": ["complexity", "security", "performance"],
                "priority": "high"
            },
            ["dev_team_rd", "quality_assurance", "business_intelligence"]
        )
        
        if coordination_id:
            print(f"✅ Coordination task initiated: {coordination_id}")
        
        # Keep running and show periodic analytics
        while True:
            time.sleep(60)  # Update every minute
            
            analytics = comm_system.get_communication_analytics()
            print(f"\n📊 COMMUNICATION ANALYTICS ({datetime.now().strftime('%H:%M:%S')})")
            print(f"   🟢 Active Agents: {analytics.get('active_agents', 0)}")
            print(f"   📨 Messages Today: {sum(analytics.get('messages_today', {}).values())}")
            print(f"   🎯 Tasks Today: {sum(analytics.get('tasks_today', {}).values())}")
            print(f"   🤝 Collaboration Sessions: {analytics.get('collaboration_sessions', 0)}")
        
    except KeyboardInterrupt:
        print(f"\n🛑 Inter-agent communication system stopped")
    except Exception as e:
        print(f"❌ Communication system failed: {e}")


if __name__ == "__main__":
    main()
