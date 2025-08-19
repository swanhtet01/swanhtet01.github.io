#!/usr/bin/env python3
"""
Super Mega Advanced User Session & Memory Management System
Tracks users across all tools, remembers preferences, and provides personalized experiences
"""

import json
import sqlite3
import hashlib
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
import uuid
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class SuperMegaUserMemory:
    """Advanced user memory and session management system"""
    
    def __init__(self):
        self.db_path = "supermega_user_memory.db"
        self.session_timeout = 24 * 60 * 60  # 24 hours
        self.init_database()
        
    def init_database(self):
        """Initialize user memory database"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Users table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE,
                name TEXT,
                workspace_email TEXT,
                preferences TEXT,
                subscription_tier TEXT DEFAULT 'free',
                total_usage_minutes INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Sessions table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                session_id TEXT PRIMARY KEY,
                user_id TEXT,
                tool_name TEXT,
                session_data TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        """)
        
        # Tool usage history
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tool_usage (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT,
                tool_name TEXT,
                action TEXT,
                input_data TEXT,
                output_data TEXT,
                processing_time REAL,
                success BOOLEAN,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        """)
        
        # User projects and saved work
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_projects (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                project_name TEXT,
                tool_name TEXT,
                project_data TEXT,
                thumbnail_url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        """)
        
        # User preferences and settings
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_preferences (
                user_id TEXT,
                preference_key TEXT,
                preference_value TEXT,
                PRIMARY KEY (user_id, preference_key),
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        """)
        
        conn.commit()
        conn.close()
        logger.info("User memory database initialized")

    def create_or_get_user(self, email: str = None, name: str = None, workspace_email: str = None) -> str:
        """Create or get existing user"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Try to find existing user by email or workspace_email
        user_id = None
        if email:
            cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
            result = cursor.fetchone()
            if result:
                user_id = result[0]
        
        if not user_id and workspace_email:
            cursor.execute("SELECT id FROM users WHERE workspace_email = ?", (workspace_email,))
            result = cursor.fetchone()
            if result:
                user_id = result[0]
        
        # Create new user if not found
        if not user_id:
            user_id = str(uuid.uuid4())
            cursor.execute("""
                INSERT INTO users (id, email, name, workspace_email)
                VALUES (?, ?, ?, ?)
            """, (user_id, email, name, workspace_email))
            logger.info(f"Created new user: {user_id} ({email or workspace_email})")
        else:
            # Update last active
            cursor.execute("""
                UPDATE users SET last_active = CURRENT_TIMESTAMP 
                WHERE id = ?
            """, (user_id,))
        
        conn.commit()
        conn.close()
        return user_id

    def create_session(self, user_id: str, tool_name: str, initial_data: Dict = None) -> str:
        """Create new session for user and tool"""
        session_id = str(uuid.uuid4())
        expires_at = datetime.now() + timedelta(seconds=self.session_timeout)
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT INTO sessions (session_id, user_id, tool_name, session_data, expires_at)
            VALUES (?, ?, ?, ?, ?)
        """, (session_id, user_id, tool_name, json.dumps(initial_data or {}), expires_at))
        
        conn.commit()
        conn.close()
        
        logger.info(f"Created session {session_id} for user {user_id} using {tool_name}")
        return session_id

    def get_session(self, session_id: str) -> Optional[Dict]:
        """Get session data"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT user_id, tool_name, session_data, expires_at 
            FROM sessions WHERE session_id = ?
        """, (session_id,))
        
        result = cursor.fetchone()
        conn.close()
        
        if not result:
            return None
        
        # Check if session expired
        expires_at = datetime.fromisoformat(result[3])
        if datetime.now() > expires_at:
            self.delete_session(session_id)
            return None
        
        return {
            'session_id': session_id,
            'user_id': result[0],
            'tool_name': result[1],
            'session_data': json.loads(result[2]) if result[2] else {},
            'expires_at': result[3]
        }

    def update_session(self, session_id: str, data: Dict):
        """Update session data"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            UPDATE sessions SET session_data = ?, expires_at = ?
            WHERE session_id = ?
        """, (json.dumps(data), datetime.now() + timedelta(seconds=self.session_timeout), session_id))
        
        conn.commit()
        conn.close()

    def log_tool_usage(self, user_id: str, tool_name: str, action: str, 
                      input_data: Any = None, output_data: Any = None, 
                      processing_time: float = 0, success: bool = True):
        """Log tool usage for analytics and user history"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT INTO tool_usage 
            (user_id, tool_name, action, input_data, output_data, processing_time, success)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (user_id, tool_name, action, 
              json.dumps(input_data) if input_data else None,
              json.dumps(output_data) if output_data else None,
              processing_time, success))
        
        # Update user total usage
        cursor.execute("""
            UPDATE users SET total_usage_minutes = total_usage_minutes + ?
            WHERE id = ?
        """, (processing_time / 60, user_id))
        
        conn.commit()
        conn.close()

    def save_user_project(self, user_id: str, project_name: str, tool_name: str, 
                         project_data: Dict, thumbnail_url: str = None) -> str:
        """Save user project/work"""
        project_id = str(uuid.uuid4())
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT INTO user_projects 
            (id, user_id, project_name, tool_name, project_data, thumbnail_url)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (project_id, user_id, project_name, tool_name, 
              json.dumps(project_data), thumbnail_url))
        
        conn.commit()
        conn.close()
        
        return project_id

    def get_user_projects(self, user_id: str, tool_name: str = None) -> List[Dict]:
        """Get user's saved projects"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        if tool_name:
            cursor.execute("""
                SELECT id, project_name, tool_name, project_data, thumbnail_url, created_at, updated_at
                FROM user_projects WHERE user_id = ? AND tool_name = ?
                ORDER BY updated_at DESC
            """, (user_id, tool_name))
        else:
            cursor.execute("""
                SELECT id, project_name, tool_name, project_data, thumbnail_url, created_at, updated_at
                FROM user_projects WHERE user_id = ?
                ORDER BY updated_at DESC
            """, (user_id,))
        
        projects = []
        for row in cursor.fetchall():
            projects.append({
                'id': row[0],
                'project_name': row[1],
                'tool_name': row[2],
                'project_data': json.loads(row[3]) if row[3] else {},
                'thumbnail_url': row[4],
                'created_at': row[5],
                'updated_at': row[6]
            })
        
        conn.close()
        return projects

    def get_user_preferences(self, user_id: str) -> Dict:
        """Get user preferences"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT preference_key, preference_value 
            FROM user_preferences WHERE user_id = ?
        """, (user_id,))
        
        preferences = {}
        for row in cursor.fetchall():
            preferences[row[0]] = json.loads(row[1]) if row[1].startswith('{') or row[1].startswith('[') else row[1]
        
        conn.close()
        return preferences

    def set_user_preference(self, user_id: str, key: str, value: Any):
        """Set user preference"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT OR REPLACE INTO user_preferences (user_id, preference_key, preference_value)
            VALUES (?, ?, ?)
        """, (user_id, key, json.dumps(value) if isinstance(value, (dict, list)) else str(value)))
        
        conn.commit()
        conn.close()

    def get_user_stats(self, user_id: str) -> Dict:
        """Get comprehensive user statistics"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Basic user info
        cursor.execute("""
            SELECT name, email, workspace_email, subscription_tier, total_usage_minutes, created_at, last_active
            FROM users WHERE id = ?
        """, (user_id,))
        user_info = cursor.fetchone()
        
        # Tool usage stats
        cursor.execute("""
            SELECT tool_name, COUNT(*) as usage_count, SUM(processing_time) as total_time
            FROM tool_usage WHERE user_id = ?
            GROUP BY tool_name
            ORDER BY usage_count DESC
        """, (user_id,))
        tool_usage = cursor.fetchall()
        
        # Project count
        cursor.execute("""
            SELECT COUNT(*) FROM user_projects WHERE user_id = ?
        """, (user_id,))
        project_count = cursor.fetchone()[0]
        
        # Recent activity
        cursor.execute("""
            SELECT tool_name, action, timestamp 
            FROM tool_usage WHERE user_id = ?
            ORDER BY timestamp DESC LIMIT 10
        """, (user_id,))
        recent_activity = cursor.fetchall()
        
        conn.close()
        
        return {
            'user_info': {
                'name': user_info[0] if user_info else None,
                'email': user_info[1] if user_info else None,
                'workspace_email': user_info[2] if user_info else None,
                'subscription_tier': user_info[3] if user_info else 'free',
                'total_usage_minutes': user_info[4] if user_info else 0,
                'created_at': user_info[5] if user_info else None,
                'last_active': user_info[6] if user_info else None,
            },
            'tool_usage': [{'tool': row[0], 'count': row[1], 'total_time': row[2]} for row in tool_usage],
            'project_count': project_count,
            'recent_activity': [{'tool': row[0], 'action': row[1], 'timestamp': row[2]} for row in recent_activity]
        }

    def cleanup_expired_sessions(self):
        """Clean up expired sessions"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            DELETE FROM sessions WHERE expires_at < ?
        """, (datetime.now(),))
        
        deleted = cursor.rowcount
        conn.commit()
        conn.close()
        
        if deleted > 0:
            logger.info(f"Cleaned up {deleted} expired sessions")

# Global instance
user_memory = SuperMegaUserMemory()

def get_user_session(request_data: Dict) -> Dict:
    """Helper function to get or create user session"""
    email = request_data.get('email', 'swanhtet@supermega.dev')  # Default workspace email
    name = request_data.get('name', 'Super Mega User')
    tool_name = request_data.get('tool_name', 'unknown')
    
    user_id = user_memory.create_or_get_user(
        email=email,
        name=name,
        workspace_email='swanhtet@supermega.dev'
    )
    
    session_id = user_memory.create_session(user_id, tool_name)
    
    return {
        'user_id': user_id,
        'session_id': session_id,
        'user_stats': user_memory.get_user_stats(user_id),
        'preferences': user_memory.get_user_preferences(user_id),
        'saved_projects': user_memory.get_user_projects(user_id, tool_name)
    }

if __name__ == "__main__":
    # Test the system
    print("🧠 Super Mega User Memory System")
    print("=" * 50)
    
    # Create test user
    user_id = user_memory.create_or_get_user(
        email="swanhtet@supermega.dev",
        name="Swan Htet",
        workspace_email="swanhtet@supermega.dev"
    )
    
    print(f"User ID: {user_id}")
    
    # Test session
    session_id = user_memory.create_session(user_id, "voice_ai_studio")
    print(f"Session ID: {session_id}")
    
    # Test logging
    user_memory.log_tool_usage(
        user_id, "voice_ai_studio", "voice_clone",
        input_data={"text": "Hello world", "voice": "professional"},
        output_data={"status": "success", "duration": 5.2},
        processing_time=12.5
    )
    
    # Get stats
    stats = user_memory.get_user_stats(user_id)
    print(f"User Stats: {json.dumps(stats, indent=2)}")
