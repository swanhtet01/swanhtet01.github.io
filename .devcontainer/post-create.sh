#!/bin/bash
set -e

echo "╔══════════════════════════════════════════════════╗"
echo "║   SUPERMEGA MARK 1 — WORKSPACE SETUP             ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ── Node.js tools ──
echo "→ Installing Node.js AI tools..."
npm install -g @google/gemini-cli 2>/dev/null || echo "  ⚠ Gemini CLI: install manually"
npm install -g @openai/codex 2>/dev/null || echo "  ⚠ Codex CLI: install manually"
npm install -g n8n 2>/dev/null || echo "  ⚠ n8n: install manually"

# ── Mark 1 CLI ──
echo "→ Installing Mark 1 CLI..."
cd mark1-cli && npm install && npm link && cd ..
echo "  ✓ mark1 CLI available globally"

# ── Mark 1 MCP Server ──
echo "→ Installing Mark 1 MCP Server..."
cd mark1-mcp && npm install && cd ..
echo "  ✓ MCP server ready"

# ── Python AI tools ──
echo "→ Installing Python AI tools..."
pip install --quiet aider-chat 2>/dev/null || echo "  ⚠ Aider: install manually"
pip install --quiet crewai crewai-tools 2>/dev/null || echo "  ⚠ CrewAI: install manually"
pip install --quiet langgraph langchain-google-genai 2>/dev/null || echo "  ⚠ LangGraph: install manually"
pip install --quiet autogen-agentchat 2>/dev/null || echo "  ⚠ AutoGen: install manually"
pip install --quiet browser-use 2>/dev/null || echo "  ⚠ browser-use: install manually"
pip install --quiet playwright 2>/dev/null || echo "  ⚠ Playwright: install manually"
pip install --quiet composio-core 2>/dev/null || echo "  ⚠ Composio: install manually"
python3 -m playwright install chromium 2>/dev/null || echo "  ⚠ Playwright browsers: install manually"

# ── Project dependencies ──
echo "→ Installing project dependencies..."
npm install

# ── MCP config for Claude Code ──
echo "→ Configuring MCP for Claude Code..."
mkdir -p ~/.config
MARK1_MCP_PATH="$(pwd)/mark1-mcp/server.mjs"
cat > ~/.config/claude_desktop_config.json << EOF
{
  "mcpServers": {
    "mark1": {
      "command": "node",
      "args": ["${MARK1_MCP_PATH}"],
      "env": {
        "GEMINI_API_KEY": "${GEMINI_API_KEY:-}"
      }
    }
  }
}
EOF
echo "  ✓ Claude Code MCP configured"

# ── VS Code MCP config for Cline ──
echo "→ Configuring MCP for Cline/Continue..."
mkdir -p .vscode
cat > .vscode/mcp.json << EOF
{
  "servers": {
    "mark1": {
      "command": "node",
      "args": ["${MARK1_MCP_PATH}"],
      "env": {
        "GEMINI_API_KEY": "${GEMINI_API_KEY:-}"
      }
    }
  }
}
EOF
echo "  ✓ VS Code MCP configured"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║   MARK 1 WORKSPACE READY                         ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "  Available commands:"
echo "    mark1 status     — Machine health"
echo "    mark1 chat       — Talk to Mark 1 AI"
echo "    mark1 agent list — View agent fleet"
echo "    mark1 tools      — AI tool catalog"
echo "    mark1 setup      — Configure API keys"
echo "    gemini           — Gemini CLI (vibe coding)"
echo "    aider            — Aider (AI pair programming)"
echo "    n8n start        — Start n8n workflows"
echo ""
