# HYPER UNICORN - Windows Deployment Script
# Run this in PowerShell as Administrator

Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     HYPER UNICORN - Windows Deployment Script                ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "⚠️  Please run this script as Administrator!" -ForegroundColor Yellow
    Write-Host "   Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

# Set execution policy
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force

# Navigate to script directory
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectPath = Split-Path -Parent $scriptPath
Set-Location $projectPath

Write-Host "📁 Working directory: $projectPath" -ForegroundColor Green

# ============================================================================
# Step 1: Check Prerequisites
# ============================================================================
Write-Host ""
Write-Host "🔍 Checking prerequisites..." -ForegroundColor Yellow

# Check Python
$pythonVersion = python --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Python not found. Installing via winget..." -ForegroundColor Red
    winget install Python.Python.3.11
} else {
    Write-Host "✅ $pythonVersion" -ForegroundColor Green
}

# Check Docker
$dockerVersion = docker --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Docker not found. Please install Docker Desktop from:" -ForegroundColor Red
    Write-Host "   https://www.docker.com/products/docker-desktop" -ForegroundColor Cyan
    Write-Host "   After installing, restart this script." -ForegroundColor Yellow
} else {
    Write-Host "✅ $dockerVersion" -ForegroundColor Green
}

# Check Git
$gitVersion = git --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Git not found. Installing via winget..." -ForegroundColor Red
    winget install Git.Git
} else {
    Write-Host "✅ $gitVersion" -ForegroundColor Green
}

# ============================================================================
# Step 2: Create Environment File
# ============================================================================
Write-Host ""
Write-Host "📝 Setting up environment..." -ForegroundColor Yellow

if (-not (Test-Path ".env")) {
    Copy-Item ".env.template" ".env"
    Write-Host "✅ Created .env file from template" -ForegroundColor Green
    Write-Host ""
    Write-Host "⚠️  IMPORTANT: Edit .env file with your API keys!" -ForegroundColor Yellow
    Write-Host "   Open with: notepad .env" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "   Required keys:" -ForegroundColor White
    Write-Host "   - GEMINI_API_KEY (from https://aistudio.google.com/)" -ForegroundColor Gray
    Write-Host "   - ANTHROPIC_API_KEY (from https://console.anthropic.com/)" -ForegroundColor Gray
    Write-Host "   - OPENAI_API_KEY (from https://platform.openai.com/)" -ForegroundColor Gray
    Write-Host ""
    
    # Open notepad to edit
    $editNow = Read-Host "Would you like to edit .env now? (y/n)"
    if ($editNow -eq "y") {
        notepad .env
        Write-Host "Press Enter after saving .env file..."
        Read-Host
    }
} else {
    Write-Host "✅ .env file already exists" -ForegroundColor Green
}

# ============================================================================
# Step 3: Create Python Virtual Environment
# ============================================================================
Write-Host ""
Write-Host "🐍 Setting up Python environment..." -ForegroundColor Yellow

if (-not (Test-Path "venv")) {
    python -m venv venv
    Write-Host "✅ Created virtual environment" -ForegroundColor Green
}

# Activate virtual environment
& ".\venv\Scripts\Activate.ps1"

# Install dependencies
Write-Host "📦 Installing Python dependencies..." -ForegroundColor Yellow
pip install --upgrade pip
pip install -r requirements.txt

Write-Host "✅ Python environment ready" -ForegroundColor Green

# ============================================================================
# Step 4: Create Workspace Directories
# ============================================================================
Write-Host ""
Write-Host "📂 Creating agent workspaces..." -ForegroundColor Yellow

$workspaces = @(
    "workspaces\research",
    "workspaces\code",
    "workspaces\content",
    "workspaces\data",
    "workspaces\browser",
    "workspaces\financial",
    "workspaces\communication",
    "workspaces\ceo",
    "workspaces\shared",
    "workspaces\outputs",
    "data\memory",
    "data\knowledge_graph",
    "data\backups",
    "logs"
)

foreach ($workspace in $workspaces) {
    if (-not (Test-Path $workspace)) {
        New-Item -ItemType Directory -Path $workspace -Force | Out-Null
        Write-Host "  ✅ Created $workspace" -ForegroundColor Gray
    }
}

Write-Host "✅ Workspace directories created" -ForegroundColor Green

# ============================================================================
# Step 5: Start Docker Services
# ============================================================================
Write-Host ""
Write-Host "🐳 Starting Docker services..." -ForegroundColor Yellow

# Check if Docker is running
$dockerRunning = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Docker Desktop is not running. Please start it first." -ForegroundColor Yellow
    Write-Host "   After Docker starts, run: docker-compose up -d" -ForegroundColor Cyan
} else {
    # Start services
    docker-compose up -d
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Docker services started" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Docker services may have issues. Check with: docker-compose logs" -ForegroundColor Yellow
    }
}

# ============================================================================
# Step 6: Display Access Information
# ============================================================================
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║     🦄 HYPER UNICORN - Deployment Complete!                  ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "📍 Access Points:" -ForegroundColor Cyan
Write-Host "   Alfred Dashboard:    http://localhost:8501" -ForegroundColor White
Write-Host "   API Server:          http://localhost:8080" -ForegroundColor White
Write-Host "   Real-time Dashboard: http://localhost:8081" -ForegroundColor White
Write-Host "   n8n Workflows:       http://localhost:5678" -ForegroundColor White
Write-Host "   Qdrant:              http://localhost:6333" -ForegroundColor White
Write-Host ""
Write-Host "📍 Via Tailscale (100.113.30.52):" -ForegroundColor Cyan
Write-Host "   Alfred Dashboard:    http://100.113.30.52:8501" -ForegroundColor White
Write-Host "   API Server:          http://100.113.30.52:8080" -ForegroundColor White
Write-Host ""
Write-Host "🚀 Quick Commands:" -ForegroundColor Cyan
Write-Host "   Start Dashboard:     python -m streamlit run interfaces\alfred_dashboard.py" -ForegroundColor Gray
Write-Host "   Start API:           python api\server.py" -ForegroundColor Gray
Write-Host "   Run Tests:           python -m pytest tests\" -ForegroundColor Gray
Write-Host "   CLI Help:            python -m cli.unicorn_cli --help" -ForegroundColor Gray
Write-Host ""
Write-Host "📚 Documentation:" -ForegroundColor Cyan
Write-Host "   README.md            - Getting started guide" -ForegroundColor Gray
Write-Host "   QUICKSTART.md        - Quick deployment guide" -ForegroundColor Gray
Write-Host "   PROJECT_STATUS.md    - Full system overview" -ForegroundColor Gray
Write-Host ""
