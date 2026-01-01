# Tailscale Mesh Network Setup

## Overview
Tailscale creates a secure mesh VPN between all your devices. Once connected, they can communicate using private IPs (100.x.x.x) regardless of physical location.

## Setup Steps

### 1. Create Tailscale Account
1. Go to https://tailscale.com
2. Sign up with Google/GitHub/Microsoft
3. Note your tailnet name (e.g., `swan.tailnet.ts.net`)

### 2. Install on AWS Instance
```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --advertise-tags=tag:server --hostname=swan-aws
```

### 3. Install on BKK Node (Windows)
1. Download from https://tailscale.com/download/windows
2. Install and sign in
3. Right-click tray icon → Settings → Set hostname to `swan-bkk`

### 4. Verify Connection
```bash
# On AWS
tailscale status

# Should show:
# 100.x.x.x   swan-aws      linux   -
# 100.x.x.x   swan-bkk      windows -
```

### 5. Test Connectivity
```bash
# From AWS to BKK
ping swan-bkk

# From BKK to AWS (PowerShell)
ping swan-aws
```

## Network Topology

```
┌─────────────────────────────────────────────────────────────┐
│                    TAILSCALE MESH                           │
│                                                             │
│  ┌─────────────┐         ┌─────────────┐                   │
│  │  swan-aws   │◄───────►│  swan-bkk   │                   │
│  │ 100.x.x.1   │         │ 100.x.x.2   │                   │
│  │ Singapore   │         │ Bangkok     │                   │
│  └─────────────┘         └─────────────┘                   │
│         │                       │                           │
│         ▼                       ▼                           │
│  ┌─────────────┐         ┌─────────────┐                   │
│  │ API Gateway │         │ File Sync   │                   │
│  │ Redis Queue │         │ Heavy Tasks │                   │
│  │ Monitoring  │         │ Local AI    │                   │
│  └─────────────┘         └─────────────┘                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Access Control (ACLs)

Add to Tailscale Admin Console → Access Controls:

```json
{
  "acls": [
    {
      "action": "accept",
      "src": ["tag:server"],
      "dst": ["tag:server:*"]
    }
  ],
  "tagOwners": {
    "tag:server": ["autogroup:admin"]
  }
}
```

## Service Discovery

Once connected, services can reach each other:

| Service | AWS Address | BKK Address |
|---------|-------------|-------------|
| API Gateway | swan-aws:8000 | - |
| Redis | swan-aws:6379 | - |
| N8N (AWS) | swan-aws:5678 | - |
| N8N (BKK) | - | swan-bkk:5678 |
| File Sync | - | swan-bkk:8080 |

## Environment Variables

### AWS Instance
```bash
export BKK_NODE_URL="http://swan-bkk:8080"
export REDIS_HOST="localhost"
```

### BKK Node
```powershell
$env:AWS_API_URL = "http://swan-aws:8000"
$env:REDIS_HOST = "swan-aws"
```

## Troubleshooting

### Node not visible
```bash
# Check status
tailscale status

# Re-authenticate
sudo tailscale up --reset
```

### Connection timeout
```bash
# Check firewall
sudo ufw status

# Allow Tailscale
sudo ufw allow in on tailscale0
```

### DNS not resolving
```bash
# Use IP instead of hostname
tailscale ip swan-bkk
# Returns: 100.x.x.x
```
