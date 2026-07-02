# General AI Worker Toolkit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship SuperMega's AI agents as a sellable general-use worker toolkit with behavior monitoring and verifier coverage.

**Architecture:** Keep the existing static public generator as the source of truth. Extend the agent-template data model, render the same catalog into products, agent pages, setup kits, and contact routing, then add a first-party behavior endpoint copied into Vercel output.

**Tech Stack:** Node.js ESM generator, Vercel static output/functions, primary Vercel Postgres/Neon behavior ledger, Supabase REST fallback when configured, Vercel Blob/HTTP-safe degraded status when not configured.

---

### Task 1: Expand Worker Catalog

**Files:**
- Modify: `tools/public_agent_templates.mjs`

- [x] Add three templates: `document-pdf-intake-ledger`, `crm-follow-up-pipeline-assistant`, and `proposal-sow-builder`.
- [x] Ensure every template has `buyer`, `promise`, `firstProof`, `setupInputs`, `sampleSources`, `firstRunWorkflow`, `outputs`, and `pricingLabel`.
- [x] Extend starter kit output with privacy-safe `adaptation_signals` and `approval_required_before`.

### Task 2: Render Sellable Shelf

**Files:**
- Modify: `tools/create_public_vercel_output.mjs`

- [x] Replace the three-card agent sprint section with a generated General AI Worker Toolkit shelf from the template catalog.
- [x] Add copy that explains first-party behavior monitoring and adaptation without promising autonomous writes.
- [x] Keep contact/setup links carrying the chosen template.
- [x] Add `/api/behavior-events` and `/api/behavior-events/status` routes to the Vercel config.
- [x] Copy `api/behavior-events.js` into Vercel output with `writeNodeFunction`.

### Task 3: Add Behavior Endpoint

**Files:**
- Create: `api/behavior-events.js`
- Create: `docs/supabase/supermega_behavior_events.sql`

- [x] Accept `GET` for endpoint status.
- [x] Accept `POST` with coarse event data: `event_type`, `page_path`, `template_id`, `requested_package`, `utm_*`, and referrer.
- [x] Reject oversized, invalid, disallowed-origin, and rate-limited requests.
- [x] Write to Vercel Postgres/Neon table `supermega_behavior_events` when configured, fall back to Supabase REST when available, otherwise return a degraded ledger status.
- [x] Add an authenticated `?summary=1` behavior summary with template-level event counts and an adaptation queue behind `SUPERMEGA_OPS_KEY`.

### Task 3B: Surface Behavior Signals In Operator Console

**Files:**
- Modify: `tools/create_public_vercel_output.mjs`
- Modify: `tools/audit_public_usability.mjs`

- [x] Add a private Behavior summary board to `/operator/`.
- [x] Render events in 24h/7d, top templates, event mix, recent signals, and adaptation queue.
- [x] Keep all behavior-summary reads behind the existing ops key.
- [x] Add browser usability coverage for the sample behavior/adaptation board on desktop and mobile.

### Task 4: Add Client Event Hooks

**Files:**
- Modify: `tools/create_public_vercel_output.mjs`

- [x] Add a shared inline script that sends `page_viewed`, `cta_clicked`, `template_clicked`, `setup_started`, and `lead_form_submitted`.
- [x] Do not send text input values, uploaded file data, or private source content.
- [x] Keep failures silent so analytics never blocks the site.

### Task 5: Guard With Verifiers

**Files:**
- Modify: `tools/verify_public_vercel_output.mjs`
- Create: `tools/audit_behavior_events.mjs`
- Modify: `tools/run_public_go_live_check.ps1`

- [x] Require all nine worker templates in products, contact router, JSON, Markdown, detail pages, and setup pages.
- [x] Require the General AI Worker Toolkit copy and behavior monitoring copy on `/ai-agents/`.
- [x] Require `api/behavior-events.js` in Vercel output and status route in `config.json`.
- [x] Add a no-write behavior-events audit that verifies local API/schema contract, live status route, unauthenticated summary privacy, and the Postgres table when DB env is available.
- [x] Run the behavior-events audit inside the public go-live gate.

### Task 6: Regenerate, Verify, Deploy

**Commands:**
- `node tools/create_public_vercel_output.mjs`
- `node tools/verify_public_vercel_output.mjs`
- `node tools/audit_behavior_events.mjs`
- `powershell -ExecutionPolicy Bypass -File tools\run_public_go_live_check.ps1 -SkipLeadPost -HttpOnlyAliases`
- `powershell -ExecutionPolicy Bypass -File tools\deploy_public_supermega.ps1 -SkipBuild`
- `powershell -ExecutionPolicy Bypass -File tools\check_public_aliases.ps1 -HttpOnly`

Expected result: generator and verifier exit `0`, deployment returns a production URL, and both `supermega.dev` aliases return HTTP 200.

### Task 7: Add Buyer-Adaptive Matcher

**Files:**
- Modify: `tools/create_public_vercel_output.mjs`
- Modify: `tools/verify_public_vercel_output.mjs`
- Modify: `tools/audit_public_usability.mjs`

- [x] Add an `/ai-agents/` Adaptive Worker Matcher that recommends one worker from the nine-template catalog using no free-text business data.
- [x] Keep matcher state browser-local, highlight the matched worker, and carry the selected template into setup/contact links.
- [x] Scope the matcher runtime to `/ai-agents/` so `/offers/` keeps the retired pricing/tier wording guard clean.
- [x] Add static verifier tokens and desktop/mobile browser interaction coverage for the matcher.
- [x] Deploy to `supermega-public` and verify both aliases plus behavior monitoring in the go-live gate.

Live result: `supermega.dev` and `www.supermega.dev` point to deployment `dpl_HbaKyVudEhpgVembR2a7hAKmCWrh`, and the go-live gate passed with behavior DB `recent_7d_count: 54`.

### Task 8: Add Public User Guide

**Files:**
- Modify: `tools/create_public_vercel_output.mjs`
- Modify: `tools/verify_public_vercel_output.mjs`
- Modify: `tools/audit_public_usability.mjs`

- [x] Add `/ai-agents/guide/` as a generated AI Worker User Guide for starting, using, approving, and improving workers.
- [x] Cover desktop, tablet, and mobile use, connector setup rules, approval gates, behavior adaptation, and computer-use/mobile workcell limits.
- [x] Generate guide cards from all nine worker templates so source packs, first proofs, and setup links stay current.
- [x] Link the guide from `/ai-agents/`, `/agent-templates/`, template pages, and setup pages.
- [x] Add static verifier coverage, sitemap coverage, and desktop/mobile browser usability coverage for the guide.
- [x] Deploy to `supermega-public` and verify aliases, contact API, lead ledger, behavior monitoring, and browser usability.

Live result: `supermega.dev` and `www.supermega.dev` point to deployment `dpl_DAUAZWKeXYnsod3wcwGaZRvB8mVE`, and the go-live gate passed with behavior DB `recent_7d_count: 378`.

### Task 9: Add Browser-Local Worker Continuation

**Files:**
- Modify: `tools/create_public_vercel_output.mjs`
- Modify: `tools/verify_public_vercel_output.mjs`
- Modify: `tools/audit_public_usability.mjs`

- [x] Add a returning-user continuation panel that can resume the selected AI worker from any public page.
- [x] Store only browser-local template ID, last step, page path, click count, and timestamps.
- [x] Do not store source files, typed business text, credentials, payment data, or connector secrets.
- [x] Generate the continuation catalog from all nine worker templates without shipping retired product wording into guarded pricing pages.
- [x] Add clear, setup, contact, and user guide actions for the remembered worker.
- [x] Add static verifier coverage and desktop/mobile browser audit coverage for the continuation panel.
- [x] Deploy to `supermega-public` and verify aliases, contact API, lead ledger, behavior monitoring, and browser usability.

Live result: `supermega.dev` and `www.supermega.dev` point to deployment `dpl_2D86PN5wUAwDemD7Pyf7onFC19Kh`, and the go-live gate passed with behavior DB `recent_7d_count: 506`.

### Task 10: Add Role-Aware Worker Onboarding

**Files:**
- Modify: `tools/public_agent_templates.mjs`
- Modify: `tools/create_public_vercel_output.mjs`
- Modify: `tools/verify_public_vercel_output.mjs`
- Modify: `tools/audit_public_usability.mjs`

- [x] Add `role_playbook` to every worker starter kit for owner, operator, and technical admin users.
- [x] Render role playbooks on setup kit pages and setup request pages.
- [x] Add a browser-local role mode panel for `/ai-agents/`, `/agent-templates/`, and `/contact/`.
- [x] Store only the selected role mode in the browser, not source text, private workflow content, credentials, or payment data.
- [x] Pass the selected role into setup/contact forms as `user_role_mode` and `user_role_label` routing hints.
- [x] Add verifier coverage for starter-kit role data, static guide copy, setup hidden fields, and guarded `/offers/` wording.
- [x] Add desktop/mobile browser coverage for selecting technical admin mode and carrying it into a setup form.
- [x] Deploy to `supermega-public` and verify aliases, contact API, lead ledger, behavior monitoring, and browser usability.

Live result: `supermega.dev` and `www.supermega.dev` point to deployment `dpl_B1i8t99yXwWpH8qbJR5eMbaRhCNa`, and the go-live gate passed with behavior DB `recent_7d_count: 584`.

### Task 11: Add Device-Aware Worker Onboarding

**Files:**
- Modify: `tools/create_public_vercel_output.mjs`
- Modify: `tools/verify_public_vercel_output.mjs`
- Modify: `tools/audit_public_usability.mjs`
- Modify: `tools/public_deployment_lock.json`

- [x] Add browser-local device mode detection for phone, tablet, and desktop onboarding.
- [x] Store only the current device mode ID in this browser, not source text, private workflow content, credentials, or payment data.
- [x] Pass the selected device mode into setup/contact forms as `user_device_mode` and `user_device_label` routing hints.
- [x] Add device-aware copy to the AI Worker User Guide so users know what to do on phone, tablet, and desktop.
- [x] Add static verifier coverage for the public shell, guide, and setup hidden fields.
- [x] Add browser audit coverage for desktop, tablet, and mobile device modes, including setup hidden-field propagation.
- [x] Deploy to `supermega-public` and verify aliases, contact API, lead ledger, behavior monitoring, and browser usability.

Live result: `supermega.dev` and `www.supermega.dev` point to deployment `dpl_88pWKTaMpxhbQpkNeDzhoNMhtYJd`, and the go-live gate passed with behavior DB `recent_7d_count: 705`.

### Task 12: Add Adaptive Setup Plan

**Files:**
- Modify: `tools/create_public_vercel_output.mjs`
- Modify: `tools/verify_public_vercel_output.mjs`
- Modify: `tools/audit_public_usability.mjs`
- Modify: `tools/public_deployment_lock.json`

- [x] Add a browser-local Adaptive Setup Plan that combines selected worker, role mode, and device mode into the next first-proof step.
- [x] Store only coarse routing data: worker ID, role mode, device mode, next step, page path, and generated time.
- [x] Pass the plan into setup/contact forms as `adaptive_worker_id`, `adaptive_plan_summary`, `adaptive_next_step`, and `adaptive_user_path`.
- [x] Add AI Worker User Guide copy explaining how the plan adapts without private source text.
- [x] Add static verifier coverage for the public shell, guide, and setup hidden fields.
- [x] Add browser audit coverage for desktop, tablet, and mobile plan rendering plus setup hidden-field propagation.
- [x] Deploy to `supermega-public` and verify aliases, contact API, lead ledger, behavior monitoring, and browser usability.

Live result: `supermega.dev` and `www.supermega.dev` point to deployment `dpl_AcTfWp2b1GfhBZPvbJ4wFXSHVGdi`, and the go-live gate passed with behavior DB `recent_7d_count: 880`.
