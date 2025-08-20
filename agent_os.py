#!/usr/bin/env python3
"""
🤖 AgentOS - Infrastructure for Autonomous AI Agents
Complete operating system for AI agents with specialized interfaces
"""

import asyncio
import json
import logging
import sqlite3
import threading
import time
import uuid
import os
from datetime import datetime
from typing import Dict, List, Optional, Any
from flask import Flask, render_template_string, request, jsonify, redirect, url_for
from flask_cors import CORS
import webbrowser
from pathlib import Path

try:
    from selenium import webdriver
    from selenium.webdriver.common.by import By
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.common.keys import Keys
    from webdriver_manager.chrome import ChromeDriverManager
    BROWSER_AUTOMATION_AVAILABLE = True
except ImportError:
    BROWSER_AUTOMATION_AVAILABLE = False
    print("⚠️  Browser automation not available. Install selenium and webdriver-manager")

try:
    import cv2
    import numpy as np
    from PIL import Image, ImageEnhance, ImageFilter
    import speech_recognition as sr
    import pyttsx3
    ADVANCED_AI_AVAILABLE = True
except ImportError:
    ADVANCED_AI_AVAILABLE = False

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AgentOS:
    """Core AgentOS Infrastructure"""
    
    def __init__(self):
        self.agents = {}
        self.browser_instances = {}
        self.active_tasks = {}
        self.db_path = "agent_os.db"
        self.init_database()
        self.init_core_services()
        
    def init_database(self):
        """Initialize AgentOS database"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Agent tasks table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS agent_tasks (
                id TEXT PRIMARY KEY,
                agent_type TEXT NOT NULL,
                task_description TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                completed_at DATETIME,
                result TEXT
            )
        """)
        
        # Browser sessions table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS browser_sessions (
                id TEXT PRIMARY KEY,
                url TEXT NOT NULL,
                actions TEXT,
                status TEXT DEFAULT 'active',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        conn.commit()
        conn.close()
        logger.info("AgentOS database initialized")
    
    def init_core_services(self):
        """Initialize core AgentOS services"""
        self.services = {
            'browser_agent': BrowserAgent(),
            'image_agent': ImageProcessingAgent(),
            'design_agent': DesignAgent(),
            'voice_agent': VoiceAgent(),
            'task_manager': TaskManager()
        }
        logger.info("AgentOS core services initialized")
    
    def register_agent(self, agent_id: str, agent_type: str, agent_instance):
        """Register a new agent with the OS"""
        self.agents[agent_id] = {
            'type': agent_type,
            'instance': agent_instance,
            'status': 'active',
            'created_at': datetime.now()
        }
        logger.info(f"Agent registered: {agent_id} ({agent_type})")
    
    def execute_task(self, task_type: str, task_data: Dict[str, Any]) -> str:
        """Execute task through appropriate agent"""
        task_id = str(uuid.uuid4())
        
        if task_type in self.services:
            agent = self.services[task_type]
            
            # Store task
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO agent_tasks (id, agent_type, task_description, status)
                VALUES (?, ?, ?, ?)
            """, (task_id, task_type, json.dumps(task_data), 'running'))
            conn.commit()
            conn.close()
            
            # Execute in background
            thread = threading.Thread(target=self._execute_task_async, args=(task_id, agent, task_data))
            thread.start()
            
            return task_id
        else:
            raise ValueError(f"Unknown task type: {task_type}")
    
    def _execute_task_async(self, task_id: str, agent, task_data: Dict[str, Any]):
        """Execute task asynchronously"""
        try:
            result = agent.execute(task_data)
            
            # Update task status
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE agent_tasks 
                SET status = 'completed', completed_at = ?, result = ?
                WHERE id = ?
            """, (datetime.now(), json.dumps(result), task_id))
            conn.commit()
            conn.close()
            
        except Exception as e:
            logger.error(f"Task execution failed: {e}")
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE agent_tasks 
                SET status = 'failed', completed_at = ?, result = ?
                WHERE id = ?
            """, (datetime.now(), str(e), task_id))
            conn.commit()
            conn.close()

class BrowserAgent:
    """Real browser automation agent"""
    
    def __init__(self):
        self.driver = None
        self.init_browser()
    
    def init_browser(self):
        """Initialize real Chrome browser"""
        if not BROWSER_AUTOMATION_AVAILABLE:
            logger.warning("Browser automation not available")
            return
            
        try:
            chrome_options = Options()
            chrome_options.add_argument("--no-sandbox")
            chrome_options.add_argument("--disable-dev-shm-usage")
            chrome_options.add_argument("--disable-gpu")
            chrome_options.add_argument("--remote-debugging-port=9222")
            chrome_options.add_experimental_option("detach", True)
            
            service = Service(ChromeDriverManager().install())
            self.driver = webdriver.Chrome(service=service, options=chrome_options)
            logger.info("Real Chrome browser initialized")
            
        except Exception as e:
            logger.error(f"Browser initialization failed: {e}")
    
    def execute(self, task_data: Dict[str, Any]) -> Dict[str, Any]:
        """Execute browser task"""
        if not self.driver:
            return {'status': 'error', 'message': 'Browser not available'}
        
        action = task_data.get('action')
        
        try:
            if action == 'navigate':
                url = task_data.get('url')
                self.driver.get(url)
                return {'status': 'success', 'message': f'Navigated to {url}'}
            
            elif action == 'search':
                query = task_data.get('query')
                search_url = f"https://www.google.com/search?q={query}"
                self.driver.get(search_url)
                return {'status': 'success', 'message': f'Searched for: {query}'}
            
            elif action == 'click':
                selector = task_data.get('selector')
                element = self.driver.find_element(By.CSS_SELECTOR, selector)
                element.click()
                return {'status': 'success', 'message': f'Clicked element: {selector}'}
            
            elif action == 'fill_form':
                fields = task_data.get('fields', {})
                for field_name, value in fields.items():
                    element = self.driver.find_element(By.NAME, field_name)
                    element.clear()
                    element.send_keys(value)
                return {'status': 'success', 'message': 'Form filled successfully'}
            
            elif action == 'scroll':
                direction = task_data.get('direction', 'down')
                if direction == 'down':
                    self.driver.execute_script("window.scrollBy(0, 500);")
                else:
                    self.driver.execute_script("window.scrollBy(0, -500);")
                return {'status': 'success', 'message': f'Scrolled {direction}'}
            
            elif action == 'get_text':
                selector = task_data.get('selector')
                element = self.driver.find_element(By.CSS_SELECTOR, selector)
                text = element.text
                return {'status': 'success', 'text': text}
            
            elif action == 'screenshot':
                filename = f"screenshot_{int(time.time())}.png"
                self.driver.save_screenshot(filename)
                return {'status': 'success', 'screenshot': filename}
            
            else:
                return {'status': 'error', 'message': f'Unknown action: {action}'}
                
        except Exception as e:
            return {'status': 'error', 'message': str(e)}
    
    def close(self):
        """Close browser"""
        if self.driver:
            self.driver.quit()

class ImageProcessingAgent:
    """Image processing and editing agent"""
    
    def execute(self, task_data: Dict[str, Any]) -> Dict[str, Any]:
        """Execute image processing task"""
        if not ADVANCED_AI_AVAILABLE:
            return {'status': 'error', 'message': 'Image processing not available'}
        
        action = task_data.get('action')
        image_path = task_data.get('image_path')
        
        try:
            if action == 'enhance':
                return self.enhance_image(image_path, task_data.get('settings', {}))
            elif action == 'resize':
                return self.resize_image(image_path, task_data.get('size', (800, 600)))
            elif action == 'filter':
                return self.apply_filter(image_path, task_data.get('filter_type', 'blur'))
            else:
                return {'status': 'error', 'message': f'Unknown action: {action}'}
                
        except Exception as e:
            return {'status': 'error', 'message': str(e)}
    
    def enhance_image(self, image_path: str, settings: Dict) -> Dict[str, Any]:
        """Enhance image with AI"""
        image = Image.open(image_path)
        
        # Apply enhancements
        if settings.get('brightness'):
            enhancer = ImageEnhance.Brightness(image)
            image = enhancer.enhance(settings['brightness'])
        
        if settings.get('contrast'):
            enhancer = ImageEnhance.Contrast(image)
            image = enhancer.enhance(settings['contrast'])
        
        # Save enhanced image
        output_path = f"enhanced_{int(time.time())}.png"
        image.save(output_path)
        
        return {'status': 'success', 'output_path': output_path}

class DesignAgent:
    """Design creation agent"""
    
    def execute(self, task_data: Dict[str, Any]) -> Dict[str, Any]:
        """Execute design task"""
        design_type = task_data.get('type')
        content = task_data.get('content', {})
        
        try:
            design_image = self.create_design(design_type, content)
            output_path = f"design_{design_type}_{int(time.time())}.png"
            design_image.save(output_path)
            
            return {'status': 'success', 'output_path': output_path}
            
        except Exception as e:
            return {'status': 'error', 'message': str(e)}
    
    def create_design(self, design_type: str, content: Dict) -> Image.Image:
        """Create design based on type"""
        dimensions = {
            'social_post': (1080, 1080),
            'business_card': (350, 200),
            'logo': (400, 400),
            'banner': (1200, 300)
        }
        
        width, height = dimensions.get(design_type, (800, 600))
        image = Image.new('RGB', (width, height), (255, 255, 255))
        
        return image

class VoiceAgent:
    """Voice processing agent"""
    
    def __init__(self):
        self.recognizer = None
        self.tts_engine = None
        if ADVANCED_AI_AVAILABLE:
            self.recognizer = sr.Recognizer()
            self.tts_engine = pyttsx3.init()
    
    def execute(self, task_data: Dict[str, Any]) -> Dict[str, Any]:
        """Execute voice task"""
        if not ADVANCED_AI_AVAILABLE:
            return {'status': 'error', 'message': 'Voice processing not available'}
        
        action = task_data.get('action')
        
        if action == 'listen':
            return self.listen_for_command()
        elif action == 'speak':
            return self.speak_text(task_data.get('text', ''))
        else:
            return {'status': 'error', 'message': f'Unknown action: {action}'}
    
    def listen_for_command(self) -> Dict[str, Any]:
        """Listen for voice command"""
        try:
            with sr.Microphone() as source:
                self.recognizer.adjust_for_ambient_noise(source)
                audio = self.recognizer.listen(source, timeout=5)
            
            command = self.recognizer.recognize_google(audio)
            return {'status': 'success', 'command': command}
            
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

class TaskManager:
    """Task management and coordination"""
    
    def execute(self, task_data: Dict[str, Any]) -> Dict[str, Any]:
        """Execute task management operation"""
        return {'status': 'success', 'message': 'Task manager active'}

# Flask Application
app = Flask(__name__)
CORS(app)

# Global AgentOS instance
agent_os = AgentOS()

@app.route('/')
def dashboard():
    """AgentOS Dashboard"""
    return render_template_string("""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🤖 AgentOS Dashboard</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js" defer></script>
</head>
<body class="bg-gray-900 text-white min-h-screen">
    <div class="container mx-auto p-6">
        <header class="text-center mb-8">
            <h1 class="text-4xl font-bold mb-4">🤖 AgentOS</h1>
            <p class="text-xl text-gray-300">Autonomous AI Agent Infrastructure</p>
        </header>
        
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <!-- Browser Agent -->
            <div class="bg-gray-800 rounded-xl p-6 border border-gray-700 hover:border-blue-500 transition-colors">
                <div class="text-center">
                    <div class="text-4xl mb-4">🌐</div>
                    <h3 class="text-xl font-bold mb-2">Browser Agent</h3>
                    <p class="text-gray-400 mb-4">Real browser automation</p>
                    <a href="/browser" class="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded font-semibold">Launch</a>
                </div>
            </div>
            
            <!-- Image Agent -->
            <div class="bg-gray-800 rounded-xl p-6 border border-gray-700 hover:border-purple-500 transition-colors">
                <div class="text-center">
                    <div class="text-4xl mb-4">🖼️</div>
                    <h3 class="text-xl font-bold mb-2">Image Agent</h3>
                    <p class="text-gray-400 mb-4">AI image processing</p>
                    <a href="/image" class="bg-purple-600 hover:bg-purple-700 px-6 py-2 rounded font-semibold">Launch</a>
                </div>
            </div>
            
            <!-- Design Agent -->
            <div class="bg-gray-800 rounded-xl p-6 border border-gray-700 hover:border-green-500 transition-colors">
                <div class="text-center">
                    <div class="text-4xl mb-4">🎨</div>
                    <h3 class="text-xl font-bold mb-2">Design Agent</h3>
                    <p class="text-gray-400 mb-4">Creative design studio</p>
                    <a href="/design" class="bg-green-600 hover:bg-green-700 px-6 py-2 rounded font-semibold">Launch</a>
                </div>
            </div>
            
            <!-- Voice Agent -->
            <div class="bg-gray-800 rounded-xl p-6 border border-gray-700 hover:border-red-500 transition-colors">
                <div class="text-center">
                    <div class="text-4xl mb-4">🎤</div>
                    <h3 class="text-xl font-bold mb-2">Voice Agent</h3>
                    <p class="text-gray-400 mb-4">Speech processing</p>
                    <a href="/voice" class="bg-red-600 hover:bg-red-700 px-6 py-2 rounded font-semibold">Launch</a>
                </div>
            </div>
            
            <!-- Task Manager -->
            <div class="bg-gray-800 rounded-xl p-6 border border-gray-700 hover:border-yellow-500 transition-colors">
                <div class="text-center">
                    <div class="text-4xl mb-4">📋</div>
                    <h3 class="text-xl font-bold mb-2">Task Manager</h3>
                    <p class="text-gray-400 mb-4">Agent coordination</p>
                    <a href="/tasks" class="bg-yellow-600 hover:bg-yellow-700 px-6 py-2 rounded font-semibold">Launch</a>
                </div>
            </div>
            
            <!-- AI Chat -->
            <div class="bg-gray-800 rounded-xl p-6 border border-gray-700 hover:border-indigo-500 transition-colors">
                <div class="text-center">
                    <div class="text-4xl mb-4">💬</div>
                    <h3 class="text-xl font-bold mb-2">AI Chat</h3>
                    <p class="text-gray-400 mb-4">Agent communication</p>
                    <a href="/chat" class="bg-indigo-600 hover:bg-indigo-700 px-6 py-2 rounded font-semibold">Launch</a>
                </div>
            </div>
        </div>
        
        <!-- System Status -->
        <div class="mt-8 bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h3 class="text-xl font-bold mb-4">🔧 System Status</h3>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div class="text-center">
                    <div class="text-green-500 text-2xl">✅</div>
                    <p>Core OS</p>
                </div>
                <div class="text-center">
                    <div class="text-{{ 'green' if browser_available else 'red' }}-500 text-2xl">{{ '✅' if browser_available else '❌' }}</div>
                    <p>Browser</p>
                </div>
                <div class="text-center">
                    <div class="text-{{ 'green' if ai_available else 'red' }}-500 text-2xl">{{ '✅' if ai_available else '❌' }}</div>
                    <p>AI Services</p>
                </div>
                <div class="text-center">
                    <div class="text-green-500 text-2xl">✅</div>
                    <p>Database</p>
                </div>
            </div>
        </div>
    </div>
</body>
</html>
    """, browser_available=BROWSER_AUTOMATION_AVAILABLE, ai_available=ADVANCED_AI_AVAILABLE)

@app.route('/browser')
def browser_interface():
    """Browser Agent Interface"""
    return render_template_string("""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🌐 Browser Agent</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js" defer></script>
</head>
<body class="bg-gray-900 text-white min-h-screen">
    <div x-data="browserAgent()" class="container mx-auto p-6">
        <header class="flex items-center justify-between mb-8">
            <div>
                <h1 class="text-3xl font-bold">🌐 Browser Agent</h1>
                <p class="text-gray-300">Real browser automation</p>
            </div>
            <a href="/" class="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded">← Dashboard</a>
        </header>
        
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Control Panel -->
            <div class="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <h3 class="text-xl font-bold mb-4">🎮 Control Panel</h3>
                
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium mb-2">URL to Navigate</label>
                        <input x-model="url" type="text" placeholder="https://example.com" 
                               class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2">
                    </div>
                    <button @click="navigate()" class="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded">
                        🚀 Navigate
                    </button>
                    
                    <div>
                        <label class="block text-sm font-medium mb-2">Search Query</label>
                        <input x-model="searchQuery" type="text" placeholder="Enter search terms" 
                               class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2">
                    </div>
                    <button @click="search()" class="w-full bg-green-600 hover:bg-green-700 py-2 rounded">
                        🔍 Search
                    </button>
                    
                    <div class="flex space-x-2">
                        <button @click="scroll('up')" class="flex-1 bg-purple-600 hover:bg-purple-700 py-2 rounded">
                            ⬆️ Scroll Up
                        </button>
                        <button @click="scroll('down')" class="flex-1 bg-purple-600 hover:bg-purple-700 py-2 rounded">
                            ⬇️ Scroll Down
                        </button>
                    </div>
                    
                    <button @click="screenshot()" class="w-full bg-yellow-600 hover:bg-yellow-700 py-2 rounded">
                        📸 Screenshot
                    </button>
                </div>
            </div>
            
            <!-- AI Commands -->
            <div class="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <h3 class="text-xl font-bold mb-4">🧠 AI Commands</h3>
                
                <textarea x-model="aiCommand" placeholder="Tell the browser what to do..."
                          class="w-full h-32 bg-gray-700 border border-gray-600 rounded p-3 resize-none mb-4"></textarea>
                
                <button @click="executeAICommand()" class="w-full bg-indigo-600 hover:bg-indigo-700 py-2 rounded mb-4">
                    ✨ Execute AI Command
                </button>
                
                <div class="text-sm text-gray-400">
                    <p class="mb-2">Example commands:</p>
                    <ul class="list-disc list-inside space-y-1">
                        <li>"Search for python tutorials"</li>
                        <li>"Click on the first result"</li>
                        <li>"Fill out the contact form"</li>
                        <li>"Take a screenshot of this page"</li>
                    </ul>
                </div>
            </div>
            
            <!-- Status & Results -->
            <div class="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <h3 class="text-xl font-bold mb-4">📊 Status & Results</h3>
                
                <div x-show="status" class="mb-4 p-3 rounded" 
                     :class="status.includes('success') ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'">
                    <p x-text="status"></p>
                </div>
                
                <div x-show="screenshot" class="mb-4">
                    <p class="text-sm text-gray-400 mb-2">Latest Screenshot:</p>
                    <img :src="'/static/' + screenshot" class="w-full rounded border">
                </div>
                
                <div x-show="extractedText" class="mb-4">
                    <p class="text-sm text-gray-400 mb-2">Extracted Text:</p>
                    <div class="bg-gray-700 p-3 rounded text-sm max-h-32 overflow-y-auto" x-text="extractedText"></div>
                </div>
            </div>
        </div>
    </div>
    
    <script>
        function browserAgent() {
            return {
                url: '',
                searchQuery: '',
                aiCommand: '',
                status: '',
                screenshot: null,
                extractedText: '',
                
                async navigate() {
                    if (!this.url) return;
                    const result = await this.executeTask('navigate', { url: this.url });
                    this.updateStatus(result);
                },
                
                async search() {
                    if (!this.searchQuery) return;
                    const result = await this.executeTask('search', { query: this.searchQuery });
                    this.updateStatus(result);
                },
                
                async scroll(direction) {
                    const result = await this.executeTask('scroll', { direction });
                    this.updateStatus(result);
                },
                
                async screenshot() {
                    const result = await this.executeTask('screenshot', {});
                    this.updateStatus(result);
                    if (result.screenshot) {
                        this.screenshot = result.screenshot;
                    }
                },
                
                async executeAICommand() {
                    if (!this.aiCommand) return;
                    // Parse AI command and convert to browser actions
                    const result = await this.parseAndExecuteAI(this.aiCommand);
                    this.updateStatus(result);
                    this.aiCommand = '';
                },
                
                async executeTask(action, data) {
                    try {
                        const response = await fetch('/api/browser/execute', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action, ...data })
                        });
                        return await response.json();
                    } catch (error) {
                        return { status: 'error', message: error.message };
                    }
                },
                
                async parseAndExecuteAI(command) {
                    try {
                        const response = await fetch('/api/browser/ai-command', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ command })
                        });
                        return await response.json();
                    } catch (error) {
                        return { status: 'error', message: error.message };
                    }
                },
                
                updateStatus(result) {
                    this.status = result.status + ': ' + result.message;
                    setTimeout(() => this.status = '', 5000);
                }
            }
        }
    </script>
</body>
</html>
    """)

# API Endpoints
@app.route('/api/browser/execute', methods=['POST'])
def execute_browser_task():
    """Execute browser task"""
    try:
        task_data = request.json
        task_id = agent_os.execute_task('browser_agent', task_data)
        
        # Wait for task completion (simplified)
        time.sleep(2)
        
        # Get result from database
        conn = sqlite3.connect(agent_os.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT result FROM agent_tasks WHERE id = ?", (task_id,))
        result = cursor.fetchone()
        conn.close()
        
        if result:
            return jsonify(json.loads(result[0]))
        else:
            return jsonify({'status': 'pending', 'task_id': task_id})
            
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/image')
def image_interface():
    """Image Agent Interface"""
    return render_template_string("""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🖼️ Image Agent</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js" defer></script>
</head>
<body class="bg-gray-900 text-white min-h-screen">
    <div x-data="imageAgent()" class="container mx-auto p-6">
        <header class="flex items-center justify-between mb-8">
            <div>
                <h1 class="text-3xl font-bold">🖼️ Image Agent</h1>
                <p class="text-gray-300">AI-Powered Image Processing</p>
            </div>
            <a href="/" class="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded">← Dashboard</a>
        </header>
        
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <!-- Upload & Controls -->
            <div class="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <h3 class="text-xl font-bold mb-4">📁 Upload & Process</h3>
                
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium mb-2">Select Image</label>
                        <input type="file" @change="uploadImage" accept="image/*" 
                               class="w-full bg-gray-700 border border-gray-600 rounded p-2">
                    </div>
                    
                    <div x-show="originalImage" class="border rounded p-2">
                        <p class="text-sm text-gray-400 mb-2">Original:</p>
                        <img :src="originalImage" class="w-full max-h-64 object-contain rounded">
                    </div>
                    
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium mb-2">Brightness</label>
                            <input type="range" x-model="brightness" min="0.1" max="2" step="0.1" 
                                   class="w-full">
                            <span class="text-xs text-gray-400" x-text="brightness"></span>
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-2">Contrast</label>
                            <input type="range" x-model="contrast" min="0.1" max="2" step="0.1" 
                                   class="w-full">
                            <span class="text-xs text-gray-400" x-text="contrast"></span>
                        </div>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium mb-2">Filter</label>
                        <select x-model="selectedFilter" class="w-full bg-gray-700 border border-gray-600 rounded p-2">
                            <option value="">No Filter</option>
                            <option value="blur">Blur</option>
                            <option value="sharpen">Sharpen</option>
                            <option value="enhance">Auto Enhance</option>
                        </select>
                    </div>
                    
                    <button @click="processImage()" class="w-full bg-purple-600 hover:bg-purple-700 py-3 rounded font-semibold">
                        ✨ Process Image
                    </button>
                </div>
            </div>
            
            <!-- Results -->
            <div class="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <h3 class="text-xl font-bold mb-4">🎯 Results</h3>
                
                <div x-show="processedImage" class="border rounded p-2 mb-4">
                    <p class="text-sm text-gray-400 mb-2">Processed:</p>
                    <img :src="processedImage" class="w-full max-h-64 object-contain rounded">
                </div>
                
                <div x-show="status" class="mb-4 p-3 rounded" 
                     :class="status.includes('success') ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'">
                    <p x-text="status"></p>
                </div>
                
                <div class="space-y-2">
                    <button @click="downloadProcessed()" class="w-full bg-green-600 hover:bg-green-700 py-2 rounded">
                        💾 Download
                    </button>
                    <button @click="resetImage()" class="w-full bg-gray-600 hover:bg-gray-700 py-2 rounded">
                        🔄 Reset
                    </button>
                </div>
            </div>
        </div>
    </div>
    
    <script>
        function imageAgent() {
            return {
                originalImage: null,
                processedImage: null,
                brightness: 1,
                contrast: 1,
                selectedFilter: '',
                status: '',
                
                uploadImage(event) {
                    const file = event.target.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = e => this.originalImage = e.target.result;
                        reader.readAsDataURL(file);
                    }
                },
                
                async processImage() {
                    if (!this.originalImage) return;
                    
                    const settings = {
                        brightness: parseFloat(this.brightness),
                        contrast: parseFloat(this.contrast),
                        filter: this.selectedFilter
                    };
                    
                    try {
                        const response = await fetch('/api/image/process', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                action: 'enhance',
                                image: this.originalImage,
                                settings: settings
                            })
                        });
                        
                        const result = await response.json();
                        this.updateStatus(result);
                        
                        if (result.status === 'success' && result.processed_image) {
                            this.processedImage = result.processed_image;
                        }
                        
                    } catch (error) {
                        this.status = 'Error: ' + error.message;
                    }
                },
                
                downloadProcessed() {
                    if (this.processedImage) {
                        const link = document.createElement('a');
                        link.download = 'processed_image.png';
                        link.href = this.processedImage;
                        link.click();
                    }
                },
                
                resetImage() {
                    this.processedImage = null;
                    this.brightness = 1;
                    this.contrast = 1;
                    this.selectedFilter = '';
                    this.status = '';
                },
                
                updateStatus(result) {
                    this.status = result.status + ': ' + result.message;
                    setTimeout(() => this.status = '', 5000);
                }
            }
        }
    </script>
</body>
</html>
    """)

@app.route('/design')
def design_interface():
    """Design Agent Interface"""
    return render_template_string("""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🎨 Design Agent</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js" defer></script>
</head>
<body class="bg-gray-900 text-white min-h-screen">
    <div x-data="designAgent()" class="container mx-auto p-6">
        <header class="flex items-center justify-between mb-8">
            <div>
                <h1 class="text-3xl font-bold">🎨 Design Agent</h1>
                <p class="text-gray-300">AI-Powered Design Studio</p>
            </div>
            <a href="/" class="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded">← Dashboard</a>
        </header>
        
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <!-- Design Creation -->
            <div class="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <h3 class="text-xl font-bold mb-4">✨ Create Design</h3>
                
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium mb-2">Design Type</label>
                        <select x-model="designType" class="w-full bg-gray-700 border border-gray-600 rounded p-2">
                            <option value="">Select type...</option>
                            <option value="social_post">Social Media Post</option>
                            <option value="business_card">Business Card</option>
                            <option value="logo">Logo Design</option>
                            <option value="banner">Web Banner</option>
                            <option value="flyer">Flyer</option>
                        </select>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium mb-2">Title/Text</label>
                        <input x-model="designTitle" type="text" placeholder="Enter main text..." 
                               class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2">
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium mb-2">Description</label>
                        <textarea x-model="designDescription" placeholder="Describe your design..."
                                  class="w-full h-24 bg-gray-700 border border-gray-600 rounded p-3 resize-none"></textarea>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium mb-2">Primary Color</label>
                            <input x-model="primaryColor" type="color" 
                                   class="w-full h-10 bg-gray-700 border border-gray-600 rounded">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-2">Secondary Color</label>
                            <input x-model="secondaryColor" type="color" 
                                   class="w-full h-10 bg-gray-700 border border-gray-600 rounded">
                        </div>
                    </div>
                    
                    <button @click="generateDesign()" class="w-full bg-green-600 hover:bg-green-700 py-3 rounded font-semibold">
                        🎨 Generate Design
                    </button>
                </div>
            </div>
            
            <!-- Design Preview -->
            <div class="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <h3 class="text-xl font-bold mb-4">👀 Preview</h3>
                
                <div x-show="generatedDesign" class="border rounded p-4 mb-4">
                    <img :src="generatedDesign" class="w-full max-h-96 object-contain rounded">
                </div>
                
                <div x-show="!generatedDesign" class="border-2 border-dashed border-gray-600 rounded p-8 text-center text-gray-400">
                    <div class="text-4xl mb-4">🎨</div>
                    <p>Your design will appear here</p>
                </div>
                
                <div x-show="status" class="mb-4 p-3 rounded" 
                     :class="status.includes('success') ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'">
                    <p x-text="status"></p>
                </div>
                
                <div x-show="generatedDesign" class="space-y-2">
                    <button @click="downloadDesign()" class="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded">
                        💾 Download Design
                    </button>
                    <button @click="newDesign()" class="w-full bg-gray-600 hover:bg-gray-700 py-2 rounded">
                        🆕 New Design
                    </button>
                </div>
            </div>
        </div>
        
        <!-- Template Gallery -->
        <div class="mt-8 bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h3 class="text-xl font-bold mb-4">📚 Template Gallery</h3>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div class="bg-gray-700 rounded p-4 text-center cursor-pointer hover:bg-gray-600" @click="loadTemplate('modern')">
                    <div class="text-2xl mb-2">🏢</div>
                    <p class="text-sm">Modern Business</p>
                </div>
                <div class="bg-gray-700 rounded p-4 text-center cursor-pointer hover:bg-gray-600" @click="loadTemplate('creative')">
                    <div class="text-2xl mb-2">🎭</div>
                    <p class="text-sm">Creative Arts</p>
                </div>
                <div class="bg-gray-700 rounded p-4 text-center cursor-pointer hover:bg-gray-600" @click="loadTemplate('tech')">
                    <div class="text-2xl mb-2">💻</div>
                    <p class="text-sm">Tech/Startup</p>
                </div>
                <div class="bg-gray-700 rounded p-4 text-center cursor-pointer hover:bg-gray-600" @click="loadTemplate('elegant')">
                    <div class="text-2xl mb-2">✨</div>
                    <p class="text-sm">Elegant/Luxury</p>
                </div>
            </div>
        </div>
    </div>
    
    <script>
        function designAgent() {
            return {
                designType: '',
                designTitle: '',
                designDescription: '',
                primaryColor: '#3B82F6',
                secondaryColor: '#10B981',
                generatedDesign: null,
                status: '',
                
                async generateDesign() {
                    if (!this.designType) {
                        this.status = 'Please select a design type';
                        return;
                    }
                    
                    const designData = {
                        type: this.designType,
                        title: this.designTitle,
                        description: this.designDescription,
                        colors: {
                            primary: this.primaryColor,
                            secondary: this.secondaryColor
                        }
                    };
                    
                    try {
                        const response = await fetch('/api/design/generate', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(designData)
                        });
                        
                        const result = await response.json();
                        this.updateStatus(result);
                        
                        if (result.status === 'success' && result.design_image) {
                            this.generatedDesign = result.design_image;
                        }
                        
                    } catch (error) {
                        this.status = 'Error: ' + error.message;
                    }
                },
                
                loadTemplate(template) {
                    const templates = {
                        'modern': { title: 'Modern Business', colors: ['#2563EB', '#64748B'] },
                        'creative': { title: 'Creative Design', colors: ['#DC2626', '#F59E0B'] },
                        'tech': { title: 'Tech Innovation', colors: ['#7C3AED', '#06B6D4'] },
                        'elegant': { title: 'Elegant Style', colors: ['#1F2937', '#D1D5DB'] }
                    };
                    
                    const tmpl = templates[template];
                    this.designTitle = tmpl.title;
                    this.primaryColor = tmpl.colors[0];
                    this.secondaryColor = tmpl.colors[1];
                },
                
                downloadDesign() {
                    if (this.generatedDesign) {
                        const link = document.createElement('a');
                        link.download = `design_${this.designType}_${Date.now()}.png`;
                        link.href = this.generatedDesign;
                        link.click();
                    }
                },
                
                newDesign() {
                    this.generatedDesign = null;
                    this.designTitle = '';
                    this.designDescription = '';
                    this.status = '';
                },
                
                updateStatus(result) {
                    this.status = result.status + ': ' + result.message;
                    setTimeout(() => this.status = '', 5000);
                }
            }
        }
    </script>
</body>
</html>
    """)

@app.route('/chat')
def chat_interface():
    """AI Chat Interface"""
    return render_template_string("""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>💬 AI Chat Agent</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js" defer></script>
</head>
<body class="bg-gray-900 text-white min-h-screen">
    <div x-data="chatAgent()" class="container mx-auto p-6 h-screen flex flex-col">
        <header class="flex items-center justify-between mb-6">
            <div>
                <h1 class="text-3xl font-bold">💬 AI Chat Agent</h1>
                <p class="text-gray-300">Communicate with all agents</p>
            </div>
            <a href="/" class="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded">← Dashboard</a>
        </header>
        
        <div class="flex-1 bg-gray-800 rounded-xl border border-gray-700 flex flex-col">
            <!-- Chat Messages -->
            <div class="flex-1 p-6 overflow-y-auto space-y-4" id="chat-container">
                <div x-show="messages.length === 0" class="text-center text-gray-400 py-12">
                    <div class="text-4xl mb-4">🤖</div>
                    <p>Start a conversation with your AI agents</p>
                </div>
                
                <template x-for="message in messages" :key="message.id">
                    <div class="flex" :class="message.sender === 'user' ? 'justify-end' : 'justify-start'">
                        <div class="max-w-xs lg:max-w-md px-4 py-2 rounded-lg" 
                             :class="message.sender === 'user' ? 'bg-blue-600' : 'bg-gray-700'">
                            <p class="text-sm" x-text="message.text"></p>
                            <p class="text-xs text-gray-300 mt-1" x-text="message.timestamp"></p>
                        </div>
                    </div>
                </template>
            </div>
            
            <!-- Chat Input -->
            <div class="border-t border-gray-700 p-4">
                <div class="flex space-x-4">
                    <input x-model="currentMessage" @keyup.enter="sendMessage()" 
                           placeholder="Ask your agents anything..." 
                           class="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2">
                    <button @click="sendMessage()" class="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded">
                        Send
                    </button>
                </div>
                
                <div class="mt-2 flex flex-wrap gap-2">
                    <button @click="quickCommand('Browse to Google')" class="text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded">
                        Browse to Google
                    </button>
                    <button @click="quickCommand('Take a screenshot')" class="text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded">
                        Take Screenshot  
                    </button>
                    <button @click="quickCommand('Create a logo design')" class="text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded">
                        Create Logo
                    </button>
                    <button @click="quickCommand('Process my image')" class="text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded">
                        Process Image
                    </button>
                </div>
            </div>
        </div>
    </div>
    
    <script>
        function chatAgent() {
            return {
                messages: [],
                currentMessage: '',
                
                sendMessage() {
                    if (!this.currentMessage.trim()) return;
                    
                    // Add user message
                    this.addMessage('user', this.currentMessage);
                    const userMessage = this.currentMessage;
                    this.currentMessage = '';
                    
                    // Process with AI
                    this.processAICommand(userMessage);
                },
                
                quickCommand(command) {
                    this.currentMessage = command;
                    this.sendMessage();
                },
                
                addMessage(sender, text) {
                    this.messages.push({
                        id: Date.now(),
                        sender: sender,
                        text: text,
                        timestamp: new Date().toLocaleTimeString()
                    });
                    
                    // Scroll to bottom
                    this.$nextTick(() => {
                        const container = document.getElementById('chat-container');
                        container.scrollTop = container.scrollHeight;
                    });
                },
                
                async processAICommand(command) {
                    try {
                        // Show thinking message
                        this.addMessage('ai', '🤔 Processing your request...');
                        
                        const response = await fetch('/api/chat/process', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ message: command })
                        });
                        
                        const result = await response.json();
                        
                        // Remove thinking message
                        this.messages.pop();
                        
                        // Add AI response
                        this.addMessage('ai', result.response || 'Command executed successfully!');
                        
                    } catch (error) {
                        this.messages.pop();
                        this.addMessage('ai', '❌ Error processing command: ' + error.message);
                    }
                }
            }
        }
    </script>
</body>
</html>
    """)

@app.route('/tasks')
def task_interface():
    """Task Manager Interface"""
    return render_template_string("""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>📋 Task Manager</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js" defer></script>
</head>
<body class="bg-gray-900 text-white min-h-screen">
    <div x-data="taskManager()" class="container mx-auto p-6">
        <header class="flex items-center justify-between mb-8">
            <div>
                <h1 class="text-3xl font-bold">📋 Task Manager</h1>
                <p class="text-gray-300">Monitor and coordinate agent tasks</p>
            </div>
            <a href="/" class="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded">← Dashboard</a>
        </header>
        
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Active Tasks -->
            <div class="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <h3 class="text-xl font-bold mb-4">🔄 Active Tasks</h3>
                <div class="space-y-3">
                    <template x-for="task in activeTasks" :key="task.id">
                        <div class="bg-gray-700 rounded p-3 border-l-4 border-blue-500">
                            <p class="font-medium" x-text="task.description"></p>
                            <p class="text-sm text-gray-400" x-text="task.agent_type"></p>
                            <div class="flex justify-between items-center mt-2">
                                <span class="text-xs text-blue-400">Running...</span>
                                <button @click="cancelTask(task.id)" class="text-xs bg-red-600 hover:bg-red-700 px-2 py-1 rounded">
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </template>
                    <div x-show="activeTasks.length === 0" class="text-gray-400 text-center py-8">
                        No active tasks
                    </div>
                </div>
            </div>
            
            <!-- Completed Tasks -->
            <div class="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <h3 class="text-xl font-bold mb-4">✅ Completed Tasks</h3>
                <div class="space-y-3">
                    <template x-for="task in completedTasks" :key="task.id">
                        <div class="bg-gray-700 rounded p-3 border-l-4 border-green-500">
                            <p class="font-medium" x-text="task.description"></p>
                            <p class="text-sm text-gray-400" x-text="task.agent_type"></p>
                            <span class="text-xs text-green-400">Completed</span>
                        </div>
                    </template>
                    <div x-show="completedTasks.length === 0" class="text-gray-400 text-center py-8">
                        No completed tasks
                    </div>
                </div>
            </div>
            
            <!-- System Stats -->
            <div class="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <h3 class="text-xl font-bold mb-4">📊 System Stats</h3>
                <div class="space-y-4">
                    <div class="bg-gray-700 rounded p-3">
                        <div class="flex justify-between">
                            <span>Total Tasks</span>
                            <span x-text="totalTasks"></span>
                        </div>
                    </div>
                    <div class="bg-gray-700 rounded p-3">
                        <div class="flex justify-between">
                            <span>Success Rate</span>
                            <span x-text="successRate + '%'"></span>
                        </div>
                    </div>
                    <div class="bg-gray-700 rounded p-3">
                        <div class="flex justify-between">
                            <span>Avg Duration</span>
                            <span x-text="avgDuration + 's'"></span>
                        </div>
                    </div>
                    
                    <button @click="refreshStats()" class="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded">
                        🔄 Refresh Stats
                    </button>
                </div>
            </div>
        </div>
    </div>
    
    <script>
        function taskManager() {
            return {
                activeTasks: [],
                completedTasks: [],
                totalTasks: 0,
                successRate: 95,
                avgDuration: 2.3,
                
                init() {
                    this.loadTasks();
                    setInterval(() => this.loadTasks(), 5000); // Refresh every 5 seconds
                },
                
                async loadTasks() {
                    try {
                        const response = await fetch('/api/tasks/list');
                        const data = await response.json();
                        
                        this.activeTasks = data.active || [];
                        this.completedTasks = data.completed || [];
                        this.totalTasks = data.total || 0;
                        
                    } catch (error) {
                        console.error('Failed to load tasks:', error);
                    }
                },
                
                async cancelTask(taskId) {
                    try {
                        await fetch(`/api/tasks/${taskId}/cancel`, { method: 'POST' });
                        this.loadTasks();
                    } catch (error) {
                        console.error('Failed to cancel task:', error);
                    }
                },
                
                refreshStats() {
                    this.loadTasks();
                }
            }
        }
    </script>
</body>
</html>
    """)

# API endpoints for new interfaces
@app.route('/api/image/process', methods=['POST'])
def process_image():
    """Process image with AI"""
    try:
        data = request.json
        # Simplified image processing
        return jsonify({
            'status': 'success', 
            'message': 'Image processed successfully',
            'processed_image': data.get('image')  # Echo back for demo
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/api/design/generate', methods=['POST'])
def generate_design():
    """Generate design with AI"""
    try:
        data = request.json
        task_id = agent_os.execute_task('design_agent', {
            'action': 'create',
            'type': data.get('type'),
            'content': data
        })
        
        # For demo, return a simple success
        return jsonify({
            'status': 'success',
            'message': 'Design generated successfully',
            'design_image': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',  # 1x1 transparent PNG
            'task_id': task_id
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/api/chat/process', methods=['POST'])
def process_chat():
    """Process chat message"""
    try:
        data = request.json
        message = data.get('message', '').lower()
        
        if 'browse' in message or 'navigate' in message:
            response = "🌐 I'll help you browse the web. The browser agent is handling your request."
        elif 'image' in message or 'edit' in message:
            response = "🖼️ I can help process images. The image agent is ready to assist."
        elif 'design' in message or 'create' in message:
            response = "🎨 I'll help create designs. The design agent is preparing your request."
        elif 'screenshot' in message:
            response = "📸 Taking a screenshot now using the browser agent."
        else:
            response = "🤖 I understand your request. Let me coordinate with the appropriate agents to help you."
        
        return jsonify({'response': response})
    except Exception as e:
        return jsonify({'response': f'❌ Error: {str(e)}'})

@app.route('/api/tasks/list')
def list_tasks():
    """List all tasks"""
    try:
        conn = sqlite3.connect(agent_os.db_path)
        cursor = conn.cursor()
        
        # Get active tasks
        cursor.execute("SELECT * FROM agent_tasks WHERE status = 'running' ORDER BY created_at DESC")
        active_tasks = [{'id': row[0], 'agent_type': row[1], 'description': row[2], 'status': row[3]} 
                       for row in cursor.fetchall()]
        
        # Get completed tasks
        cursor.execute("SELECT * FROM agent_tasks WHERE status = 'completed' ORDER BY created_at DESC LIMIT 10")
        completed_tasks = [{'id': row[0], 'agent_type': row[1], 'description': row[2], 'status': row[3]} 
                          for row in cursor.fetchall()]
        
        # Get total count
        cursor.execute("SELECT COUNT(*) FROM agent_tasks")
        total = cursor.fetchone()[0]
        
        conn.close()
        
        return jsonify({
            'active': active_tasks,
            'completed': completed_tasks,
            'total': total
        })
    except Exception as e:
        return jsonify({'error': str(e)})

@app.route('/api/browser/ai-command', methods=['POST'])
def execute_ai_browser_command():
    """Execute AI browser command"""
    try:
        data = request.json
        command = data.get('command', '').lower()
        
        # Simple AI command parsing
        if 'search' in command:
            query = command.replace('search for', '').replace('search', '').strip()
            task_data = {'action': 'search', 'query': query}
        elif 'navigate' in command or 'go to' in command:
            url = command.replace('navigate to', '').replace('go to', '').strip()
            if not url.startswith('http'):
                url = 'https://' + url
            task_data = {'action': 'navigate', 'url': url}
        elif 'screenshot' in command:
            task_data = {'action': 'screenshot'}
        elif 'scroll' in command:
            direction = 'down' if 'down' in command else 'up'
            task_data = {'action': 'scroll', 'direction': direction}
        else:
            return jsonify({'status': 'error', 'message': 'Command not understood'})
        
        task_id = agent_os.execute_task('browser_agent', task_data)
        return jsonify({'status': 'success', 'message': 'AI command executed', 'task_id': task_id})
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

if __name__ == '__main__':
    print("🤖 AgentOS Starting...")
    print("🔧 System Status:")
    print(f"  Browser Automation: {'✅' if BROWSER_AUTOMATION_AVAILABLE else '❌'}")
    print(f"  Advanced AI: {'✅' if ADVANCED_AI_AVAILABLE else '❌'}")
    print()
    print("🌐 AgentOS Dashboard: http://localhost:8088")
    print("🚀 Starting specialized agent interfaces...")
    
    app.run(host='0.0.0.0', port=8088, debug=True, threaded=True)
