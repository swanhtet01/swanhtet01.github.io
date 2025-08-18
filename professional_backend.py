from flask import Flask, request, jsonify, render_template_string
from flask_cors import CORS
from flask_jwt_extended import JWTManager, jwt_required, create_access_token, get_jwt_identity
import os
import sys
import json
from datetime import timedelta
import sqlite3
import re
import requests
from bs4 import BeautifulSoup
import hashlib

# Add the parent directory to the path to import our tools
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

app = Flask(__name__)
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET', 'super-mega-secret-key-change-in-production')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(hours=24)

# Initialize extensions
CORS(app)
jwt = JWTManager(app)

# Import our real tools
try:
    from real_functional_tools_simple import RealAITools
    ai_tools = RealAITools()
    print("✅ Real AI Tools loaded successfully")
except ImportError as e:
    print(f"❌ Could not import real tools: {e}")
    ai_tools = None

# Simple user management
USERS_DB = {}

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(password, hashed):
    return hash_password(password) == hashed

@app.route('/')
def home():
    return '''
    <h1>Super Mega AI Backend API</h1>
    <p>Professional Business Automation Platform Backend</p>
    <div>
        <h3>Available Endpoints:</h3>
        <ul>
            <li><strong>POST /api/auth/register</strong> - Register new user</li>
            <li><strong>POST /api/auth/login</strong> - User login</li>
            <li><strong>POST /api/tools/extract-emails</strong> - Extract emails from domain</li>
            <li><strong>POST /api/tools/generate-content</strong> - Generate AI content</li>
            <li><strong>POST /api/tools/scrape-website</strong> - Scrape website data</li>
            <li><strong>GET /api/tools/status</strong> - Check tools status</li>
        </ul>
    </div>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        h1 { color: #333; }
        ul { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        li { margin: 5px 0; }
    </style>
    '''

@app.route('/api/auth/register', methods=['POST'])
def register():
    try:
        data = request.get_json()
        email = data.get('email', '').lower().strip()
        password = data.get('password', '')
        
        if not email or not password:
            return jsonify({'error': 'Email and password required'}), 400
            
        if email in USERS_DB:
            return jsonify({'error': 'User already exists'}), 400
            
        # Store user
        USERS_DB[email] = {
            'email': email,
            'password': hash_password(password),
            'created_at': str(os.popen('date').read().strip())
        }
        
        # Create token
        access_token = create_access_token(identity=email)
        
        return jsonify({
            'message': 'User registered successfully',
            'access_token': access_token,
            'user': {'email': email}
        }), 201
        
    except Exception as e:
        return jsonify({'error': f'Registration failed: {str(e)}'}), 500

@app.route('/api/auth/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        email = data.get('email', '').lower().strip()
        password = data.get('password', '')
        
        if not email or not password:
            return jsonify({'error': 'Email and password required'}), 400
            
        user = USERS_DB.get(email)
        if not user or not verify_password(password, user['password']):
            return jsonify({'error': 'Invalid credentials'}), 401
            
        # Create token
        access_token = create_access_token(identity=email)
        
        return jsonify({
            'message': 'Login successful',
            'access_token': access_token,
            'user': {'email': email}
        }), 200
        
    except Exception as e:
        return jsonify({'error': f'Login failed: {str(e)}'}), 500

@app.route('/api/tools/extract-emails', methods=['POST'])
@jwt_required()
def extract_emails():
    try:
        data = request.get_json()
        domain = data.get('domain', '').strip()
        
        if not domain:
            return jsonify({'error': 'Domain is required'}), 400
            
        if not ai_tools:
            return jsonify({'error': 'AI tools not available'}), 503
            
        # Extract emails using our real tools
        emails = ai_tools.extract_emails_from_domain(domain)
        
        return jsonify({
            'success': True,
            'domain': domain,
            'emails': emails,
            'count': len(emails),
            'user': get_jwt_identity()
        }), 200
        
    except Exception as e:
        return jsonify({'error': f'Email extraction failed: {str(e)}'}), 500

@app.route('/api/tools/generate-content', methods=['POST'])
@jwt_required()
def generate_content():
    try:
        data = request.get_json()
        topic = data.get('topic', 'business automation')
        company = data.get('company', 'Your Company')
        template_type = data.get('type', 'cold_outreach')
        
        if not ai_tools:
            return jsonify({'error': 'AI tools not available'}), 503
            
        # Generate content using our real tools
        content = ai_tools.generate_real_email_content(template_type, company, topic)
        
        return jsonify({
            'success': True,
            'content': content,
            'topic': topic,
            'company': company,
            'user': get_jwt_identity()
        }), 200
        
    except Exception as e:
        return jsonify({'error': f'Content generation failed: {str(e)}'}), 500

@app.route('/api/tools/scrape-website', methods=['POST'])
@jwt_required()
def scrape_website():
    try:
        data = request.get_json()
        url = data.get('url', '').strip()
        
        if not url:
            return jsonify({'error': 'URL is required'}), 400
            
        if not ai_tools:
            return jsonify({'error': 'AI tools not available'}), 503
            
        # Scrape website using our real tools
        result = ai_tools.scrape_website_data(url)
        
        return jsonify({
            'success': True,
            'url': url,
            'data': result,
            'user': get_jwt_identity()
        }), 200
        
    except Exception as e:
        return jsonify({'error': f'Website scraping failed: {str(e)}'}), 500

@app.route('/api/tools/status', methods=['GET'])
def tools_status():
    try:
        if not ai_tools:
            return jsonify({
                'status': 'error',
                'message': 'AI tools not available',
                'tools_loaded': False
            }), 503
            
        # Get report from our real tools
        report = ai_tools.get_real_data_report()
        
        return jsonify({
            'status': 'operational',
            'message': 'All tools functioning normally',
            'tools_loaded': True,
            'database_stats': report,
            'available_tools': [
                'Email Extraction',
                'Content Generation', 
                'Website Scraping',
                'Data Analysis'
            ]
        }), 200
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'Status check failed: {str(e)}',
            'tools_loaded': False
        }), 500

@app.route('/api/demo/extract-emails', methods=['POST'])
def demo_extract_emails():
    """Public demo endpoint - no auth required"""
    try:
        data = request.get_json()
        domain = data.get('domain', '').strip()
        
        if not domain:
            return jsonify({'error': 'Domain is required'}), 400
            
        # For demo, generate some realistic sample emails
        demo_emails = [
            f'contact@{domain}',
            f'info@{domain}',
            f'sales@{domain}',
            f'support@{domain}',
            f'hello@{domain}',
            f'team@{domain}'
        ]
        
        return jsonify({
            'success': True,
            'domain': domain,
            'emails': demo_emails,
            'count': len(demo_emails),
            'note': 'Demo version - register for full access'
        }), 200
        
    except Exception as e:
        return jsonify({'error': f'Demo failed: {str(e)}'}), 500

@app.route('/api/demo/generate-content', methods=['POST'])
def demo_generate_content():
    """Public demo endpoint - no auth required"""
    try:
        data = request.get_json()
        topic = data.get('topic', 'business automation')
        company = data.get('company', 'Your Company')
        
        # Generate demo content
        demo_content = f"""Subject: Quick question about {company}'s {topic} strategy

Hi there,

I noticed {company} has been making some interesting moves in the {topic} space. I'm curious about your current approach and wondered if you'd be open to a brief conversation about how companies like yours are scaling their operations.

We've helped similar organizations:
• Reduce manual processes by 80%
• Increase lead quality by 300%
• Cut operational costs by $50K+ annually

Would you be interested in a 15-minute call to explore how this might apply to {company}?

Best regards,
Your Business Development Team

P.S. I'd be happy to share a case study of how we helped a similar company achieve results."""
        
        return jsonify({
            'success': True,
            'content': demo_content,
            'topic': topic,
            'company': company,
            'note': 'Demo version - register for full AI-powered content'
        }), 200
        
    except Exception as e:
        return jsonify({'error': f'Demo failed: {str(e)}'}), 500

if __name__ == '__main__':
    print("🚀 Starting Super Mega AI Backend...")
    print("📝 Available at: http://localhost:5000")
    print("🔧 Tools loaded:", "✅" if ai_tools else "❌")
    
    app.run(
        host='0.0.0.0',
        port=5000,
        debug=True
    )
