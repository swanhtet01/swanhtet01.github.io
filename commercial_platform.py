"""
Super Mega AI - Commercial SaaS Platform
Multi-tenant, user-friendly, subscription-based AI automation platform
"""

import asyncio
import json
import os
import time
import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import logging
from dataclasses import dataclass, asdict
from enum import Enum
import sqlite3
import bcrypt
import jwt
from fastapi import FastAPI, HTTPException, Depends, status, Request, Form, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
import uvicorn
import stripe
import redis
import requests
from pydantic import BaseModel, EmailStr
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/var/log/supermega/commercial_platform.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Configuration
class Config:
    SECRET_KEY = os.getenv('SECRET_KEY', secrets.token_hex(32))
    DATABASE_URL = os.getenv('DATABASE_URL', '/var/lib/supermega/commercial.db')
    REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379')
    STRIPE_SECRET_KEY = os.getenv('STRIPE_SECRET_KEY')
    STRIPE_PUBLISHABLE_KEY = os.getenv('STRIPE_PUBLISHABLE_KEY')
    STRIPE_WEBHOOK_SECRET = os.getenv('STRIPE_WEBHOOK_SECRET')
    SMTP_HOST = os.getenv('SMTP_HOST', 'smtp.gmail.com')
    SMTP_PORT = int(os.getenv('SMTP_PORT', 587))
    SMTP_USER = os.getenv('SMTP_USER')
    SMTP_PASS = os.getenv('SMTP_PASS')
    OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
    ANTHROPIC_API_KEY = os.getenv('ANTHROPIC_API_KEY')

config = Config()

# Initialize Stripe
stripe.api_key = config.STRIPE_SECRET_KEY

# Subscription Plans
class PlanType(Enum):
    FREE = "free"
    STARTER = "starter"
    PROFESSIONAL = "professional"
    ENTERPRISE = "enterprise"

SUBSCRIPTION_PLANS = {
    PlanType.FREE: {
        'name': 'Free Trial',
        'price': 0,
        'stripe_price_id': None,
        'ai_calls_limit': 100,
        'agents_limit': 1,
        'team_members_limit': 1,
        'features': ['basic_ai', 'email_support']
    },
    PlanType.STARTER: {
        'name': 'Starter',
        'price': 29,
        'stripe_price_id': 'price_starter_monthly',
        'ai_calls_limit': 1000,
        'agents_limit': 2,
        'team_members_limit': 1,
        'features': ['basic_ai', 'email_automation', 'analytics', 'email_support']
    },
    PlanType.PROFESSIONAL: {
        'name': 'Professional',
        'price': 99,
        'stripe_price_id': 'price_professional_monthly',
        'ai_calls_limit': 10000,
        'agents_limit': 10,
        'team_members_limit': 5,
        'features': ['advanced_ai', 'multi_model', 'custom_workflows', 'api_access', 'priority_support']
    },
    PlanType.ENTERPRISE: {
        'name': 'Enterprise',
        'price': 299,
        'stripe_price_id': 'price_enterprise_monthly',
        'ai_calls_limit': 50000,
        'agents_limit': -1,  # Unlimited
        'team_members_limit': -1,  # Unlimited
        'features': ['everything', 'white_label', 'custom_models', 'dedicated_support', 'sla']
    }
}

# Data Models
@dataclass
class User:
    id: int
    email: str
    username: str
    password_hash: str
    full_name: str
    company: Optional[str]
    plan_type: PlanType
    stripe_customer_id: Optional[str]
    stripe_subscription_id: Optional[str]
    api_calls_used: int
    api_calls_limit: int
    agents_count: int
    agents_limit: int
    created_at: datetime
    last_login: datetime
    is_active: bool
    email_verified: bool

@dataclass
class Organization:
    id: int
    name: str
    owner_id: int
    plan_type: PlanType
    members_count: int
    members_limit: int
    created_at: datetime

class CommercialPlatform:
    """Commercial SaaS Platform for Super Mega AI"""
    
    def __init__(self):
        self.app = FastAPI(
            title="Super Mega AI - Commercial Platform",
            description="AI Automation Platform for Businesses",
            version="2.0.0"
        )
        
        # Initialize components
        self.security = HTTPBearer()
        self.templates = Jinja2Templates(directory="templates")
        self.redis_client = None
        
        # Setup
        self._init_database()
        self._init_redis()
        self._setup_middleware()
        self._setup_routes()
        
        logger.info("Commercial platform initialized")
    
    def _init_database(self):
        """Initialize SQLite database with commercial tables"""
        try:
            os.makedirs(os.path.dirname(config.DATABASE_URL), exist_ok=True)
            conn = sqlite3.connect(config.DATABASE_URL)
            cursor = conn.cursor()
            
            # Users table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email TEXT UNIQUE NOT NULL,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    full_name TEXT NOT NULL,
                    company TEXT,
                    plan_type TEXT DEFAULT 'free',
                    stripe_customer_id TEXT,
                    stripe_subscription_id TEXT,
                    api_calls_used INTEGER DEFAULT 0,
                    api_calls_limit INTEGER DEFAULT 100,
                    agents_count INTEGER DEFAULT 0,
                    agents_limit INTEGER DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_login TIMESTAMP,
                    is_active BOOLEAN DEFAULT TRUE,
                    email_verified BOOLEAN DEFAULT FALSE
                )
            ''')
            
            # Organizations table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS organizations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    owner_id INTEGER NOT NULL,
                    plan_type TEXT DEFAULT 'starter',
                    members_count INTEGER DEFAULT 1,
                    members_limit INTEGER DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (owner_id) REFERENCES users (id)
                )
            ''')
            
            # Organization members table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS organization_members (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    organization_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL,
                    role TEXT DEFAULT 'member',
                    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (organization_id) REFERENCES organizations (id),
                    FOREIGN KEY (user_id) REFERENCES users (id)
                )
            ''')
            
            # API usage tracking
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS api_usage (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    endpoint TEXT NOT NULL,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    request_data TEXT,
                    response_size INTEGER,
                    processing_time REAL,
                    cost_cents INTEGER,
                    FOREIGN KEY (user_id) REFERENCES users (id)
                )
            ''')
            
            # User sessions
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS user_sessions (
                    id TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP NOT NULL,
                    ip_address TEXT,
                    user_agent TEXT,
                    is_active BOOLEAN DEFAULT TRUE,
                    FOREIGN KEY (user_id) REFERENCES users (id)
                )
            ''')
            
            # Email verification tokens
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS email_tokens (
                    token TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    token_type TEXT NOT NULL,
                    expires_at TIMESTAMP NOT NULL,
                    used BOOLEAN DEFAULT FALSE,
                    FOREIGN KEY (user_id) REFERENCES users (id)
                )
            ''')
            
            # AI agents (user-specific)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS user_agents (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    agent_type TEXT NOT NULL,
                    configuration TEXT,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_run TIMESTAMP,
                    tasks_completed INTEGER DEFAULT 0,
                    tasks_failed INTEGER DEFAULT 0,
                    FOREIGN KEY (user_id) REFERENCES users (id)
                )
            ''')
            
            # Billing events
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS billing_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    event_type TEXT NOT NULL,
                    stripe_event_id TEXT,
                    amount_cents INTEGER,
                    currency TEXT DEFAULT 'usd',
                    description TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users (id)
                )
            ''')
            
            conn.commit()
            conn.close()
            logger.info("Database initialized successfully")
            
        except Exception as e:
            logger.error(f"Database initialization failed: {e}")
            raise
    
    def _init_redis(self):
        """Initialize Redis connection"""
        try:
            self.redis_client = redis.from_url(config.REDIS_URL, decode_responses=True)
            self.redis_client.ping()
            logger.info("Redis connection established")
        except Exception as e:
            logger.warning(f"Redis connection failed: {e}")
            self.redis_client = None
    
    def _setup_middleware(self):
        """Setup FastAPI middleware"""
        
        # CORS middleware
        self.app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],  # Configure properly for production
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
        
        # Trusted host middleware
        self.app.add_middleware(
            TrustedHostMiddleware,
            allowed_hosts=["*"]  # Configure properly for production
        )
    
    def _setup_routes(self):
        """Setup all application routes"""
        
        # Static files
        self.app.mount("/static", StaticFiles(directory="static"), name="static")
        
        # Authentication routes
        @self.app.post("/api/auth/register")
        async def register(email: EmailStr, username: str, password: str, full_name: str, company: str = None):
            return await self._register_user(email, username, password, full_name, company)
        
        @self.app.post("/api/auth/login")
        async def login(email: str, password: str, request: Request):
            return await self._login_user(email, password, request)
        
        @self.app.post("/api/auth/logout")
        async def logout(user: dict = Depends(self.get_current_user)):
            return await self._logout_user(user['id'])
        
        @self.app.get("/api/auth/verify-email/{token}")
        async def verify_email(token: str):
            return await self._verify_email(token)
        
        # User management
        @self.app.get("/api/user/profile")
        async def get_profile(user: dict = Depends(self.get_current_user)):
            return await self._get_user_profile(user['id'])
        
        @self.app.put("/api/user/profile")
        async def update_profile(profile_data: dict, user: dict = Depends(self.get_current_user)):
            return await self._update_user_profile(user['id'], profile_data)
        
        # Subscription management
        @self.app.get("/api/subscription/plans")
        async def get_subscription_plans():
            return SUBSCRIPTION_PLANS
        
        @self.app.post("/api/subscription/create-checkout-session")
        async def create_checkout_session(plan_type: str, user: dict = Depends(self.get_current_user)):
            return await self._create_stripe_checkout_session(user['id'], plan_type)
        
        @self.app.post("/api/subscription/create-portal-session")
        async def create_portal_session(user: dict = Depends(self.get_current_user)):
            return await self._create_stripe_portal_session(user['id'])
        
        # Stripe webhooks
        @self.app.post("/api/webhooks/stripe")
        async def stripe_webhook(request: Request):
            return await self._handle_stripe_webhook(request)
        
        # AI API routes (usage tracked)
        @self.app.post("/api/ai/chat")
        async def ai_chat(message: str, model: str = "gpt-3.5-turbo", user: dict = Depends(self.get_current_user)):
            return await self._handle_ai_chat(user['id'], message, model)
        
        @self.app.post("/api/ai/generate-content")
        async def generate_content(prompt: str, content_type: str, user: dict = Depends(self.get_current_user)):
            return await self._handle_content_generation(user['id'], prompt, content_type)
        
        # Agent management
        @self.app.get("/api/agents")
        async def get_user_agents(user: dict = Depends(self.get_current_user)):
            return await self._get_user_agents(user['id'])
        
        @self.app.post("/api/agents")
        async def create_agent(agent_data: dict, user: dict = Depends(self.get_current_user)):
            return await self._create_user_agent(user['id'], agent_data)
        
        @self.app.delete("/api/agents/{agent_id}")
        async def delete_agent(agent_id: int, user: dict = Depends(self.get_current_user)):
            return await self._delete_user_agent(user['id'], agent_id)
        
        # Usage analytics
        @self.app.get("/api/analytics/usage")
        async def get_usage_analytics(user: dict = Depends(self.get_current_user)):
            return await self._get_usage_analytics(user['id'])
        
        # Organization management
        @self.app.post("/api/organizations")
        async def create_organization(org_data: dict, user: dict = Depends(self.get_current_user)):
            return await self._create_organization(user['id'], org_data)
        
        @self.app.get("/api/organizations/{org_id}/members")
        async def get_org_members(org_id: int, user: dict = Depends(self.get_current_user)):
            return await self._get_org_members(user['id'], org_id)
        
        @self.app.post("/api/organizations/{org_id}/invite")
        async def invite_member(org_id: int, email: str, user: dict = Depends(self.get_current_user)):
            return await self._invite_org_member(user['id'], org_id, email)
        
        # Frontend routes
        @self.app.get("/", response_class=HTMLResponse)
        async def homepage(request: Request):
            return self.templates.TemplateResponse("landing.html", {"request": request})
        
        @self.app.get("/login", response_class=HTMLResponse)
        async def login_page(request: Request):
            return self.templates.TemplateResponse("login.html", {"request": request})
        
        @self.app.get("/register", response_class=HTMLResponse)
        async def register_page(request: Request):
            return self.templates.TemplateResponse("register.html", {"request": request})
        
        @self.app.get("/dashboard", response_class=HTMLResponse)
        async def dashboard(request: Request, user: dict = Depends(self.get_current_user)):
            return self.templates.TemplateResponse("dashboard.html", {
                "request": request, 
                "user": user
            })
        
        @self.app.get("/pricing", response_class=HTMLResponse)
        async def pricing_page(request: Request):
            return self.templates.TemplateResponse("pricing.html", {
                "request": request,
                "plans": SUBSCRIPTION_PLANS
            })
        
        # Health check
        @self.app.get("/health")
        async def health_check():
            return {
                "status": "healthy",
                "timestamp": datetime.utcnow().isoformat(),
                "version": "2.0.0"
            }
    
    def hash_password(self, password: str) -> str:
        """Hash password using bcrypt"""
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
        return hashed.decode('utf-8')
    
    def verify_password(self, password: str, hashed: str) -> bool:
        """Verify password against hash"""
        return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))
    
    def generate_jwt_token(self, user_id: int) -> str:
        """Generate JWT token for user"""
        payload = {
            'user_id': user_id,
            'exp': datetime.utcnow() + timedelta(days=30),
            'iat': datetime.utcnow()
        }
        return jwt.encode(payload, config.SECRET_KEY, algorithm='HS256')
    
    def verify_jwt_token(self, token: str) -> Optional[dict]:
        """Verify JWT token and return payload"""
        try:
            payload = jwt.decode(token, config.SECRET_KEY, algorithms=['HS256'])
            return payload
        except jwt.ExpiredSignatureError:
            return None
        except jwt.InvalidTokenError:
            return None
    
    async def get_current_user(self, credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer())):
        """Get current authenticated user"""
        token = credentials.credentials
        payload = self.verify_jwt_token(token)
        
        if not payload:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        user_id = payload.get('user_id')
        user = await self._get_user_by_id(user_id)
        
        if not user or not user['is_active']:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found or inactive"
            )
        
        return user
    
    async def _register_user(self, email: str, username: str, password: str, full_name: str, company: Optional[str]):
        """Register new user"""
        try:
            conn = sqlite3.connect(config.DATABASE_URL)
            cursor = conn.cursor()
            
            # Check if user exists
            cursor.execute("SELECT id FROM users WHERE email = ? OR username = ?", (email, username))
            if cursor.fetchone():
                raise HTTPException(status_code=400, detail="User already exists")
            
            # Create user
            password_hash = self.hash_password(password)
            cursor.execute('''
                INSERT INTO users (email, username, password_hash, full_name, company)
                VALUES (?, ?, ?, ?, ?)
            ''', (email, username, password_hash, full_name, company))
            
            user_id = cursor.lastrowid
            conn.commit()
            conn.close()
            
            # Create Stripe customer
            stripe_customer = stripe.Customer.create(
                email=email,
                name=full_name,
                metadata={'user_id': user_id}
            )
            
            # Update user with Stripe customer ID
            conn = sqlite3.connect(config.DATABASE_URL)
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE users SET stripe_customer_id = ? WHERE id = ?",
                (stripe_customer.id, user_id)
            )
            conn.commit()
            conn.close()
            
            # Send welcome email
            await self._send_welcome_email(email, username)
            
            # Generate JWT token
            token = self.generate_jwt_token(user_id)
            
            return {
                "message": "User registered successfully",
                "token": token,
                "user": {
                    "id": user_id,
                    "email": email,
                    "username": username,
                    "full_name": full_name,
                    "plan_type": "free"
                }
            }
            
        except Exception as e:
            logger.error(f"User registration failed: {e}")
            raise HTTPException(status_code=500, detail="Registration failed")
    
    async def _login_user(self, email: str, password: str, request: Request):
        """Login user"""
        try:
            conn = sqlite3.connect(config.DATABASE_URL)
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT id, email, username, password_hash, full_name, plan_type, is_active, email_verified
                FROM users WHERE email = ?
            ''', (email,))
            
            user = cursor.fetchone()
            if not user or not self.verify_password(password, user[3]):
                raise HTTPException(status_code=400, detail="Invalid credentials")
            
            if not user[6]:  # is_active
                raise HTTPException(status_code=400, detail="Account is deactivated")
            
            user_id = user[0]
            
            # Update last login
            cursor.execute(
                "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?",
                (user_id,)
            )
            conn.commit()
            conn.close()
            
            # Generate JWT token
            token = self.generate_jwt_token(user_id)
            
            # Track login
            await self._track_user_activity(user_id, 'login', {
                'ip': request.client.host,
                'user_agent': request.headers.get('user-agent')
            })
            
            return {
                "message": "Login successful",
                "token": token,
                "user": {
                    "id": user_id,
                    "email": user[1],
                    "username": user[2],
                    "full_name": user[4],
                    "plan_type": user[5]
                }
            }
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"User login failed: {e}")
            raise HTTPException(status_code=500, detail="Login failed")
    
    async def _create_stripe_checkout_session(self, user_id: int, plan_type: str):
        """Create Stripe checkout session for subscription"""
        try:
            plan = SUBSCRIPTION_PLANS.get(PlanType(plan_type))
            if not plan or plan['price'] == 0:
                raise HTTPException(status_code=400, detail="Invalid plan")
            
            user = await self._get_user_by_id(user_id)
            if not user:
                raise HTTPException(status_code=404, detail="User not found")
            
            # Create checkout session
            session = stripe.checkout.Session.create(
                customer=user['stripe_customer_id'],
                payment_method_types=['card'],
                line_items=[{
                    'price': plan['stripe_price_id'],
                    'quantity': 1,
                }],
                mode='subscription',
                success_url='https://yourdomain.com/dashboard?session_id={CHECKOUT_SESSION_ID}',
                cancel_url='https://yourdomain.com/pricing',
                metadata={
                    'user_id': user_id,
                    'plan_type': plan_type
                }
            )
            
            return {'checkout_url': session.url}
            
        except Exception as e:
            logger.error(f"Stripe checkout session creation failed: {e}")
            raise HTTPException(status_code=500, detail="Checkout session creation failed")
    
    async def _handle_ai_chat(self, user_id: int, message: str, model: str):
        """Handle AI chat request with usage tracking"""
        try:
            # Check user limits
            user = await self._get_user_by_id(user_id)
            if user['api_calls_used'] >= user['api_calls_limit']:
                raise HTTPException(status_code=429, detail="API usage limit exceeded")
            
            start_time = time.time()
            
            # Make AI API call based on model
            if model.startswith('gpt-'):
                # OpenAI API call
                import openai
                openai.api_key = config.OPENAI_API_KEY
                
                response = openai.chat.completions.create(
                    model=model,
                    messages=[{"role": "user", "content": message}],
                    max_tokens=1000
                )
                
                ai_response = response.choices[0].message.content
                cost_cents = self._calculate_openai_cost(model, len(message), len(ai_response))
                
            elif model.startswith('claude-'):
                # Anthropic API call
                import anthropic
                client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
                
                response = client.messages.create(
                    model=model,
                    max_tokens=1000,
                    messages=[{"role": "user", "content": message}]
                )
                
                ai_response = response.content[0].text
                cost_cents = self._calculate_anthropic_cost(model, len(message), len(ai_response))
                
            else:
                raise HTTPException(status_code=400, detail="Unsupported model")
            
            processing_time = time.time() - start_time
            
            # Track usage
            await self._track_api_usage(user_id, 'ai_chat', {
                'model': model,
                'message': message[:100],  # First 100 chars for privacy
                'response_length': len(ai_response)
            }, len(ai_response), processing_time, cost_cents)
            
            # Update user API calls count
            await self._increment_api_usage(user_id)
            
            return {
                'response': ai_response,
                'model': model,
                'usage': {
                    'calls_remaining': user['api_calls_limit'] - user['api_calls_used'] - 1,
                    'processing_time': processing_time
                }
            }
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"AI chat failed: {e}")
            raise HTTPException(status_code=500, detail="AI request failed")
    
    def _calculate_openai_cost(self, model: str, input_length: int, output_length: int) -> int:
        """Calculate OpenAI cost in cents"""
        # Simplified cost calculation - adjust based on actual pricing
        costs = {
            'gpt-3.5-turbo': {'input': 0.0015, 'output': 0.002},  # per 1K tokens
            'gpt-4': {'input': 0.03, 'output': 0.06}
        }
        
        model_cost = costs.get(model, costs['gpt-3.5-turbo'])
        
        # Rough token estimation (1 token ≈ 4 characters)
        input_tokens = input_length / 4
        output_tokens = output_length / 4
        
        cost = (input_tokens / 1000 * model_cost['input']) + (output_tokens / 1000 * model_cost['output'])
        return int(cost * 100)  # Convert to cents
    
    def _calculate_anthropic_cost(self, model: str, input_length: int, output_length: int) -> int:
        """Calculate Anthropic cost in cents"""
        # Simplified cost calculation
        costs = {
            'claude-3-haiku': {'input': 0.00025, 'output': 0.00125},
            'claude-3-sonnet': {'input': 0.003, 'output': 0.015},
            'claude-3-opus': {'input': 0.015, 'output': 0.075}
        }
        
        model_cost = costs.get(model, costs['claude-3-haiku'])
        
        input_tokens = input_length / 4
        output_tokens = output_length / 4
        
        cost = (input_tokens / 1000 * model_cost['input']) + (output_tokens / 1000 * model_cost['output'])
        return int(cost * 100)
    
    async def _track_api_usage(self, user_id: int, endpoint: str, request_data: dict, response_size: int, processing_time: float, cost_cents: int):
        """Track API usage for billing and analytics"""
        try:
            conn = sqlite3.connect(config.DATABASE_URL)
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT INTO api_usage 
                (user_id, endpoint, request_data, response_size, processing_time, cost_cents)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (user_id, endpoint, json.dumps(request_data), response_size, processing_time, cost_cents))
            
            conn.commit()
            conn.close()
            
        except Exception as e:
            logger.error(f"Failed to track API usage: {e}")
    
    async def _increment_api_usage(self, user_id: int):
        """Increment user's API calls count"""
        try:
            conn = sqlite3.connect(config.DATABASE_URL)
            cursor = conn.cursor()
            
            cursor.execute(
                "UPDATE users SET api_calls_used = api_calls_used + 1 WHERE id = ?",
                (user_id,)
            )
            
            conn.commit()
            conn.close()
            
        except Exception as e:
            logger.error(f"Failed to increment API usage: {e}")
    
    async def _get_user_by_id(self, user_id: int) -> Optional[dict]:
        """Get user by ID"""
        try:
            conn = sqlite3.connect(config.DATABASE_URL)
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT id, email, username, full_name, company, plan_type,
                       stripe_customer_id, api_calls_used, api_calls_limit,
                       agents_count, agents_limit, is_active, email_verified
                FROM users WHERE id = ?
            ''', (user_id,))
            
            row = cursor.fetchone()
            conn.close()
            
            if not row:
                return None
            
            return {
                'id': row[0],
                'email': row[1],
                'username': row[2],
                'full_name': row[3],
                'company': row[4],
                'plan_type': row[5],
                'stripe_customer_id': row[6],
                'api_calls_used': row[7],
                'api_calls_limit': row[8],
                'agents_count': row[9],
                'agents_limit': row[10],
                'is_active': row[11],
                'email_verified': row[12]
            }
            
        except Exception as e:
            logger.error(f"Failed to get user by ID: {e}")
            return None
    
    async def _send_welcome_email(self, email: str, username: str):
        """Send welcome email to new user"""
        try:
            if not config.SMTP_USER or not config.SMTP_PASS:
                logger.warning("SMTP not configured, skipping welcome email")
                return
            
            subject = "Welcome to Super Mega AI!"
            body = f"""
            Hi {username},
            
            Welcome to Super Mega AI! Your account has been created successfully.
            
            You can now start using our AI automation platform to streamline your business processes.
            
            Get started: https://yourdomain.com/dashboard
            
            If you have any questions, don't hesitate to contact our support team.
            
            Best regards,
            The Super Mega AI Team
            """
            
            msg = MIMEMultipart()
            msg['From'] = config.SMTP_USER
            msg['To'] = email
            msg['Subject'] = subject
            msg.attach(MIMEText(body, 'plain'))
            
            server = smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT)
            server.starttls()
            server.login(config.SMTP_USER, config.SMTP_PASS)
            server.send_message(msg)
            server.quit()
            
            logger.info(f"Welcome email sent to {email}")
            
        except Exception as e:
            logger.error(f"Failed to send welcome email: {e}")
    
    async def _track_user_activity(self, user_id: int, activity_type: str, metadata: dict):
        """Track user activity for analytics"""
        try:
            if self.redis_client:
                activity_data = {
                    'user_id': user_id,
                    'activity_type': activity_type,
                    'timestamp': datetime.utcnow().isoformat(),
                    'metadata': metadata
                }
                
                # Store in Redis for real-time analytics
                self.redis_client.lpush(
                    f"user_activity:{user_id}",
                    json.dumps(activity_data)
                )
                
                # Keep only last 100 activities
                self.redis_client.ltrim(f"user_activity:{user_id}", 0, 99)
                
        except Exception as e:
            logger.error(f"Failed to track user activity: {e}")
    
    def run(self, host: str = "0.0.0.0", port: int = 8000):
        """Run the commercial platform"""
        logger.info(f"Starting Super Mega AI Commercial Platform on {host}:{port}")
        
        uvicorn.run(
            self.app,
            host=host,
            port=port,
            log_level="info",
            access_log=True
        )

if __name__ == "__main__":
    platform = CommercialPlatform()
    platform.run()
