# SUPERMEGA.dev — The Machine (internal platform architecture)

*The build-system that turns a lead into shipped, running, managed software. This is the internal moat; [MONEY-MACHINE.md](./MONEY-MACHINE.md) is the revenue loop that runs on it, [POSITIONING.md](./POSITIONING.md) is why it wins. Owned by tech+design lead.*

> **The machine is the product.** A custom-build studio scales by how good its machine is, not by headcount. Build the machine by *delivering real clients* — never speculatively.

---

## The three layers

**Front office (demand → deal):** Funnel → Qualify → Proposal → Deposit → Client. *(Funnel is live; Qualify/Proposal exist as the Deal Desk.)*

**The factory (build → run):** Build (AI-assisted, from the client's real data) → Ship (a live URL) → Operate (in-app AI: drafts, owner approves) → Care + expand.

**The spine (everything reuses it):** AI gateway · Clients & Projects data · Auth & isolation · Graduation tracker (bespoke → product).

---

## The honest sequencing (read this before building anything)

We have **0 paying clients.** The failure mode for a studio is building a CRM / onboarding / agent platform for users who don't exist, then running out of runway before the first sale. So:

1. **The real unlock is client #1**, not infrastructure. Every platform decision is a guess until a real client stresses it.
2. **Build the kernel, not the cathedral.** The kernel = the smallest spine that's *useful the day you have one lead* and that *everything else reuses*. The CRM, onboarding, build-tools, and operator grow on top of it, each justified by a real need.
3. **Dogfood.** The build-machine (templates + component library + agent-builders) is built *by building the first 1-3 client projects*, not in the abstract. What repeats becomes a tool; the 3rd repeat becomes a product (the graduation rule).

**Premature right now (do NOT build yet):** a full CRM UI, a client-facing onboarding wizard, a multi-tenant agent platform, billing/subscriptions infra. **Not premature:** the kernel below — because you use it to run lead #1 today.

---

## The kernel (build this first)

### 1. AI gateway — `gateway`
One interface in front of every model call, so swapping vendors or models touches one file.
- `complete({ system, messages, tier, clientId, schema? })` → text or validated structured output.
- **Tiers:** `bulk` (cheap model — Haiku — for classification/extraction), `reason` (Sonnet — scoping, drafting), `deep` (Opus — hard build reasoning). Claude primary.
- **Built in:** retry + fallback, response caching (idempotent prompts), **per-client cost caps** + token logging, prompt-injection frame-stripping on any client-supplied text, forced structured output via tool-use (never JSON-from-text — it broke on Burmese newlines; see the Deal Desk lesson).
- Reuses the existing `ANTHROPIC_API_KEY`. The Deal Desk (`supermega-machine/api/deal.js`) is refactored to call the gateway instead of the SDK directly — proves it on real code.

### 2. Data model — one source of truth
```
Lead        id, source, name, company, contact, package, message, score, status, createdAt
  → Client  id, name, contacts[], channels(KPay/MMQR/Viber), notes
     → Project  id, clientId, offer(tier), scopeSummary, price, deposit{status,method}, status, liveUrl
        → Build       id, projectId, modules[], repoOrUrl, shippedAt
        → OperatorRun id, projectId, ranAt, findings[], approvals[]   (the Operate loop, draft-only)
GraduationTracker  request, count, sourceProjects[]   (3rd repeat → productize)
```
- **Status pipelines:** Lead `new→qualified→scoped→quoted→won→lost`; Project `scoping→deposit→building→live→care`.
- This **is** the CRM — minimal schema, not 40 screens. The UI grows later.

### 3. Internal console — `console`
A login/passcode-gated app (one owner to start; reuse the Deal-Desk ops-key pattern) that:
- Shows leads as they land from the public `/contact/` form (today they only `console.log`/email — wire them into `Lead`).
- Runs a deal (the Deal Desk packet generator, now reading/writing the spine).
- Tracks projects through the pipeline + the deposit/KPay-MMQR step.
- `noindex`, never public.

---

## Tech choices (decided — stop bikeshedding)
- **Runtime:** Vercel functions (already the stack).
- **AI:** Anthropic via the `gateway` module. OpenRouter only if we need non-Claude fallback later.
- **Data:** **Supabase (Postgres)** for the relational spine — free tier, real relations, and `api/contact-submissions.js` is already Supabase-aware. (Vercel Blob is fine for files/artifacts, wrong for relational client data.)
- **Auth:** single-owner passcode for the console now (`SUPERMEGA_OPS_KEY` pattern); per-client auth only when a client logs in.
- **Comms:** behind the existing `notify()` abstraction (Telegram/SMS/Email; Viber paid add-on).
- **Hosting one console app:** new Vercel project `supermega-console` (or fold into `supermega-machine`).

---

## Build order
1. **`gateway` module** + refactor the Deal Desk onto it. *(first brick — reused by everything)*
2. **Supabase schema** for Lead/Client/Project + wire `/contact/` submissions into `Lead`. *(leads stop getting lost)*
3. **Console v0** — leads inbox + run-a-deal + project pipeline. *(you run lead #1 here)*
4. **— land 1-3 real clients here —** then, dogfooded on them:
5. **Factory build-tools** — extract the repeating build steps into templates + a component library.
6. **Operate loop** — the per-client in-app AI operator (draft → approve), the recurring-revenue + differentiation engine.
7. **Graduation tracker** → first productized module.
8. **Outbound engine** (autonomous demand gen) — scale demand once delivery is proven.

## What "done" looks like for the kernel
A lead hits `/contact/`, lands in the console, you generate a deal packet, move it through scoping → deposit → building → live, all on one data spine, with every AI call going through one gateway. That's the smallest real machine — and the floor the rest is built on.

*Nothing here is claimed as built until it is. As of this writing: funnel live; Deal Desk live (passcode); gateway/spine/console = to build.*
