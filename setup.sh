#!/bin/bash
set -e

# ╔══════════════════════════════════════════════════════════╗
# ║  SuperMega Mark 1 — One-Command Bootstrap                ║
# ║  Usage: curl -fsSL https://supermega.dev/setup.sh | bash  ║
# ╚══════════════════════════════════════════════════════════╝

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'
BOLD='\033[1m'

echo -e "${CYAN}${BOLD}"
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║   SUPERMEGA MARK 1 — BOOTSTRAP                   ║"
echo "  ╚══════════════════════════════════════════════════╝"
echo -e "${NC}"

# ── Detect OS ──
OS="unknown"
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
  OS="linux"
elif [[ "$OSTYPE" == "darwin"* ]]; then
  OS="macos"
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
  OS="windows"
fi
echo -e "  ${CYAN}OS:${NC} $OS ($OSTYPE)"

# ── Check prerequisites ──
check_cmd() {
  if command -v "$1" &>/dev/null; then
    echo -e "  ${GREEN}✓${NC} $1 found"
    return 0
  else
    echo -e "  ${YELLOW}○${NC} $1 not found"
    return 1
  fi
}

echo ""
echo -e "  ${CYAN}── Prerequisites ──${NC}"
check_cmd git || { echo -e "  ${RED}✗ git is required. Install: https://git-scm.com${NC}"; exit 1; }
check_cmd node || { echo -e "  ${RED}✗ Node.js 22+ required. Install: https://nodejs.org${NC}"; exit 1; }
check_cmd python3 || echo -e "  ${YELLOW}⚠ Python 3.12+ recommended for AI tools${NC}"
check_cmd docker || echo -e "  ${YELLOW}⚠ Docker recommended for n8n and sandboxes${NC}"
check_cmd code || echo -e "  ${YELLOW}⚠ VS Code recommended: https://code.visualstudio.com${NC}"

# ── Clone repo ──
echo ""
echo -e "  ${CYAN}── Cloning Mark 1 Repository ──${NC}"
MARK1_DIR="$HOME/supermega-mark1"
if [ -d "$MARK1_DIR" ]; then
  echo -e "  ${GREEN}✓${NC} Repository exists at $MARK1_DIR"
  cd "$MARK1_DIR"
  git pull --rebase 2>/dev/null || echo -e "  ${YELLOW}⚠ Could not pull latest${NC}"
else
  git clone https://github.com/swanhtet01/swanhtet01.github.io.git "$MARK1_DIR"
  cd "$MARK1_DIR"
  echo -e "  ${GREEN}✓${NC} Cloned to $MARK1_DIR"
fi

# ── Install Mark 1 CLI ──
echo ""
echo -e "  ${CYAN}── Installing Mark 1 CLI ──${NC}"
cd mark1-cli
npm install --silent 2>/dev/null
npm link 2>/dev/null || sudo npm link 2>/dev/null
cd ..
echo -e "  ${GREEN}✓${NC} mark1 CLI installed globally"

# ── Install Mark 1 MCP Server ──
echo ""
echo -e "  ${CYAN}── Installing Mark 1 MCP Server ──${NC}"
cd mark1-mcp
npm install --silent 2>/dev/null
cd ..
echo -e "  ${GREEN}✓${NC} MCP server ready"

# ── Install AI coding tools ──
echo ""
echo -e "  ${CYAN}── Installing AI Coding Tools ──${NC}"
npm install -g @google/gemini-cli 2>/dev/null && echo -e "  ${GREEN}✓${NC} Gemini CLI" || echo -e "  ${YELLOW}○${NC} Gemini CLI (install manually: npm i -g @google/gemini-cli)"
npm install -g @openai/codex 2>/dev/null && echo -e "  ${GREEN}✓${NC} Codex CLI" || echo -e "  ${YELLOW}○${NC} Codex CLI (install manually: npm i -g @openai/codex)"

if command -v pip3 &>/dev/null || command -v pip &>/dev/null; then
  PIP=$(command -v pip3 || command -v pip)
  $PIP install --quiet aider-chat 2>/dev/null && echo -e "  ${GREEN}✓${NC} Aider" || echo -e "  ${YELLOW}○${NC} Aider (install manually: pip install aider-chat)"
  $PIP install --quiet crewai crewai-tools 2>/dev/null && echo -e "  ${GREEN}✓${NC} CrewAI" || echo -e "  ${YELLOW}○${NC} CrewAI (install manually: pip install crewai)"
  $PIP install --quiet browser-use 2>/dev/null && echo -e "  ${GREEN}✓${NC} Browser-Use" || echo -e "  ${YELLOW}○${NC} Browser-Use (install manually: pip install browser-use)"
  $PIP install --quiet langgraph langchain-google-genai 2>/dev/null && echo -e "  ${GREEN}✓${NC} LangGraph" || echo -e "  ${YELLOW}○${NC} LangGraph (install manually: pip install langgraph)"
fi

# ── Configure API keys ──
echo ""
echo -e "  ${CYAN}── API Key Configuration ──${NC}"
MARK1_CONFIG_DIR="$HOME/.mark1"
mkdir -p "$MARK1_CONFIG_DIR"

if [ ! -f "$MARK1_CONFIG_DIR/config.json" ]; then
  cat > "$MARK1_CONFIG_DIR/config.json" << 'EOF'
{
  "gemini_api_key": "",
  "dashboard_url": "https://supermega-mark1.manus.space",
  "gcp_project": "supermega-mark1"
}
EOF
  echo -e "  ${GREEN}✓${NC} Config created at ~/.mark1/config.json"
  echo -e "  ${YELLOW}⚠${NC} Run 'mark1 setup' to configure API keys"
else
  echo -e "  ${GREEN}✓${NC} Config exists at ~/.mark1/config.json"
fi

# ── Configure MCP for Claude Code ──
echo ""
echo -e "  ${CYAN}── Configuring MCP for AI Editors ──${NC}"
MARK1_MCP_PATH="$MARK1_DIR/mark1-mcp/server.mjs"

# Claude Desktop / Claude Code
CLAUDE_CONFIG_DIR="$HOME/.config"
mkdir -p "$CLAUDE_CONFIG_DIR"
cat > "$CLAUDE_CONFIG_DIR/claude_desktop_config.json" << EOF
{
  "mcpServers": {
    "mark1": {
      "command": "node",
      "args": ["$MARK1_MCP_PATH"],
      "env": {
        "GEMINI_API_KEY": "${GEMINI_API_KEY:-}"
      }
    }
  }
}
EOF
echo -e "  ${GREEN}✓${NC} Claude Code MCP configured"

# VS Code MCP (for Cline / Continue)
mkdir -p "$MARK1_DIR/.vscode"
cat > "$MARK1_DIR/.vscode/mcp.json" << EOF
{
  "servers": {
    "mark1": {
      "command": "node",
      "args": ["$MARK1_MCP_PATH"],
      "env": {
        "GEMINI_API_KEY": "${GEMINI_API_KEY:-}"
      }
    }
  }
}
EOF
echo -e "  ${GREEN}✓${NC} VS Code MCP configured (Cline/Continue)"

# ── Install VS Code extensions ──
if command -v code &>/dev/null; then
  echo ""
  echo -e "  ${CYAN}── Installing VS Code Extensions ──${NC}"
  EXTENSIONS=(
    "saoudrizwan.claude-dev"
    "continue.continue"
    "google.gemini-code-assist"
    "github.copilot"
    "github.copilot-chat"
    "ms-python.python"
    "dbaeumer.vscode-eslint"
    "esbenp.prettier-vscode"
    "eamodio.gitlens"
    "gruntfuggly.todo-tree"
    "usernamehw.errorlens"
  )
  for ext in "${EXTENSIONS[@]}"; do
    code --install-extension "$ext" --force 2>/dev/null && echo -e "  ${GREEN}✓${NC} $ext" || echo -e "  ${YELLOW}○${NC} $ext"
  done
fi

# ── Start n8n (optional) ──
if command -v docker &>/dev/null; then
  echo ""
  echo -e "  ${CYAN}── n8n Setup ──${NC}"
  echo -e "  To start n8n: docker run -d --name n8n -p 5678:5678 n8nio/n8n"
  echo -e "  Or install globally: npm install -g n8n && n8n start"
fi

# ── Summary ──
echo ""
echo -e "${CYAN}${BOLD}"
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║   MARK 1 WORKSPACE READY                         ║"
echo "  ╚══════════════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "  ${BOLD}Quick Start:${NC}"
echo -e "    ${CYAN}mark1 setup${NC}      — Configure API keys (Gemini, etc.)"
echo -e "    ${CYAN}mark1 status${NC}     — Check machine health"
echo -e "    ${CYAN}mark1 chat${NC}       — Talk to Mark 1 AI"
echo -e "    ${CYAN}mark1 tools${NC}      — View/install AI tools"
echo -e "    ${CYAN}mark1 agent list${NC} — View agent fleet"
echo ""
echo -e "  ${BOLD}Open in VS Code:${NC}"
echo -e "    ${CYAN}code $MARK1_DIR/mark1.code-workspace${NC}"
echo ""
echo -e "  ${BOLD}AI Coding Tools:${NC}"
echo -e "    ${CYAN}gemini${NC}           — Gemini CLI (vibe coding)"
echo -e "    ${CYAN}aider${NC}            — AI pair programming"
echo -e "    ${CYAN}claude${NC}           — Claude Code CLI"
echo ""
echo -e "  ${BOLD}Dashboard:${NC}"
echo -e "    https://supermega-mark1.manus.space"
echo ""
echo -e "  ${GREEN}${BOLD}Mark 1 is ready. Start building.${NC}"
echo ""
