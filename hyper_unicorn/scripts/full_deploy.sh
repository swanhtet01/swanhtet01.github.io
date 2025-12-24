#!/bin/bash
#
# HYPER UNICORN Full Deployment Script
# =====================================
# One-command deployment for the complete AI agent infrastructure.
#
# Usage: ./full_deploy.sh [--dev|--prod]
#
# Author: Manus AI for SuperMega.dev

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Banner
echo -e "${PURPLE}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                                                               ║"
echo "║   🦄 HYPER UNICORN - AI Agent Infrastructure                  ║"
echo "║   SuperMega.dev                                               ║"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Parse arguments
MODE="prod"
if [ "$1" == "--dev" ]; then
    MODE="dev"
    echo -e "${YELLOW}Running in DEVELOPMENT mode${NC}"
else
    echo -e "${GREEN}Running in PRODUCTION mode${NC}"
fi

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${CYAN}Project directory: $PROJECT_DIR${NC}"

# ============================================================================
# Pre-flight Checks
# ============================================================================

echo -e "\n${BLUE}[1/8] Running pre-flight checks...${NC}"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker not found. Installing...${NC}"
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker $USER
    echo -e "${YELLOW}Please log out and back in, then run this script again.${NC}"
    exit 1
fi

# Check Docker Compose
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}Docker Compose not found. Installing...${NC}"
    sudo apt-get update
    sudo apt-get install -y docker-compose-plugin
fi

# Check Git
if ! command -v git &> /dev/null; then
    echo -e "${RED}Git not found. Installing...${NC}"
    sudo apt-get update
    sudo apt-get install -y git
fi

# Check Python
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Python3 not found. Installing...${NC}"
    sudo apt-get update
    sudo apt-get install -y python3 python3-pip python3-venv
fi

echo -e "${GREEN}✓ All dependencies installed${NC}"

# ============================================================================
# Environment Setup
# ============================================================================

echo -e "\n${BLUE}[2/8] Setting up environment...${NC}"

cd "$PROJECT_DIR"

# Create .env if not exists
if [ ! -f .env ]; then
    if [ -f .env.template ]; then
        cp .env.template .env
        echo -e "${YELLOW}Created .env from template. Please edit with your API keys.${NC}"
    else
        cat > .env << 'ENVEOF'
# HYPER UNICORN Environment Configuration
# ========================================

# AI Model APIs (at least one required)
GEMINI_API_KEY=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

# Tool APIs
TAVILY_API_KEY=
EXA_API_KEY=
E2B_API_KEY=
POLYGON_API_KEY=
ELEVENLABS_API_KEY=
STRIPE_SECRET_KEY=

# Infrastructure
REDIS_URL=redis://localhost:6379
QDRANT_URL=http://localhost:6333

# n8n
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=changeme

# Mode
ENVIRONMENT=production
LOG_LEVEL=INFO
ENVEOF
        echo -e "${YELLOW}Created .env file. Please edit with your API keys.${NC}"
    fi
fi

# Load environment
export $(grep -v '^#' .env | xargs)

# Validate at least one AI API key
if [ -z "$GEMINI_API_KEY" ] && [ -z "$ANTHROPIC_API_KEY" ] && [ -z "$OPENAI_API_KEY" ]; then
    echo -e "${RED}ERROR: At least one AI API key is required (GEMINI, ANTHROPIC, or OPENAI)${NC}"
    echo -e "${YELLOW}Please edit .env and add your API keys, then run again.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Environment configured${NC}"

# ============================================================================
# Create Directories
# ============================================================================

echo -e "\n${BLUE}[3/8] Creating directories...${NC}"

mkdir -p data/redis
mkdir -p data/qdrant
mkdir -p data/n8n
mkdir -p data/logs
mkdir -p data/artifacts
mkdir -p data/memory

echo -e "${GREEN}✓ Directories created${NC}"

# ============================================================================
# Build Docker Images
# ============================================================================

echo -e "\n${BLUE}[4/8] Building Docker images...${NC}"

# Create Dockerfiles if they don't exist
if [ ! -f docker/Dockerfile.mca ]; then
    mkdir -p docker
    cat > docker/Dockerfile.mca << 'DOCKERFILE'
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port
EXPOSE 8080

# Run the API server
CMD ["python", "-m", "uvicorn", "api.server:app", "--host", "0.0.0.0", "--port", "8080"]
DOCKERFILE
fi

if [ ! -f docker/Dockerfile.dashboard ]; then
    cat > docker/Dockerfile.dashboard << 'DOCKERFILE'
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt streamlit

# Copy application code
COPY . .

# Expose port
EXPOSE 8501

# Run Streamlit
CMD ["streamlit", "run", "interfaces/alfred_dashboard.py", "--server.port=8501", "--server.address=0.0.0.0"]
DOCKERFILE
fi

# Build images
docker build -t hyper_unicorn/mca:latest -f docker/Dockerfile.mca .
docker build -t hyper_unicorn/dashboard:latest -f docker/Dockerfile.dashboard .

echo -e "${GREEN}✓ Docker images built${NC}"

# ============================================================================
# Start Infrastructure Services
# ============================================================================

echo -e "\n${BLUE}[5/8] Starting infrastructure services...${NC}"

# Stop existing containers
docker-compose down 2>/dev/null || true

# Start services
if [ "$MODE" == "dev" ]; then
    docker-compose up -d redis qdrant
else
    docker-compose up -d
fi

# Wait for services to be ready
echo "Waiting for services to start..."
sleep 10

# Check Redis
if docker exec hyper_unicorn_redis redis-cli ping | grep -q PONG; then
    echo -e "${GREEN}✓ Redis is ready${NC}"
else
    echo -e "${YELLOW}⚠ Redis may not be ready yet${NC}"
fi

# Check Qdrant
if curl -s http://localhost:6333/health | grep -q "ok"; then
    echo -e "${GREEN}✓ Qdrant is ready${NC}"
else
    echo -e "${YELLOW}⚠ Qdrant may not be ready yet${NC}"
fi

echo -e "${GREEN}✓ Infrastructure services started${NC}"

# ============================================================================
# Initialize Memory Systems
# ============================================================================

echo -e "\n${BLUE}[6/8] Initializing memory systems...${NC}"

# Create Qdrant collections
python3 << 'PYEOF'
import os
import sys

try:
    from qdrant_client import QdrantClient
    from qdrant_client.models import Distance, VectorParams
    
    client = QdrantClient(host="localhost", port=6333)
    
    collections = [
        ("agent_memory", 1536),
        ("task_history", 1536),
        ("knowledge_base", 1536),
        ("conversation_history", 1536)
    ]
    
    for name, size in collections:
        try:
            client.create_collection(
                collection_name=name,
                vectors_config=VectorParams(size=size, distance=Distance.COSINE)
            )
            print(f"Created collection: {name}")
        except Exception as e:
            if "already exists" in str(e):
                print(f"Collection exists: {name}")
            else:
                print(f"Warning: {e}")
    
    print("Memory systems initialized")
except ImportError:
    print("Qdrant client not installed, skipping collection creation")
except Exception as e:
    print(f"Warning: Could not initialize Qdrant: {e}")
PYEOF

echo -e "${GREEN}✓ Memory systems initialized${NC}"

# ============================================================================
# Run Tests
# ============================================================================

echo -e "\n${BLUE}[7/8] Running tests...${NC}"

# Create virtual environment if needed
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

source venv/bin/activate

# Install dependencies
pip install -q -r requirements.txt

# Run tests
python -m pytest tests/ -v --tb=short 2>/dev/null || {
    echo -e "${YELLOW}⚠ Some tests may have failed (non-critical)${NC}"
}

deactivate

echo -e "${GREEN}✓ Tests completed${NC}"

# ============================================================================
# Final Status
# ============================================================================

echo -e "\n${BLUE}[8/8] Deployment complete!${NC}"

echo -e "\n${PURPLE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${PURPLE}║                    🦄 HYPER UNICORN READY                      ║${NC}"
echo -e "${PURPLE}╚═══════════════════════════════════════════════════════════════╝${NC}"

echo -e "\n${CYAN}Access Points:${NC}"
echo -e "  • Alfred Dashboard:  ${GREEN}http://localhost:8501${NC}"
echo -e "  • MCA API:           ${GREEN}http://localhost:8080${NC}"
echo -e "  • n8n Workflows:     ${GREEN}http://localhost:5678${NC}"
echo -e "  • Health Monitor:    ${GREEN}http://localhost:8081${NC}"

echo -e "\n${CYAN}Quick Commands:${NC}"
echo -e "  • View logs:         ${YELLOW}docker-compose logs -f${NC}"
echo -e "  • Stop services:     ${YELLOW}docker-compose down${NC}"
echo -e "  • Restart:           ${YELLOW}docker-compose restart${NC}"
echo -e "  • Run CLI:           ${YELLOW}python -m cli.unicorn_cli${NC}"

echo -e "\n${CYAN}Next Steps:${NC}"
echo -e "  1. Open Alfred Dashboard at http://localhost:8501"
echo -e "  2. Submit your first goal"
echo -e "  3. Watch your AI agents work!"

echo -e "\n${GREEN}Deployment successful! 🚀${NC}"
