# ============================================================
# BKK NODE SETUP SCRIPT - Windows
# Swan's Bangkok AI Infrastructure Node
# ============================================================
# Run as Administrator: Right-click PowerShell > Run as Administrator
# Then: Set-ExecutionPolicy Bypass -Scope Process -Force; .\setup-bkk-node.ps1
# ============================================================

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  BKK NODE SETUP - Swan's AI Infra" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Create base directories
$BASE_DIR = "C:\SwanAI"
$dirs = @(
    "$BASE_DIR\agents",
    "$BASE_DIR\data",
    "$BASE_DIR\logs",
    "$BASE_DIR\scripts",
    "$BASE_DIR\sync",
    "$BASE_DIR\backups",
    "$BASE_DIR\n8n",
    "$BASE_DIR\monitoring"
)

foreach ($dir in $dirs) {
    if (!(Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "Created: $dir" -ForegroundColor Green
    }
}

# ============================================================
# 1. INSTALL CHOCOLATEY (Package Manager)
# ============================================================
Write-Host "`n[1/8] Installing Chocolatey..." -ForegroundColor Yellow
if (!(Get-Command choco -ErrorAction SilentlyContinue)) {
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
    Write-Host "Chocolatey installed!" -ForegroundColor Green
} else {
    Write-Host "Chocolatey already installed" -ForegroundColor Gray
}

# ============================================================
# 2. INSTALL CORE TOOLS
# ============================================================
Write-Host "`n[2/8] Installing core tools..." -ForegroundColor Yellow

$packages = @(
    "python311",           # Python for scripts
    "nodejs-lts",          # Node.js for n8n
    "git",                 # Version control
    "tailscale",           # VPN mesh network
    "rclone",              # Cloud sync
    "docker-desktop",      # Containers (optional)
    "vscode",              # Code editor
    "googlechrome"         # Browser automation
)

foreach ($pkg in $packages) {
    Write-Host "Installing $pkg..." -ForegroundColor Gray
    choco install $pkg -y --no-progress 2>$null
}

# ============================================================
# 3. INSTALL PYTHON PACKAGES
# ============================================================
Write-Host "`n[3/8] Installing Python packages..." -ForegroundColor Yellow

$pythonPackages = @(
    "anthropic",           # Claude API
    "openai",              # OpenAI API
    "google-generativeai", # Gemini API
    "playwright",          # Browser automation
    "schedule",            # Task scheduling
    "watchdog",            # File monitoring
    "requests",            # HTTP client
    "pandas",              # Data processing
    "openpyxl",            # Excel files
    "python-telegram-bot", # Telegram alerts
    "discord.py",          # Discord alerts
    "redis",               # Queue client
    "psutil",              # System monitoring
    "pydantic"             # Data validation
)

$pipCmd = "pip install " + ($pythonPackages -join " ")
Invoke-Expression $pipCmd

# Install Playwright browsers
playwright install chromium

# ============================================================
# 4. INSTALL N8N (Workflow Automation)
# ============================================================
Write-Host "`n[4/8] Installing n8n..." -ForegroundColor Yellow

npm install -g n8n

# Create n8n startup script
$n8nScript = @"
@echo off
set N8N_PORT=5678
set N8N_PROTOCOL=http
set N8N_HOST=localhost
set GENERIC_TIMEZONE=Asia/Bangkok
set N8N_USER_FOLDER=C:\SwanAI\n8n
n8n start
"@
$n8nScript | Out-File -FilePath "$BASE_DIR\scripts\start-n8n.bat" -Encoding ASCII

# ============================================================
# 5. SETUP TAILSCALE
# ============================================================
Write-Host "`n[5/8] Configuring Tailscale..." -ForegroundColor Yellow

Write-Host @"
MANUAL STEP REQUIRED:
1. Open Tailscale from system tray
2. Sign in with your account
3. Note your Tailscale IP (100.x.x.x)
4. Enable 'Run at startup'
"@ -ForegroundColor Magenta

# ============================================================
# 6. SETUP RCLONE FOR GOOGLE DRIVE SYNC
# ============================================================
Write-Host "`n[6/8] Configuring rclone..." -ForegroundColor Yellow

$rcloneConfig = @"
# Run: rclone config
# Choose: n (new remote)
# Name: gdrive
# Type: drive (Google Drive)
# Follow OAuth prompts

# After setup, test with:
# rclone ls gdrive:

# Sync command (add to scheduled task):
# rclone sync gdrive:"YTF/CEO data" C:\SwanAI\sync\ceo-data --progress
"@
$rcloneConfig | Out-File -FilePath "$BASE_DIR\scripts\rclone-setup.txt" -Encoding UTF8

# ============================================================
# 7. CREATE AI AGENT SCRIPTS
# ============================================================
Write-Host "`n[7/8] Creating AI agent scripts..." -ForegroundColor Yellow

# Main agent runner
$agentRunner = @'
"""
BKK Node - AI Agent Runner
Runs autonomous agents that process tasks from the queue
"""
import os
import json
import time
import logging
import schedule
from datetime import datetime
from pathlib import Path

# Setup logging
LOG_DIR = Path("C:/SwanAI/logs")
LOG_DIR.mkdir(exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOG_DIR / f"agent_{datetime.now():%Y%m%d}.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("BKK-Agent")

# API Keys from environment
ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY")
OPENAI_KEY = os.getenv("OPENAI_API_KEY")
GEMINI_KEY = os.getenv("GEMINI_API_KEY")

class BKKAgent:
    def __init__(self):
        self.data_dir = Path("C:/SwanAI/data")
        self.sync_dir = Path("C:/SwanAI/sync")
        
    def check_new_files(self):
        """Check for new files to process"""
        logger.info("Checking for new files...")
        new_files = []
        for ext in ['*.xlsx', '*.csv', '*.pdf', '*.jpg', '*.png']:
            new_files.extend(self.sync_dir.rglob(ext))
        logger.info(f"Found {len(new_files)} files")
        return new_files
    
    def process_file(self, filepath):
        """Process a file with AI"""
        logger.info(f"Processing: {filepath}")
        # Add your processing logic here
        pass
    
    def send_daily_report(self):
        """Generate and send daily report"""
        logger.info("Generating daily report...")
        # Add report generation logic
        pass
    
    def health_check(self):
        """Report health status"""
        import psutil
        cpu = psutil.cpu_percent()
        mem = psutil.virtual_memory().percent
        disk = psutil.disk_usage('C:').percent
        logger.info(f"Health: CPU={cpu}%, MEM={mem}%, DISK={disk}%")
        return {"cpu": cpu, "memory": mem, "disk": disk}

def main():
    agent = BKKAgent()
    
    # Schedule tasks
    schedule.every(5).minutes.do(agent.check_new_files)
    schedule.every(1).hour.do(agent.health_check)
    schedule.every().day.at("07:00").do(agent.send_daily_report)
    
    logger.info("BKK Agent started - running scheduled tasks")
    
    while True:
        schedule.run_pending()
        time.sleep(60)

if __name__ == "__main__":
    main()
'@
$agentRunner | Out-File -FilePath "$BASE_DIR\agents\agent_runner.py" -Encoding UTF8

# File sync agent
$fileSyncAgent = @'
"""
File Sync Agent - Monitors Google Drive and syncs to YTF Platform
"""
import os
import subprocess
import time
import logging
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("FileSyncAgent")

SYNC_DIR = Path("C:/SwanAI/sync")
RCLONE_REMOTE = "gdrive:YTF"

class SyncHandler(FileSystemEventHandler):
    def on_created(self, event):
        if not event.is_directory:
            logger.info(f"New file detected: {event.src_path}")
            self.upload_to_ytf(event.src_path)
    
    def upload_to_ytf(self, filepath):
        """Upload file to YTF Platform via API"""
        # Implement API upload here
        logger.info(f"Uploading {filepath} to YTF Platform...")

def sync_from_gdrive():
    """Pull latest files from Google Drive"""
    folders = [
        ("CEO data", "ceo-data"),
        ("Plant A", "plant-a"),
        ("Plant B", "plant-b"),
    ]
    
    for remote_folder, local_folder in folders:
        local_path = SYNC_DIR / local_folder
        local_path.mkdir(exist_ok=True)
        
        cmd = f'rclone sync "{RCLONE_REMOTE}/{remote_folder}" "{local_path}" --progress'
        logger.info(f"Syncing {remote_folder}...")
        subprocess.run(cmd, shell=True)

def main():
    # Initial sync
    sync_from_gdrive()
    
    # Watch for local changes
    observer = Observer()
    observer.schedule(SyncHandler(), str(SYNC_DIR), recursive=True)
    observer.start()
    
    logger.info("File Sync Agent started")
    
    try:
        while True:
            # Periodic sync from Google Drive
            time.sleep(300)  # Every 5 minutes
            sync_from_gdrive()
    except KeyboardInterrupt:
        observer.stop()
    observer.join()

if __name__ == "__main__":
    main()
'@
$fileSyncAgent | Out-File -FilePath "$BASE_DIR\agents\file_sync_agent.py" -Encoding UTF8

# ============================================================
# 8. CREATE WINDOWS SCHEDULED TASKS
# ============================================================
Write-Host "`n[8/8] Creating scheduled tasks..." -ForegroundColor Yellow

# Create task to run agent on startup
$action = New-ScheduledTaskAction -Execute "python" -Argument "C:\SwanAI\agents\agent_runner.py"
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName "SwanAI-Agent" -Action $action -Trigger $trigger -Settings $settings -Description "Swan AI Agent Runner" -Force

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "  BKK NODE SETUP COMPLETE!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

Write-Host @"

NEXT STEPS:
1. Set environment variables:
   - ANTHROPIC_API_KEY
   - OPENAI_API_KEY  
   - GEMINI_API_KEY
   - TELEGRAM_BOT_TOKEN (optional)

2. Configure Tailscale:
   - Open Tailscale, sign in
   - Note your IP: 100.x.x.x

3. Configure rclone:
   - Run: rclone config
   - Setup Google Drive remote named 'gdrive'

4. Start services:
   - N8N: C:\SwanAI\scripts\start-n8n.bat
   - Agent: python C:\SwanAI\agents\agent_runner.py

5. Access n8n at: http://localhost:5678

"@ -ForegroundColor Cyan
