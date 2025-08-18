#!/usr/bin/env python3
"""
SINTRA AI SOCIAL MEDIA TOOL - DEMO VERSION
A comprehensive AI-powered social media management platform demo
This version works without external dependencies for demonstration
"""

import os
import sys
import json
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
import logging
from flask import Flask, render_template, request, jsonify
import hashlib
import random

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - SINTRA-AI - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('sintra_demo.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("SintraDemo")

class SintraDemoAI:
    """Sintra AI Social Media Tool - Demo Version"""
    
    def __init__(self):
        self.app = Flask(__name__)
        self.app.secret_key = "sintra_demo_key_2025"
        
        # Demo configuration
        self.platforms = {
            "twitter": {"name": "Twitter/X", "enabled": True, "status": "connected"},
            "facebook": {"name": "Facebook", "enabled": False, "status": "setup_required"},
            "instagram": {"name": "Instagram", "enabled": False, "status": "setup_required"},
            "linkedin": {"name": "LinkedIn", "enabled": False, "status": "setup_required"}
        }
        
        # Initialize demo database
        self.db_path = "sintra_demo.db"
        self.initialize_demo_database()
        
        # Demo content templates
        self.content_templates = {
            'motivation': {
                'templates': [
                    "🚀 Success isn't just about what you accomplish in your life, it's about what you inspire others to do. Keep pushing forward! #Motivation #Success #Leadership",
                    "💪 The difference between ordinary and extraordinary is that little 'extra'. What extra effort will you put in today? #Excellence #Growth #Mindset",
                    "✨ Your future self is counting on the decisions you make today. Make them count! #FutureSuccess #Goals #Achievement"
                ]
            },
            'industry_news': {
                'templates': [
                    "🧠 AI is revolutionizing how businesses operate. From automation to insights, the future is here. What AI tools are transforming your industry? #AI #Innovation #Business",
                    "📊 The social media landscape is evolving rapidly. New platforms, changing algorithms, and emerging trends. How are you adapting? #SocialMedia #Marketing #Trends",
                    "🔮 Remote work has become the new normal, but the tools we use are still evolving. What's working best for your team? #RemoteWork #Productivity #Technology"
                ]
            },
            'tips': {
                'templates': [
                    "💡 Pro Tip: The best time to post on social media varies by platform. Twitter: 9am-10am, Facebook: 1pm-3pm, LinkedIn: 8am-10am. Track your analytics! #SocialMediaTips #Marketing",
                    "🎯 Content Strategy Tip: Follow the 80/20 rule - 80% valuable content, 20% promotional. Your audience will thank you! #ContentStrategy #Marketing #Value",
                    "📈 Growth Hack: Engage with your audience's content before posting your own. Community building leads to better reach! #GrowthHacking #Engagement #Community"
                ]
            },
            'behind_scenes': {
                'templates': [
                    "🎬 Behind the scenes at our office: Building the future of social media automation! Our team is passionate about creating tools that save you time ⚡ #BehindTheScenes #TeamWork #Innovation",
                    "☕ Morning coffee and strategy sessions - this is how great content ideas are born! What does your creative process look like? #CreativeProcess #TeamWork #Coffee",
                    "🔧 Testing new features today! Our development team is working on some exciting updates that will revolutionize your social media workflow 🚀 #Development #Innovation #ComingSoon"
                ]
            }
        }
        
        logger.info("🚀 Sintra AI Demo initialized")

    def initialize_demo_database(self):
        """Initialize demo database with sample data"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Demo posts table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS demo_posts (
                id INTEGER PRIMARY KEY,
                content TEXT NOT NULL,
                platforms TEXT NOT NULL,
                scheduled_time TIMESTAMP,
                status TEXT DEFAULT 'scheduled',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Demo analytics table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS demo_analytics (
                id INTEGER PRIMARY KEY,
                post_id INTEGER,
                platform TEXT NOT NULL,
                likes INTEGER DEFAULT 0,
                shares INTEGER DEFAULT 0,
                comments INTEGER DEFAULT 0,
                impressions INTEGER DEFAULT 0,
                engagement_rate REAL DEFAULT 0.0,
                date DATE DEFAULT CURRENT_DATE
            )
        """)
        
        # Add sample data
        cursor.execute("SELECT COUNT(*) FROM demo_posts")
        if cursor.fetchone()[0] == 0:
            sample_posts = [
                ("🚀 Excited to announce our new AI-powered social media tool! #Innovation #AI #SocialMedia", '["twitter", "linkedin"]', datetime.now() - timedelta(days=1), 'posted'),
                ("💡 Pro tip: Consistency is key in social media marketing! #Tips #Marketing", '["facebook", "twitter"]', datetime.now() - timedelta(hours=6), 'posted'),
                ("🎯 Our team is working on amazing new features! Stay tuned... #Development #ComingSoon", '["twitter", "instagram"]', datetime.now() + timedelta(hours=2), 'scheduled')
            ]
            
            for content, platforms, scheduled_time, status in sample_posts:
                cursor.execute("""
                    INSERT INTO demo_posts (content, platforms, scheduled_time, status)
                    VALUES (?, ?, ?, ?)
                """, (content, platforms, scheduled_time, status))
                
                post_id = cursor.lastrowid
                
                # Add sample analytics for posted items
                if status == 'posted':
                    platforms_list = json.loads(platforms)
                    for platform in platforms_list:
                        likes = random.randint(15, 150)
                        shares = random.randint(2, 25)
                        comments = random.randint(1, 15)
                        impressions = random.randint(500, 2000)
                        engagement_rate = (likes + shares + comments) / impressions
                        
                        cursor.execute("""
                            INSERT INTO demo_analytics 
                            (post_id, platform, likes, shares, comments, impressions, engagement_rate)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        """, (post_id, platform, likes, shares, comments, impressions, engagement_rate))
        
        conn.commit()
        conn.close()
        logger.info("📊 Demo database initialized")

    def generate_demo_content(self, prompt: str, platform: str = "twitter") -> str:
        """Generate demo content based on prompt"""
        try:
            # Simple demo content generation
            prompt_lower = prompt.lower()
            
            # Determine content type
            if any(word in prompt_lower for word in ['motivate', 'inspire', 'success', 'achieve']):
                template_type = 'motivation'
            elif any(word in prompt_lower for word in ['news', 'industry', 'trend', 'business']):
                template_type = 'industry_news'
            elif any(word in prompt_lower for word in ['tip', 'advice', 'how to', 'guide']):
                template_type = 'tips'
            elif any(word in prompt_lower for word in ['behind', 'team', 'office', 'culture']):
                template_type = 'behind_scenes'
            else:
                template_type = random.choice(['motivation', 'industry_news', 'tips'])
            
            # Get random template from selected type
            templates = self.content_templates[template_type]['templates']
            content = random.choice(templates)
            
            # Platform-specific adjustments
            if platform == 'twitter' and len(content) > 280:
                content = content[:270] + "... 🧵"
            elif platform == 'linkedin':
                content = content.replace('#', '\n#')  # LinkedIn style hashtags
            
            logger.info(f"✨ Demo content generated for {platform}")
            return content
            
        except Exception as e:
            logger.error(f"❌ Demo content generation failed: {e}")
            return "🚀 Exciting updates coming soon! Stay tuned for more innovative solutions. #Innovation #ComingSoon"

    def setup_demo_routes(self):
        """Setup Flask routes for demo"""
        
        @self.app.route('/')
        def dashboard():
            """Demo dashboard"""
            return render_template('sintra_demo_dashboard.html', platforms=self.platforms)
        
        @self.app.route('/api/generate_content', methods=['POST'])
        def generate_content():
            """Demo content generation endpoint"""
            data = request.json
            prompt = data.get('prompt', 'Create engaging social media content')
            platform = data.get('platform', 'twitter')
            
            content = self.generate_demo_content(prompt, platform)
            
            return jsonify({
                'success': True,
                'content': content,
                'platform': platform,
                'demo_mode': True
            })
        
        @self.app.route('/api/schedule_post', methods=['POST'])
        def schedule_post():
            """Demo post scheduling endpoint"""
            data = request.json
            content = data.get('content', '')
            platforms = data.get('platforms', [])
            scheduled_time_str = data.get('scheduled_time', '')
            
            try:
                scheduled_time = datetime.fromisoformat(scheduled_time_str.replace('Z', '+00:00'))
            except:
                scheduled_time = datetime.now() + timedelta(hours=1)
            
            # Save to demo database
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute("""
                INSERT INTO demo_posts (content, platforms, scheduled_time, status)
                VALUES (?, ?, ?, 'scheduled')
            """, (content, json.dumps(platforms), scheduled_time))
            
            post_id = cursor.lastrowid
            conn.commit()
            conn.close()
            
            return jsonify({
                'success': True,
                'post_id': post_id,
                'scheduled_time': scheduled_time_str,
                'demo_mode': True,
                'message': 'Post scheduled successfully! (Demo mode - not actually posted)'
            })
        
        @self.app.route('/api/analytics/<post_id>')
        def get_analytics(post_id):
            """Demo analytics endpoint"""
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT platform, likes, shares, comments, impressions, engagement_rate
                FROM demo_analytics WHERE post_id = ?
            """, (post_id,))
            
            analytics = cursor.fetchall()
            conn.close()
            
            analytics_data = []
            for row in analytics:
                analytics_data.append({
                    'platform': row[0],
                    'likes': row[1],
                    'shares': row[2],
                    'comments': row[3],
                    'impressions': row[4],
                    'engagement_rate': round(row[5] * 100, 2)
                })
            
            return jsonify({
                'success': True,
                'analytics': analytics_data,
                'demo_mode': True
            })
        
        @self.app.route('/api/content_calendar')
        def get_content_calendar():
            """Demo content calendar endpoint"""
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT id, content, platforms, scheduled_time, status
                FROM demo_posts
                ORDER BY scheduled_time ASC
            """)
            
            posts = cursor.fetchall()
            conn.close()
            
            calendar_items = []
            for row in posts:
                platforms = json.loads(row[2]) if row[2] else []
                calendar_items.append({
                    'id': row[0],
                    'content': row[1][:50] + '...' if len(row[1]) > 50 else row[1],
                    'platforms': ', '.join(platforms),
                    'scheduled_time': row[3],
                    'status': row[4]
                })
            
            return jsonify({
                'success': True,
                'calendar': calendar_items,
                'demo_mode': True
            })
        
        @self.app.route('/api/demo_stats')
        def get_demo_stats():
            """Get demo statistics"""
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Total posts
            cursor.execute("SELECT COUNT(*) FROM demo_posts")
            total_posts = cursor.fetchone()[0]
            
            # Total engagement
            cursor.execute("SELECT SUM(likes + shares + comments) FROM demo_analytics")
            total_engagement = cursor.fetchone()[0] or 0
            
            # Average engagement rate
            cursor.execute("SELECT AVG(engagement_rate) FROM demo_analytics")
            avg_engagement_rate = cursor.fetchone()[0] or 0
            
            # Scheduled posts
            cursor.execute("SELECT COUNT(*) FROM demo_posts WHERE status = 'scheduled'")
            scheduled_posts = cursor.fetchone()[0]
            
            conn.close()
            
            return jsonify({
                'success': True,
                'stats': {
                    'total_posts': total_posts,
                    'total_engagement': total_engagement,
                    'avg_engagement_rate': round(avg_engagement_rate * 100, 1),
                    'scheduled_posts': scheduled_posts
                },
                'demo_mode': True
            })

    def run_demo(self, host='0.0.0.0', port=5001, debug=True):
        """Run the demo application"""
        self.setup_demo_routes()
        
        # Create demo template
        self.create_demo_template()
        
        logger.info(f"🚀 Sintra AI Demo running on {host}:{port}")
        logger.info("📱 Demo Dashboard: http://localhost:5001")
        
        self.app.run(host=host, port=port, debug=debug)

    def create_demo_template(self):
        """Create demo HTML template"""
        templates_dir = Path("templates")
        templates_dir.mkdir(exist_ok=True)
        
        demo_html = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sintra AI - Social Media Automation (DEMO)</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
            color: white;
            min-height: 100vh;
        }
        
        .demo-banner {
            background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
            color: white;
            text-align: center;
            padding: 0.5rem;
            font-weight: bold;
            font-size: 0.9rem;
        }
        
        .header {
            background: rgba(76, 205, 196, 0.1);
            padding: 1rem 2rem;
            border-bottom: 1px solid rgba(76, 205, 196, 0.3);
        }
        
        .header h1 {
            color: #4CCDC4;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem;
        }
        
        .dashboard-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 2rem;
            margin-bottom: 2rem;
        }
        
        .card {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(76, 205, 196, 0.2);
            border-radius: 12px;
            padding: 1.5rem;
            backdrop-filter: blur(10px);
            position: relative;
        }
        
        .demo-badge {
            position: absolute;
            top: 10px;
            right: 10px;
            background: #ff6b6b;
            color: white;
            padding: 0.25rem 0.5rem;
            border-radius: 12px;
            font-size: 0.7rem;
            font-weight: bold;
        }
        
        .card h3 {
            color: #4CCDC4;
            margin-bottom: 1rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        
        .form-group {
            margin-bottom: 1rem;
        }
        
        .form-group label {
            display: block;
            margin-bottom: 0.5rem;
            color: #a0aec0;
        }
        
        .form-control {
            width: 100%;
            padding: 0.75rem;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(76, 205, 196, 0.3);
            border-radius: 6px;
            color: white;
            font-size: 0.9rem;
        }
        
        textarea.form-control {
            resize: vertical;
            min-height: 100px;
        }
        
        .btn {
            background: linear-gradient(135deg, #4CCDC4 0%, #44A08D 100%);
            color: white;
            border: none;
            padding: 0.75rem 1.5rem;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.3s ease;
        }
        
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(76, 205, 196, 0.3);
        }
        
        .btn-secondary {
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(76, 205, 196, 0.3);
        }
        
        .platform-checkboxes {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 0.5rem;
            margin-top: 0.5rem;
        }
        
        .platform-checkbox {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        
        .analytics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 1rem;
            margin-top: 1rem;
        }
        
        .metric-card {
            background: rgba(76, 205, 196, 0.1);
            padding: 1rem;
            border-radius: 8px;
            text-align: center;
        }
        
        .metric-value {
            font-size: 1.8rem;
            font-weight: bold;
            color: #4CCDC4;
        }
        
        .metric-label {
            color: #a0aec0;
            font-size: 0.8rem;
            margin-top: 0.5rem;
        }
        
        .status-indicator {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            margin-right: 0.5rem;
        }
        
        .status-connected { background: #48BB78; }
        .status-warning { background: #ED8936; }
        
        .content-preview {
            background: rgba(255, 255, 255, 0.05);
            border-left: 3px solid #4CCDC4;
            padding: 1rem;
            margin: 1rem 0;
            border-radius: 4px;
        }
        
        .demo-note {
            background: rgba(255, 235, 59, 0.1);
            border: 1px solid rgba(255, 235, 59, 0.3);
            color: #ffeb3b;
            padding: 1rem;
            border-radius: 8px;
            margin: 1rem 0;
            font-size: 0.9rem;
        }
        
        .calendar-item {
            background: rgba(255, 255, 255, 0.05);
            padding: 0.75rem;
            margin: 0.5rem 0;
            border-radius: 6px;
            border-left: 3px solid #4CCDC4;
        }
        
        .calendar-item .date {
            font-weight: bold;
            color: #4CCDC4;
        }
        
        .calendar-item .platforms {
            color: #a0aec0;
            font-size: 0.8rem;
        }
        
        @media (max-width: 768px) {
            .container { padding: 1rem; }
            .dashboard-grid { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="demo-banner">
        🚧 DEMO MODE - This is a demonstration version showcasing Sintra AI capabilities 🚧
    </div>
    
    <div class="header">
        <h1>🚀 Sintra AI - Social Media Automation Tool</h1>
    </div>
    
    <div class="container">
        <div class="demo-note">
            <strong>📝 Demo Features:</strong> This demo showcases the core features of our Sintra AI social media tool. 
            Content generation uses demo templates, scheduling simulates real functionality, and analytics show sample data. 
            The full version includes real AI content generation, actual social media posting, and comprehensive analytics.
        </div>
        
        <div class="dashboard-grid">
            <!-- Content Generation -->
            <div class="card">
                <div class="demo-badge">DEMO</div>
                <h3>✨ AI Content Generator</h3>
                <div class="form-group">
                    <label>Content Prompt</label>
                    <textarea class="form-control" id="contentPrompt" placeholder="Describe what you want to post about...">Create an inspiring post about achieving success through persistence</textarea>
                </div>
                <div class="form-group">
                    <label>Platform</label>
                    <select class="form-control" id="contentPlatform">
                        <option value="twitter">Twitter/X</option>
                        <option value="facebook">Facebook</option>
                        <option value="instagram">Instagram</option>
                        <option value="linkedin">LinkedIn</option>
                    </select>
                </div>
                <button class="btn" onclick="generateContent()">Generate Content</button>
                <div id="generatedContent" class="content-preview" style="display: none;">
                    <h4>Generated Content:</h4>
                    <p id="contentText"></p>
                    <small style="color: #a0aec0;">Demo: Content generated from templates</small>
                </div>
            </div>
            
            <!-- Post Scheduler -->
            <div class="card">
                <div class="demo-badge">DEMO</div>
                <h3>📅 Schedule Posts</h3>
                <div class="form-group">
                    <label>Post Content</label>
                    <textarea class="form-control" id="scheduleContent" placeholder="Enter your post content..."></textarea>
                </div>
                <div class="form-group">
                    <label>Platforms</label>
                    <div class="platform-checkboxes">
                        <div class="platform-checkbox">
                            <input type="checkbox" id="twitter" value="twitter" checked>
                            <label for="twitter">Twitter</label>
                        </div>
                        <div class="platform-checkbox">
                            <input type="checkbox" id="facebook" value="facebook">
                            <label for="facebook">Facebook</label>
                        </div>
                        <div class="platform-checkbox">
                            <input type="checkbox" id="instagram" value="instagram">
                            <label for="instagram">Instagram</label>
                        </div>
                        <div class="platform-checkbox">
                            <input type="checkbox" id="linkedin" value="linkedin">
                            <label for="linkedin">LinkedIn</label>
                        </div>
                    </div>
                </div>
                <div class="form-group">
                    <label>Schedule Time</label>
                    <input type="datetime-local" class="form-control" id="scheduleTime">
                </div>
                <button class="btn" onclick="schedulePost()">Schedule Post</button>
            </div>
            
            <!-- Analytics Dashboard -->
            <div class="card">
                <div class="demo-badge">DEMO</div>
                <h3>📊 Analytics Overview</h3>
                <div class="analytics-grid" id="analyticsGrid">
                    <div class="metric-card">
                        <div class="metric-value" id="totalPosts">-</div>
                        <div class="metric-label">Total Posts</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-value" id="totalEngagement">-</div>
                        <div class="metric-label">Engagement</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-value" id="avgEngagementRate">-%</div>
                        <div class="metric-label">Avg. Rate</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-value" id="scheduledPosts">-</div>
                        <div class="metric-label">Scheduled</div>
                    </div>
                </div>
                <button class="btn btn-secondary" onclick="loadAnalytics()">Refresh Analytics</button>
            </div>
            
            <!-- Platform Status -->
            <div class="card">
                <div class="demo-badge">DEMO</div>
                <h3>🔗 Platform Status</h3>
                <div style="display: flex; flex-direction: column; gap: 1rem;">
                    <div>
                        <span class="status-indicator status-connected"></span>
                        Twitter/X - Demo Connected
                    </div>
                    <div>
                        <span class="status-indicator status-warning"></span>
                        Facebook - Demo Setup Required
                    </div>
                    <div>
                        <span class="status-indicator status-warning"></span>
                        Instagram - Demo Setup Required
                    </div>
                    <div>
                        <span class="status-indicator status-warning"></span>
                        LinkedIn - Demo Setup Required
                    </div>
                </div>
                <button class="btn btn-secondary" onclick="alert('Demo mode: Platform configuration simulated')">Configure Platforms</button>
            </div>
            
            <!-- Content Calendar -->
            <div class="card">
                <div class="demo-badge">DEMO</div>
                <h3>📋 Content Calendar</h3>
                <div id="contentCalendar">
                    <p style="color: #a0aec0; text-align: center; padding: 2rem;">
                        Loading calendar...
                    </p>
                </div>
                <button class="btn btn-secondary" onclick="loadCalendar()">Refresh Calendar</button>
            </div>
            
            <!-- Quick Templates -->
            <div class="card">
                <div class="demo-badge">DEMO</div>
                <h3>📝 Content Templates</h3>
                <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                    <button class="btn btn-secondary" onclick="useTemplate('motivation')">💪 Motivational Quote</button>
                    <button class="btn btn-secondary" onclick="useTemplate('industry_news')">📰 Industry News</button>
                    <button class="btn btn-secondary" onclick="useTemplate('behind_scenes')">🎬 Behind the Scenes</button>
                    <button class="btn btn-secondary" onclick="useTemplate('tip')">💡 Quick Tip</button>
                </div>
            </div>
        </div>
        
        <div class="demo-note">
            <h4>🚀 Ready for the Full Version?</h4>
            <p>The complete Sintra AI tool includes:</p>
            <ul style="margin: 0.5rem 0 0 1rem;">
                <li>Real AI content generation with GPT-4</li>
                <li>Actual social media posting across all platforms</li>
                <li>Real-time analytics from social media APIs</li>
                <li>Advanced scheduling and automation</li>
                <li>Visual content creation and editing</li>
                <li>Team collaboration features</li>
            </ul>
        </div>
    </div>
    
    <script>
        // Initialize demo
        document.addEventListener('DOMContentLoaded', function() {
            loadAnalytics();
            loadCalendar();
            
            // Set default schedule time to 1 hour from now
            const now = new Date();
            now.setHours(now.getHours() + 1);
            document.getElementById('scheduleTime').value = now.toISOString().slice(0, 16);
        });
        
        async function generateContent() {
            const prompt = document.getElementById('contentPrompt').value;
            const platform = document.getElementById('contentPlatform').value;
            
            if (!prompt.trim()) {
                alert('Please enter a content prompt');
                return;
            }
            
            try {
                const response = await fetch('/api/generate_content', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        prompt: prompt,
                        platform: platform,
                        content_type: 'social_post'
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    document.getElementById('contentText').textContent = data.content;
                    document.getElementById('generatedContent').style.display = 'block';
                    document.getElementById('scheduleContent').value = data.content;
                }
            } catch (error) {
                console.error('Content generation error:', error);
                alert('Error generating content. This is demo mode - the full version uses real AI generation.');
            }
        }
        
        async function schedulePost() {
            const content = document.getElementById('scheduleContent').value;
            const scheduleTime = document.getElementById('scheduleTime').value;
            
            const platforms = [];
            document.querySelectorAll('.platform-checkbox input:checked').forEach(cb => {
                platforms.push(cb.value);
            });
            
            if (!content.trim() || !scheduleTime || platforms.length === 0) {
                alert('Please fill all fields and select at least one platform');
                return;
            }
            
            try {
                const response = await fetch('/api/schedule_post', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        content: content,
                        platforms: platforms,
                        scheduled_time: scheduleTime + 'Z'
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    alert('Post scheduled successfully! (Demo mode - not actually posted to social media)');
                    document.getElementById('scheduleContent').value = '';
                    document.querySelectorAll('.platform-checkbox input').forEach(cb => cb.checked = false);
                    document.getElementById('twitter').checked = true; // Default selection
                    
                    // Refresh calendar
                    loadCalendar();
                }
            } catch (error) {
                console.error('Post scheduling error:', error);
                alert('Error scheduling post. This is demo mode.');
            }
        }
        
        async function loadAnalytics() {
            try {
                const response = await fetch('/api/demo_stats');
                const data = await response.json();
                
                if (data.success) {
                    document.getElementById('totalPosts').textContent = data.stats.total_posts;
                    document.getElementById('totalEngagement').textContent = data.stats.total_engagement;
                    document.getElementById('avgEngagementRate').textContent = data.stats.avg_engagement_rate + '%';
                    document.getElementById('scheduledPosts').textContent = data.stats.scheduled_posts;
                }
            } catch (error) {
                console.error('Analytics loading error:', error);
            }
        }
        
        async function loadCalendar() {
            try {
                const response = await fetch('/api/content_calendar');
                const data = await response.json();
                
                if (data.success) {
                    const calendar = document.getElementById('contentCalendar');
                    if (data.calendar.length === 0) {
                        calendar.innerHTML = '<p style="color: #a0aec0; text-align: center; padding: 2rem;">No content scheduled. Create your first post!</p>';
                    } else {
                        calendar.innerHTML = data.calendar.map(item => `
                            <div class="calendar-item">
                                <div class="date">${new Date(item.scheduled_time).toLocaleDateString()} ${new Date(item.scheduled_time).toLocaleTimeString()}</div>
                                <div>${item.content}</div>
                                <div class="platforms">📱 ${item.platforms} • Status: ${item.status}</div>
                            </div>
                        `).join('');
                    }
                }
            } catch (error) {
                console.error('Calendar loading error:', error);
            }
        }
        
        function useTemplate(templateType) {
            const templates = {
                'motivation': '🚀 Success isn\\'t just about what you accomplish, it\\'s about what you inspire others to do. Keep pushing forward! #Motivation #Success #Leadership',
                'industry_news': '🧠 AI is revolutionizing how businesses operate. From automation to insights, the future is here. What AI tools are transforming your industry? #AI #Innovation #Business',
                'behind_scenes': '🎬 Behind the scenes at our office: Building the future of social media automation! Our team is passionate about creating tools that save you time ⚡ #BehindTheScenes #TeamWork',
                'tip': '💡 Pro Tip: The best time to post on social media varies by platform. Twitter: 9am-10am, Facebook: 1pm-3pm, LinkedIn: 8am-10am. Track your analytics! #SocialMediaTips'
            };
            
            document.getElementById('scheduleContent').value = templates[templateType] || templates['motivation'];
        }
    </script>
</body>
</html>
        """
        
        with open(templates_dir / "sintra_demo_dashboard.html", "w", encoding="utf-8") as f:
            f.write(demo_html)

def main():
    """Run Sintra AI Demo"""
    print("🚀 Starting Sintra AI Social Media Tool - DEMO VERSION")
    print("="*60)
    print("📊 Demo Features:")
    print("   ✨ Template-based content generation")
    print("   📅 Post scheduling simulation")
    print("   📈 Sample analytics dashboard")
    print("   🔗 Multi-platform interface")
    print("   🎨 Modern responsive UI")
    print()
    print("🌐 Demo will be available at: http://localhost:5001")
    print("📝 This showcases the full Sintra AI capabilities")
    print("="*60)
    
    sintra_demo = SintraDemoAI()
    sintra_demo.run_demo(host='0.0.0.0', port=5001, debug=False)

if __name__ == "__main__":
    main()
