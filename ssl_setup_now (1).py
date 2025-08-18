#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SSL DEPLOYMENT SETUP FOR SUPERMEGA.DEV
=====================================
"""

import os
import sys
import time

# Fix encoding for Windows
if sys.platform.startswith('win'):
    sys.stdout.reconfigure(encoding='utf-8')

def setup_ssl_deployment():
    print("SSL JAMES (DevOps) - SSL DEPLOYMENT STARTING")
    print("=" * 50)
    
    # Create deployment directories
    deployment_dirs = [
        "deployment/web",
        "deployment/nginx", 
        "deployment/ssl",
        "deployment/scripts"
    ]
    
    for dir_path in deployment_dirs:
        os.makedirs(dir_path, exist_ok=True)
        print(f"✅ Created: {dir_path}")
    
    # Create secure HTML page
    secure_html = '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Super Mega - AI Development Company | SSL Secured</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        .gradient-bg { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
        .ssl-secure { background: linear-gradient(45deg, #10b981, #059669); }
        .pulse { animation: pulse 2s infinite; }
    </style>
</head>
<body class="bg-gray-50">
    <!-- SSL Security Banner -->
    <div class="ssl-secure text-white text-center py-2 text-sm">
        🔒 Secure Connection - SSL Protected | supermega.dev
    </div>
    
    <!-- Hero Section -->
    <section class="gradient-bg text-white py-20">
        <div class="max-w-7xl mx-auto px-4 text-center">
            <h1 class="text-5xl font-bold mb-6">SSL-Secured Super Mega</h1>
            <p class="text-xl mb-8">5 AI Agents Working 24/7 - Now with SSL Security!</p>
            
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
                <div class="bg-white/10 p-6 rounded-lg">
                    <div class="text-green-400 font-bold text-2xl">🔒</div>
                    <h3 class="font-semibold mt-2">HTTPS Enabled</h3>
                    <p class="text-sm">SSL Certificate: Valid</p>
                </div>
                <div class="bg-white/10 p-6 rounded-lg">
                    <div class="text-blue-400 font-bold text-2xl">🤖</div>
                    <h3 class="font-semibold mt-2">AI Agents Active</h3>
                    <p class="text-sm pulse">5 agents working now</p>
                </div>
                <div class="bg-white/10 p-6 rounded-lg">
                    <div class="text-purple-400 font-bold text-2xl">⚡</div>
                    <h3 class="font-semibold mt-2">Production Ready</h3>
                    <p class="text-sm">Deployment complete</p>
                </div>
            </div>
        </div>
    </section>
    
    <!-- Status Section -->
    <section class="py-16">
        <div class="max-w-4xl mx-auto px-4">
            <h2 class="text-3xl font-bold text-center mb-12">Live Development Status</h2>
            <div class="bg-gray-900 text-green-400 p-6 rounded-lg font-mono text-sm">
                <div>🎯 Alex (Architect): System design completed</div>
                <div>🎨 Maria (Frontend): Responsive components built</div>
                <div>🔒 James (DevOps): SSL deployment active</div>
                <div>📊 Sarah (Data): Analytics integrated</div>
                <div>🚀 Neo (Product): Features prioritized</div>
            </div>
        </div>
    </section>
</body>
</html>'''
    
    with open("deployment/web/index.html", "w", encoding="utf-8") as f:
        f.write(secure_html)
    print("✅ Secure HTML created at deployment/web/index.html")
    
    # Create nginx SSL configuration
    nginx_config = '''server {
    listen 80;
    server_name supermega.dev www.supermega.dev;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name supermega.dev www.supermega.dev;
    
    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/supermega.dev/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/supermega.dev/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    
    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    
    # Document Root
    root /var/www/supermega;
    index index.html;
    
    location / {
        try_files $uri $uri/ =404;
    }
}'''
    
    with open("deployment/nginx/supermega.conf", "w") as f:
        f.write(nginx_config)
    print("✅ Nginx SSL config created")
    
    # Create SSL certificate script
    ssl_script = '''#!/bin/bash
# SSL Certificate Setup for supermega.dev
echo "🔒 Setting up SSL certificate for supermega.dev"

# Install certbot if not present
if ! command -v certbot &> /dev/null; then
    echo "Installing certbot..."
    sudo apt-get update
    sudo apt-get install certbot python3-certbot-nginx -y
fi

# Obtain SSL certificate
sudo certbot --nginx -d supermega.dev -d www.supermega.dev --non-interactive --agree-tos --email admin@supermega.dev

# Auto-renewal
sudo crontab -l | grep -v certbot | (cat; echo "0 12 * * * /usr/bin/certbot renew --quiet") | sudo crontab -

echo "✅ SSL certificate setup complete for supermega.dev"
'''
    
    with open("deployment/scripts/setup_ssl.sh", "w") as f:
        f.write(ssl_script)
    os.chmod("deployment/scripts/setup_ssl.sh", 0o755)
    print("✅ SSL setup script created")
    
    # Create Docker deployment
    dockerfile_content = '''FROM nginx:alpine
COPY deployment/web/ /var/www/supermega/
COPY deployment/nginx/supermega.conf /etc/nginx/conf.d/default.conf
EXPOSE 80 443
CMD ["nginx", "-g", "daemon off;"]'''
    
    with open("deployment/Dockerfile", "w") as f:
        f.write(dockerfile_content)
    print("✅ Dockerfile created")
    
    print("\n🚀 SSL DEPLOYMENT SETUP COMPLETE")
    print("=" * 50)
    print("✅ Secure HTML page ready")
    print("✅ Nginx SSL config ready") 
    print("✅ SSL certificate script ready")
    print("✅ Docker deployment ready")
    print("\nNext: Deploy to supermega.dev with SSL!")

if __name__ == "__main__":
    setup_ssl_deployment()
