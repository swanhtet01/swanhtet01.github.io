# Manus Feedback Change Plan

Generated: 2025-08-14

Scope: Execute the “One Perfect Agent” strategy and ship a minimal, revenue-focused MVP (LinkedIn Content Machine) with simple backend, auth, and one killer workflow. Defer complex AWS infra until post-PMF.

## Checklist
- [x] Stop infra work on EC2/K8s for now; keep static site on GitHub Pages
- [x] Add minimal agent kernel hardening (auth token)
- [x] Add feedback intake flow for agents (store + plan)
- [ ] Scaffold simple Flask backend with JWT auth and SQLAlchemy models
- [ ] Implement LinkedIn Content Machine endpoint using OpenAI (env key only)
- [ ] Wire minimal front-end button to call backend (CORS allowed)
- [ ] Add README with Windows-friendly run steps and .env.example
- [ ] Optional Dockerfile for quick deploy to Render/Railway
- [ ] Success metrics logging (latency, errors, quality score)

## Guiding Principles (from feedback)
- Prove value: One agent saving 3+ hrs/week (LinkedIn Content)
- Keep stack simple: Managed hosting (Render/Railway), Supabase/SQLite
- Add infra later: Use AWS hybrid architecture once we have users & revenue

## Deliverable Targets (7-day plan)
Day 1-2: Backend auth + LinkedIn content endpoint (JWT, OpenAI integration)
Day 3: Basic campaign model and persistence (SQLite or Postgres)
Day 4: Front-end connection (login + generate content)
Day 5: Add quality scoring + analytics
Day 6: Social API adapters (Twitter/LinkedIn), toggled by env flags
Day 7: Testing, docs, deploy to a managed host
