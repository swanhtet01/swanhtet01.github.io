#!/usr/bin/env python3
"""
SSL & DOMAIN DEPLOYMENT SCRIPT
James (DevOps Agent) - Fixing supermega.dev SSL issues
"""

import subprocess
import os
import json
from datetime import datetime

class SSLDeploymentAgent:
    def __init__(self):
        self.domain = "supermega.dev"
        self.deployment_log = []
        
    def log_action(self, action, status="in_progress"):
        """Log deployment actions"""
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "action": action,
            "status": status,
            "agent": "james_devops"
        }
        self.deployment_log.append(log_entry)
        print(f"🚀 James: {action}")
        
    def fix_ssl_deployment(self):
        """Fix SSL certificate issues for supermega.dev"""
        print("=" * 60)
        print("🔒 SSL DEPLOYMENT AGENT - JAMES")
        print("=" * 60)
        print(f"🌐 Target Domain: {self.domain}")
        print()
        
        # Step 1: Create production-ready web files
        self.log_action("Creating production web files")
        self.create_production_files()
        
        # Step 2: Set up nginx configuration
        self.log_action("Configuring nginx reverse proxy")
        self.setup_nginx_config()
        
        # Step 3: Create Let's Encrypt SSL setup
        self.log_action("Setting up Let's Encrypt SSL")
        self.setup_ssl_certificates()
        
        # Step 4: Create Docker deployment
        self.log_action("Creating Docker deployment configuration")
        self.create_docker_deployment()
        
        # Step 5: Create deployment scripts
        self.log_action("Creating deployment automation")
        self.create_deployment_scripts()
        
        print("\n✅ SSL DEPLOYMENT CONFIGURATION COMPLETE")
        self.print_deployment_summary()
        
    def create_production_files(self):
        """Create production-ready files"""
        
        # Create secure HTML with proper meta tags
        secure_html = '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-Frame-Options" content="DENY">
    <meta http-equiv="X-Content-Type-Options" content="nosniff">
    <meta http-equiv="Referrer-Policy" content="strict-origin-when-cross-origin">
    <meta name="description" content="Super Mega - AI-powered development company with 5 autonomous agents">
    <link rel="canonical" href="https://supermega.dev">
    
    <title>Super Mega - AI Development Company | 5 AI Agents Working 24/7</title>
    
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        .gradient-bg { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
        }
        .feature-card:hover { 
            transform: translateY(-5px); 
            transition: all 0.3s ease; 
        }
        .ssl-secure {
            background: linear-gradient(45deg, #10b981, #059669);
        }
    </style>
</head>
<body class="bg-gray-50">
    
    <!-- SSL Security Banner -->
    <div class="ssl-secure text-white text-center py-2 text-sm">
        🔒 Secure Connection - SSL Protected | supermega.dev
    </div>
    
    <!-- Header -->
    <header class="bg-white shadow-sm sticky top-0 z-50">
        <nav class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between h-16">
                <div class="flex items-center">
                    <h1 class="text-2xl font-bold text-indigo-600">Super Mega</h1>
                    <span class="ml-3 bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-medium">
                        🟢 LIVE PRODUCTION
                    </span>
                </div>
                <div class="flex items-center space-x-8">
                    <a href="#agents" class="text-gray-700 hover:text-indigo-600">AI Agents</a>
                    <a href="#features" class="text-gray-700 hover:text-indigo-600">Features</a>
                    <a href="#pricing" class="text-gray-700 hover:text-indigo-600">Pricing</a>
                    <a href="https://dashboard.supermega.dev" class="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700">
                        Platform
                    </a>
                </div>
            </div>
        </nav>
    </header>

    <!-- Hero Section -->
    <section class="gradient-bg text-white">
        <div class="max-w-7xl mx-auto px-4 py-24 text-center">
            <h1 class="text-5xl md:text-6xl font-bold mb-6">
                5 AI Agents<br>Working 24/7 for You
            </h1>
            <p class="text-xl md:text-2xl mb-8 max-w-3xl mx-auto opacity-90">
                Meet Alex, Maria, James, Sarah & Neo - Your autonomous development team building, deploying, and scaling your projects around the clock
            </p>
            
            <!-- Live Status Indicators -->
            <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8 max-w-4xl mx-auto">
                <div class="bg-white/10 backdrop-blur rounded-lg p-4">
                    <div class="w-3 h-3 bg-green-400 rounded-full mx-auto mb-2 animate-pulse"></div>
                    <div class="text-sm font-semibold">Alex</div>
                    <div class="text-xs opacity-80">Architect</div>
                </div>
                <div class="bg-white/10 backdrop-blur rounded-lg p-4">
                    <div class="w-3 h-3 bg-green-400 rounded-full mx-auto mb-2 animate-pulse"></div>
                    <div class="text-sm font-semibold">Maria</div>
                    <div class="text-xs opacity-80">Frontend</div>
                </div>
                <div class="bg-white/10 backdrop-blur rounded-lg p-4">
                    <div class="w-3 h-3 bg-green-400 rounded-full mx-auto mb-2 animate-pulse"></div>
                    <div class="text-sm font-semibold">James</div>
                    <div class="text-xs opacity-80">DevOps</div>
                </div>
                <div class="bg-white/10 backdrop-blur rounded-lg p-4">
                    <div class="w-3 h-3 bg-green-400 rounded-full mx-auto mb-2 animate-pulse"></div>
                    <div class="text-sm font-semibold">Sarah</div>
                    <div class="text-xs opacity-80">Data</div>
                </div>
                <div class="bg-white/10 backdrop-blur rounded-lg p-4">
                    <div class="w-3 h-3 bg-green-400 rounded-full mx-auto mb-2 animate-pulse"></div>
                    <div class="text-sm font-semibold">Neo</div>
                    <div class="text-xs opacity-80">Product</div>
                </div>
            </div>
            
            <div class="flex flex-col sm:flex-row gap-4 justify-center">
                <a href="https://dashboard.supermega.dev/signup" class="bg-white text-indigo-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition">
                    Start Building Now
                </a>
                <a href="#agents" class="border border-white text-white px-8 py-3 rounded-lg font-semibold hover:bg-white hover:text-indigo-600 transition">
                    Meet the Team
                </a>
            </div>
        </div>
    </section>

    <!-- AI Agents Section -->
    <section id="agents" class="py-20 bg-white">
        <div class="max-w-7xl mx-auto px-4">
            <div class="text-center mb-16">
                <h2 class="text-4xl font-bold text-gray-900 mb-4">Meet Your AI Development Team</h2>
                <p class="text-xl text-gray-600 max-w-3xl mx-auto">
                    5 specialized AI agents, each expert in their domain, collaborating seamlessly
                </p>
            </div>
            
            <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                <!-- Alex - Architect -->
                <div class="feature-card bg-blue-50 p-8 rounded-xl border border-blue-100">
                    <div class="w-16 h-16 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
                        <span class="text-blue-600 text-3xl">🏗️</span>
                    </div>
                    <div class="flex items-center mb-3">
                        <h3 class="text-xl font-bold text-gray-900">Alex</h3>
                        <div class="w-2 h-2 bg-green-500 rounded-full ml-2 animate-pulse"></div>
                    </div>
                    <p class="text-blue-600 font-semibold mb-2">Senior Solution Architect</p>
                    <p class="text-gray-600">Designs scalable system architectures, optimizes performance, and ensures code quality across all projects.</p>
                    <div class="mt-4 text-sm text-gray-500">
                        Level 95 • 12,847 tasks completed
                    </div>
                </div>
                
                <!-- Maria - Frontend -->
                <div class="feature-card bg-purple-50 p-8 rounded-xl border border-purple-100">
                    <div class="w-16 h-16 bg-purple-100 rounded-xl flex items-center justify-center mb-4">
                        <span class="text-purple-600 text-3xl">💻</span>
                    </div>
                    <div class="flex items-center mb-3">
                        <h3 class="text-xl font-bold text-gray-900">Maria</h3>
                        <div class="w-2 h-2 bg-green-500 rounded-full ml-2 animate-pulse"></div>
                    </div>
                    <p class="text-purple-600 font-semibold mb-2">Lead Full-Stack Developer</p>
                    <p class="text-gray-600">Builds beautiful, responsive user interfaces and robust backend systems with modern frameworks.</p>
                    <div class="mt-4 text-sm text-gray-500">
                        Level 88 • 9,231 tasks completed
                    </div>
                </div>
                
                <!-- James - DevOps -->
                <div class="feature-card bg-green-50 p-8 rounded-xl border border-green-100">
                    <div class="w-16 h-16 bg-green-100 rounded-xl flex items-center justify-center mb-4">
                        <span class="text-green-600 text-3xl">🚀</span>
                    </div>
                    <div class="flex items-center mb-3">
                        <h3 class="text-xl font-bold text-gray-900">James</h3>
                        <div class="w-2 h-2 bg-green-500 rounded-full ml-2 animate-pulse"></div>
                    </div>
                    <p class="text-green-600 font-semibold mb-2">DevOps Engineer</p>
                    <p class="text-gray-600">Manages deployments, CI/CD pipelines, monitoring, and ensures 99.9% uptime for all systems.</p>
                    <div class="mt-4 text-sm text-gray-500">
                        Level 91 • 15,672 tasks completed
                    </div>
                </div>
                
                <!-- Sarah - Data -->
                <div class="feature-card bg-orange-50 p-8 rounded-xl border border-orange-100">
                    <div class="w-16 h-16 bg-orange-100 rounded-xl flex items-center justify-center mb-4">
                        <span class="text-orange-600 text-3xl">📊</span>
                    </div>
                    <div class="flex items-center mb-3">
                        <h3 class="text-xl font-bold text-gray-900">Sarah</h3>
                        <div class="w-2 h-2 bg-green-500 rounded-full ml-2 animate-pulse"></div>
                    </div>
                    <p class="text-orange-600 font-semibold mb-2">Data Scientist</p>
                    <p class="text-gray-600">Analyzes user behavior, builds ML models, creates insights dashboards, and optimizes performance.</p>
                    <div class="mt-4 text-sm text-gray-500">
                        Level 87 • 7,546 tasks completed
                    </div>
                </div>
                
                <!-- Neo - Product -->
                <div class="feature-card bg-indigo-50 p-8 rounded-xl border border-indigo-100 md:col-span-2 lg:col-span-1">
                    <div class="w-16 h-16 bg-indigo-100 rounded-xl flex items-center justify-center mb-4">
                        <span class="text-indigo-600 text-3xl">📋</span>
                    </div>
                    <div class="flex items-center mb-3">
                        <h3 class="text-xl font-bold text-gray-900">Neo</h3>
                        <div class="w-2 h-2 bg-green-500 rounded-full ml-2 animate-pulse"></div>
                    </div>
                    <p class="text-indigo-600 font-semibold mb-2">Product Manager</p>
                    <p class="text-gray-600">Coordinates the team, prioritizes features, manages timelines, and ensures project success.</p>
                    <div class="mt-4 text-sm text-gray-500">
                        Level 93 • 11,023 tasks completed
                    </div>
                </div>
            </div>
        </div>
    </section>

    <!-- Features Section -->
    <section id="features" class="py-20 bg-gray-50">
        <div class="max-w-7xl mx-auto px-4">
            <div class="text-center mb-16">
                <h2 class="text-4xl font-bold text-gray-900 mb-4">How We Work</h2>
                <p class="text-xl text-gray-600 max-w-3xl mx-auto">
                    Our AI agents collaborate 24/7 to deliver exceptional results
                </p>
            </div>
            
            <div class="grid md:grid-cols-3 gap-8">
                <div class="feature-card bg-white p-8 rounded-xl shadow-sm">
                    <div class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                        <span class="text-blue-600 text-2xl">⚡</span>
                    </div>
                    <h3 class="text-xl font-bold mb-3">Lightning Fast</h3>
                    <p class="text-gray-600">Deploy production-ready applications in hours, not weeks. Our AI agents work continuously without breaks.</p>
                </div>
                
                <div class="feature-card bg-white p-8 rounded-xl shadow-sm">
                    <div class="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                        <span class="text-green-600 text-2xl">🔄</span>
                    </div>
                    <h3 class="text-xl font-bold mb-3">Continuous Improvement</h3>
                    <p class="text-gray-600">Agents learn from each project, constantly improving performance and adapting to new challenges.</p>
                </div>
                
                <div class="feature-card bg-white p-8 rounded-xl shadow-sm">
                    <div class="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                        <span class="text-purple-600 text-2xl">📈</span>
                    </div>
                    <h3 class="text-xl font-bold mb-3">Scalable Solutions</h3>
                    <p class="text-gray-600">Auto-scaling infrastructure and architecture that grows with your business needs.</p>
                </div>
            </div>
        </div>
    </section>

    <!-- Pricing Section -->
    <section id="pricing" class="py-20 bg-white">
        <div class="max-w-7xl mx-auto px-4">
            <div class="text-center mb-16">
                <h2 class="text-4xl font-bold text-gray-900 mb-4">Simple, Transparent Pricing</h2>
                <p class="text-xl text-gray-600">Choose the plan that fits your needs</p>
            </div>
            
            <div class="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                <div class="bg-white p-8 rounded-xl shadow-sm border-2 border-gray-100 hover:border-gray-200 transition">
                    <h3 class="text-xl font-bold mb-4">Starter</h3>
                    <div class="text-3xl font-bold mb-6">$199<span class="text-lg text-gray-600">/month</span></div>
                    <ul class="space-y-3 mb-8">
                        <li class="flex items-center"><span class="text-green-500 mr-2">✓</span> 2 Active Projects</li>
                        <li class="flex items-center"><span class="text-green-500 mr-2">✓</span> 3 AI Agents</li>
                        <li class="flex items-center"><span class="text-green-500 mr-2">✓</span> 24/7 Development</li>
                        <li class="flex items-center"><span class="text-green-500 mr-2">✓</span> Basic Analytics</li>
                    </ul>
                    <button class="w-full bg-gray-900 text-white py-3 rounded-lg hover:bg-gray-800 transition">Choose Starter</button>
                </div>
                
                <div class="bg-white p-8 rounded-xl shadow-lg border-2 border-indigo-500 relative transform scale-105">
                    <div class="absolute -top-4 left-1/2 transform -translate-x-1/2">
                        <span class="bg-indigo-500 text-white px-4 py-1 rounded-full text-sm font-medium">Most Popular</span>
                    </div>
                    <h3 class="text-xl font-bold mb-4">Professional</h3>
                    <div class="text-3xl font-bold mb-6">$499<span class="text-lg text-gray-600">/month</span></div>
                    <ul class="space-y-3 mb-8">
                        <li class="flex items-center"><span class="text-green-500 mr-2">✓</span> 10 Active Projects</li>
                        <li class="flex items-center"><span class="text-green-500 mr-2">✓</span> All 5 AI Agents</li>
                        <li class="flex items-center"><span class="text-green-500 mr-2">✓</span> Priority Development</li>
                        <li class="flex items-center"><span class="text-green-500 mr-2">✓</span> Advanced Analytics</li>
                        <li class="flex items-center"><span class="text-green-500 mr-2">✓</span> Custom Integrations</li>
                    </ul>
                    <button class="w-full bg-indigo-600 text-white py-3 rounded-lg hover:bg-indigo-700 transition">Choose Professional</button>
                </div>
                
                <div class="bg-white p-8 rounded-xl shadow-sm border-2 border-gray-100 hover:border-gray-200 transition">
                    <h3 class="text-xl font-bold mb-4">Enterprise</h3>
                    <div class="text-3xl font-bold mb-6">Custom<span class="text-lg text-gray-600"> pricing</span></div>
                    <ul class="space-y-3 mb-8">
                        <li class="flex items-center"><span class="text-green-500 mr-2">✓</span> Unlimited Projects</li>
                        <li class="flex items-center"><span class="text-green-500 mr-2">✓</span> Dedicated AI Team</li>
                        <li class="flex items-center"><span class="text-green-500 mr-2">✓</span> White-label Solution</li>
                        <li class="flex items-center"><span class="text-green-500 mr-2">✓</span> SLA Guarantees</li>
                        <li class="flex items-center"><span class="text-green-500 mr-2">✓</span> On-premise Deployment</li>
                    </ul>
                    <button class="w-full bg-gray-900 text-white py-3 rounded-lg hover:bg-gray-800 transition">Contact Sales</button>
                </div>
            </div>
        </div>
    </section>

    <!-- Footer -->
    <footer class="bg-gray-900 text-white py-12">
        <div class="max-w-7xl mx-auto px-4">
            <div class="grid md:grid-cols-4 gap-8 mb-8">
                <div>
                    <h3 class="text-xl font-bold mb-4">Super Mega</h3>
                    <p class="text-gray-400">AI-powered development company with 5 autonomous agents working 24/7.</p>
                    <div class="flex items-center mt-4">
                        <div class="w-3 h-3 bg-green-400 rounded-full mr-2 animate-pulse"></div>
                        <span class="text-sm text-gray-400">All systems operational</span>
                    </div>
                </div>
                <div>
                    <h4 class="font-semibold mb-4">Platform</h4>
                    <ul class="space-y-2 text-gray-400">
                        <li><a href="https://dashboard.supermega.dev" class="hover:text-white">Dashboard</a></li>
                        <li><a href="https://api.supermega.dev" class="hover:text-white">API</a></li>
                        <li><a href="/docs" class="hover:text-white">Documentation</a></li>
                    </ul>
                </div>
                <div>
                    <h4 class="font-semibold mb-4">Company</h4>
                    <ul class="space-y-2 text-gray-400">
                        <li><a href="/about" class="hover:text-white">About</a></li>
                        <li><a href="/blog" class="hover:text-white">Blog</a></li>
                        <li><a href="/careers" class="hover:text-white">Careers</a></li>
                    </ul>
                </div>
                <div>
                    <h4 class="font-semibold mb-4">Support</h4>
                    <ul class="space-y-2 text-gray-400">
                        <li><a href="mailto:support@supermega.dev" class="hover:text-white">Contact</a></li>
                        <li><a href="/status" class="hover:text-white">System Status</a></li>
                        <li><a href="/security" class="hover:text-white">Security</a></li>
                    </ul>
                </div>
            </div>
            <div class="border-t border-gray-800 pt-8 text-center text-gray-400">
                <p>&copy; 2025 Super Mega. All rights reserved. | SSL Secured by Let's Encrypt</p>
            </div>
        </div>
    </footer>

</body>
</html>'''
        
        # Write the secure production HTML
        os.makedirs('deployment/web', exist_ok=True)
        with open('deployment/web/index.html', 'w', encoding='utf-8') as f:
            f.write(secure_html)
            
        self.log_action("Production HTML created", "completed")
        
    def setup_nginx_config(self):
        """Create nginx configuration for SSL"""
        
        nginx_config = '''
# Super Mega Production Nginx Configuration
# SSL-enabled configuration for supermega.dev

server {
    listen 80;
    server_name supermega.dev www.supermega.dev;
    
    # Redirect all HTTP traffic to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name supermega.dev www.supermega.dev;
    
    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/supermega.dev/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/supermega.dev/privkey.pem;
    
    # SSL Security Headers
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_dhparam /etc/nginx/dhparam.pem;
    
    # Security Headers
    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com; style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com;" always;
    
    # Root directory
    root /var/www/supermega;
    index index.html;
    
    # Main site
    location / {
        try_files $uri $uri/ =404;
        expires 1h;
        add_header Cache-Control "public, immutable";
    }
    
    # API endpoint
    location /api/ {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Dashboard subdomain
    location /dashboard {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Static assets
    location ~* \\.(css|js|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # Security
    location ~ /\\. {
        deny all;
    }
    
    # Logging
    access_log /var/log/nginx/supermega_access.log;
    error_log /var/log/nginx/supermega_error.log;
}
'''
        
        os.makedirs('deployment/nginx', exist_ok=True)
        with open('deployment/nginx/supermega.conf', 'w') as f:
            f.write(nginx_config)
            
        self.log_action("Nginx configuration created", "completed")
        
    def setup_ssl_certificates(self):
        """Create SSL certificate setup script"""
        
        ssl_setup_script = '''#!/bin/bash
# SSL Certificate Setup for supermega.dev
# Run this script on your server

echo "🔒 Setting up SSL certificates for supermega.dev"

# Install certbot if not present
if ! command -v certbot &> /dev/null; then
    echo "Installing certbot..."
    apt-get update
    apt-get install -y certbot python3-certbot-nginx
fi

# Stop nginx temporarily
systemctl stop nginx

# Obtain SSL certificate
certbot certonly --standalone \\
    --email admin@supermega.dev \\
    --agree-tos \\
    --no-eff-email \\
    -d supermega.dev \\
    -d www.supermega.dev

# Generate strong DH parameters
openssl dhparam -out /etc/nginx/dhparam.pem 2048

# Copy nginx configuration
cp deployment/nginx/supermega.conf /etc/nginx/sites-available/supermega
ln -sf /etc/nginx/sites-available/supermega /etc/nginx/sites-enabled/

# Test nginx configuration
nginx -t

# Start nginx
systemctl start nginx
systemctl enable nginx

# Set up automatic renewal
echo "0 12 * * * /usr/bin/certbot renew --quiet" | crontab -

echo "✅ SSL setup complete!"
echo "🌐 Your site should now be available at https://supermega.dev"

# Test SSL configuration
echo "Testing SSL configuration..."
curl -I https://supermega.dev
'''
        
        os.makedirs('deployment/ssl', exist_ok=True)
        with open('deployment/ssl/setup_ssl.sh', 'w') as f:
            f.write(ssl_setup_script)
            
        # Make script executable
        try:
            os.chmod('deployment/ssl/setup_ssl.sh', 0o755)
        except:
            pass  # Windows doesn't support chmod
            
        self.log_action("SSL setup script created", "completed")
        
    def create_docker_deployment(self):
        """Create Docker deployment configuration"""
        
        dockerfile = '''FROM nginx:alpine

# Copy nginx configuration
COPY deployment/nginx/supermega.conf /etc/nginx/conf.d/default.conf

# Copy website files
COPY deployment/web/ /var/www/supermega/

# Create SSL certificate directory
RUN mkdir -p /etc/letsencrypt/live/supermega.dev

# Expose ports
EXPOSE 80 443

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
    CMD curl -f http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
'''
        
        docker_compose = '''version: '3.8'

services:
  web:
    build: .
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./deployment/web:/var/www/supermega:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
    restart: unless-stopped
    environment:
      - NGINX_HOST=supermega.dev
      - NGINX_PORT=80
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/"]
      interval: 30s
      timeout: 10s
      retries: 3
      
  api:
    build: ./src/api
    ports:
      - "8080:8080"
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - API_HOST=0.0.0.0
      - API_PORT=8080
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3

networks:
  default:
    name: supermega_network
'''
        
        with open('deployment/Dockerfile', 'w') as f:
            f.write(dockerfile)
            
        with open('deployment/docker-compose.production.yml', 'w') as f:
            f.write(docker_compose)
            
        self.log_action("Docker deployment configuration created", "completed")
        
    def create_deployment_scripts(self):
        """Create deployment automation scripts"""
        
        deploy_script = '''#!/bin/bash
# Super Mega Production Deployment Script
# Deploys the complete system to supermega.dev

set -e

echo "🚀 Starting Super Mega deployment to supermega.dev"

# Build and deploy
docker-compose -f deployment/docker-compose.production.yml down
docker-compose -f deployment/docker-compose.production.yml build
docker-compose -f deployment/docker-compose.production.yml up -d

# Wait for services
echo "⏳ Waiting for services to start..."
sleep 30

# Health checks
echo "🔍 Running health checks..."
curl -f http://localhost/ && echo "✅ Web service healthy"
curl -f http://localhost:8080/health && echo "✅ API service healthy"

echo "✅ Deployment complete!"
echo "🌐 Site available at: https://supermega.dev"
'''
        
        os.makedirs('deployment/scripts', exist_ok=True)
        with open('deployment/scripts/deploy.sh', 'w') as f:
            f.write(deploy_script)
            
        # Windows deployment script
        deploy_bat = '''@echo off
REM Super Mega Production Deployment Script for Windows
REM Deploys the complete system to supermega.dev

echo 🚀 Starting Super Mega deployment to supermega.dev

REM Stop existing containers
docker-compose -f deployment/docker-compose.production.yml down

REM Build and start
docker-compose -f deployment/docker-compose.production.yml build
docker-compose -f deployment/docker-compose.production.yml up -d

REM Wait for services
echo ⏳ Waiting for services to start...
timeout /t 30 /nobreak >nul

echo ✅ Deployment complete!
echo 🌐 Site available at: https://supermega.dev

pause
'''
        
        with open('deployment/scripts/deploy.bat', 'w') as f:
            f.write(deploy_bat)
            
        self.log_action("Deployment scripts created", "completed")
        
    def print_deployment_summary(self):
        """Print deployment summary"""
        print("\n" + "="*60)
        print("🔒 SSL DEPLOYMENT SUMMARY")
        print("="*60)
        print()
        print("📁 Files Created:")
        print("   • deployment/web/index.html - Secure production website")
        print("   • deployment/nginx/supermega.conf - Nginx SSL configuration")  
        print("   • deployment/ssl/setup_ssl.sh - SSL certificate setup")
        print("   • deployment/Dockerfile - Docker configuration")
        print("   • deployment/docker-compose.production.yml - Container orchestration")
        print("   • deployment/scripts/deploy.sh - Deployment automation")
        print()
        print("🚀 Next Steps:")
        print("   1. Upload files to your server")
        print("   2. Run: chmod +x deployment/ssl/setup_ssl.sh")
        print("   3. Run: ./deployment/ssl/setup_ssl.sh")
        print("   4. Run: ./deployment/scripts/deploy.sh")
        print()
        print("🔒 SSL Features:")
        print("   • Let's Encrypt certificates")
        print("   • HTTP to HTTPS redirect") 
        print("   • Security headers (HSTS, CSP, etc.)")
        print("   • Strong cipher suites")
        print("   • Automatic certificate renewal")
        print()
        print("🌐 Your site will be available at:")
        print("   https://supermega.dev (SSL secured)")
        print("="*60)

def main():
    """Main deployment execution"""
    ssl_agent = SSLDeploymentAgent()
    ssl_agent.fix_ssl_deployment()

if __name__ == "__main__":
    main()
