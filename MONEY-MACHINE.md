# SUPERMEGA.dev — The Money Machine

*The revenue engine, end to end. How attention turns into cash, and how cash turns into a compounding catalog. Owned by design/brand lead, built with supermega.dev technical. Pairs with [POSITIONING.md](./POSITIONING.md) and [STRATEGY.md](./STRATEGY.md).*

> The machine is not a feature. It's a **funnel** (capture demand), a **flywheel** (turn each build into a product), and an **outbound engine** (manufacture demand) — all run by AI, so it scales without scaling headcount.

---

## 0. The shape on one screen

```
                         ┌─────────────────────────────────────────┐
   OUTBOUND (AI agent)   │            INBOUND (the site)            │
   find → enrich → score │  supermega.dev → /demo/ → /offers/ →     │
   → draft a pitch  ─────┼─►  /contact/ (book a build, 50% deposit) │
   (human approves send) │                    │                     │
                         └────────────────────┼─────────────────────┘
                                              ▼
                                   BUILD (AI-native, fast)
                                   ship a live URL in days
                                              │
                                              ▼
                              CARE PLAN (recurring revenue)
                                              │
                                              ▼
                    FLYWHEEL ── 3rd repeat request → ships as a PRODUCT
                    (the build becomes a module → resold at SaaS margin)
```

Three sources of money, one operating system:
1. **Projects** — one-time custom builds (the cash that pays for today).
2. **Care plans** — monthly recurring (the cash that compounds).
3. **Products** — graduated builds resold N times at near-zero marginal cost (the cash that scales).

---

## 1. Inbound funnel — capture the demand that's already looking

Every stage exists; this is the order a stranger should flow through it.

| Stage | URL | Job of the page | State |
|---|---|---|---|
| Land | `supermega.dev` | Say what we are in one line; route to proof | live |
| Prove | `/demo/` | "Here's what we've actually built" — try-it-live + guided | live |
| Price | `/offers/` | Turn interest into a chosen package with a real "from" price | **shipped this round** |
| Book | `/contact/?package=…` | Capture the lead + the package + scope notes | live |
| Pay | invoice / `/card/` | 50% deposit to start (local norm, guards ghosting) | semi-manual |

**The fix this round:** the site had **no public pricing** — `/pricing/` bounced straight to `/contact/`. That's a contact-wall: it filters out everyone not already sold. A confident **transparent "from"-anchor** page qualifies harder (price-anchors self-select serious buyers) and is more premium, not less. `/offers/` now carries the five packages with real numbers; `/pricing`, `/plans`, `/packages` alias to it.

### The offers (grounded in real market data — see STRATEGY + research)

USD is the defensible anchor; MMK derived at the **market rate (~4,800/USD)**, which is what SMBs actually transact at — not the official CBM rate.

| Package | From (anchor) | Who it's for |
|---|---|---|
| **Tool in a week** | **$600** · ~3.0M MMK | One sharp tool, fixed scope, live in days. The impulse-buy entry. |
| **Custom dashboard / internal tool** | **$1,500** · ~7.2M MMK | Replace the scattered Excel with one screen that updates itself. |
| **AI agent / automation** | **$2,500** · ~12M MMK | An agent that reads your real inputs and drafts the work — you approve. |
| **Design + ship system** *(flagship)* | **$6,000** · ~29M MMK | Brand + a full working system, live. The "looks premium and runs" build. |
| **Care plan** *(retainer)* | **$300/mo** · ~1.44M MMK | Hosting, changes, and one shipped improvement a quarter. The recurring line. |

Rationale: undercuts the global custom-software floor (Clutch projects routinely $10k–49k) via AI leverage, while staying premium for the local market and **always cheaper than 2–3 years of the SaaS it replaces**.

**Money rule:** lead with fixed-scope projects + explicit revision caps (kills scope creep). 50% deposit up front. Sell the care-plan retainer **after** a project lands, productized — never "X hours/month."

---

## 2. Outbound engine — manufacture demand (the autonomous part)

This is the "AI using AI, scaling, working autonomously" piece. It is a **draft-only** engine by design: it never sends on its own (per our standing rule — sends are human-approved).

```
find  →  enrich  →  score (ICP fit)  →  draft a personalised pitch  →  REVIEW QUEUE  →  human approves → send
```

- **Find** — Myanmar SMBs from sources we already have: the retailer directory (478+ retailers / 13 regions), public business listings, FB/TikTok business pages. No scraping that violates a platform's terms.
- **Enrich** — what do they sell, how big, what's their current tooling pain (still on Excel? no online ordering? manual payroll?).
- **Score** — ICP fit against the offers (a 20-seat factory on log books = high fit for the dashboard/flagship; a one-person stall = low fit).
- **Draft** — for the top-scored leads, the agent drafts a *specific* one-paragraph pitch ("here's the one tool we'd build you first, and roughly what it'd cost") — ideally with a tiny tailored mockup. Cheap model for bulk, Claude for the ones worth a real pitch.
- **Review queue** — every draft lands in a queue. A human reads, edits, approves. **Only approved messages ever send.** Outreach channel = Telegram/Messenger/email per `notify()`; Viber is a paid add-on, not bundled.
- **Track** — a sheet/DB: contacted → replied → demo'd → quoted → deposit → won. This is the funnel's outbound mirror.

**Build status:** designed here; **v0 to scaffold next** = `find → enrich → score → draft → queue` as a runnable pipeline on the AI gateway, outputting a review queue (no auto-send). Needs the founder's data sources + an AI gateway key to run for real. Until then it is **not** claimed as live.

---

## 3. The flywheel — why this compounds instead of treading water

The trap that kills agencies: every project is a fresh bespoke rescue, margin flat forever. We escape it with one written rule:

> **The graduation rule: the 3rd time a client asks for the same thing, it stops being bespoke and ships as a product.**

- **Bespoke → reusable.** A custom cafe storefront becomes the next DeskPOS theme. A custom factory dashboard becomes an Ops Intelligence module.
- **Margin logic.** The project pays for the build *now*; the productized version sells N more times at SaaS margin *later*. **The client funds our R&D.**
- **Compounding speed.** Every graduated module makes the next client faster and cheaper to serve — which lets us drop the "from" price *or* take the margin. Either way the moat widens.

This is the only automation worth over-building: the **graduation tracker** (what's been requested how many times). A sheet is enough to start.

---

## 4. The operating model — AI using AI

The machine runs lean because AI sits at every station, with a human on the approval gate where money or reputation is at stake:

- **Build station** — AI does the typing; senior taste does the thinking. (This is the cost advantage.)
- **Outreach station** — AI drafts; human approves the send. (Volume without spam.)
- **Care station** — the per-client agent reads the client's real data, drafts the daily/weekly findings, holds them for approval. (Recurring value without recurring labour.)
- **Catalog station** — AI watches the graduation tracker and flags "this has been asked 3×, productize it."

Everything routes through one **AI gateway** (OpenRouter now → self-hosted LiteLLM/Portkey later): Claude primary, a cheap model for bulk classification, per-client cost caps, caching, fallback. Build the gateway once; every station reuses it.

---

## 5. 90-day money plan (concrete, not a vision board)

**Days 1–30 — make it possible to pay.**
- ✅ Ship `/offers/` with real prices and a clear book-a-build path. *(done this round)*
- Wire the deposit: a payment link for the two fixed-scope tiers (Stripe for intl / KBZPay-MMQR for local), so "yes" → paid in one step.
- Stand up the AI gateway (offers nothing visible yet, but unblocks the outbound engine + care station).
- Scaffold the outbound v0 (find→score→draft→queue), dry-run on the retailer directory.

**Days 31–60 — fill the top of the funnel.**
- Run outbound: 20–30 *approved* personalised pitches/week to high-fit leads. Target 2–3 booked scoping calls.
- Convert the warm base first (existing product clients = zero CAC) into one flagship "design + ship".
- Publish 3 live-URL case studies (the brand system, Payslip Maker, a DeskPOS storefront). TikTok-first presence (TikTok ~19.6M > VPN-gated FB).

**Days 61–90 — turn cash into compounding.**
- Convert 1 project → care-plan retainer (first recurring line).
- Ship the **first graduated product** off the tracker.
- Instrument the funnel end-to-end so we can see where money leaks.

**The bar (not "build a 40-person agency"):** 3–5 paid projects · 1 care-plan retainer · 1 product graduated · 3 live-URL case studies · the outbound engine drafting daily.

---

## 6. Metrics — the dashboard the machine reports to

- **Top of funnel:** site sessions → `/demo/` → `/offers/` → `/contact/` (conversion at each step).
- **Outbound:** drafted → approved → sent → replied → call (the engine's yield).
- **Money:** deposits collected, projects shipped, care-plan MRR, product-resale revenue.
- **Flywheel:** modules in the library, requests per module (graduation pressure), time-to-ship trend (should fall).
- **Health:** revision-cap breaches (scope creep), deposit-to-ship time, care-plan churn.

---

## 7. What to build next (in order)

1. **Deposit payment link** on the two fixed-scope offers — close the "yes → paid" gap. *(highest leverage; nearest cash)*
2. **AI gateway** — unblocks both the outbound engine and the care station.
3. **Outbound v0** — `find → enrich → score → draft → review queue`, draft-only, dry-run on the directory.
4. **Graduation tracker** — a sheet, then a screen, behind `/machine/` (already an internal page; rebrand it onto cream/clay when it matters).
5. **Funnel analytics** — so every claim in §6 is measured, not guessed.

*Nothing in this doc is claimed as live unless marked done. The outbound engine and payment links are designed, not shipped — that honesty is the standing rule.*
