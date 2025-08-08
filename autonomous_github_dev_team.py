#!/usr/bin/env python3
"""
Super Mega Inc - Autonomous GitHub Development Team
Continuous repository management and deployment system
"""

import os
import sys
import time
import json
import logging
import asyncio
import subprocess
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import requests
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('autonomous_dev_team.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger('AutoDevTeam')

class GitHubDevTeam:
    def __init__(self):
        self.config = self.load_config()
        self.repositories = {
            'main_website': 'https://github.com/swanhtet01/swanhtet01.github.io.git',
            'cloud_agent': 'https://github.com/swanhtet01/CloudAgent.git'
        }
        self.local_repo_path = Path.cwd()
        self.status = {
            'last_update': None,
            'commits_today': 0,
            'deployments': 0,
            'active_agents': []
        }
        
    def load_config(self) -> Dict:
        """Load configuration from file or create default"""
        config_file = 'dev_team_config.yaml'
        default_config = {
            'update_interval_minutes': 30,
            'auto_commit_enabled': True,
            'auto_deploy_enabled': True,
            'github_pages_enabled': True,
            'monitoring_enabled': True,
            'agents': {
                'website_agent': True,
                'deployment_agent': True,
                'monitoring_agent': True,
                'update_agent': True
            }
        }
        
        if os.path.exists(config_file):
            try:
                import yaml
                with open(config_file, 'r') as f:
                    return yaml.safe_load(f) or default_config
            except:
                return default_config
        return default_config

    async def check_website_status(self) -> Dict:
        """Check if the website is accessible and functioning"""
        try:
            response = requests.get('https://swanhtet01.github.io/', timeout=10)
            status = {
                'website_up': response.status_code == 200,
                'response_time': response.elapsed.total_seconds(),
                'last_check': datetime.now().isoformat(),
                'status_code': response.status_code
            }
            logger.info(f"Website Status: {status}")
            return status
        except Exception as e:
            logger.error(f"Website check failed: {e}")
            return {
                'website_up': False,
                'error': str(e),
                'last_check': datetime.now().isoformat()
            }

    def get_git_status(self) -> Dict:
        """Get current git repository status"""
        try:
            # Check if we have uncommitted changes
            result = subprocess.run(['git', 'status', '--porcelain'], 
                                  capture_output=True, text=True)
            has_changes = bool(result.stdout.strip())
            
            # Get current branch
            branch_result = subprocess.run(['git', 'branch', '--show-current'], 
                                         capture_output=True, text=True)
            current_branch = branch_result.stdout.strip()
            
            # Get last commit info
            commit_result = subprocess.run(['git', 'log', '-1', '--oneline'], 
                                         capture_output=True, text=True)
            last_commit = commit_result.stdout.strip()
            
            return {
                'has_changes': has_changes,
                'current_branch': current_branch,
                'last_commit': last_commit,
                'timestamp': datetime.now().isoformat()
            }
        except Exception as e:
            logger.error(f"Git status check failed: {e}")
            return {'error': str(e)}

    async def auto_commit_and_push(self) -> bool:
        """Automatically commit and push changes if any"""
        try:
            git_status = self.get_git_status()
            
            if not git_status.get('has_changes'):
                logger.info("No changes to commit")
                return True
                
            # Add all changes
            subprocess.run(['git', 'add', '.'], check=True)
            
            # Create commit message with timestamp
            commit_msg = f"Autonomous update - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
            subprocess.run(['git', 'commit', '-m', commit_msg], check=True)
            
            # Push to main branch (GitHub Pages)
            result = subprocess.run(['git', 'push', 'origin', 'main'], 
                                  capture_output=True, text=True)
            
            if result.returncode == 0:
                logger.info(f"Successfully pushed changes: {commit_msg}")
                self.status['commits_today'] += 1
                self.status['last_update'] = datetime.now().isoformat()
                return True
            else:
                logger.error(f"Push failed: {result.stderr}")
                return False
                
        except Exception as e:
            logger.error(f"Auto commit/push failed: {e}")
            return False

    async def deploy_website_updates(self) -> bool:
        """Deploy any website updates to GitHub Pages"""
        try:
            # Check if website files have been updated
            website_files = ['index.html', 'README-Social-AI.md', 
                           'Facebook-Marketing-Strategy.md', 'DEPLOYMENT-GUIDE.md']
            
            updated_files = []
            for file in website_files:
                if os.path.exists(file):
                    # Check if file was modified recently (last 24 hours)
                    mod_time = datetime.fromtimestamp(os.path.getmtime(file))
                    if datetime.now() - mod_time < timedelta(hours=24):
                        updated_files.append(file)
            
            if updated_files:
                logger.info(f"Deploying updated files: {updated_files}")
                success = await self.auto_commit_and_push()
                if success:
                    self.status['deployments'] += 1
                    # Wait for GitHub Pages to build
                    await asyncio.sleep(120)  # 2 minutes
                    # Verify deployment
                    website_status = await self.check_website_status()
                    return website_status.get('website_up', False)
                    
            return True
            
        except Exception as e:
            logger.error(f"Deployment failed: {e}")
            return False

    async def monitoring_agent(self):
        """Continuous monitoring agent"""
        while True:
            try:
                logger.info("🔍 Monitoring Agent: Checking system status...")
                
                # Check website status
                website_status = await self.check_website_status()
                
                # Check git status
                git_status = self.get_git_status()
                
                # Save status report
                status_report = {
                    'timestamp': datetime.now().isoformat(),
                    'website': website_status,
                    'git': git_status,
                    'team_status': self.status
                }
                
                with open('autonomous_status_report.json', 'w') as f:
                    json.dump(status_report, f, indent=2)
                
                logger.info(f"Status Report: Website Up: {website_status.get('website_up')}")
                
                # Sleep for monitoring interval
                await asyncio.sleep(self.config.get('update_interval_minutes', 30) * 60)
                
            except Exception as e:
                logger.error(f"Monitoring agent error: {e}")
                await asyncio.sleep(300)  # 5 minutes on error

    async def update_agent(self):
        """Continuous update agent"""
        while True:
            try:
                logger.info("🔄 Update Agent: Checking for updates...")
                
                if self.config.get('auto_commit_enabled', True):
                    await self.auto_commit_and_push()
                
                if self.config.get('auto_deploy_enabled', True):
                    await self.deploy_website_updates()
                
                # Sleep for update interval
                await asyncio.sleep(self.config.get('update_interval_minutes', 30) * 60)
                
            except Exception as e:
                logger.error(f"Update agent error: {e}")
                await asyncio.sleep(300)  # 5 minutes on error

    async def website_optimization_agent(self):
        """Agent to optimize website performance and content"""
        while True:
            try:
                logger.info("🚀 Website Agent: Optimizing website...")
                
                # Check website performance
                website_status = await self.check_website_status()
                
                if website_status.get('response_time', 0) > 3.0:
                    logger.warning("Website response time is slow, optimizing...")
                    # Could add optimization logic here
                
                # Check for broken links, optimize images, etc.
                # This is where you'd add more sophisticated website optimization
                
                await asyncio.sleep(3600)  # Check every hour
                
            except Exception as e:
                logger.error(f"Website agent error: {e}")
                await asyncio.sleep(600)  # 10 minutes on error

    def generate_status_dashboard(self) -> str:
        """Generate a status dashboard"""
        dashboard = f"""
╔══════════════════════════════════════════════════════════════════╗
║                    SUPER MEGA DEV TEAM STATUS                    ║
╠══════════════════════════════════════════════════════════════════╣
║ 🚀 Website: https://swanhtet01.github.io/                       ║
║ 📊 Commits Today: {self.status.get('commits_today', 0):<10}                           ║
║ 🔄 Deployments: {self.status.get('deployments', 0):<10}                            ║
║ ⏰ Last Update: {self.status.get('last_update', 'Never'):<20}                ║
║ 🤖 Active Agents: {len(self.status.get('active_agents', [])):<10}                         ║
╠══════════════════════════════════════════════════════════════════╣
║ Status: 🟢 OPERATIONAL - Autonomous development active          ║
╚══════════════════════════════════════════════════════════════════╝
        """
        return dashboard

    async def start_autonomous_team(self):
        """Start all autonomous agents"""
        logger.info("🚀 Starting Super Mega Autonomous Development Team...")
        
        self.status['active_agents'] = ['monitoring', 'update', 'website']
        
        # Print initial status
        print(self.generate_status_dashboard())
        
        # Start all agents concurrently
        tasks = []
        
        if self.config.get('monitoring_enabled', True):
            tasks.append(asyncio.create_task(self.monitoring_agent()))
            
        if self.config.get('auto_commit_enabled', True):
            tasks.append(asyncio.create_task(self.update_agent()))
            
        if self.config.get('agents', {}).get('website_agent', True):
            tasks.append(asyncio.create_task(self.website_optimization_agent()))
        
        try:
            await asyncio.gather(*tasks)
        except KeyboardInterrupt:
            logger.info("Autonomous team stopped by user")
        except Exception as e:
            logger.error(f"Autonomous team error: {e}")

def main():
    """Main entry point"""
    print("🚀 Super Mega Inc - Autonomous GitHub Development Team")
    print("=" * 60)
    
    try:
        team = GitHubDevTeam()
        
        # Run initial checks
        print("\n🔍 Running initial system checks...")
        git_status = team.get_git_status()
        print(f"Git Status: {git_status.get('current_branch', 'unknown')} branch")
        
        # Start the autonomous team
        asyncio.run(team.start_autonomous_team())
        
    except KeyboardInterrupt:
        print("\n👋 Autonomous development team stopped")
    except Exception as e:
        print(f"❌ Error starting autonomous team: {e}")
        logger.error(f"Main error: {e}")

if __name__ == "__main__":
    main()
