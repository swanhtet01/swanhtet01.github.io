#!/usr/bin/env python3
"""
Secure Environment Configuration
Manages API keys and credentials securely for all platforms
"""

import os
from pathlib import Path

# =============================================================================
# ENVIRONMENT CONFIGURATION
# =============================================================================

def setup_environment_variables():
    """Setup environment variables for all platform integrations"""
    
    # Create .env file template if it doesn't exist
    env_file = Path('.env')
    
    if not env_file.exists():
        env_template = """# AI Agent Platform - Environment Configuration
# Copy this file to .env and fill in your actual API keys

# OpenAI Configuration
OPENAI_API_KEY=your-openai-api-key-here

# Google APIs (Gmail, Calendar, etc.)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REFRESH_TOKEN=your-google-refresh-token

# Twitter API v2
TWITTER_API_KEY=your-twitter-api-key
TWITTER_API_SECRET=your-twitter-api-secret
TWITTER_ACCESS_TOKEN=your-twitter-access-token
TWITTER_ACCESS_TOKEN_SECRET=your-twitter-access-token-secret
TWITTER_BEARER_TOKEN=your-twitter-bearer-token

# Facebook API
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret
FACEBOOK_ACCESS_TOKEN=your-facebook-access-token

# Slack API
SLACK_BOT_TOKEN=your-slack-bot-token
SLACK_APP_TOKEN=your-slack-app-token

# LinkedIn API
LINKEDIN_CLIENT_ID=your-linkedin-client-id
LINKEDIN_CLIENT_SECRET=your-linkedin-client-secret
LINKEDIN_ACCESS_TOKEN=your-linkedin-access-token

# AWS Configuration (if different from default)
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_DEFAULT_REGION=us-east-1

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ai_agents
DB_USER=ai_user
DB_PASSWORD=secure_password

# Application Configuration
APP_ENV=production
APP_DEBUG=false
APP_LOG_LEVEL=info

# Security Configuration
SECRET_KEY=your-secret-key-for-sessions
JWT_SECRET=your-jwt-secret-key
ENCRYPTION_KEY=your-encryption-key

# Email Configuration (for notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password

# Monitoring and Analytics
ANALYTICS_TRACKING_ID=your-analytics-id
SENTRY_DSN=your-sentry-dsn-for-error-tracking

# Platform URLs
FRONTEND_URL=https://your-domain.com
API_BASE_URL=https://api.your-domain.com
WEBHOOK_URL=https://your-domain.com/webhook
"""
        
        with open(env_file, 'w') as f:
            f.write(env_template)
        
        print(f"✅ Created .env template file: {env_file.absolute()}")
        print("📝 Please edit .env with your actual API keys before running the system")

def load_environment():
    """Load environment variables from .env file"""
    
    env_file = Path('.env')
    
    if env_file.exists():
        # Simple .env file loader
        with open(env_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    if value and value != 'your-' + key.lower().replace('_', '-') + '-here':
                        os.environ[key] = value

def check_required_credentials():
    """Check if required credentials are configured"""
    
    required_vars = {
        'OPENAI_API_KEY': 'OpenAI API for LLM functionality',
        'GOOGLE_CLIENT_ID': 'Google APIs (Gmail, Calendar)',
        'TWITTER_API_KEY': 'Twitter integration',
        'FACEBOOK_ACCESS_TOKEN': 'Facebook integration'
    }
    
    missing_vars = []
    configured_vars = []
    
    for var, description in required_vars.items():
        value = os.getenv(var)
        if value and not value.startswith('your-'):
            configured_vars.append(f"✅ {var}: {description}")
        else:
            missing_vars.append(f"❌ {var}: {description}")
    
    return {
        'configured': configured_vars,
        'missing': missing_vars,
        'ready': len(missing_vars) == 0
    }

# =============================================================================
# AWS CREDENTIAL MANAGEMENT
# =============================================================================

def setup_aws_credentials():
    """Setup AWS credentials for EC2 deployment"""
    
    aws_dir = Path.home() / '.aws'
    aws_dir.mkdir(exist_ok=True)
    
    credentials_file = aws_dir / 'credentials'
    config_file = aws_dir / 'config'
    
    if not credentials_file.exists():
        credentials_template = """[default]
aws_access_key_id = YOUR_AWS_ACCESS_KEY_ID
aws_secret_access_key = YOUR_AWS_SECRET_ACCESS_KEY

[ai-agents]
aws_access_key_id = YOUR_AI_AGENTS_ACCESS_KEY
aws_secret_access_key = YOUR_AI_AGENTS_SECRET_KEY
"""
        
        with open(credentials_file, 'w') as f:
            f.write(credentials_template)
        
        os.chmod(credentials_file, 0o600)  # Secure permissions
        
        print(f"✅ Created AWS credentials template: {credentials_file}")
    
    if not config_file.exists():
        config_template = """[default]
region = us-east-1
output = json

[profile ai-agents]
region = us-east-1
output = json
"""
        
        with open(config_file, 'w') as f:
            f.write(config_template)
        
        print(f"✅ Created AWS config template: {config_file}")

# =============================================================================
# GOOGLE OAUTH SETUP
# =============================================================================

def setup_google_oauth():
    """Setup Google OAuth credentials"""
    
    credentials_template = {
        "web": {
            "client_id": "your-google-client-id",
            "client_secret": "your-google-client-secret",
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": ["http://localhost:8080/callback"]
        }
    }
    
    credentials_file = Path('google_credentials.json')
    
    if not credentials_file.exists():
        import json
        with open(credentials_file, 'w') as f:
            json.dump(credentials_template, f, indent=2)
        
        print(f"✅ Created Google OAuth credentials template: {credentials_file}")
        print("📝 Download your actual credentials.json from Google Cloud Console")

# =============================================================================
# PLATFORM INTEGRATION STATUS
# =============================================================================

def get_platform_status():
    """Get status of all platform integrations"""
    
    load_environment()
    
    platforms = {
        'OpenAI': {
            'required_vars': ['OPENAI_API_KEY'],
            'description': 'LLM functionality for AI agents'
        },
        'Google (Gmail/Calendar)': {
            'required_vars': ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
            'description': 'Email and calendar integration'
        },
        'Twitter': {
            'required_vars': ['TWITTER_API_KEY', 'TWITTER_API_SECRET', 'TWITTER_ACCESS_TOKEN'],
            'description': 'Social media management'
        },
        'Facebook': {
            'required_vars': ['FACEBOOK_ACCESS_TOKEN'],
            'description': 'Social media presence'
        },
        'Slack': {
            'required_vars': ['SLACK_BOT_TOKEN'],
            'description': 'Team communication'
        },
        'AWS': {
            'required_vars': ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
            'description': 'Cloud infrastructure deployment'
        }
    }
    
    status = {}
    
    for platform, config in platforms.items():
        configured = all(
            os.getenv(var) and not os.getenv(var).startswith('your-')
            for var in config['required_vars']
        )
        
        status[platform] = {
            'configured': configured,
            'description': config['description'],
            'required_vars': config['required_vars']
        }
    
    return status

# =============================================================================
# MAIN SETUP FUNCTION
# =============================================================================

def main():
    """Main setup function"""
    
    print("""
🔐 AI Agent Platform - Secure Environment Setup
==============================================

Setting up secure configuration for all platform integrations...
""")
    
    # Setup environment files
    setup_environment_variables()
    setup_aws_credentials()
    setup_google_oauth()
    
    # Load and check current configuration
    load_environment()
    status = get_platform_status()
    
    print("\n📊 Platform Integration Status:")
    print("=" * 50)
    
    ready_count = 0
    total_count = len(status)
    
    for platform, config in status.items():
        status_icon = "✅" if config['configured'] else "❌"
        print(f"{status_icon} {platform}: {config['description']}")
        
        if config['configured']:
            ready_count += 1
        else:
            missing_vars = [var for var in config['required_vars'] 
                          if not os.getenv(var) or os.getenv(var).startswith('your-')]
            print(f"   Missing: {', '.join(missing_vars)}")
    
    print(f"\n🎯 Configuration Status: {ready_count}/{total_count} platforms ready")
    
    if ready_count == total_count:
        print("🚀 All platforms configured! Ready for deployment.")
    else:
        print("📝 Edit .env file with your actual API keys to complete setup.")
        print("💡 You can run with partial configuration - only configured platforms will be active.")
    
    print(f"""
📁 Configuration Files Created:
   • .env - Main environment variables
   • ~/.aws/credentials - AWS credentials  
   • ~/.aws/config - AWS configuration
   • google_credentials.json - Google OAuth setup

🔒 Security Notes:
   • Never commit .env file to Git
   • AWS credentials have restricted permissions (600)
   • Use environment variables in production
   • Rotate API keys regularly

Next Steps:
1. Edit .env with your actual API keys
2. Test with: python platform_integration_manager.py
3. Deploy with: python ec2_24x7_optimizer.py
""")

if __name__ == "__main__":
    main()
