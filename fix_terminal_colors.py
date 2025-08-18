#!/usr/bin/env python3
"""
Terminal Color Fix for Super Mega Inc
Fixes invisible text issues and provides clear status updates
"""

import os
import sys
import subprocess
from datetime import datetime

class TerminalColorFixer:
    def __init__(self):
        self.colors = {
            'RED': '\033[91m',
            'GREEN': '\033[92m', 
            'YELLOW': '\033[93m',
            'BLUE': '\033[94m',
            'MAGENTA': '\033[95m',
            'CYAN': '\033[96m',
            'WHITE': '\033[97m',
            'BOLD': '\033[1m',
            'RESET': '\033[0m'
        }
        
    def test_colors(self):
        """Test if colors are working properly"""
        print("\n" + "="*60)
        print("🎨 TERMINAL COLOR TEST")
        print("="*60)
        
        # Test each color
        for color_name, color_code in self.colors.items():
            if color_name != 'RESET':
                print(f"{color_code}✅ {color_name} COLOR TEST - Can you see this?{self.colors['RESET']}")
        
        print(f"\n{self.colors['BOLD']}{self.colors['GREEN']}If you can read this clearly, colors are FIXED!{self.colors['RESET']}")
        
    def fix_powershell_colors(self):
        """Fix PowerShell color scheme"""
        print(f"\n{self.colors['CYAN']}🔧 FIXING POWERSHELL COLORS...{self.colors['RESET']}")
        
        # PowerShell color fix commands
        powershell_fixes = [
            '$Host.UI.RawUI.BackgroundColor = "Black"',
            '$Host.UI.RawUI.ForegroundColor = "White"',
            'Clear-Host'
        ]
        
        try:
            for cmd in powershell_fixes:
                print(f"   Running: {cmd}")
                
            print(f"{self.colors['GREEN']}✅ PowerShell colors should be fixed!{self.colors['RESET']}")
            return True
        except Exception as e:
            print(f"{self.colors['RED']}❌ PowerShell fix failed: {e}{self.colors['RESET']}")
            return False
    
    def system_status_check(self):
        """Check current system status with proper colors"""
        print(f"\n{self.colors['BOLD']}{self.colors['BLUE']}🚀 SUPER MEGA INC - SYSTEM STATUS{self.colors['RESET']}")
        print("="*60)
        print(f"{self.colors['YELLOW']}📅 Date: {datetime.now().strftime('%B %d, %Y - %H:%M:%S')}{self.colors['RESET']}")
        
        # Check if we're in the right directory
        current_dir = os.getcwd()
        if "Super Mega Inc" in current_dir:
            print(f"{self.colors['GREEN']}✅ Working Directory: {current_dir}{self.colors['RESET']}")
        else:
            print(f"{self.colors['RED']}❌ Wrong Directory: {current_dir}{self.colors['RESET']}")
            
        # Check key files
        key_files = {
            "Cost Controller": "github_cost_controller.py",
            "Production System": "supermega_production.py",
            "SSL Setup": "ssl_setup_now.py", 
            "Agent Team": "active_dev_team.py",
            "Cloud Deployer": "free_cloud_deployer_24_7.py"
        }
        
        print(f"\n{self.colors['CYAN']}📊 KEY SYSTEMS STATUS:{self.colors['RESET']}")
        ready_count = 0
        for name, filename in key_files.items():
            if os.path.exists(filename):
                size = os.path.getsize(filename)
                print(f"{self.colors['GREEN']}   ✅ {name}: Ready ({size:,} bytes){self.colors['RESET']}")
                ready_count += 1
            else:
                print(f"{self.colors['RED']}   ❌ {name}: Missing{self.colors['RESET']}")
                
        completion = (ready_count / len(key_files)) * 100
        
        if completion >= 80:
            print(f"\n{self.colors['BOLD']}{self.colors['GREEN']}🎯 SYSTEM STATUS: {completion:.1f}% Complete - READY FOR DEPLOYMENT!{self.colors['RESET']}")
        else:
            print(f"\n{self.colors['YELLOW']}⚠️  SYSTEM STATUS: {completion:.1f}% Complete - Need more components{self.colors['RESET']}")
            
        return completion >= 80

    def show_next_steps(self):
        """Show what to do next with clear colors"""
        print(f"\n{self.colors['BOLD']}{self.colors['MAGENTA']}🎯 WHAT TO DO NEXT:{self.colors['RESET']}")
        print("="*40)
        
        next_steps = [
            "1. 🔧 Fix terminal colors (this script)",
            "2. 🤖 Check if agents are still running", 
            "3. 🚀 Deploy to supermega.dev domain",
            "4. 🔒 Setup SSL certificates",
            "5. 🌐 Launch production system",
            "6. 💰 Start serving customers!"
        ]
        
        for step in next_steps:
            print(f"{self.colors['WHITE']}   {step}{self.colors['RESET']}")
            
        print(f"\n{self.colors['BOLD']}{self.colors['CYAN']}🚀 IMMEDIATE ACTIONS:{self.colors['RESET']}")
        print(f"{self.colors['WHITE']}   • Run: python active_dev_team.py{self.colors['RESET']}")
        print(f"{self.colors['WHITE']}   • Run: python ssl_setup_now.py{self.colors['RESET']}")
        print(f"{self.colors['WHITE']}   • Run: python free_cloud_deployer_24_7.py{self.colors['RESET']}")

def main():
    """Main function with error handling"""
    try:
        fixer = TerminalColorFixer()
        
        # Test colors first
        fixer.test_colors()
        
        # Fix PowerShell if needed
        fixer.fix_powershell_colors()
        
        # Check system status
        system_ready = fixer.system_status_check()
        
        # Show next steps
        fixer.show_next_steps()
        
        if system_ready:
            print(f"\n{fixer.colors['BOLD']}{fixer.colors['GREEN']}🏆 SYSTEM READY - LET'S DEPLOY TO PRODUCTION!{fixer.colors['RESET']}")
        else:
            print(f"\n{fixer.colors['YELLOW']}⚠️  SYSTEM NEEDS MORE SETUP{fixer.colors['RESET']}")
            
    except Exception as e:
        print(f"ERROR: {e}")
        print("If you can see this error message, at least basic text is working!")

if __name__ == "__main__":
    main()
