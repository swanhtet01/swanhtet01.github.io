# SuperMega Backend (MVP)

Minimal Flask backend to support the “One Perfect Agent” MVP (LinkedIn Content Machine).

## Features
- JWT auth: register, login, profile
- Content API: POST /api/content/linkedin/generate
- SQLite by default (or supply DATABASE_URL)

## Quickstart (Windows PowerShell)
```
python -m venv .venv
. .\.venv\Scripts\Activate.ps1
pip install -r supermega_backend/requirements.txt
$env:JWT_SECRET="dev-secret"
# Optional if you have a key
# $env:OPENAI_API_KEY="sk-..."
python supermega_backend/run.py
```

Test:
```
# Register
Invoke-RestMethod -Method Post -Uri http://localhost:5000/api/auth/register -ContentType 'application/json' -Body '{"email":"test@example.com","password":"pass123"}'
# Login
$login = Invoke-RestMethod -Method Post -Uri http://localhost:5000/api/auth/login -ContentType 'application/json' -Body '{"email":"test@example.com","password":"pass123"}'
$token = $login.access_token
# Generate LinkedIn content
Invoke-RestMethod -Method Post -Uri http://localhost:5000/api/content/linkedin/generate -Headers @{"Authorization"="Bearer $token"} -ContentType 'application/json' -Body '{"topic":"AI strategy","audience":"B2B executives","brand":"Super Mega"}'
```

## Deploy later
- Use Render/Railway first; move to AWS (ECS/Lambda) after PMF.
