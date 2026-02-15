# SuperMega Mark 1 Machine

**Your AI-native workspace that replaces Manus.**

Mark 1 is a complete development workspace with CLI tools, MCP server integration, AI coding agents, browser automation, and workflow orchestration. It runs from VS Code, terminal, or any AI editor (Claude Code, Cline, Cursor, Windsurf).

## One-Command Setup

```bash
git clone https://github.com/swanhtet01/swanhtet01.github.io.git ~/supermega-mark1
cd ~/supermega-mark1 && bash setup.sh
```

Or with curl:
```bash
curl -fsSL https://raw.githubusercontent.com/swanhtet01/swanhtet01.github.io/main/setup.sh | bash
```

## What You Get

| Component | What It Does | How to Use |
|-----------|-------------|------------|
| **mark1 CLI** | Command-line workspace control | `mark1 status`, `mark1 chat`, `mark1 tools` |
| **MCP Server** | Exposes Mark 1 to Claude Code/Cline/Cursor | Auto-configured in setup |
| **Dev Container** | One-click full environment in VS Code | Open in Container |
| **VS Code Workspace** | Multi-project workspace with tasks | `code mark1.code-workspace` |
| **AI Tool Catalog** | 60+ tools ready to install | `mark1 tools --install-all` |
| **n8n Workflows** | 12 automation templates | `mark1 n8n --start` |
| **Dashboard** | Web-based command center | supermega-mark1.manus.space |

## CLI Commands

```bash
mark1 status              # Machine health and status
mark1 chat                # Interactive AI chat (Gemini-powered)
mark1 chat "deploy plan"  # One-shot AI query
mark1 agent list          # View all 8 agents
mark1 agent run coder     # Run an agent task
mark1 tools               # List 60+ AI tools
mark1 tools --install-all # Install everything
mark1 n8n --start         # Start n8n locally
mark1 browse <url>        # Autonomous browser agent
mark1 setup               # Configure API keys
```

## MCP Integration

Mark 1 exposes 7 tools via MCP for any AI editor:

| Tool | Description |
|------|-------------|
| `mark1_status` | Machine status and health |
| `mark1_chat` | Talk to Mark 1 AI |
| `mark1_agents` | List/manage agents |
| `mark1_tools` | AI tool catalog |
| `mark1_execute` | Run shell commands |
| `mark1_file` | Read/write files |
| `mark1_search` | Web search via Gemini |

**Claude Code:** Auto-configured at `~/.config/claude_desktop_config.json`

**Cline (VS Code):** Auto-configured at `.vscode/mcp.json`

**Cursor:** Add to Cursor Settings > MCP Servers:
```json
{
  "mark1": {
    "command": "node",
    "args": ["/path/to/mark1-mcp/server.mjs"]
  }
}
```

## AI Coding Tools

| Tool | Install | Use For |
|------|---------|---------|
| Gemini CLI | `npm i -g @google/gemini-cli` | Vibe coding, code generation |
| Claude Code | `npm i -g @anthropic-ai/claude-code` | Complex reasoning, refactoring |
| Aider | `pip install aider-chat` | AI pair programming, git-aware |
| Codex CLI | `npm i -g @openai/codex` | Code completion, generation |
| CrewAI | `pip install crewai` | Multi-agent orchestration |
| Browser-Use | `pip install browser-use` | Autonomous web browsing |
| n8n | `npm i -g n8n` | Workflow automation |

## VS Code Setup

1. Open the workspace: `code mark1.code-workspace`
2. Install recommended extensions (prompted automatically)
3. Use Task Runner (`Ctrl+Shift+P` > "Run Task") for:
   - Mark 1: Status
   - Mark 1: Chat (Interactive)
   - Gemini CLI (Vibe Coding)
   - Aider (AI Pair Programming)
   - Start n8n

## Dev Container

For a fully isolated environment with everything pre-installed:

1. Install Docker Desktop
2. Install VS Code "Dev Containers" extension
3. Open this repo in VS Code
4. Click "Reopen in Container" when prompted
5. Everything installs automatically

## Architecture

```
mark1.code-workspace     ← VS Code multi-project workspace
setup.sh                 ← One-command bootstrap
mark1-cli/               ← CLI tool (npm global)
  bin/mark1.mjs          ← Main CLI entry point
mark1-mcp/               ← MCP server for AI editors
  server.mjs             ← 7 tools exposed via MCP
.devcontainer/           ← Dev Container config
  devcontainer.json      ← Container definition
  post-create.sh         ← Auto-install script
.vscode/                 ← VS Code settings
  mcp.json               ← MCP config for Cline
command-center/          ← Dashboard data
  n8n-workflows.json     ← 12 workflow templates
data/                    ← Machine status data
```

## API Keys Required

| Key | Where to Get | What For |
|-----|-------------|----------|
| `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com) | Mark 1 AI chat, Gemini CLI, agents |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) | Claude Code (optional) |
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com) | Codex CLI (optional) |

Configure with: `mark1 setup`

## Comparison: Mark 1 vs Manus

| Capability | Manus | Mark 1 |
|-----------|-------|--------|
| AI Chat | Built-in | CLI + Dashboard + MCP |
| Code Execution | Sandbox | Local + Docker + E2B |
| Browser Automation | Playwright | Browser-Use + Playwright |
| File Management | Built-in | CLI + MCP + VS Code |
| Agent Coordination | Internal | CrewAI + LangGraph + AutoGen |
| Workflow Automation | Limited | n8n (unlimited) |
| VS Code Integration | None | Full (MCP + Tasks + Workspace) |
| Customizable | No | Fully open source |
| Runs 24/7 | Per session | Always (your infrastructure) |
| Cost | Per credit | Your API keys only |

## License

MIT — Swan Htet / supermega.dev
