# Yangon Tyre Operating System Plan

Last reviewed: 2026-07-21

Scope: `ytf.supermega.dev` and the YTF tenant paths on `app.supermega.dev`. This is a Yangon Tyre operating system built from the current Drive/source behavior, not a generic ERP demo.

## Business Context

Company names to support:

- Htoo Maw
- Aung Htet Myet
- Yangon Tyre

Primary executive context:

- Dr. Htin Kyaw Oo, CEO
- CEO-facing data must use the highest trust layer available and label every metric as current, verified, mapped, or historical reference.

The app should work around the reality of 4-5 Yangon Tyre Google Drive owner/source accounts, mixed folder ownership, shortcut-heavy folder structure, older PC exports, email-sourced finance/procurement, and future Viber/whiteboard inputs.

## Verified Live State

As of this review:

- `ytf.supermega.dev/api/health` is live and reports the feed as current.
- `ytf.supermega.dev/api/feed` exposes production, sales/current, stock/material, finance, quality, captures, manager signals, and plant split fields.
- `app.supermega.dev/app/plant-manager?tenant=ytf&plant=plant-a&from=ytf&screen=plant` loads with Yangon Tyre branding and no browser errors after the app-shell cleanup.
- `app.supermega.dev/app/live-data?tenant=ytf&plant=plant-a&from=ytf` loads with Yangon Tyre branding and no browser errors after the app-shell cleanup.
- `app.supermega.dev/login?next=%2Fapp%2Fportal` is cleaner and no longer shows temporary credential clutter.

## Source Map

Read-only Drive discovery from the shared YTF folder shows these current source lanes:

- Root YTF source folder: CEO data, Plant A, Plant B, Tyre Sales & Inventory, Showroom PC, archived data, misc, data sources, retailer database, catalog, old costing.
- CEO data: shortcut-based yearly/export folders including 2025 YTF, 2026 YTF, EXPORT, and BILIN 23-2026.
- Plant A: direct Admin, Planning, and QC folders.
- Plant B: shortcut-heavy structure including 2025, 2026, drive-letter style locations, KZL memory stick, office desktop, interviews, and planning.
- Tyre Sales & Inventory: shortcut-heavy structure including ViberDownloads, Downloads, Documents, and Desktop.
- Showroom PC: shortcuts including YMH, Documents, SQL2016Data, and Downloads.
- Data sources document lists Dad's PC, Plant B KZL stick, Plant B office desktop, Plant A production office data, old/showroom data, Swan's YTF data folder, Tyre Analysis workbook, YTF Op Guide, thida.mwa finance sheets, Dr. Htin Kyaw Oo / `htinkyawoo@yangontyre.com` NR purchase orders, NR export planning, and YT competitive strategy docs.

## Data Trust Contract

No screen should show fake certainty. Every business metric needs a status:

- Confirmed current: direct current-period source parsed successfully and matches expected owner/source lane.
- Mapped current: current-period source parsed, but owner/plant/company mapping still needs review.
- Needs update: source exists but no current-period record was found.
- Needs verification: value was extracted from irregular text/image/shortcut/email behavior and needs admin confirmation.
- Historical reference: useful context only, never shown as current operating status.

CEO dashboards should only promote confirmed current and mapped current metrics. Historical finance, old stock, old production, or unresolved shortcut extracts must sit in a separate review section.

## Product Model

Use open access for viewing and lightweight capture, but protect sensitive operations:

- Open read views: Today, Plant, Entry, ERP, Data.
- Staff capture: minimal forms for daily summary, board photo, stock count, and abnormality 5W1H.
- Protected admin actions: source mapping, data correction, writeback, exports, identity settings, finance confirmation, source-owner registry, and pipeline controls.
- Security model: public feed is sanitized; writes require action tokens, rate limits, audit records, and review queues; raw file IDs, parser status, Drive internals, AI agent internals, and source owner emails stay off staff screens.

## Role Design

Staff:

- See today's shift context and 1-2 required actions.
- Enter daily summary, board photo, stock count, or 5W1H abnormality.
- Do not see internal data health, file counts, raw source names, parser text, or backend status.

Plant Manager A and Plant Manager B:

- Separate Plant A and Plant B workspaces.
- Show production by tyre size, shift, line, good quantity, rejects, delay, machine issue, and open abnormality.
- Show raw material / finished goods status only if current or explicitly marked as needs stock count.
- Daily close is the main workflow: confirm output, material issue, stock count, issues, and next-shift note.

Senior Admin:

- See company and plant drilldowns.
- Review source readiness, unresolved mappings, duplicate records, stale metrics, and manager submissions.
- Correct mappings and approve current metrics before they become CEO-facing.

CEO:

- See only trusted operating information: production, sales dispatch, inventory/material risk, quality issues, cash/receivable status, plant comparison, and decisions needed.
- No raw Drive details, no pipeline wording, no fake zeroes, no stale numbers presented as current.

## ERP Module Coverage

Enterprise ERP benchmark modules to cover for Yangon Tyre:

- Finance and controlling: current P&L, cash, receivables, payables, collections, cost variance.
- Sales and distribution: dispatch, dealer/customer, product/size mix, receivables, delivery status.
- Materials and inventory: raw materials, chemicals, rubber, finished goods, stock movements, valuation.
- Production planning and manufacturing: plan vs actual, size/line/shift output, machine utilization, downtime.
- Quality management: QC claims, defect codes, abnormality 5W1H, CAPA, supplier quality.
- Plant maintenance: machine issue log, downtime, maintenance work, spares.
- Procurement: purchase orders, supplier, delivery, price, material receipt.
- Documents and approvals: daily reports, board photos, approvals, audit trail.

WCM, ISO, and DQMS should be custom modules after the core operating data is trustworthy. They should not add visible fluff; they should add standard work, audit evidence, CAPA, training/signoff, and continuous improvement records.

## Data Pipeline Plan

Phase 1: Source Registry

- Resolve shortcuts and maintain a source-owner registry for all 4-5 Google owner/source accounts.
- Tag every source as company, plant, department, year/month, source type, and trust tier.
- Add Htoo Maw, Aung Htet Myet, and Yangon Tyre as first-class company entities.

Phase 2: Current Operating Marts

- Build normalized tables for production, sales dispatch, inventory balance, material movements, quality claims, procurement, finance, daily summaries, board OCR, and 5W1H abnormalities.
- Never aggregate unknown plant/company rows into confirmed totals.
- Surface missing data as "needs update" or "needs verification", not zero.

Phase 3: Capture And Writeback

- Manager entries write into a controlled app ledger and mirrored Sheet/Drive folder.
- Board photos run OCR, create reviewable extracted rows, and only promote after manager/admin confirmation.
- 5W1H abnormality is the abnormality log format.
- Daily summary is the normal shift close format.

Phase 4: Automation

- Cloud refresh every 6 hours for Drive/source changes.
- Hourly lightweight checks for manager entries, board photos, Viber folder drops, and important email-derived files.
- Daily CEO verified snapshot after source freshness and confidence checks.

Phase 5: Viber And Email

- Treat ViberDownloads as a first-class source lane for sales, dispatch, stock, and shopfloor images.
- Treat thida.mwa finance sheets and `htinkyawoo@yangontyre.com` NR purchase orders as finance/procurement lanes.
- Do not expose email account names to users; only show confirmed business records.

## Immediate Build Priorities

1. Entity registry: Htoo Maw, Aung Htet Myet, Yangon Tyre, plants, departments, and source-owner accounts.
2. Shortcut resolver: CEO data, Plant B, Tyre Sales & Inventory, Showroom PC.
3. CEO trust layer: confirmed current vs mapped current vs historical reference.
4. Plant A/B separation: no combined plant metric unless both plants are mapped.
5. Staff minimal entry: daily summary, board photo, stock count, 5W1H abnormality.
6. Admin data workbench: mapping review, stale source review, promoted metric review, writeback status.
7. Viber intake lane: monitor ViberDownloads and classify messages/images into sales, stock, quality, or manager log.
8. Finance readiness: current P&L/cash/payables only after current source mapping is confirmed.

## Design Philosophy

- One screen per job.
- Show operational facts, not internal system counters.
- Use role modes, not login walls, for low-risk viewing.
- Make capture faster than sending a chat message.
- Put uncertainty in admin review, not in staff dashboards.
- CEO sees decisions and verified context; managers see today's work; staff see the next input only.
