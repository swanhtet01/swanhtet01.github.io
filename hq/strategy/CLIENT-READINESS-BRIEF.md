# Client readiness brief — what stands between today's product and a paying client

Date: 2026-08-20
Status: synthesis (no deploy, production write, founder-gated action, or gate
change is authorized by this document).
Question answered, in the founder's framing: *what stands between today's
product and a paying client, in order, with what each step costs.*
Rule inherited from `PRODUCT-SUPREMACY-ROADMAP.md`: every claim cites a repo
file or names the gap outright. Where two current sources disagree, both are
cited and the disagreement is stated rather than smoothed.

Sources read for this brief: `hq/readiness/managed-pilot-readiness.json` and
its generator `kernel/managed-pilot-readiness.mjs`, `hq/portfolio.json`,
`hq/strategy/PRODUCT-SUPREMACY-ROADMAP.md`,
`hq/strategy/PRODUCT-CATALOG-AND-PRICING.md`,
`hq/strategy/PRODUCTION-ACTIVATION-RUNBOOK.md`,
`hq/strategy/BILLING-RAIL-DESIGN.md`, `hq/strategy/GTM-AI-OPERATIONS.md`,
`hq/strategy/ENTERPRISE-READINESS-SCORECARD.md`,
`hq/strategy/ANDROID-PERFORMANCE-BASELINE.md`, `docs/pilot-kit/` (all four
documents), `docs/demo-playbooks/shop.md`, and the product source files cited
in section 3.

---

## 1. Where we actually are

**Zero managed tenants, zero revenue, and no lead list committed to this
repo.** This is verified against the ledger, not inherited: the 2026-08-19
readiness ledger (`hq/readiness/managed-pilot-readiness.json`) records
`productionWritesEnabled: false`, `databaseWrites: 0`, `storageBucketCount: 0`,
`externalWritesPerformed: false`, and the `production_activation` gate as
`blocked` with the evidence line "The production Supabase target remains
protected-unapproved." No customer tenant can exist, because the two env flags
that would allow one (`SUPERMEGA_SELF_SERVE_ACTIVATION_WINDOW`,
`SUPERMEGA_TRIAL_WRITES_ENABLED`) are founder-only steps C and D of
`PRODUCTION-ACTIVATION-RUNBOOK.md` and have not been run. All four products
sit at `status: "release-candidate-local"` in `hq/portfolio.json`. Three of the
four `nextGate`s name an isolated hosted tenant nobody has provisioned;
**Website's does not** — it asks for "one named-business brief through accepted
responsive preview and retained managed artifact", and its `blockingReason` is
"Needs named business brief and accepted owner review; sample cannot close the
gate", which is a customer input rather than infrastructure (the "managed
artifact" clause still ties its final retention to the managed side, so it is
the cheapest gate to *advance*, not a gate that closes locally). Revenue is
structurally zero: `PRODUCT-CATALOG-AND-PRICING.md` §4 states "no price has
ever been founder-approved, and no prices exist anywhere in the code by
guard-enforced decision," and the six founder asks D1–D6
(`BILLING-RAIL-DESIGN.md` lines 49–54) are all still open. What *is* real and
live today is the free tier — the whole single-device business, enforced by the
`FREE_FOREVER` CI invariant in `showroom/src/core/capability-tiers.ts` — plus
a materially better phone product than existed 48 hours ago (section 3).

### Contradictions found while checking that paragraph — do not smooth these

1. **"First lead batch produced" has no artifact.**
   `PRODUCT-SUPREMACY-ROADMAP.md` §2 item 6 says the GTM lattice is "Already
   specced; first lead batch produced 2026-08-19."
   `GTM-AI-OPERATIONS.md` (same date) opens with "**Nothing in this document
   has been sent, posted, or contacted**", states in (b) that no real CRM or
   lead database exists and a lead list would be "a plain file … for the
   founder to review", and leaves all six founder checkboxes in (f) unticked.
   A repo-wide search finds no lead-list file. The only committed 2026-08-19
   GTM output is three trade-specific email variants added beside the
   pre-existing generic draft in (c) — (c).1 is labelled "original draft,
   unchanged" — plus the three trade-specific post drafts in (e).
   **Treat "zero real leads" as the true
   state** and the roadmap line as either shorthand for "the draft sets landed"
   or an uncommitted artifact. Either way, no business has been contacted.

2. **The runbook and the pricing doc disagree on whether activation's last
   precondition is satisfied.** `PRODUCTION-ACTIVATION-RUNBOOK.md` §0 (updated
   2026-08-19) says the remediation branch must be "merged to trunk **and
   released** (paired release, live verified)" and calls this "**the one
   precondition still open — do not run steps B-D until that release is
   live**." `PRODUCT-CATALOG-AND-PRICING.md` §7 (2026-08-17) says #419 and
   #420 "are both merged to `main` as of 2026-08-17 — this precondition is
   satisfied." Merged-to-main and released-as-a-paired-live-deploy are
   different events, and the release dispatch is founder-only and typed-phrase
   gated (`CLAUDE.md` hard limits). **This must be resolved by looking at the
   release workflow's run history before step B is run** — it is a
   two-minute check that currently blocks the entire hosted path.

3. **The ledger's headline next action is stale against its own body.**
   `overall.nextAction` asks for the `bounded-managed-pilot-rehearsal`
   decision, whose `proposedActions` include
   `run_hosted_isolation_storage_recovery_proof`. But the same file already
   records `storagePrivacy.proofComplete: true`,
   `managedPersistence.proofComplete: true`, and
   `selfServePilot.proofComplete: true`. Reading
   `kernel/managed-pilot-readiness.mjs` explains why: `overall.nextAction` is
   built from module constants (`NEXT_ACTION_DECISION_ID`,
   `NEXT_ACTION_REQUIREMENTS`, lines 326–333) and is never recomputed from
   gate state. The *gate-level* next action is the current one: the
   `self_serve_pilot` gate says "Run
   hq/strategy/PRODUCTION-ACTIVATION-RUNBOOK.md as the founder
   production_activation decision."

4. **The ledger structurally cannot report success.** In
   `kernel/managed-pilot-readiness.mjs`, `overall.status` is the literal
   `'blocked'` and `hostedActivationReady` the literal `false` (lines 322–324),
   and `validateManagedPilotReadiness` (line 407) *fails* any value where
   `status !== 'blocked'`, `hostedActivationReady !== false`, or
   `blockingGateCount < 1`. This is the anti-overclaim design working as
   intended, but the consequence matters for planning: **after the founder
   activates, there is no machine-readable place to record it.** Recording
   activation needs a v5 contract, and `kernel/managed-pilot-readiness.mjs` is
   one of the ledger's own `sourceReceipts`, so changing it requires the
   `database:postgres17:record` → `readiness:managed:write` cascade that
   `CLAUDE.md` records as currently blocked on PG17 access.

5. **Two stale gap claims in `PRODUCT-CATALOG-AND-PRICING.md`** (2026-08-17,
   overtaken 2026-08-19). §2.1 "Top 3 honest gaps" item 2 says "no barcode
   scanning" — shipped as `showroom/src/core/BarcodeScanButton.tsx` (roadmap
   S1, #459). §2.4 item 2 says "no product images" — shipped as
   `showroom/src/core/product-image-store.ts` (roadmap E1, #459). The
   receipt-printer/cash-drawer half of the §2.1 claim is still true (roadmap
   S4 is founder-gated on hardware). Sales copy lifted from that document
   today would understate the product.

---

## 2. The critical path to a first paying client

Two tracks are routinely conflated in the existing docs and must be kept
apart. **Track A** is a named design partner running the product for real —
free, local, no hosted anything, and the thing the pilot kit is built for.
**Track B** is a managed tenant on hosted infrastructure, which is what the
portfolio gates, the billing rail, and every premium/enterprise capability
actually require. A first *paying* client needs Track B for the money and
Track A for the trust; the ordering below reflects that.

Legend: **[founder-only]** = `CLAUDE.md` hard limit or an explicit founder
decision in a cited contract · **[buildable-now]** = an agent can complete it
against current tooling · **[blocked-by X]** = ready except for X.

| # | Step | Tag | Cost / what it actually takes |
|---|---|---|---|
| 1 | **Decide what is being sold, and for what.** D1 pricing shape and amounts, D2 payment channels, D3 currency posture, D4 tax posture, D5 entitlement-lapse policy (`BILLING-RAIL-DESIGN.md` 49–53; the table's sixth ask, D6, is the v13 apply and appears here as step 7). | [founder-only] — `CLAUDE.md`: "Billing/entitlement transitions are founder actions via the billing CLI; never automate them." | One founder sitting. D3, D4, D5 already carry written recommendations in that table; only D1 (shape **and** amounts) and D2 (channels) have no default. Nothing downstream can charge until D1 exists. |
| 2 | **Approve who gets contacted and what is sent.** The six unticked boxes in `GTM-AI-OPERATIONS.md` (f): approve the lead list, approve the copy, connect and consent to a sending identity, connect a social account, set cadence/volume, decide who answers replies. | [founder-only] — (f) calls itself "a hard gate, the same way `production_activation` is a hard gate" | Founder review time. The lead-research and drafting agents can run first at zero external effect (they sit in the same class as the ledger's `safeAutomatedActions`). |
| 3 | **Produce the lead list and personalize the four drafts.** | [buildable-now] | Agent work. Blocker to note: the drafts require a trade-specific setup link built by `shopBusinessTemplateSetupPath` (`showroom/src/products/shop/business-templates.ts:559-561`), never the bare `/shop/` route — see the doc-truth item in section 5. |
| 4 | **Recruit one named design partner and run the pilot kit.** Baseline form, agreement outline, four start gates, five-day rehearsal (`docs/pilot-kit/`). | [founder-only] to run (on-site, with the owner); the kit itself is already written | Five founder days on the partner's floor plus a pre-day-1 baseline session. **What the kit prepares:** a named business, a named operator, a measured baseline, a signed-off agreement, and a proven process. **What it explicitly does not do:** its own README and the acceptance checklist's mapping table both mark the Shop gate's "on isolated hosted tenant" clause "**NOT satisfied by this kit**". |
| 5 | **Resolve the runbook §0 open precondition** (contradiction 2 above): confirm the paired release carrying the seven self-serve fixes is live, or dispatch it. | [founder-only] — release dispatch is typed-phrase founder-only | Minutes to check the workflow run history; a release dispatch if it has not shipped. This currently gates everything below it. |
| 6 | **Run production activation, steps A→D** (`PRODUCTION-ACTIVATION-RUNBOOK.md` §2): apply v11 to production, set `SUPERMEGA_TRIAL_SCHEMA_VERSION=11`, open the activation window, enable writes. | [founder-only]; steps B–D are [blocked-by step 5] | A–B are safe prep and reversible; C is the customer-facing switch; D is the runbook's own "one genuinely consequential, hardest-to-reverse step". Closes the `self_serve_pilot` gate's stated next action. |
| 7 | **Apply migrations v12 and v13 to production — in step 6's own migration window, not after it.** v12 is the billing data model; v13 is the narrow entitlement-read grant (decision D6), hosted-proven on a disposable branch (`hq/readiness/billing-entitlement-read-proof.json`) and still unapplied. | [founder-only] — production migrations reach prod only via the founder-run runbook | Numbered after step 6 only because it depends on it; run it **alongside step 6's step A**. `BILLING-RAIL-DESIGN.md` D6 says exactly this: "that is the founder's own `PRODUCTION-ACTIVATION-RUNBOOK.md` action, alongside v12." |
| 8 | **Run the hosted acceptance evidence run** — one authenticated order-to-close plus return exception on the isolated hosted tenant, with the operator and baseline from step 4 (`hq/portfolio.json` shop `nextGate`; runbook §5 sequences it exactly here). | [blocked-by step 6] | Five days, but they are the *same* five days as step 4 re-run against the real tenant — which is precisely why running step 4 first is worth it. |
| 9 | **Issue the first invoice and grant the first entitlement** via `python -m supermega_runtime.billing_rail`, whose every mutation is gated by a typed confirmation phrase. | [founder-only]; [blocked-by steps 1, 6 **and** 7] | The CLI is built and tested (`PRODUCT-CATALOG-AND-PRICING.md` §4). This is the step where "paying client" becomes true. |

**Where billing sits, stated plainly:** steps 1, 7 and 9 are all founder
actions, and no agent may perform or automate any of them. The engineering for
them is done; what is missing is a decision (D1) and two production applies.

**Why step 9 cannot be pulled forward — checked in the code, not assumed.**
`supermega_runtime/billing_rail.py` sets `BILLING_SCHEMA_VERSION` from
`_env_schema_version()` (default `12`), and every mutating ledger method runs
`_assert_schema`, which reads the live `schema_version` and raises unless the
database is PostgreSQL 17 **at exactly that version** (line ~543). Production
is at v10 (`securityAudit.liveSchemaVersion` in the ledger). Every method is
also workspace-scoped (`_workspace_id`, `where workspace_id = %s`), and no
workspace row exists until activation steps C and D create one. So an
`issue-invoice` run against production today fail-closes twice over. **Steps 6
and 7 are prerequisites for step 9, not parallel tracks.**

**The honest shortest path, with its cost named.** If the goal is the *first
kyat* rather than the first managed tenant, the pilot-fee and design-partner
shapes in `BILLING-RAIL-DESIGN.md` §7 charge for the founder's five days of
setup and attention (step 4) rather than for a hosted capability, so they need
only decision D1 — but they can only be **collected outside the product**, by
bank transfer or wallet, because the billing rail cannot record an invoice
until steps 6 and 7 are done. That is a real and legitimate shortcut, and its
real cost should be stated rather than hidden: the first commercial
transaction would then have no accountable record inside a system whose entire
differentiator is that every transaction has one. Take it deliberately if at
all, and reconcile it into the ledger after activation.

---

## 3. What is genuinely ready to demo TODAY

Everything below runs on a shop owner's own device, from
`https://app.supermega.dev/settings/?product=shop`, with no account, no
network, and no server. `docs/demo-playbooks/shop.md` §2 is still the correct
setup path, **but its §3 script is pre-#459 and demos roughly three of the nine
rows below**: it has no camera-scan, payment-QR, product-photo, loyalty, or
bottom-nav step, and its step 6 still walks the pre-#436
`Reconcile payment` → `Complete` path that row 1 supersedes. Extending it is
item A6 of the two-week plan. Two rows (Plant job board, Ecommerce storefront
cards) are not Shop phone surfaces at all and have their own playbooks. The
limits column is not hedging; it is what must be said out loud so a demo does
not become an overclaim.

| Surface | Where it lives | Honest limit to say out loud |
|---|---|---|
| One-tap cash sale — the counter's `Paid & handed over` primary | `CoreApp.tsx:6955` renders the button, `:3990` queues the `order_settle` action (design phase 2 item 1, PR #436; `DESIGN-PROGRAM.md` lines 67 and 159 — its cited line numbers have since drifted, the strings above are current) | Records a sale; captures no money. Payment state changes only through the owner-confirmed reconciliation action, and the counter gate says so on screen. |
| Phone bottom-nav work modes — Today / Sell / Orders / Stock | `showroom/src/core/commerce-tabs.ts`, rendered by `CoreShell.tsx` `.mobile-nav` (roadmap F1, #459; keyboard batch 1 #486) | Roadmap F1 still lists "Open: on-device keyboard/touch pass". Only batch 1 of the keyboard regression has run. No real phone has been through it. |
| Camera barcode scan at the counter and both catalog SKU fields | `showroom/src/core/BarcodeScanButton.tsx` (roadmap S1, #459) | Built on the platform `BarcodeDetector` API alone — the component **renders nothing at all** on Firefox and desktop Safari, by design. Roadmap S1's open item is an "on-device camera smoke test (founder, any Android phone)": **this has never run on real hardware.** |
| Product photos on inventory rows, counter tiles, and storefront preview | `showroom/src/core/product-image-store.ts`, `use-product-image.ts` (roadmap E1, #459) | IndexedDB, device-local, downscaled on ingest. Deliberately **no `imageId` on the workspace record** (the deployed backend enforces exact-field item contracts), so photos do not sync and do not travel with a managed workspace. |
| Photo-first storefront preview cards | `showroom/src/products/ecommerce/ecommerce-product.css:1964` (`:has()` selector; roadmap E1 follow-through, #483) | Falls back to the byte-identical artwork card in any browser without `:has()`. Photos are **not** in the exported/published site — `website-export.ts` is untouched and contains no image handling (roadmap §3 item 3 lists this as a separate, undecided slice). |
| Merchant payment QR at checkout and on the amount-due receipt dialog | `showroom/src/core/payment-qr-store.ts`, `PaymentQr.tsx`, `use-payment-qr-image.ts` (roadmap S2, #465) | **Display-only, and this must be said.** The store's own header: "THIS IS NOT A PAYMENT CAPABILITY … No network call of any kind happens here." It shows the owner's own provider-issued static QR; money moves inside the customer's banking app, invisible to this system. |
| Loyalty points — balance chip at the counter, redemption, receipt line | `showroom/src/core/shop-loyalty.ts` (roadmap S3 PR1+PR2, #469/#472/#482) | Settings are device-local; the accrual is a pure projection, so refunds reverse structurally. Redemption rides the existing credit-correction mechanism (so it *does* sync in managed mode). Promoting loyalty into `CommerceState` proper is PR3 — founder-gated and deferred. `ACT-DEMO-`-prefixed sample orders accrue nothing. |
| Plant visual job board with due-date lanes | roadmap P1, #484 | **Display-only** — no drag-and-drop rescheduling, because rescheduling is a domain write and a separate slice. |
| Guided samples in every product | `actionId` prefix `ACT-DEMO-` (`commerce-workspace.ts` ~2184) | A guided sample never earns a proof counter: an Ecommerce request stops at `pending_shop_review`, a guided Plant shift releases no batch, a guided Website sample publishes nothing (`CLAUDE.md`). Say "sample", never "customer". |

**Two limits that apply to the whole demo, on every surface above:**

- **Device-local, no hosted sync, no account.** Nothing above touches a server.
  That is the pitch (`Stays on this device. Nothing is sent or published.`),
  and it is also the ceiling: there is no multi-device, no staff sign-in, no
  cloud backup, and no managed workspace to show, because none exists
  (section 1).
- **~3.9–4.2 s to first paint on the target device class.**
  `ANDROID-PERFORMANCE-BASELINE.md` measured median FCP of 3,940 ms (`/`),
  4,088 ms (`/shop/?tab=counter`) and 4,100 ms (`/shop/?tab=orders`) under ×6
  CPU throttling and a 400 ms-RTT / 400 kbit/s link on a Galaxy A13 profile —
  and FCP lands *after* the load event on all seven measured routes, so the
  owner watches a blank screen for four seconds. The counter and orders tabs
  also carry the worst main-thread boot (1,767 ms and 2,031 ms of long tasks;
  longest single task 745–758 ms, during which a tap does nothing). Quote the
  document's own limitation when using these numbers: a throttled sandbox x86
  core is not a Galaxy A13's core, so **the relative ranking is the reliable
  signal, not the absolute milliseconds** — and a real Myanmar mobile link will
  be worse and more variable than the jitter-free emulation.

---

## 4. The three biggest risks to a first client engagement

### Risk 1 — There is nothing to charge for yet that is also built

**Evidence.** Every capability above the free tier is dark.
`PRODUCT-CATALOG-AND-PRICING.md` §4: `ai-order-intake` "runs against the
managed-tenant endpoint; model calls currently fail closed pending activation
and the pre-registered evaluation (no live eval run yet)"; `ai-demand-advice`
is "**Tier declaration + locked-notice UI only; no backing implementation
exists in the repo.** Do not list it as a feature"; `cloud-backup` is
"Declared; no hosted implementation yet". The enterprise three
(`shared-workspace`, `staff-roles`, `verified-statements`) are behind the
sequenced `enterprise-capabilities` researchGate in `hq/portfolio.json`, which
requires each tier "proven in production before the next" — and production has
zero tenants. Meanwhile the free tier is the entire working business by
CI-enforced invariant, so there is no in-product pressure to pay at all.

**Cheapest mitigation.** Sell a shape that needs no unbuilt capability: the
pilot-fee or design-partner shapes in `BILLING-RAIL-DESIGN.md` §7, where what
is paid for is the founder's five days of setup, training, and attention —
all of which section 3 can back today. Cost: decision D1, plus the honest
trade-off named under the critical path (money collected before steps 6–7
cannot be recorded by the billing rail and must be reconciled into it later).
No engineering either way. The alternative — waiting until a premium
capability is live — means waiting on the order-intake evaluation gate *and*
production activation *and* an AI budget hosted-activation proof, in series.

### Risk 2 — The best new surfaces have never run on the hardware they were built for

**Evidence.** Roadmap S1's status column carries an explicit open item —
"on-device camera smoke test (founder, any Android phone)" — and F1's is "Open:
on-device keyboard/touch pass". `ANDROID-PERFORMANCE-BASELINE.md`'s own
Limitations section states the measurement was headless Chromium with "no
touch input, no scroll/interaction measurement — this profiles cold navigation
only, not tap latency inside the app". `ENTERPRISE-READINESS-SCORECARD.md` §5
coverage gap 2 records that `CoreApp.tsx` has "zero component tests … no
automated browser E2E exists in any workflow", verified by manual 390 px
journeys. So the barcode scanner, the phone bottom bar, and the QR dialog —
the three things most likely to be demoed first on a phone — are proven by
build gates and desktop emulation only. A camera permission prompt behaving
unexpectedly in front of a shop owner is a first-meeting-ending failure.

**Cheapest mitigation, in order of cost:** (a) the founder walks one Android
phone through the nine rows of section 3 for an afternoon — **not** through
`docs/demo-playbooks/shop.md` §3 as it stands, which scripts none of the
camera, QR, photo, loyalty, or bottom-nav surfaces (see the §3 preamble); the
plan's item A6 extends the playbook to cover them, and doing that first turns
the smoke test into a repeatable script instead of a one-off. Zero build cost,
zero gate spend, and it closes S1's and F1's open roadmap items.
(b) ship the app-shell skeleton that `ANDROID-PERFORMANCE-BASELINE.md`'s "What
to optimize first" item 3 describes — a static skeleton inside the 4 KB
`index.html`, which "moves first visual feedback to well under 1 s on this
profile **with no JS changes**". That is the cheapest measurable win in the
whole performance queue.

### Risk 3 — Running the pilot kit and calling it "the pilot" would overclaim the Shop gate

**Evidence.** `hq/portfolio.json`'s `shop-managed-order-close-pilot` requires
"One authenticated order-to-close and return-exception pilot **on isolated
hosted tenant**; named operator, baseline, and five-day evidence plan."
`docs/pilot-kit/README.md` states the kit "produces everything EXCEPT that
clause", and `docs/pilot-kit/acceptance-checklist.md`'s mapping table marks the
hosted-tenant row "**NOT satisfied by this kit.** Founder-only" and warns "Do
not present a completed local rehearsal as if it were that hosted evidence
run." The failure mode is not technical: it is that after five genuinely good
days with a real shop, the natural thing to say is "the Shop pilot is done" —
and the gate is still open, so any downstream claim, invoice justification, or
enterprise-ladder step built on it is an overclaim in a repo whose entire
differentiator is that it does not overclaim.

**Cheapest mitigation.** Zero build cost: schedule step 4 and step 6 of the
critical path in the same fortnight, exactly as `PRODUCTION-ACTIVATION-RUNBOOK.md`
§5 already sequences them ("Once the window is open and one real tenant exists,
run the five-day order-to-close + return-exception evidence plan"). Run the
local five days as recruitment and operator training; run them again on the
real tenant as evidence. And write "rehearsal" on the local artifacts, in those
words, the day they are produced.

---

## 5. The two-week plan

Nothing here is authorized by this document; the founder column is what only
the founder can do, per the cited contract in each row.

### Agent-autonomous, [buildable-now]

| Item | Cites | Note |
|---|---|---|
| **A1 — F2 batch 1: first-paint fix.** Static app-shell skeleton in `showroom/index.html` plus `<link rel="modulepreload">` for the route's known chunk chain. | `ANDROID-PERFORMANCE-BASELINE.md` "What to optimize first" #3; roadmap §3 item 1 | The single cheapest measured win (Risk 2b). Roadmap §3.1 requires its own planning pass first. |
| **A2 — F2 batch 2: cut the eager-model edge.** Make `workspace-runtime.ts`'s static `commerce-workspace` / `production-workspace` imports lazy or per-product. | Baseline "What to optimize first" #1 (110.4 KB gz off every surface, ≤22 % of it executed) | Roadmap §3.1 warns "those imports are load-bearing for every product surface" — planning pass before code. |
| **A3 — P2: Plant shop-floor scanning.** Reuse `BarcodeScanButton.tsx` for material issue and job dispatch. | Roadmap §1 P2 ("NOW after S1 ships"), §3 item 2 | Small-medium; no new dependency, no gate spend. |
| **A4 — Doc-truth fix in the Shop demo playbook.** `docs/demo-playbooks/shop.md` §2's parallel-lane note says a `?template=` deep link "is not in the app at this commit — do not add a template parameter to app URLs in a live demo". It **is** in the app: `ProductOnboardingPage.tsx:105` reads `?template=` and `business-templates.ts:559-561` builds the path. | The two source lines above; `GTM-AI-OPERATIONS.md` (c) mechanism note | Directly unblocks step 3 of the critical path — the outreach drafts promise a trade-specific sample and the playbook currently forbids the link that delivers it. `docs/` is drift-guarded, so `node tools/test_demo_playbooks.mjs` must stay green. |
| **A5 — Reconcile the two stale gap claims** in `PRODUCT-CATALOG-AND-PRICING.md` §2.1 and §2.4 (contradiction 5, section 1). | Roadmap S1/E1 SHIPPED rows | Doc-only. That document is the one sales copy is lifted from. |
| **A6 — Extend `docs/demo-playbooks/shop.md` §3 to the surfaces that shipped 2026-08-19.** Its script predates #436/#459/#465/#469 and covers roughly three of section 3's nine rows: no camera scan, no payment QR, no product photo, no loyalty balance, no bottom-nav step, and a step 6 that still walks the superseded `Reconcile payment` → `Complete` path. | Section 3 of this brief; roadmap S1/S2/S3/E1/F1 SHIPPED rows | Prerequisite for founder item F1 — the on-device smoke test needs a script that exercises what is being smoke-tested. Same drift guard as A4: `node tools/test_demo_playbooks.mjs` must stay green. |

### Founder-only

| Item | Cites | Why only the founder |
|---|---|---|
| **F1 — One Android phone smoke test** over section 3's nine rows: camera scan, bottom nav, QR dialog, one-tap sale, product photo, loyalty chip. Best run after A6 so it follows a script. | Roadmap S1 and F1 open items | Needs real hardware. Closes two open roadmap items for the cost of an afternoon and retires most of Risk 2. |
| **F2 — Make D1–D6.** | `BILLING-RAIL-DESIGN.md` 49–54 | `CLAUDE.md` hard limit. D3/D4/D5 carry written recommendations and D6 is really a scheduling call (apply v13 alongside v12 in the activation window), so realistically this is two open decisions — D1 and D2 — not six. |
| **F3 — Resolve the runbook §0 precondition** (contradiction 2): check whether the paired release carrying the self-serve fixes is live. | `PRODUCTION-ACTIVATION-RUNBOOK.md` §0; `PRODUCT-CATALOG-AND-PRICING.md` §7 | Release history is founder-visible; the dispatch itself is founder-only. Everything hosted is behind this. |
| **F4 — Tick or explicitly defer the six GTM boxes.** | `GTM-AI-OPERATIONS.md` (f) | Named there as a hard gate. Deferring is a legitimate answer; leaving them ambiguous is what stalls Track A. |

## The six-week plan

### Founder-only, in order

1. **Production activation A→D** (`PRODUCTION-ACTIVATION-RUNBOOK.md` §2), after
   F3 clears. Apply v12 and v13 in the same window (critical-path step 7).
2. **The hosted acceptance run** for `shop-managed-order-close-pilot` on the
   tenant that activation creates, using the operator and baseline produced by
   `docs/pilot-kit/` — runbook §5, and the only thing that closes the Shop
   `nextGate` in `hq/portfolio.json`.
3. **First invoice and entitlement grant** via
   `python -m supermega_runtime.billing_rail`, once D1 and D2 exist.
4. **The scorer-tolerance decision** on quote-literal wording variance that
   `PRODUCT-CATALOG-AND-PRICING.md` §7 names as the last product judgement
   blocking the order-intake evaluation gate.

### Agent-autonomous or clearly blocked

| Item | Tag | Cites |
|---|---|---|
| **Order-intake golden-set evaluation** — a fresh full 20-fixture live run once the scorer-tolerance decision lands. | [blocked-by the scorer-tolerance decision], then [buildable-now] | Roadmap §3 item 4: "server-only and spends no hosted gate" — it can run in parallel with everything else. Gate text: `hq/portfolio.json` `ai-assistance` `nextGate`. |
| **Observability floor — OpenTelemetry local phase.** | [buildable-now] | `ENTERPRISE-READINESS-SCORECARD.md` §8 rec 1 and its own summary: "the decision is already made, the redaction rules are already written, and it requires no founder gate until managed mode". Enters through the existing `opentelemetry` researchGate. |
| **F2 remaining items** — split `core-app-*.js` (100 KB gz, 9 % executed on the counter), then break up the Shop boot long tasks. | [buildable-now], sequenced after A1/A2 | Baseline "What to optimize first" #2 and #4; the document itself says #4 is "worth doing after 1–2, since smaller chunks shrink these tasks for free first". |
| **First automated 390 px browser journey in CI.** | [buildable-now] | Scorecard §5 highest-leverage item: "it protects the largest untested surface (`CoreApp.tsx`)". Directly reduces Risk 2 for every future demo. |
| **Enterprise ladder step 1 — `verified-statements` on the managed tenant.** | [blocked-by production activation] | `hq/portfolio.json` `enterprise-capabilities` gate sequence; `enterprise-staff-roles.ts` header states its own prerequisite. `staff-roles` cannot precede it. |
| **Readiness ledger v5 so activation is recordable** (contradiction 4). | [blocked-by the PG17 rehearsal cascade] | `kernel/managed-pilot-readiness.mjs` is one of the ledger's `sourceReceipts`; editing it needs `database:postgres17:record` → `readiness:managed:write`, which `CLAUDE.md` records as currently impossible. Do not attempt it as a side effect of other work. |

---

## What this brief does not do

It authorizes no deploy, no production write, no migration, no release
dispatch, no billing or entitlement transition, no customer contact, and no
gate change. It quotes no price, because none is approved. It records no
improvement claim, no customer, and no revenue, because none exists. Where the
sources disagree it says so rather than choosing; resolving contradictions 2
and 3 in section 1 is founder work, and doing so is the cheapest thing on this
whole page.
