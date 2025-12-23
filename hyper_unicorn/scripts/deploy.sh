#!/bin/bash
# ============================================================================
# HYPER UNICORN Deployment Script
# SuperMega.dev AI Agent Infrastructure
# ============================================================================

set -e

echo "🦄 HYPER UNICORN Deployment"
echo "=========================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running on Bangkok Node
check_prerequisites() {
    echo -e "${YELLOW}Checking prerequisites...${NC}"
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}Docker not found. Installing...${NC}"
        curl -fsSL https://get.docker.com | sh
        sudo usermod -aG docker $USER
        echo -e "${GREEN}Docker installed. Please log out and back in, then run this script again.${NC}"
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        echo -e "${RED}Docker Compose not found. Installing...${NC}"
        sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
        sudo chmod +x /usr/local/bin/docker-compose
    fi
    
    # Check Git
    if ! command -v git &> /dev/null; then
        echo -e "${RED}Git not found. Installing...${NC}"
        sudo apt-get update && sudo apt-get install -y git
    fi
    
    echo -e "${GREEN}All prerequisites met!${NC}"
}

# Setup environment
setup_environment() {
    echo -e "${YELLOW}Setting up environment...${NC}"
    
    # Create .env if not exists
    if [ ! -f .env ]; then
        cp .env.template .env
        echo -e "${YELLOW}Created .env file. Please edit it with your API keys:${NC}"
        echo "  nano .env"
        echo ""
        echo "Required: At least one of GEMINI_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY"
        exit 1
    fi
    
    # Check if API keys are set
    source .env
    if [ -z "$GEMINI_API_KEY" ] && [ -z "$ANTHROPIC_API_KEY" ] && [ -z "$OPENAI_API_KEY" ]; then
        echo -e "${RED}No API keys found in .env. Please add at least one.${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}Environment configured!${NC}"
}

# Create required directories
create_directories() {
    echo -e "${YELLOW}Creating directories...${NC}"
    
    mkdir -p data/mca
    mkdir -p config/nginx/ssl
    mkdir -p config/grafana/provisioning/dashboards
    mkdir -p config/grafana/provisioning/datasources
    
    echo -e "${GREEN}Directories created!${NC}"
}

# Create Prometheus config
create_prometheus_config() {
    echo -e "${YELLOW}Creating Prometheus config...${NC}"
    
    cat > config/prometheus.yml << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'mca'
    static_configs:
      - targets: ['mca:8080']

  - job_name: 'node'
    static_configs:
      - targets: ['node-exporter:9100']
EOF
    
    echo -e "${GREEN}Prometheus config created!${NC}"
}

# Create Nginx config
create_nginx_config() {
    echo -e "${YELLOW}Creating Nginx config...${NC}"
    
    cat > config/nginx/nginx.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    upstream mca {
        server mca:8080;
    }
    
    upstream dashboard {
        server dashboard:8501;
    }
    
    upstream n8n {
        server n8n:5678;
    }

    server {
        listen 80;
        server_name _;

        location / {
            proxy_pass http://dashboard;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }

        location /api/ {
            proxy_pass http://mca/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }

        location /n8n/ {
            proxy_pass http://n8n/;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
        }
    }
}
EOF
    
    echo -e "${GREEN}Nginx config created!${NC}"
}

# Deploy services
deploy_services() {
    echo -e "${YELLOW}Deploying services...${NC}"
    
    # Pull images
    docker-compose pull
    
    # Build custom images
    docker-compose build
    
    # Start services
    docker-compose up -d
    
    echo -e "${GREEN}Services deployed!${NC}"
}

# Check service health
check_health() {
    echo -e "${YELLOW}Checking service health...${NC}"
    
    sleep 10  # Wait for services to start
    
    # Check MCA
    if curl -s http://localhost:8080/health > /dev/null; then
        echo -e "${GREEN}✓ MCA is healthy${NC}"
    else
        echo -e "${RED}✗ MCA is not responding${NC}"
    fi
    
    # Check Dashboard
    if curl -s http://localhost:8501/_stcore/health > /dev/null; then
        echo -e "${GREEN}✓ Dashboard is healthy${NC}"
    else
        echo -e "${RED}✗ Dashboard is not responding${NC}"
    fi
    
    # Check Redis
    if docker exec hyper-redis redis-cli ping > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Redis is healthy${NC}"
    else
        echo -e "${RED}✗ Redis is not responding${NC}"
    fi
    
    # Check Qdrant
    if curl -s http://localhost:6333/health > /dev/null; then
        echo -e "${GREEN}✓ Qdrant is healthy${NC}"
    else
        echo -e "${RED}✗ Qdrant is not responding${NC}"
    fi
}

# Print access info
print_access_info() {
    echo ""
    echo "=============================================="
    echo -e "${GREEN}🦄 HYPER UNICORN Deployed Successfully!${NC}"
    echo "=============================================="
    echo ""
    echo "Access your services:"
    echo ""
    echo "  📊 Alfred Dashboard: http://$(hostname -I | awk '{print $1}'):8501"
    echo "  🤖 MCA API:          http://$(hostname -I | awk '{print $1}'):8080"
    echo "  ⚡ n8n Workflows:    http://$(hostname -I | awk '{print $1}'):5678"
    echo "  📈 Grafana:          http://$(hostname -I | awk '{print $1}'):3000"
    echo "  📉 Prometheus:       http://$(hostname -I | awk '{print $1}'):9090"
    echo ""
    echo "Tailscale access (if configured):"
    echo "  📊 Dashboard: http://100.113.30.52:8501"
    echo ""
    echo "Default credentials:"
    echo "  n8n:     admin / (check .env)"
    echo "  Grafana: admin / (check .env)"
    echo ""
    echo "View logs:"
    echo "  docker-compose logs -f"
    echo ""
    echo "Stop services:"
    echo "  docker-compose down"
    echo ""
}

# Main
main() {
    cd "$(dirname "$0")/.."
    
    check_prerequisites
    setup_environment
    create_directories
    create_prometheus_config
    create_nginx_config
    deploy_services
    check_health
    print_access_info
}

main "$@"
