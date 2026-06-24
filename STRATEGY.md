# SUPERMEGA.dev — Integrations Roadmap + supermega.creative Strategy

A single, no-hype plan for a small Myanmar studio. Part 1 is what to wire up and in what order. Part 2 is how to stand up the design-and-ship arm. The connecting logic: every integration is built once behind a clean interface and reused across DeskPOS, Payslip Maker, the YTF platform, and the agent suite — and supermega.creative is the demand-discovery front end that turns one-off client work into the next product.

---

## Part 1 — Integrations roadmap

### Two governing principles
1. **Wrap everything behind your own interface.** A `Payments` interface (create-intent → QR → webhook → reconcile), a `notify(customer, template, channel)` comms abstraction, an AI gateway in front of every model call. Swap the vendor underneath and no client notices.
2. **A connector is only worth building if** (a) there's a real API/stable protocol, and (b) it removes manual work a Myanmar SMB does today. Where neither holds (most local wallets, all marketplaces), SuperMega's value is *absorbing the onboarding pain* so the owner just sees "it works."

### Build sequence (the actual order)
1. **AI gateway** — OpenRouter now → self-hosted LiteLLM/Portkey later. Claude primary; cheap model for bulk classification. Leverage across every product (fallback, caching, per-client cost caps).
2. **Google Workspace** (Sheets/Drive/Gmail) — per-user OAuth by default (domain-wide delegation is dead on personal Gmail + for service accounts post-Apr-2025; use Shared Drives for Workspace clients). The client's real "database."
3. **ESC/POS printing + scanners** — driverless from the browser via WebUSB/Web Serial/WebHID. Chromium-only → iPad fallback. Cheap, visible DeskPOS win.
4. **Self-hosted n8n** — universal glue, $0/execution, HTTP node = generic-connector escape hatch.
5. **MMQR + wallets via ONE aggregator** — **Dinger** (widest: KBZPay/WavePay/AYA/CB/OnePay/MPU/cards) or **MyanMyanPay** (lighter/cheaper). Expose MMQR dynamic QR + bank-slip-upload fallback. Idempotent webhooks + manual-reconcile screen. Bottleneck is account approval — start it now.
6. **Comms layer** behind `notify()` — Telegram (free, lead with it) + SMS via SMSPoh + Messenger + Email. **Viber = paid add-on (~€100/mo), not bundled** (commercial-only since 2024).
7. **Standard packs** (HACCP → ISO 9001 → GMP) — no APIs, so the integration *is* the content + workflow you own (SOPs, audit checklists, CAPA, auto-reports). Software-only moat; sticky; where IoT cold-chain + standards combine.
8. **QBO/Xero + IoT cold-chain** — only when a client pays. Default everyone else to Sheets-as-ledger.

### Explicitly skip
- **Marketplace connectors** (Shop.com.mm/Shopee/Daraz) — no usable seller API; commerce is conversational → put energy into **apps-bridge** (Viber/LINE/Messenger → ledgers) instead.
- **WhatsApp Business API** — heavy verification, low MM adoption vs Viber/Messenger.

### The honest line to clients
No Myanmar wallet hands you a clean API; no marketplace gives a usable seller API. SuperMega's value is absorbing that onboarding pain so the owner sees a working thing. That honesty is itself the differentiator.

---

## Part 2 — supermega.creative strategy

### Thesis
**The only Myanmar studio that hands you a brand *and* the working software it lives in.** Agencies stop at a logo + deck + template site. `.creative` is the bridge: bespoke identity/design-system/UI work that **ships into something live**, then feeds reusable parts back into the product line.

### Positioning (two walls not to crash into)
- **vs normal agencies** (Poke/B360/Liquid/Pixellion): they sell campaigns + monthly social retainers + template sites. Wedge: **"we don't hand you files, we hand you a running thing."** Do NOT compete on ad-buying or social calendars — commodity race you lose on headcount.
- **vs SuperMega the product co.**: products are standardized + self-serve; `.creative` is bespoke, senior, project-shaped, higher per-hour. The moat = taste **+ ship it in-house at AI-native speed, under one trusted brand**. No MM studio credibly does both.

### The offer — four packaged services
1. **Brand-in-a-week sprint** — identity + 1-page guide + social kit + 3 templates. Fixed 5 days. ~600k–1.2M MMK.
2. **Design system + landing site** — identity + a live bilingual Vercel site, MMQR-ready. 2–3 wk. ~1.5M–4M.
3. **"Design + ship" sprint (flagship)** — brand/UI **+ a working tool** (DeskPOS storefront, dashboard skin, LMS front, internal tool). 3–6 wk. ~4M–12M+.
4. **Creative care (capped retainer)** — monthly template refresh + seasonal art + small tweaks + 1 "ship" item/qtr. Named plan, fixed scope. ~400k–900k/mo.

### Engagement model (Myanmar-specific)
- Lead with **fixed-scope projects** + explicit revision caps (kills scope creep). Retainers are the prize but sold **after** a project, productized (never "X hours/month").
- **50% deposit up front** (local norm, guards against ghosting). Accept KBZPay/MMQR/cash (eat your own dog food).

### Target clients (narrow first)
1. **Existing SuperMega product clients** who want to look better — zero CAC.
2. **Premium-aspiring SMEs** — specialty cafes, salons/clinics, boutique F&B/retail, new D2C.
3. **Factories/distributors needing internal tools that aren't ugly** — `.creative` design wraps a SuperMega build. Higher ticket, stickier.
- Deprioritize pure ad-management + one-off flyers.

### Brand & voice
Run on the existing **SUPERMEGA system** ([BRAND.md](./BRAND.md) + [DESIGN-MANIFESTO.md](./DESIGN-MANIFESTO.md)) — that manifesto *is* the portfolio proof. Plain, confident, bilingual MY/EN. Studio line: **"Make it beautiful. Then make it run."** Every case study ends in a **live URL**. **Kill/rebuild the off-brand `creative-studio.html`** (purple gradient, fake "1,247 projects" stats) onto the cream/clay system first.

### How it feeds the product co. (the point)
- **Bespoke → reusable.** A custom cafe storefront becomes the next DeskPOS theme; a custom dashboard becomes an Ops Intelligence module.
- **Margin logic:** the agency project pays for the build now; the product version sells N more times at SaaS margin later. The client funds your R&D.
- **The graduation rule (write it down):** *3rd repeat request → it leaves `.creative` and ships as a product.* Prevents the bespoke-rescue trap that kills agencies.
- `.creative` also keeps the products beautiful so SuperMega never looks like generic SaaS.

### 90-day go-to-market
- **Days 1–30:** rebuild `creative-studio.html` → real `supermega.creative` page (cream/clay) with the 4 offers; ship 3 live-URL case studies (the brand system, Payslip Maker, a DeskPOS storefront); stand up **TikTok-first** presence (TikTok ~19.6M > VPN-gated FB ~13.1M); define deposit/contract.
- **Days 31–60:** pitch Brand-in-a-week to the warm base (target 2–3 booked); land **one lighthouse "design + ship"** at a good price; instrument the graduation tracker.
- **Days 61–90:** convert 1 project → retainer; ship the **first graduated product**; publish the lighthouse case study + TikTok clips; ask for referrals (the #1 MM services channel).
- **Bar:** 3–5 paid projects, 1 retainer, 1 product graduated, 3 live-URL case studies. *Not* "build a 40-person agency."

### What NOT to do
- No over-engineered tooling — `.creative` is a services arm; the only automation worth building is the **graduation tracker**. A Sheet + MMQR is enough.
- No ad management / social calendars (margin trap). No unlimited-request subscriptions yet (needs bench depth). Keep the bench small + scope fixed. FB is a credibility surface, not the acquisition engine.
