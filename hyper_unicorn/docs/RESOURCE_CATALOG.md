# 🦄 HYPER UNICORN Resource Catalog

## Complete Inventory of Available Tools, APIs, and Infrastructure

---

## 1. AI MODEL APIs (Pre-Configured)

### Primary Intelligence Layer

| Provider | API Key Env | Models Available | Best For |
|----------|-------------|------------------|----------|
| **Google Gemini** | `GEMINI_API_KEY` | Gemini 2.0 Flash, Gemini Pro | Speed, multimodal, cost |
| **Anthropic** | `ANTHROPIC_API_KEY` | Claude 3.5 Sonnet, Claude 3 Opus | Complex reasoning, agents |
| **OpenAI** | `OPENAI_API_KEY` | GPT-4o, GPT-4o-mini | Code generation, general |

### Usage Patterns
```python
# Gemini - Fast tasks, routing decisions
# Claude - Complex reasoning, long context
# GPT-4o - Code generation, structured output
```

---

## 2. MCP INTEGRATIONS (Active)

### Gmail MCP Server
```bash
manus-mcp-cli tool list --server gmail
```

| Tool | Description |
|------|-------------|
| `gmail_search_messages` | Search with Gmail operators |
| `gmail_read_threads` | Read full thread content |
| `gmail_send_messages` | Send or draft emails |

### Google Calendar MCP Server
```bash
manus-mcp-cli tool list --server google-calendar
```

| Tool | Description |
|------|-------------|
| `google_calendar_search_events` | Search events with filters |
| `google_calendar_create_events` | Create new events |
| `google_calendar_get_event` | Get specific event |
| `google_calendar_update_events` | Modify existing events |
| `google_calendar_delete_events` | Remove events |

---

## 3. GOOGLE DRIVE (via rclone)

### Configuration
```bash
rclone --config /home/ubuntu/.gdrive-rclone.ini <command> manus_google_drive:<path>
```

### Available Folders
| Folder | Contents |
|--------|----------|
| `swanhtet01.github.io` | Website, agent configs, docs |
| `Yangon Tyre` | Business data, reports |
| `InsightAgent` | Agent development |
| `YTF_Thesis_Chapters` | Research documents |
| `Google AI Studio` | AI experiments |
| `code` | Code repositories |

### Key Operations
```bash
# List folders
rclone lsd manus_google_drive: --config /home/ubuntu/.gdrive-rclone.ini

# Download file
rclone copy "manus_google_drive:path/file" ./local/ --config /home/ubuntu/.gdrive-rclone.ini

# Upload file
rclone copy ./local/file "manus_google_drive:path/" --config /home/ubuntu/.gdrive-rclone.ini

# Sync folder
rclone sync ./local/ "manus_google_drive:path/" --config /home/ubuntu/.gdrive-rclone.ini

# Get shareable link
rclone link "manus_google_drive:path/file" --config /home/ubuntu/.gdrive-rclone.ini
```

---

## 4. GITHUB INTEGRATION

### Configuration
```bash
gh auth status  # Pre-authenticated
```

### Available Repository
- **swanhtet01/swanhtet01.github.io** - Main website and agent infrastructure

### Key Operations
```bash
# Clone repo
gh repo clone swanhtet01/swanhtet01.github.io

# Create issue
gh issue create --title "Title" --body "Description"

# Create PR
gh pr create --title "Title" --body "Description"

# View workflows
gh run list

# Trigger workflow
gh workflow run <workflow-name>
```

---

## 5. SPECIALIZED APIs

### ElevenLabs (Voice)
```bash
# Env: ELEVENLABS_API_KEY
pip install elevenlabs
```

| Capability | Use Case |
|------------|----------|
| Text-to-Speech | Voice notifications, audio content |
| Speech-to-Text | Transcription |
| Voice Cloning | Custom voices |

### Polygon.io (Financial Data)
```bash
# Env: POLYGON_API_KEY
pip install polygon-api-client
```

| Capability | Use Case |
|------------|----------|
| Stock data | Real-time and historical prices |
| Options data | Options chains, Greeks |
| Forex/Crypto | Currency data |

### Stripe (Payments)
```bash
# Env: STRIPE_SECRET_KEY
pip install stripe
```

| Capability | Use Case |
|------------|----------|
| Payment processing | Accept payments |
| Subscriptions | Recurring billing |
| Invoicing | Generate invoices |

### JSONBin.io (Simple Storage)
```bash
# Env: JSONBIN_API_KEY
# REST API - no SDK needed
```

| Capability | Use Case |
|------------|----------|
| JSON storage | Quick data persistence |
| Version control | Data history |
| Collections | Organize bins |

### Typeform (Forms)
```bash
# Env: TYPEFORM_API_KEY
# REST API
```

| Capability | Use Case |
|------------|----------|
| Create forms | Dynamic form generation |
| Get responses | Collect user input |
| Webhooks | Real-time notifications |

---

## 6. BANGKOK NODE HARDWARE

### System Specifications
| Component | Specification |
|-----------|---------------|
| **CPU** | AMD Ryzen 5 3600X (6 cores, 12 threads) |
| **RAM** | 32 GB DDR4-3200 (Dual Channel) |
| **GPU** | AMD Radeon RX 6600 (8 GB GDDR6) |
| **Storage** | 2 TB NVMe + 250 GB NVMe + 1 TB HDD |
| **OS** | Windows 11 Pro 25H2 |
| **Network** | Tailscale VPN |

### Network Access
| Method | Address |
|--------|---------|
| **Tailscale IP** | 100.113.30.52 |
| **Chrome Remote Desktop** | Configured |
| **Moonlight** | For gaming/streaming |

### Resource Limits
| Resource | Limit | Notes |
|----------|-------|-------|
| GPU VRAM | 8 GB | Limits local LLM size |
| Concurrent Agents | 6-8 | Based on RAM |
| Docker Containers | 10-15 | Based on resources |

---

## 7. SANDBOX ENVIRONMENT (Manus Cloud)

### Pre-installed Tools
| Category | Tools |
|----------|-------|
| **System** | bc, curl, git, wget, zip, unzip |
| **Python** | 3.11, pip3, venv |
| **Node.js** | 22.13.0, pnpm, yarn |
| **Python Packages** | pandas, numpy, matplotlib, plotly, fastapi, flask |
| **Utilities** | manus-render-diagram, manus-md-to-pdf, manus-speech-to-text |

### Browser Capabilities
- Chromium stable
- Login persistence
- Download directory: /home/ubuntu/Downloads/

---

## 8. RECOMMENDED ADDITIONS

### High Priority (Add Now)
| Tool | Purpose | Setup |
|------|---------|-------|
| **Tavily** | AI search | API key |
| **E2B** | Code sandboxes | API key |
| **Browser-Use** | Web automation | pip install |
| **Qdrant** | Vector memory | Docker |

### Medium Priority (Add Soon)
| Tool | Purpose | Setup |
|------|---------|-------|
| **Firecrawl** | Web scraping | API key |
| **LangSmith** | LLM observability | API key |
| **n8n** | Workflow automation | Docker |
| **Redis** | Caching/queues | Docker |

### Nice to Have
| Tool | Purpose | Setup |
|------|---------|-------|
| **Neo4j** | Knowledge graphs | Docker |
| **Temporal** | Durable workflows | Docker |
| **Grafana** | Monitoring | Docker |

---

## 9. INTEGRATION MATRIX

### What Can Talk to What

```
┌─────────────────────────────────────────────────────────────────┐
│                     HYPER UNICORN INTEGRATIONS                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │   Gmail      │────▶│   Agents     │────▶│   Calendar   │    │
│  │   MCP        │     │   (Claude/   │     │   MCP        │    │
│  └──────────────┘     │   GPT/Gemini)│     └──────────────┘    │
│         │             └──────────────┘            │             │
│         │                    │                    │             │
│         ▼                    ▼                    ▼             │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │   Google     │     │   GitHub     │     │   Bangkok    │    │
│  │   Drive      │     │   Repo       │     │   Node       │    │
│  └──────────────┘     └──────────────┘     └──────────────┘    │
│         │                    │                    │             │
│         └────────────────────┼────────────────────┘             │
│                              ▼                                   │
│                    ┌──────────────────┐                         │
│                    │   Specialized    │                         │
│                    │   APIs           │                         │
│                    │   (Voice, Data,  │                         │
│                    │   Payments)      │                         │
│                    └──────────────────┘                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 10. QUICK REFERENCE COMMANDS

### Gmail Operations
```bash
# Search emails
manus-mcp-cli tool call gmail_search_messages --server gmail --input '{"q": "from:important@example.com", "max_results": 10}'

# Read thread
manus-mcp-cli tool call gmail_read_threads --server gmail --input '{"thread_ids": ["thread_id_here"]}'

# Send email
manus-mcp-cli tool call gmail_send_messages --server gmail --input '{"messages": [{"to": ["recipient@example.com"], "subject": "Subject", "content": "Body"}]}'
```

### Calendar Operations
```bash
# Get upcoming events
manus-mcp-cli tool call google_calendar_search_events --server google-calendar --input '{"time_min": "2024-12-24T00:00:00Z", "max_results": 10}'

# Create event
manus-mcp-cli tool call google_calendar_create_events --server google-calendar --input '{"events": [{"summary": "Meeting", "start_time": "2024-12-25T10:00:00+07:00", "end_time": "2024-12-25T11:00:00+07:00"}]}'
```

### Google Drive Operations
```bash
# List root
rclone lsd manus_google_drive: --config /home/ubuntu/.gdrive-rclone.ini

# Download
rclone copy "manus_google_drive:folder/file.pdf" ./ --config /home/ubuntu/.gdrive-rclone.ini

# Upload
rclone copy ./file.pdf "manus_google_drive:folder/" --config /home/ubuntu/.gdrive-rclone.ini
```

### GitHub Operations
```bash
# Clone
gh repo clone swanhtet01/swanhtet01.github.io

# Commit and push
git add . && git commit -m "message" && git push

# Create PR
gh pr create --title "Title" --body "Description"
```

---

## 11. API COST ESTIMATES

### Per 1M Tokens
| Model | Input | Output |
|-------|-------|--------|
| Gemini 2.0 Flash | $0.075 | $0.30 |
| Claude 3.5 Sonnet | $3.00 | $15.00 |
| GPT-4o | $2.50 | $10.00 |
| GPT-4o-mini | $0.15 | $0.60 |

### Other APIs
| Service | Cost |
|---------|------|
| Tavily Search | $0.01/search |
| E2B Sandbox | $0.01/minute |
| ElevenLabs TTS | $0.30/1K chars |

---

**Last Updated:** December 2024
**Maintained By:** HYPER UNICORN System
