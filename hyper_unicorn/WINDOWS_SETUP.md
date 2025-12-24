# 🦄 HYPER UNICORN - Windows Setup Guide

Complete guide to deploying HYPER UNICORN on your Bangkok Node (Windows 11).

## Prerequisites

### Required Software

| Software | Purpose | Download |
|----------|---------|----------|
| **Python 3.11+** | Core runtime | [python.org](https://www.python.org/downloads/) |
| **Node.js 18+** | MCP servers | [nodejs.org](https://nodejs.org/) |
| **Docker Desktop** | Containerization | [docker.com](https://www.docker.com/products/docker-desktop/) |
| **Git** | Version control | [git-scm.com](https://git-scm.com/download/win) |
| **VS Code** | Editor (optional) | [code.visualstudio.com](https://code.visualstudio.com/) |

### Install via winget (Windows Package Manager)

Open PowerShell as Administrator and run:

```powershell
# Install all prerequisites
winget install Python.Python.3.11
winget install OpenJS.NodeJS.LTS
winget install Docker.DockerDesktop
winget install Git.Git
winget install Microsoft.VisualStudioCode
```

---

## Step 1: Clone the Repository

```powershell
# Navigate to your preferred directory
cd G:\My Drive\

# Clone the repo
git clone https://github.com/swanhtet01/swanhtet01.github.io.git
cd swanhtet01.github.io\hyper_unicorn
```

---

## Step 2: Configure Environment

### Create .env file

```powershell
# Copy the template
Copy-Item .env.template .env

# Open in Notepad to edit
notepad .env
```

### Required API Keys

Add these to your `.env` file:

```env
# AI Models (at least one required)
GEMINI_API_KEY=your_gemini_key_here
ANTHROPIC_API_KEY=your_anthropic_key_here
OPENAI_API_KEY=your_openai_key_here

# Search (recommended)
TAVILY_API_KEY=your_tavily_key_here

# Your existing keys
POLYGON_API_KEY=your_polygon_key
ELEVENLABS_API_KEY=your_elevenlabs_key
STRIPE_SECRET_KEY=your_stripe_key
```

### Where to get API keys:

| Service | URL | Free Tier |
|---------|-----|-----------|
| Gemini | https://aistudio.google.com/ | Yes |
| Anthropic | https://console.anthropic.com/ | $5 credit |
| OpenAI | https://platform.openai.com/ | $5 credit |
| Tavily | https://tavily.com/ | 1000 free searches |

---

## Step 3: Setup Python Environment

```powershell
# Create virtual environment
python -m venv venv

# Activate it
.\venv\Scripts\Activate.ps1

# If you get an execution policy error, run:
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Install dependencies
pip install -r requirements.txt
```

---

## Step 4: Create Workspace Directories

```powershell
# Create all workspace directories
$dirs = @(
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

foreach ($dir in $dirs) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    Write-Host "Created: $dir"
}
```

---

## Step 5: Start Docker Services (Optional but Recommended)

### Start Docker Desktop first, then:

```powershell
# Start all services
docker-compose up -d

# Check status
docker-compose ps
```

### Services started:

| Service | Port | URL |
|---------|------|-----|
| Redis | 6379 | localhost:6379 |
| Qdrant | 6333 | http://localhost:6333 |
| n8n | 5678 | http://localhost:5678 |

---

## Step 6: Start HYPER UNICORN

### Option A: Start Dashboard Only (Simplest)

```powershell
# Make sure venv is activated
.\venv\Scripts\Activate.ps1

# Start Streamlit dashboard
python -m streamlit run interfaces\alfred_dashboard.py
```

Access at: **http://localhost:8501**

### Option B: Start API Server

```powershell
# In a new terminal
.\venv\Scripts\Activate.ps1
python api\server.py
```

Access at: **http://localhost:8080**

### Option C: Start Everything

```powershell
# Terminal 1: Dashboard
python -m streamlit run interfaces\alfred_dashboard.py

# Terminal 2: API Server
python api\server.py

# Terminal 3: Real-time Dashboard
python -m streamlit run interfaces\realtime_dashboard.py --server.port 8081
```

---

## Step 7: Access via Tailscale

Your Bangkok Node is at: **100.113.30.52**

From any device on your Tailscale network:

| Service | URL |
|---------|-----|
| Dashboard | http://100.113.30.52:8501 |
| API | http://100.113.30.52:8080 |
| Real-time | http://100.113.30.52:8081 |
| n8n | http://100.113.30.52:5678 |

---

## Quick Commands Reference

```powershell
# Activate virtual environment
.\venv\Scripts\Activate.ps1

# Start dashboard
python -m streamlit run interfaces\alfred_dashboard.py

# Start API
python api\server.py

# Run tests
python -m pytest tests\

# CLI help
python -m cli.unicorn_cli --help

# Docker services
docker-compose up -d      # Start
docker-compose down       # Stop
docker-compose logs -f    # View logs
```

---

## Troubleshooting

### "execution policy" error

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### "pip not found"

```powershell
python -m pip install --upgrade pip
```

### Docker not starting

1. Open Docker Desktop
2. Wait for it to fully start (whale icon in system tray)
3. Try `docker-compose up -d` again

### Port already in use

```powershell
# Find what's using port 8501
netstat -ano | findstr :8501

# Kill the process (replace PID with actual number)
taskkill /PID <PID> /F
```

### Module not found

```powershell
# Make sure venv is activated
.\venv\Scripts\Activate.ps1

# Reinstall dependencies
pip install -r requirements.txt
```

---

## Next Steps

1. **Open the Dashboard** at http://localhost:8501
2. **Submit your first goal** - Try "Research the latest AI agent frameworks"
3. **Explore workspaces** - Each agent has a dedicated workspace
4. **Configure n8n** - Set up automated workflows at http://localhost:5678
5. **Add more MCP servers** - Edit the MCP configuration

---

## File Structure

```
hyper_unicorn/
├── agents/           # Agent implementations
├── api/              # FastAPI server
├── cli/              # Command-line interface
├── config/           # Configuration system
├── core/             # Core systems (MCA, Intelligence Fabric)
├── integrations/     # Google, MCP, SuperMega integrations
├── interfaces/       # Streamlit dashboards
├── marketplace/      # Agent marketplace
├── memory/           # Memory systems (Cortex, Knowledge Graph)
├── monitoring/       # Health checks, profiler
├── scheduler/        # Task scheduler
├── tools/            # Mega tools
├── workflows/        # n8n workflow templates
├── workspaces/       # Agent workspaces
├── docker-compose.yml
├── requirements.txt
├── .env.template
├── DEPLOY.bat        # Quick Windows setup
└── WINDOWS_SETUP.md  # This guide
```

---

## Support

- **GitHub Issues**: https://github.com/swanhtet01/swanhtet01.github.io/issues
- **Documentation**: See `docs/` folder
- **Project Status**: See `PROJECT_STATUS.md`
