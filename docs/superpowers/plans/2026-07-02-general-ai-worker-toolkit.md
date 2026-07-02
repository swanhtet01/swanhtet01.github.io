# General AI Worker Toolkit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship SuperMega's AI agents as a sellable general-use worker toolkit with behavior monitoring and verifier coverage.

**Architecture:** Keep the existing static public generator as the source of truth. Extend the agent-template data model, render the same catalog into products, agent pages, setup kits, and contact routing, then add a first-party behavior endpoint copied into Vercel output.

**Tech Stack:** Node.js ESM generator, Vercel static output/functions, primary Vercel Postgres/Neon behavior ledger, Supabase REST fallback when configured, Vercel Blob/HTTP-safe degraded status when not configured.

---

### Task 1: Expand Worker Catalog

**Files:**
- Modify: `tools/public_agent_templates.mjs`

- [ ] Add three templates: `document-pdf-intake-ledger`, `crm-follow-up-pipeline-assistant`, and `proposal-sow-builder`.
- [ ] Ensure every template has `buyer`, `promise`, `firstProof`, `setupInputs`, `sampleSources`, `firstRunWorkflow`, `outputs`, and `pricingLabel`.
- [ ] Extend starter kit output with privacy-safe `adaptation_signals` and `approval_required_before`.

### Task 2: Render Sellable Shelf

**Files:**
- Modify: `tools/create_public_vercel_output.mjs`

- [ ] Replace the three-card agent sprint section with a generated General AI Worker Toolkit shelf from the template catalog.
- [ ] Add copy that explains first-party behavior monitoring and adaptation without promising autonomous writes.
- [ ] Keep contact/setup links carrying the chosen template.
- [ ] Add `/api/behavior-events` and `/api/behavior-events/status` routes to the Vercel config.
- [ ] Copy `api/behavior-events.js` into Vercel output with `writeNodeFunction`.

### Task 3: Add Behavior Endpoint

**Files:**
- Create: `api/behavior-events.js`
- Create: `docs/supabase/supermega_behavior_events.sql`

- [ ] Accept `GET` for endpoint status.
- [ ] Accept `POST` with coarse event data: `event_type`, `page_path`, `template_id`, `requested_package`, `utm_*`, and referrer.
- [ ] Reject oversized, invalid, disallowed-origin, and rate-limited requests.
- [ ] Write to Vercel Postgres/Neon table `supermega_behavior_events` when configured, fall back to Supabase REST when available, otherwise return a degraded ledger status.
- [ ] Add an authenticated `?summary=1` behavior summary with template-level event counts and an adaptation queue behind `SUPERMEGA_OPS_KEY`.

### Task 3B: Surface Behavior Signals In Operator Console

**Files:**
- Modify: `tools/create_public_vercel_output.mjs`
- Modify: `tools/audit_public_usability.mjs`

- [ ] Add a private Behavior summary board to `/operator/`.
- [ ] Render events in 24h/7d, top templates, event mix, recent signals, and adaptation queue.
- [ ] Keep all behavior-summary reads behind the existing ops key.
- [ ] Add browser usability coverage for the sample behavior/adaptation board on desktop and mobile.

### Task 4: Add Client Event Hooks

**Files:**
- Modify: `tools/create_public_vercel_output.mjs`

- [ ] Add a shared inline script that sends `page_viewed`, `cta_clicked`, `template_clicked`, `setup_started`, and `lead_form_submitted`.
- [ ] Do not send text input values, uploaded file data, or private source content.
- [ ] Keep failures silent so analytics never blocks the site.

### Task 5: Guard With Verifiers

**Files:**
- Modify: `tools/verify_public_vercel_output.mjs`

- [ ] Require all nine worker templates in products, contact router, JSON, Markdown, detail pages, and setup pages.
- [ ] Require the General AI Worker Toolkit copy and behavior monitoring copy on `/ai-agents/`.
- [ ] Require `api/behavior-events.js` in Vercel output and status route in `config.json`.

### Task 6: Regenerate, Verify, Deploy

**Commands:**
- `node tools/create_public_vercel_output.mjs`
- `node tools/verify_public_vercel_output.mjs`
- `powershell -ExecutionPolicy Bypass -File tools\run_public_go_live_check.ps1 -SkipLeadPost -HttpOnlyAliases`
- `powershell -ExecutionPolicy Bypass -File tools\deploy_public_supermega.ps1 -SkipBuild`
- `powershell -ExecutionPolicy Bypass -File tools\check_public_aliases.ps1 -HttpOnly`

Expected result: generator and verifier exit `0`, deployment returns a production URL, and both `supermega.dev` aliases return HTTP 200.
