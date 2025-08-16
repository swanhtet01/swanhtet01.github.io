
import schedule
import time
import subprocess
from datetime import datetime

class BudgetOptimizedAgentScheduler:
    def __init__(self):
        self.daily_budget = 0.67  # $20/30 days
        self.current_spend = 0
        
    def run_innovation_lab(self):
        """Run innovation lab during off-peak hours"""
        if self.current_spend < self.daily_budget:
            print(f"🚀 Starting Innovation Lab - Budget remaining: ${self.daily_budget - self.current_spend:.2f}")
            subprocess.run(['python', 'innovation_lab.py'])
        else:
            print("💰 Daily budget reached, skipping Innovation Lab")
    
    def run_deployment_check(self):
        """Check and deploy if needed"""
        print("🔍 Checking for deployments...")
        subprocess.run(['python', 'deployment_engine.py', '--check-only'])
    
    def start_scheduler(self):
        """Start the budget-optimized scheduler"""
        # Run innovation lab twice daily during off-peak
        schedule.every().day.at("02:00").do(self.run_innovation_lab)
        schedule.every().day.at("14:00").do(self.run_innovation_lab)
        
        # Quick deployment checks every 6 hours
        schedule.every(6).hours.do(self.run_deployment_check)
        
        print("⏰ Budget-optimized scheduler started")
        while True:
            schedule.run_pending()
            time.sleep(60)

if __name__ == "__main__":
    scheduler = BudgetOptimizedAgentScheduler()
    scheduler.start_scheduler()
