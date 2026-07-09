# SuperMega — the real unique value prop (technical POV)

*A shared reference for all lanes (Creative / Technical / CEO). Grounded in what's actually built,
not aspiration. Source of truth for the "why we win" story on the site, in sales, and in the code.*

---

## The one-liner
**Most "AI for business" is a wrapper over one API. SuperMega is a *kernel* — a shared data spine, an
action bus, and 65 pre-wired connectors — with the local rails a Myanmar business actually runs on.
The apps (Retail OS, Factory OS) are thin views over that kernel. The kernel is the moat.**

---

## The five defensible differentiators

### 1. The kernel is the product; the apps are views over it
`kernel/connectors/` = 65 connectors on one registry, one contract, one action bus. Retail OS and
Factory OS are **the same kernel with a different lens** — build once, reuse everywhere. Every new app
inherits all 65 connectors and the accumulated data for free. Competitors ship features; we ship a
substrate that makes the next feature cheap.

### 2. The Myanmar-native rails are a structural moat, not a checkbox
The registry carries the rails **no global platform has**: KBZPay, WavePay, AYA Pay, CB Pay, OnePay,
MMQR, Dinger (payments), the live CBM exchange rate, Viber (where Myanmar retail actually sells), and
J&T / NinjaVan (last-mile logistics). One pipeline can **read a Viber order → total it in MMK at
today's CBM rate → take a KBZPay payment → book a J&T pickup**. Stripe-plus-Shopify cannot do that in
Myanmar. This isn't localization polish — it's a category no incumbent can enter without our rails.

### 3. An architecture that scales by *addition*, not rewrite ("infinitely scaling", concretely)
Every connector is a ~single small adapter file with a strict, boring, identical contract:
- **Zero external dependencies** — native `fetch` only (no supply-chain surface, no version drift).
- **Fixed, SSRF-safe host** — no user value ever selects the host.
- **Never throws** — capabilities return `{ok, reason}`; `health()` returns `{ok, detail}`; a bad
  adapter degrades to `{ok:false}` instead of taking down the kernel.
- **Auto-registered on load**, 8s timeout, contract-verified by direct import.
The registry loads all **65 with 0 registration errors**. Adding the 66th is an afternoon and one
import line — not an architecture change. Surface area grows **linearly in tiny isolated units**; the
core never has to be re-architected. That is what "infinitely scaling" means in engineering reality.

### 4. You own it — data *and* software (the compounding moat)
Not rented SaaS, no per-seat fees that punish hiring, no vendor kill-switch. The client owns the
software and their data. And because the contextual intelligence (what sells when, reorder timing,
which machine fails, who pays late) accumulates in *their* system, the product gets smarter with use
and switching cost grows every day. The moat compounds: **more usage → smarter product → stickier**.

### 5. AI-native, human-approved, fully traceable
Agents draft the work — reconcile the day, summarize the floor, chase an invoice, reply to a customer —
but **nothing acts without the owner's sign-off**, and **every extracted number links back to its
source** (the Viber message, the Excel cell, the KBZPay receipt). That's the trust story *and* the
legal bright line: own-account/own-business data only; insight sold back to the owner, never a data
brokerage (Myanmar ETL 2021 §27).

---

## Built for the real conditions
MMK-first, Burmese-capable, offline-tolerant, runs on the mid-range Android the owner already has —
because the buyer is a Yangon shop or factory owner, not a VC-backed startup on fibre.

## How to use this
- **CEO / sales:** lead with #2 (the rails no one else has) and #4 (you own it) — that's what a buyer
  feels. #1 and #3 are why the price and the roadmap are credible.
- **Creative / site:** the homepage "works with the tools you already use" strip + the live app hero
  *show* #2 and #5; this doc is the copy source behind them.
- **Technical:** #3 is the contract — every new connector matches `kernel/connectors/data-mailchimp.mjs`
  exactly, or it doesn't ship.

*Connector count as of this writing: **65**, 0 registration errors. Verify: `node -e "import('./kernel/connectors/index.mjs').then(m=>console.log(m.list().length))"`.*
